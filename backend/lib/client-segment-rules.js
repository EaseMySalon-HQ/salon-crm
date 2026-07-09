'use strict';

const DEFAULT_CLIENT_SEGMENT_RULES = {
  newMaxVisits: 2,
  vipSpendThreshold: 50_000,
  atRiskAfterDays: 45,
  winBackAfterDays: 90,
};

function mergeClientSegmentRules(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    newMaxVisits: positiveInt(src.newMaxVisits, DEFAULT_CLIENT_SEGMENT_RULES.newMaxVisits),
    vipSpendThreshold: positiveNumber(src.vipSpendThreshold, DEFAULT_CLIENT_SEGMENT_RULES.vipSpendThreshold),
    atRiskAfterDays: positiveInt(src.atRiskAfterDays, DEFAULT_CLIENT_SEGMENT_RULES.atRiskAfterDays),
    winBackAfterDays: positiveInt(src.winBackAfterDays, DEFAULT_CLIENT_SEGMENT_RULES.winBackAfterDays),
  };
}

function positiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function validateClientSegmentRules(rules) {
  const merged = mergeClientSegmentRules(rules);
  if (merged.winBackAfterDays <= merged.atRiskAfterDays) {
    return { valid: false, error: 'Win-Back days must be greater than At-Risk start days' };
  }
  return { valid: true, rules: merged };
}

function deriveClientSegmentFromRules(totalVisits, totalSpent, lastVisit, rules) {
  const merged = mergeClientSegmentRules(rules);
  const visits = Number(totalVisits) || 0;
  const spent = Number(totalSpent) || 0;

  if (visits <= merged.newMaxVisits) return 'new';
  if (spent >= merged.vipSpendThreshold) return 'vip';

  if (lastVisit) {
    const daysSince = Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86_400_000);
    if (daysSince >= merged.atRiskAfterDays && daysSince < merged.winBackAfterDays) return 'at_risk';
    if (daysSince >= merged.winBackAfterDays) return 'win_back';
  }

  return 'regular';
}

module.exports = {
  DEFAULT_CLIENT_SEGMENT_RULES,
  mergeClientSegmentRules,
  validateClientSegmentRules,
  deriveClientSegmentFromRules,
};
