/**
 * WhatsApp campaigns (Meta Cloud API).
 * Mounted at /api/whatsapp/v2/campaigns.
 *
 * Hard gates on send:
 *   - WABA must be connected (status === 'connected')
 *   - Template must be approved
 *   - Recipients filtered to whatsappConsent.optedIn === true
 *   - WhatsApp add-on must be enabled in the business plan
 *   - Wallet balance must cover (recipients × marketing rate)
 *
 * Sending uses the Phase 0 unified pipeline (`sendWhatsApp`) for dedupe,
 * conversation tracking, and per-message wallet billing.
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateToken, requireManager } = require('../middleware/auth');
const { setupMainDatabase, setupBusinessDatabase } = require('../middleware/business-db');
const requireWabaAddon = require('../middleware/waba-addon');
const { logger } = require('../utils/logger');
const { resolveCostPaise, PRICE_LIST_VERSION } = require('../config/whatsapp-pricing');
const { getComplianceState } = require('../lib/whatsapp-compliance');
const { logEvent } = require('../lib/whatsapp-audit');
const { getAddonStatus } = require('../lib/entitlements');
const metaWhatsApp = require('../services/meta-whatsapp-service');
const {
  getMainModels,
  resolveAudience,
  countMetaOptedOut,
  runCampaign,
  runCampaignFromScheduler,
  getMaxRecipients,
  MAX_INPROCESS_RECIPIENTS,
} = require('../lib/whatsapp-campaign-runner');
const { enqueueCampaignRun, isQueueEnabled } = require('../lib/whatsapp-campaign-queue');

router.get('/', authenticateToken, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const { Campaign } = await getMainModels();
    const items = await Campaign.find({ businessId: req.user.branchId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: items });
  } catch (err) {
    logger.error('[whatsapp-campaigns] list failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load campaigns' });
  }
});

router.post('/', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = req.user.branchId;
    const { name, description, templateId, audienceType, audienceFilters, variableMapping, scheduledAt } = req.body || {};
    if (!name || !templateId) {
      return res.status(400).json({ success: false, error: 'name and templateId are required' });
    }
    const { Campaign, Template } = await getMainModels();
    const template = await Template.findOne({ _id: templateId, businessId }).lean();
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const created = await Campaign.create({
      businessId,
      name,
      description: description || '',
      templateId,
      audienceType: audienceType || 'all_optin',
      audienceFilters: audienceFilters || {},
      variableMapping: variableMapping || {},
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'scheduled' : 'draft',
      createdBy: req.user._id,
    });
    await logEvent({
      businessId,
      actorType: 'user',
      actorId: req.user._id,
      event: 'campaign_create',
      summary: `Campaign "${name}" created`,
      metadata: {
        campaignId: String(created._id),
        templateId: String(templateId),
        audienceType: created.audienceType,
        scheduledAt: created.scheduledAt,
      },
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    logger.error('[whatsapp-campaigns] create failed:', err);
    res.status(500).json({ success: false, error: 'Failed to create campaign' });
  }
});

router.get('/:id', authenticateToken, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const { Campaign } = await getMainModels();
    const campaign = await Campaign.findOne({ _id: req.params.id, businessId: req.user.branchId }).lean();
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, data: campaign });
  } catch (err) {
    logger.error('[whatsapp-campaigns] get failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load campaign' });
  }
});

router.put('/:id', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const { Campaign } = await getMainModels();
    const campaign = await Campaign.findOne({ _id: req.params.id, businessId: req.user.branchId });
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({ success: false, error: `Cannot edit a campaign in status "${campaign.status}"` });
    }
    const editable = ['name', 'description', 'templateId', 'audienceType', 'audienceFilters', 'variableMapping', 'scheduledAt'];
    for (const k of editable) {
      if (req.body[k] !== undefined) campaign[k] = k === 'scheduledAt' && req.body[k] ? new Date(req.body[k]) : req.body[k];
    }
    if (req.body.scheduledAt) campaign.status = 'scheduled';
    await campaign.save();
    res.json({ success: true, data: campaign });
  } catch (err) {
    logger.error('[whatsapp-campaigns] update failed:', err);
    res.status(500).json({ success: false, error: 'Failed to update campaign' });
  }
});

router.post('/:id/cancel', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const { Campaign } = await getMainModels();
    /**
     * Cancellable states:
     *  - draft     : never sent
     *  - scheduled : waiting for the cron to pick it up
     *  - queued    : on the queue but not yet sending
     *  - sending   : runner has started; the in-process runner checks this
     *                flag between batches and bails out cleanly
     */
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, businessId: req.user.branchId, status: { $in: ['draft', 'scheduled', 'queued', 'sending'] } },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found or already finished' });
    await logEvent({
      businessId: campaign.businessId,
      actorType: 'user',
      actorId: req.user._id,
      event: 'campaign_cancel',
      summary: `Campaign ${campaign.name} cancelled`,
      metadata: { campaignId: String(campaign._id) },
    });
    res.json({ success: true, data: campaign });
  } catch (err) {
    logger.error('[whatsapp-campaigns] cancel failed:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel campaign' });
  }
});

router.post(
  '/:id/recipients/preview',
  authenticateToken,
  requireManager,
  setupMainDatabase,
  requireWabaAddon,
  setupBusinessDatabase,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      const { Campaign } = await getMainModels();
      const campaign = await Campaign.findOne({ _id: req.params.id, businessId });
      if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
      const [recipients, excludedOptOut] = await Promise.all([
        resolveAudience({ campaign, businessModels: req.businessModels }),
        countMetaOptedOut({ campaign, businessModels: req.businessModels }),
      ]);
      res.json({
        success: true,
        data: {
          count: recipients.length,
          excludedOptOut,
          sample: recipients.slice(0, 25),
        },
      });
    } catch (err) {
      logger.error('[whatsapp-campaigns] preview failed:', err);
      res.status(500).json({ success: false, error: 'Failed to compute audience' });
    }
  }
);

router.post(
  '/:id/send',
  authenticateToken,
  requireManager,
  setupMainDatabase,
  requireWabaAddon,
  setupBusinessDatabase,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      const models = await getMainModels();
      const { Campaign, Template, Account, Business } = models;

      const campaign = await Campaign.findOne({ _id: req.params.id, businessId });
      if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
      if (!['draft', 'scheduled'].includes(campaign.status)) {
        return res.status(400).json({ success: false, error: `Cannot send a campaign in status "${campaign.status}"` });
      }

      const account = await Account.findOne({ businessId }).lean();
      if (!account || account.status !== 'connected') {
        return res.status(400).json({ success: false, error: 'WhatsApp Business account is not connected. Connect via Settings → WhatsApp Integration.' });
      }
      const template = await Template.findOne({ _id: campaign.templateId, businessId }).lean();
      if (!template || template.status !== 'approved') {
        return res.status(400).json({ success: false, error: 'Template is not approved. Submit it to Meta and wait for approval.' });
      }
      const business = await Business.findById(businessId).select('plan.addons wallet.balancePaise').lean();
      if (!getAddonStatus(business, 'waba').enabled) {
        return res.status(403).json({
          success: false,
          error: 'WABA Integration add-on is not enabled. The new Meta WhatsApp module requires the WABA add-on (separate from legacy WhatsApp/MSG91).',
        });
      }

      /**
       * Pre-flight token validity check. Without this, an expired/invalidated
       * token causes every recipient send to 401 individually — which both
       * spams Meta with junk requests and (worse) leaves the campaign with a
       * row of "Failed: N" without any single clear error in the UI. We now
       * call Meta's `debug_token` once before fan-out; if Meta says the
       * token is dead we abort the campaign with a precise message and let
       * the on-failure handler (in send-whatsapp.js) flip the account to
       * `error` so the salon sees the reconnect banner immediately.
       */
      const tokenCheck = await metaWhatsApp.validateToken({
        businessId,
        phoneNumberId: account.phoneNumberId,
      });
      /**
       * Auto-heal: if the account was previously stamped `error` but the
       * token now validates (user rotated it via Connect → Manual), flip
       * back to `connected` and clear the banner before fanning out. This
       * removes the dead-end where the salon updates the token but the
       * old error banner sticks because nothing flips status back.
       */
      if (tokenCheck.ok && account.status !== 'connected') {
        try {
          await Account.updateOne(
            { businessId },
            { $set: { status: 'connected' }, $unset: { lastErrorMessage: '' } }
          );
          logger.info(`[whatsapp-campaigns] auto-recovered account status -> connected for ${businessId}`);
        } catch (recErr) {
          logger.warn(`[whatsapp-campaigns] could not auto-recover account: ${recErr?.message || recErr}`);
        }
      }

      if (!tokenCheck.ok) {
        try {
          await Account.updateOne(
            { businessId },
            {
              $set: {
                status: 'error',
                lastErrorMessage:
                  tokenCheck.subcode === 463
                    ? 'Access token has expired. Reconnect via Settings → WhatsApp Integration.'
                    : tokenCheck.message || 'Access token is not valid. Reconnect WhatsApp.',
              },
            }
          );
        } catch (acctErr) {
          logger.warn(
            '[whatsapp-campaigns] could not flip account status after token check:',
            acctErr?.message || acctErr
          );
        }
        return res.status(400).json({
          success: false,
          code: 'WABA_TOKEN_INVALID',
          error:
            tokenCheck.subcode === 463
              ? 'WhatsApp access token has expired. Reconnect via Settings → WhatsApp Integration before sending.'
              : `WhatsApp access token is not valid: ${tokenCheck.message}`,
        });
      }

      const recipients = await resolveAudience({ campaign, businessModels: req.businessModels });
      if (recipients.length === 0) {
        return res.status(400).json({ success: false, error: 'No opted-in recipients matched the audience filters.' });
      }
      const maxRecipients = getMaxRecipients();
      if (recipients.length > maxRecipients) {
        return res.status(400).json({
          success: false,
          error: isQueueEnabled()
            ? `Audience exceeds the campaign limit (${maxRecipients}).`
            : `Audience exceeds the in-process queue limit (${MAX_INPROCESS_RECIPIENTS}). Set REDIS_URL and run the WhatsApp campaign worker.`,
        });
      }

      const compliance = await getComplianceState(businessId);
      const ratePerRecipientPaise = resolveCostPaise({ category: 'marketing', countryCode: 'IN', freeWindow: false });
      const expectedSpend = ratePerRecipientPaise * recipients.length;
      const balance = Number(business?.wallet?.balancePaise || 0);
      if (account.mode === 'live' && balance < expectedSpend) {
        return res.status(402).json({
          success: false,
          error: `Insufficient wallet balance. Needed ₹${(expectedSpend / 100).toFixed(2)}, available ₹${(balance / 100).toFixed(2)}.`,
        });
      }

      campaign.recipientCount = recipients.length;
      campaign.status = 'sending';
      campaign.startedAt = new Date();
      campaign.complianceSnapshot = compliance;
      await campaign.save();

      await logEvent({
        businessId,
        actorType: 'user',
        actorId: req.user._id,
        event: 'campaign_send',
        summary: `Campaign ${campaign.name} sending to ${recipients.length} recipients`,
        metadata: {
          campaignId: String(campaign._id),
          templateId: String(template._id),
          recipientCount: recipients.length,
          priceListVersion: PRICE_LIST_VERSION,
        },
      });

      const queued = await enqueueCampaignRun({
        campaignId: campaign._id,
        actorId: req.user._id,
      });
      if (!queued) {
        runCampaign({
          campaign,
          template,
          recipients,
          actorId: req.user._id,
        }).catch((err) => logger.error('[whatsapp-campaigns] runner failed:', err?.message || err));
      }

      res.json({
        success: true,
        data: {
          recipientCount: recipients.length,
          expectedSpendPaise: account.mode === 'live' ? expectedSpend : 0,
          queued: Boolean(queued),
        },
      });
    } catch (err) {
      logger.error('[whatsapp-campaigns] send failed:', err);
      res.status(500).json({ success: false, error: err?.message || 'Send failed' });
    }
  }
);

router.get('/:id/stats', authenticateToken, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const { Campaign } = await getMainModels();
    const campaign = await Campaign.findOne({ _id: req.params.id, businessId: req.user.branchId }).lean();
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, data: { status: campaign.status, counts: campaign.counts, recipientCount: campaign.recipientCount } });
  } catch (err) {
    logger.error('[whatsapp-campaigns] stats failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

module.exports = router;
module.exports.runCampaignFromScheduler = runCampaignFromScheduler;
