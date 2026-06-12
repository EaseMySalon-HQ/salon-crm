const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { syncUtcFromLegacy } = require('../services/scheduling/scheduling-utils');

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
    enum: ['scheduled', 'confirmed', 'arrived', 'service_started', 'completed', 'cancelled', 'cancelled_at_billing', 'missed'],
    default: 'scheduled'
  },
  /** Audit: when a service was cancelled during the Raise Sale confirmation step */
  cancelledAtBillingAt: {
    type: Date,
    default: null
  },
  cancelledAtBillingBy: {
    type: String,
    default: ''
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
  /**
   * Client has requested this stylist for this booking — salon should prefer not to reassign.
   * Stored per appointment row (each card in a booking group may differ).
   */
  staffLocked: {
    type: Boolean,
    default: false,
  },
  /**
   * Set by POST /appointments when allowParallelBooking is true. slotKey gets a unique suffix so two
   * active rows may share the same staff + wall-clock window (double booking).
   */
  allowStaffOverlap: {
    type: Boolean,
    default: false,
  },
  /** Timestamp when WhatsApp reminder was sent — used to prevent duplicate sends */
  reminderSentAt: {
    type: Date,
    default: null
  },
  /** GMB review request WhatsApp sent after appointment completion */
  gmbReviewRequestSent: {
    type: Boolean,
    default: false,
  },
  /** UTM attribution for GMB-sourced bookings */
  utmSource: { type: String, default: null },
  utmMedium: { type: String, default: null },
  utmCampaign: { type: String, default: null },
  estimatedRevenue: { type: Number, default: null, min: 0 },
  /** Dedupes concurrent bookings for same staff + exact window (see pre-save). Omitted when not applicable (do not set null — unique index). */
  slotKey: {
    type: String,
    required: false
  },
  /** How services within the booking group are scheduled. Per-service custom start times use 'custom'. */
  schedulingMode: {
    type: String,
    enum: ['sequential', 'custom'],
    default: 'sequential'
  },
  /**
   * Optional repeat rule (UI + storage; scheduler integration can use later).
   * frequency: repeat = generic repeat (weekly-style); custom uses customInterval + customUnit.
   */
  recurrence: {
    frequency: {
      type: String,
      enum: ['doesnt', 'repeat', 'daily', 'weekly', 'monthly', 'custom'],
      default: 'doesnt',
    },
    customInterval: { type: Number, default: 1, min: 1 },
    customUnit: {
      type: String,
      enum: ['day', 'week', 'month'],
      default: 'week',
    },
    endType: {
      type: String,
      enum: ['never', 'count', 'date'],
      default: 'never',
    },
    endAfterCount: { type: Number, default: null, min: 1 },
    /** yyyy-MM-dd when endType === 'date' */
    endOnDate: { type: String, default: null },
  },
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
  // Legacy POST /appointments sends date+time+duration but not startAt/endAt; slotKey needs UTC window.
  syncUtcFromLegacy(this);

  if (this.startAt && this.endAt && ACTIVE_FOR_SLOT.includes(this.status)) {
    const primary = typeof this.getPrimaryStaff === 'function' ? this.getPrimaryStaff() : this.staffId;
    if (primary) {
      const base = `${String(this.branchId)}:${String(primary)}:${this.startAt.toISOString()}:${this.endAt.toISOString()}`;
      this.slotKey = this.allowStaffOverlap === true ? `${base}:${randomUUID()}` : base;
    } else {
      this.set('slotKey', undefined);
    }
  } else {
    this.set('slotKey', undefined);
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
// Only index real slot strings so legacy rows without a window are not all dup-null.
appointmentSchema.index(
  { slotKey: 1 },
  { unique: true, partialFilterExpression: { slotKey: { $exists: true, $type: 'string' } } }
);

// Export both schema and model for flexibility
module.exports = {
  schema: appointmentSchema,
  model: mongoose.model('Appointment', appointmentSchema)
}; 