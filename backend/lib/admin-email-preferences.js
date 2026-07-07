'use strict';

/**
 * Admin users receive all email notification types by default (opt-out only).
 * Plan-gated types are off when the tenant lacks the entitlement.
 */

function buildAdminEmailPreferences(stored = {}, options = {}) {
  const { hasPayroll = true, hasIncentive = true } = options;
  const p = stored && typeof stored === 'object' ? stored : {};

  return {
    dailySummary: p.dailySummary !== false,
    weeklySummary: p.weeklySummary !== false,
    monthlySummary: p.monthlySummary !== false,
    staffIncentiveSummary: hasIncentive ? p.staffIncentiveSummary !== false : false,
    payrollSlip: hasPayroll ? p.payrollSlip !== false : false,
    timesheetReport: p.timesheetReport !== false,
    appointmentAlerts: p.appointmentAlerts !== false,
    receiptAlerts: p.receiptAlerts !== false,
    systemAlerts: p.systemAlerts !== false,
    lowInventory: p.lowInventory !== false,
    allowReportsDelivery: p.allowReportsDelivery !== false,
  };
}

function adminEmailNotificationsPayload(storedNotifications, options = {}) {
  const base = storedNotifications && typeof storedNotifications === 'object' ? storedNotifications : {};
  return {
    enabled: true,
    preferences: buildAdminEmailPreferences(base.preferences, options),
    managedBy: base.managedBy || 'admin',
    ...(base.lastUpdatedBy ? { lastUpdatedBy: base.lastUpdatedBy } : {}),
    ...(base.lastUpdatedAt ? { lastUpdatedAt: base.lastUpdatedAt } : {}),
  };
}

function isAdminStaff(staff) {
  return staff?.role === 'admin';
}

/** Whether this staff row should receive a given notification type. */
function staffWantsEmailPreference(staff, prefKey, options = {}) {
  if (!staff?.email) return false;
  if (isAdminStaff(staff)) {
    return buildAdminEmailPreferences(staff.emailNotifications?.preferences, options)[prefKey] === true;
  }
  if (!staff.emailNotifications?.enabled) return false;
  return staff.emailNotifications?.preferences?.[prefKey] === true;
}

function staffEmailNotificationsEnabled(staff) {
  if (isAdminStaff(staff)) return true;
  return staff?.emailNotifications?.enabled === true;
}

/** MongoDB filter: staff with email who want a notification type (admins always included). */
function staffEmailPreferenceFindQuery(prefKey, { branchId, recipientStaffIds } = {}) {
  const emailFilter = { email: { $exists: true, $ne: '' } };
  const preferenceFilter = {
    $or: [
      { role: 'admin' },
      {
        'emailNotifications.enabled': true,
        [`emailNotifications.preferences.${prefKey}`]: true,
      },
    ],
  };
  if (recipientStaffIds?.length > 0) {
    return { _id: { $in: recipientStaffIds }, ...emailFilter, ...preferenceFilter };
  }
  if (branchId != null) {
    return { branchId, ...emailFilter, ...preferenceFilter };
  }
  return { ...emailFilter, ...preferenceFilter };
}

function filterStaffByEmailPreference(allStaff, prefKey, options = {}) {
  return allStaff.filter((s) => staffWantsEmailPreference(s, prefKey, options));
}

function filterStaffWithEmailEnabled(allStaff) {
  return allStaff.filter((s) => staffEmailNotificationsEnabled(s) && s.email);
}

/** Build recipient Staff _id lists from a branch staff query result. */
function buildEmailRecipientLists(allStaff, options = {}) {
  const timesheetStaff = filterStaffByEmailPreference(allStaff, 'timesheetReport', options);
  return {
    generalRecipients: filterStaffWithEmailEnabled(allStaff).map((s) => s._id),
    dailySummaryRecipients: filterStaffByEmailPreference(allStaff, 'dailySummary', options).map((s) => s._id),
    weeklySummaryRecipients: filterStaffByEmailPreference(allStaff, 'weeklySummary', options).map((s) => s._id),
    monthlySummaryRecipients: filterStaffByEmailPreference(allStaff, 'monthlySummary', options).map((s) => s._id),
    staffIncentiveRecipients: filterStaffByEmailPreference(allStaff, 'staffIncentiveSummary', options).map(
      (s) => s._id
    ),
    payrollRecipients: filterStaffByEmailPreference(allStaff, 'payrollSlip', options).map((s) => s._id),
    timesheetStaffCount: timesheetStaff.length,
    appointmentRecipients: filterStaffByEmailPreference(allStaff, 'appointmentAlerts', options).map((s) => s._id),
    receiptRecipients: filterStaffByEmailPreference(allStaff, 'receiptAlerts', options).map((s) => s._id),
    systemAlertsRecipients: filterStaffByEmailPreference(allStaff, 'systemAlerts', options).map((s) => s._id),
  };
}

module.exports = {
  buildAdminEmailPreferences,
  adminEmailNotificationsPayload,
  isAdminStaff,
  staffWantsEmailPreference,
  staffEmailNotificationsEnabled,
  staffEmailPreferenceFindQuery,
  filterStaffByEmailPreference,
  filterStaffWithEmailEnabled,
  buildEmailRecipientLists,
};
