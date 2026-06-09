/**
 * Canonical subscription plan ids: starter, growth, pro only.
 *
 * Legacy ids (free, professional, enterprise) are normalized at read/write
 * time and migrated to canonical ids on startup — not exposed in admin UI.
 */

const CANONICAL_PLAN_IDS = ['starter', 'growth', 'pro'];

/** Retired plan template ids — deactivated on sync */
const LEGACY_PLAN_IDS = ['free', 'professional', 'enterprise'];

/** Maps legacy business/template ids to canonical tier */
const LEGACY_PLAN_ID_ALIASES = {
  free: 'starter',
  professional: 'pro',
  enterprise: 'pro',
};

const PLAN_TIER_ORDER = {
  starter: 0,
  growth: 1,
  pro: 2,
};

const PLAN_DISPLAY_NAMES = {
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
};

function normalizePlanId(planId) {
  if (!planId) return 'starter';
  if (CANONICAL_PLAN_IDS.includes(planId)) return planId;
  return LEGACY_PLAN_ID_ALIASES[planId] || planId;
}

function tierOf(planId) {
  const normalized = normalizePlanId(planId);
  return PLAN_TIER_ORDER[normalized] ?? 0;
}

function isCanonicalPlanId(planId) {
  return typeof planId === 'string' && CANONICAL_PLAN_IDS.includes(planId);
}

function isValidPlanId(planId) {
  if (!planId) return false;
  return CANONICAL_PLAN_IDS.includes(normalizePlanId(planId));
}

function planDisplayName(planId) {
  const normalized = normalizePlanId(planId);
  return PLAN_DISPLAY_NAMES[normalized] || String(planId || 'Plan');
}

module.exports = {
  CANONICAL_PLAN_IDS,
  LEGACY_PLAN_IDS,
  LEGACY_PLAN_ID_ALIASES,
  PLAN_TIER_ORDER,
  normalizePlanId,
  tierOf,
  isCanonicalPlanId,
  isValidPlanId,
  planDisplayName,
};
