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

/** Paths that skip CSRF (login, password reset, token refresh, logout, admin login). */
const SKIP_PREFIXES = [
  '/api/auth/login',
  '/api/auth/staff-login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  /** Refresh uses HttpOnly rotation cookie; SameSite + short-lived access reduce CSRF risk. */
  '/api/auth/refresh',
  '/api/auth/logout',
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

/** Same list as server.js CORS — SPA origin must match for credentialed requests anyway. */
function isOriginAllowed(origin) {
  if (!origin || typeof origin !== 'string') return false;
  const allowed = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  return allowed.includes(origin);
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfCookieOptions() {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1';
  /**
   * Cross-site credentialed XHR (SPA origin ≠ API origin): SameSite=Lax cookies are NOT sent on
   * cross-site POST/PUT/PATCH/DELETE, so the double-submit check always fails. Use None+Secure in
   * production unless overridden (e.g. same-origin API behind one host).
   * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite
   */
  const raw =
    process.env.CSRF_COOKIE_SAME_SITE ||
    process.env.COOKIE_SAME_SITE ||
    (secure ? 'none' : 'lax');
  const v = String(raw).toLowerCase();
  const sameSite = v === 'none' || v === 'strict' || v === 'lax' ? v : 'lax';
  /** SameSite=None requires Secure; browsers reject None without it. */
  const cookieSecure = sameSite === 'none' ? true : secure;
  return {
    httpOnly: false,
    secure: cookieSecure,
    sameSite,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
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

  /*
   * Bearer-token auth is inherently CSRF-safe: an attacker on another origin
   * cannot read localStorage to forge the Authorization header.  When the SPA
   * and API live on different hosts, the ems_csrf cookie is often blocked by
   * third-party cookie policies (ITP, Chrome partitioning) even with
   * SameSite=None, so the double-submit check always fails.  Skip CSRF for
   * requests that already carry a Bearer token.
   */
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ') && authHeader.length > 10) {
    return next();
  }

  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE];
  let headerToken;
  for (const h of HEADER_NAMES) {
    if (req.headers[h]) {
      headerToken = req.headers[h];
      break;
    }
  }

  const headerStr = headerToken != null ? String(headerToken) : '';
  const doubleSubmitOk =
    cookieToken && headerStr && cookieToken === headerStr;

  if (doubleSubmitOk) {
    return next();
  }

  /*
   * Cross-origin SPA:
   * 1) Some browsers block `ems_csrf` — cookie missing but header present.
   * 2) Stale cookie: old `ems_csrf` cookie + newer `X-CSRF-Token` from JSON (profile/login
   *    rotated token; sessionStorage updated but browser still sends old cookie).
   * If Origin matches CORS_ORIGINS and header looks like our hex token, accept.
   */
  if (
    headerStr.length >= 64 &&
    isOriginAllowed(req.headers.origin) &&
    (!cookieToken || cookieToken !== headerStr)
  ) {
    return next();
  }

  logger.warn('CSRF check failed for %s %s', req.method, normalizePath(req));
  return res.status(403).json({
    success: false,
    error: 'Invalid CSRF token',
    message: 'Invalid or missing CSRF token. Call GET /api/auth/csrf then retry.',
  });
}

module.exports = {
  CSRF_COOKIE,
  csrfProtection,
  setCsrfCookie,
  generateToken,
};
