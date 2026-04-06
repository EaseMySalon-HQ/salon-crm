const mongoose = require('mongoose');

const packageSessionSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  clientPackageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientPackage',
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  sessionNumber: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    enum: ['unscheduled', 'scheduled', 'completed', 'missed', 'cancelled'],
    default: 'unscheduled'
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null
  },
  scheduledStartAt: { type: Date, default: null },
  scheduledEndAt: { type: Date, default: null },
  valueSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

packageSessionSchema.index({ clientPackageId: 1, sessionNumber: 1 }, { unique: true });
packageSessionSchema.index({ branchId: 1, status: 1, expiresAt: 1 });
packageSessionSchema.index({ clientId: 1, branchId: 1 });

module.exports = {
  schema: packageSessionSchema,
  model: mongoose.model('PackageSession', packageSessionSchema)
};
