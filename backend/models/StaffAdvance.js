'use strict';

const mongoose = require('mongoose');

/** Salary advance / loan given to staff; recovered via payroll deductions. */
const staffAdvanceSchema = new mongoose.Schema(
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
    /** Original advance amount */
    amount: { type: Number, required: true, min: 0 },
    /** Amount already recovered via payroll */
    recoveredAmount: { type: Number, default: 0, min: 0 },
    /** Per-month recovery cap (0 = recover full outstanding) */
    installmentAmount: { type: Number, default: 0, min: 0 },
    givenAt: { type: Date, default: Date.now },
    /** When payroll recovery may begin: current_cycle | next_cycle */
    recoveryFrom: {
      type: String,
      enum: ['current_cycle', 'next_cycle'],
      default: 'next_cycle',
    },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

staffAdvanceSchema.index({ branchId: 1, staffId: 1, status: 1 });

module.exports = {
  schema: staffAdvanceSchema,
  model:
    mongoose.models.StaffAdvance ||
    mongoose.model('StaffAdvance', staffAdvanceSchema),
};
