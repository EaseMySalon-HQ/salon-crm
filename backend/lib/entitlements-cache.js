/**
 * Per-business entitlements cache.
 *
 * Feature gating runs on (potentially) every mutating/sensitive request. To
 * keep it scalable we resolve a business's effective features/limits/status
 * ONCE and cache the result in-memory for a short TTL, instead of hitting the
 * main DB on every gated route.
 *
 * Entries are invalidated explicitly whenever a business's plan changes
 * (checkout activation, scheduled downgrade apply, admin reassignment) and
 * whenever plan templates themselves change (admin edits -> invalidateAll()).
 */

const databaseManager = require('../config/database-manager');
const {
  getEffectiveFeatures,
  getPlanInfo,
} = require('./entitlements');
const { logger } = require('../utils/logger');

// businessId(string) -> { features:Set<string>, limits, status, planId, planInfo, cachedAt }
const cache = new Map();

const TTL_MS = 30 * 1000;

function isFresh(entry) {
  return entry && Date.now() - entry.cachedAt <= TTL_MS;
}

function buildEntry(business) {
  const features = getEffectiveFeatures(business);
  const planInfo = getPlanInfo(business);
  return {
    features: new Set(features),
    featureList: features,
    limits: planInfo ? planInfo.limits : {},
    status: business.status,
    planId: business.plan ? business.plan.planId : null,
    planInfo,
    cachedAt: Date.now(),
  };
}

/**
 * Resolve and cache entitlements for a business id. Single DB read on a miss.
 * @param {String|ObjectId} businessId
 * @returns {Promise<Object|null>} cache entry, or null if business not found
 */
async function resolve(businessId) {
  if (!businessId) return null;
  const key = String(businessId);

  const existing = cache.get(key);
  if (isFresh(existing)) {
    return existing;
  }

  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const business = await Business.findById(key).select('plan status').lean();

  if (!business) {
    cache.delete(key);
    return null;
  }

  const entry = buildEntry(business);
  cache.set(key, entry);
  return entry;
}

function invalidate(businessId) {
  if (!businessId) return;
  cache.delete(String(businessId));
  try {
    const { cacheDel, businessPlanCacheKey } = require('./cache');
    void cacheDel(businessPlanCacheKey(String(businessId)));
  } catch {
    /* redis cache optional */
  }
  logger.debug(`🧹 entitlements-cache: invalidated business ${businessId}`);
}

function invalidateAll() {
  cache.clear();
  logger.debug('🧹 entitlements-cache: invalidated all businesses');
}

module.exports = {
  resolve,
  invalidate,
  invalidateAll,
};
