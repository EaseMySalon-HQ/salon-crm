const mongoose = require('mongoose');

const staffAvailabilityExceptionSchema = new mongoose.Schema({
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
  /** YYYY-MM-DD in salon calendar (IST) */
  date: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['closed', 'custom_hours'],
    default: 'closed'
  },
  startTime: { type: String, default: null },
  endTime: { type: String, default: null }
}, {
  timestamps: true
});

staffAvailabilityExceptionSchema.index({ branchId: 1, staffId: 1, date: 1 });

module.exports = {
  schema: staffAvailabilityExceptionSchema,
  model: mongoose.model('StaffAvailabilityException', staffAvailabilityExceptionSchema)
};
