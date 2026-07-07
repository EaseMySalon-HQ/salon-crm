'use strict';

const mongoose = require('mongoose');

/** Transaction history for a staff salary advance. */
const staffAdvanceLedgerSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    advanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StaffAdvance',
      required: true,
      index: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
    },
    staffName: { type: String, default: '' },
    /** given | recovery | closed | reversal | adjustment */
    type: {
      type: String,
      enum: ['given', 'recovery', 'closed', 'reversal', 'adjustment'],
      required: true,
    },
    /** Transaction amount (always positive). */
    amount: { type: Number, required: true, min: 0 },
    /** Outstanding balance after this entry. */
    outstandingAfter: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
    payrollRecordId: { type: mongoose.Schema.Types.ObjectId, default: null },
    payrollMonth: { type: String, default: '' },
    performedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    performedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

staffAdvanceLedgerSchema.index({ branchId: 1, advanceId: 1, createdAt: -1 });
staffAdvanceLedgerSchema.index({ branchId: 1, staffId: 1, createdAt: -1 });

module.exports = {
  schema: staffAdvanceLedgerSchema,
  model:
    mongoose.models.StaffAdvanceLedger ||
    mongoose.model('StaffAdvanceLedger', staffAdvanceLedgerSchema),
};
