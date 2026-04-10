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

module.exports = {
  JWT_SECRET,
  getJwtSecret: () => JWT_SECRET,
  isProduction,
  /** Access token (tenant or admin) */
  accessExpires: process.env.JWT_ACCESS_EXPIRES || '4h',
  /** Refresh token (tenant) — longer-lived, httpOnly cookie */
  refreshExpires: process.env.JWT_REFRESH_EXPIRES || '1d',
  /** Legacy single-token expiry (still returned in JSON body for migration) */
  legacyAccessExpires: process.env.JWT_LEGACY_EXPIRES || '24h',
};
