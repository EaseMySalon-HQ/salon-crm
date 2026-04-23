/**
 * Centralized JWT configuration.
 *
 * SECURITY: Never ship without JWT_SECRET in production. The server refuses to start
 * if NODE_ENV is production and JWT_SECRET is missing.
 *
 * Development: a fixed fallback is used with a loud warning so local sessions survive
 * restarts; still set JWT_SECRET in .env for team consistency.
 */

require('dotenv').config();

const { logger } = require('../utils/logger');

const isProduction =
  process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod';

function resolveJwtSecret() {
  const raw = process.env.JWT_SECRET;
  const trimmed = raw != null ? String(raw).trim() : '';
  if (trimmed.length > 0) {
    return trimmed;
  }
  if (isProduction) {
    throw new Error(
      'FATAL: JWT_SECRET must be set in production. Refusing to start without a signing secret.'
    );
  }
  logger.warn(
    '[SECURITY] JWT_SECRET is not set — using development-only fallback. Set JWT_SECRET in .env for stable local tokens.'
  );
  return 'ease-mysalon-dev-only-jwt-secret-not-for-production-min-32-chars';
}

/** Resolved once at load; throws in production if missing. */
const JWT_SECRET = resolveJwtSecret();

/**
 * Convert a jsonwebtoken-style expiry string ("30d", "12h", "45m", "3600s") or bare
 * seconds number into milliseconds. Used to keep the refresh cookie's browser maxAge
 * in sync with the JWT's `exp` claim so the cookie never outlives the signature, and
 * — just as importantly — the cookie isn't dropped by the browser before the JWT
 * would naturally expire.
 */
function parseExpiresToMs(value, fallbackMs) {
  if (value == null) return fallbackMs;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? value * 1000 : fallbackMs;
  }
  const s = String(value).trim();
  if (!s) return fallbackMs;
  const m = s.match(/^(\d+)\s*([smhdw]?)$/i);
  if (!m) {
    const asNum = Number(s);
    if (Number.isFinite(asNum) && asNum > 0) return asNum * 1000;
    return fallbackMs;
  }
  const n = parseInt(m[1], 10);
  const unit = (m[2] || 's').toLowerCase();
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit];
  return n * mult;
}

/**
 * Refresh token default was `1d`, which forced tenants (salon staff) to re-login every
 * calendar day because the HttpOnly refresh cookie would be dropped by the browser
 * once its 24h maxAge elapsed. Raised to 30d, matching standard SaaS practice. Each
 * refresh rotates the family (one-time-use JWT with reuse detection), so the longer
 * TTL does not widen the practical attack window for a stolen cookie — a reused jti
 * immediately invalidates the whole family.
 */
const refreshExpires = process.env.JWT_REFRESH_EXPIRES || '30d';
const refreshExpiresMs = parseExpiresToMs(refreshExpires, 30 * 86_400_000);

module.exports = {
  JWT_SECRET,
  getJwtSecret: () => JWT_SECRET,
  isProduction,
  /** Access token (tenant or admin) */
  accessExpires: process.env.JWT_ACCESS_EXPIRES || '4h',
  /** Refresh token (tenant) — longer-lived, httpOnly cookie */
  refreshExpires,
  /** Resolved numeric milliseconds, for cookie maxAge. Keep in sync with refreshExpires. */
  refreshExpiresMs,
  /** Legacy single-token expiry (still returned in JSON body for migration) */
  legacyAccessExpires: process.env.JWT_LEGACY_EXPIRES || '24h',
};
