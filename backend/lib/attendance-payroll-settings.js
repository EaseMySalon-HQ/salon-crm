'use strict';

/**
 * Business-level Attendance & Payroll settings: typed defaults, merge on read,
 * validation on write, and a resolver that layers per-staff overrides on top.
 *
 * Mirrors lib/attendance-payroll-settings.ts (frontend). Keep both in sync.
 */

const SALARY_CYCLES = ['monthly', 'weekly', 'biweekly'];
const PAYOUT_DATES = ['last_day', '1', '5', 'custom'];
const COMMISSION_CALCULATE_ON = ['before_discount', 'after_discount'];
const COMMISSION_PAYABLE_WHEN = ['on_sale', 'on_payment', 'on_service_completion'];
const OVERTIME_RATE_TYPES = ['fixed_per_hour', 'multiplier'];
const ROUNDING_MODES = ['1', '5', '10', 'none'];

const DEFAULT_SHIFTS = [
  { id: 'morning', name: 'Morning', startTime: '10:00', endTime: '18:00' },
  { id: 'general', name: 'General', startTime: '11:00', endTime: '20:00' },
  { id: 'evening', name: 'Evening', startTime: '13:00', endTime: '21:00' },
];

const DEFAULT_ATTENDANCE_PAYROLL_SETTINGS = {
  payroll: {
    salaryCycle: 'monthly',
    payoutDate: 'last_day',
    customDay: 1,
    components: {
      fixedSalary: true,
      commission: true,
      bonus: true,
      incentives: true,
      overtime: false,
      deductions: true,
      reimbursements: false,
    },
    commission: {
      onServiceSales: true,
      onProductSales: true,
      onMembershipSales: false,
      onPackageSales: false,
      calculateOn: 'before_discount',
      payableWhen: 'on_sale',
    },
    bonusDeductions: {
      allowManualBonus: true,
      allowManualDeduction: true,
      requireDeductionReason: true,
    },
    rounding: 'none',
    latePenaltyPerDay: 0,
  },
  attendance: {
    // Sun..Sat; salons commonly closed Monday, so default all working except none off.
    workingDays: [true, true, true, true, true, true, true],
    officeHours: { open: '10:00', close: '20:00' },
    gracePeriodMinutes: 10,
    halfDayRules: { lateBeyondMinutes: 60, workedLessThanHours: 4 },
    absentRules: { workedLessThanHours: 2 },
    overtime: {
      enabled: false,
      minimumMinutes: 30,
      rateType: 'multiplier',
      fixedAmount: 0,
      multiplier: 1.5,
    },
    leave: {
      paidLeavePerMonth: 1,
      casualLeavePerMonth: 1,
      sickLeavePerMonth: 1,
      unpaidLeaveAllowed: true,
      weeklyOffDay: 0,
    },
    shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })),
  },
  salaryFormula: {
    fixedSalary: true,
    commission: true,
    incentives: true,
    bonus: true,
    overtime: false,
    leaveDeductions: true,
    latePenalties: false,
    advanceRecovery: true,
    manualDeductions: true,
  },
};

function pickBool(value, fallback) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function pickEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function pickNumber(value, fallback, { min, max } = {}) {
  let n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (typeof min === 'number') n = Math.max(min, n);
  if (typeof max === 'number') n = Math.min(max, n);
  return n;
}

function normalizeWorkingDays(value, fallback) {
  if (!Array.isArray(value) || value.length !== 7) return [...fallback];
  return value.map((v, i) => pickBool(v, fallback[i]));
}

function normalizeTime(value, fallback) {
  if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) return value;
  return fallback;
}

function slugifyShiftId(name) {
  const base = String(name || 'shift')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'shift';
}

function normalizeShifts(value, fallback) {
  if (!Array.isArray(value)) return fallback.map((s) => ({ ...s }));
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(raw.name || '').trim().slice(0, 80);
    if (!name) continue;
    const startTime = normalizeTime(raw.startTime, '09:00');
    const endTime = normalizeTime(raw.endTime, '18:00');
    if (startTime >= endTime) continue;
    let id = String(raw.id || '').trim().slice(0, 64);
    if (!id) id = slugifyShiftId(name);
    let uniqueId = id;
    let n = 2;
    while (seen.has(uniqueId)) {
      uniqueId = `${id}-${n++}`;
    }
    seen.add(uniqueId);
    out.push({ id: uniqueId, name, startTime, endTime });
  }
  return out.length ? out : fallback.map((s) => ({ ...s }));
}

function findShiftById(shifts, shiftId) {
  const id = String(shiftId || '').trim();
  if (!id) return null;
  return (shifts || []).find((s) => s.id === id) || null;
}

function applyShiftToWorkSchedule(workSchedule, shift) {
  if (!shift) return workSchedule;
  const defaultRow = (day) => ({
    day,
    enabled: true,
    startTime: shift.startTime,
    endTime: shift.endTime,
  });
  const base =
    Array.isArray(workSchedule) && workSchedule.length > 0
      ? workSchedule
      : [0, 1, 2, 3, 4, 5, 6].map(defaultRow);
  return base.map((row) => {
    const day = typeof row.day === 'number' ? row.day : parseInt(String(row.day), 10);
    if (row.enabled === false) return { ...row, day };
    return {
      day,
      enabled: true,
      startTime: shift.startTime,
      endTime: shift.endTime,
    };
  });
}

/**
 * Expected office hours for a staff member on a weekday (0=Sun).
 * Uses per-day workSchedule when enabled, else assigned shift, else business office hours.
 */
function resolveStaffShiftHoursForDay(staff, dayOfWeek, mergedSettings) {
  const attendance = mergedSettings?.attendance || DEFAULT_ATTENDANCE_PAYROLL_SETTINGS.attendance;
  const ws = (staff?.workSchedule || []).find((r) => Number(r.day) === Number(dayOfWeek));
  if (ws) {
    if (ws.enabled === false) return null;
    if (ws.startTime && ws.endTime) {
      return { open: ws.startTime, close: ws.endTime };
    }
  }
  const shift = findShiftById(attendance.shifts, staff?.shiftId);
  if (shift) return { open: shift.startTime, close: shift.endTime };
  return { open: attendance.officeHours.open, close: attendance.officeHours.close };
}

function syncStaffScheduleWithShift(payload, mergedSettings) {
  const shiftId = String(payload?.shiftId || '').trim();
  const shift = findShiftById(mergedSettings?.attendance?.shifts, shiftId);
  let workSchedule = Array.isArray(payload?.workSchedule) ? payload.workSchedule : [];
  if (shift) {
    if (workSchedule.length === 0) {
      workSchedule = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        day,
        enabled: true,
        startTime: shift.startTime,
        endTime: shift.endTime,
      }));
    } else {
      workSchedule = applyShiftToWorkSchedule(workSchedule, shift);
    }
    return { shiftId: shift.id, workSchedule };
  }
  return { shiftId: '', workSchedule };
}

/** Deep-merge raw settings onto defaults, coercing to valid values. */
function mergeAttendancePayrollSettings(raw) {
  const d = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS;
  const r = raw && typeof raw === 'object' ? raw : {};
  const rp = r.payroll && typeof r.payroll === 'object' ? r.payroll : {};
  const ra = r.attendance && typeof r.attendance === 'object' ? r.attendance : {};
  const rf = r.salaryFormula && typeof r.salaryFormula === 'object' ? r.salaryFormula : {};

  return {
    payroll: {
      salaryCycle: pickEnum(rp.salaryCycle, SALARY_CYCLES, d.payroll.salaryCycle),
      payoutDate: pickEnum(rp.payoutDate, PAYOUT_DATES, d.payroll.payoutDate),
      customDay: pickNumber(rp.customDay, d.payroll.customDay, { min: 1, max: 28 }),
      components: { ...d.payroll.components, ...(rp.components || {}) },
      commission: {
        onServiceSales: pickBool(rp.commission?.onServiceSales, d.payroll.commission.onServiceSales),
        onProductSales: pickBool(rp.commission?.onProductSales, d.payroll.commission.onProductSales),
        onMembershipSales: pickBool(rp.commission?.onMembershipSales, d.payroll.commission.onMembershipSales),
        onPackageSales: pickBool(rp.commission?.onPackageSales, d.payroll.commission.onPackageSales),
        calculateOn: pickEnum(rp.commission?.calculateOn, COMMISSION_CALCULATE_ON, d.payroll.commission.calculateOn),
        payableWhen: pickEnum(rp.commission?.payableWhen, COMMISSION_PAYABLE_WHEN, d.payroll.commission.payableWhen),
      },
      bonusDeductions: { ...d.payroll.bonusDeductions, ...(rp.bonusDeductions || {}) },
      rounding: pickEnum(rp.rounding, ROUNDING_MODES, d.payroll.rounding),
      latePenaltyPerDay: pickNumber(rp.latePenaltyPerDay, d.payroll.latePenaltyPerDay, { min: 0 }),
    },
    attendance: {
      workingDays: normalizeWorkingDays(ra.workingDays, d.attendance.workingDays),
      officeHours: {
        open: normalizeTime(ra.officeHours?.open, d.attendance.officeHours.open),
        close: normalizeTime(ra.officeHours?.close, d.attendance.officeHours.close),
      },
      gracePeriodMinutes: pickNumber(ra.gracePeriodMinutes, d.attendance.gracePeriodMinutes, { min: 0, max: 120 }),
      halfDayRules: {
        lateBeyondMinutes: pickNumber(ra.halfDayRules?.lateBeyondMinutes, d.attendance.halfDayRules.lateBeyondMinutes, { min: 0, max: 480 }),
        workedLessThanHours: pickNumber(ra.halfDayRules?.workedLessThanHours, d.attendance.halfDayRules.workedLessThanHours, { min: 0, max: 24 }),
      },
      absentRules: {
        workedLessThanHours: pickNumber(ra.absentRules?.workedLessThanHours, d.attendance.absentRules.workedLessThanHours, { min: 0, max: 24 }),
      },
      overtime: {
        enabled: pickBool(ra.overtime?.enabled, d.attendance.overtime.enabled),
        minimumMinutes: pickNumber(ra.overtime?.minimumMinutes, d.attendance.overtime.minimumMinutes, { min: 0, max: 480 }),
        rateType: pickEnum(ra.overtime?.rateType, OVERTIME_RATE_TYPES, d.attendance.overtime.rateType),
        fixedAmount: pickNumber(ra.overtime?.fixedAmount, d.attendance.overtime.fixedAmount, { min: 0 }),
        multiplier: pickNumber(ra.overtime?.multiplier, d.attendance.overtime.multiplier, { min: 0 }),
      },
      leave: {
        paidLeavePerMonth: pickNumber(ra.leave?.paidLeavePerMonth, d.attendance.leave.paidLeavePerMonth, { min: 0, max: 31 }),
        casualLeavePerMonth: pickNumber(ra.leave?.casualLeavePerMonth, d.attendance.leave.casualLeavePerMonth, { min: 0, max: 31 }),
        sickLeavePerMonth: pickNumber(ra.leave?.sickLeavePerMonth, d.attendance.leave.sickLeavePerMonth, { min: 0, max: 31 }),
        unpaidLeaveAllowed: pickBool(ra.leave?.unpaidLeaveAllowed, d.attendance.leave.unpaidLeaveAllowed),
        weeklyOffDay:
          ra.leave?.weeklyOffDay === 'custom'
            ? 'custom'
            : pickNumber(ra.leave?.weeklyOffDay, d.attendance.leave.weeklyOffDay, { min: 0, max: 6 }),
      },
      shifts: normalizeShifts(ra.shifts, d.attendance.shifts),
    },
    salaryFormula: {
      fixedSalary: pickBool(rf.fixedSalary, d.salaryFormula.fixedSalary),
      commission: pickBool(rf.commission, d.salaryFormula.commission),
      incentives: pickBool(rf.incentives, d.salaryFormula.incentives),
      bonus: pickBool(rf.bonus, d.salaryFormula.bonus),
      overtime: pickBool(rf.overtime, d.salaryFormula.overtime),
      leaveDeductions: pickBool(rf.leaveDeductions, d.salaryFormula.leaveDeductions),
      latePenalties: pickBool(rf.latePenalties, d.salaryFormula.latePenalties),
      advanceRecovery: pickBool(rf.advanceRecovery, d.salaryFormula.advanceRecovery),
      manualDeductions: pickBool(rf.manualDeductions, d.salaryFormula.manualDeductions),
    },
  };
}

/**
 * Validate incoming settings. Returns { valid, error }.
 * Applies after merge so all fields exist.
 */
function validateAttendancePayrollSettings(merged) {
  const { attendance, payroll } = merged;
  const { open, close } = attendance.officeHours;
  if (open >= close) {
    return { valid: false, error: 'Office opening time must be before closing time' };
  }
  if (payroll.payoutDate === 'custom' && (payroll.customDay < 1 || payroll.customDay > 28)) {
    return { valid: false, error: 'Custom payout day must be between 1 and 28' };
  }
  if (attendance.absentRules.workedLessThanHours > attendance.halfDayRules.workedLessThanHours) {
    return {
      valid: false,
      error: 'Absent threshold hours cannot exceed the half-day threshold hours',
    };
  }
  for (const shift of attendance.shifts || []) {
    if (shift.startTime >= shift.endTime) {
      return { valid: false, error: `Shift "${shift.name}" must have a start time before end time` };
    }
  }
  return { valid: true };
}

/**
 * Layer per-staff overrides on top of merged business settings.
 * @param {object} merged mergeAttendancePayrollSettings output
 * @param {object} staff staff document (lean) with optional payrollOverrides
 */
function resolveStaffPayrollRules(merged, staff) {
  const base = merged || mergeAttendancePayrollSettings(undefined);
  const ov = staff && staff.payrollOverrides ? staff.payrollOverrides : {};
  const useBusinessRules = ov.useBusinessRules !== false;

  const effective = {
    useBusinessRules,
    salary: Number(staff?.salary) || 0,
    lateDeductionEnabled: base.salaryFormula.latePenalties,
    overtimeEnabled: base.attendance.overtime.enabled,
    commissionPercent: null,
    rounding: base.payroll.rounding,
    salaryFormula: { ...base.salaryFormula },
    commission: { ...base.payroll.commission },
    attendance: base.attendance,
    payroll: base.payroll,
  };

  if (!useBusinessRules) {
    if (typeof ov.salary === 'number' && Number.isFinite(ov.salary)) {
      effective.salary = ov.salary;
    }
    if (typeof ov.lateDeductionEnabled === 'boolean') {
      effective.lateDeductionEnabled = ov.lateDeductionEnabled;
      effective.salaryFormula = { ...effective.salaryFormula, latePenalties: ov.lateDeductionEnabled };
    }
    if (typeof ov.overtimeEnabled === 'boolean') {
      effective.overtimeEnabled = ov.overtimeEnabled;
    }
    if (typeof ov.commissionPercent === 'number' && Number.isFinite(ov.commissionPercent)) {
      effective.commissionPercent = ov.commissionPercent;
    }
  }

  return effective;
}

/** Round an amount per the configured rounding mode. */
function applyRounding(amount, mode) {
  const n = Number(amount) || 0;
  if (mode === 'none' || !mode) return Math.round(n * 100) / 100;
  const step = Number(mode);
  if (!Number.isFinite(step) || step <= 0) return Math.round(n * 100) / 100;
  return Math.round(n / step) * step;
}

module.exports = {
  SALARY_CYCLES,
  PAYOUT_DATES,
  COMMISSION_CALCULATE_ON,
  COMMISSION_PAYABLE_WHEN,
  OVERTIME_RATE_TYPES,
  ROUNDING_MODES,
  DEFAULT_SHIFTS,
  DEFAULT_ATTENDANCE_PAYROLL_SETTINGS,
  mergeAttendancePayrollSettings,
  validateAttendancePayrollSettings,
  resolveStaffPayrollRules,
  applyRounding,
  normalizeShifts,
  findShiftById,
  applyShiftToWorkSchedule,
  resolveStaffShiftHoursForDay,
  syncStaffScheduleWithShift,
};
