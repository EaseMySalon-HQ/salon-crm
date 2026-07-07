'use strict';

const mongoose = require('mongoose');

/**
 * Comp-off / saved leave ledger (earn when working on weekoff, use when taking paid leave).
 */
const staffLeaveCreditLedgerSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
    },
    staffName: { type: String, default: '' },
    /** Calendar date this entry relates to (YYYY-MM-DD IST) */
    date: { type: String, required: true },
    /** earn = credit added; use = credit consumed */
    direction: { type: String, enum: ['earn', 'use'], required: true },
    days: { type: Number, required: true, min: 0.5 },
    kind: {
      type: String,
      enum: [
        'worked_weekoff',
        'skipped_weekoff',
        'manual_earn',
        'manual_use',
        'paid_leave',
        'reversal',
      ],
      required: true,
    },
    reason: { type: String, default: '' },
    leaveRecordId: { type: mongoose.Schema.Types.ObjectId, default: null },
    attendanceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

staffLeaveCreditLedgerSchema.index({ branchId: 1, staffId: 1, date: -1 });
staffLeaveCreditLedgerSchema.index(
  { branchId: 1, staffId: 1, date: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: {
      kind: { $in: ['worked_weekoff', 'paid_leave'] },
    },
  }
);

module.exports = {
  schema: staffLeaveCreditLedgerSchema,
  model:
    mongoose.models.StaffLeaveCreditLedger ||
    mongoose.model('StaffLeaveCreditLedger', staffLeaveCreditLedgerSchema),
};
