'use strict';

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const { sendPlatformTemplateMessage } = require('./platform-whatsapp-send');
const {
  resolvePlatformLeadAudience,
} = require('./platform-whatsapp-campaign-audience');
const { buildPlatformCampaignSendPayload } = require('./platform-template-send-payload');
const { reconcileCampaignCounts } = require('./platform-whatsapp-campaign-report');

const BATCH_SIZE = parseInt(process.env.PLATFORM_WHATSAPP_CAMPAIGN_BATCH_SIZE, 10) || 50;
const BATCH_DELAY_MS = parseInt(process.env.PLATFORM_WHATSAPP_CAMPAIGN_BATCH_DELAY_MS, 10) || 1200;
const MAX_RECIPIENTS = parseInt(process.env.PLATFORM_WHATSAPP_CAMPAIGN_MAX_RECIPIENTS, 10) || 2000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCampaignModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Campaign: main.model(
      'PlatformWhatsAppCampaign',
      require('../models/PlatformWhatsAppCampaign').schema
    ),
    Template: main.model(
      'PlatformWhatsAppTemplate',
      require('../models/PlatformWhatsAppTemplate').schema
    ),
    PlatformLead: main.model('PlatformLead', require('../models/PlatformLead').schema),
  };
}

async function previewCampaignAudience(campaign) {
  const { PlatformLead } = await getCampaignModels();
  const recipients = await resolvePlatformLeadAudience({ campaign, PlatformLead });
  return {
    count: recipients.length,
    sample: recipients.slice(0, 10),
  };
}

async function runPlatformCampaign(campaignId, { createdBy = null } = {}) {
  const { Campaign, Template, PlatformLead } = await getCampaignModels();
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (!['draft', 'scheduled', 'queued'].includes(campaign.status)) {
    throw new Error(`Cannot run campaign in status "${campaign.status}"`);
  }

  const template = await Template.findById(campaign.templateId).lean();
  if (!template || template.status !== 'approved' || !template.gupshupTemplateId) {
    throw new Error('Campaign template must be approved with a Gupshup template ID');
  }

  const recipients = await resolvePlatformLeadAudience({ campaign, PlatformLead });
  if (!recipients.length) {
    campaign.status = 'failed';
    campaign.failureReason = 'No recipients matched the audience filters';
    campaign.completedAt = new Date();
    await campaign.save();
    return campaign;
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new Error(`Audience too large (${recipients.length}). Max ${MAX_RECIPIENTS}.`);
  }

  campaign.status = 'sending';
  campaign.startedAt = new Date();
  campaign.recipientCount = recipients.length;
  campaign.counts = { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
  await campaign.save();

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const fresh = await Campaign.findById(campaignId).select('status').lean();
    if (fresh?.status === 'cancelled') {
      campaign.status = 'cancelled';
      campaign.cancelledAt = new Date();
      await campaign.save();
      return campaign;
    }

    const batch = recipients.slice(i, i + BATCH_SIZE);
    for (const recipient of batch) {
      const { params, message } = buildPlatformCampaignSendPayload(
        template,
        campaign.variableMapping,
        recipient
      );
      if (message === null) {
        failed += 1;
        logger.warn(
          '[platform-campaign] missing header media URL for template %s',
          template.name
        );
        continue;
      }
      try {
        const result = await sendPlatformTemplateMessage({
          to: recipient.phone,
          templateId: template.gupshupTemplateId,
          params,
          message,
          templateDoc: template,
          campaignId: campaign._id,
          platformLeadId: recipient.platformLeadId,
          platformTemplateId: template._id,
          category: String(template.category || 'MARKETING').toLowerCase(),
          intent: 'platform_campaign',
          createdBy,
        });
        if (result.success) sent += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        logger.warn('[platform-campaign] send failed:', err?.message || err);
      }
    }

    await reconcileCampaignCounts(campaignId);
    if (i + BATCH_SIZE < recipients.length) await delay(BATCH_DELAY_MS);
  }

  campaign.status = failed === recipients.length ? 'failed' : 'sent';
  campaign.completedAt = new Date();
  if (campaign.status === 'failed') {
    campaign.failureReason = 'All sends failed';
  }
  await campaign.save();
  await reconcileCampaignCounts(campaignId);
  return campaign;
}

module.exports = {
  getCampaignModels,
  previewCampaignAudience,
  runPlatformCampaign,
  MAX_RECIPIENTS,
};
