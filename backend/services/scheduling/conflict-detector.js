const mongoose = require('mongoose');
const { getAppointmentWindow, intervalsOverlap, ACTIVE_APPOINTMENT_STATUSES } = require('./scheduling-utils');

/**
 * @param {string[]} excludeAppointmentIds — objectIds as strings (deduped). Rows in this set
 *   are omitted from overlap results (used when the same finalize batch removes or moves them).
 */
function overlapQueryForStaff(branchId, staffId, start, end, excludeAppointmentIds = []) {
  const sid = new mongoose.Types.ObjectId(staffId.toString());
  const q = {
    branchId,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    $or: [
      { staffId: sid },
      { 'staffAssignments.staffId': sid }
    ],
    startAt: { $exists: true, $ne: null, $lt: end },
    endAt: { $exists: true, $ne: null, $gt: start }
  };
  const seen = new Set();
  const oids = [];
  for (const id of excludeAppointmentIds || []) {
    const s = id != null ? String(id).trim() : '';
    if (!s || !mongoose.Types.ObjectId.isValid(s) || seen.has(s)) continue;
    seen.add(s);
    oids.push(new mongoose.Types.ObjectId(s));
  }
  if (oids.length === 1) {
    q._id = { $ne: oids[0] };
  } else if (oids.length > 1) {
    q._id = { $nin: oids };
  }
  return q;
}

/**
 * @param {object} models — { Appointment, BookingHold }
 * @param {object} ctx — {
 *   branchId, staffId, start: Date, end: Date,
 *   excludeAppointmentId?, excludeAppointmentIds?: string[],
 *   skipHoldCheck?: boolean
 * }
 * @returns {Promise<{ conflict: boolean, reason?: string, details?: object }>}
 */
async function detectStaffConflict(models, ctx) {
  const { Appointment, BookingHold } = models;
  const { branchId, staffId, start, end, excludeAppointmentId, excludeAppointmentIds } = ctx;

  const excludedIdSet = new Set(
    ([]).concat(excludeAppointmentId ? [String(excludeAppointmentId)] : [], Array.isArray(excludeAppointmentIds) ? excludeAppointmentIds.map(String) : [])
  );

  const q = overlapQueryForStaff(branchId, staffId, start, end, [...excludedIdSet]);
  const hit = await Appointment.findOne(q).lean();
  if (hit) {
    return { conflict: true, reason: 'appointment_overlap', details: { appointmentId: hit._id } };
  }

  const legacyList = await Appointment.find({
    branchId,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    $and: [
      {
        $or: [
          { staffId },
          { 'staffAssignments.staffId': staffId }
        ]
      },
      {
        $or: [
          { startAt: null },
          { startAt: { $exists: false } },
          { endAt: null },
          { endAt: { $exists: false } }
        ]
      }
    ]
  }).lean();

  const legacyFiltered = legacyList.filter((apt) => {
    if (excludedIdSet.has(apt._id.toString())) return false;
    return !apt.startAt || !apt.endAt;
  });

  for (const apt of legacyFiltered) {
    const w = getAppointmentWindow(apt);
    if (w && intervalsOverlap(w.start, w.end, start, end)) {
      return { conflict: true, reason: 'appointment_overlap_legacy', details: { appointmentId: apt._id } };
    }
  }

  const now = new Date();
  /** Staff portal books without soft holds; TTL holds are for future online booking flows. */
  if (BookingHold && !ctx.skipHoldCheck) {
    const hold = await BookingHold.findOne({
      branchId,
      staffId,
      expiresAt: { $gt: now },
      startAt: { $lt: end },
      endAt: { $gt: start }
    }).lean();
    if (hold) {
      return { conflict: true, reason: 'hold_active', details: { holdId: hold._id } };
    }
  }

  return { conflict: false };
}

module.exports = {
  overlapQueryForStaff,
  detectStaffConflict
};
