const mongoose = require('mongoose');

/** Recurring weekly availability row per staff (0 = Sunday … 6 = Saturday) */
const staffAvailabilitySchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6
  },
  startTime: { type: String, default: '09:00' },
  endTime: { type: String, default: '18:00' },
  closed: {
    type: Boolean,
    default: false
  },
  effectiveFrom: { type: Date, default: null },
  effectiveTo: { type: Date, default: null }
}, {
  timestamps: true
});

staffAvailabilitySchema.index({ branchId: 1, staffId: 1, dayOfWeek: 1 });

module.exports = {
  schema: staffAvailabilitySchema,
  model: mongoose.model('StaffAvailability', staffAvailabilitySchema)
};
