const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    lowercase: true
  },
  source: {
    type: String,
    enum: ['walk-in', 'phone', 'website', 'social', 'referral', 'other'],
    default: 'walk-in'
  },
  status: {
    type: String,
    enum: ['new', 'follow-up', 'converted', 'lost'],
    default: 'new'
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'others']
  },
  interestedServices: [{
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service'
    },
    serviceName: {
      type: String
    }
  }],
  assignedStaffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },
  followUpDate: {
    type: Date
  },
  notes: {
    type: String,
    default: ''
  },
  // Conversion tracking
  convertedToAppointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  convertedToClientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  convertedAt: {
    type: Date
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
leadSchema.index({ branchId: 1, status: 1 });
leadSchema.index({ branchId: 1, assignedStaffId: 1 });
leadSchema.index({ branchId: 1, followUpDate: 1 });

// Export both schema and model for flexibility
module.exports = {
  schema: leadSchema,
  model: mongoose.model('Lead', leadSchema)
};

