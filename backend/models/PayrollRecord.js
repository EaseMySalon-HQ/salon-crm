'use strict';

const mongoose = require('mongoose');

/**
 * Monthly payroll record for a single staff member.
 * One document per (branchId, staffId, month). `month` is "YYYY-MM" (IST).
 *
 * Amounts are in the tenant's display currency (rupees), consistent with
 * Staff.salary and commission calculations elsewhere in the app.
 */
const payrollRecordSchema = new mongoose.Schema(
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
    // "YYYY-MM"
    month: { type: String, required: true },

    baseSalary: { type: Number, default: 0, min: 0 },
    incentive: { type: Number, default: 0, min: 0 },
    bonus: { type: Number, default: 0, min: 0 },
    /** Overtime pay computed from attendance when the overtime component is enabled. */
    overtimePay: { type: Number, default: 0, min: 0 },
    /** Late-arrival penalty deducted when the late-penalty formula item is enabled. */
    latePenalty: { type: Number, default: 0, min: 0 },
    deductions: { type: Number, default: 0, min: 0 },
    deductionNote: { type: String, default: '' },

    // Persisted net so historical rows stay stable even if inputs change later.
    netPay: { type: Number, default: 0 },

    /** Auto-calculated leave deduction (LWP) — stored for audit when saved */
    leaveDeduction: { type: Number, default: 0, min: 0 },
    unpaidLeaveDays: { type: Number, default: 0, min: 0 },
    /** Auto-calculated advance recovery this month */
    advanceRecovery: { type: Number, default: 0, min: 0 },
    /** Manual deductions on top of auto (leave + advance) */
    manualDeductions: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: ['draft', 'paid'], default: 'draft' },
    paidAt: { type: Date, default: null },
    paymentMethod: {
      type: String,
      enum: ['', 'cash', 'upi', 'bank', 'wallet'],
      default: '',
    },
    notes: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

payrollRecordSchema.index({ branchId: 1, month: 1 });
payrollRecordSchema.index({ branchId: 1, staffId: 1, month: 1 }, { unique: true });

module.exports = {
  schema: payrollRecordSchema,
  model:
    mongoose.models.PayrollRecord ||
    mongoose.model('PayrollRecord', payrollRecordSchema),
};
