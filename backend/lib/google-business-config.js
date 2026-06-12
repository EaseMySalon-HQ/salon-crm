/**
 * Platform Google OAuth config — DB > env resolution.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { encrypt, decrypt } = require('./crypto');
const { logger } = require('../utils/logger');

const CACHE_TTL_MS = 30 * 1000;
let cache = null;
let cacheAt = 0;

const GMB_SCOPE = 'https://www.googleapis.com/auth/business.manage';

async function getModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('GmbMetaConfig', require('../models/GmbMetaConfig').schema);
}

async function getGmbConfig({ skipCache = false } = {}) {
  if (!skipCache && cache && Date.now() - cacheAt < CACHE_TTL_MS) {
    return cache;
  }

  let db = null;
  try {
    const Model = await getModel();
    db = await Model.findOne({ scope: 'platform' }).lean();
  } catch (err) {
    logger.warn('[gmb-config] DB read failed, using env:', err?.message || err);
  }

  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || null;
  if (db?.clientSecretCipher) {
    try {
      clientSecret = decrypt(db.clientSecretCipher);
    } catch (err) {
      logger.error('[gmb-config] failed to decrypt clientSecret:', err?.message || err);
    }
  }

  const merged = {
    clientId: db?.clientId || process.env.GOOGLE_CLIENT_ID || null,
    clientSecret,
    redirectUri:
      db?.redirectUri ||
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/gmb/callback`,
    scope: GMB_SCOPE,
    source: db ? (process.env.GOOGLE_CLIENT_ID ? 'mixed' : 'db') : 'env',
    updatedAt: db?.updatedAt || null,
  };

  cache = merged;
  cacheAt = Date.now();
  return merged;
}

async function setGmbConfig(payload, updatedBy) {
  const Model = await getModel();
  const update = { updatedBy: updatedBy || null };
  if (payload.clientId !== undefined) update.clientId = payload.clientId || null;
  if (payload.redirectUri !== undefined) update.redirectUri = payload.redirectUri || null;
  if (payload.clientSecret !== undefined) {
    update.clientSecretCipher = payload.clientSecret ? encrypt(payload.clientSecret) : null;
  }
  const doc = await Model.findOneAndUpdate(
    { scope: 'platform' },
    { $set: update },
    { upsert: true, new: true }
  );
  cache = null;
  return doc;
}

function invalidateCache() {
  cache = null;
  cacheAt = 0;
}

module.exports = {
  GMB_SCOPE,
  getGmbConfig,
  setGmbConfig,
  invalidateCache,
};
