const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['single', 'multi_day', 'package'],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'confirmed', 'completed', 'cancelled'],
    default: 'confirmed'
  },
  paymentMode: {
    type: String,
    enum: ['full_upfront', 'per_appointment', 'installment'],
    default: 'per_appointment'
  },
  paymentState: {
    type: String,
    enum: ['pending', 'partial', 'paid'],
    default: 'pending'
  },
  packagePurchaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientPackage',
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  /** Legacy string UUID / booking group — dual-write during migration */
  bookingGroupId: {
    type: String,
    default: null
  },
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

bookingSchema.index({ branchId: 1, clientId: 1, createdAt: -1 });
bookingSchema.index({ branchId: 1, status: 1 });

module.exports = {
  schema: bookingSchema,
  model: mongoose.model('Booking', bookingSchema)
};
