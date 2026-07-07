'use strict';

/**
 * Evaluate a single day's attendance against resolved attendance rules.
 * Pure functions — no DB access. Times are handled in IST wall-clock minutes.
 */

const { formatInIST } = require('../utils/date-utils');

/** Minutes from IST midnight for a Date/ISO instant, or null. */
function minutesFromMidnightIST(instant) {
  if (!instant) return null;
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  const hhmm = formatInIST(d, { hour: '2-digit', minute: '2-digit', hour12: false });
  const [h, m] = String(hhmm).split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** "HH:mm" -> minutes from midnight. */
function timeStringToMinutes(str, fallback) {
  if (typeof str === 'string' && /^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':').map((x) => parseInt(x, 10));
    return h * 60 + m;
  }
  return fallback;
}

/**
 * @param {object} args
 * @param {Date|string|null} args.checkInAt
 * @param {Date|string|null} args.checkOutAt
 * @param {object} args.rules resolved attendance settings (see attendance-payroll-settings)
 * @param {{ open?: string, close?: string }} [args.staffSchedule] per-staff schedule override
 * @returns {{ status: string, lateMinutes: number, workedHours: number, overtimeMinutes: number }}
 */
function evaluateDay({ checkInAt, checkOutAt, rules, staffSchedule }) {
  const attendance = rules && rules.attendance ? rules.attendance : rules || {};
  const officeHours = attendance.officeHours || { open: '10:00', close: '20:00' };
  const grace = Number(attendance.gracePeriodMinutes) || 0;
  const halfDay = attendance.halfDayRules || { lateBeyondMinutes: 60, workedLessThanHours: 4 };
  const absent = attendance.absentRules || { workedLessThanHours: 2 };
  const overtime = attendance.overtime || { enabled: false, minimumMinutes: 30 };

  const openMin = timeStringToMinutes(staffSchedule?.open || officeHours.open, 600);
  const closeMin = timeStringToMinutes(staffSchedule?.close || officeHours.close, 1200);

  const inMin = minutesFromMidnightIST(checkInAt);
  const outMin = minutesFromMidnightIST(checkOutAt);

  if (inMin === null) {
    return { status: 'absent', lateMinutes: 0, workedHours: 0, overtimeMinutes: 0 };
  }

  const lateMinutes = Math.max(0, inMin - (openMin + grace));

  let workedMinutes = 0;
  if (outMin !== null && outMin > inMin) {
    workedMinutes = outMin - inMin;
  }
  const workedHours = Math.round((workedMinutes / 60) * 100) / 100;

  let overtimeMinutes = 0;
  if (overtime.enabled && outMin !== null) {
    const extra = outMin - closeMin;
    if (extra >= (Number(overtime.minimumMinutes) || 0) && extra > 0) {
      overtimeMinutes = extra;
    }
  }

  let status = 'present';
  if (outMin !== null && workedHours < (Number(absent.workedLessThanHours) || 0)) {
    status = 'absent';
  } else if (
    (halfDay.lateBeyondMinutes > 0 && lateMinutes > Number(halfDay.lateBeyondMinutes)) ||
    (outMin !== null && workedHours < (Number(halfDay.workedLessThanHours) || 0))
  ) {
    status = 'half_day';
  } else if (lateMinutes > 0) {
    status = 'late';
  }

  return { status, lateMinutes, workedHours, overtimeMinutes };
}

/**
 * Overtime pay for a set of overtime minutes given rules + daily salary rate.
 * @param {number} overtimeMinutes
 * @param {object} overtimeRules attendance.overtime
 * @param {number} hourlyRate derived hourly rate (salary based) for multiplier mode
 */
function computeOvertimePay(overtimeMinutes, overtimeRules, hourlyRate) {
  const mins = Number(overtimeMinutes) || 0;
  if (mins <= 0 || !overtimeRules || !overtimeRules.enabled) return 0;
  const hours = mins / 60;
  if (overtimeRules.rateType === 'fixed_per_hour') {
    return Math.round(hours * (Number(overtimeRules.fixedAmount) || 0) * 100) / 100;
  }
  const rate = (Number(hourlyRate) || 0) * (Number(overtimeRules.multiplier) || 1);
  return Math.round(hours * rate * 100) / 100;
}

module.exports = {
  evaluateDay,
  computeOvertimePay,
  minutesFromMidnightIST,
  timeStringToMinutes,
};
