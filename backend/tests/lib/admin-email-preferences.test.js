'use strict';

const {
  buildAdminEmailPreferences,
  adminEmailNotificationsPayload,
  staffWantsEmailPreference,
  staffEmailPreferenceFindQuery,
  buildEmailRecipientLists,
} = require('../../lib/admin-email-preferences');

describe('admin-email-preferences', () => {
  test('buildAdminEmailPreferences defaults all types on', () => {
    const prefs = buildAdminEmailPreferences(undefined, { hasPayroll: true, hasIncentive: true });
    expect(prefs.dailySummary).toBe(true);
    expect(prefs.weeklySummary).toBe(true);
    expect(prefs.payrollSlip).toBe(true);
    expect(prefs.timesheetReport).toBe(true);
  });

  test('buildAdminEmailPreferences respects opt-out', () => {
    const prefs = buildAdminEmailPreferences({ dailySummary: false }, { hasPayroll: true, hasIncentive: true });
    expect(prefs.dailySummary).toBe(false);
    expect(prefs.weeklySummary).toBe(true);
  });

  test('plan-gated prefs off without entitlement', () => {
    const prefs = buildAdminEmailPreferences(undefined, { hasPayroll: false, hasIncentive: false });
    expect(prefs.payrollSlip).toBe(false);
    expect(prefs.staffIncentiveSummary).toBe(false);
    expect(prefs.dailySummary).toBe(true);
  });

  test('staffWantsEmailPreference treats admin as opted-in', () => {
    const admin = {
      role: 'admin',
      email: 'admin@test.com',
      emailNotifications: { enabled: false, preferences: {} },
    };
    expect(staffWantsEmailPreference(admin, 'dailySummary')).toBe(true);
  });

  test('staffEmailPreferenceFindQuery includes admin role', () => {
    const q = staffEmailPreferenceFindQuery('dailySummary', { branchId: 'abc' });
    expect(q.branchId).toBe('abc');
    expect(q.$or).toEqual(
      expect.arrayContaining([
        { role: 'admin' },
        expect.objectContaining({ 'emailNotifications.preferences.dailySummary': true }),
      ])
    );
  });

  test('buildEmailRecipientLists includes admin staff', () => {
    const lists = buildEmailRecipientLists(
      [
        { _id: '1', role: 'admin', email: 'a@test.com' },
        { _id: '2', role: 'staff', email: 'b@test.com', emailNotifications: { enabled: false } },
      ],
      { hasPayroll: true, hasIncentive: true }
    );
    expect(lists.dailySummaryRecipients).toEqual(['1']);
    expect(lists.generalRecipients).toEqual(['1']);
  });

  test('adminEmailNotificationsPayload always enabled', () => {
    const payload = adminEmailNotificationsPayload({ enabled: false }, { hasPayroll: true, hasIncentive: true });
    expect(payload.enabled).toBe(true);
    expect(payload.preferences.dailySummary).toBe(true);
  });
});
