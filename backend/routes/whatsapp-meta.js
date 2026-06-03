/**
 * Meta Cloud API connect/disconnect/status/test routes.
 *
 * Mounted at /api/whatsapp/meta. Power the Settings → WhatsApp Integration UI.
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateToken, requireManager } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const requireWabaAddon = require('../middleware/waba-addon');
const { logger } = require('../utils/logger');

const databaseManager = require('../config/database-manager');
const metaWhatsApp = require('../services/meta-whatsapp-service');
const { encrypt } = require('../lib/crypto');
const { logEvent } = require('../lib/whatsapp-audit');
const { getComplianceState } = require('../lib/whatsapp-compliance');
const { sendWhatsApp } = require('../lib/send-whatsapp');
const { INTENTS } = require('../lib/whatsapp-intents');
const { getMetaConfig } = require('../lib/whatsapp-meta-config');

async function getMainModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Account: main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema),
  };
}

function publicAccountView(account, compliance, addons) {
  const addonView = {
    waba: Boolean(addons?.waba),
    legacyWhatsapp: Boolean(addons?.whatsapp),
  };
  if (!account) {
    return {
      status: 'disconnected',
      mode: 'test',
      connected: false,
      compliance: compliance || null,
      addon: addonView,
    };
  }
  return {
    status: account.status,
    mode: account.mode,
    connected: account.status === 'connected',
    wabaId: account.wabaId,
    metaBusinessId: account.metaBusinessId,
    phoneNumberId: account.phoneNumberId,
    phoneE164: account.phoneE164,
    displayName: account.displayName,
    qualityRating: account.qualityRating,
    messagingLimitTier: account.messagingLimitTier,
    webhookVerified: account.webhookVerified,
    connectedAt: account.connectedAt,
    disconnectedAt: account.disconnectedAt,
    lastSyncAt: account.lastSyncAt,
    tokenExpiresAt: account.tokenExpiresAt,
    tokenLastUsedAt: account.tokenLastUsedAt,
    lastErrorMessage: account.lastErrorMessage,
    compliance: compliance || null,
    addon: addonView,
  };
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

router.get('/status', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const businessId = req.user.branchId;
    if (!businessId) {
      return res.status(400).json({ success: false, error: 'Business context missing' });
    }
    const { Account } = await getMainModels();
    const [account, compliance, addons] = await Promise.all([
      Account.findOne({ businessId }).lean(),
      getComplianceState(businessId),
      readAddonFlags(businessId),
    ]);
    return res.json({ success: true, data: publicAccountView(account, compliance, addons) });
  } catch (err) {
    logger.error('[whatsapp-meta] /status failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load WhatsApp status' });
  }
});

/**
 * Embedded Signup completion handler.
 *
 * Body:
 *  - code (required): short-lived code returned by FB.login signup flow
 *  - wabaId (required): selected business WABA id
 *  - phoneNumberId (required): selected phone number id
 *  - phoneE164 (optional): display phone number
 *  - displayName (optional): verified business name
 *  - mode (optional): 'test' | 'live' (defaults to 'test')
 *  - redirectUri (optional): same redirect_uri used in FB.login
 */
router.post(
  '/connect/exchange',
  authenticateToken,
  requireManager,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    const businessId = req.user.branchId;
    if (!businessId) {
      return res.status(400).json({ success: false, error: 'Business context missing' });
    }
    const { code, wabaId, phoneNumberId, phoneE164, displayName, mode, redirectUri } = req.body || {};
    if (!code || !wabaId || !phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: 'code, wabaId, phoneNumberId are required',
      });
    }
    const metaCfg = await getMetaConfig();
    if (!metaCfg.appId || !metaCfg.appSecret) {
      return res.status(500).json({
        success: false,
        error:
          'Meta app credentials are not configured. Ask a platform admin to set them under Admin → Settings → API & Integration → WhatsApp.',
      });
    }
    try {
      const tokenRes = await metaWhatsApp.exchangeCodeForToken({ code, redirectUri });
      if (!tokenRes.success) {
        return res.status(400).json({ success: false, error: tokenRes.error || 'Token exchange failed' });
      }
      const accessToken = tokenRes.data?.access_token;
      const expiresInSeconds = Number(tokenRes.data?.expires_in || 0);
      if (!accessToken) {
        return res.status(400).json({ success: false, error: 'Meta did not return an access_token' });
      }
      const cipher = encrypt(accessToken);
      const now = new Date();
      const tokenExpiresAt =
        expiresInSeconds > 0 ? new Date(now.getTime() + expiresInSeconds * 1000) : null;

      const { Account } = await getMainModels();
      const account = await Account.findOneAndUpdate(
        { businessId },
        {
          $set: {
            wabaId,
            phoneNumberId,
            phoneE164: phoneE164 || null,
            displayName: displayName || null,
            accessTokenCipher: cipher,
            tokenCreatedAt: now,
            tokenLastRotatedAt: now,
            tokenLastUsedAt: now,
            tokenExpiresAt,
            connectedAt: now,
            disconnectedAt: null,
            status: 'connected',
            mode: mode === 'live' ? 'live' : 'test',
            lastErrorMessage: null,
          },
          $inc: { tokenVersion: 1 },
          $setOnInsert: { businessId },
        },
        { new: true, upsert: true }
      );

      // Subscribe to webhooks (best-effort; logs failure but doesn't block).
      try {
        const sub = await metaWhatsApp.subscribeWebhooks({ businessId });
        if (sub.success) {
          account.webhookVerified = true;
          await account.save();
        } else {
          logger.warn('[whatsapp-meta] subscribeWebhooks failed:', sub.error);
        }
      } catch (e) {
        logger.warn('[whatsapp-meta] subscribeWebhooks threw:', e?.message || e);
      }

      // Refresh phone number metadata (quality rating, tier).
      try {
        const phone = await metaWhatsApp.getPhoneNumber({ businessId });
        if (phone.success && phone.data) {
          account.qualityRating = phone.data.quality_rating || account.qualityRating;
          account.messagingLimitTier = phone.data.messaging_limit_tier || account.messagingLimitTier;
          account.lastSyncAt = new Date();
          await account.save();
        }
      } catch (e) {
        logger.warn('[whatsapp-meta] getPhoneNumber after connect failed:', e?.message || e);
      }

      await logEvent({
        businessId,
        actorType: 'user',
        actorId: req.user._id,
        event: 'waba_connect',
        summary: `Connected WABA ${wabaId} (phone ${phoneE164 || phoneNumberId})`,
        metadata: { wabaId, phoneNumberId, mode: account.mode },
      });

      const compliance = await getComplianceState(businessId);
      return res.json({ success: true, data: publicAccountView(account.toObject(), compliance) });
    } catch (err) {
      logger.error('[whatsapp-meta] /connect/exchange failed:', err);
      return res.status(500).json({ success: false, error: 'Failed to connect WhatsApp account' });
    }
  }
);

router.post('/disconnect', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = req.user.branchId;
    const { Account } = await getMainModels();
    const account = await Account.findOneAndUpdate(
      { businessId },
      {
        $set: {
          accessTokenCipher: null,
          status: 'disconnected',
          disconnectedAt: new Date(),
        },
      },
      { new: true }
    );
    if (account) {
      await logEvent({
        businessId,
        actorType: 'user',
        actorId: req.user._id,
        event: 'waba_disconnect',
        summary: 'Disconnected WhatsApp account',
      });
    }
    const compliance = await getComplianceState(businessId);
    return res.json({ success: true, data: publicAccountView(account?.toObject(), compliance) });
  } catch (err) {
    logger.error('[whatsapp-meta] /disconnect failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to disconnect WhatsApp account' });
  }
});

router.post('/mode', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = req.user.branchId;
    const { mode, testRecipientWhitelist } = req.body || {};
    if (mode && !['test', 'live'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'mode must be test or live' });
    }
    const { Account } = await getMainModels();
    const update = {};
    if (mode) update.mode = mode;
    if (Array.isArray(testRecipientWhitelist)) {
      update.testRecipientWhitelist = testRecipientWhitelist
        .map((p) => String(p).trim())
        .filter(Boolean);
    }
    const account = await Account.findOneAndUpdate(
      { businessId },
      { $set: update },
      { new: true }
    );
    if (mode) {
      await logEvent({
        businessId,
        actorType: 'user',
        actorId: req.user._id,
        event: 'waba_mode_change',
        summary: `Mode changed to ${mode}`,
        metadata: { mode, whitelistSize: account?.testRecipientWhitelist?.length || 0 },
      });
    }
    return res.json({ success: true, data: publicAccountView(account?.toObject()) });
  } catch (err) {
    logger.error('[whatsapp-meta] /mode failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to update WhatsApp mode' });
  }
});

router.post(
  '/test-message',
  authenticateToken,
  requireManager,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      const { to, templateName = 'hello_world', language = 'en_US' } = req.body || {};
      if (!to) {
        return res.status(400).json({ success: false, error: 'recipient phone (to) is required' });
      }
      /**
       * Auto-heal: if the account was previously stamped `error` but the
       * token validates now (e.g. user re-pasted a fresh long-lived token),
       * flip status back to `connected` so the router actually picks Meta
       * again. Without this, every Test would fall through to MSG91 (or
       * be blocked) until the user manually disconnect-reconnects.
       */
      try {
        const { Account } = await getMainModels();
        const acct = await Account.findOne({ businessId }).select('_id status').lean();
        if (acct && acct.status !== 'connected') {
          const tokenCheck = await metaWhatsApp.validateToken({ businessId });
          if (tokenCheck.ok) {
            await Account.updateOne(
              { _id: acct._id },
              { $set: { status: 'connected' }, $unset: { lastErrorMessage: '' } }
            );
            logger.info(`[whatsapp-meta] auto-recovered account -> connected for ${businessId}`);
          }
        }
      } catch (recErr) {
        logger.warn(`[whatsapp-meta] test-message auto-heal failed: ${recErr?.message || recErr}`);
      }

      const result = await sendWhatsApp({
        businessId,
        intent: INTENTS.STAFF_ALERT,
        recipientPhone: String(to).replace(/\D/g, ''),
        templateName,
        language,
        components: [],
        actorId: req.user._id,
        actorType: 'user',
        bucketSeconds: 30,
        // Test endpoint targets Meta-managed templates (e.g. `hello_world`)
        // by default; bypass the local approval gate so an admin can also
        // probe a not-yet-approved local template if useful.
        allowUnapproved: true,
      });
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || 'Test send failed' });
      }
      return res.json({ success: true, data: { messageId: result.message?._id, deduped: result.deduped } });
    } catch (err) {
      logger.error('[whatsapp-meta] /test-message failed:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Test message failed' });
    }
  }
);

/** Lightweight refresh — pulls Meta phone metadata into the account row. */
router.post('/refresh', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = req.user.branchId;
    const phone = await metaWhatsApp.getPhoneNumber({ businessId });
    if (!phone.success) {
      return res.status(400).json({ success: false, error: phone.error });
    }
    const { Account } = await getMainModels();
    const account = await Account.findOneAndUpdate(
      { businessId },
      {
        $set: {
          qualityRating: phone.data.quality_rating || null,
          messagingLimitTier: phone.data.messaging_limit_tier || null,
          phoneE164: phone.data.display_phone_number || null,
          displayName: phone.data.verified_name || null,
          lastSyncAt: new Date(),
        },
      },
      { new: true }
    );
    return res.json({ success: true, data: publicAccountView(account?.toObject()) });
  } catch (err) {
    logger.error('[whatsapp-meta] /refresh failed:', err);
    return res.status(500).json({ success: false, error: 'Refresh failed' });
  }
});

/**
 * Tenant-facing read of just the public Meta config (appId, configId,
 * graphVersion, hasMetaConfig). The frontend Settings card calls this on
 * mount instead of reading from `process.env.NEXT_PUBLIC_META_*`, so secrets
 * never need to live in the browser bundle.
 */
router.get('/public-config', authenticateToken, async (req, res) => {
  try {
    const cfg = await getMetaConfig();
    return res.json({
      success: true,
      data: {
        appId: cfg.appId,
        configId: cfg.configId,
        graphVersion: cfg.graphVersion,
        hasMetaConfig: Boolean(cfg.appId && cfg.appSecret),
      },
    });
  } catch (err) {
    logger.error('[whatsapp-meta] /public-config failed:', err);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to load Meta public config' });
  }
});

/**
 * Manual / dev connect path.
 *
 * Some Meta workflows hand you an access token directly without going
 * through the Embedded Signup popup — most importantly the **API Setup**
 * page in the Meta App dashboard, which lets you generate a temporary
 * token for the free Meta-provided test number.
 *
 * Body:
 *  - accessToken (required): Meta-issued token to encrypt and store
 *  - wabaId (required)
 *  - phoneNumberId (required)
 *  - phoneE164 (optional)
 *  - displayName (optional)
 *  - mode (optional): 'test' | 'live' — defaults to 'test'
 */
router.post(
  '/connect/manual',
  authenticateToken,
  requireManager,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      if (!businessId) {
        return res
          .status(400)
          .json({ success: false, error: 'Business context missing' });
      }
      const {
        accessToken,
        wabaId,
        phoneNumberId,
        phoneE164,
        displayName,
        mode,
        expiresInSeconds,
      } = req.body || {};
      if (!accessToken || !wabaId || !phoneNumberId) {
        return res.status(400).json({
          success: false,
          error: 'accessToken, wabaId, phoneNumberId are required',
        });
      }

      const cipher = encrypt(String(accessToken).trim());
      const now = new Date();
      const expiresIn = Number(expiresInSeconds);
      const tokenExpiresAt =
        expiresIn > 0 ? new Date(now.getTime() + expiresIn * 1000) : null;

      const { Account } = await getMainModels();
      const account = await Account.findOneAndUpdate(
        { businessId },
        {
          $set: {
            wabaId: String(wabaId).trim(),
            phoneNumberId: String(phoneNumberId).trim(),
            phoneE164: phoneE164 ? String(phoneE164).trim() : null,
            displayName: displayName ? String(displayName).trim() : null,
            accessTokenCipher: cipher,
            tokenCreatedAt: now,
            tokenLastRotatedAt: now,
            tokenLastUsedAt: now,
            tokenExpiresAt,
            connectedAt: now,
            disconnectedAt: null,
            status: 'connected',
            mode: mode === 'live' ? 'live' : 'test',
            lastErrorMessage: null,
          },
          $inc: { tokenVersion: 1 },
          $setOnInsert: { businessId },
        },
        { new: true, upsert: true }
      );

      // Try to subscribe webhooks — fail soft.
      try {
        const sub = await metaWhatsApp.subscribeWebhooks({ businessId });
        if (sub.success) {
          account.webhookVerified = true;
          await account.save();
        }
      } catch (e) {
        logger.warn('[whatsapp-meta] manual subscribeWebhooks failed:', e?.message || e);
      }

      // Refresh phone metadata — fail soft.
      try {
        const phone = await metaWhatsApp.getPhoneNumber({ businessId });
        if (phone.success && phone.data) {
          account.qualityRating = phone.data.quality_rating || null;
          account.messagingLimitTier = phone.data.messaging_limit_tier || null;
          account.phoneE164 = phone.data.display_phone_number || account.phoneE164;
          account.displayName = phone.data.verified_name || account.displayName;
          account.lastSyncAt = new Date();
          await account.save();
        }
      } catch (e) {
        logger.warn('[whatsapp-meta] manual getPhoneNumber failed:', e?.message || e);
      }

      await logEvent({
        businessId,
        actorType: 'user',
        actorId: req.user._id,
        event: 'waba_connect',
        summary: `Manual connect: WABA ${wabaId} (phone ${phoneE164 || phoneNumberId})`,
        metadata: {
          wabaId,
          phoneNumberId,
          mode: account.mode,
          via: 'manual_token_paste',
        },
      });

      const compliance = await getComplianceState(businessId);
      return res.json({
        success: true,
        data: publicAccountView(account.toObject(), compliance),
      });
    } catch (err) {
      logger.error('[whatsapp-meta] /connect/manual failed:', err);
      return res
        .status(500)
        .json({ success: false, error: 'Failed to save WhatsApp credentials' });
    }
  }
);

router.get('/compliance', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const compliance = await getComplianceState(req.user.branchId);
    return res.json({ success: true, data: compliance });
  } catch (err) {
    logger.error('[whatsapp-meta] /compliance failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to evaluate compliance' });
  }
});

module.exports = router;
