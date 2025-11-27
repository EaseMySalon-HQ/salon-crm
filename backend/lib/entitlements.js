/**
 * Entitlement Management System
 * Handles feature access, limits, and plan-based permissions
 */

const { getPlanConfig, getFeature, getAddon } = require('../config/plans');

/**
 * Get effective features for a business
 * Merges plan features with promotional overrides
 * @param {Object} business - Business document
 * @returns {Array} Array of feature IDs
 */
function getEffectiveFeatures(business) {
  if (!business || !business.plan) {
    return [];
  }

  const planConfig = getPlanConfig(business.plan.planId);
  if (!planConfig) {
    return [];
  }

  // Start with plan features
  const planFeatures = [...planConfig.features];

  // Check if overrides have expired
  const now = new Date();
  const overrides = business.plan.overrides || {};
  let overrideFeatures = [];

  if (overrides.features && Array.isArray(overrides.features)) {
    // Check if overrides have expired
    if (!overrides.expiresAt || new Date(overrides.expiresAt) > now) {
      overrideFeatures = overrides.features;
    }
  }

  // Merge plan features with overrides (overrides take precedence)
  const effectiveFeatures = [...new Set([...planFeatures, ...overrideFeatures])];

  return effectiveFeatures;
}

/**
 * Check if business has access to a specific feature
 * @param {Object} business - Business document
 * @param {String} featureId - Feature ID to check
 * @returns {Boolean}
 */
function hasFeature(business, featureId) {
  if (!business || !featureId) {
    return false;
  }

  const effectiveFeatures = getEffectiveFeatures(business);
  return effectiveFeatures.includes(featureId);
}

/**
 * Get effective limit for a business
 * @param {Object} business - Business document
 * @param {String} limitName - Limit name (e.g., 'locations', 'whatsappMessages')
 * @returns {Number|Infinity}
 */
function getEffectiveLimit(business, limitName) {
  if (!business || !business.plan) {
    return 0;
  }

  const planConfig = getPlanConfig(business.plan.planId);
  if (!planConfig || !planConfig.limits) {
    return 0;
  }

  // Get plan limit
  const planLimit = planConfig.limits[limitName] || 0;

  // Check for override in business.plan.overrides.limits (if we add this later)
  // For now, return plan limit
  return planLimit;
}

/**
 * Check if business has reached a limit
 * @param {Object} business - Business document
 * @param {String} limitName - Limit name
 * @param {Number} currentUsage - Current usage count
 * @returns {Boolean}
 */
function hasReachedLimit(business, limitName, currentUsage) {
  const limit = getEffectiveLimit(business, limitName);
  
  if (limit === Infinity) {
    return false; // Unlimited
  }

  return currentUsage >= limit;
}

/**
 * Get addon status
 * @param {Object} business - Business document
 * @param {String} addonId - Addon ID (e.g., 'whatsapp', 'sms')
 * @returns {Object} { enabled: Boolean, quota: Number, used: Number, remaining: Number }
 */
function getAddonStatus(business, addonId) {
  if (!business || !business.plan || !business.plan.addons) {
    return { enabled: false, quota: 0, used: 0, remaining: 0 };
  }

  const addon = business.plan.addons[addonId];
  if (!addon) {
    return { enabled: false, quota: 0, used: 0, remaining: 0 };
  }

  const quota = addon.quota || 0;
  const used = addon.used || 0;
  const remaining = Math.max(0, quota - used);

  return {
    enabled: addon.enabled || false,
    quota,
    used,
    remaining,
  };
}

/**
 * Check if addon is enabled and has quota remaining
 * @param {Object} business - Business document
 * @param {String} addonId - Addon ID
 * @returns {Boolean}
 */
function canUseAddon(business, addonId) {
  const status = getAddonStatus(business, addonId);
  return status.enabled && status.remaining > 0;
}

/**
 * Get plan information for a business
 * @param {Object} business - Business document
 * @returns {Object} Plan configuration with effective features
 */
function getPlanInfo(business) {
  if (!business || !business.plan) {
    return null;
  }

  const planConfig = getPlanConfig(business.plan.planId);
  if (!planConfig) {
    return null;
  }

  const effectiveFeatures = getEffectiveFeatures(business);
  const overrides = business.plan.overrides || {};

  return {
    planId: business.plan.planId,
    name: planConfig.name,
    planName: planConfig.name,
    description: planConfig.description,
    monthlyPrice: planConfig.monthlyPrice,
    yearlyPrice: planConfig.yearlyPrice,
    billingPeriod: business.plan.billingPeriod,
    renewalDate: business.plan.renewalDate,
    isTrial: business.plan.isTrial || false,
    trialEndsAt: business.plan.trialEndsAt,
    features: effectiveFeatures,
    limits: planConfig.limits,
    support: planConfig.support,
    hasOverrides: overrides.features && overrides.features.length > 0,
    overridesExpiresAt: overrides.expiresAt,
    addons: business.plan.addons || {},
  };
}

/**
 * Check if business is on trial and if trial has expired
 * @param {Object} business - Business document
 * @returns {Object} { isTrial: Boolean, isExpired: Boolean, daysRemaining: Number }
 */
function getTrialStatus(business) {
  if (!business || !business.plan) {
    return { isTrial: false, isExpired: false, daysRemaining: 0 };
  }

  const isTrial = business.plan.isTrial || false;
  const trialEndsAt = business.plan.trialEndsAt;

  if (!isTrial || !trialEndsAt) {
    return { isTrial: false, isExpired: false, daysRemaining: 0 };
  }

  const now = new Date();
  const expiryDate = new Date(trialEndsAt);
  const isExpired = expiryDate < now;
  const daysRemaining = isExpired ? 0 : Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

  return {
    isTrial: true,
    isExpired,
    daysRemaining,
  };
}

/**
 * Check if business plan has expired (for manual billing scenarios)
 * @param {Object} business - Business document
 * @returns {Boolean}
 */
function isPlanExpired(business) {
  if (!business || !business.plan) {
    return true; // No plan = expired
  }

  const renewalDate = business.plan.renewalDate;
  if (!renewalDate) {
    return false; // No renewal date = active (manual management)
  }

  const now = new Date();
  return new Date(renewalDate) < now;
}

module.exports = {
  getEffectiveFeatures,
  hasFeature,
  getEffectiveLimit,
  hasReachedLimit,
  getAddonStatus,
  canUseAddon,
  getPlanInfo,
  getTrialStatus,
  isPlanExpired,
};

