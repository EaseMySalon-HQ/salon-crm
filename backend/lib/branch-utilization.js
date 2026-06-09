/**
 * Branch capacity utilization — booked staff-minutes vs scheduled working minutes.
 *
 * Used by daily_metrics cache, branch summary, staff directory, and staff/compare.
 */

'use strict';

const mongoose = require('mongoose');
const { getBusinessModel } = require('./get-all-branches');
const { availableMinutesInRange, pct, COMPLETED } = require('./branch-management-helpers');

function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return id;
  }
}

/** Normalize staff ids from sales / appointments (string, ObjectId, or legacy shapes). */
function normalizeStaffId(id) {
  if (id == null || id === '') return '';
  if (typeof id === 'string') return id.trim();
  if (id instanceof mongoose.Types.ObjectId) return String(id);
  if (typeof id === 'object') {
    if (id.$oid != null) return String(id.$oid).trim();
    const asString = typeof id.toString === 'function' ? id.toString() : '';
    if (asString && asString !== '[object Object]' && /^[a-fA-F0-9]{24}$/.test(asString)) {
      return asString;
    }
    if (id._id != null && id._id !== id) {
      return normalizeStaffId(id._id);
    }
  }
  return String(id).trim();
}

/** Business owner lives in main User DB; staff directory includes them but Staff collection does not. */
async function loadBranchOwnerStaff(mainConnection, branchId) {
  if (!mainConnection || !branchId) return null;
  const Business = getBusinessModel(mainConnection);
  const User =
    mainConnection.models.User ||
    mainConnection.model('User', require('../models/User').schema);
  const business = await Business.findById(branchId).select('owner').lean();
  if (!business?.owner) return null;
  const owner = await User.findById(business.owner)
    .select('firstName lastName role isActive avatar workSchedule')
    .lean();
  if (!owner) return null;
  const name = `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || 'Business Owner';
  return {
    id: normalizeStaffId(owner._id),
    name,
    role: owner.role || 'admin',
    isActive: owner.isActive !== false,
    avatar: owner.avatar || '',
    isOwner: true,
    workSchedule: owner.workSchedule || [],
  };
}

/**
 * Split completed appointment duration across assigned staff.
 * Appointments with no assignment contribute to `unassignedMinutes` only.
 */
function distributeAppointmentBookedMinutes(appts) {
  const bookedByStaff = new Map();
  let unassignedMinutes = 0;

  for (const a of appts || []) {
    const dur = Number(a.duration) || 0;
    if (dur <= 0) continue;

    const ids = new Set();
    if (a.staffAssignments?.length) {
      for (const sa of a.staffAssignments) {
        if (sa.staffId) ids.add(normalizeStaffId(sa.staffId));
      }
    } else if (a.staffId) {
      ids.add(normalizeStaffId(a.staffId));
    }

    if (ids.size === 0) {
      unassignedMinutes += dur;
      continue;
    }

    const share = dur / ids.size;
    for (const id of ids) {
      if (!id) continue;
      bookedByStaff.set(id, (bookedByStaff.get(id) || 0) + share);
    }
  }

  return { bookedByStaff, unassignedMinutes };
}

function sumBookedMinutes(bookedByStaff, unassignedMinutes) {
  let total = unassignedMinutes;
  for (const mins of bookedByStaff.values()) total += mins;
  return total;
}

function sumAvailableMinutes(roster, start, end) {
  let total = 0;
  for (const member of roster) {
    if (member.isActive === false) continue;
    total += availableMinutesInRange(member.workSchedule, start, end);
  }
  return total;
}

/**
 * Branch-level capacity for a date range (or single day).
 * Booked = all completed appointment minutes (split across assigned staff).
 * Available = active staff + active owner scheduled working minutes.
 */
async function computeBranchCapacityMetrics({ models, branch, mainConnection }, range) {
  const { Appointment, Staff, Feedback } = models;
  const { start, end } = range;
  const startStr = range.ymd(start);
  const endStr = range.ymd(end);
  const branchId = toObjectId(branch.id);

  const [appts, staffList, ownerStaff, ratingAgg] = await Promise.all([
    Appointment.find({
      branchId,
      date: { $gte: startStr, $lte: endStr },
      status: COMPLETED,
    })
      .select('duration staffId staffAssignments')
      .lean(),
    Staff.find({ isActive: true }).select('workSchedule _id').lean(),
    loadBranchOwnerStaff(mainConnection, branch.id),
    Feedback
      ? Feedback.aggregate([
          {
            $match: {
              branchId,
              submittedAt: { $gte: start, $lte: end },
              rating: { $gte: 1, $lte: 5 },
            },
          },
          { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
  ]);

  const roster = staffList.map((s) => ({
    id: normalizeStaffId(s._id),
    workSchedule: s.workSchedule || [],
    isActive: true,
  }));

  if (ownerStaff) {
    const ownerId = normalizeStaffId(ownerStaff.id);
    const existing = roster.find((r) => r.id === ownerId);
    if (existing) {
      if (ownerStaff.workSchedule?.length) existing.workSchedule = ownerStaff.workSchedule;
    } else {
      roster.push({
        id: ownerId,
        workSchedule: ownerStaff.workSchedule || [],
        isActive: ownerStaff.isActive !== false,
      });
    }
  }

  const { bookedByStaff, unassignedMinutes } = distributeAppointmentBookedMinutes(appts);
  const bookedMinutes = sumBookedMinutes(bookedByStaff, unassignedMinutes);
  const availableMinutes = sumAvailableMinutes(roster, start, end);

  const avgRating =
    ratingAgg[0]?.count > 0 ? Math.round(ratingAgg[0].avg * 10) / 10 : null;

  return {
    bookedMinutes,
    availableMinutes,
    capacityUtilizationPct: pct(bookedMinutes, availableMinutes),
    avgRating,
    bookedByStaff,
    unassignedMinutes,
  };
}

module.exports = {
  toObjectId,
  normalizeStaffId,
  loadBranchOwnerStaff,
  distributeAppointmentBookedMinutes,
  sumBookedMinutes,
  sumAvailableMinutes,
  computeBranchCapacityMetrics,
  COMPLETED,
};
