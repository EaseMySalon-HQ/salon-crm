'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  advanceGivenMonth,
  firstRecoveryMonth,
  isAdvanceEligibleForPayrollMonth,
  computeAdvanceRecovery,
} = require('../../lib/payroll-calculator');

test('advanceGivenMonth uses IST calendar month', () => {
  assert.equal(
    advanceGivenMonth({ givenAt: '2026-03-15T10:00:00+05:30' }),
    '2026-03'
  );
});

test('firstRecoveryMonth respects recoveryFrom on advance', () => {
  const adv = { givenAt: '2026-03-15T10:00:00+05:30' };
  assert.equal(firstRecoveryMonth({ ...adv, recoveryFrom: 'next_cycle' }), '2026-04');
  assert.equal(firstRecoveryMonth({ ...adv, recoveryFrom: 'current_cycle' }), '2026-03');
});

test('isAdvanceEligibleForPayrollMonth excludes same month as given', () => {
  const adv = { givenAt: '2026-03-10T10:00:00+05:30', recoveryFrom: 'next_cycle' };
  assert.equal(isAdvanceEligibleForPayrollMonth(adv, '2026-03'), false);
  assert.equal(isAdvanceEligibleForPayrollMonth(adv, '2026-04'), true);
  assert.equal(isAdvanceEligibleForPayrollMonth(adv, '2026-02'), false);
});

test('isAdvanceEligibleForPayrollMonth allows same month when current_cycle', () => {
  const adv = { givenAt: '2026-03-10T10:00:00+05:30', recoveryFrom: 'current_cycle' };
  assert.equal(isAdvanceEligibleForPayrollMonth(adv, '2026-03'), true);
  assert.equal(isAdvanceEligibleForPayrollMonth(adv, '2026-02'), false);
});

test('computeAdvanceRecovery respects payout cycle month', () => {
  const advances = [
    {
      status: 'active',
      amount: 5000,
      recoveredAmount: 0,
      installmentAmount: 1000,
      givenAt: '2026-03-10T10:00:00+05:30',
      recoveryFrom: 'next_cycle',
    },
  ];
  assert.equal(computeAdvanceRecovery(advances, '2026-03'), 0);
  assert.equal(computeAdvanceRecovery(advances, '2026-04'), 1000);
});

test('computeAdvanceRecovery includes same month when current_cycle', () => {
  const advances = [
    {
      status: 'active',
      amount: 5000,
      recoveredAmount: 0,
      installmentAmount: 1000,
      givenAt: '2026-03-10T10:00:00+05:30',
      recoveryFrom: 'current_cycle',
    },
  ];
  assert.equal(computeAdvanceRecovery(advances, '2026-03'), 1000);
});

test('computeAdvanceRecovery sums eligible active advances', () => {
  const advances = [
    {
      status: 'active',
      amount: 3000,
      recoveredAmount: 0,
      installmentAmount: 0,
      givenAt: '2026-01-05T10:00:00+05:30',
    },
    {
      status: 'active',
      amount: 2000,
      recoveredAmount: 500,
      installmentAmount: 500,
      givenAt: '2026-02-20T10:00:00+05:30',
    },
  ];
  assert.equal(computeAdvanceRecovery(advances, '2026-03'), 3500);
});
