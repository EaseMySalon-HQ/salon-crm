'use strict';

/**
 * Plan feature bundles — one admin toggle maps to multiple gated feature ids.
 */

const { normalizePlanId } = require('./plan-id');

const GMB_BUNDLE_ID = 'gmb';

/** Individual feature ids enforced by API gates. */
const GMB_EXPANDED_IDS = [
  'gmb_connect',
  'gmb_reviews_read',
  'gmb_reviews_reply',
  'gmb_health',
  'gmb_sync',
  'gmb_insights',
  'gmb_conversion_tracking',
];

/** Legacy plan-storage ids collapsed into GMB_BUNDLE_ID (excludes GMB_BUNDLE_ID itself). */
const GMB_LEGACY_IDS = [
  'gmb_connect',
  'gmb_reviews_read',
  'gmb_reviews_reply',
  'gmb_advanced',
  'gmb_health',
  'gmb_sync',
  'gmb_insights',
  'gmb_conversion_tracking',
];

const GMB_LEGACY_SET = new Set(GMB_LEGACY_IDS);

function gmbExpansionForPlan(planId) {
  const id = normalizePlanId(planId);
  if (id === 'starter') {
    return ['gmb_connect', 'gmb_reviews_read'];
  }
  if (id === 'growth') {
    return ['gmb_connect', 'gmb_reviews_read', 'gmb_reviews_reply'];
  }
  return [...GMB_EXPANDED_IDS];
}

function hasGmbBundle(featureIds) {
  const set = new Set(featureIds || []);
  return set.has(GMB_BUNDLE_ID) || GMB_LEGACY_IDS.some((id) => set.has(id));
}

/** Expand bundle id into tier-appropriate gated feature ids. */
function expandPlanFeatureBundles(featureIds, planId) {
  const result = new Set(featureIds || []);
  if (!hasGmbBundle(featureIds)) {
    return [...result];
  }
  for (const id of gmbExpansionForPlan(planId)) {
    result.add(id);
  }
  return [...result];
}

/** Collapse legacy GMB ids into the single bundle id for plan storage. */
function normalizePlanFeaturesForStorage(featureIds) {
  const input = Array.isArray(featureIds) ? featureIds : [];
  const withoutLegacy = input.filter((id) => !GMB_LEGACY_SET.has(id));
  const enabled = hasGmbBundle(input);

  if (enabled) {
    const next = withoutLegacy.filter((id) => id !== GMB_BUNDLE_ID);
    next.push(GMB_BUNDLE_ID);
    return next;
  }

  return withoutLegacy.filter((id) => id !== GMB_BUNDLE_ID);
}

module.exports = {
  GMB_BUNDLE_ID,
  GMB_EXPANDED_IDS,
  GMB_LEGACY_IDS,
  hasGmbBundle,
  expandPlanFeatureBundles,
  normalizePlanFeaturesForStorage,
};
