/**
 * Daily WhatsApp token + metadata refresh.
 *
 * Schedule: every 24 hours via node-cron registered in `backend/server.js`.
 * For each connected WABA:
 *   1. Calls Meta debug_token to find expiry / scopes.
 *   2. Refreshes phone-number metadata (quality, tier).
 *   3. Stamps `tokenLastUsedAt`/`lastSyncAt`.
 *   4. Writes a `token_rotate` audit row when the token version changes.
 *   5. Marks accounts as `error` if Meta returns auth failures.
 */

'use strict';

const axios = require('axios');
const databaseManager = require('../config/database-manager');
const metaWhatsApp = require('../services/meta-whatsapp-service');
const { decrypt } = require('../lib/crypto');
const { logger } = require('../utils/logger');
const { logEvent } = require('../lib/whatsapp-audit');
const { getMetaConfig } = require('../lib/whatsapp-meta-config');

const WARN_DAYS = 7;

async function getModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema);
}

async function debugToken(accessToken) {
  const cfg = await getMetaConfig();
  if (!cfg.appId || !cfg.appSecret) return null;
  const appAccessToken = `${cfg.appId}|${cfg.appSecret}`;
  const base = `https://graph.facebook.com/${cfg.graphVersion || 'v23.0'}`;
  try {
    const { data } = await axios.get(`${base}/debug_token`, {
      params: { input_token: accessToken, access_token: appAccessToken },
      timeout: 10000,
    });
    return data?.data || null;
  } catch (err) {
    return { error: err?.response?.data || err?.message };
  }
}

async function rotateOnce() {
  const Account = await getModel();
  const accounts = await Account.find({ status: 'connected' });
  for (const account of accounts) {
    try {
      if (!account.accessTokenCipher) continue;
      let token;
      try {
        token = decrypt(account.accessTokenCipher);
      } catch (err) {
        account.status = 'error';
        account.lastErrorMessage = 'Token decrypt failed';
        await account.save();
        continue;
      }

      const debug = await debugToken(token);
      if (debug?.error) {
        account.status = 'error';
        account.lastErrorMessage = `debug_token failed: ${JSON.stringify(debug.error).slice(0, 400)}`;
        await account.save();
        continue;
      }
      if (debug) {
        if (debug.expires_at && debug.expires_at > 0) {
          account.tokenExpiresAt = new Date(debug.expires_at * 1000);
        }
        if (debug.is_valid === false) {
          account.status = 'error';
          account.lastErrorMessage = 'Meta reports token is invalid';
          await account.save();
          continue;
        }
      }

      const phone = await metaWhatsApp.getPhoneNumber({ businessId: account.businessId });
      if (phone.success && phone.data) {
        account.qualityRating = phone.data.quality_rating || account.qualityRating;
        account.messagingLimitTier = phone.data.messaging_limit_tier || account.messagingLimitTier;
        account.phoneE164 = phone.data.display_phone_number || account.phoneE164;
        account.displayName = phone.data.verified_name || account.displayName;
      }
      account.lastSyncAt = new Date();
      account.tokenLastUsedAt = new Date();
      account.lastErrorMessage = null;
      await account.save();

      // Warn if token is approaching expiry.
      if (account.tokenExpiresAt) {
        const msLeft = account.tokenExpiresAt.getTime() - Date.now();
        const daysLeft = msLeft / (1000 * 60 * 60 * 24);
        if (daysLeft < WARN_DAYS) {
          await logEvent({
            businessId: account.businessId,
            actorType: 'system',
            event: 'token_rotate',
            summary: `Token expires in ${Math.round(daysLeft)} days — rotation recommended`,
            metadata: { tokenExpiresAt: account.tokenExpiresAt },
          });
        }
      }
    } catch (err) {
      logger.warn('[whatsapp-token-rotation] account failed:', account?._id, err?.message || err);
    }
  }
}

function start({ intervalMs = 24 * 60 * 60 * 1000 } = {}) {
  if (process.env.WHATSAPP_TOKEN_ROTATION_DISABLED === '1') {
    logger.info('[whatsapp-token-rotation] disabled via env');
    return null;
  }
  // Run once shortly after startup, then every 24 hours.
  setTimeout(() => {
    rotateOnce().catch((err) => logger.error('[whatsapp-token-rotation] initial run failed:', err));
  }, 60 * 1000);
  return setInterval(() => {
    rotateOnce().catch((err) => logger.error('[whatsapp-token-rotation] periodic run failed:', err));
  }, intervalMs);
}

module.exports = { start, rotateOnce };
