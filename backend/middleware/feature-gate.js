/**
 * Feature Gate Middleware
 * Enforces feature access based on business plan and overrides
 */

const { canUseAddon } = require('../lib/entitlements');
const databaseManager = require('../config/database-manager');
const entitlementsCache = require('../lib/entitlements-cache');
const { logger } = require('../utils/logger');

/**
 * Resolve the business id for the current request.
 */
function resolveBusinessId(req) {
  return req.user?.branchId || req.businessId || req.params?.businessId || null;
}

/**
 * Middleware that loads the business's effective entitlements ONCE per request
 * (from the short-TTL cache) and attaches them to `req.entitlements`. Mount it
 * right after `setupBusinessDatabase` so all downstream feature/limit checks
 * read from `req.entitlements` instead of hitting the DB per route.
 *
 * This is intentionally non-fatal: if the business cannot be resolved we leave
 * `req.entitlements` undefined and let the per-gate middleware decide.
 */
async function loadEntitlements(req, res, next) {
  try {
    const businessId = resolveBusinessId(req);
    if (!businessId) {
      return next();
    }
    const entry = await entitlementsCache.resolve(businessId);
    if (entry) {
      req.entitlements = entry;
    }
    next();
  } catch (error) {
    logger.warn('loadEntitlements failed (continuing without cache):', error.message);
    next();
  }
}

/**
 * Ensure `req.entitlements` is populated, resolving + caching on demand.
 * Returns the entry, or null if the business is missing.
 */
async function ensureEntitlements(req) {
  if (req.entitlements) {
    return req.entitlements;
  }
  const businessId = resolveBusinessId(req);
  if (!businessId) {
    return null;
  }
  const entry = await entitlementsCache.resolve(businessId);
  if (entry) {
    req.entitlements = entry;
  }
  return entry || null;
}

/**
 * Middleware to check if business has access to a specific feature
 * @param {String} featureId - Feature ID to check
 * @param {Object} options - Additional options
 * @returns {Function} Express middleware
 */
const FEATURE_UPGRADE_MESSAGES = {
  attendance:
    'Attendance and timesheets are available on the Growth plan and above. Please upgrade to use them.',
  payroll:
    'Payroll and salary formulas are available on the Pro plan. Please upgrade to run payroll.',
};

function requireFeature(featureId, options = {}) {
  return async (req, res, next) => {
    try {
      const entitlements = await ensureEntitlements(req);

      if (!entitlements) {
        // Either no business id, or the business doesn't exist.
        return res.status(resolveBusinessId(req) ? 404 : 400).json({
          success: false,
          error: resolveBusinessId(req) ? 'Business not found' : 'Business ID not found',
        });
      }

      // Check if business is active
      if (entitlements.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Business account is not active',
        });
      }

      // Check feature access (from cached effective features)
      if (!entitlements.features.has(featureId)) {
        const planName = entitlements.planId || 'none';
        return res.status(403).json({
          success: false,
          error:
            FEATURE_UPGRADE_MESSAGES[featureId] ||
            options.message ||
            `Feature "${featureId}" is not available in your current plan (${planName})`,
          code: 'FEATURE_NOT_AVAILABLE',
          planId: planName,
          featureId,
          upgradeRequired: true,
        });
      }

      next();
    } catch (error) {
      logger.error('Error in feature gate middleware:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify feature access',
      });
    }
  };
}

/**
 * Middleware that grants access if the business has ANY of the listed features.
 * Useful when one route surface is shared by multiple plan features.
 * @param {string[]} featureIds
 */
function requireAnyFeature(featureIds) {
  const list = Array.isArray(featureIds) ? featureIds : [featureIds];
  return async (req, res, next) => {
    try {
      const entitlements = await ensureEntitlements(req);

      if (!entitlements) {
        return res.status(resolveBusinessId(req) ? 404 : 400).json({
          success: false,
          error: resolveBusinessId(req) ? 'Business not found' : 'Business ID not found',
        });
      }

      if (entitlements.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Business account is not active',
        });
      }

      const allowed = list.some((f) => entitlements.features.has(f));
      if (!allowed) {
        const planName = entitlements.planId || 'none';
        return res.status(403).json({
          success: false,
          error: `This feature is not available in your current plan (${planName})`,
          code: 'FEATURE_NOT_AVAILABLE',
          planId: planName,
          featureId: list[0],
          requiredAnyOf: list,
          upgradeRequired: true,
        });
      }

      next();
    } catch (error) {
      logger.error('Error in requireAnyFeature middleware:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify feature access',
      });
    }
  };
}

/**
 * Middleware to check if business has reached a usage limit
 * @param {String} limitName - Limit name (e.g., 'locations', 'whatsappMessages')
 * @param {Function} getCurrentUsage - Function to get current usage count
 * @returns {Function} Express middleware
 */
function requireLimit(limitName, getCurrentUsage) {
  return async (req, res, next) => {
    try {
      const entitlements = await ensureEntitlements(req);

      if (!entitlements) {
        return res.status(resolveBusinessId(req) ? 404 : 400).json({
          success: false,
          error: resolveBusinessId(req) ? 'Business not found' : 'Business ID not found',
        });
      }

      if (entitlements.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Business account is not active',
        });
      }

      const limit = entitlements.limits?.[limitName] ?? 0;

      // Get current usage
      const currentUsage = await getCurrentUsage(req, entitlements);

      const limitReached = limit !== Infinity && currentUsage >= limit;

      if (limitReached) {
        return res.status(403).json({
          success: false,
          error: `Usage limit reached for ${limitName}`,
          code: 'LIMIT_REACHED',
          limitName,
          currentUsage,
          limit,
          upgradeRequired: true,
        });
      }

      req.currentUsage = currentUsage;
      req.limit = limit;
      next();
    } catch (error) {
      logger.error('Error in limit check middleware:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify usage limit',
      });
    }
  };
}

/**
 * Middleware to check if addon is enabled and has quota
 * @param {String} addonId - Addon ID (e.g., 'whatsapp', 'sms')
 * @returns {Function} Express middleware
 */
function requireAddon(addonId) {
  return async (req, res, next) => {
    try {
      const entitlements = await ensureEntitlements(req);

      if (!entitlements) {
        return res.status(resolveBusinessId(req) ? 404 : 400).json({
          success: false,
          error: resolveBusinessId(req) ? 'Business not found' : 'Business ID not found',
        });
      }

      if (entitlements.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Business account is not active',
        });
      }

      // Check addon availability against the cached plan info.
      const canUse = canUseAddon(
        { plan: { addons: entitlements.planInfo?.addons || {} } },
        addonId,
      );

      if (!canUse) {
        return res.status(403).json({
          success: false,
          error: `Addon "${addonId}" is not enabled or quota exhausted`,
          code: 'ADDON_NOT_AVAILABLE',
          addonId,
          upgradeRequired: true,
        });
      }

      next();
    } catch (error) {
      logger.error('Error in addon check middleware:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify addon access',
      });
    }
  };
}

/**
 * Helper function to get business from request
 * Useful for routes that need business info but don't require feature gating
 */
async function getBusinessFromRequest(req) {
  try {
    const businessId = req.user?.branchId || req.businessId || req.params.businessId;

    if (!businessId) {
      return null;
    }

    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);

    return await Business.findById(businessId).select('plan status name code');
  } catch (error) {
    logger.error('Error getting business from request:', error);
    return null;
  }
}

module.exports = {
  loadEntitlements,
  ensureEntitlements,
  requireFeature,
  requireAnyFeature,
  requireLimit,
  requireAddon,
  getBusinessFromRequest,
};

