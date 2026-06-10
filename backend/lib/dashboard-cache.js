/**
 * Tenant-scoped TTL cache for `buildDashboardInitPayload`, with stale-while-revalidate.
 *
 * Why: the aggregated dashboard endpoint runs ~20 parallel Mongo queries on every page
 * load. Under bursty write traffic (sale → appointment → stock patch in the same
 * iteration) a naive "delete on mutation" causes every subsequent dashboard read to
 * pay the full rebuild cost. SWR lets reads stay fast while a background rebuild
 * refreshes the payload.
 *
 * Lifecycle of an entry:
 * - `now < freshUntil`             → served directly (fresh hit)
 * - `freshUntil ≤ now < staleUntil` → served immediately + background refresh kicked off
 *                                     (stampede-protected by `refreshing` flag)
 * - `now ≥ staleUntil`              → dropped on read; caller does a full rebuild
 *
 * `invalidateDashboardCache` does NOT delete the in-memory payload — it just shifts
 * `freshUntil` to "now" so the next read serves the stale copy and triggers a refresh.
 * Redis invalidation is coalesced per-tenant to avoid hammering `SCAN`/`UNLINK` when
 * a single user request mutates multiple resources in quick succession.
 *
 * Safety:
 * - Keyed by tenant `branchId` + IST day bucket. Never crosses tenants.
 * - Stores only the public payload that the route already returns to the same user.
 * - Auto-evicts entries past `staleUntil`; periodic sweep bounds memory.
 */

const { toDateStringIST } = require('../utils/date-utils');

const DEFAULT_TTL_MS = 90 * 1000;
const STALE_WHILE_REVALIDATE_MS = 30 * 1000;
const REDIS_INVALIDATE_COALESCE_MS = 250;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

const store = new Map();
/** Per-tenant pending Redis invalidation timers (coalesced). */
const pendingRedisInvalidations = new Map();

function makeKey(branchId, variant = 'default') {
  const day = toDateStringIST(new Date());
  return `${String(branchId)}::${day}::${String(variant || 'default')}`;
}

/**
 * Internal: returns the raw entry with its current state, or null if missing/expired.
 * Callers should prefer {@link getDashboardCache} (fresh only) or {@link getDashboardCacheEntry}
 * (fresh or stale, with metadata).
 */
function readEntry(branchId, variant) {
  if (!branchId) return null;
  const key = makeKey(branchId, variant);
  const entry = store.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (now >= entry.staleUntil) {
    store.delete(key);
    return null;
  }
  return { entry, key, state: now < entry.freshUntil ? 'fresh' : 'stale' };
}

/**
 * Fresh-only read. Returns the payload if the entry is still within its fresh window,
 * otherwise null. Stale entries are reported as null here so existing callers that
 * cannot do a background refresh fall through to a hard rebuild.
 */
function getDashboardCache(branchId, variant = 'default') {
  const found = readEntry(branchId, variant);
  if (!found || found.state !== 'fresh') return null;
  return found.entry.payload;
}

/**
 * Returns `{ payload, state, entry }` where `state` is `'fresh'` or `'stale'`, or
 * null if no usable entry exists. The route uses this to serve stale payloads
 * immediately and trigger a background refresh (with `entry.refreshing` as a
 * single-flight latch).
 */
function getDashboardCacheEntry(branchId, variant = 'default') {
  const found = readEntry(branchId, variant);
  if (!found) return null;
  return { payload: found.entry.payload, state: found.state, entry: found.entry };
}

function setDashboardCache(branchId, payload, ttlMs = DEFAULT_TTL_MS, variant = 'default') {
  if (!branchId || !payload) return;
  if (store.size >= MAX_ENTRIES) {
    /** Drop the oldest entry rather than refuse new writes — bound memory under load. */
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }
  const key = makeKey(branchId, variant);
  const now = Date.now();
  store.set(key, {
    payload,
    freshUntil: now + ttlMs,
    staleUntil: now + ttlMs + STALE_WHILE_REVALIDATE_MS,
    refreshing: false,
  });
}

/**
 * Mark in-memory dashboard entries for a tenant as stale (but keep the payload so
 * reads stay fast) and schedule a coalesced Redis invalidation.
 *
 * Bursty mutations (e.g. POST /api/sales followed by PATCH /api/products/.../stock)
 * collapse into a single Redis `SCAN`+`UNLINK` cycle.
 */
function invalidateDashboardCache(branchId) {
  if (!branchId) return;
  const prefix = `${String(branchId)}::`;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (!key.startsWith(prefix)) continue;
    entry.freshUntil = Math.min(entry.freshUntil, now);
    const newStaleUntil = now + STALE_WHILE_REVALIDATE_MS;
    if (entry.staleUntil < newStaleUntil) entry.staleUntil = newStaleUntil;
  }
  scheduleRedisInvalidate(branchId);
}

/**
 * Coalesce repeated `invalidateTenantReadCaches(branchId)` calls within
 * `REDIS_INVALIDATE_COALESCE_MS` into a single Redis SCAN/UNLINK pass.
 *
 * Exposed for tests via `__internal`; production callers go through
 * `invalidateDashboardCache`.
 */
function scheduleRedisInvalidate(branchId) {
  const id = String(branchId);
  if (pendingRedisInvalidations.has(id)) return;
  const timer = setTimeout(() => {
    pendingRedisInvalidations.delete(id);
    try {
      const { invalidateTenantReadCaches } = require('./cache');
      void invalidateTenantReadCaches(id);
    } catch {
      /* redis cache optional */
    }
  }, REDIS_INVALIDATE_COALESCE_MS);
  if (typeof timer.unref === 'function') timer.unref();
  pendingRedisInvalidations.set(id, timer);
}

/** Clear the whole cache — only useful in tests / debug. */
function clearDashboardCache() {
  store.clear();
  for (const timer of pendingRedisInvalidations.values()) {
    clearTimeout(timer);
  }
  pendingRedisInvalidations.clear();
}

/**
 * Paths whose successful mutations affect dashboard figures. Centralizing the list here
 * is more maintainable than scattering `invalidateDashboardCache()` calls across 17k+
 * lines of route handlers in `server.js`.
 *
 * The match is **prefix-based** against `req.path`. Add new entries when a mutation
 * starts feeding the dashboard summary.
 */
const MUTATION_PREFIXES = [
  '/api/sales',
  '/api/receipts',
  '/api/appointments',
  '/api/clients',
  '/api/products',
  '/api/inventory',
  '/api/payments',
  '/api/quick-sale',
  '/api/memberships',
  '/api/membership',
  '/api/staff',
  '/api/services',
  '/api/expenses',
  '/api/cash-registry',
];

function pathTriggersInvalidate(path) {
  if (!path) return false;
  return MUTATION_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Express middleware: on successful (2xx) write methods that hit any dashboard-relevant
 * resource, drop the tenant's cached payloads (dashboard + reports) so the next read
 * rebuilds with fresh data.
 *
 * Runs **after** `authenticateToken` so `req.user.branchId` is available when the
 * `res.on('finish')` listener fires.
 */
function dashboardInvalidateOnMutation(req, res, next) {
  const method = req.method;
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
    return next();
  }
  const path = req.path || req.originalUrl?.split('?')[0] || '';
  if (!pathTriggersInvalidate(path)) return next();

  res.on('finish', () => {
    try {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const branchId = req.user && req.user.branchId;
        if (branchId) {
          invalidateDashboardCache(branchId);
          // Lazy-require to avoid a circular dependency between the two cache modules.
          const { invalidateReportCache } = require('./report-cache');
          invalidateReportCache(branchId);
        }
      }
    } catch {
      /* never let invalidation hook affect the response */
    }
  });
  next();
}

/** Bounded sweep so abandoned tenants (e.g. after midnight IST) do not accumulate. */
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.staleUntil < now) store.delete(key);
  }
}, SWEEP_INTERVAL_MS);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

module.exports = {
  getDashboardCache,
  getDashboardCacheEntry,
  setDashboardCache,
  invalidateDashboardCache,
  clearDashboardCache,
  dashboardInvalidateOnMutation,
  pathTriggersInvalidate,
  __internal: {
    store,
    makeKey,
    MUTATION_PREFIXES,
    pendingRedisInvalidations,
    STALE_WHILE_REVALIDATE_MS,
    REDIS_INVALIDATE_COALESCE_MS,
    DEFAULT_TTL_MS,
  },
};
