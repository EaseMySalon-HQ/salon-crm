/**
 * Optional in-memory correlation for internal debugging only (never logged).
 * Maps full SHA-256 of rate-limit key → opaque subject handle (tenant/admin/anon).
 * Enable with RATE_LIMIT_CORRELATION=1 — off by default.
 * Short-lived lookup cache avoids repeated hashing / full-map scans for hot keys.
 */

const crypto = require('crypto');

const MAX_ENTRIES = 5000;
const TTL_MS = 10 * 60 * 1000;

/** Short TTL for read-through lookup cache (separate from data TTL). */
const LOOKUP_CACHE_TTL_MS = 30000;
const LOOKUP_CACHE_MAX = 2000;

/** @type {Map<string, { subject: { kind: string; id?: string }; expiresAt: number }>} */
const byFullHash = new Map();

/** @type {Map<string, { value: unknown; expiresAt: number }>} */
const lookupCache = new Map();

function isEnabled() {
  return process.env.RATE_LIMIT_CORRELATION === '1' || process.env.RATE_LIMIT_CORRELATION === 'true';
}

function fullHash(key) {
  return crypto.createHash('sha256').update(String(key), 'utf8').digest('hex');
}

function prune() {
  const now = Date.now();
  for (const [k, v] of byFullHash) {
    if (v.expiresAt < now) byFullHash.delete(k);
  }
  while (byFullHash.size > MAX_ENTRIES) {
    const first = byFullHash.keys().next().value;
    if (first === undefined) break;
    byFullHash.delete(first);
  }
}

function lookupCacheGet(key) {
  const e = lookupCache.get(key);
  if (!e) return { miss: true };
  if (e.expiresAt < Date.now()) {
    lookupCache.delete(key);
    return { miss: true };
  }
  return { miss: false, value: e.value };
}

function lookupCacheSet(key, value) {
  lookupCache.set(key, { value, expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS });
  pruneLookupCache();
}

function pruneLookupCache() {
  if (lookupCache.size <= LOOKUP_CACHE_MAX) return;
  const now = Date.now();
  for (const [k, v] of lookupCache) {
    if (v.expiresAt < now) lookupCache.delete(k);
  }
  while (lookupCache.size > LOOKUP_CACHE_MAX) {
    const first = lookupCache.keys().next().value;
    if (first === undefined) break;
    lookupCache.delete(first);
  }
}

function invalidateLookupCacheForHash(h) {
  lookupCache.delete(`h:${h}`);
  lookupCache.delete(`s:${h.slice(0, 8)}`);
}

/**
 * Record correlation for a rate-limit key (server-side only).
 * @param {string} key
 * @param {import('express').Request} req
 */
function recordRateLimitCorrelation(key, req) {
  if (!isEnabled() || key == null || typeof key !== 'string') return;
  const h = fullHash(key);
  let subject = { kind: 'anon' };
  if (req.user?.id != null) subject = { kind: 'tenant', id: String(req.user.id) };
  else if (req.user?._id != null) subject = { kind: 'tenant', id: String(req.user._id) };
  else if (req.admin?.id != null) subject = { kind: 'admin', id: String(req.admin.id) };
  else if (req.admin?._id != null) subject = { kind: 'admin', id: String(req.admin._id) };

  byFullHash.set(h, { subject, expiresAt: Date.now() + TTL_MS });
  invalidateLookupCacheForHash(h);
  prune();
}

/**
 * Internal inspection: resolve by raw rate-limit key (never user-facing).
 * @param {string} rateLimitKey
 * @returns {{ kind: string; id?: string } | null}
 */
function lookupCorrelationByRateLimitKey(rateLimitKey) {
  if (!isEnabled() || rateLimitKey == null) return null;
  const h = fullHash(rateLimitKey);
  const ck = `h:${h}`;
  const cached = lookupCacheGet(ck);
  if (!cached.miss) return cached.value;

  const e = byFullHash.get(h);
  let result = null;
  if (e && e.expiresAt >= Date.now()) {
    result = e.subject;
  }
  lookupCacheSet(ck, result);
  return result;
}

/**
 * Resolve by safe log token `rlk:xxxxxxxx` (first 8 hex of SHA-256 of key — may collide; debug only).
 * @param {string} safeKeyLog e.g. rlk:a1b2c3d4
 */
function lookupCorrelationBySafeKeyLog(safeKeyLog) {
  if (!isEnabled() || typeof safeKeyLog !== 'string' || !safeKeyLog.startsWith('rlk:')) return null;
  const short = safeKeyLog.slice(4, 12);
  if (short.length !== 8) return null;

  const sk = `s:${short}`;
  const cached = lookupCacheGet(sk);
  if (!cached.miss) return cached.value;

  const now = Date.now();
  const matches = [];
  for (const [h, v] of byFullHash) {
    if (v.expiresAt < now) continue;
    if (h.startsWith(short)) matches.push(v.subject);
  }
  let result = null;
  if (matches.length === 0) result = null;
  else if (matches.length > 1) result = { ambiguous: true, count: matches.length };
  else result = matches[0];

  lookupCacheSet(sk, result);
  return result;
}

function resetForTests() {
  byFullHash.clear();
  lookupCache.clear();
}

module.exports = {
  recordRateLimitCorrelation,
  lookupCorrelationByRateLimitKey,
  lookupCorrelationBySafeKeyLog,
  resetForTests,
};
