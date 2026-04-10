/**
 * Tenant (salon) auth: access + refresh JWTs and HttpOnly cookies.
 * Platform admin tokens use the same signing secret with tokenUse: platform_admin.
 *
 * Cookies are defense-in-depth alongside Authorization Bearer (migration-friendly).
 */

const jwt = require('jsonwebtoken');
const {
  JWT_SECRET,
  accessExpires,
  refreshExpires,
  legacyAccessExpires,
} = require('../config/jwt');

/** Cookie names — avoid embedding secrets in names */
const COOKIE = {
  tenantAccess: 'ems_tenant_access',
  tenantRefresh: 'ems_tenant_refresh',
  adminAccess: 'ems_admin_access',
  adminRefresh: 'ems_admin_refresh',
};

const TOKEN_USE = {
  tenantAccess: 'tenant_access',
  tenantRefresh: 'tenant_refresh',
  platformAdmin: 'platform_admin',
};

function isSecureCookie() {
  return process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1';
}

/**
 * Cross-origin credentialed XHR (SPA origin ≠ API origin) requires SameSite=None + Secure.
 * Auto-detect: if CORS_ORIGINS is set we're in a cross-origin deployment, or if NODE_ENV
 * is production. Override with COOKIE_SAME_SITE env var for same-origin deployments.
 */
function sameSiteValue() {
  const v = process.env.COOKIE_SAME_SITE;
  if (v) {
    const lower = v.toLowerCase();
    if (lower === 'none' || lower === 'strict' || lower === 'lax') return lower;
  }
  if (process.env.CORS_ORIGINS) return 'none';
  return isSecureCookie() ? 'none' : 'lax';
}

function baseCookieOptions(maxAgeMs) {
  const sameSite = sameSiteValue();
  return {
    httpOnly: true,
    secure: sameSite === 'none' ? true : isSecureCookie(),
    sameSite,
    path: '/',
    maxAge: maxAgeMs,
  };
}

function accessMaxAgeMs() {
  return 4 * 60 * 60 * 1000;
}

function refreshMaxAgeMs() {
  return 24 * 60 * 60 * 1000;
}

/**
 * Build payload for tenant access token (User or Staff shape).
 */
function buildTenantAccessPayload(user) {
  const payload = {
    id: user._id || user.id,
    email: user.email,
    role: user.role,
    tokenUse: TOKEN_USE.tenantAccess,
  };
  if (user.branchId) payload.branchId = user.branchId;
  if (user.isImpersonation) {
    payload.isImpersonation = true;
    payload.impersonatedBy = user.impersonatedBy;
  }
  return payload;
}

function signTenantAccess(user, expiresIn) {
  return jwt.sign(buildTenantAccessPayload(user), JWT_SECRET, {
    expiresIn: expiresIn || accessExpires,
  });
}

/** Legacy single token TTL (returned in JSON for clients still using localStorage). */
function signTenantAccessLegacy(user) {
  return jwt.sign(buildTenantAccessPayload(user), JWT_SECRET, {
    expiresIn: legacyAccessExpires,
  });
}

function signTenantRefresh({ id, branchId, jti, familyId }) {
  const payload = {
    id,
    tokenUse: TOKEN_USE.tenantRefresh,
  };
  if (branchId) payload.branchId = branchId;
  if (jti) payload.jti = jti;
  if (familyId) payload.familyId = familyId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: refreshExpires });
}

function signPlatformAdminAccess(admin) {
  return jwt.sign(
    {
      id: admin._id || admin.id,
      role: admin.role,
      tokenUse: TOKEN_USE.platformAdmin,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function setTenantAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(COOKIE.tenantAccess, accessToken, baseCookieOptions(accessMaxAgeMs()));
  res.cookie(COOKIE.tenantRefresh, refreshToken, baseCookieOptions(refreshMaxAgeMs()));
}

function clearTenantAuthCookies(res) {
  const clearOpts = baseCookieOptions(0);
  clearOpts.maxAge = 0;
  res.clearCookie(COOKIE.tenantAccess, clearOpts);
  res.clearCookie(COOKIE.tenantRefresh, clearOpts);
  res.cookie(COOKIE.tenantAccess, '', clearOpts);
  res.cookie(COOKIE.tenantRefresh, '', clearOpts);
}

function setAdminAuthCookies(res, { accessToken }) {
  res.cookie(COOKIE.adminAccess, accessToken, baseCookieOptions(24 * 60 * 60 * 1000));
}

function clearAdminAuthCookies(res) {
  const clearOpts = baseCookieOptions(0);
  clearOpts.maxAge = 0;
  res.clearCookie(COOKIE.adminAccess, clearOpts);
  res.cookie(COOKIE.adminAccess, '', clearOpts);
}

module.exports = {
  COOKIE,
  TOKEN_USE,
  buildTenantAccessPayload,
  signTenantAccess,
  signTenantAccessLegacy,
  signTenantRefresh,
  signPlatformAdminAccess,
  setTenantAuthCookies,
  clearTenantAuthCookies,
  setAdminAuthCookies,
  clearAdminAuthCookies,
};
