'use strict';

const mongoose = require('mongoose');

/** Per-day leave record for a staff member (IST calendar date). */
const staffLeaveRecordSchema = new mongoose.Schema(
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
    /** YYYY-MM-DD (IST) */
    date: { type: String, required: true },
    /** unpaid = LWP (deducts salary); paid = no deduction; half_day = 0.5 day unpaid */
    type: { type: String, enum: ['unpaid', 'paid', 'half_day'], default: 'unpaid' },
    reason: { type: String, default: '' },
    /** Paid leave consumed from comp-off / saved leave balance */
    fromBalance: { type: Boolean, default: false },
    balanceDaysUsed: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

staffLeaveRecordSchema.index({ branchId: 1, staffId: 1, date: 1 }, { unique: true });
staffLeaveRecordSchema.index({ branchId: 1, date: 1 });

module.exports = {
  schema: staffLeaveRecordSchema,
  model:
    mongoose.models.StaffLeaveRecord ||
    mongoose.model('StaffLeaveRecord', staffLeaveRecordSchema),
};
