const { parseDateIST, toDateStringIST } = require('../../utils/date-utils');
const { parseTimeToMinutes } = require('../../utils/date-utils');

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Weekday key from YYYY-MM-DD (calendar date, noon UTC to avoid DST edge).
 * @param {string} ymd
 * @returns {string}
 */
function dayKeyFromYmd(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 'monday';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return WEEKDAYS[dt.getUTCDay()];
}

/**
 * @param {object} business — Business lean doc (main DB) with settings.operatingHours
 * @param {string} ymd — YYYY-MM-DD (IST)
 * @returns {{ closed: boolean, open?: string, close?: string }}
 */
function getBranchOperatingWindow(business, ymd) {
  const key = dayKeyFromYmd(ymd);
  const hours = business?.settings?.operatingHours?.[key];
  if (!hours) {
    return { closed: false, open: '09:00', close: '18:00' };
  }
  if (hours.closed) return { closed: true };
  return { closed: false, open: hours.open || '09:00', close: hours.close || '18:00' };
}

/**
 * @returns {Promise<{ closed: boolean, open?: string, close?: string }>}
 */
async function getEffectiveStaffDayWindow(models, branchId, staffId, ymd, businessDoc) {
  const { StaffAvailability, StaffAvailabilityException, BranchHoliday } = models;

  if (BranchHoliday) {
    const hol = await BranchHoliday.findOne({ branchId, date: ymd }).lean();
    if (hol) return { closed: true };
  }

  if (StaffAvailabilityException) {
    const ex = await StaffAvailabilityException.findOne({ branchId, staffId, date: ymd }).lean();
    if (ex) {
      if (ex.type === 'closed') return { closed: true };
      if (ex.type === 'custom_hours' && ex.startTime && ex.endTime) {
        return { closed: false, open: ex.startTime, close: ex.endTime };
      }
    }
  }

  const key = dayKeyFromYmd(ymd);
  const dayNum = WEEKDAYS.indexOf(key);
  if (StaffAvailability) {
    const row = await StaffAvailability.findOne({
      branchId,
      staffId,
      dayOfWeek: dayNum === -1 ? 0 : dayNum
    }).lean();
    if (row) {
      if (row.closed) return { closed: true };
      return { closed: false, open: row.startTime, close: row.endTime };
    }
  }

  const { Staff } = models;
  if (Staff) {
    const staffDoc = await Staff.findById(staffId).lean();
    const dayRow = (staffDoc?.workSchedule || []).find(r => r.day === (dayNum === -1 ? 0 : dayNum));
    if (dayRow) {
      if (dayRow.enabled === false) return { closed: true };
      return { closed: false, open: dayRow.startTime || '09:00', close: dayRow.endTime || '21:00' };
    }
  }

  return getBranchOperatingWindow(businessDoc, ymd);
}

/**
 * Whether requested [start, end) falls inside open hours for staff (and branch not on holiday).
 * @param {Date} start
 * @param {Date} end
 */
async function isSlotWithinAvailability(models, { branchId, staffId, businessDoc, start, end }) {
  const ymdStart = toDateStringIST(start);
  const ymdEnd = toDateStringIST(end);
  if (ymdStart !== ymdEnd) {
    return { ok: false, reason: 'multi_day_slot_use_reschedule' };
  }
  const win = await getEffectiveStaffDayWindow(models, branchId, staffId, ymdStart, businessDoc);
  if (win.closed) return { ok: false, reason: 'closed' };

  const dayStart = parseDateIST(ymdStart);
  const openM = parseTimeToMinutes(win.open || '0:00');
  const closeM = parseTimeToMinutes(win.close || '23:59');
  const slotStartM = Math.round((start.getTime() - dayStart.getTime()) / 60000);
  const slotEndM = Math.round((end.getTime() - dayStart.getTime()) / 60000);
  if (slotStartM < openM || slotEndM > closeM) {
    return { ok: false, reason: 'outside_hours' };
  }
  return { ok: true };
}

/**
 * Generate candidate slot start times between open/close for a day (simple grid).
 * @param {string} ymd
 * @param {number} durationMinutes
 * @param {number} stepMinutes
 */
async function listCandidateStartsForDay(models, { branchId, staffId, businessDoc, ymd, durationMinutes, stepMinutes = 15 }) {
  const win = await getEffectiveStaffDayWindow(models, branchId, staffId, ymd, businessDoc);
  if (win.closed) return [];

  const dayStart = parseDateIST(ymd);
  const openM = parseTimeToMinutes(win.open || '0:00');
  const closeM = parseTimeToMinutes(win.close || '23:59');
  const out = [];
  for (let m = openM; m + durationMinutes <= closeM; m += stepMinutes) {
    const start = new Date(dayStart.getTime() + m * 60 * 1000);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    out.push({ start, end });
  }
  return out;
}

module.exports = {
  dayKeyFromYmd,
  getBranchOperatingWindow,
  getEffectiveStaffDayWindow,
  isSlotWithinAvailability,
  listCandidateStartsForDay
};
