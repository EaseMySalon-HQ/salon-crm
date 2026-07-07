'use strict';

const mongoose = require('mongoose');

/**
 * Daily check-in / check-out for a staff member (IST calendar date).
 * One open session per (branchId, staffId, date).
 */
const staffAttendanceSchema = new mongoose.Schema(
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
    checkInAt: { type: Date, required: true },
    checkOutAt: { type: Date, default: null },
    checkInBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    checkInByName: { type: String, default: '' },
    checkOutBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    checkOutByName: { type: String, default: '' },
  },
  { timestamps: true }
);

staffAttendanceSchema.index({ branchId: 1, staffId: 1, date: 1 }, { unique: true });
staffAttendanceSchema.index({ branchId: 1, date: 1 });

module.exports = {
  schema: staffAttendanceSchema,
  model:
    mongoose.models.StaffAttendance ||
    mongoose.model('StaffAttendance', staffAttendanceSchema),
};
