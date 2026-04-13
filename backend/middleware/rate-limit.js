/**
 * Production-oriented API rate limiting for multi-tenant SaaS.
 *
 * - Redis-backed stores when REDIS_URL / RATE_LIMIT_REDIS_URL is set (shared across Node instances).
 * - Falls back to memory per process if Redis is unavailable (logged; server keeps running).
 * - Hybrid keys: JWT-verified user/admin id where possible; auth routes use body identifiers; else IP.
 *
 * NEVER expose RATE_LIMIT_SKIP_SECRET to browsers or mobile clients — server-side / health checks only.
 * Invalid x-rate-limit-bypass headers are ignored silently (no information leak).
 */

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');
const rateLimitMetrics = require('./rate-limit-metrics');
const rateLimitAlerts = require('./rate-limit-alerts');
const rateLimitCorrelation = require('./rate-limit-correlation');
const { createRateLimitStore } = require('./rate-limit-store');
const {
  globalApiKeyGenerator,
  authClusterKeyGenerator,
  reportsExportKeyGenerator,
  aiIntegrationKeyGenerator,
  sha16,
} = require('./rate-limit-keys');

function envInt(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultValue;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function isEnabled() {
  return process.env.RATE_LIMIT_ENABLED !== '0' && process.env.RATE_LIMIT_ENABLED !== 'false';
}

/** Configure Express trust proxy for correct req.ip behind load balancers. */
function configureTrustProxy(app) {
  const t = process.env.TRUST_PROXY;
  if (t === '1' || t === 'true') {
    app.set('trust proxy', 1);
    return;
  }
  if (t === '0' || t === 'false') {
    app.set('trust proxy', false);
    return;
  }
  if (t !== undefined && t !== '') {
    const n = Number(t);
    app.set('trust proxy', Number.isFinite(n) ? n : 1);
    return;
  }
  app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
}

function validateProductionRateLimitConfig(app) {
  if (process.env.NODE_ENV !== 'production') return;
  const disabled =
    process.env.RATE_LIMIT_ENABLED === '0' || process.env.RATE_LIMIT_ENABLED === 'false';
  if (disabled) {
    logger.error(
      '[rate-limit] SECURITY: RATE_LIMIT_ENABLED must not be disabled in production (scraping / abuse risk)'
    );
  }
  const tp = app.get('trust proxy');
  if (!tp) {
    logger.warn(
      '[rate-limit] TRUST_PROXY is false in production — req.ip may be the proxy, not the client. Set TRUST_PROXY=1 (or hop count) behind a reverse proxy.'
    );
  }
}

function skipOptions(req) {
  return req.method === 'OPTIONS';
}

/**
 * Bypass only when header matches secret exactly (timing-safe when lengths match).
 * Wrong or missing header: behave as normal (no hint to attackers).
 */
function isValidBypass(req) {
  const secret = process.env.RATE_LIMIT_SKIP_SECRET;
  if (!secret || typeof secret !== 'string') return false;
  const header = req.headers['x-rate-limit-bypass'];
  if (typeof header !== 'string' || header.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header, 'utf8'), Buffer.from(secret, 'utf8'));
  } catch {
    return false;
  }
}

function skip(req) {
  return skipOptions(req) || isValidBypass(req);
}

/**
 * Global limiter skips these paths so a saturated IP bucket cannot block login, CSRF bootstrap,
 * token refresh, or logout. Auth cluster + per-email/IP keys still apply on the same routes.
 */
const GLOBAL_API_SKIP_PREFIXES = [
  '/api/auth/csrf',
  '/api/auth/login',
  '/api/auth/staff-login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-reset-token',
  '/api/admin/login',
];

function isSkippedFromGlobalApiLimiter(req) {
  const p = (req.originalUrl || req.url || '').split('?')[0];
  for (const prefix of GLOBAL_API_SKIP_PREFIXES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

/** Optional Redis client for violation counters (same URL as rate limit store). */
let violationRedis;
function redisCommandTimeoutMs() {
  const v = process.env.RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS;
  if (v === undefined || v === '') return 4000;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 4000;
}

function getViolationRedis() {
  const url = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL;
  if (!url) return null;
  if (violationRedis) return violationRedis;
  try {
    const Redis = require('ioredis');
    violationRedis = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 5000,
      commandTimeout: redisCommandTimeoutMs(),
    });
    violationRedis.on('error', () => {});
    violationRedis.connect().catch(() => {});
  } catch {
    violationRedis = null;
  }
  return violationRedis;
}

function shutdownViolationRedis() {
  const c = violationRedis;
  violationRedis = null;
  if (!c) return;
  try {
    c.quit().catch(() => {});
  } catch (_) {}
}

/** Dedupe burst 429 warn logs (same tier/path/key within window). Repeat-offender errors are not deduped. */
const recent429WarnLogs = new Map();
const DEDUPE_429_MS = 5000;
const DEDUPE_429_MAX_KEYS = 2000;

function shouldLog429Warn(tier, path, keyLog) {
  const k = `${tier}:${path}:${keyLog}`;
  const now = Date.now();
  const last = recent429WarnLogs.get(k);
  if (last != null && now - last < DEDUPE_429_MS) return false;
  recent429WarnLogs.set(k, now);
  if (recent429WarnLogs.size > DEDUPE_429_MAX_KEYS) {
    const cutoff = now - DEDUPE_429_MS;
    for (const [entry, t] of recent429WarnLogs) {
      if (t < cutoff) recent429WarnLogs.delete(entry);
    }
  }
  return true;
}

/**
 * Safe debug id for logs: short hash only (no raw emails, tokens, or key material).
 */
function safeRateLimitKeyLog(key) {
  if (!key || typeof key !== 'string') return 'unknown';
  const h = crypto.createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 8);
  return `rlk:${h}`;
}

function onLimit(req, res, _next, options, limiterType = 'global') {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  const limit = typeof options.limit === 'number' ? options.limit : options.max;
  const keyUsed = req.rateLimitKey || 'unknown';
  const keyForLog = safeRateLimitKeyLog(keyUsed);
  const userId =
    req.user?.id ||
    req.user?._id ||
    req.admin?.id ||
    req.admin?._id ||
    undefined;

  const rc = getViolationRedis();
  if (rc) {
    const vk = `rl:viol:${sha16(keyUsed)}`;
    rc.incr(vk)
      .then((n) => rc.expire(vk, 3600).then(() => n))
      .then((n) => {
        if (n >= 5) {
          logger.error(
            '[rate-limit] repeat offender (>=5 blocks/hour) tier=%s ip=%s path=%s userId=%s key=%s count=%s',
            limiterType,
            req.ip,
            path,
            userId != null ? String(userId) : '-',
            keyForLog,
            n
          );
        }
      })
      .catch(() => {});
  }

  rateLimitMetrics.incrBlocked429(limiterType);

  if (shouldLog429Warn(limiterType, path, keyForLog)) {
    logger.warn(
      '[rate-limit] 429 blocked tier=%s ip=%s path=%s userId=%s key=%s limit=%s',
      limiterType,
      req.ip,
      path,
      userId != null ? String(userId) : '-',
      keyForLog,
      limit
    );
  }

  const info = req.rateLimit;
  let retryAfterSeconds;
  if (info?.resetTime instanceof Date) {
    retryAfterSeconds = Math.max(0, Math.ceil((info.resetTime.getTime() - Date.now()) / 1000));
  }

  res.status(429).json({
    success: false,
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED',
    ...(retryAfterSeconds != null && { retryAfterSeconds }),
  });
}

function noop(_req, _res, next) {
  next();
}

function wrapKeyGenerator(fn) {
  return async (req, res) => {
    const key = await Promise.resolve(fn(req, res));
    req.rateLimitKey = key;
    rateLimitCorrelation.recordRateLimitCorrelation(key, req);
    return key;
  };
}

function buildLimiter(store, options, limiterType, additionalSkip) {
  if (!isEnabled()) {
    return noop;
  }
  const skipCombined =
    typeof additionalSkip === 'function'
      ? (req, res) => skip(req) || additionalSkip(req, res)
      : skip;
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: skipCombined,
    handler: (req, res, next, opts) => onLimit(req, res, next, opts, limiterType),
    store,
    ...options,
  });
}

const storeGlobal = createRateLimitStore('global', 'global');
const storeAuth = createRateLimitStore('auth', 'auth');
const storeExport = createRateLimitStore('export', 'export');
const storeAi = createRateLimitStore('ai', 'ai');

const generalApiLimiter = buildLimiter(
  storeGlobal,
  {
    windowMs: envInt('RATE_LIMIT_GLOBAL_WINDOW_MS', 15 * 60 * 1000),
    max: envInt('RATE_LIMIT_GLOBAL_MAX', 1200),
    message: false,
    keyGenerator: wrapKeyGenerator(globalApiKeyGenerator),
  },
  'global',
  isSkippedFromGlobalApiLimiter
);

const authClusterLimiter = buildLimiter(
  storeAuth,
  {
    windowMs: envInt('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000),
    max: envInt('RATE_LIMIT_AUTH_MAX', 25),
    message: false,
    keyGenerator: wrapKeyGenerator(authClusterKeyGenerator),
  },
  'auth'
);

const reportsExportLimiter = buildLimiter(
  storeExport,
  {
    windowMs: envInt('RATE_LIMIT_EXPORT_WINDOW_MS', 15 * 60 * 1000),
    max: envInt('RATE_LIMIT_EXPORT_MAX', 60),
    message: false,
    keyGenerator: wrapKeyGenerator(reportsExportKeyGenerator),
  },
  'report'
);

const aiIntegrationLimiter = buildLimiter(
  storeAi,
  {
    windowMs: envInt('RATE_LIMIT_AI_WINDOW_MS', 60 * 60 * 1000),
    max: envInt('RATE_LIMIT_AI_MAX', 30),
    message: false,
    keyGenerator: wrapKeyGenerator(aiIntegrationKeyGenerator),
  },
  'ai'
);

/** Close Redis used by rate limit stores and violation counter; safe if already down. */
function shutdownRateLimitInfrastructure() {
  try {
    storeGlobal.shutdown?.();
  } catch (_) {}
  try {
    storeAuth.shutdown?.();
  } catch (_) {}
  try {
    storeExport.shutdown?.();
  } catch (_) {}
  try {
    storeAi.shutdown?.();
  } catch (_) {}
  shutdownViolationRedis();
}

const AUTH_PATH_PREFIXES = [
  '/api/auth/login',
  '/api/auth/staff-login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/admin/login',
];

/**
 * Aggregate Redis health across tier stores (plain MemoryStore = no Redis URL at boot).
 */
function getRateLimitHealthPayload() {
  const redisConfigured = !!(process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL);
  const stores = [storeGlobal, storeAuth, storeExport, storeAi];
  let redis = 'connected';
  if (!redisConfigured) {
    redis = 'degraded';
  } else {
    for (const s of stores) {
      if (typeof s.getRateLimitHealth === 'function') {
        const h = s.getRateLimitHealth();
        if (h.redis === 'degraded') {
          redis = 'degraded';
          break;
        }
      } else {
        redis = 'degraded';
        break;
      }
    }
  }

  const snap = rateLimitMetrics.getSnapshot();
  const payload = {
    status: 'ok',
    rateLimit: isEnabled() ? 'active' : 'disabled',
    redis,
    rateLimitMetrics: {
      ...snap.totals,
      tiers: snap.tiers,
    },
  };

  if (process.env.RATE_LIMIT_METRICS_IN_HEALTH === '0') {
    delete payload.rateLimitMetrics;
  }

  return payload;
}

module.exports = {
  configureTrustProxy,
  validateProductionRateLimitConfig,
  isRateLimitingEnabled: isEnabled,
  generalApiLimiter,
  authClusterLimiter,
  reportsExportLimiter,
  aiIntegrationLimiter,
  AUTH_PATH_PREFIXES,
  shutdownRateLimitInfrastructure,
  getRateLimitHealthPayload,
  registerRateLimitAlertHook: rateLimitAlerts.registerRateLimitAlertHook,
  lookupCorrelationByRateLimitKey: rateLimitCorrelation.lookupCorrelationByRateLimitKey,
  lookupCorrelationBySafeKeyLog: rateLimitCorrelation.lookupCorrelationBySafeKeyLog,
};
