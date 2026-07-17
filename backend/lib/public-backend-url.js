/**
 * Resolve the public backend base URL for webhooks and OAuth callbacks.
 *
 * Used when an external provider (Gupshup, Meta, Google) must POST to our API.
 * Resolution order for the base (no path):
 *   1. BACKEND_PUBLIC_URL / API_PUBLIC_URL / BACKEND_URL / API_BASE_URL
 *   2. Railway: RAILWAY_PUBLIC_DOMAIN / RAILWAY_STATIC_URL
 *   3. Absolute API_URL or NEXT_PUBLIC_API_URL with /api suffix stripped
 *   4. Local dev: http://localhost:{PORT|3001}
 */

'use strict';

function normalizeBase(raw) {
  return String(raw || '').trim().replace(/\/+$/, '');
}

/** Strip a trailing /api or /api/vN segment from an API root URL. */
function apiRootToBackendBase(apiRoot) {
  const normalized = normalizeBase(apiRoot);
  if (!normalized) return '';
  return normalized.replace(/\/api(\/v\d+)?$/i, '');
}

function resolvePublicBackendBaseUrl() {
  const fromEnv = [
    process.env.BACKEND_PUBLIC_URL,
    process.env.API_PUBLIC_URL,
    process.env.BACKEND_URL,
    process.env.API_BASE_URL,
  ]
    .map(normalizeBase)
    .find(Boolean);
  if (fromEnv) return fromEnv;

  const railwayDomain = normalizeBase(process.env.RAILWAY_PUBLIC_DOMAIN);
  if (railwayDomain) {
    return railwayDomain.startsWith('http') ? railwayDomain : `https://${railwayDomain}`;
  }

  const railwayStatic = normalizeBase(process.env.RAILWAY_STATIC_URL);
  if (railwayStatic) return railwayStatic;

  for (const key of ['API_URL', 'NEXT_PUBLIC_API_URL']) {
    const raw = process.env[key];
    if (raw && /^https?:\/\//i.test(raw)) {
      const base = apiRootToBackendBase(raw);
      if (base) return base;
    }
  }

  const port = process.env.PORT || 3001;
  return `http://localhost:${port}`;
}

const GUPSHUP_WEBHOOK_PATH = '/api/webhooks/whatsapp/gupshup';

/**
 * Ensure a public URL includes the Gupshup webhook path. Accepts a tunnel host,
 * backend base, or full webhook URL.
 */
function normalizeGupshupWebhookUrl(raw) {
  let url = normalizeBase(raw);
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  if (url.endsWith(GUPSHUP_WEBHOOK_PATH)) return url;
  if (url.endsWith('/api')) return `${url}/webhooks/whatsapp/gupshup`;
  return `${url}${GUPSHUP_WEBHOOK_PATH}`;
}

/**
 * Full Gupshup delivery webhook URL.
 * @param {object} [opts]
 * @param {string|null} [opts.adminWebhookUrl] optional override from AdminSettings
 * @returns {{ url: string, source: 'env'|'admin'|'computed' }}
 */
function resolveGupshupWebhookUrl({ adminWebhookUrl } = {}) {
  const explicitEnv = normalizeBase(process.env.GUPSHUP_WEBHOOK_URL);
  if (explicitEnv) {
    return { url: normalizeGupshupWebhookUrl(explicitEnv), source: 'env' };
  }
  const admin = normalizeBase(adminWebhookUrl);
  if (admin) {
    return { url: normalizeGupshupWebhookUrl(admin), source: 'admin' };
  }
  const base = resolvePublicBackendBaseUrl();
  return {
    url: `${base}${GUPSHUP_WEBHOOK_PATH}`,
    source: 'computed',
  };
}

module.exports = {
  normalizeBase,
  normalizeGupshupWebhookUrl,
  GUPSHUP_WEBHOOK_PATH,
  resolvePublicBackendBaseUrl,
  resolveGupshupWebhookUrl,
};
