'use strict';

/**
 * FROZEN (Gupshup migration): This legacy MSG91 campaign runner is retained for
 * rollback only. Do NOT add new functionality here. New/active campaigns run
 * through the Meta/Gupshup campaign runner (`whatsapp-campaign-runner.js`),
 * which routes via the unified `sendWhatsApp()` pipeline. Under
 * `WHATSAPP_PROVIDER=gupshup`, sends dispatched here still funnel through
 * `whatsapp-service.sendTemplateMessage`, which routes to Gupshup. This file is
 * slated for removal after the Gupshup campaign flow is stable in production.
 */

const databaseManager = require('../config/database-manager');
const whatsappService = require('../services/whatsapp-service');
const { getBullConnection } = require('./redis');
const { logger } = require('../utils/logger');

const BATCH_SIZE = parseInt(process.env.LEGACY_CAMPAIGN_BATCH_SIZE, 10) || 10;
const BATCH_DELAY_MS = parseInt(process.env.LEGACY_CAMPAIGN_BATCH_DELAY_MS, 10) || 1000;
const MAX_INPROCESS_RECIPIENTS = parseInt(process.env.LEGACY_CAMPAIGN_INPROCESS_MAX, 10) || 500;

function isQueueEnabled() {
  return Boolean(getBullConnection());
}

function getMaxRecipients() {
  if (isQueueEnabled()) {
    return parseInt(process.env.LEGACY_CAMPAIGN_MAX_RECIPIENTS, 10) || 10000;
  }
  return MAX_INPROCESS_RECIPIENTS;
}

async function getMainModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Campaign: main.model('Campaign', require('../models/Campaign').schema),
    BusinessMarketingTemplate: main.model(
      'BusinessMarketingTemplate',
      require('../models/BusinessMarketingTemplate').schema
    ),
    WhatsAppMessageLog: main.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema),
    Business: main.model('Business', require('../models/Business').schema),
  };
}

/**
 * Resolve MSG91 campaign recipients (legacy Campaign model).
 */
async function getRecipientsForCampaign(campaign, businessId, businessModels) {
  const { Client } = businessModels;
  let recipients = [];
  const phoneQuery = { phone: { $exists: true, $ne: null, $ne: '' } };
  const recipientLimit = getMaxRecipients() + 1;

  if (campaign.recipientType === 'all_clients') {
    const clients = await Client.find({
      branchId: businessId,
      ...phoneQuery,
    })
      .select('name phone email')
      .limit(recipientLimit)
      .lean();

    recipients = clients.map((client) => ({
      phone: client.phone,
      name: client.name || 'Customer',
      email: client.email || null,
    }));
  } else if (campaign.recipientType === 'segment') {
    const filters = campaign.recipientFilters || {};
    const query = { branchId: businessId, phone: { $exists: true, $ne: null, $ne: '' } };

    if (filters.lastVisitDateFrom || filters.lastVisitDateTo) {
      query.lastVisitDate = {};
      if (filters.lastVisitDateFrom) query.lastVisitDate.$gte = new Date(filters.lastVisitDateFrom);
      if (filters.lastVisitDateTo) query.lastVisitDate.$lte = new Date(filters.lastVisitDateTo);
    }
    if (filters.totalSpentMin || filters.totalSpentMax) {
      query.totalSpent = {};
      if (filters.totalSpentMin) query.totalSpent.$gte = parseFloat(filters.totalSpentMin);
      if (filters.totalSpentMax) query.totalSpent.$lte = parseFloat(filters.totalSpentMax);
    }
    if (filters.serviceCategories?.length > 0) {
      query['services.category'] = { $in: filters.serviceCategories };
    }
    if (filters.tags?.length > 0) {
      query.tags = { $in: filters.tags };
    }

    const clients = await Client.find(query).select('name phone email').limit(recipientLimit).lean();
    recipients = clients.map((client) => ({
      phone: client.phone,
      name: client.name || 'Customer',
      email: client.email || null,
    }));
  } else if (campaign.recipientType === 'custom') {
    const customList = (campaign.recipientFilters?.phoneList || []).slice(0, recipientLimit);
    recipients = customList.map((item) => ({
      phone: typeof item === 'string' ? item : item.phone,
      name: typeof item === 'string' ? 'Customer' : item.name || 'Customer',
      email: typeof item === 'object' ? item.email : null,
    }));
  }

  return recipients;
}

async function runLegacyCampaignSend({ campaign, template, recipients, businessId }) {
  const { Campaign, BusinessMarketingTemplate, WhatsAppMessageLog } = await getMainModels();
  const campaignId = campaign._id;
  let sentCount = 0;
  let failedCount = 0;

  try {
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const fresh = await Campaign.findById(campaignId).select('status').lean();
      if (fresh?.status === 'cancelled') {
        logger.info('[legacy-campaign] %s cancelled mid-send', campaignId);
        return;
      }

      const batch = recipients.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (recipient) => {
          try {
            const variables = { ...campaign.templateVariables };
            if (recipient.name) variables.body_1 = recipient.name;

            const result = await whatsappService.sendMessage({
              to: recipient.phone,
              templateId: template.msg91TemplateId || template.templateName,
              variables,
            });

            await WhatsAppMessageLog.create({
              businessId,
              recipientPhone: recipient.phone,
              messageType: 'campaign',
              status: result.success ? 'sent' : 'failed',
              msg91Response: result.data || null,
              relatedEntityId: campaignId,
              relatedEntityType: 'Campaign',
              campaignId,
              error: result.error || null,
              timestamp: new Date(),
            });

            if (result.success) sentCount += 1;
            else failedCount += 1;
          } catch (error) {
            logger.error(`[legacy-campaign] send to ${recipient.phone}: %s`, error.message);
            failedCount += 1;
            await WhatsAppMessageLog.create({
              businessId,
              recipientPhone: recipient.phone,
              messageType: 'campaign',
              status: 'failed',
              relatedEntityId: campaignId,
              relatedEntityType: 'Campaign',
              campaignId,
              error: error.message,
              timestamp: new Date(),
            });
          }
        })
      );

      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    const doc = await Campaign.findById(campaignId);
    if (doc) {
      doc.sentCount = sentCount;
      doc.failedCount = failedCount;
      doc.status = 'completed';
      doc.completedAt = new Date();
      await doc.save();
    }

    const tpl = await BusinessMarketingTemplate.findById(template._id);
    if (tpl) {
      tpl.campaignCount = (tpl.campaignCount || 0) + sentCount;
      tpl.lastUsedAt = new Date();
      await tpl.save();
    }

    logger.info('[legacy-campaign] %s completed: %d sent, %d failed', campaignId, sentCount, failedCount);
  } catch (error) {
    logger.error('[legacy-campaign] %s failed: %s', campaignId, error.message);
    try {
      await Campaign.updateOne({ _id: campaignId }, { $set: { status: 'draft' } });
    } catch (updateError) {
      logger.error('[legacy-campaign] revert status failed: %s', updateError.message);
    }
  }
}

async function executeQueuedLegacyCampaign({ campaignId, businessId }) {
  const { Campaign, BusinessMarketingTemplate } = await getMainModels();
  const campaign = await Campaign.findOne({ _id: campaignId, businessId });
  if (!campaign || campaign.status !== 'sending') return;

  const template = await BusinessMarketingTemplate.findById(campaign.templateId);
  if (!template || template.status !== 'approved') {
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: 'draft' } });
    return;
  }

  const mainConn = await databaseManager.getMainConnection();
  const tenantConn = await databaseManager.getConnection(businessId, mainConn);
  const modelFactory = require('../models/model-factory');
  const businessModels = modelFactory.getCachedBusinessModels(tenantConn);
  const recipients = await getRecipientsForCampaign(campaign, businessId, businessModels);
  const max = getMaxRecipients();
  if (recipients.length === 0 || recipients.length > max) {
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: 'draft' } });
    return;
  }

  await runLegacyCampaignSend({
    campaign,
    template,
    recipients: recipients.slice(0, max),
    businessId,
  });
}

module.exports = {
  isQueueEnabled,
  getMaxRecipients,
  MAX_INPROCESS_RECIPIENTS,
  getRecipientsForCampaign,
  runLegacyCampaignSend,
  executeQueuedLegacyCampaign,
};
