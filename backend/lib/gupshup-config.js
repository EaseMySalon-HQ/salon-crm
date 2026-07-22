/**
 * Gupshup sender resolution.
 *
 * Hybrid model:
 *   1. Connected salon Gupshup app → send from that app.
 *   2. Else shared platform app (env GUPSHUP_PLATFORM_* or AdminSettings fallback).
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { decrypt, encrypt } = require('./crypto');
const gupshupAuth = require('./gupshup-auth');
const { logger } = require('../utils/logger');

async function getAdminSettingsModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('AdminSettings', require('../models/AdminSettings').schema);
}

async function loadStoredPlatformAppToken(expectedAppId) {
  if (!expectedAppId) return null;
  try {
    const AdminSettings = await getAdminSettingsModel();
    const settings = await AdminSettings.getSettings();
    const wa = settings?.notifications?.whatsapp || {};
    if (String(wa.gupshupAppId || '').trim() !== String(expectedAppId).trim()) return null;
    const cipher = String(wa.gupshupAppTokenCipher || '').trim();
    if (!cipher) return null;
    return decrypt(cipher);
  } catch (err) {
    logger.warn('[gupshup-config] platform app token decrypt failed:', err?.message);
    return null;
  }
}

async function persistPlatformAppToken(appId, appToken) {
  if (!appId || !appToken) return;
  try {
    const AdminSettings = await getAdminSettingsModel();
    const settings = await AdminSettings.getSettings();
    settings.notifications = settings.notifications || {};
    settings.notifications.whatsapp = settings.notifications.whatsapp || {};
    const wa = settings.notifications.whatsapp;
    if (String(wa.gupshupAppId || '').trim() !== String(appId).trim()) return;
    wa.gupshupAppTokenCipher = encrypt(String(appToken));
    await settings.save();
  } catch (err) {
    logger.warn('[gupshup-config] platform app token persist failed:', err?.message);
  }
}

async function loadAccount(businessId) {
  const main = await databaseManager.getMainConnection();
  const Account = main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema);
  return Account.findOne({ businessId }).lean();
}

/** Env-only platform config (sync; used for admin display). */
function platformConfig() {
  return {
    appId: process.env.GUPSHUP_PLATFORM_APP_ID || null,
    appName: process.env.GUPSHUP_PLATFORM_APP_NAME || null,
    source: process.env.GUPSHUP_PLATFORM_SOURCE_NUMBER || null,
  };
}

/**
 * Resolved platform config: env first, then AdminSettings.notifications.whatsapp
 * (gupshupAppId / gupshupSourceNumber) for deployments without env vars.
 */
async function loadPlatformConfig() {
  const envCfg = platformConfig();
  if (envCfg.appId && envCfg.source) return envCfg;

  try {
    const main = await databaseManager.getMainConnection();
    const AdminSettings = main.model('AdminSettings', require('../models/AdminSettings').schema);
    const settings = await AdminSettings.getSettings();
    const wa = settings?.notifications?.whatsapp || {};
    const appId = wa.gupshupAppId ? String(wa.gupshupAppId).trim() : '';
    const source = wa.gupshupSourceNumber ? String(wa.gupshupSourceNumber).replace(/\D/g, '') : '';
    if (appId && source) {
      return {
        appId,
        appName: wa.gupshupAppName ? String(wa.gupshupAppName).trim() : null,
        source,
      };
    }
  } catch (err) {
    logger.warn('[gupshup-config] admin platform config load failed:', err?.message || err);
  }

  return envCfg;
}

function isPlatformConfigured() {
  const cfg = platformConfig();
  return Boolean(cfg.appId && cfg.source);
}

async function isPlatformConfiguredAsync() {
  const cfg = await loadPlatformConfig();
  return Boolean(cfg.appId && cfg.source);
}

function isBusinessAppUsable(account) {
  return Boolean(
    account &&
      account.provider === 'gupshup' &&
      account.status === 'connected' &&
      account.gupshupAppId &&
      (account.sourceNumber || account.phoneE164)
  );
}

async function resolvePlatformSender({ forceRefresh = false } = {}) {
  const cfg = await loadPlatformConfig();
  if (!cfg.appId || !cfg.source) {
    throw new Error(
      'Gupshup platform app not configured (set GUPSHUP_PLATFORM_* env or Admin → Gupshup shared app)'
    );
  }
  // Always resolve via Partner API (in-memory cache). AdminSettings-stored tokens
  // can go stale while still decrypting successfully — Gupshup then returns opaque
  // HTTP 400 on template/msg instead of 401.
  const appToken = await gupshupAuth.getAppToken(cfg.appId, { forceRefresh });
  await persistPlatformAppToken(cfg.appId, appToken);
  return {
    scope: 'platform',
    appId: cfg.appId,
    appName: cfg.appName,
    source: cfg.source,
    appToken,
  };
}

async function resolveBusinessAppToken(account) {
  return gupshupAuth.getAppToken(account.gupshupAppId);
}

function businessSenderFromAccount(account) {
  return {
    scope: 'business',
    appId: account.gupshupAppId,
    appName: account.gupshupAppName || null,
    source: account.sourceNumber || account.phoneE164 || null,
  };
}

const TENANT_APP_REQUIRED_MSG =
  'Connect your Gupshup WhatsApp app under Settings → WhatsApp Integration before using WhatsApp Inbox or submitting templates.';

/**
 * Resolve sender from the tenant's connected Gupshup app only (no platform fallback).
 */
async function resolveBusinessSender(businessId) {
  const account = await loadAccount(businessId);
  if (!isBusinessAppUsable(account)) {
    const err = new Error(TENANT_APP_REQUIRED_MSG);
    err.code = 'WHATSAPP_APP_NOT_CONNECTED';
    throw err;
  }
  const appToken = await resolveBusinessAppToken(account);
  return { ...businessSenderFromAccount(account), appToken };
}

async function resolveSender(businessId) {
  let account = null;
  try {
    account = await loadAccount(businessId);
  } catch (err) {
    logger.warn('[gupshup-config] account lookup failed, using platform sender:', err?.message);
  }

  if (isBusinessAppUsable(account)) {
    const appToken = await resolveBusinessAppToken(account);
    return { ...businessSenderFromAccount(account), appToken };
  }

  return resolvePlatformSender();
}

module.exports = {
  platformConfig,
  loadPlatformConfig,
  isPlatformConfigured,
  isPlatformConfiguredAsync,
  persistPlatformAppToken,
  isBusinessAppUsable,
  TENANT_APP_REQUIRED_MSG,
  resolvePlatformSender,
  resolveBusinessSender,
  resolveSender,
  loadAccount,
};
