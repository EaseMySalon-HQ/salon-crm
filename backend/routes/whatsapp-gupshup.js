/**
 * Tenant Gupshup WhatsApp connect / status routes.
 * Mounted at /api/whatsapp/gupshup — replaces the Meta Embedded Signup flow.
 *
 * Businesses connect their own Gupshup app (app id + sender number) from
 * Settings → WhatsApp. When not connected, all sends use the shared platform
 * number configured in env (GUPSHUP_PLATFORM_*).
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateToken, requireManager } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const requireWabaAddon = require('../middleware/waba-addon');
const databaseManager = require('../config/database-manager');
const gupshupConfig = require('../lib/gupshup-config');
const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const { linkGupshupApp, unlinkGupshupApp } = require('../lib/gupshup-link-app');
const { sendWhatsApp } = require('../lib/send-whatsapp');
const { INTENTS } = require('../lib/whatsapp-intents');
const { getComplianceState } = require('../lib/whatsapp-compliance');
const { logger } = require('../utils/logger');

/**
 * After a test send, briefly tail the WhatsAppMessage row waiting for a
 * webhook-driven status flip (queued → sent → delivered / failed). Returns the
 * latest snapshot after `timeoutMs` regardless.
 */
async function tailMessageStatus({ messageId, timeoutMs = 6000, pollMs = 400 }) {
  if (!messageId) return null;
  const main = await databaseManager.getMainConnection();
  const Message = main.model('WhatsAppMessage', require('../models/WhatsAppMessage').schema);
  const stopAt = Date.now() + timeoutMs;
  const terminal = new Set(['delivered', 'read', 'failed', 'deleted']);
  let latest = null;
  while (Date.now() < stopAt) {
    latest = await Message.findById(messageId)
      .select({
        _id: 1,
        status: 1,
        failureCode: 1,
        failureReason: 1,
        providerMessageId: 1,
        metaMessageId: 1,
      })
      .lean();
    if (latest?.status && terminal.has(latest.status)) return latest;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return latest;
}

async function getAccountModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema);
}

async function readAddonFlags(businessId) {
  const main = await databaseManager.getMainConnection();
  const Business = main.model('Business', require('../models/Business').schema);
  const biz = await Business.findById(businessId).select('plan.addons').lean();
  return {
    waba: Boolean(biz?.plan?.addons?.waba?.enabled),
    whatsapp: Boolean(biz?.plan?.addons?.whatsapp?.enabled),
  };
}

function isStaleMetaErrorMessage(message) {
  if (!message) return false;
  const s = String(message).toLowerCase();
  return (
    s.includes('debug_token') ||
    s.includes('oauth') ||
    s.includes('meta rejected') ||
    s.includes('meta user') ||
    s.includes('embedded signup') ||
    s.includes('graph.facebook.com') ||
    (s.includes('access token') && s.includes('expired'))
  );
}

function resolvePublicErrorMessage(account, ownAppConnected) {
  if (!account?.lastErrorMessage) return null;
  if (account.provider === 'meta' || isStaleMetaErrorMessage(account.lastErrorMessage)) {
    return null;
  }
  if (!ownAppConnected) return null;
  if (account.status === 'error' || account.status === 'connected') {
    return account.lastErrorMessage;
  }
  return null;
}

async function buildPublicStatusView(account, addons) {
  const ownAppConnected = gupshupConfig.isBusinessAppUsable(account);
  const platform = await gupshupConfig.loadPlatformConfig();
  const platformAvailable = Boolean(platform.appId && platform.source);

  return {
    provider: 'gupshup',
    status: ownAppConnected ? 'connected' : platformAvailable ? 'platform_shared' : 'disconnected',
    connected: ownAppConnected || platformAvailable,
    usingSharedPlatform: !ownAppConnected && platformAvailable,
    ownAppConnected,
    platformConfigured: platformAvailable,
    gupshupAppId: account?.gupshupAppId || null,
    gupshupAppName: account?.gupshupAppName || null,
    wabaId: account?.wabaId || null,
    sourceNumber: ownAppConnected ? account?.sourceNumber || account?.phoneE164 : platform.source,
    displayName: account?.displayName || account?.gupshupAppName || null,
    qualityRating: account?.qualityRating || null,
    messagingLimitTier: account?.messagingLimitTier || null,
    connectedAt: account?.connectedAt || null,
    disconnectedAt: account?.disconnectedAt || null,
    lastSyncAt: account?.lastSyncAt || null,
    lastErrorMessage: resolvePublicErrorMessage(account, ownAppConnected),
    platformAppId: platform.appId,
    platformSourceNumber: platform.source,
    addon: {
      waba: Boolean(addons?.waba),
      legacyWhatsapp: Boolean(addons?.whatsapp),
    },
  };
}

router.get('/status', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const businessId = req.user.branchId;
    if (!businessId) {
      return res.status(400).json({ success: false, error: 'Business context missing' });
    }
    const Account = await getAccountModel();
    const [account, addons] = await Promise.all([
      Account.findOne({ businessId }).lean(),
      readAddonFlags(businessId),
    ]);

    // Clear stale Meta-era errors left on old WhatsAppAccount rows.
    if (
      account &&
      (account.provider === 'meta' || isStaleMetaErrorMessage(account.lastErrorMessage))
    ) {
      Account.updateOne(
        { businessId },
        {
          $unset: { lastErrorMessage: '' },
          $set: {
            ...(account.provider === 'meta' && account.status === 'error'
              ? { status: 'disconnected' }
              : {}),
          },
        }
      ).catch((err) =>
        logger.warn('[whatsapp-gupshup] stale Meta error cleanup failed:', err?.message || err)
      );
    }

    return res.json({ success: true, data: await buildPublicStatusView(account, addons) });
  } catch (err) {
    logger.error('[whatsapp-gupshup] /status failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load WhatsApp status' });
  }
});

/**
 * Connect this business's own Gupshup app (from Partner Portal).
 * Body: { appId, appName?, sourceNumber }
 */
router.post(
  '/connect',
  authenticateToken,
  requireManager,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      const { appId, appName, sourceNumber } = req.body || {};
      if (!appId || !sourceNumber) {
        return res.status(400).json({
          success: false,
          error: 'appId and sourceNumber are required (from your Gupshup Partner app)',
        });
      }
      const result = await linkGupshupApp({ businessId, appId, appName, sourceNumber });
      if (!result.success) {
        return res.status(400).json(result);
      }
      const Account = await getAccountModel();
      const account = await Account.findOne({ businessId }).lean();
      const addons = await readAddonFlags(businessId);
      return res.json({
        success: true,
        data: {
          ...(await buildPublicStatusView(account, addons)),
          subscription: result.subscription,
          templatesReset: result.templatesReset,
        },
      });
    } catch (err) {
      logger.error('[whatsapp-gupshup] /connect failed:', err);
      return res.status(500).json({ success: false, error: 'Failed to connect Gupshup app' });
    }
  }
);

router.post(
  '/disconnect',
  authenticateToken,
  requireManager,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      await unlinkGupshupApp(businessId);
      const addons = await readAddonFlags(businessId);
      return res.json({
        success: true,
        data: await buildPublicStatusView(null, addons),
      });
    } catch (err) {
      logger.error('[whatsapp-gupshup] /disconnect failed:', err);
      return res.status(500).json({ success: false, error: 'Failed to disconnect' });
    }
  }
);

/** Refresh health/quality from Gupshup for the connected app. */
router.post(
  '/refresh',
  authenticateToken,
  requireManager,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      const Account = await getAccountModel();
      const account = await Account.findOne({ businessId });
      if (!account?.gupshupAppId || account.status !== 'connected') {
        return res.status(400).json({ success: false, error: 'No connected Gupshup app to refresh' });
      }
      const [health, ratings, wabaInfo] = await Promise.all([
        gupshupWhatsApp.getWabaHealth({ appId: account.gupshupAppId }),
        gupshupWhatsApp.getRatings({ appId: account.gupshupAppId }),
        gupshupWhatsApp.getWabaInfo({ appId: account.gupshupAppId }),
      ]);
      if (ratings?.data) {
        account.qualityRating =
          ratings.data?.ratings?.quality || ratings.data?.quality || account.qualityRating;
        account.messagingLimitTier =
          ratings.data?.currentLimit ||
          ratings.data?.ratings?.limit ||
          ratings.data?.messagingLimit ||
          account.messagingLimitTier;
      }
      if (wabaInfo.success && wabaInfo.data) {
        if (wabaInfo.data.wabaId) account.wabaId = String(wabaInfo.data.wabaId);
        if (wabaInfo.data.phoneId) account.phoneNumberId = String(wabaInfo.data.phoneId);
        if (wabaInfo.data.verifiedName) account.displayName = String(wabaInfo.data.verifiedName);
      }
      account.lastSyncAt = new Date();
      if (!health.success) {
        account.lastErrorMessage = 'Gupshup health check failed';
      } else {
        account.lastErrorMessage = null;
      }
      await account.save();
      const addons = await readAddonFlags(businessId);
      return res.json({ success: true, data: await buildPublicStatusView(account.toObject(), addons) });
    } catch (err) {
      logger.error('[whatsapp-gupshup] /refresh failed:', err);
      return res.status(500).json({ success: false, error: 'Refresh failed' });
    }
  }
);

router.post(
  '/test-message',
  authenticateToken,
  requireManager,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      const { to, gupshupTemplateId, params = [] } = req.body || {};
      if (!to) {
        return res.status(400).json({ success: false, error: 'Recipient phone (to) is required' });
      }
      if (!gupshupTemplateId) {
        return res.status(400).json({
          success: false,
          error: 'gupshupTemplateId is required for test sends',
        });
      }

      // Test sends must go through the tenant's connected app — never fall
      // back to the shared platform sender, because the template id belongs
      // to the tenant's WABA and the platform app would silently reject it.
      const account = await gupshupConfig.loadAccount(businessId);
      if (!gupshupConfig.isBusinessAppUsable(account)) {
        return res.status(400).json({
          success: false,
          error: gupshupConfig.TENANT_APP_REQUIRED_MSG,
          code: 'WHATSAPP_APP_NOT_CONNECTED',
        });
      }
      if (!account.gupshupAppName) {
        return res.status(400).json({
          success: false,
          error:
            'Gupshup app name is missing on this connection. Disconnect and reconnect with the exact App Name from Partner Portal (required as src.name for template sends).',
          code: 'GUPSHUP_APP_NAME_MISSING',
        });
      }

      // Verify the template is APPROVED on THIS app before spending a send.
      // Local status alone is not enough — leftover Meta-era rows and PENDING
      // templates both cause "submitted" API responses that never deliver.
      const remote = await gupshupWhatsApp.getTemplate({
        appId: account.gupshupAppId,
        templateId: String(gupshupTemplateId).trim(),
      });
      if (!remote.success) {
        return res.status(400).json({
          success: false,
          error:
            'That template id is not on your connected Gupshup app. Open WhatsApp → Templates, Sync from Meta, and pick an APPROVED template.',
          code: 'GUPSHUP_TEMPLATE_NOT_ON_APP',
          details: remote.error,
        });
      }
      const remoteTpl = remote.data?.template || remote.data || {};
      const remoteStatus = String(remoteTpl.status || '').toUpperCase();
      if (remoteStatus !== 'APPROVED') {
        return res.status(400).json({
          success: false,
          error: `Template is "${remoteStatus || 'UNKNOWN'}" on Gupshup — only APPROVED templates can be sent. Wait for Meta approval or Sync from Meta.`,
          code: 'TEMPLATE_NOT_APPROVED',
          gupshup: {
            appId: account.gupshupAppId,
            templateStatus: remoteStatus || null,
            elementName: remoteTpl.elementName || remoteTpl.name || null,
          },
        });
      }

      const result = await sendWhatsApp({
        businessId,
        intent: INTENTS.WELCOME,
        recipientPhone: to,
        gupshupTemplateId,
        params,
        allowUnapproved: true,
        requireTenantApp: true,
      });
      if (!result.success) {
        logger.warn(
          '[whatsapp-gupshup] test-message failed business=%s appId=%s to=%s template=%s error=%s',
          String(businessId),
          account.gupshupAppId,
          to,
          gupshupTemplateId,
          typeof result.error === 'string' ? result.error : JSON.stringify(result.error)
        );
        return res.status(400).json({
          success: false,
          error: result.error || 'Send failed',
          code: result.code || undefined,
          gupshup: {
            appId: account.gupshupAppId,
            sourceNumber: account.sourceNumber || account.phoneE164 || null,
            appName: account.gupshupAppName || null,
          },
        });
      }
      // Wait up to 6s for a delivery/failed webhook so the tenant sees the
      // real provider outcome instead of just "sent" (which only means
      // Gupshup accepted the API call).
      const final = await tailMessageStatus({
        messageId: result.message?._id,
        timeoutMs: 6000,
      });
      if (final?.status === 'failed') {
        logger.warn(
          '[whatsapp-gupshup] test-message provider marked failed business=%s to=%s code=%s reason=%s',
          String(businessId),
          to,
          final.failureCode || '(none)',
          final.failureReason || '(none)'
        );
        return res.status(400).json({
          success: false,
          error:
            final.failureReason ||
            `Provider marked the message as failed${final.failureCode ? ` (${final.failureCode})` : ''}`,
          code: final.failureCode || 'PROVIDER_FAILED',
          data: final,
          gupshup: {
            appId: account.gupshupAppId,
            sourceNumber: account.sourceNumber || account.phoneE164 || null,
            appName: account.gupshupAppName || null,
          },
        });
      }
      return res.json({
        success: true,
        data: final || result.message,
        finalStatus: final?.status || result.message?.status || 'sent',
        gupshup: {
          appId: account.gupshupAppId,
          sourceNumber: account.sourceNumber || account.phoneE164 || null,
          appName: account.gupshupAppName || null,
        },
      });
    } catch (err) {
      logger.error('[whatsapp-gupshup] /test-message failed:', err);
      return res.status(500).json({ success: false, error: 'Test send failed' });
    }
  }
);

router.get('/compliance', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const businessId = req.user.branchId;
    if (!businessId) {
      return res.status(400).json({ success: false, error: 'Business context missing' });
    }
    const data = await getComplianceState(businessId);
    return res.json({ success: true, data });
  } catch (err) {
    logger.error('[whatsapp-gupshup] /compliance failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load compliance state' });
  }
});

module.exports = router;
