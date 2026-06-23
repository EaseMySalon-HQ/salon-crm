'use strict';

const { getPlanConfig } = require('../config/plans');
const { normalizePlanId } = require('./plan-id');
const entitlementsCache = require('./entitlements-cache');

function advanceRenewalDate(billingPeriod, baseDate = null) {
  const d = baseDate ? new Date(baseDate) : new Date();
  if (Number.isNaN(d.getTime())) {
    return advanceRenewalDate(billingPeriod, new Date());
  }
  if (billingPeriod === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

const LEAD_TRIAL_DAYS = 7;

function buildLeadTrialPlanPayload(planId = 'pro') {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + LEAD_TRIAL_DAYS);
  return {
    planId,
    billingPeriod: 'monthly',
    isTrial: true,
    trialEndsAt,
  };
}

function applyLeadTrialPlan(business, planId = 'pro') {
  return applyInitialBusinessPlan(business, buildLeadTrialPlanPayload(planId));
}

function syncPlanAddonsFromConfig(planObj, planConfig) {
  if (!planConfig?.limits) return;
  if (!planObj.addons) planObj.addons = {};
  const smsLimit = planConfig.limits.smsMessages ?? 0;
  if (!planObj.addons.sms) planObj.addons.sms = {};
  planObj.addons.sms.quota = smsLimit;
  planObj.addons.sms.enabled = smsLimit > 0;
  const whatsappLimit = planConfig.limits.whatsappMessages ?? 0;
  if (!planObj.addons.whatsapp) planObj.addons.whatsapp = {};
  planObj.addons.whatsapp.quota = whatsappLimit;
  planObj.addons.whatsapp.enabled = whatsappLimit > 0;
}

/**
 * Apply plan fields on a new Business document before first save.
 * @param {import('mongoose').Document} business
 * @param {object} [planPayload]
 */
function applyInitialBusinessPlan(business, planPayload = {}) {
  const planId = normalizePlanId(planPayload.planId || 'starter');
  const planConfig = getPlanConfig(planId);
  if (!planConfig) {
    const err = new Error(`Invalid plan ID: ${planPayload.planId || planId}`);
    err.code = 'INVALID_PLAN';
    throw err;
  }

  const billingPeriod = planPayload.billingPeriod === 'yearly' ? 'yearly' : 'monthly';
  const overrides = planPayload.overrides || {};

  business.plan = business.plan || {};
  business.plan.planId = planId;
  business.plan.billingPeriod = billingPeriod;
  business.plan.isTrial = planPayload.isTrial === true;
  if (business.plan.isTrial) {
    business.plan.trialEndsAt = planPayload.trialEndsAt
      ? new Date(planPayload.trialEndsAt)
      : advanceRenewalDate(billingPeriod);
    business.plan.renewalDate = null;
  } else {
    business.plan.trialEndsAt = null;
    business.plan.renewalDate = advanceRenewalDate(billingPeriod);
  }
  business.plan.overrides = {
    features: Array.isArray(overrides.features) ? overrides.features : [],
    disabledFeatures: Array.isArray(overrides.disabledFeatures) ? overrides.disabledFeatures : [],
    expiresAt: overrides.expiresAt ? new Date(overrides.expiresAt) : null,
    notes: overrides.notes || '',
  };

  if (planPayload.addons && typeof planPayload.addons === 'object') {
    business.plan.addons = planPayload.addons;
  }

  syncPlanAddonsFromConfig(business.plan, planConfig);
  return { planId, billingPeriod, renewalDate: business.plan.renewalDate };
}

function invalidatePlanCache(businessId) {
  entitlementsCache.invalidate(businessId);
}

module.exports = {
  applyInitialBusinessPlan,
  applyLeadTrialPlan,
  buildLeadTrialPlanPayload,
  advanceRenewalDate,
  invalidatePlanCache,
  LEAD_TRIAL_DAYS,
};
