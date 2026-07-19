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
      const health = await gupshupWhatsApp.getWabaHealth({ appId: account.gupshupAppId });
      const ratings = await gupshupWhatsApp.getRatings({ appId: account.gupshupAppId });
      if (ratings?.data) {
        account.qualityRating =
          ratings.data?.ratings?.quality || ratings.data?.quality || account.qualityRating;
        account.messagingLimitTier =
          ratings.data?.ratings?.limit || ratings.data?.messagingLimit || account.messagingLimitTier;
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
      const result = await sendWhatsApp({
        businessId,
        intent: INTENTS.WELCOME,
        recipientPhone: to,
        gupshupTemplateId,
        params,
        allowUnapproved: true,
      });
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || 'Send failed' });
      }
      return res.json({ success: true, data: result.message });
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
