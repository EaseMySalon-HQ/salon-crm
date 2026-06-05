const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  GRACE_DAYS,
  isInSuspensionGrace,
  isAccessBlockedBySuspension,
  buildSuspensionMeta,
  statusUpdateFields,
} = require('../../lib/suspension-grace');

describe('suspension-grace', () => {
  it('active business is never blocked', () => {
    const b = { status: 'active' };
    assert.equal(isInSuspensionGrace(b), false);
    assert.equal(isAccessBlockedBySuspension(b), false);
    assert.equal(buildSuspensionMeta(b).businessSuspended, false);
  });

  it('suspended within grace is not blocked', () => {
    const suspendedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const b = { status: 'suspended', suspendedAt };
    assert.equal(isInSuspensionGrace(b), true);
    assert.equal(isAccessBlockedBySuspension(b), false);
    const meta = buildSuspensionMeta(b);
    assert.equal(meta.businessSuspended, false);
    assert.equal(meta.suspensionGraceActive, true);
    assert.ok(meta.suspensionGraceEndsAt);
  });

  it('suspended past grace is blocked', () => {
    const suspendedAt = new Date(Date.now() - (GRACE_DAYS + 1) * 24 * 60 * 60 * 1000);
    const b = { status: 'suspended', suspendedAt };
    assert.equal(isInSuspensionGrace(b), false);
    assert.equal(isAccessBlockedBySuspension(b), true);
    assert.equal(buildSuspensionMeta(b).businessSuspended, true);
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
