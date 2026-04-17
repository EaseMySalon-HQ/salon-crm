/**
 * Structured tenant auth audit lines (login/logout/refresh) for production troubleshooting.
 * Uses logger.audit so events are emitted even when LOG_LEVEL=warn.
 */

const { logger } = require('./logger');
const { getClientIp } = require('./admin-logger');

function requestContext(req) {
  return {
    ip: getClientIp(req),
    userAgent:
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent'].slice(0, 500)
        : undefined,
  };
}

/**
 * Successful owner or staff login (password validated, session issued).
 * @param {'user'|'staff'} subjectType
 */
function logTenantLoginSuccess(req, { subjectType, userId, email, branchId, businessCode }) {
  logger.audit('[tenant-auth] login_success', {
    event: 'tenant_login_success',
    subjectType,
    userId: userId != null ? String(userId) : undefined,
    email: typeof email === 'string' ? email.toLowerCase() : undefined,
    branchId: branchId != null ? String(branchId) : undefined,
    businessCode: businessCode || undefined,
    ...requestContext(req),
  });
}

/** Allow-list of known client-supplied logout reasons so the body can't inject arbitrary text into logs. */
const LOGOUT_REASONS = new Set([
  'user_initiated',
  'session_timeout',
  'session_expired',
  'impersonation_exit',
  'account_suspended',
]);

function normalizeLogoutReason(raw) {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;
  return LOGOUT_REASONS.has(trimmed) ? trimmed : 'unknown';
}

/**
 * Successful POST /api/auth/logout (token presented, cookies cleared).
 */
function logTenantLogoutSuccess(req, extra = {}) {
  const reason = normalizeLogoutReason(req.body && req.body.reason);
  const u = req.user;
  if (!u) {
    logger.audit('[tenant-auth] logout_success', {
      event: 'tenant_logout_success',
      warning: 'missing_req_user',
      reason,
      ...requestContext(req),
      ...extra,
    });
    return;
  }
  logger.audit('[tenant-auth] logout_success', {
    event: 'tenant_logout_success',
    reason,
    subjectType: u.authSubject,
    userId: String(u._id || u.id),
    email: u.email,
    branchId: u.branchId != null ? String(u.branchId) : undefined,
    role: u.role,
    isImpersonation: Boolean(u.isImpersonation),
    impersonatedBy: u.impersonatedBy != null ? String(u.impersonatedBy) : undefined,
    ...requestContext(req),
    ...extra,
  });
}

/**
 * POST /api/auth/refresh returned an error — helps correlate unexpected client logouts
 * (401/403 from refresh) with IP, path, and stable ids from the token when decodable.
 *
 * @param {'refresh_cookie'|'legacy_access'|'unknown'} path
 * @param {string} [fields.reason] machine-readable reason code
 */
function logTenantRefreshFailure(req, fields) {
  const f = fields && typeof fields === 'object' ? fields : {};
  logger.audit('[tenant-auth] refresh_failure', {
    event: 'tenant_refresh_failure',
    ...requestContext(req),
    ...f,
  });
}

/** Max string lengths for untrusted body fields — keep log lines bounded. */
const MAX_URL_LEN = 500;
const MAX_MSG_LEN = 500;
const MAX_SOURCE_LEN = 64;
const MAX_ID_LEN = 64;
const MAX_EMAIL_LEN = 254;

function str(value, maxLen) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function int(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Client-side beacon fired by `handleSessionExpired` right before the SPA redirects to /login
 * after a 401/403 cascade the browser could not recover from. There is no session to
 * authenticate this endpoint; treat all body fields as untrusted.
 */
function logTenantSessionExpiredClient(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  logger.audit('[tenant-auth] session_expired_client', {
    event: 'tenant_session_expired_client',
    source: str(body.source, MAX_SOURCE_LEN),
    status: int(body.status),
    requestUrl: str(body.requestUrl, MAX_URL_LEN),
    errorMessage: str(body.errorMessage, MAX_MSG_LEN),
    pathname: str(body.pathname, MAX_URL_LEN),
    userId: str(body.userId, MAX_ID_LEN),
    email: (() => {
      const e = str(body.email, MAX_EMAIL_LEN);
      return e ? e.toLowerCase() : undefined;
    })(),
    clientTs: str(body.ts, 40),
    ...requestContext(req),
  });
}

module.exports = {
  logTenantLoginSuccess,
  logTenantLogoutSuccess,
  logTenantRefreshFailure,
  logTenantSessionExpiredClient,
};
