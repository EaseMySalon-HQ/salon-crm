/**
 * Read/write helper for the platform-wide Meta Cloud API config.
 *
 * Resolution order (per field): DB value > env value > default.
 * The DB version always wins so operators can manage credentials through the
 * admin UI without ever touching env files.
 *
 * Plaintext secrets are decrypted lazily on each `getMetaConfig()` call and
 * cached for 30 seconds to keep the webhook hot path fast.
 *
 * `setMetaConfig()` encrypts secrets before persisting and invalidates the
 * cache. The encryption key (`WHATSAPP_TOKEN_ENC_KEY`) stays in env.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { encrypt, decrypt } = require('./crypto');
const { logger } = require('../utils/logger');

const CACHE_TTL_MS = 30 * 1000;
let cache = null;
let cacheAt = 0;

async function getModel() {
  const main = await databaseManager.getMainConnection();
  return main.model(
    'WhatsAppMetaConfig',
    require('../models/WhatsAppMetaConfig').schema
  );
}

/**
 * Returns the merged platform Meta config.
 *
 * Shape:
 *   {
 *     appId, configId, appSecret, verifyToken, graphVersion,
 *     webhookCallbackUrl, source: 'db' | 'env' | 'mixed', updatedAt
 *   }
 */
async function getMetaConfig({ skipCache = false } = {}) {
  if (!skipCache && cache && Date.now() - cacheAt < CACHE_TTL_MS) {
    return cache;
  }

  let db = null;
  try {
    const Model = await getModel();
    db = await Model.findOne({ scope: 'platform' }).lean();
  } catch (err) {
    logger.warn('[whatsapp-meta-config] DB read failed, using env:', err?.message || err);
  }

  let appSecret = process.env.META_APP_SECRET || null;
  if (db?.appSecretCipher) {
    try {
      appSecret = decrypt(db.appSecretCipher);
    } catch (err) {
      logger.error('[whatsapp-meta-config] failed to decrypt appSecret:', err?.message || err);
    }
  }

  let verifyToken = process.env.META_VERIFY_TOKEN || null;
  if (db?.verifyTokenCipher) {
    try {
      verifyToken = decrypt(db.verifyTokenCipher);
    } catch (err) {
      logger.error('[whatsapp-meta-config] failed to decrypt verifyToken:', err?.message || err);
    }
  }

  const merged = {
    appId: db?.appId || process.env.META_APP_ID || null,
    configId: db?.configId || process.env.META_APP_CONFIG_ID || null,
    appSecret,
    verifyToken,
    graphVersion: process.env.META_GRAPH_VERSION || 'v23.0',
    webhookCallbackUrl: db?.webhookCallbackUrl || null,
    source: db ? (process.env.META_APP_ID ? 'mixed' : 'db') : 'env',
    updatedAt: db?.updatedAt || null,
  };
  cache = merged;
  cacheAt = Date.now();
  return merged;
}

function invalidateCache() {
  cache = null;
  cacheAt = 0;
}

/**
 * Public, redacted view safe to send to any authenticated client. Returns
 * booleans for the two secret fields so the UI can show "configured" badges
 * without ever leaking plaintext.
 */
async function getMetaConfigPublic() {
  const cfg = await getMetaConfig();
  return {
    appId: cfg.appId,
    configId: cfg.configId,
    graphVersion: cfg.graphVersion,
    webhookCallbackUrl: cfg.webhookCallbackUrl,
    appSecretSet: Boolean(cfg.appSecret),
    verifyTokenSet: Boolean(cfg.verifyToken),
    source: cfg.source,
    updatedAt: cfg.updatedAt,
  };
}

/**
 * Admin upsert. Encrypts secrets at rest. Pass `null` to clear a secret;
 * omit a field entirely to leave it unchanged. Strings are trimmed.
 */
async function setMetaConfig(input = {}, { actorId = null, actorEmail = null } = {}) {
  const Model = await getModel();
  const update = {};

  if ('appId' in input) {
    update.appId = input.appId ? String(input.appId).trim() : null;
  }
  if ('configId' in input) {
    update.configId = input.configId ? String(input.configId).trim() : null;
  }
  if ('webhookCallbackUrl' in input) {
    update.webhookCallbackUrl = input.webhookCallbackUrl
      ? String(input.webhookCallbackUrl).trim()
      : null;
  }

  // Secrets — only touched when an explicit value (or null) is provided.
  if ('appSecret' in input) {
    if (input.appSecret === null) update.appSecretCipher = null;
    else if (typeof input.appSecret === 'string' && input.appSecret.trim()) {
      update.appSecretCipher = encrypt(input.appSecret.trim());
    }
  }
  if ('verifyToken' in input) {
    if (input.verifyToken === null) update.verifyTokenCipher = null;
    else if (typeof input.verifyToken === 'string' && input.verifyToken.trim()) {
      update.verifyTokenCipher = encrypt(input.verifyToken.trim());
    }
  }

  if (actorId) update.updatedBy = actorId;
  if (actorEmail) update.updatedByEmail = actorEmail;

  const doc = await Model.findOneAndUpdate(
    { scope: 'platform' },
    { $set: update, $setOnInsert: { scope: 'platform' } },
    { upsert: true, new: true }
  );
  invalidateCache();
  return doc;
}

module.exports = {
  getMetaConfig,
  getMetaConfigPublic,
  setMetaConfig,
  invalidateCache,
};
