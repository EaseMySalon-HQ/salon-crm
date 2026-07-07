'use strict';

const { round2 } = require('./payroll-calculator');

function serializeLedgerEntry(row) {
  return {
    id: String(row._id),
    advanceId: String(row.advanceId),
    staffId: String(row.staffId),
    staffName: row.staffName || '',
    type: row.type,
    amount: row.amount || 0,
    outstandingAfter: row.outstandingAfter ?? 0,
    notes: row.notes || '',
    payrollRecordId: row.payrollRecordId ? String(row.payrollRecordId) : null,
    payrollMonth: row.payrollMonth || '',
    performedByName: row.performedByName || '',
    createdAt: row.createdAt,
  };
}

async function appendAdvanceLedgerEntry(businessModels, entry) {
  const { StaffAdvanceLedger } = businessModels;
  const doc = await StaffAdvanceLedger.create(entry);
  return doc;
}

async function listAdvanceLedger(businessModels, branchId, advanceId) {
  const { StaffAdvanceLedger, StaffAdvance } = businessModels;
  const rows = await StaffAdvanceLedger.find({ branchId, advanceId })
    .sort({ createdAt: 1 })
    .lean();

  if (rows.some((r) => r.type === 'given')) {
    return rows.map(serializeLedgerEntry);
  }

  const advance = await StaffAdvance.findOne({ _id: advanceId, branchId }).lean();
  if (!advance) return rows.map(serializeLedgerEntry);

  const outstanding = round2((advance.amount || 0) - (advance.recoveredAmount || 0));
  const synthetic = {
    _id: `synthetic-given-${advance._id}`,
    advanceId: advance._id,
    staffId: advance.staffId,
    staffName: advance.staffName || '',
    type: 'given',
    amount: advance.amount || 0,
    outstandingAfter: advance.amount || 0,
    notes: advance.notes || '',
    payrollRecordId: null,
    payrollMonth: '',
    performedByName: '',
    createdAt: advance.givenAt || advance.createdAt,
  };

  return [serializeLedgerEntry(synthetic), ...rows.map(serializeLedgerEntry)];
}

/**
 * Undo advance recoveries applied when a payroll was marked paid.
 * Uses ledger rows for this payroll; falls back to amount-based peel-back for legacy data.
 */
async function reverseAdvanceRecoveryForPayroll(
  businessModels,
  branchId,
  payrollRecordId,
  context = {}
) {
  const { StaffAdvanceLedger, StaffAdvance } = businessModels;
  const {
    payrollMonth = '',
    performedBy = null,
    performedByName = 'System',
    fallbackAmount = 0,
    staffId = null,
  } = context;

  const recoveryEntries = await StaffAdvanceLedger.find({
    branchId,
    payrollRecordId,
    type: 'recovery',
  })
    .sort({ createdAt: -1 })
    .lean();

  const reverseChunk = async (adv, chunk) => {
    if (chunk <= 0) return;
    const newRecovered = round2(Math.max(0, (adv.recoveredAmount || 0) - chunk));
    const newOutstanding = round2((adv.amount || 0) - newRecovered);
    const updates = { recoveredAmount: newRecovered };
    if (adv.status === 'closed' && newOutstanding > 0) {
      updates.status = 'active';
    }
    await StaffAdvance.updateOne({ _id: adv._id }, { $set: updates });
    await appendAdvanceLedgerEntry(businessModels, {
      branchId,
      advanceId: adv._id,
      staffId: adv.staffId,
      staffName: adv.staffName || '',
      type: 'reversal',
      amount: chunk,
      outstandingAfter: newOutstanding,
      notes: payrollMonth ? `Payroll undo — ${payrollMonth}` : 'Payroll undo — advance recovery reversed',
      payrollRecordId,
      payrollMonth,
      performedBy,
      performedByName,
    });
  };

  if (recoveryEntries.length > 0) {
    for (const entry of recoveryEntries) {
      const adv = await StaffAdvance.findOne({ _id: entry.advanceId, branchId });
      if (!adv) continue;
      await reverseChunk(adv, entry.amount || 0);
    }
    return;
  }

  if (fallbackAmount <= 0 || !staffId) return;

  let remaining = round2(fallbackAmount);
  const advances = await StaffAdvance.find({ branchId, staffId }).sort({ givenAt: -1 }).lean();
  for (const adv of advances) {
    if (remaining <= 0) break;
    const recovered = round2(adv.recoveredAmount || 0);
    if (recovered <= 0) continue;
    const chunk = Math.min(remaining, recovered);
    const live = await StaffAdvance.findOne({ _id: adv._id, branchId });
    if (!live) continue;
    await reverseChunk(live, chunk);
    remaining = round2(remaining - chunk);
  }
}

module.exports = {
  appendAdvanceLedgerEntry,
  listAdvanceLedger,
  serializeLedgerEntry,
  reverseAdvanceRecoveryForPayroll,
};
