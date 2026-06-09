/**
 * Meta Cloud API client used by the new WhatsApp Business module.
 *
 * Looks up the per-business WABA via `WhatsAppAccount`, decrypts the access
 * token only at use time, and never logs the plaintext.
 */

'use strict';

const axios = require('axios');
const databaseManager = require('../config/database-manager');
const { decrypt } = require('../lib/crypto');
const { logger } = require('../utils/logger');
const { getMetaConfig } = require('../lib/whatsapp-meta-config');

// v23.0 is the current production Graph API version (per Meta business
// messaging OpenAPI spec). Override via META_GRAPH_VERSION when needed.
// Kept as a module-level fallback so calls that don't await the config helper
// still get a sensible default; the helper's value is preferred where used.
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function getAccountModel() {
  const mainConnection = await databaseManager.getMainConnection();
  return mainConnection.model(
    'WhatsAppAccount',
    require('../models/WhatsAppAccount').schema
  );
}

async function getAccount(businessId) {
  const Account = await getAccountModel();
  const account = await Account.findOne({ businessId });
  if (!account) {
    throw new Error('WhatsApp account not connected for this business');
  }
  if (account.status !== 'connected') {
    throw new Error(`WhatsApp account is in status: ${account.status}`);
  }
  return account;
}

async function decryptToken(account) {
  if (!account?.accessTokenCipher) {
    throw new Error('WhatsApp access token missing for business');
  }
  let token;
  try {
    token = decrypt(account.accessTokenCipher);
  } catch (err) {
    logger.error('[meta-whatsapp] token decrypt failed:', err?.message || err);
    throw new Error('Failed to decrypt WhatsApp access token');
  }
  // bump tokenLastUsedAt opportunistically, do not block on failure
  account.tokenLastUsedAt = new Date();
  account.save().catch((e) => logger.warn('[meta-whatsapp] tokenLastUsedAt update failed:', e?.message));
  return token;
}

/**
 * Map thrown pre-flight errors (account missing / wrong status / decrypt) to a
 * stable API payload so routes never 500 when Meta was never called.
 */
function accountUnavailablePayload(err) {
  const m = err?.message || String(err);
  if (m.includes('WhatsApp account not connected')) {
    return {
      code: 'WABA_ACCOUNT_MISSING',
      error:
        'WhatsApp is not connected for this business. Open Settings → WhatsApp Integration to connect your Meta account.',
    };
  }
  if (m.includes('WhatsApp account is in status:')) {
    return {
      code: 'WABA_ACCOUNT_NOT_CONNECTED',
      error:
        'WhatsApp is not in a connected state (disconnected, error, or token issue). Open Settings → WhatsApp Integration to reconnect or refresh the token, then try again.',
    };
  }
  if (m.includes('decrypt') || m.includes('access token missing')) {
    return {
      code: 'WABA_TOKEN_UNAVAILABLE',
      error:
        'Could not use the stored WhatsApp credentials. Reconnect under Settings → WhatsApp Integration.',
    };
  }
  return { code: 'WABA_ACCOUNT_UNAVAILABLE', error: m };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** Send a Meta-approved template. */
async function sendTemplate({ businessId, to, templateName, language = 'en_US', components = [] }) {
  const account = await getAccount(businessId);
  const token = await decryptToken(account);
  const url = `${GRAPH_BASE}/${account.phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components,
    },
  };
  try {
    const { data } = await axios.post(url, payload, { headers: authHeaders(token), timeout: 15000 });
    return { success: true, data };
  } catch (err) {
    const errData = err.response?.data || err.message;
    logger.error('[meta-whatsapp] sendTemplate failed:', errData);
    return { success: false, error: errData };
  }
}

/** Send a free-form text message (only valid inside an open CSW). */
async function sendText({ businessId, to, body, previewUrl = false }) {
  const account = await getAccount(businessId);
  const token = await decryptToken(account);
  const url = `${GRAPH_BASE}/${account.phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body, preview_url: previewUrl },
  };
  try {
    const { data } = await axios.post(url, payload, { headers: authHeaders(token), timeout: 15000 });
    return { success: true, data };
  } catch (err) {
    const errData = err.response?.data || err.message;
    logger.error('[meta-whatsapp] sendText failed:', errData);
    return { success: false, error: errData };
  }
}

/** Mark an inbound message as read (best-effort). */
async function markRead({ businessId, metaMessageId }) {
  try {
    const account = await getAccount(businessId);
    const token = await decryptToken(account);
    const url = `${GRAPH_BASE}/${account.phoneNumberId}/messages`;
    await axios.post(
      url,
      { messaging_product: 'whatsapp', status: 'read', message_id: metaMessageId },
      { headers: authHeaders(token), timeout: 8000 }
    );
    return { success: true };
  } catch (err) {
    logger.warn('[meta-whatsapp] markRead failed:', err?.response?.data || err.message);
    return { success: false };
  }
}

/** GET phone number details (refreshes quality / messaging tier). */
async function getPhoneNumber({ businessId }) {
  const account = await getAccount(businessId);
  const token = await decryptToken(account);
  const url = `${GRAPH_BASE}/${account.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`;
  try {
    const { data } = await axios.get(url, { headers: authHeaders(token), timeout: 10000 });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
}

async function getWaba({ businessId }) {
  const account = await getAccount(businessId);
  const token = await decryptToken(account);
  const url = `${GRAPH_BASE}/${account.wabaId}?fields=name,timezone_id,message_template_namespace,on_behalf_of_business_info`;
  try {
    const { data } = await axios.get(url, { headers: authHeaders(token), timeout: 10000 });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
}

/** List all templates available on this WABA. */
async function listTemplates({ businessId, limit = 100 }) {
  const account = await getAccount(businessId);
  const token = await decryptToken(account);
  const url = `${GRAPH_BASE}/${account.wabaId}/message_templates?limit=${limit}&fields=id,name,status,category,previous_category,language,components,quality_score,rejected_reason`;
  try {
    const { data } = await axios.get(url, { headers: authHeaders(token), timeout: 15000 });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
}

/** Submit a new template for Meta review. */
async function submitTemplate({ businessId, name, language, category, components }) {
  let account;
  let token;
  try {
    account = await getAccount(businessId);
    token = await decryptToken(account);
  } catch (err) {
    logger.warn('[meta-whatsapp] submitTemplate account preflight failed:', err?.message || err);
    return { success: false, ...accountUnavailablePayload(err) };
  }
  const url = `${GRAPH_BASE}/${account.wabaId}/message_templates`;
  try {
    const { data } = await axios.post(
      url,
      { name, language, category, components },
      { headers: authHeaders(token), timeout: 20000 }
    );
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
}

/** Fetch a single template (used by the sync job). */
async function getTemplate({ businessId, metaTemplateId }) {
  const account = await getAccount(businessId);
  const token = await decryptToken(account);
  const url = `${GRAPH_BASE}/${metaTemplateId}?fields=id,name,status,category,previous_category,language,components,quality_score,rejected_reason`;
  try {
    const { data } = await axios.get(url, { headers: authHeaders(token), timeout: 10000 });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Delete a template from Meta. Meta accepts either a `name` (deletes ALL
 * languages) or `hsm_id` (deletes a specific language variant). Pass
 * `metaTemplateId` to delete only the specific language, otherwise the
 * `name`-based delete removes every language under that name.
 */
async function deleteTemplate({ businessId, name, metaTemplateId }) {
  if (!name && !metaTemplateId) {
    return { success: false, error: 'name or metaTemplateId required' };
  }
  const account = await getAccount(businessId);
  const token = await decryptToken(account);
  const url = `${GRAPH_BASE}/${account.wabaId}/message_templates`;
  const params = metaTemplateId ? { hsm_id: metaTemplateId, name } : { name };
  try {
    const { data } = await axios.delete(url, {
      headers: authHeaders(token),
      params,
      timeout: 15000,
    });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Subscribe the app to receive webhook callbacks for this WABA.
 * Required after Embedded Signup completes.
 */
async function subscribeWebhooks({ businessId }) {
  const account = await getAccount(businessId);
  const token = await decryptToken(account);
  const url = `${GRAPH_BASE}/${account.wabaId}/subscribed_apps`;
  try {
    const { data } = await axios.post(url, {}, { headers: authHeaders(token), timeout: 10000 });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Cheap Meta-side check: does the access token currently bind to the
 * configured app, is it still valid, and (when `phoneNumberId` is given) can
 * we actually GET the phone number resource? Returns a structured outcome:
 *
 *   { ok: true,  scopes: string[], expiresAt: number|null }
 *   { ok: false, code, subcode, message, retryable }
 *
 * Called as a pre-flight on campaign send so we don't fan-out 50+ doomed
 * sends when the salon's token has died. This is a HEAD-of-request check
 * — never throws; always resolves.
 */
async function validateToken({ businessId, phoneNumberId } = {}) {
  /**
   * Bypass `getAccount()`'s status guard here on purpose: we want this
   * helper usable as a *recovery* check too. If the account is currently
   * stamped `error` (e.g. an earlier auth failure flipped it), we still
   * need to be able to verify the token and — when it's actually valid —
   * let the caller flip status back to `connected`. Read the doc directly.
   */
  const Account = await getAccountModel();
  const account = await Account.findOne({ businessId });
  if (!account) {
    return { ok: false, code: 'NOT_CONNECTED', message: 'WhatsApp account not connected for this business' };
  }
  let token;
  try {
    token = await decryptToken(account);
  } catch (err) {
    return { ok: false, code: 'TOKEN_DECRYPT_FAILED', message: err?.message || 'Decrypt failed' };
  }
  const cfg = await getMetaConfig();
  if (!cfg.appId || !cfg.appSecret) {
    return { ok: false, code: 'NO_APP_CREDENTIALS', message: 'Meta app credentials not configured' };
  }
  const base = `https://graph.facebook.com/${cfg.graphVersion || GRAPH_VERSION}`;
  const appAccess = `${cfg.appId}|${cfg.appSecret}`;
  try {
    const { data } = await axios.get(`${base}/debug_token`, {
      params: { input_token: token, access_token: appAccess },
      timeout: 8000,
    });
    const info = data?.data || {};
    if (info.is_valid) {
      return {
        ok: true,
        scopes: Array.isArray(info.scopes) ? info.scopes : [],
        expiresAt: info.expires_at || null,
        type: info.type || null,
      };
    }
    const meta = info.error || {};
    return {
      ok: false,
      code: 'TOKEN_INVALID',
      subcode: meta.subcode || null,
      message: meta.message || 'Access token is not valid',
      retryable: false,
    };
  } catch (err) {
    const m = err?.response?.data?.error;
    return {
      ok: false,
      code: 'TOKEN_CHECK_FAILED',
      subcode: m?.error_subcode || null,
      message: m?.message || err?.message || 'Token validation request failed',
      retryable: true,
    };
  }
  // Reachable only if the network/Meta itself rejected — no token-specific code.
}

/**
 * Exchange the short-lived code Meta returns from Embedded Signup for a
 * long-lived business-system-user token.
 */
async function exchangeCodeForToken({ code, redirectUri }) {
  const cfg = await getMetaConfig();
  if (!cfg.appId || !cfg.appSecret) {
    return {
      success: false,
      error:
        'Meta app credentials not configured. Set them in Admin → Settings → API & Integration → WhatsApp.',
    };
  }
  const base = `https://graph.facebook.com/${cfg.graphVersion || GRAPH_VERSION}`;
  const url = `${base}/oauth/access_token`;
  const params = {
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    code,
  };
  if (redirectUri) params.redirect_uri = redirectUri;
  try {
    const { data } = await axios.get(url, { params, timeout: 15000 });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
}

module.exports = {
  GRAPH_BASE,
  sendTemplate,
  sendText,
  markRead,
  getPhoneNumber,
  getWaba,
  listTemplates,
  submitTemplate,
  getTemplate,
  deleteTemplate,
  subscribeWebhooks,
  exchangeCodeForToken,
  validateToken,
};
