const { detectStaffConflict } = require('./conflict-detector');
const { listCandidateStartsForDay, isSlotWithinAvailability } = require('./availability-engine');
const { toDateStringIST, parseDateIST } = require('../../utils/date-utils');

/**
 * Find another staff at same branch without conflict for [start, end).
 */
async function suggestAlternativeStaff(models, { branchId, staffId, start, end, excludeAppointmentId }) {
  const { Staff } = models;
  const all = await Staff.find({ branchId, allowAppointmentScheduling: { $ne: false } })
    .select('_id name')
    .lean();
  const alternatives = [];
  for (const s of all) {
    if (s._id.toString() === staffId.toString()) continue;
    const d = await detectStaffConflict(models, {
      branchId,
      staffId: s._id,
      start,
      end,
      excludeAppointmentId
    });
    if (!d.conflict) alternatives.push({ staffId: s._id, name: s.name });
  }
  return alternatives;
}

/**
 * Walk forward day-by-day and minute grid to find first non-conflicting slot.
 */
async function suggestNearestAvailableSlot(models, ctx) {
  const {
    branchId,
    staffId,
    businessDoc,
    durationMinutes,
    after = new Date(),
    maxDaysToScan = 14,
    stepMinutes = 15
  } = ctx;

  let day = new Date(after);
  for (let i = 0; i < maxDaysToScan; i++) {
    const ymd = toDateStringIST(day);
    const candidates = await listCandidateStartsForDay(models, {
      branchId,
      staffId,
      businessDoc,
      ymd,
      durationMinutes,
      stepMinutes
    });
    for (const { start, end } of candidates) {
      if (end <= after) continue;
      const within = await isSlotWithinAvailability(models, {
        branchId,
        staffId,
        businessDoc,
        start,
        end
      });
      if (!within.ok) continue;
      const d = await detectStaffConflict(models, { branchId, staffId, start, end });
      if (!d.conflict) return { start, end };
    }
    const next = parseDateIST(ymd);
    next.setDate(next.getDate() + 1);
    day = next;
  }
  return null;
}

module.exports = {
  suggestAlternativeStaff,
  suggestNearestAvailableSlot
};
