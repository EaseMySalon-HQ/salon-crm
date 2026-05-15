/**
 * Tenant-scoped TTL cache for `buildDashboardInitPayload`.
 *
 * Why: the aggregated dashboard endpoint runs ~15 parallel Mongo queries on every page
 * load. Multiple dashboard cards subscribe to the same React Query key client-side, but
 * a user navigating between dashboard / quick-sale / settings still re-hits the backend
 * every ~60–120 seconds. A small in-memory cache absorbs that traffic.
 *
 * Safety:
 * - Keyed by tenant `branchId` + IST day bucket. Never crosses tenants.
 * - Stores only the public payload that the route already returns to the same user.
 * - Auto-evicts entries past TTL; a periodic sweep prunes stale entries to bound memory.
 * - Mutation routes call `invalidateDashboardCache(branchId)` to drop entries surgically.
 */

const { toDateStringIST } = require('../utils/date-utils');

const DEFAULT_TTL_MS = 90 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

const store = new Map();

function makeKey(branchId, variant = 'default') {
  const day = toDateStringIST(new Date());
  return `${String(branchId)}::${day}::${String(variant || 'default')}`;
}

function getDashboardCache(branchId, variant = 'default') {
  if (!branchId) return null;
  const key = makeKey(branchId, variant);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.payload;
}

function setDashboardCache(branchId, payload, ttlMs = DEFAULT_TTL_MS, variant = 'default') {
  if (!branchId || !payload) return;
  if (store.size >= MAX_ENTRIES) {
    /** Drop the oldest entry rather than refuse new writes — bound memory under load. */
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }
  const key = makeKey(branchId, variant);
  store.set(key, { payload, expiresAt: Date.now() + ttlMs });
}

/**
 * Drop the dashboard cache for a single tenant. Called from mutation routes that change
 * any dashboard metric (sale, appointment, client, inventory, payment). Cheap — `O(days)`,
 * usually exactly one entry.
 */
function invalidateDashboardCache(branchId) {
  if (!branchId) return;
  const prefix = `${String(branchId)}::`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Clear the whole cache — only useful in tests / debug. */
function clearDashboardCache() {
  store.clear();
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
    if (entry.expiresAt < now) store.delete(key);
  }
}, SWEEP_INTERVAL_MS);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

module.exports = {
  getDashboardCache,
  setDashboardCache,
  invalidateDashboardCache,
  clearDashboardCache,
  dashboardInvalidateOnMutation,
  pathTriggersInvalidate,
  __internal: { store, makeKey, MUTATION_PREFIXES },
};
