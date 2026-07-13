/**
 * Lightweight per-request performance log for spotting noisy/large endpoints.
 *
 * Active only in development OR when `ENABLE_PERF_LOGS=true`. Logs are intentionally
 * minimal — method, path (no query string), status, duration, byte size, tenant ids,
 * and an optional cache HIT/MISS marker (set by route handlers via `res.locals.perfCache`).
 *
 * Never logs cookies, tokens, bodies, customer PII, or payment data.
 */

const { logger } = require('../utils/logger');

const SKIP_PATHS = new Set(['/health', '/api/health']);

/** High-volume beacons — skip perf noise in dev logs. */
const SKIP_PATH_SUFFIXES = ['/track'];

function shouldSkipPerfLog(routePath) {
  if (SKIP_PATHS.has(routePath)) return true;
  return SKIP_PATH_SUFFIXES.some((suffix) => routePath.endsWith(suffix));
}

function isEnabled() {
  if (String(process.env.ENABLE_PERF_LOGS).toLowerCase() === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

function approximateBodyBytes(chunk) {
  if (chunk == null) return 0;
  if (Buffer.isBuffer(chunk)) return chunk.length;
  if (typeof chunk === 'string') return Buffer.byteLength(chunk);
  try {
    return Buffer.byteLength(String(chunk));
  } catch {
    return 0;
  }
}

/**
 * Tracks bytes pushed through `res.write`/`res.end` so we capture the **pre-compression** JSON
 * size that egress is paying for at the application layer. The wire size after `compression()`
 * is reflected by `Content-Length` (when set); we log it separately as `wireBytes` if present.
 */
function instrumentResponse(res) {
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let bodyBytes = 0;

  res.write = function patchedWrite(chunk, encoding, cb) {
    bodyBytes += approximateBodyBytes(chunk);
    return originalWrite(chunk, encoding, cb);
  };
  res.end = function patchedEnd(chunk, encoding, cb) {
    if (chunk != null) bodyBytes += approximateBodyBytes(chunk);
    return originalEnd(chunk, encoding, cb);
  };

  return () => bodyBytes;
}

function tenantContextFromUser(user) {
  if (!user || typeof user !== 'object') return null;
  const ctx = {};
  if (user.id || user._id) ctx.userId = String(user.id || user._id);
  if (user.branchId) ctx.branchId = String(user.branchId);
  if (user.role) ctx.role = String(user.role);
  return Object.keys(ctx).length ? ctx : null;
}

function perfLogMiddleware(req, res, next) {
  if (!isEnabled()) return next();

  // Only the canonical mount path — skip noisy health/probe routes.
  const routePath = req.path || req.originalUrl?.split('?')[0] || '';
  if (shouldSkipPerfLog(routePath)) return next();

  const start = process.hrtime.bigint();
  const getBodyBytes = instrumentResponse(res);

  res.on('finish', () => {
    try {
      const durationNs = process.hrtime.bigint() - start;
      const durationMs = Number(durationNs / 1000000n);
      const wireHeader = res.getHeader('Content-Length');
      const wireBytes = wireHeader != null ? Number(wireHeader) : null;
      const payload = {
        method: req.method,
        path: routePath,
        status: res.statusCode,
        durationMs,
        bodyBytes: getBodyBytes(),
      };
      if (Number.isFinite(wireBytes)) payload.wireBytes = wireBytes;
      const tenant = tenantContextFromUser(req.user);
      if (tenant) Object.assign(payload, tenant);
      const cacheState = res.locals && res.locals.perfCache;
      if (cacheState) payload.cache = String(cacheState);
      logger.info('perf', payload);
    } catch {
      /* never let perf logging affect responses */
    }
  });

  next();
}

/** Convenience for route handlers: `markCache(res, 'HIT')` before sending JSON. */
function markCache(res, state) {
  if (res && res.locals) res.locals.perfCache = state;
}

module.exports = {
  perfLogMiddleware,
  markCache,
  isPerfLoggingEnabled: isEnabled,
};
