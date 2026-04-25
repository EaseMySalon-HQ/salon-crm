/**
 * Lightweight in-memory TTL cache for expensive query results.
 *
 * Designed for analytics and summary endpoints where a few seconds of
 * staleness is acceptable and repeated identical requests (same branch,
 * same date range) are common during dashboard loads.
 *
 * Usage:
 *   const cache = new QueryCache({ ttlMs: 5 * 60 * 1000 }); // 5 min
 *   const result = await cache.getOrSet(key, () => expensiveQuery());
 *
 * No external dependencies — pure Node.js Map + setTimeout.
 */

'use strict';

class QueryCache {
  /**
   * @param {object} [opts]
   * @param {number} [opts.ttlMs=300000]   Default TTL in milliseconds (5 min)
   * @param {number} [opts.maxSize=500]    Max entries before LRU eviction
   */
  constructor({ ttlMs = 5 * 60 * 1000, maxSize = 500 } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    /** @type {Map<string, { value: unknown, expiresAt: number, timer: NodeJS.Timeout }>} */
    this._store = new Map();
  }

  /**
   * Return cached value for `key`, or compute it via `fn`, cache, and return.
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} fn
   * @param {number} [ttlMs]  Per-call TTL override
   * @returns {Promise<T>}
   */
  async getOrSet(key, fn, ttlMs) {
    const entry = this._store.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.value;
    }

    // Evict stale entry if present
    if (entry) {
      clearTimeout(entry.timer);
      this._store.delete(key);
    }

    // Enforce max size with simple LRU-style eviction (delete oldest entry)
    if (this._store.size >= this.maxSize) {
      const oldestKey = this._store.keys().next().value;
      const oldest = this._store.get(oldestKey);
      if (oldest) clearTimeout(oldest.timer);
      this._store.delete(oldestKey);
    }

    const value = await fn();
    const effectiveTtl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : this.ttlMs;
    const expiresAt = Date.now() + effectiveTtl;

    // Auto-evict after TTL so the Map doesn't grow unbounded
    const timer = setTimeout(() => {
      this._store.delete(key);
    }, effectiveTtl).unref(); // .unref() so the timer doesn't keep the process alive

    this._store.set(key, { value, expiresAt, timer });
    return value;
  }

  /**
   * Explicitly invalidate a cache entry.
   * @param {string} key
   */
  invalidate(key) {
    const entry = this._store.get(key);
    if (entry) {
      clearTimeout(entry.timer);
      this._store.delete(key);
    }
  }

  /**
   * Invalidate all entries whose key starts with `prefix`.
   * Useful for branch-scoped invalidation: `cache.invalidatePrefix('branchId:abc123')`.
   * @param {string} prefix
   */
  invalidatePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this.invalidate(key);
      }
    }
  }

  /** Remove all entries. */
  clear() {
    for (const entry of this._store.values()) {
      clearTimeout(entry.timer);
    }
    this._store.clear();
  }

  /** Number of live entries currently in the cache. */
  get size() {
    return this._store.size;
  }
}

// ---------------------------------------------------------------------------
// Shared singleton caches — import these directly in route handlers.
// ---------------------------------------------------------------------------

/** Analytics dashboard cache: 5-minute TTL (revenue, services, clients, products, staff tabs). */
const analyticsCache = new QueryCache({ ttlMs: 5 * 60 * 1000, maxSize: 200 });

/** Sales summary totals cache: 2-minute TTL (GET /api/sales/summary). */
const salesSummaryCache = new QueryCache({ ttlMs: 2 * 60 * 1000, maxSize: 200 });

module.exports = { QueryCache, analyticsCache, salesSummaryCache };
