'use strict';

const mongoose = require('mongoose');

function dayOfWeekFromYmd(ymd) {
  return new Date(`${ymd}T12:00:00+05:30`).getDay();
}

function signedDays(entry) {
  const d = Number(entry.days) || 0;
  return entry.direction === 'earn' ? d : -d;
}

function serializeLedger(doc) {
  return {
    id: String(doc._id),
    staffId: String(doc.staffId),
    staffName: doc.staffName || '',
    date: doc.date,
    direction: doc.direction,
    days: doc.days,
    kind: doc.kind,
    reason: doc.reason || '',
    leaveRecordId: doc.leaveRecordId ? String(doc.leaveRecordId) : null,
    createdAt: doc.createdAt,
  };
}

/**
 * Whether staff is scheduled off on a calendar day (fixed weekoff or day-level exception).
 */
async function isScheduledOffDay(models, branchId, staffId, ymd, staffDoc) {
  const { StaffAvailabilityException, Staff } = models;
  const sid =
    staffId instanceof mongoose.Types.ObjectId
      ? staffId
      : new mongoose.Types.ObjectId(String(staffId));

  const ex = await StaffAvailabilityException.findOne({
    branchId,
    staffId: sid,
    date: ymd,
  }).lean();
  if (ex) {
    if (ex.type === 'closed') return true;
    if (ex.type === 'custom_hours') return false;
  }

  let staff = staffDoc;
  if (!staff) {
    staff = await Staff.findById(sid).select('workSchedule').lean();
  }
  const dow = dayOfWeekFromYmd(ymd);
  const dayRow = (staff?.workSchedule || []).find((r) => r.day === dow);
  if (dayRow) return dayRow.enabled === false;
  return false;
}

async function computeBalance(models, branchId, staffId) {
  const { StaffLeaveCreditLedger } = models;
  const sid =
    staffId instanceof mongoose.Types.ObjectId
      ? staffId
      : new mongoose.Types.ObjectId(String(staffId));

  const rows = await StaffLeaveCreditLedger.find({ branchId, staffId: sid })
    .select('direction days')
    .lean();

  let balance = 0;
  for (const row of rows) {
    balance += signedDays(row);
  }
  return Math.round(balance * 100) / 100;
}

async function sumLedgerInRange(models, branchId, staffId, from, to, direction) {
  const { StaffLeaveCreditLedger } = models;
  const query = {
    branchId,
    staffId,
    date: { $gte: from, $lte: to },
    direction,
  };
  const rows = await StaffLeaveCreditLedger.find(query).select('days').lean();
  const total = rows.reduce((sum, r) => sum + (Number(r.days) || 0), 0);
  return Math.round(total * 100) / 100;
}

async function createLedgerEntry(models, payload) {
  const { StaffLeaveCreditLedger } = models;
  return StaffLeaveCreditLedger.create(payload);
}

async function reversePaidLeaveUse(models, branchId, leaveRecord) {
  const { StaffLeaveCreditLedger } = models;
  const useEntry = await StaffLeaveCreditLedger.findOne({
    branchId,
    staffId: leaveRecord.staffId,
    leaveRecordId: leaveRecord._id,
    kind: 'paid_leave',
    direction: 'use',
  });

  if (!useEntry) return null;

  await createLedgerEntry(models, {
    branchId,
    staffId: leaveRecord.staffId,
    staffName: leaveRecord.staffName || '',
    date: leaveRecord.date,
    direction: 'earn',
    days: useEntry.days,
    kind: 'reversal',
    reason: `Reversed paid leave on ${leaveRecord.date}`,
    leaveRecordId: leaveRecord._id,
    createdBy: null,
  });

  await StaffLeaveCreditLedger.deleteOne({ _id: useEntry._id });
  return useEntry;
}

/**
 * Consume balance when recording paid leave from saved/comp-off credits.
 */
async function useBalanceForPaidLeave(models, branchId, staff, leaveRecord, days, createdBy) {
  const balance = await computeBalance(models, branchId, staff._id);
  if (balance < days) {
    const err = new Error(`Insufficient saved leave balance (${balance} day(s) available)`);
    err.status = 400;
    throw err;
  }

  await createLedgerEntry(models, {
    branchId,
    staffId: staff._id,
    staffName: staff.name || '',
    date: leaveRecord.date,
    direction: 'use',
    days,
    kind: 'paid_leave',
    reason: leaveRecord.reason || 'Paid leave from saved balance',
    leaveRecordId: leaveRecord._id,
    createdBy,
  });

  leaveRecord.fromBalance = true;
  leaveRecord.balanceDaysUsed = days;
  await leaveRecord.save();
}

/**
 * Scan attendance: staff who checked in on a scheduled weekoff earn 1 day credit.
 */
async function syncWorkedWeekoffs(models, branchId, from, to, options = {}) {
  const { staffId, createdBy, reason } = options;
  const { Staff, StaffAttendance, StaffLeaveCreditLedger } = models;

  const attendanceQuery = {
    branchId,
    date: { $gte: from, $lte: to },
    checkInAt: { $ne: null },
  };
  if (staffId && mongoose.Types.ObjectId.isValid(String(staffId))) {
    attendanceQuery.staffId = staffId;
  }

  const attendanceRows = await StaffAttendance.find(attendanceQuery).lean();
  if (attendanceRows.length === 0) {
    return { created: 0, skipped: 0, entries: [] };
  }

  const staffIds = [...new Set(attendanceRows.map((r) => String(r.staffId)))];
  const staffDocs = await Staff.find({ branchId, _id: { $in: staffIds } })
    .select('name workSchedule')
    .lean();
  const staffById = new Map(staffDocs.map((s) => [String(s._id), s]));

  let created = 0;
  let skipped = 0;
  const entries = [];

  for (const att of attendanceRows) {
    const sid = String(att.staffId);
    const staff = staffById.get(sid);
    if (!staff) {
      skipped += 1;
      continue;
    }

    const offDay = await isScheduledOffDay(models, branchId, att.staffId, att.date, staff);
    if (!offDay) {
      skipped += 1;
      continue;
    }

    const exists = await StaffLeaveCreditLedger.findOne({
      branchId,
      staffId: att.staffId,
      date: att.date,
      kind: 'worked_weekoff',
    }).lean();
    if (exists) {
      skipped += 1;
      continue;
    }

    const doc = await createLedgerEntry(models, {
      branchId,
      staffId: att.staffId,
      staffName: staff.name || att.staffName || '',
      date: att.date,
      direction: 'earn',
      days: 1,
      kind: 'worked_weekoff',
      reason: reason || 'Worked on scheduled weekoff (from attendance)',
      attendanceId: att._id,
      createdBy: createdBy || null,
    });
    created += 1;
    entries.push(serializeLedger(doc));
  }

  return { created, skipped, entries };
}

async function listBalances(models, branchId, range) {
  const { Staff, StaffLeaveCreditLedger } = models;
  const staffList = await Staff.find({ branchId, isActive: true })
    .select('name')
    .sort({ name: 1 })
    .lean();

  const ledgerRows = await StaffLeaveCreditLedger.find({ branchId })
    .select('staffId direction days date')
    .lean();

  const byStaff = new Map();
  for (const row of ledgerRows) {
    const id = String(row.staffId);
    if (!byStaff.has(id)) {
      byStaff.set(id, { balance: 0, earnedInPeriod: 0, usedInPeriod: 0 });
    }
    const bucket = byStaff.get(id);
    const signed = signedDays(row);
    bucket.balance += signed;
    if (range && row.date >= range.from && row.date <= range.to) {
      if (row.direction === 'earn') bucket.earnedInPeriod += Number(row.days) || 0;
      else bucket.usedInPeriod += Number(row.days) || 0;
    }
  }

  return staffList.map((s) => {
    const id = String(s._id);
    const stats = byStaff.get(id) || { balance: 0, earnedInPeriod: 0, usedInPeriod: 0 };
    return {
      staffId: id,
      staffName: s.name || '',
      balance: Math.round(stats.balance * 100) / 100,
      earnedInPeriod: Math.round(stats.earnedInPeriod * 100) / 100,
      usedInPeriod: Math.round(stats.usedInPeriod * 100) / 100,
    };
  });
}

module.exports = {
  dayOfWeekFromYmd,
  isScheduledOffDay,
  computeBalance,
  sumLedgerInRange,
  serializeLedger,
  createLedgerEntry,
  reversePaidLeaveUse,
  useBalanceForPaidLeave,
  syncWorkedWeekoffs,
  listBalances,
};
