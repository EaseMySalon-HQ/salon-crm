const mongoose = require('mongoose');
const { getAppointmentWindow, intervalsOverlap, ACTIVE_APPOINTMENT_STATUSES } = require('./scheduling-utils');

/**
 * Build Mongo query for appointments with UTC bounds overlapping [start, end).
 */
function overlapQueryForStaff(branchId, staffId, start, end, excludeAppointmentId) {
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
  if (excludeAppointmentId) {
    q._id = { $ne: new mongoose.Types.ObjectId(excludeAppointmentId.toString()) };
  }
  return q;
}

/**
 * @param {object} models — { Appointment, BookingHold }
 * @param {object} ctx — { branchId, staffId, start: Date, end: Date, excludeAppointmentId?, skipHoldCheck?: boolean }
 * @returns {Promise<{ conflict: boolean, reason?: string, details?: object }>}
 */
async function detectStaffConflict(models, ctx) {
  const { Appointment, BookingHold } = models;
  const { branchId, staffId, start, end, excludeAppointmentId } = ctx;

  const q = overlapQueryForStaff(branchId, staffId, start, end, excludeAppointmentId);
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
    if (excludeAppointmentId && apt._id.toString() === excludeAppointmentId.toString()) return false;
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
