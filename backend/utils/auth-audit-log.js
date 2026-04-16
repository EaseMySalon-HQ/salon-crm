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

/**
 * Successful POST /api/auth/logout (token presented, cookies cleared).
 */
function logTenantLogoutSuccess(req, extra = {}) {
  const u = req.user;
  if (!u) {
    logger.audit('[tenant-auth] logout_success', {
      event: 'tenant_logout_success',
      warning: 'missing_req_user',
      ...requestContext(req),
      ...extra,
    });
    return;
  }
  logger.audit('[tenant-auth] logout_success', {
    event: 'tenant_logout_success',
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

module.exports = {
  logTenantLoginSuccess,
  logTenantLogoutSuccess,
  logTenantRefreshFailure,
};
