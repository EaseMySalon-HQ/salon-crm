'use strict';

/**
 * Reconcile Gupshup webhook subscriptions so the URL registered on the app
 * matches our currently-resolved public webhook URL.
 *
 * Runs in two situations:
 *   - Admin saves a new webhook URL (Admin → Gupshup) — we push it out to
 *     every connected tenant + platform app so they don't sit on a stale URL
 *     (common when a Cloudflare quick tunnel rotates its hostname).
 *   - On-demand via `POST /api/admin/gupshup/webhook/reconcile`.
 *
 * We never touch other partners' subscriptions on the same app (we only look
 * at ones whose `tag` starts with `salon-crm-`), and we never delete —
 * updates set/overwrite the same subscription id in place.
 */

const databaseManager = require('../config/database-manager');
const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const gupshupConfig = require('./gupshup-config');
const { resolveGupshupWebhookUrl } = require('./public-backend-url');
const { logger } = require('../utils/logger');

const OUR_TAG_PREFIX = 'salon-crm-';

function isOurTag(tag) {
  return typeof tag === 'string' && tag.startsWith(OUR_TAG_PREFIX);
}

function isLocalHostish(url) {
  return /localhost|127\.\d|0\.0\.0\.0/.test(String(url || ''));
}

async function getAccountModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema);
}

async function loadAdminWebhookOverride() {
  try {
    const main = await databaseManager.getMainConnection();
    const AdminSettings = main.model(
      'AdminSettings',
      require('../models/AdminSettings').schema
    );
    const settings = await AdminSettings.getSettings();
    return settings?.notifications?.whatsapp?.gupshupWebhookUrl || null;
  } catch {
    return null;
  }
}

/**
 * Update the salon-crm-<businessId> subscription for a single app so that it
 * points at `targetUrl`. Creates the subscription if it doesn't exist.
 *
 * @param {object} args
 * @param {string} args.appId
 * @param {string} args.tag  our subscription tag for this scope
 * @param {string} args.targetUrl full webhook URL
 * @param {string|null} [args.secret]  shared secret (mirrored back via `meta`)
 * @returns {Promise<{ok:boolean, action:'noop'|'updated'|'created'|'failed', error?:string, subscriptionId?:string}>}
 */
async function reconcileOne({ appId, tag, targetUrl, secret }) {
  if (!appId || !tag || !targetUrl) {
    return { ok: false, action: 'failed', error: 'missing appId/tag/targetUrl' };
  }
  if (isLocalHostish(targetUrl)) {
    return {
      ok: false,
      action: 'failed',
      error: 'target url points at localhost — set BACKEND_PUBLIC_URL / admin webhook URL',
    };
  }

  const list = await gupshupWhatsApp.listSubscriptions({ appId });
  if (!list.success) {
    return {
      ok: false,
      action: 'failed',
      error: `listSubscriptions: ${JSON.stringify(list.error)}`,
    };
  }
  const subs = Array.isArray(list.data) ? list.data : [];
  const normalizedTarget = gupshupWhatsApp.normalizeSubscriptionUrl(targetUrl);
  const ours = subs.filter((s) => String(s.tag || '') === tag && s.active !== false);
  const alreadyGood = ours.find(
    (s) => gupshupWhatsApp.normalizeSubscriptionUrl(s.url) === normalizedTarget
  );
  if (alreadyGood) {
    return { ok: true, action: 'noop', subscriptionId: String(alreadyGood.id) };
  }

  if (ours.length === 0) {
    const created = await gupshupWhatsApp.setSubscription({
      appId,
      url: targetUrl,
      modes: 'ALL',
      tag,
      secret,
    });
    if (!created.success) {
      return {
        ok: false,
        action: 'failed',
        error: `setSubscription: ${JSON.stringify(created.error)}`,
      };
    }
    return {
      ok: true,
      action: 'created',
      subscriptionId: String(created.data?.subscription?.id || created.data?.id || ''),
    };
  }

  // Update the first matching subscription; deactivate any duplicates (rare).
  const [primary, ...duplicates] = ours;
  const upd = await gupshupWhatsApp.updateSubscription({
    appId,
    subscriptionId: primary.id,
    url: targetUrl,
    modes: primary.modes || 'ALL',
    tag,
    secret,
  });
  if (!upd.success) {
    return {
      ok: false,
      action: 'failed',
      error: `updateSubscription: ${JSON.stringify(upd.error)}`,
    };
  }
  for (const dup of duplicates) {
    await gupshupWhatsApp
      .updateSubscription({
        appId,
        subscriptionId: dup.id,
        url: dup.url,
        modes: dup.modes || 'ALL',
        tag,
        active: false,
      })
      .catch(() => {
        /* best effort */
      });
  }
  return { ok: true, action: 'updated', subscriptionId: String(primary.id) };
}

/**
 * Reconcile subscriptions across:
 *   - Every tenant WhatsAppAccount with a connected Gupshup app
 *   - The shared platform app (if configured), using tag `salon-crm-platform`
 *
 * @param {object} [opts]
 * @param {string|null} [opts.adminWebhookUrl]  override (skips DB lookup)
 * @returns {Promise<{targetUrl:string, source:string, results:Array}>}
 */
async function reconcileAllSubscriptions(opts = {}) {
  const adminWebhookUrl =
    typeof opts.adminWebhookUrl === 'string'
      ? opts.adminWebhookUrl
      : await loadAdminWebhookOverride();
  const webhook = resolveGupshupWebhookUrl({ adminWebhookUrl });
  const secret = process.env.GUPSHUP_WEBHOOK_SECRET || null;
  const results = [];

  if (isLocalHostish(webhook.url)) {
    logger.warn(
      '[gupshup-subscription] refusing to reconcile — resolved url points at localhost (%s)',
      webhook.url
    );
    return { targetUrl: webhook.url, source: webhook.source, results, skipped: 'localhost' };
  }

  // Tenant apps.
  const Account = await getAccountModel();
  const accounts = await Account.find({
    provider: 'gupshup',
    status: 'connected',
    gupshupAppId: { $ne: null },
  })
    .select({ businessId: 1, gupshupAppId: 1, gupshupAppName: 1 })
    .lean();

  const seenApps = new Set();
  for (const acc of accounts) {
    const appId = String(acc.gupshupAppId);
    const tag = `${OUR_TAG_PREFIX}${String(acc.businessId)}`;
    const key = `${appId}::${tag}`;
    if (seenApps.has(key)) continue;
    seenApps.add(key);
    const r = await reconcileOne({ appId, tag, targetUrl: webhook.url, secret });
    results.push({
      scope: 'tenant',
      businessId: String(acc.businessId),
      appId,
      appName: acc.gupshupAppName || null,
      tag,
      ...r,
    });
    if (r.action !== 'noop') {
      logger.info(
        '[gupshup-subscription] tenant business=%s app=%s → %s (%s)',
        String(acc.businessId),
        appId,
        r.action,
        r.error || 'ok'
      );
    }
  }

  // Platform app.
  const platform = await gupshupConfig.loadPlatformConfig();
  if (platform.appId) {
    const tag = `${OUR_TAG_PREFIX}platform`;
    const r = await reconcileOne({
      appId: platform.appId,
      tag,
      targetUrl: webhook.url,
      secret,
    });
    results.push({
      scope: 'platform',
      appId: platform.appId,
      appName: platform.appName || null,
      tag,
      ...r,
    });
    if (r.action !== 'noop') {
      logger.info(
        '[gupshup-subscription] platform app=%s → %s (%s)',
        platform.appId,
        r.action,
        r.error || 'ok'
      );
    }
  }

  return { targetUrl: webhook.url, source: webhook.source, results };
}

module.exports = {
  OUR_TAG_PREFIX,
  isOurTag,
  reconcileOne,
  reconcileAllSubscriptions,
};
