'use strict';

/**
 * Payroll auto-adjustments: unpaid leave (LWP) and advance recovery.
 */

const { toDateStringIST } = require('../utils/date-utils');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** IST calendar month (YYYY-MM) when the advance was given. */
function advanceGivenMonth(adv) {
  const when = adv?.givenAt || adv?.createdAt;
  if (!when) return null;
  return toDateStringIST(when).slice(0, 7);
}

/**
 * First payroll month that may recover this advance.
 * Uses per-advance recoveryFrom: current_cycle (same month) or next_cycle (month after given).
 */
function firstRecoveryMonth(adv) {
  const givenMonth = advanceGivenMonth(adv);
  if (!givenMonth) return null;
  if (adv?.recoveryFrom === 'current_cycle') return givenMonth;
  const [y, m] = givenMonth.split('-').map(Number);
  let month = m + 1;
  let year = y;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Whether this advance can be recovered on the selected payroll month. */
function isAdvanceEligibleForPayrollMonth(adv, payrollMonth) {
  if (!payrollMonth || !/^\d{4}-\d{2}$/.test(String(payrollMonth))) return true;
  const startMonth = firstRecoveryMonth(adv);
  if (!startMonth) return true;
  return payrollMonth >= startMonth;
}

/** Count unpaid leave days (half_day = 0.5). */
function countUnpaidLeaveDays(leaves) {
  let total = 0;
  for (const row of leaves || []) {
    if (row.type === 'unpaid') total += 1;
    else if (row.type === 'half_day') total += 0.5;
  }
  return total;
}

function computeLeaveDeduction(baseSalary, month, unpaidLeaveDays) {
  if (!unpaidLeaveDays || unpaidLeaveDays <= 0) return 0;
  const dim = daysInMonth(month);
  if (dim <= 0) return 0;
  const dailyRate = (Number(baseSalary) || 0) / dim;
  return round2(dailyRate * unpaidLeaveDays);
}

function computeAdvanceRecovery(advances, payrollMonth = null) {
  let total = 0;
  for (const adv of advances || []) {
    if (adv.status !== 'active') continue;
    if (payrollMonth && !isAdvanceEligibleForPayrollMonth(adv, payrollMonth)) continue;
    const outstanding = round2((Number(adv.amount) || 0) - (Number(adv.recoveredAmount) || 0));
    if (outstanding <= 0) continue;
    const installment = Number(adv.installmentAmount) || 0;
    const chunk = installment > 0 ? Math.min(installment, outstanding) : outstanding;
    total += chunk;
  }
  return round2(total);
}

function buildDeductionNote({ leaveDeduction, unpaidLeaveDays, advanceRecovery, manualNote }) {
  const parts = [];
  if (leaveDeduction > 0 && unpaidLeaveDays > 0) {
    parts.push(`LWP: ${unpaidLeaveDays} day(s) — ₹${leaveDeduction.toFixed(2)}`);
  }
  if (advanceRecovery > 0) {
    parts.push(`Advance recovery — ₹${advanceRecovery.toFixed(2)}`);
  }
  if (manualNote?.trim()) parts.push(manualNote.trim());
  return parts.join('; ');
}

/** Round a net amount per the configured rounding mode ('none' | '1' | '5' | '10'). */
function applyRounding(amount, mode) {
  const n = Number(amount) || 0;
  if (mode === 'none' || mode == null) return round2(n);
  const step = Number(mode);
  if (!Number.isFinite(step) || step <= 0) return round2(n);
  return Math.round(n / step) * step;
}

/**
 * Compute net pay.
 *
 * Backwards compatible: called with `{ baseSalary, incentive, bonus, deductions }`
 * it behaves exactly as before. When a `formula` object is supplied, each line item
 * is gated by its toggle and (optional) granular deduction components / overtime /
 * late penalty are used. `rounding` applies the salary rounding mode to the result.
 */
function computeNet(input) {
  const {
    baseSalary = 0,
    incentive = 0,
    bonus = 0,
    overtimePay = 0,
    deductions,
    leaveDeduction = 0,
    advanceRecovery = 0,
    manualDeductions = 0,
    latePenalty = 0,
    formula = null,
    rounding = 'none',
  } = input || {};

  const on = (key) => !formula || formula[key] !== false;
  const num = (v) => Number(v) || 0;

  const includeIncentive = on('commission') || on('incentives');
  const earnings =
    (on('fixedSalary') ? num(baseSalary) : 0) +
    (includeIncentive ? num(incentive) : 0) +
    (on('bonus') ? num(bonus) : 0) +
    (on('overtime') ? num(overtimePay) : 0);

  let totalDeductions;
  if (deductions !== undefined && formula == null) {
    totalDeductions = num(deductions);
  } else {
    totalDeductions =
      (on('leaveDeductions') ? num(leaveDeduction) : 0) +
      (on('advanceRecovery') ? num(advanceRecovery) : 0) +
      (on('manualDeductions') ? num(manualDeductions) : 0) +
      (on('latePenalties') ? num(latePenalty) : 0);
  }

  return applyRounding(earnings - totalDeductions, rounding);
}

module.exports = {
  round2,
  applyRounding,
  daysInMonth,
  advanceGivenMonth,
  firstRecoveryMonth,
  isAdvanceEligibleForPayrollMonth,
  countUnpaidLeaveDays,
  computeLeaveDeduction,
  computeAdvanceRecovery,
  buildDeductionNote,
  computeNet,
};
