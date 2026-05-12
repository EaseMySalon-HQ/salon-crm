/**
 * Tenant-scoped TTL cache for report endpoints (analytics tabs + heavy report aggregations).
 *
 * Reports are the most expensive read path in the backend — large date ranges, multi-stage
 * aggregations, and they run repeatedly because users click between tabs / refresh filters.
 * A 2–5 minute cache keyed by `(tenant, reportType, normalized-filters)` is the highest-
 * impact egress win after compression.
 *
 * Safety:
 * - Keys always include `req.user.branchId` → never cross tenants.
 * - Stores only payloads the route already returns (no extra metadata).
 * - Auto-evicts past TTL; periodic sweep bounds memory.
 * - Mutation routes (sale, appointment, payment, inventory) call
 *   `invalidateReportCache(branchId)` to drop entries surgically.
 */

const DEFAULT_TTL_MS = 3 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

const store = new Map();

/**
 * Stable JSON for filter keys — sorts keys recursively so `{a:1,b:2}` and `{b:2,a:1}`
 * hash to the same string. Skips undefined values (Express coerces missing query params
 * to undefined).
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function buildKey(branchId, reportType, filters) {
  return `${String(branchId)}::${reportType}::${stableStringify(filters || {})}`;
}

function getReportCache(branchId, reportType, filters) {
  if (!branchId) return null;
  const entry = store.get(buildKey(branchId, reportType, filters));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(buildKey(branchId, reportType, filters));
    return null;
  }
  return entry.payload;
}

function setReportCache(branchId, reportType, filters, payload, ttlMs = DEFAULT_TTL_MS) {
  if (!branchId || !payload) return;
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }
  store.set(buildKey(branchId, reportType, filters), {
    payload,
    expiresAt: Date.now() + ttlMs,
  });
}

/** Drop every report cache entry for a tenant — surgical, leaves other tenants intact. */
function invalidateReportCache(branchId) {
  if (!branchId) return;
  const prefix = `${String(branchId)}::`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function clearReportCache() {
  store.clear();
}

/**
 * Build a small wrapper for a report endpoint: looks up the cache, calls `compute` on
 * miss, stores the payload. The route handler is unchanged otherwise. Returns the
 * payload (and sets `res.locals.perfCache` so the perf log can report HIT/MISS).
 */
async function withReportCache(req, res, { reportType, filters, ttlMs, compute }) {
  const branchId = req.user && req.user.branchId;
  if (!branchId) return compute();

  const cached = getReportCache(branchId, reportType, filters);
  if (cached !== null && cached !== undefined) {
    if (res && res.locals) res.locals.perfCache = 'HIT';
    return cached;
  }
  const payload = await compute();
  setReportCache(branchId, reportType, filters, payload, ttlMs);
  if (res && res.locals) res.locals.perfCache = 'MISS';
  return payload;
}

/**
 * Allow-listed GET report endpoints whose payloads are pure functions of (tenant, query)
 * and worth caching for 2–3 minutes. Keep this in sync with the report handlers below —
 * adding an entry here is sufficient to start caching that endpoint.
 *
 * Match is on `req.path` (no query string). Wildcard via prefix `+` (e.g. `/api/reports/`)
 * is intentionally NOT used to avoid accidentally caching mutation-adjacent routes.
 */
const CACHEABLE_REPORT_GETS = new Set([
  '/api/reports/dashboard',
  '/api/reports/summary',
  '/api/reports/supplier',
  '/api/reports/purchase',
  '/api/reports/appointment-list',
  '/api/reports/unpaid-part-paid',
  '/api/reports/deleted-invoices',
  '/api/reports/tip-payouts',
]);

/**
 * Express middleware: caches `res.json(payload)` for allow-listed report GETs. Implementation
 * patches `res.json` once after `authenticateToken` populates `req.user`. Failed responses
 * (non-2xx) are never cached. The patched method ALWAYS calls the original `res.json` exactly
 * once, so HEAD/no-body paths are unaffected.
 *
 * The handler-side `withReportCache` helper remains available for cases where the route
 * wants to short-circuit DB work before computing the payload; this middleware is the
 * blanket fallback for the large legacy report handlers that would be invasive to refactor.
 */
function reportCacheMiddleware(req, res, next) {
  if (req.method !== 'GET') return next();
  const path = req.path || req.originalUrl?.split('?')[0] || '';
  if (!CACHEABLE_REPORT_GETS.has(path)) return next();
  const branchId = req.user && req.user.branchId;
  if (!branchId) return next();

  const filters = req.query || {};
  const cached = getReportCache(branchId, `route:${path}`, filters);
  if (cached !== null && cached !== undefined) {
    if (res && res.locals) res.locals.perfCache = 'HIT';
    return res.json(cached);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    try {
      if (
        res.statusCode >= 200 &&
        res.statusCode < 300 &&
        body &&
        typeof body === 'object' &&
        body.success !== false
      ) {
        setReportCache(branchId, `route:${path}`, filters, body);
        if (res && res.locals) res.locals.perfCache = 'MISS';
      }
    } catch {
      /* swallow — caching must never block the response */
    }
    return originalJson(body);
  };
  next();
}

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
}, SWEEP_INTERVAL_MS);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

module.exports = {
  getReportCache,
  setReportCache,
  invalidateReportCache,
  clearReportCache,
  withReportCache,
  reportCacheMiddleware,
  CACHEABLE_REPORT_GETS,
  __internal: { store, buildKey, stableStringify },
};
