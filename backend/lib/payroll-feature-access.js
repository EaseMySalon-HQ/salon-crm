'use strict';

const { ensureEntitlements } = require('../middleware/feature-gate');
const {
  DEFAULT_ATTENDANCE_PAYROLL_SETTINGS,
  mergeAttendancePayrollSettings,
} = require('./attendance-payroll-settings');

async function businessHasPayrollFeature(req) {
  const entitlements = await ensureEntitlements(req);
  return Boolean(entitlements?.features?.has('payroll'));
}

async function businessHasIncentiveManagement(req) {
  const entitlements = await ensureEntitlements(req);
  return Boolean(entitlements?.features?.has('incentive_management'));
}

/** Hide payroll + salary formula settings from tenants without the payroll entitlement. */
function stripPayrollSettingsForResponse(settings) {
  const merged = mergeAttendancePayrollSettings(settings);
  const defaults = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS;
  return {
    ...merged,
    payroll: { ...defaults.payroll },
    salaryFormula: { ...defaults.salaryFormula },
  };
}

/**
 * When saving settings without payroll entitlement, ignore client payroll/formula
 * changes and preserve stored values.
 */
function mergeAttendancePayrollSettingsForPlan(incoming, stored, hasPayroll) {
  const merged = mergeAttendancePayrollSettings(incoming);
  if (hasPayroll) return merged;
  const storedMerged = mergeAttendancePayrollSettings(stored);
  return {
    ...merged,
    payroll: storedMerged.payroll,
    salaryFormula: storedMerged.salaryFormula,
  };
}

module.exports = {
  businessHasPayrollFeature,
  businessHasIncentiveManagement,
  stripPayrollSettingsForResponse,
  mergeAttendancePayrollSettingsForPlan,
};
