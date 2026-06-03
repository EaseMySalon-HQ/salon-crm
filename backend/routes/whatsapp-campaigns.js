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
const databaseManager = require('../config/database-manager');
const { sendWhatsApp } = require('../lib/send-whatsapp');
const { INTENTS } = require('../lib/whatsapp-intents');
const { resolveCostPaise, PRICE_LIST_VERSION } = require('../config/whatsapp-pricing');
const { getComplianceState } = require('../lib/whatsapp-compliance');
const { logEvent } = require('../lib/whatsapp-audit');
const { getAddonStatus } = require('../lib/entitlements');
const metaWhatsApp = require('../services/meta-whatsapp-service');

const BATCH_SIZE = parseInt(process.env.WHATSAPP_CAMPAIGN_BATCH_SIZE, 10) || 50;
const BATCH_DELAY_MS = parseInt(process.env.WHATSAPP_CAMPAIGN_BATCH_DELAY_MS, 10) || 1200;
const MAX_INPROCESS_RECIPIENTS = 500;

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
      if (recipients.length > MAX_INPROCESS_RECIPIENTS) {
        return res.status(400).json({
          success: false,
          error: `Audience exceeds the in-process queue limit (${MAX_INPROCESS_RECIPIENTS}). Provision Redis/Bull and retry.`,
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

      // Fire-and-forget; the response returns immediately so the UI can poll stats.
      runCampaign({
        campaign,
        template,
        recipients,
        actorId: req.user._id,
      }).catch((err) => logger.error('[whatsapp-campaigns] runner failed:', err?.message || err));

      res.json({ success: true, data: { recipientCount: recipients.length, expectedSpendPaise: account.mode === 'live' ? expectedSpend : 0 } });
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

async function resolveAudience({ campaign, businessModels }) {
  const { Client } = businessModels;
  /**
   * Compliance-driven base filter:
   *  - whatsappConsent.optedIn must be true (salon-side opt-in)
   *  - Meta-reported `waMarketingOptOut` must NOT be true (the user_preferences
   *    webhook sets this when a recipient hits "Stop promotional messages"
   *    inside WhatsApp itself — we MUST exclude them or risk WABA flagging).
   *  - phone must exist and be non-empty (use $nin so both null and '' are
   *    excluded; the previous duplicate $ne keys collapsed in the object).
   */
  const filter = {
    'whatsappConsent.optedIn': true,
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
    /**
     * Custom phone lists may arrive in many shapes (E.164, country-code
     * prefixed, local 10-digit, with/without spaces or dashes). Client.phone
     * in the CRM is generally stored as the local 10-digit form. To keep
     * the audience match forgiving, expand each input into a small set of
     * candidate forms (digits-only, +91-prefixed-stripped, 10-digit local,
     * and country-prefixed) and union them with $in. This is what users
     * expect: pasting "+91 70911-40602" or "917091140602" or "7091140602"
     * should all hit the same CRM record.
     */
    const variants = new Set();
    for (const raw of af.phoneList) {
      const digits = String(raw || '').replace(/\D/g, '');
      if (!digits) continue;
      variants.add(digits);
      if (digits.length === 12 && digits.startsWith('91')) {
        variants.add(digits.slice(2));
      }
      if (digits.length === 11 && digits.startsWith('0')) {
        variants.add(digits.slice(1));
        variants.add('91' + digits.slice(1));
      }
      if (digits.length === 10) {
        variants.add('91' + digits);
      }
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

/**
 * Compute how many clients would be additionally included if the marketing
 * opt-out exclusion were lifted — used by the UI to surface "we excluded N
 * Meta-opted-out clients" so operators understand the gap between
 * preview.count and total opted-in.
 */
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
  /**
   * Build the per-recipient `components` array Meta expects when sending an
   * approved template. We currently support placeholders in:
   *  - HEADER (TEXT format only — media headers carry no `{{N}}` text)
   *  - BODY  (any number of placeholders)
   * Buttons with URL placeholders are not yet wired (Meta uses
   * `{ type: 'button', sub_type: 'url', index: 0, parameters: [...] }`).
   */
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
  /**
   * Track the most-recent failure reason from this run so we can stamp it on
   * the campaign row when everything fails. This lets the table show a one-
   * line diagnostic ("Access token expired") instead of a silent red 0/N.
   */
  let lastFailureReason = null;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    /**
     * Honour mid-run cancellation. We re-fetch the campaign status before
     * each batch (cheap — single doc by _id) so an operator hitting Cancel
     * stops the next batch from going out. Any in-flight Promise.allSettled
     * already resolves on its own.
     */
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
          /**
           * Wrap with `cause` so the parent runner can pull structured
           * Meta error info ({ error: { code, message } }) out — without
           * this we lose the entire object to "[object Object]".
           */
          const errMsg =
            (result.error?.error?.message) ||
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
        /**
         * `s.reason` is the Error thrown inside the per-recipient task. The
         * task throws `new Error(result.error || 'send failed')` — but
         * `result.error` from the unified pipeline is often a Meta error
         * OBJECT (`{ error: { code, message, ... } }`), so naive
         * `Error(<object>)` becomes "Error: [object Object]". Extract the
         * Meta-side `error.message` first; otherwise JSON-stringify; only
         * fall back to .message when the rejection wasn't an Error wrapper.
         */
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

  /**
   * Final status:
   *  - cancelled : operator stopped mid-run; preserve the partial counts
   *  - failed    : 0 successful sends
   *  - completed : at least one successful send (delivered/read counters
   *                continue to climb as webhooks arrive). We use
   *                `completed` (mapped from legacy `sent`) to indicate the
   *                runner finished its work; `delivered` is the operator's
   *                real success metric.
   * NOTE: The schema enum currently has 'sent' but not 'completed'; we
   * keep using 'sent' for backwards compatibility with existing rows.
   */
  if (cancelled) {
    await Campaign.updateOne({ _id: campaign._id }, { $set: { completedAt: new Date() } });
    return;
  }
  const finalStatus = sent === 0 ? 'failed' : 'sent';
  /**
   * Friendly rollup. If every send failed with the same auth/Meta error,
   * bubble that one-liner up to the campaign row so the operator immediately
   * sees "Access token expired" in the table instead of having to dig
   * through individual message logs.
   */
  let friendlyFailure = null;
  if (finalStatus === 'failed' && lastFailureReason) {
    if (/\b190\b|Session has expired/i.test(lastFailureReason)) {
      friendlyFailure =
        'Access token expired or invalid. Reconnect WhatsApp via Settings → WhatsApp Integration.';
    } else if (/\b131030\b|not in allowed list/i.test(lastFailureReason)) {
      /**
       * Meta sandbox / test number restriction — only recipients explicitly
       * added to the test-recipient list in the Meta Dashboard can receive
       * messages. Switch to a verified production number, or add each
       * recipient under Meta → WhatsApp → API Setup → Recipient Phone
       * Numbers, OR populate `WhatsAppAccount.testRecipientWhitelist`.
       */
      friendlyFailure =
        'Sandbox restriction: recipients are not in the Meta test number\'s allowed list. Add them in Meta Dashboard → WhatsApp → API Setup → Recipient phone numbers, or switch to a production-verified number.';
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

/**
 * Internal entry point for the scheduler. Mirrors the gate logic of
 * `POST /:id/send` but runs without an HTTP request — used by
 * `jobs/whatsapp-campaign-scheduler.js` to fire scheduled campaigns.
 *
 * NOTE: We can't reuse the HTTP middleware (auth, setupBusinessDatabase),
 * so we resolve the tenant connection ourselves via `databaseManager`.
 */
async function runCampaignFromScheduler({ campaignId }) {
  const { Campaign, Template, Account, Business } = await getMainModels();
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return;
  if (campaign.status !== 'queued') return; // claimed elsewhere or cancelled

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

  // Resolve audience using the tenant DB. Replicate setupBusinessDatabase's
  // model registration directly so we don't depend on Express middleware.
  const mainConn = await databaseManager.getMainConnection();
  const tenantConn = await databaseManager.getConnection(businessId, mainConn);
  const modelFactory = require('../models/model-factory');
  const businessModels = modelFactory.getCachedBusinessModels(tenantConn);
  const recipients = await resolveAudience({ campaign, businessModels });
  if (recipients.length === 0) return fail('No opted-in recipients');
  if (recipients.length > MAX_INPROCESS_RECIPIENTS) {
    return fail(`Audience exceeds in-process limit (${MAX_INPROCESS_RECIPIENTS})`);
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

  await runCampaign({ campaign, template, recipients, actorId: campaign.createdBy || null });
}

module.exports = router;
module.exports.runCampaignFromScheduler = runCampaignFromScheduler;
