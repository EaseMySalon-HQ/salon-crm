/**
 * Gupshup Partner Portal authentication + token caching.
 *
 * Three credentials (see .cursor/rules/gupshup-partner-integration.mdc §2):
 *   - Client Secret : login password (env or AdminSettings, encrypted at rest).
 *   - Partner Token : JWT from POST /partner/account/login, valid ~24h.
 *   - App Token     : from GET /partner/app/{appId}/token, idempotent + long-lived.
 *
 * Partner email/secret resolution: env first, then AdminSettings fallback.
 */

'use strict';

const axios = require('axios');
const databaseManager = require('../config/database-manager');
const { decrypt, encrypt } = require('./crypto');
const { logger } = require('../utils/logger');

const BASE_URL = (process.env.GUPSHUP_PARTNER_BASE_URL || 'https://partner.gupshup.io').replace(
  /\/+$/,
  ''
);

const PARTNER_TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
const APP_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

let partnerTokenCache = { token: null, fetchedAt: 0 };
const appTokenCache = new Map();

function partnerBaseUrl() {
  return BASE_URL;
}

function authHeader(token) {
  return { Authorization: token };
}

function hasEnvPartnerCredentials() {
  return Boolean(process.env.GUPSHUP_EMAIL && process.env.GUPSHUP_CLIENT_SECRET);
}

/** Env-only sync check (legacy). Prefer hasPartnerCredentialsAsync. */
function hasPartnerCredentials() {
  return hasEnvPartnerCredentials();
}

async function resolvePartnerCredentials() {
  const envEmail = String(process.env.GUPSHUP_EMAIL || '').trim();
  const envSecret = String(process.env.GUPSHUP_CLIENT_SECRET || '').trim();
  if (envEmail && envSecret) {
    return { email: envEmail, secret: envSecret, source: 'env' };
  }

  try {
    const main = await databaseManager.getMainConnection();
    const AdminSettings = main.model('AdminSettings', require('../models/AdminSettings').schema);
    const settings = await AdminSettings.getSettings();
    const wa = settings?.notifications?.whatsapp || {};
    const email = String(wa.gupshupPartnerEmail || '').trim();
    const cipher = String(wa.gupshupClientSecretCipher || '').trim();
    if (email && cipher) {
      const secret = decrypt(cipher);
      if (secret) return { email, secret, source: 'admin' };
    }
  } catch (err) {
    logger.warn('[gupshup-auth] admin partner creds load failed:', err?.message || err);
  }

  return null;
}

async function hasPartnerCredentialsAsync() {
  const creds = await resolvePartnerCredentials();
  return Boolean(creds?.email && creds?.secret);
}

async function login() {
  const creds = await resolvePartnerCredentials();
  if (!creds?.email || !creds?.secret) {
    throw new Error(
      'Gupshup partner credentials missing (set GUPSHUP_EMAIL and GUPSHUP_CLIENT_SECRET or save in Admin → Gupshup)'
    );
  }
  const url = `${BASE_URL}/partner/account/login`;
  const body = new URLSearchParams({
    email: creds.email,
    password: creds.secret,
    secret: creds.secret,
  });
  try {
    const { data } = await axios.post(url, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });
    const token = data?.token?.token || data?.token || null;
    if (!token || typeof token !== 'string') {
      throw new Error('Gupshup login response did not contain a token');
    }
    return token;
  } catch (err) {
    const status = err?.response?.status;
    const retryable = status === 429 || status === 500 || status === 502 || status === 503;
    if (retryable) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const { data } = await axios.post(url, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
        });
        const token = data?.token?.token || data?.token || null;
        if (token && typeof token === 'string') return token;
      } catch (retryErr) {
        err = retryErr;
      }
    }
    const message =
      err?.response?.data?.message || err?.response?.data?.error || err?.message || 'unknown error';
    logger.error(`[gupshup-auth] login failed (status=${status || 'n/a'}): ${message}`);
    const hint =
      status === 401 || status === 403
        ? 'Check partner email and client secret in Settings → API → Gupshup'
        : status === 429
          ? 'Gupshup login rate limit — wait a minute and retry'
          : 'Gupshup partner API error — retry in a few minutes';
    const wrapped = new Error(`Gupshup partner login failed: ${hint}`);
    wrapped.code = 'GUPSHUP_PARTNER_LOGIN_FAILED';
    wrapped.cause = message;
    throw wrapped;
  }
}

async function getPartnerToken({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (
    !forceRefresh &&
    partnerTokenCache.token &&
    now - partnerTokenCache.fetchedAt < PARTNER_TOKEN_TTL_MS
  ) {
    return partnerTokenCache.token;
  }
  try {
    const token = await login();
    partnerTokenCache = { token, fetchedAt: now };
    return token;
  } catch (err) {
    // If Gupshup login is temporarily down, keep using a recently cached partner token.
    const STALE_GRACE_MS = 25 * 60 * 60 * 1000;
    if (partnerTokenCache.token && now - partnerTokenCache.fetchedAt < STALE_GRACE_MS) {
      logger.warn('[gupshup-auth] partner login failed; using cached partner token');
      return partnerTokenCache.token;
    }
    throw err;
  }
}

async function getAppToken(appId, { forceRefresh = false } = {}) {
  if (!appId) throw new Error('getAppToken: appId is required');
  const now = Date.now();
  const cached = appTokenCache.get(appId);
  if (!forceRefresh && cached?.token && now - cached.fetchedAt < APP_TOKEN_TTL_MS) {
    return cached.token;
  }
  const partnerToken = await getPartnerToken({ forceRefresh });
  const url = `${BASE_URL}/partner/app/${encodeURIComponent(appId)}/token`;
  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: partnerToken, token: partnerToken },
      timeout: 15000,
    });
    const token = data?.token?.token || (typeof data?.token === 'string' ? data.token : null);
    if (!token) throw new Error('Gupshup app-token response did not contain a token');
    appTokenCache.set(appId, { token, fetchedAt: now });
    return token;
  } catch (err) {
    const status = err?.response?.status;
    if ((status === 401 || status === 403) && !forceRefresh) {
      return getAppToken(appId, { forceRefresh: true });
    }
    logger.error(
      `[gupshup-auth] getAppToken failed for app (status=${status || 'n/a'}): ${
        err?.response?.data?.message || err?.message
      }`
    );
    throw new Error('Could not obtain Gupshup app access token');
  }
}

async function withAppToken(appId, fn) {
  let token = await getAppToken(appId);
  try {
    return await fn(token);
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      token = await getAppToken(appId, { forceRefresh: true });
      return fn(token);
    }
    throw err;
  }
}

function invalidateCache(appId = null) {
  if (appId) {
    appTokenCache.delete(appId);
  } else {
    partnerTokenCache = { token: null, fetchedAt: 0 };
    appTokenCache.clear();
  }
}

/** Encrypt a client secret for AdminSettings storage. */
function encryptPartnerSecret(plainSecret) {
  return encrypt(String(plainSecret || '').trim());
}

module.exports = {
  partnerBaseUrl,
  authHeader,
  hasPartnerCredentials,
  hasPartnerCredentialsAsync,
  resolvePartnerCredentials,
  getPartnerToken,
  getAppToken,
  withAppToken,
  invalidateCache,
  encryptPartnerSecret,
};
