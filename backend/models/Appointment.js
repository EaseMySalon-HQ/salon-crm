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
    enum: ['scheduled', 'confirmed', 'arrived', 'service_started', 'completed', 'cancelled', 'missed'],
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
  },
  /** Parent booking (canonical multi-day / package grouping) */
  parentBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  /** UTC instants — source of truth for overlap & multi-day */
  startAt: {
    type: Date,
    default: null
  },
  endAt: {
    type: Date,
    default: null
  },
  /** Snapshot price at booking time (aligns with price; set together) */
  priceLockedAtBooking: {
    type: Number,
    default: null,
    min: 0
  },
  packageSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PackageSession',
    default: null
  },
  addOnLineItems: [{
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service'
    },
    name: { type: String, default: '' },
    price: { type: Number, min: 0, default: 0 }
  }],
  /** Package multi-day flow: payment collected when booking was created */
  prepaidAtBooking: {
    type: Boolean,
    default: false
  },
  /** Dedupes concurrent bookings for same staff + exact window (see pre-save) */
  slotKey: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

const ACTIVE_FOR_SLOT = ['scheduled', 'confirmed', 'arrived', 'service_started'];

// Validation middleware to ensure staff percentages add up to 100%
appointmentSchema.pre('save', function(next) {
  if (this.staffAssignments && this.staffAssignments.length > 0) {
    const totalPercentage = this.staffAssignments.reduce((sum, assignment) => sum + assignment.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) { // Allow for small floating point differences
      return next(new Error('Staff assignment percentages must add up to 100%'));
    }
  }
  if (this.startAt && this.endAt && ACTIVE_FOR_SLOT.includes(this.status)) {
    const primary = typeof this.getPrimaryStaff === 'function' ? this.getPrimaryStaff() : this.staffId;
    if (primary) {
      this.slotKey = `${String(this.branchId)}:${String(primary)}:${this.startAt.toISOString()}:${this.endAt.toISOString()}`;
    }
  } else {
    this.slotKey = null;
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

// Indexes: calendar lists, client/staff filters, booking groups
appointmentSchema.index({ branchId: 1, date: 1, time: 1 });
appointmentSchema.index({ branchId: 1, status: 1, date: 1 });
appointmentSchema.index({ branchId: 1, createdAt: -1 });
appointmentSchema.index({ clientId: 1, branchId: 1 });
appointmentSchema.index({ 'staffAssignments.staffId': 1, branchId: 1 });
appointmentSchema.index({ bookingGroupId: 1 }, { sparse: true });
appointmentSchema.index({ branchId: 1, parentBookingId: 1 }, { sparse: true });
appointmentSchema.index({ branchId: 1, startAt: 1, endAt: 1 }, { sparse: true });
appointmentSchema.index({ slotKey: 1 }, { unique: true, sparse: true });

// Export both schema and model for flexibility
module.exports = {
  schema: appointmentSchema,
  model: mongoose.model('Appointment', appointmentSchema)
}; 