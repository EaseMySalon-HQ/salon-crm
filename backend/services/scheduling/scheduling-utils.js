const { parseDateIST, toDateStringIST, minutesToTimeString } = require('../../utils/date-utils');

const ACTIVE_APPOINTMENT_STATUSES = ['scheduled', 'confirmed', 'arrived', 'service_started'];

/**
 * Effective time window for overlap checks (UTC instants).
 * @param {object} apt — lean or doc with date/time/duration or startAt/endAt
 * @returns {{ start: Date, end: Date } | null}
 */
function getAppointmentWindow(apt) {
  if (apt.startAt && apt.endAt) {
    return { start: new Date(apt.startAt), end: new Date(apt.endAt) };
  }
  if (!apt.date || apt.time == null || apt.time === '') return null;
  const dayStart = parseDateIST(apt.date);
  const { parseTimeToMinutes } = require('../../utils/date-utils');
  const mins = parseTimeToMinutes(apt.time);
  const start = new Date(dayStart.getTime() + mins * 60 * 1000);
  const durMin = apt.duration ?? 60;
  const end = new Date(start.getTime() + durMin * 60 * 1000);
  return { start, end };
}

/**
 * Keep legacy `date`, `time`, `duration` in sync with `startAt` / `endAt` (IST calendar).
 */
function syncLegacyDatetimeFromUtc(apt) {
  if (!apt.startAt || !apt.endAt) return;
  apt.date = toDateStringIST(apt.startAt);
  const dayStart = parseDateIST(apt.date);
  const startM = Math.max(0, Math.round((new Date(apt.startAt).getTime() - dayStart.getTime()) / 60000));
  apt.time = minutesToTimeString(startM);
  apt.duration = Math.max(1, Math.round((new Date(apt.endAt).getTime() - new Date(apt.startAt).getTime()) / 60000));
}

function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

/** Backfill startAt/endAt from legacy date + time + duration when missing */
function syncUtcFromLegacy(doc) {
  if (doc.startAt && doc.endAt) return doc;
  const w = getAppointmentWindow(doc);
  if (!w) return doc;
  doc.startAt = w.start;
  doc.endAt = w.end;
  return doc;
}

module.exports = {
  ACTIVE_APPOINTMENT_STATUSES,
  getAppointmentWindow,
  syncLegacyDatetimeFromUtc,
  syncUtcFromLegacy,
  intervalsOverlap
};
