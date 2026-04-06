const mongoose = require('mongoose');

const bookingHoldSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  createdBy: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

bookingHoldSchema.index({ branchId: 1, staffId: 1, startAt: 1, endAt: 1 });
bookingHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = {
  schema: bookingHoldSchema,
  model: mongoose.model('BookingHold', bookingHoldSchema)
};
