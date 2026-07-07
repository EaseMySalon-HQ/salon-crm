'use strict';

const mongoose = require('mongoose');

/** Immutable audit trail for payroll record changes. */
const payrollAuditLogSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    payrollRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollRecord',
      default: null,
    },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    staffName: { type: String, default: '' },
    month: { type: String, required: true },
    action: {
      type: String,
      enum: ['created', 'updated', 'marked_paid', 'marked_draft', 'deleted'],
      required: true,
    },
    performedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    performedByName: { type: String, default: '' },
    changes: {
      type: [
        {
          field: String,
          oldValue: mongoose.Schema.Types.Mixed,
          newValue: mongoose.Schema.Types.Mixed,
        },
      ],
      default: [],
    },
    performedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

payrollAuditLogSchema.index({ branchId: 1, payrollRecordId: 1, performedAt: -1 });
payrollAuditLogSchema.index({ branchId: 1, staffId: 1, month: 1 });

function blockUpdate() {
  throw new Error('PayrollAuditLog is immutable');
}
payrollAuditLogSchema.pre('findOneAndUpdate', blockUpdate);
payrollAuditLogSchema.pre('updateOne', blockUpdate);
payrollAuditLogSchema.pre('updateMany', blockUpdate);

module.exports = {
  schema: payrollAuditLogSchema,
  model:
    mongoose.models.PayrollAuditLog ||
    mongoose.model('PayrollAuditLog', payrollAuditLogSchema),
};
