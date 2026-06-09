const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  daysUntilRenewalInIST,
  getPlanRenewalWarning,
  isAccessBlockedBySuspension,
  buildSuspensionMeta,
  statusUpdateFields,
} = require('../../lib/suspension-grace');

function istDateString(daysFromToday) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d;
}

describe('suspension-grace', () => {
  it('active business is never blocked', () => {
    const b = { status: 'active' };
    assert.equal(isAccessBlockedBySuspension(b), false);
    assert.equal(buildSuspensionMeta(b).businessSuspended, false);
  });

  it('suspended business is blocked immediately (no grace)', () => {
    const b = { status: 'suspended', suspendedAt: new Date() };
    assert.equal(isAccessBlockedBySuspension(b), true);
    assert.equal(buildSuspensionMeta(b).businessSuspended, true);
    assert.equal(buildSuspensionMeta(b).planRenewalWarningDaysLeft, null);
  });

  it('shows renewal warning 7 through 2 days before expiry', () => {
    for (const days of [7, 6, 5, 4, 3, 2]) {
      const b = {
        status: 'active',
        plan: { renewalDate: istDateString(days) },
      };
      const warning = getPlanRenewalWarning(b);
      assert.equal(warning.planRenewalWarningDaysLeft, days);
      assert.equal(warning.planRenewalExpiringToday, false);
    }
  });

  it('shows expiring-today flag 1 day before renewal', () => {
    const b = {
      status: 'active',
      plan: { renewalDate: istDateString(1) },
    };
    const warning = getPlanRenewalWarning(b);
    assert.equal(warning.planRenewalWarningDaysLeft, null);
    assert.equal(warning.planRenewalExpiringToday, true);
  });

  it('no warning more than 7 days out or on renewal day', () => {
    const far = {
      status: 'active',
      plan: { renewalDate: istDateString(10) },
    };
    assert.equal(getPlanRenewalWarning(far).planRenewalWarningDaysLeft, null);

    const today = {
      status: 'active',
      plan: { renewalDate: istDateString(0) },
    };
    assert.equal(getPlanRenewalWarning(today).planRenewalExpiringToday, false);
    assert.equal(getPlanRenewalWarning(today).planRenewalWarningDaysLeft, null);
  });

  it('daysUntilRenewalInIST returns null without a date', () => {
    assert.equal(daysUntilRenewalInIST(null), null);
  });

  it('statusUpdateFields sets and clears suspendedAt', () => {
    const suspended = statusUpdateFields('suspended');
    assert.equal(suspended.status, 'suspended');
    assert.ok(suspended.suspendedAt instanceof Date);
    const active = statusUpdateFields('active');
    assert.equal(active.status, 'active');
    assert.equal(active.suspendedAt, null);
  });
});
