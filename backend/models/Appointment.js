const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  // Additional services performed (e.g. B done in addition to A) - shown below primary on card
  additionalServiceIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  }],
  // Legacy field for backward compatibility
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: false
  },
  // New multi-staff support
  staffAssignments: [{
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true
    },
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    role: {
      type: String,
      default: 'primary' // primary, secondary, assistant, etc.
    }
  }],
  date: {
    type: String,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 60
  },
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'arrived', 'service_started', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  notes: {
    type: String,
    default: ''
  },
  leadSource: {
    type: String,
    default: ''
  },
  createdBy: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  // Links service-level cards that belong to the same logical booking (arrival is appointment-level)
  bookingGroupId: {
    type: String,
    default: null,
    sparse: true
  }
}, {
  timestamps: true
});

// Validation middleware to ensure staff percentages add up to 100%
appointmentSchema.pre('save', function(next) {
  if (this.staffAssignments && this.staffAssignments.length > 0) {
    const totalPercentage = this.staffAssignments.reduce((sum, assignment) => sum + assignment.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) { // Allow for small floating point differences
      return next(new Error('Staff assignment percentages must add up to 100%'));
    }
  }
  next();
});

// Helper method to get primary staff member
appointmentSchema.methods.getPrimaryStaff = function() {
  if (this.staffId) {
    return this.staffId; // Legacy support
  }
  const primaryAssignment = this.staffAssignments.find(assignment => assignment.role === 'primary');
  return primaryAssignment ? primaryAssignment.staffId : this.staffAssignments[0]?.staffId;
};

// Helper method to get all staff members
appointmentSchema.methods.getAllStaff = function() {
  if (this.staffId) {
    return [this.staffId]; // Legacy support
  }
  return this.staffAssignments.map(assignment => assignment.staffId);
};

// Export both schema and model for flexibility
module.exports = {
  schema: appointmentSchema,
  model: mongoose.model('Appointment', appointmentSchema)
}; 