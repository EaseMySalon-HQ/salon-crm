/**
 * Collision-safe rate limit key material (never log raw secrets).
 * JWT subjects are verified with JWT_SECRET before use (same as auth middleware).
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const { COOKIE, TOKEN_USE } = require('../lib/auth-tokens');

function sha16(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 16);
}

function getBearerTenantToken(req) {
  const authHeader = req.headers.authorization;
  const fromHeader = authHeader && authHeader.split(' ')[1];
  if (fromHeader) return fromHeader;
  if (req.cookies && req.cookies[COOKIE.tenantAccess]) {
    return req.cookies[COOKIE.tenantAccess];
  }
  return null;
}

function getBearerAdminToken(req) {
  const fromHeader = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (fromHeader) return fromHeader;
  if (req.cookies && req.cookies[COOKIE.adminAccess]) {
    return req.cookies[COOKIE.adminAccess];
  }
  return null;
}

/**
 * Global /api limiter: prefer verified JWT subject (tenant or platform admin), else IP.
 */
function globalApiKeyGenerator(req) {
  const ip = req.ip || 'unknown';
  const tenantTok = getBearerTenantToken(req);
  if (tenantTok) {
    try {
      const d = jwt.verify(tenantTok, JWT_SECRET);
      if (d.tokenUse === TOKEN_USE.tenantRefresh || d.tokenUse === TOKEN_USE.platformAdmin) {
        return `g:ip:${ip}`;
      }
      if (d.id && (d.tokenUse === TOKEN_USE.tenantAccess || !d.tokenUse)) {
        return `g:tenant:${String(d.id)}`;
      }
    } catch (_) {
      /* invalid or expired — fall through to IP */
    }
  }
  const adminTok = getBearerAdminToken(req);
  if (adminTok) {
    try {
      const d = jwt.verify(adminTok, JWT_SECRET);
      if (d.tokenUse === TOKEN_USE.platformAdmin && d.id) {
        return `g:admin:${String(d.id)}`;
      }
    } catch (_) {
      /* ignore */
    }
  }
  return `g:ip:${ip}`;
}

/**
 * Auth endpoints (body must be parsed — place express.json before this middleware).
 * Prefer normalized email / phone / staff composite; never trust unverified ids.
 */
function authClusterKeyGenerator(req) {
  const ip = req.ip || 'unknown';
  const path = (req.path || '').toLowerCase();
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  if (path.includes('staff-login') || (path.endsWith('/auth/staff-login') && body.businessCode)) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const code = typeof body.businessCode === 'string' ? body.businessCode.trim().toLowerCase() : '';
    if (email) {
      return `a:staff:${sha16(`${email}|${code}`)}`;
    }
  }

  if (typeof body.email === 'string' && body.email.trim()) {
    return `a:email:${sha16(body.email.trim().toLowerCase())}`;
  }

  if (typeof body.mobile === 'string' && body.mobile.trim()) {
    return `a:mobile:${sha16(body.mobile.replace(/\s/g, ''))}`;
  }

  if (path.includes('reset-password') && typeof body.token === 'string' && body.token.length > 0) {
    return `a:reset:${sha16(body.token.slice(0, 128))}`;
  }

  return `a:ip:${ip}`;
}

function sameAsGlobal(req) {
  return globalApiKeyGenerator(req);
}

module.exports = {
  globalApiKeyGenerator,
  authClusterKeyGenerator,
  reportsExportKeyGenerator: sameAsGlobal,
  aiIntegrationKeyGenerator: sameAsGlobal,
  sha16,
};
