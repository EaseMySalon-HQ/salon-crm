/**
 * Centralized double-submit CSRF protection.
 *
 * For state-changing methods (POST, PUT, PATCH, DELETE), requires:
 *   - Cookie `ems_csrf` (readable by JS so the SPA can mirror it)
 *   - Header `X-CSRF-Token` or `X-XSRF-Token` with the same value
 *
 * Safe methods (GET, HEAD, OPTIONS) and explicit bootstrap routes are skipped.
 * GET /api/auth/csrf is safe (no body mutation check); it issues the cookie for first load.
 *
 * Set CSRF_ENABLED=0 to disable (e.g. scripted API clients); not recommended in production.
 */

const crypto = require('crypto');
const { logger } = require('../utils/logger');

const CSRF_COOKIE = 'ems_csrf';
const HEADER_NAMES = ['x-csrf-token', 'x-xsrf-token'];

/** Methods that never require CSRF (no server state change via this layer). */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isCsrfEnabled() {
  return process.env.CSRF_ENABLED !== '0' && process.env.CSRF_ENABLED !== 'false';
}

/** Paths that skip CSRF (login, password reset, token refresh, admin login). */
const SKIP_PREFIXES = [
  '/api/auth/login',
  '/api/auth/staff-login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  /** Refresh uses HttpOnly rotation cookie; SameSite + short-lived access reduce CSRF risk. */
  '/api/auth/refresh',
  '/api/admin/login',
];

function normalizePath(req) {
  const u = req.originalUrl || req.url || '';
  return u.split('?')[0];
}

function shouldSkip(req) {
  const method = (req.method || 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) return true;
  const path = normalizePath(req);
  return SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfCookieOptions() {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1';
  const v = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  const sameSite = v === 'none' || v === 'strict' || v === 'lax' ? v : 'lax';
  return {
    httpOnly: false,
    secure,
    sameSite,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

/**
 * Set CSRF cookie + return token for JSON body (client can mirror before cookie visible).
 */
function setCsrfCookie(res, token) {
  const t = token || generateToken();
  res.cookie(CSRF_COOKIE, t, csrfCookieOptions());
  return t;
}

function csrfProtection(req, res, next) {
  if (!isCsrfEnabled()) return next();
  if (shouldSkip(req)) return next();

  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE];
  let headerToken;
  for (const h of HEADER_NAMES) {
    if (req.headers[h]) {
      headerToken = req.headers[h];
      break;
    }
  }

  if (!cookieToken || !headerToken || cookieToken !== String(headerToken)) {
    logger.warn('CSRF check failed for %s %s', req.method, normalizePath(req));
    return res.status(403).json({
      success: false,
      error: 'Invalid CSRF token',
      message: 'Invalid or missing CSRF token. Call GET /api/auth/csrf then retry.',
    });
  }
  next();
}

module.exports = {
  CSRF_COOKIE,
  csrfProtection,
  setCsrfCookie,
  generateToken,
};
