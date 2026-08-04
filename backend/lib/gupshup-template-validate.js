'use strict';

/**
 * Pre-send template variable validation.
 *
 * A campaign fails per-recipient (silently, one HTTP 400 each) when the local
 * WhatsAppTemplate shape has drifted from the approved template on
 * Gupshup/Meta — most commonly the number of `{{N}}` variables no longer
 * matches. This fetches the remote template once (cached 10 min to respect
 * Gupshup's 10-calls/min/app template quota) and compares the variable count we
 * are about to send against what the remote template expects, so the send path
 * can fail fast with a single clear 400.
 *
 * Local and remote counts are computed the SAME way (distinct body `{{N}}`
 * indices + text-header `{{N}}` + dynamic URL-button placeholders). Equality
 * therefore reliably means "aligned" and inequality reliably means "drifted",
 * even where Gupshup's stored shape differs field-by-field from ours.
 */

const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const { normalizeGupshupTemplateRecord } = require('./gupshup-template-apply-fields');
const { extractPlaceholderIndices } = require('./whatsapp-template-components');
const { logger } = require('../utils/logger');

const CACHE_TTL_MS = parseInt(process.env.GUPSHUP_TEMPLATE_VALIDATE_TTL_MS, 10) || 10 * 60 * 1000;

/** key `${appId}:${templateId}` -> { expected, ts } */
const cache = new Map();

function cacheKey(appId, templateId) {
  return `${appId || ''}:${templateId || ''}`;
}

function parseContainerMeta(remote) {
  const cm = remote?.containerMeta;
  if (!cm) return null;
  if (typeof cm === 'object') return cm;
  if (typeof cm === 'string') {
    try {
      return JSON.parse(cm);
    } catch {
      return null;
    }
  }
  return null;
}

function urlButtonPlaceholderCount(buttons) {
  if (!Array.isArray(buttons)) return 0;
  let n = 0;
  for (const b of buttons) {
    if (String(b?.type || '').toUpperCase() === 'URL' && /\{\{\d+\}\}/.test(String(b?.url || ''))) {
      n += 1;
    }
  }
  return n;
}

function countVariables({ bodyText, headerText, buttons }) {
  return (
    extractPlaceholderIndices(bodyText || '').length +
    extractPlaceholderIndices(headerText || '').length +
    urlButtonPlaceholderCount(buttons)
  );
}

/** Normalized {bodyText, headerText, buttons} from a Gupshup GET/list template record. */
function remoteFields(remoteData) {
  const remote = normalizeGupshupTemplateRecord(remoteData);
  const cm = parseContainerMeta(remote) || {};

  const bodyText =
    (cm.data && typeof cm.data === 'string' && cm.data) ||
    (typeof remote.data === 'string' && remote.data) ||
    cm.body?.text ||
    remote.body?.text ||
    '';

  let headerText = '';
  const header = cm.header != null ? cm.header : remote.header;
  if (typeof header === 'string') {
    headerText = header;
  } else if (header && typeof header === 'object') {
    const format = String(header.type || header.format || 'TEXT').toUpperCase();
    if (format === 'TEXT') headerText = header.text || '';
  }

  const buttons = Array.isArray(cm.buttons)
    ? cm.buttons
    : Array.isArray(remote.buttons)
      ? remote.buttons
      : [];

  return { bodyText, headerText, buttons };
}

/** Count the variables a stored local WhatsAppTemplate doc will send. */
function countLocalTemplateVariables(template) {
  const c = template?.components || {};
  const headerText = c.header && c.header.format === 'TEXT' ? c.header.text : '';
  return countVariables({
    bodyText: c.body?.text || template?.content || '',
    headerText,
    buttons: Array.isArray(c.buttons) ? c.buttons : [],
  });
}

/**
 * @param {string} templateId  Gupshup template id
 * @param {string[]|number} params  variables to send (array) or their count
 * @param {{ appId?: string }} opts
 * @returns {Promise<{ valid: boolean, expected?: number, got?: number, reason?: string, skipped?: boolean }>}
 */
async function validateTemplate(templateId, params, { appId } = {}) {
  const got = Array.isArray(params) ? params.length : Number(params) || 0;

  // Missing identifiers or a failed fetch must NOT block a send — validation is a
  // fast-fail guard, not a gate. The real send path still surfaces upstream errors.
  if (!templateId || !appId) {
    return { valid: true, skipped: true, reason: 'missing templateId or appId' };
  }

  const key = cacheKey(appId, templateId);
  const cached = cache.get(key);
  let expected;
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    expected = cached.expected;
  } else {
    let result;
    try {
      result = await gupshupWhatsApp.getTemplate({ appId, templateId });
    } catch (err) {
      logger.warn('[gupshup-validate] template fetch threw; skipping validation', {
        appId,
        templateId,
        message: err?.message,
      });
      return { valid: true, skipped: true, reason: 'template fetch error' };
    }
    if (!result?.success) {
      logger.warn('[gupshup-validate] template fetch failed; skipping validation', {
        appId,
        templateId,
      });
      return { valid: true, skipped: true, reason: 'template fetch failed' };
    }
    try {
      expected = countVariables(remoteFields(result.data));
    } catch {
      return { valid: true, skipped: true, reason: 'template shape unparseable' };
    }
    cache.set(key, { expected, ts: Date.now() });
  }

  if (got === expected) return { valid: true, expected, got };
  return {
    valid: false,
    expected,
    got,
    reason: `Template expects ${expected} variable${expected === 1 ? '' : 's'}, got ${got}`,
  };
}

/** Test/ops helper — drop cached template shapes. */
function _clearValidateCache() {
  cache.clear();
}

module.exports = {
  validateTemplate,
  countLocalTemplateVariables,
  _clearValidateCache,
};
