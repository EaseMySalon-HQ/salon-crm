/**
 * Feature Gate Middleware
 * Enforces feature access based on business plan and overrides
 */

const { hasFeature, getEffectiveLimit, hasReachedLimit, canUseAddon } = require('../lib/entitlements');
const databaseManager = require('../config/database-manager');

/**
 * Middleware to check if business has access to a specific feature
 * @param {String} featureId - Feature ID to check
 * @param {Object} options - Additional options
 * @returns {Function} Express middleware
 */
function requireFeature(featureId, options = {}) {
  return async (req, res, next) => {
    try {
      // Get business ID from user or request
      const businessId = req.user?.branchId || req.businessId || req.params.businessId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found',
        });
      }

      // Get main connection and Business model
      const mainConnection = await databaseManager.getMainConnection();
      const Business = mainConnection.model('Business', require('../models/Business').schema);

      // Fetch business with plan info
      const business = await Business.findById(businessId).select('plan status');

      if (!business) {
        return res.status(404).json({
          success: false,
          error: 'Business not found',
        });
      }

      // Check if business is active
      if (business.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Business account is not active',
        });
      }

      // Check feature access
      const hasAccess = hasFeature(business, featureId);

      if (!hasAccess) {
        const planName = business.plan?.planId || 'none';
        return res.status(403).json({
          success: false,
          error: `Feature "${featureId}" is not available in your current plan (${planName})`,
          code: 'FEATURE_NOT_AVAILABLE',
          planId: planName,
          featureId,
          upgradeRequired: true,
        });
      }

      // Attach business to request for downstream use
      req.business = business;
      next();
    } catch (error) {
      console.error('Error in feature gate middleware:', error);
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
      const businessId = req.user?.branchId || req.businessId || req.params.businessId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found',
        });
      }

      const mainConnection = await databaseManager.getMainConnection();
      const Business = mainConnection.model('Business', require('../models/Business').schema);

      const business = await Business.findById(businessId).select('plan status');

      if (!business) {
        return res.status(404).json({
          success: false,
          error: 'Business not found',
        });
      }

      if (business.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Business account is not active',
        });
      }

      // Get current usage
      const currentUsage = await getCurrentUsage(req, business);

      // Check if limit reached
      const limitReached = hasReachedLimit(business, limitName, currentUsage);

      if (limitReached) {
        const limit = getEffectiveLimit(business, limitName);
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

      req.business = business;
      req.currentUsage = currentUsage;
      req.limit = getEffectiveLimit(business, limitName);
      next();
    } catch (error) {
      console.error('Error in limit check middleware:', error);
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
      const businessId = req.user?.branchId || req.businessId || req.params.businessId;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          error: 'Business ID not found',
        });
      }

      const mainConnection = await databaseManager.getMainConnection();
      const Business = mainConnection.model('Business', require('../models/Business').schema);

      const business = await Business.findById(businessId).select('plan status');

      if (!business) {
        return res.status(404).json({
          success: false,
          error: 'Business not found',
        });
      }

      if (business.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Business account is not active',
        });
      }

      // Check addon availability
      const canUse = canUseAddon(business, addonId);

      if (!canUse) {
        return res.status(403).json({
          success: false,
          error: `Addon "${addonId}" is not enabled or quota exhausted`,
          code: 'ADDON_NOT_AVAILABLE',
          addonId,
          upgradeRequired: true,
        });
      }

      req.business = business;
      next();
    } catch (error) {
      console.error('Error in addon check middleware:', error);
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
    console.error('Error getting business from request:', error);
    return null;
  }
}

module.exports = {
  requireFeature,
  requireLimit,
  requireAddon,
  getBusinessFromRequest,
};

