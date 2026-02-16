const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'staff'],
    required: true
  },
  specialties: [{
    type: String
  }],
  salary: {
    type: Number,
    default: 0,
    min: 0
  },
  commissionProfileIds: [{
    type: String
  }],
  password: {
    type: String
  },
  notes: {
    type: String,
    default: ''
  },
  hasLoginAccess: {
    type: Boolean,
    default: false
  },
  allowAppointmentScheduling: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  workSchedule: [{
    day: { type: Number, required: true, min: 0, max: 6 }, // 0 = Sunday, 6 = Saturday
    enabled: { type: Boolean, default: true },
    startTime: { type: String, default: '09:00' }, // 24h "HH:mm"
    endTime: { type: String, default: '21:00' }    // 24h "HH:mm"
  }],
  permissions: [{
    module: { type: String, required: true },
    feature: { type: String, required: true },
    enabled: { type: Boolean, default: false }
  }],
  // Last selected role template in permissions modal: "admin" | "manager" | "staff" | "custom"
  permissionsTemplate: { type: String, default: null },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  consentPreferences: {
    type: {
      necessary: { type: Boolean, default: true },
      analytics: { type: Boolean, default: false },
      functional: { type: Boolean, default: false },
      marketing: { type: Boolean, default: false },
      dataProcessing: { type: Boolean, default: true },
      dataSharing: { type: Boolean, default: false }
    },
    default: null
  },
  consentUpdatedAt: {
    type: Date,
    default: null
  },
  // Email Notification Preferences (Managed by Admin)
  emailNotifications: {
    enabled: {
      type: Boolean,
      default: false
    },
    preferences: {
      dailySummary: { type: Boolean, default: false },
      weeklySummary: { type: Boolean, default: false },
      appointmentAlerts: { type: Boolean, default: false },
      receiptAlerts: { type: Boolean, default: false },
      exportAlerts: { type: Boolean, default: false },
      systemAlerts: { type: Boolean, default: false },
      lowInventory: { type: Boolean, default: false }
    },
    managedBy: {
      type: String,
      enum: ['admin'],
      default: 'admin'
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastUpdatedAt: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Export both schema and model for flexibility
module.exports = {
  schema: staffSchema,
  model: mongoose.model('Staff', staffSchema)
}; 