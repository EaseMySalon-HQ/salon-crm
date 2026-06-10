/**
 * Redis-backed read cache (fail-open). Used for cross-replica hot paths.
 */

const { getRedisClient } = require('./redis');
const { logger } = require('../utils/logger');

const KEY_PREFIX = 'ems:cache:';

/** Non-blocking delete; pipeline when removing many keys from one SCAN batch. */
async function unlinkKeys(redis, keys) {
  if (!keys.length) return;
  if (keys.length === 1) {
    await redis.unlink(keys[0]);
    return;
  }
  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.unlink(key);
  }
  await pipeline.exec();
}

async function cacheGet(key) {
  const redis = getRedisClient();
  if (!redis || !key) return null;
  try {
    const val = await redis.get(`${KEY_PREFIX}${key}`);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    logger.warn('[cache] get failed for %s: %s', key, err.message);
    return null;
  }
}

async function cacheSet(key, data, ttlSeconds = 60) {
  const redis = getRedisClient();
  if (!redis || !key || data === undefined) return;
  try {
    await redis.setex(`${KEY_PREFIX}${key}`, ttlSeconds, JSON.stringify(data));
  } catch (err) {
    logger.warn('[cache] set failed for %s: %s', key, err.message);
  }
}

async function cacheDel(keyOrPattern) {
  const redis = getRedisClient();
  if (!redis || !keyOrPattern) return;
  const fullKey = `${KEY_PREFIX}${keyOrPattern}`;
  try {
    if (!keyOrPattern.includes('*')) {
      await redis.unlink(fullKey);
      return;
    }
    const pattern = fullKey;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length) await unlinkKeys(redis, keys);
    } while (cursor !== '0');
  } catch (err) {
    logger.warn('[cache] del failed for %s: %s', keyOrPattern, err.message);
  }
}

function dashboardInitCacheKey(branchId, variant) {
  return `dashboard:init:${branchId}:${variant}`;
}

function businessPlanCacheKey(branchId) {
  return `business:plan:${branchId}`;
}

function tenantListCacheKey(resource, branchId, queryKey = 'default') {
  return `list:${resource}:${branchId}:${queryKey}`;
}

function appointmentsListCacheKey(branchId, queryKey) {
  return tenantListCacheKey('appointments', branchId, queryKey);
}

function buildAppointmentsListQueryKey(query = {}) {
  const parts = [
    `p${query.page || 1}`,
    `l${query.limit || 10}`,
    query.date ? `d${String(query.date).slice(0, 10)}` : '',
    query.dateFrom ? `df${String(query.dateFrom).slice(0, 10)}` : '',
    query.dateTo ? `dt${String(query.dateTo).slice(0, 10)}` : '',
    query.status ? `s${query.status}` : '',
    query.view ? `v${query.view}` : '',
    query.fields ? `f${query.fields}` : '',
  ].filter(Boolean);
  return parts.join(':') || 'default';
}

function myBranchesCacheKey(userId) {
  return `my-branches:${userId}`;
}

async function invalidateTenantReadCaches(branchId) {
  if (!branchId) return;
  const id = String(branchId);
  await Promise.all([
    cacheDel(`dashboard:init:${id}:*`),
    cacheDel(businessPlanCacheKey(id)),
    cacheDel(`list:services:${id}:*`),
    cacheDel(`list:staff:${id}:*`),
    cacheDel(`list:appointments:${id}:*`),
  ]);
}

async function invalidateMyBranchesCache(userId) {
  if (!userId) return;
  await cacheDel(myBranchesCacheKey(String(userId)));
}

module.exports = {
  cacheGet,
  cacheSet,
  cacheDel,
  dashboardInitCacheKey,
  businessPlanCacheKey,
  tenantListCacheKey,
  appointmentsListCacheKey,
  buildAppointmentsListQueryKey,
  myBranchesCacheKey,
  invalidateTenantReadCaches,
  invalidateMyBranchesCache,
};
