/**
 * Gupshup Partner Portal WhatsApp client.
 *
 * Mirrors meta-whatsapp-service.js: resolves the per-business (or shared
 * platform) sender, attaches the cached app token, calls Gupshup, and never
 * logs plaintext tokens. Session vs template send shapes differ (see
 * .cursor/rules/gupshup-partner-integration.mdc §6):
 *   - session (free-form, inside 24h window): POST /v3/message  (JSON, Meta-shaped)
 *   - template (outside window):              POST /template/msg (form-urlencoded)
 *
 * Outbound send helpers return { success, data, messageId, error } so the
 * unified pipeline can persist a provider message id uniformly.
 */

'use strict';

const axios = require('axios');
const gupshupAuth = require('../lib/gupshup-auth');
const gupshupConfig = require('../lib/gupshup-config');
const { logger } = require('../utils/logger');

const BASE_URL = gupshupAuth.partnerBaseUrl();

function appBase(appId) {
  return `${BASE_URL}/partner/app/${encodeURIComponent(appId)}`;
}

/** Authorization headers — Gupshup accepts Authorization; some specs also list `token`. */
function appAuthHeaders(token, contentType = 'application/json') {
  return { Authorization: token, token, 'Content-Type': contentType };
}

function jsonHeaders(token) {
  return appAuthHeaders(token, 'application/json');
}

function formHeaders(token) {
  return appAuthHeaders(token, 'application/x-www-form-urlencoded');
}

/** Extract a provider message id from any Gupshup send response shape. */
function extractMessageId(data) {
  return (
    data?.messages?.[0]?.id ||
    data?.messageId ||
    data?.message?.id ||
    data?.id ||
    null
  );
}

/** Resolve sender for outbound send — tenant app only when requireBusinessSender is set. */
async function resolveSendSender(businessId, { requireBusinessSender = false } = {}) {
  if (requireBusinessSender) {
    return gupshupConfig.resolveBusinessSender(businessId);
  }
  return gupshupConfig.resolveSender(businessId);
}

/**
 * Send a session (free-form) text message. Only valid inside an open 24h
 * customer service window — the pipeline enforces that before calling.
 */
async function sendText({ businessId, to, body, previewUrl = false, requireBusinessSender = false }) {
  let sender;
  try {
    sender = await resolveSendSender(businessId, { requireBusinessSender });
  } catch (err) {
    logger.warn('[gupshup] sendText sender resolve failed:', err?.message);
    const detail = err?.cause ? `${err.message} (${err.cause})` : err?.message;
    return {
      success: false,
      error: detail || 'sender unavailable',
      code: err?.code || 'GUPSHUP_SENDER_UNAVAILABLE',
    };
  }
  const url = `${appBase(sender.appId)}/v3/message`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: body || '', preview_url: Boolean(previewUrl) },
  };
  try {
    const { data } = await axios.post(url, payload, {
      headers: jsonHeaders(sender.appToken),
      timeout: 15000,
    });
    return { success: true, data, messageId: extractMessageId(data) };
  } catch (err) {
    const status = err?.response?.status;
    if ((status === 401 || status === 403)) {
      // Refresh token once and retry.
      try {
        const token = await gupshupAuth.getAppToken(sender.appId, { forceRefresh: true });
        if (sender.scope === 'platform') {
          await gupshupConfig.persistPlatformAppToken(sender.appId, token);
        }
        const { data } = await axios.post(url, payload, { headers: jsonHeaders(token), timeout: 15000 });
        return { success: true, data, messageId: extractMessageId(data) };
      } catch (retryErr) {
        return failure('sendText', retryErr);
      }
    }
    return failure('sendText', err);
  }
}

/**
 * Send an approved template by Gupshup template id.
 * @param {object} args
 * @param {string} args.businessId
 * @param {string} args.to             destination (country-code prefixed, no '+')
 * @param {string} args.templateId     Gupshup template id
 * @param {string[]} [args.params]     ordered params matching {{1}},{{2}},...
 * @param {object} [args.message]      media/carousel header payload (optional)
 * @param {Array}  [args.postbackTexts] quick-reply postbacks (optional)
 */
async function sendTemplate({
  businessId,
  to,
  templateId,
  params = [],
  message = null,
  postbackTexts = null,
  requireBusinessSender = false,
}) {
  let sender;
  try {
    sender = await resolveSendSender(businessId, { requireBusinessSender });
  } catch (err) {
    logger.warn('[gupshup] sendTemplate sender resolve failed:', err?.message);
    const detail = err?.cause ? `${err.message} (${err.cause})` : err?.message;
    return {
      success: false,
      error: detail || 'sender unavailable',
      code: err?.code || 'GUPSHUP_SENDER_UNAVAILABLE',
    };
  }
  if (!templateId) {
    return { success: false, error: 'Gupshup templateId is required', code: 'GUPSHUP_TEMPLATE_MISSING' };
  }
  if (!sender.source) {
    return { success: false, error: 'Gupshup sender number not configured', code: 'GUPSHUP_SOURCE_MISSING' };
  }
  const url = `${appBase(sender.appId)}/template/msg`;

  const buildForm = () => {
    const form = new URLSearchParams();
    form.set('source', sender.source);
    if (sender.appName) form.set('src.name', sender.appName);
    form.set('destination', to);
    form.set('template', JSON.stringify({ id: templateId, params: (params || []).map((p) => String(p ?? '')) }));
    form.set('channel', 'whatsapp');
    // Gupshup text-template send expects a `message` JSON envelope (Partner docs).
    form.set(
      'message',
      JSON.stringify(
        message || {
          type: 'text',
          text: '',
        }
      )
    );
    if (Array.isArray(postbackTexts) && postbackTexts.length) {
      form.set('postbackTexts', JSON.stringify(postbackTexts));
    }
    return form.toString();
  };

  try {
    const { data } = await axios.post(url, buildForm(), {
      headers: formHeaders(sender.appToken),
      timeout: 15000,
    });
    // Gupshup returns {status:'submitted', messageId}; treat non-error as success.
    if (data?.status === 'error') {
      return { success: false, error: data, code: 'GUPSHUP_SEND_ERROR' };
    }
    return { success: true, data, messageId: extractMessageId(data) };
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      try {
        const token = await gupshupAuth.getAppToken(sender.appId, { forceRefresh: true });
        if (sender.scope === 'platform') {
          await gupshupConfig.persistPlatformAppToken(sender.appId, token);
        }
        const { data } = await axios.post(url, buildForm(), { headers: formHeaders(token), timeout: 15000 });
        if (data?.status === 'error') return { success: false, error: data, code: 'GUPSHUP_SEND_ERROR' };
        return { success: true, data, messageId: extractMessageId(data) };
      } catch (retryErr) {
        return failure('sendTemplate', retryErr);
      }
    }
    return failure('sendTemplate', err);
  }
}

// --------------------------------------------------------------------------
// App management (admin/onboarding + template sync). These target a specific
// appId and use withAppToken for automatic auth recovery.
// --------------------------------------------------------------------------

/** List templates for an app (+ status, rejection reason, correctCategory). */
async function listTemplates({ appId }) {
  try {
    const data = await gupshupAuth.withAppToken(appId, async (token) => {
      const { data } = await axios.get(`${appBase(appId)}/templates`, {
        headers: { Authorization: token },
        timeout: 15000,
      });
      return data;
    });
    return { success: true, data };
  } catch (err) {
    return failure('listTemplates', err);
  }
}

/** Fetch a single template by id. */
async function getTemplate({ appId, templateId }) {
  try {
    const data = await gupshupAuth.withAppToken(appId, async (token) => {
      const { data } = await axios.get(`${appBase(appId)}/templates/${encodeURIComponent(templateId)}`, {
        headers: { Authorization: token },
        timeout: 15000,
      });
      return data;
    });
    return { success: true, data };
  } catch (err) {
    return failure('getTemplate', err);
  }
}

/**
 * Apply for (create) a template. `fields` is a form-encoded body per Gupshup
 * (elementName, languageCode, category, templateType, content, example,
 * exampleHeader, enableSample, allowTemplateCategoryChange, exampleMedia...).
 */
async function applyTemplate({ appId, fields }) {
  try {
    const data = await gupshupAuth.withAppToken(appId, async (token) => {
      const form = new URLSearchParams();
      Object.entries(fields || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null) form.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      });
      const { data } = await axios.post(`${appBase(appId)}/templates`, form.toString(), {
        headers: formHeaders(token),
        timeout: 20000,
      });
      return data;
    });
    if (data?.status === 'error') return { success: false, error: data };
    return { success: true, data };
  } catch (err) {
    return failure('applyTemplate', err);
  }
}

/**
 * Set the webhook subscription for an app (rate limit 5/60s/app).
 * @param {object} args
 * @param {string} args.appId
 * @param {string} args.url    public webhook URL
 * @param {string} [args.modes] comma set or 'ALL'
 * @param {string} args.tag    unique per app
 * @param {string} [args.secret] shared secret mirrored back as request header
 */
async function setSubscription({ appId, url, modes = 'ALL', tag, secret }) {
  const postOnce = async () =>
    gupshupAuth.withAppToken(appId, async (token) => {
      const form = new URLSearchParams();
      form.set('modes', modes);
      form.set('tag', tag || `salon-crm-${appId}`);
      form.set('url', url);
      form.set('version', '3');
      if (secret) {
        form.set('meta', JSON.stringify({ headers: { Authorization: `Bearer ${secret}` } }));
      }
      const { data } = await axios.post(`${appBase(appId)}/subscription`, form.toString(), {
        headers: formHeaders(token),
        timeout: 15000,
      });
      return data;
    });

  try {
    let data = await postOnce();
    if (data?.status === 'error') {
      const msg = String(data?.message || data?.error || '').toLowerCase();
      if (msg.includes('too many') || msg.includes('rate limit')) {
        logger.warn('[gupshup] setSubscription rate limited; retrying once after 15s');
        await sleep(15000);
        data = await postOnce();
      }
    }
    if (data?.status === 'error') return { success: false, error: data };
    return { success: true, data };
  } catch (err) {
    const status = err?.response?.status;
    if (status === 429) {
      logger.warn('[gupshup] setSubscription HTTP 429; retrying once after 15s');
      try {
        await sleep(15000);
        const data = await postOnce();
        if (data?.status === 'error') return { success: false, error: data, status: 429 };
        return { success: true, data };
      } catch (retryErr) {
        return failure('setSubscription', retryErr);
      }
    }
    return failure('setSubscription', err);
  }
}

/**
 * Register webhook if needed — updates existing subscription when tag/URL changed.
 */
async function ensureSubscription({ appId, url, modes = 'ALL', tag, secret }) {
  const resolvedTag = tag || `salon-crm-${appId}`;

  const listed = await listSubscriptions({ appId });
  if (listed.success) {
    const existingForUrl = findActiveSubscriptionForUrl(listed.data, url);
    if (existingForUrl) {
      return { success: true, data: existingForUrl, alreadyRegistered: true };
    }

    const existingForTag = findSubscriptionByTag(listed.data, resolvedTag);
    if (existingForTag?.id) {
      const updated = await updateSubscription({
        appId,
        subscriptionId: existingForTag.id,
        url,
        modes,
        tag: resolvedTag,
        secret,
      });
      if (updated.success) {
        return { success: true, data: updated.data, updated: true, alreadyRegistered: false };
      }
      return {
        ...updated,
        error: subscriptionErrorMessage(updated.error, updated.status),
      };
    }
  } else if (listed.status === 429) {
    return {
      success: false,
      error: subscriptionErrorMessage(listed.error, 429),
      status: 429,
    };
  }

  const sub = await setSubscription({ appId, url, modes, tag: resolvedTag, secret });
  if (!sub.success) {
    const errText = String(
      typeof sub.error === 'string' ? sub.error : sub.error?.message || sub.error?.error || ''
    ).toLowerCase();
    if (errText.includes('duplicate') && errText.includes('tag')) {
      const retryList = await listSubscriptions({ appId });
      const existingForTag = retryList.success
        ? findSubscriptionByTag(retryList.data, resolvedTag)
        : null;
      if (existingForTag?.id) {
        const updated = await updateSubscription({
          appId,
          subscriptionId: existingForTag.id,
          url,
          modes,
          tag: resolvedTag,
          secret,
        });
        if (updated.success) {
          return { success: true, data: updated.data, updated: true, alreadyRegistered: false };
        }
      }
    }
    return {
      ...sub,
      error: subscriptionErrorMessage(sub.error, sub.status),
    };
  }
  return { ...sub, alreadyRegistered: false };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload media (by URL) → returns a handle/media id usable in template/media
 * headers. File uploads use the same endpoint with multipart; URL is enough
 * for our sample-media + outbound media header needs.
 */
async function uploadMedia({ appId, url, fileType }) {
  try {
    const data = await gupshupAuth.withAppToken(appId, async (token) => {
      const form = new URLSearchParams();
      form.set('url', url);
      if (fileType) form.set('file_type', fileType);
      const { data } = await axios.post(`${appBase(appId)}/media`, form.toString(), {
        headers: formHeaders(token),
        timeout: 20000,
      });
      return data;
    });
    return { success: true, data };
  } catch (err) {
    return failure('uploadMedia', err);
  }
}

/** List all apps linked to the partner account (admin app picker). */
async function listPartnerApps() {
  try {
    const token = await gupshupAuth.getPartnerToken();
    const { data } = await axios.get(`${BASE_URL}/partner/account/api/partnerApps`, {
      headers: { Authorization: token },
      timeout: 15000,
    });
    return { success: true, data };
  } catch (err) {
    return failure('listPartnerApps', err);
  }
}

/** App health (used to validate an admin-linked app). */
async function getWabaHealth({ appId }) {
  try {
    const data = await gupshupAuth.withAppToken(appId, async (token) => {
      const { data } = await axios.get(`${appBase(appId)}/health`, {
        headers: { Authorization: token },
        timeout: 10000,
      });
      return data;
    });
    return { success: true, data };
  } catch (err) {
    return failure('getWabaHealth', err);
  }
}

/** Quality rating + messaging tier for an app. */
async function getRatings({ appId }) {
  try {
    const data = await gupshupAuth.withAppToken(appId, async (token) => {
      const { data } = await axios.get(`${appBase(appId)}/ratings`, {
        headers: { Authorization: token },
        timeout: 10000,
      });
      return data;
    });
    return { success: true, data };
  } catch (err) {
    return failure('getRatings', err);
  }
}

/** Partner wallet balance for an app. */
async function getWalletBalance({ appId }) {
  try {
    const data = await gupshupAuth.withAppToken(appId, async (token) => {
      const { data } = await axios.get(`${appBase(appId)}/wallet/balance`, {
        headers: { Authorization: token },
        timeout: 10000,
      });
      return data;
    });
    return { success: true, data };
  } catch (err) {
    return failure('getWalletBalance', err);
  }
}

function failure(op, err) {
  const status = err?.response?.status;
  const errData = err?.response?.data || err?.message;
  logger.error(`[gupshup] ${op} failed (status=${status || 'n/a'}):`, errData);
  return { success: false, error: errData, status };
}

function normalizeSubscriptionUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.href.replace(/\/+$/, '');
  } catch {
    return String(url || '').trim().replace(/\/+$/, '');
  }
}

function subscriptionErrorMessage(error, status) {
  if (status === 429) {
    return 'Gupshup rate limit: max 5 subscription calls per minute per app. Wait 60 seconds, then try again.';
  }
  if (typeof error === 'string') return error;
  return error?.message || error?.error || 'Subscription request failed';
}

/** List active webhook subscriptions for an app (GET — same 5/min rate limit as POST). */
async function listSubscriptions({ appId }) {
  try {
    const data = await gupshupAuth.withAppToken(appId, async (token) => {
      const { data } = await axios.get(`${appBase(appId)}/subscription`, {
        headers: { Authorization: token },
        timeout: 15000,
      });
      return data;
    });
    if (data?.status === 'error') return { success: false, error: data };
    const subs = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
    return { success: true, data: subs };
  } catch (err) {
    return failure('listSubscriptions', err);
  }
}

function findActiveSubscriptionForUrl(subscriptions, targetUrl) {
  const normalizedTarget = normalizeSubscriptionUrl(targetUrl);
  if (!normalizedTarget) return null;
  return (
    (subscriptions || []).find(
      (sub) =>
        sub?.active !== false &&
        normalizeSubscriptionUrl(sub?.url) === normalizedTarget
    ) || null
  );
}

function findSubscriptionByTag(subscriptions, tag) {
  const wanted = String(tag || '').trim();
  if (!wanted) return null;
  return (
    (subscriptions || []).find(
      (sub) => sub?.active !== false && String(sub.tag || '').trim() === wanted
    ) || null
  );
}

async function updateSubscription({
  appId,
  subscriptionId,
  url,
  modes = 'ALL',
  tag,
  secret,
  active = true,
}) {
  if (!subscriptionId) {
    return { success: false, error: 'subscriptionId is required' };
  }
  try {
    const data = await gupshupAuth.withAppToken(appId, async (token) => {
      const form = new URLSearchParams();
      if (url) form.set('url', url);
      if (modes) form.set('modes', modes);
      if (tag) form.set('tag', tag);
      form.set('version', '3');
      form.set('active', active ? 'true' : 'false');
      form.set('doCheck', 'true');
      if (secret) {
        form.set('meta', JSON.stringify({ headers: { Authorization: `Bearer ${secret}` } }));
      }
      const { data } = await axios.put(
        `${appBase(appId)}/subscription/${encodeURIComponent(subscriptionId)}`,
        form.toString(),
        { headers: formHeaders(token), timeout: 15000 }
      );
      return data;
    });
    if (data?.status === 'error') return { success: false, error: data };
    return { success: true, data: data?.subscription || data };
  } catch (err) {
    return failure('updateSubscription', err);
  }
}

module.exports = {
  sendText,
  sendTemplate,
  listTemplates,
  getTemplate,
  applyTemplate,
  setSubscription,
  ensureSubscription,
  updateSubscription,
  listSubscriptions,
  findActiveSubscriptionForUrl,
  findSubscriptionByTag,
  normalizeSubscriptionUrl,
  uploadMedia,
  listPartnerApps,
  getWabaHealth,
  getRatings,
  getWalletBalance,
  extractMessageId,
};
