'use strict';

const databaseManager = require('../config/database-manager');
const { sendWhatsApp } = require('./send-whatsapp');
const { INTENTS } = require('./whatsapp-intents');
const { resolveCostPaise, PRICE_LIST_VERSION } = require('../config/whatsapp-pricing');
const { getComplianceState } = require('./whatsapp-compliance');
const { logEvent } = require('./whatsapp-audit');
const { getAddonStatus } = require('./entitlements');
const { logger } = require('../utils/logger');
const { getBullConnection } = require('./redis');

function isQueueEnabled() {
  return Boolean(getBullConnection());
}

const BATCH_SIZE = parseInt(process.env.WHATSAPP_CAMPAIGN_BATCH_SIZE, 10) || 50;
const BATCH_DELAY_MS = parseInt(process.env.WHATSAPP_CAMPAIGN_BATCH_DELAY_MS, 10) || 1200;
const MAX_INPROCESS_RECIPIENTS = 500;

function getMaxRecipients() {
  if (isQueueEnabled()) {
    return parseInt(process.env.WHATSAPP_CAMPAIGN_MAX_RECIPIENTS, 10) || 10000;
  }
  return MAX_INPROCESS_RECIPIENTS;
}

async function getMainModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Campaign: main.model('WhatsAppCampaign', require('../models/WhatsAppCampaign').schema),
    Template: main.model('WhatsAppTemplate', require('../models/WhatsAppTemplate').schema),
    Account: main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema),
    Business: main.model('Business', require('../models/Business').schema),
    Message: main.model('WhatsAppMessage', require('../models/WhatsAppMessage').schema),
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveAudience({ campaign, businessModels }) {
  const { Client } = businessModels;
  const filter = {
    promotionalWhatsappEnabled: { $ne: false },
    'whatsappConsent.waMarketingOptOut': { $ne: true },
    phone: { $exists: true, $nin: [null, ''] },
  };
  const af = campaign.audienceFilters || {};
  if (af.totalSpentMin) filter.totalSpent = { ...(filter.totalSpent || {}), $gte: Number(af.totalSpentMin) };
  if (af.totalSpentMax) filter.totalSpent = { ...(filter.totalSpent || {}), $lte: Number(af.totalSpentMax) };
  if (af.lastVisitFrom || af.lastVisitTo) {
    filter.lastVisit = {};
    if (af.lastVisitFrom) filter.lastVisit.$gte = new Date(af.lastVisitFrom);
    if (af.lastVisitTo) filter.lastVisit.$lte = new Date(af.lastVisitTo);
  }
  if (af.gender) filter.gender = af.gender;
  if (campaign.audienceType === 'custom' && Array.isArray(af.phoneList) && af.phoneList.length > 0) {
    const variants = new Set();
    for (const raw of af.phoneList) {
      const digits = String(raw || '').replace(/\D/g, '');
      if (!digits) continue;
      variants.add(digits);
      if (digits.length === 12 && digits.startsWith('91')) variants.add(digits.slice(2));
      if (digits.length === 11 && digits.startsWith('0')) {
        variants.add(digits.slice(1));
        variants.add('91' + digits.slice(1));
      }
      if (digits.length === 10) variants.add('91' + digits);
    }
    filter.phone = { $in: Array.from(variants) };
  }
  const clients = await Client.find(filter).select('_id name phone email gender').lean();
  return clients.map((c) => ({
    clientId: c._id,
    phone: String(c.phone || '').replace(/\D/g, ''),
    name: c.name,
  }));
}

async function countMetaOptedOut({ campaign, businessModels }) {
  const { Client } = businessModels;
  const filter = {
    'whatsappConsent.optedIn': true,
    'whatsappConsent.waMarketingOptOut': true,
    phone: { $exists: true, $nin: [null, ''] },
  };
  const af = campaign.audienceFilters || {};
  if (af.gender) filter.gender = af.gender;
  return Client.countDocuments(filter);
}

function resolveVariableValue(map, recipient) {
  if (!map) return recipient.name || '';
  switch (map.source) {
    case 'literal':
      return String(map.value || '');
    case 'client_name':
      return recipient.name || '';
    case 'client_phone':
      return recipient.phone || '';
    default:
      return recipient.name || '';
  }
}

function buildComponentsFromTemplate({ template, recipient, variableMapping }) {
  const components = [];
  const body = template.components?.body;
  const header = template.components?.header;

  if (header && header.format === 'TEXT' && header.text) {
    const headerPlaceholders = header.text.match(/\{\{(\d+)\}\}/g) || [];
    if (headerPlaceholders.length > 0) {
      const params = headerPlaceholders.map((_, idx) => {
        const key = `h${idx + 1}`;
        const map = variableMapping?.[key];
        return { type: 'text', text: resolveVariableValue(map, recipient) };
      });
      components.push({ type: 'header', parameters: params });
    }
  }

  if (body && body.text) {
    const placeholderMatches = body.text.match(/\{\{(\d+)\}\}/g) || [];
    if (placeholderMatches.length > 0) {
      const params = placeholderMatches.map((_, idx) => {
        const key = String(idx + 1);
        const map = variableMapping?.[key];
        return { type: 'text', text: resolveVariableValue(map, recipient) };
      });
      components.push({ type: 'body', parameters: params });
    }
  }
  return components;
}

async function runCampaign({ campaign, template, recipients, actorId }) {
  const { Campaign } = await getMainModels();
  const variableMapping = campaign.variableMapping || {};
  let queued = 0;
  let sent = 0;
  let failed = 0;
  let cancelled = false;
  let lastFailureReason = null;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const fresh = await Campaign.findById(campaign._id).select('status').lean();
    if (fresh?.status === 'cancelled') {
      cancelled = true;
      break;
    }

    const batch = recipients.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (recipient) => {
        const components = buildComponentsFromTemplate({ template, recipient, variableMapping });
        const result = await sendWhatsApp({
          businessId: campaign.businessId,
          clientId: recipient.clientId,
          intent: INTENTS.MARKETING_CAMPAIGN,
          recipientPhone: recipient.phone,
          templateName: template.name,
          language: template.language,
          components,
          templateId: template._id,
          campaignId: campaign._id,
          actorId,
          actorType: 'user',
          bucketSeconds: 5,
        });
        if (!result.success) {
          const errMsg =
            result.error?.error?.message ||
            (typeof result.error === 'string' ? result.error : null) ||
            'send failed';
          throw new Error(errMsg, { cause: result.error });
        }
        return result;
      })
    );

    for (const s of settled) {
      queued += 1;
      if (s.status === 'fulfilled') {
        sent += 1;
      } else {
        failed += 1;
        const rejection = s.reason;
        let raw = '';
        const cause = rejection?.cause || rejection;
        if (cause && typeof cause === 'object' && cause.error?.message) {
          raw = String(cause.error.message);
        } else if (cause && typeof cause === 'object' && cause.message && cause.message !== '[object Object]') {
          raw = String(cause.message);
        } else if (cause && typeof cause === 'object') {
          try {
            raw = JSON.stringify(cause);
          } catch {
            raw = String(cause);
          }
        } else {
          raw = String(rejection || 'send failed');
        }
        lastFailureReason = raw.slice(0, 240);
      }
    }

    await Campaign.updateOne(
      { _id: campaign._id },
      { $set: { 'counts.queued': queued, 'counts.sent': sent, 'counts.failed': failed } }
    );
    if (i + BATCH_SIZE < recipients.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  if (cancelled) {
    await Campaign.updateOne({ _id: campaign._id }, { $set: { completedAt: new Date() } });
    return;
  }

  const finalStatus = sent === 0 ? 'failed' : 'sent';
  let friendlyFailure = null;
  if (finalStatus === 'failed' && lastFailureReason) {
    if (/\b190\b|Session has expired/i.test(lastFailureReason)) {
      friendlyFailure =
        'Access token expired or invalid. Reconnect WhatsApp via Settings → WhatsApp Integration.';
    } else if (/\b131030\b|not in allowed list/i.test(lastFailureReason)) {
      friendlyFailure =
        "Sandbox restriction: recipients are not in the Meta test number's allowed list. Add them in Meta Dashboard → WhatsApp → API Setup → Recipient phone numbers, or switch to a production-verified number.";
    } else if (/\b131026\b|not a WhatsApp user/i.test(lastFailureReason)) {
      friendlyFailure = 'One or more recipient numbers are not on WhatsApp. Verify the phone numbers and try again.';
    } else if (/\b131047\b|24[\s-]?hour/i.test(lastFailureReason)) {
      friendlyFailure = 'Customer service window expired (>24h since last inbound message). Use an approved template.';
    } else if (/\b131051\b|Unsupported message type/i.test(lastFailureReason)) {
      friendlyFailure = 'Unsupported message type for this recipient. Check the template content.';
    } else {
      friendlyFailure = lastFailureReason;
    }
  }

  await Campaign.updateOne(
    { _id: campaign._id },
    {
      $set: {
        status: finalStatus,
        completedAt: new Date(),
        failureReason: friendlyFailure,
      },
    }
  );

  await logEvent({
    businessId: campaign.businessId,
    actorType: 'system',
    actorId: actorId || null,
    event: finalStatus === 'failed' ? 'campaign_failed' : 'campaign_complete',
    summary:
      finalStatus === 'failed'
        ? `Campaign ${campaign.name} failed (0/${recipients.length} sent)`
        : `Campaign ${campaign.name} completed (${sent}/${recipients.length} sent, ${failed} failed)`,
    metadata: {
      campaignId: String(campaign._id),
      sent,
      failed,
      total: recipients.length,
    },
  });
}

async function executeQueuedCampaign({ campaignId, actorId }) {
  const { Campaign, Template } = await getMainModels();
  const campaign = await Campaign.findById(campaignId);
  if (!campaign || campaign.status === 'cancelled') return;
  if (campaign.status !== 'sending') return;

  const template = await Template.findOne({ _id: campaign.templateId, businessId: campaign.businessId }).lean();
  if (!template) {
    await Campaign.updateOne(
      { _id: campaign._id },
      { $set: { status: 'failed', completedAt: new Date(), failureReason: 'Template not found' } }
    );
    return;
  }

  const mainConn = await databaseManager.getMainConnection();
  const tenantConn = await databaseManager.getConnection(campaign.businessId, mainConn);
  const modelFactory = require('../models/model-factory');
  const businessModels = modelFactory.getCachedBusinessModels(tenantConn);
  const recipients = await resolveAudience({ campaign, businessModels });
  await runCampaign({ campaign, template, recipients, actorId: actorId || campaign.createdBy || null });
}

async function runCampaignFromScheduler({ campaignId }) {
  const { Campaign, Template, Account, Business } = await getMainModels();
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return;
  if (campaign.status !== 'queued') return;

  const businessId = campaign.businessId;
  const account = await Account.findOne({ businessId }).lean();
  const template = await Template.findOne({ _id: campaign.templateId, businessId }).lean();
  const business = await Business.findById(businessId)
    .select('plan.addons wallet.balancePaise dbName databaseName')
    .lean();

  const fail = async (reason) => {
    await Campaign.updateOne(
      { _id: campaign._id },
      { $set: { status: 'failed', completedAt: new Date(), failureReason: reason } }
    );
    await logEvent({
      businessId,
      actorType: 'system',
      event: 'campaign_failed',
      summary: `Scheduled campaign ${campaign.name} aborted: ${reason}`,
      metadata: { campaignId: String(campaign._id) },
    }).catch(() => {});
  };

  if (!account || account.status !== 'connected') return fail('WABA not connected');
  if (!template || template.status !== 'approved') return fail('Template not approved');
  if (!getAddonStatus(business, 'waba').enabled) return fail('WABA Integration add-on disabled');

  const mainConn = await databaseManager.getMainConnection();
  const tenantConn = await databaseManager.getConnection(businessId, mainConn);
  const modelFactory = require('../models/model-factory');
  const businessModels = modelFactory.getCachedBusinessModels(tenantConn);
  const recipients = await resolveAudience({ campaign, businessModels });
  if (recipients.length === 0) return fail('No opted-in recipients');

  const maxRecipients = getMaxRecipients();
  if (recipients.length > maxRecipients) {
    return fail(`Audience exceeds limit (${maxRecipients})`);
  }

  const ratePerRecipientPaise = resolveCostPaise({
    category: 'marketing',
    countryCode: 'IN',
    freeWindow: false,
  });
  const expectedSpend = ratePerRecipientPaise * recipients.length;
  const balance = Number(business?.wallet?.balancePaise || 0);
  if (account.mode === 'live' && balance < expectedSpend) {
    return fail(
      `Insufficient wallet balance (need ₹${(expectedSpend / 100).toFixed(2)}, have ₹${(balance / 100).toFixed(2)})`
    );
  }

  campaign.recipientCount = recipients.length;
  campaign.status = 'sending';
  campaign.startedAt = new Date();
  campaign.complianceSnapshot = await getComplianceState(businessId);
  await campaign.save();

  await logEvent({
    businessId,
    actorType: 'system',
    event: 'campaign_send',
    summary: `Scheduled campaign ${campaign.name} firing to ${recipients.length} recipients`,
    metadata: {
      campaignId: String(campaign._id),
      templateId: String(template._id),
      recipientCount: recipients.length,
      priceListVersion: PRICE_LIST_VERSION,
    },
  });

  const { enqueueCampaignRun } = require('./whatsapp-campaign-queue');
  const queued = await enqueueCampaignRun({
    campaignId: campaign._id,
    actorId: campaign.createdBy || null,
  });
  if (!queued) {
    await runCampaign({ campaign, template, recipients, actorId: campaign.createdBy || null });
  }
}

module.exports = {
  getMainModels,
  resolveAudience,
  countMetaOptedOut,
  runCampaign,
  executeQueuedCampaign,
  runCampaignFromScheduler,
  getMaxRecipients,
  MAX_INPROCESS_RECIPIENTS,
};
