/**
 * Multi-Location Support (`multi_location` plan feature).
 *
 * Branch select/switch at login is allowed for any owner with 2+ active branches
 * under the same email — no plan feature required.
 *
 * Branch Management APIs require `multi_location` on the current branch's plan.
 */

const entitlementsCache = require('./entitlements-cache');

const FEATURE_ID = 'multi_location';

async function branchHasMultiLocation(branchId) {
  if (!branchId) return false;
  try {
    const entry = await entitlementsCache.resolve(String(branchId));
    return Boolean(entry?.features?.has(FEATURE_ID));
  } catch {
    return false;
  }
}

module.exports = {
  FEATURE_ID,
  branchHasMultiLocation,
};
