const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mergeAttendancePayrollSettings,
  validateAttendancePayrollSettings,
  resolveStaffPayrollRules,
  applyRounding,
  DEFAULT_ATTENDANCE_PAYROLL_SETTINGS,
  normalizeShifts,
  findShiftById,
  applyShiftToWorkSchedule,
  resolveStaffShiftHoursForDay,
  syncStaffScheduleWithShift,
} = require('../../lib/attendance-payroll-settings');
const { evaluateDay, computeOvertimePay } = require('../../lib/attendance-evaluator');
const { computeNet } = require('../../lib/payroll-calculator');

// ── mergeAttendancePayrollSettings ───────────────────────────────────────────

test('merge returns full defaults for undefined input', () => {
  const merged = mergeAttendancePayrollSettings(undefined);
  assert.equal(merged.payroll.salaryCycle, 'monthly');
  assert.equal(merged.payroll.payoutDate, 'last_day');
  assert.equal(merged.payroll.rounding, 'none');
  assert.equal(merged.attendance.gracePeriodMinutes, 10);
  assert.equal(merged.attendance.workingDays.length, 7);
  assert.equal(merged.salaryFormula.fixedSalary, true);
});

test('merge coerces invalid enum values to defaults', () => {
  const merged = mergeAttendancePayrollSettings({
    payroll: { salaryCycle: 'yearly', rounding: '7', payoutDate: 'nonsense' },
  });
  assert.equal(merged.payroll.salaryCycle, 'monthly');
  assert.equal(merged.payroll.rounding, 'none');
  assert.equal(merged.payroll.payoutDate, 'last_day');
});

test('merge clamps numeric ranges', () => {
  const merged = mergeAttendancePayrollSettings({
    attendance: { gracePeriodMinutes: 999 },
    payroll: { customDay: 40 },
  });
  assert.equal(merged.attendance.gracePeriodMinutes, 120);
  assert.equal(merged.payroll.customDay, 28);
});

test('merge normalizes bad workingDays length', () => {
  const merged = mergeAttendancePayrollSettings({ attendance: { workingDays: [true, false] } });
  assert.equal(merged.attendance.workingDays.length, 7);
});

test('merge keeps custom weekly off day', () => {
  const merged = mergeAttendancePayrollSettings({ attendance: { leave: { weeklyOffDay: 'custom' } } });
  assert.equal(merged.attendance.leave.weeklyOffDay, 'custom');
  const merged2 = mergeAttendancePayrollSettings({ attendance: { leave: { weeklyOffDay: 3 } } });
  assert.equal(merged2.attendance.leave.weeklyOffDay, 3);
});

// ── validateAttendancePayrollSettings ────────────────────────────────────────

test('validate rejects office open >= close', () => {
  const merged = mergeAttendancePayrollSettings({ attendance: { officeHours: { open: '20:00', close: '10:00' } } });
  const { valid } = validateAttendancePayrollSettings(merged);
  assert.equal(valid, false);
});

test('validate rejects absent threshold above half-day threshold', () => {
  const merged = mergeAttendancePayrollSettings({
    attendance: { halfDayRules: { workedLessThanHours: 4 }, absentRules: { workedLessThanHours: 6 } },
  });
  const { valid } = validateAttendancePayrollSettings(merged);
  assert.equal(valid, false);
});

test('validate accepts sane defaults', () => {
  const { valid } = validateAttendancePayrollSettings(DEFAULT_ATTENDANCE_PAYROLL_SETTINGS);
  assert.equal(valid, true);
});

// ── resolveStaffPayrollRules ─────────────────────────────────────────────────

test('resolve uses business rules by default', () => {
  const merged = mergeAttendancePayrollSettings(undefined);
  const rules = resolveStaffPayrollRules(merged, { salary: 30000, payrollOverrides: { useBusinessRules: true } });
  assert.equal(rules.useBusinessRules, true);
  assert.equal(rules.salary, 30000);
  assert.equal(rules.commissionPercent, null);
});

test('resolve applies overrides when business rules off', () => {
  const merged = mergeAttendancePayrollSettings(undefined);
  const rules = resolveStaffPayrollRules(merged, {
    salary: 30000,
    payrollOverrides: {
      useBusinessRules: false,
      salary: 45000,
      lateDeductionEnabled: true,
      overtimeEnabled: true,
      commissionPercent: 12,
    },
  });
  assert.equal(rules.salary, 45000);
  assert.equal(rules.lateDeductionEnabled, true);
  assert.equal(rules.overtimeEnabled, true);
  assert.equal(rules.commissionPercent, 12);
  assert.equal(rules.salaryFormula.latePenalties, true);
});

// ── applyRounding ────────────────────────────────────────────────────────────

test('applyRounding rounds to nearest step', () => {
  assert.equal(applyRounding(1023.4, '10'), 1020);
  assert.equal(applyRounding(1027, '5'), 1025);
  assert.equal(applyRounding(1023.456, '1'), 1023);
  assert.equal(applyRounding(1023.456, 'none'), 1023.46);
});

// ── evaluateDay ──────────────────────────────────────────────────────────────

const rules = mergeAttendancePayrollSettings({
  attendance: {
    officeHours: { open: '10:00', close: '20:00' },
    gracePeriodMinutes: 10,
    halfDayRules: { lateBeyondMinutes: 60, workedLessThanHours: 4 },
    absentRules: { workedLessThanHours: 2 },
    overtime: { enabled: true, minimumMinutes: 30, rateType: 'multiplier', multiplier: 1.5 },
  },
});

function ist(dateYmd, hhmm) {
  return new Date(`${dateYmd}T${hhmm}:00+05:30`);
}

test('evaluateDay: present when on time', () => {
  const r = evaluateDay({
    checkInAt: ist('2026-06-01', '10:05'),
    checkOutAt: ist('2026-06-01', '19:00'),
    rules,
  });
  assert.equal(r.status, 'present');
  assert.equal(r.lateMinutes, 0);
});

test('evaluateDay: late beyond grace', () => {
  const r = evaluateDay({
    checkInAt: ist('2026-06-01', '10:40'),
    checkOutAt: ist('2026-06-01', '19:00'),
    rules,
  });
  assert.equal(r.status, 'late');
  assert.equal(r.lateMinutes, 30);
});

test('evaluateDay: half day when very late', () => {
  const r = evaluateDay({
    checkInAt: ist('2026-06-01', '11:30'),
    checkOutAt: ist('2026-06-01', '19:00'),
    rules,
  });
  assert.equal(r.status, 'half_day');
});

test('evaluateDay: absent when barely worked', () => {
  const r = evaluateDay({
    checkInAt: ist('2026-06-01', '10:00'),
    checkOutAt: ist('2026-06-01', '11:00'),
    rules,
  });
  assert.equal(r.status, 'absent');
});

test('evaluateDay: absent when no check-in', () => {
  const r = evaluateDay({ checkInAt: null, checkOutAt: null, rules });
  assert.equal(r.status, 'absent');
});

test('evaluateDay: overtime minutes past close beyond minimum', () => {
  const r = evaluateDay({
    checkInAt: ist('2026-06-01', '10:00'),
    checkOutAt: ist('2026-06-01', '21:00'),
    rules,
  });
  assert.equal(r.overtimeMinutes, 60);
});

test('computeOvertimePay multiplier mode', () => {
  const pay = computeOvertimePay(60, rules.attendance.overtime, 100);
  assert.equal(pay, 150); // 1 hour × 100 × 1.5
});

// ── computeNet ───────────────────────────────────────────────────────────────

test('computeNet backwards compatible aggregate path', () => {
  const net = computeNet({ baseSalary: 20000, incentive: 5000, bonus: 1000, deductions: 2000 });
  assert.equal(net, 24000);
});

test('computeNet applies formula toggles', () => {
  const formula = {
    fixedSalary: true,
    commission: false,
    incentives: false,
    bonus: true,
    overtime: true,
    leaveDeductions: true,
    latePenalties: false,
    advanceRecovery: true,
    manualDeductions: true,
  };
  const net = computeNet({
    baseSalary: 20000,
    incentive: 5000,
    bonus: 1000,
    overtimePay: 500,
    leaveDeduction: 300,
    advanceRecovery: 200,
    manualDeductions: 100,
    latePenalty: 999,
    formula,
    rounding: 'none',
  });
  // 20000 + 0 (commission/incentives off) + 1000 + 500 - (300 + 200 + 100 + 0 late off) = 20900
  assert.equal(net, 20900);
});

test('computeNet applies rounding', () => {
  const net = computeNet({
    baseSalary: 20003,
    incentive: 0,
    bonus: 0,
    formula: DEFAULT_ATTENDANCE_PAYROLL_SETTINGS.salaryFormula,
    rounding: '10',
  });
  assert.equal(net, 20000);
});

// ── shifts ───────────────────────────────────────────────────────────────────

test('merge exposes commission settings under payroll.commission', () => {
  const merged = mergeAttendancePayrollSettings({
    payroll: { commission: { payableWhen: 'on_payment', calculateOn: 'after_discount' } },
  });
  assert.equal(merged.payroll.commission.payableWhen, 'on_payment');
  assert.equal(merged.commission, undefined);
});

test('merge includes default shifts', () => {
  const merged = mergeAttendancePayrollSettings(undefined);
  assert.ok(merged.attendance.shifts.length >= 3);
  assert.equal(merged.attendance.shifts[0].name, 'Morning');
});

test('normalizeShifts dedupes ids and skips invalid rows', () => {
  const out = normalizeShifts([
    { id: 'morning', name: 'Morning', startTime: '10:00', endTime: '18:00' },
    { id: 'morning', name: 'Morning copy', startTime: '09:00', endTime: '17:00' },
    { name: '', startTime: '09:00', endTime: '17:00' },
    { name: 'Bad', startTime: '18:00', endTime: '09:00' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'morning');
  assert.equal(out[1].id, 'morning-2');
});

test('applyShiftToWorkSchedule updates enabled days only', () => {
  const ws = [
    { day: 0, enabled: false, startTime: '09:00', endTime: '17:00' },
    { day: 1, enabled: true, startTime: '09:00', endTime: '17:00' },
  ];
  const shift = { id: 'general', name: 'General', startTime: '11:00', endTime: '20:00' };
  const next = applyShiftToWorkSchedule(ws, shift);
  assert.equal(next[0].startTime, '09:00');
  assert.equal(next[1].startTime, '11:00');
  assert.equal(next[1].endTime, '20:00');
});

test('resolveStaffShiftHoursForDay prefers work schedule over shift', () => {
  const merged = mergeAttendancePayrollSettings(undefined);
  const staff = {
    shiftId: 'morning',
    workSchedule: [{ day: 1, enabled: true, startTime: '08:00', endTime: '16:00' }],
  };
  const hours = resolveStaffShiftHoursForDay(staff, 1, merged);
  assert.deepEqual(hours, { open: '08:00', close: '16:00' });
});

test('resolveStaffShiftHoursForDay falls back to shift', () => {
  const merged = mergeAttendancePayrollSettings(undefined);
  const staff = { shiftId: 'evening', workSchedule: [] };
  const hours = resolveStaffShiftHoursForDay(staff, 2, merged);
  assert.deepEqual(hours, { open: '13:00', close: '21:00' });
});

test('syncStaffScheduleWithShift applies shift to payload', () => {
  const merged = mergeAttendancePayrollSettings(undefined);
  const { shiftId, workSchedule } = syncStaffScheduleWithShift(
    {
      shiftId: 'morning',
      workSchedule: [{ day: 1, enabled: true, startTime: '09:00', endTime: '17:00' }],
    },
    merged
  );
  assert.equal(shiftId, 'morning');
  assert.equal(workSchedule[0].startTime, '10:00');
  assert.equal(workSchedule[0].endTime, '18:00');
});

test('validate rejects invalid shift times', () => {
  const merged = mergeAttendancePayrollSettings(undefined);
  merged.attendance.shifts = [{ id: 'x', name: 'X', startTime: '18:00', endTime: '09:00' }];
  const { valid } = validateAttendancePayrollSettings(merged);
  assert.equal(valid, false);
});
