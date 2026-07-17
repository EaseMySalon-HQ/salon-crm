/**
 * Periodic Gupshup token + app health refresh.
 *
 * Replaces the Meta token-rotation job for the Gupshup provider. Schedule:
 * registered from backend/server.js when WHATSAPP_PROVIDER=gupshup.
 *
 * Each run:
 *   1. Warms the partner token cache (forces a refresh before the 24h expiry).
 *   2. For each connected per-salon Gupshup account, pulls health + ratings and
 *      stamps quality/tier + lastSyncAt (best-effort; never throws).
 *   3. Also refreshes the shared platform app so its token/health stay warm.
 *
 * App access tokens are effectively non-expiring on Gupshup, so we do not
 * rotate them — we only verify the app is still healthy.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const gupshupAuth = require('../lib/gupshup-auth');
const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const gupshupConfig = require('../lib/gupshup-config');
const { logger } = require('../utils/logger');

async function getModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema);
}

async function refreshAppHealth(appId, account = null) {
  try {
    const health = await gupshupWhatsApp.getWabaHealth({ appId });
    const ratings = await gupshupWhatsApp.getRatings({ appId });
    if (account) {
      const quality =
        ratings?.data?.ratings?.quality ||
        ratings?.data?.quality ||
        health?.data?.quality ||
        null;
      const tier =
        ratings?.data?.ratings?.limit ||
        ratings?.data?.messagingLimit ||
        health?.data?.messagingLimit ||
        null;
      if (quality) account.qualityRating = quality;
      if (tier) account.messagingLimitTier = String(tier);
      account.lastSyncAt = new Date();
      const healthy = health?.success !== false;
      if (!healthy) {
        account.status = 'error';
        account.lastErrorMessage = 'Gupshup app health check failed';
      } else if (account.status === 'error' && account.lastErrorMessage?.includes('health check')) {
        account.status = 'connected';
        account.lastErrorMessage = null;
      }
      await account.save();
    }
    return true;
  } catch (err) {
    logger.warn('[gupshup-token-refresh] app health refresh failed:', err?.message || err);
    return false;
  }
}

async function refreshOnce() {
  if (!(await gupshupAuth.hasPartnerCredentialsAsync())) {
    logger.debug('[gupshup-token-refresh] partner credentials not set; skipping');
    return;
  }
  try {
    await gupshupAuth.getPartnerToken({ forceRefresh: true });
  } catch (err) {
    logger.warn('[gupshup-token-refresh] partner token refresh failed:', err?.message || err);
    return;
  }

  // Shared platform app (fallback sender).
  const platform = gupshupConfig.platformConfig();
  if (platform.appId) {
    await refreshAppHealth(platform.appId, null);
  }

  // Per-salon connected apps.
  const Account = await getModel();
  const accounts = await Account.find({ provider: 'gupshup', status: 'connected', gupshupAppId: { $ne: null } });
  for (const account of accounts) {
    await refreshAppHealth(account.gupshupAppId, account);
  }
}

function start({ intervalMs = 12 * 60 * 60 * 1000 } = {}) {
  if (process.env.GUPSHUP_TOKEN_REFRESH_DISABLED === '1') {
    logger.info('[gupshup-token-refresh] disabled via env');
    return null;
  }
  setTimeout(() => {
    refreshOnce().catch((err) => logger.error('[gupshup-token-refresh] initial run failed:', err));
  }, 60 * 1000);
  return setInterval(() => {
    refreshOnce().catch((err) => logger.error('[gupshup-token-refresh] periodic run failed:', err));
  }, intervalMs);
}

module.exports = { start, refreshOnce, refreshAppHealth };
