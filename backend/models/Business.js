const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
  // Basic Information
  name: { type: String, required: true },
  code: { type: String, unique: true }, // Generated unique code
  businessType: { 
    type: String, 
    enum: ['salon', 'spa', 'barbershop', 'beauty_clinic'], 
    default: 'salon' 
  },
  
  // Contact Information
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, default: 'India' }
  },
  contact: {
    phone: { type: String, required: true },
    email: { type: String, required: true },
    website: { type: String }
  },
  
  // Business Settings (from existing settings)
  settings: {
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
    currencySymbol: { type: String, default: '₹' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    timeFormat: { type: String, default: '12' }, // 12 or 24 hour
    taxRate: { type: Number, default: 18 },
    gstNumber: { type: String },
    businessLicense: { type: String },
    
    // Operating Hours
    operatingHours: {
      monday: { open: String, close: String, closed: Boolean },
      tuesday: { open: String, close: String, closed: Boolean },
      wednesday: { open: String, close: String, closed: Boolean },
      thursday: { open: String, close: String, closed: Boolean },
      friday: { open: String, close: String, closed: Boolean },
      saturday: { open: String, close: String, closed: Boolean },
      sunday: { open: String, close: String, closed: Boolean }
    },
    
    // Appointment Settings
    appointmentSettings: {
      slotDuration: { type: Number, default: 30 }, // minutes
      advanceBookingDays: { type: Number, default: 30 },
      bufferTime: { type: Number, default: 15 }, // minutes
      allowOnlineBooking: { type: Boolean, default: false }
    },
    
    // Notification Settings
    notifications: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      appointmentReminders: { type: Boolean, default: true },
      paymentConfirmations: { type: Boolean, default: true }
    },
    
    // Email Notification Configuration
    emailNotificationSettings: {
      enabled: { type: Boolean, default: false },
      // Staff members selected to receive notifications
      recipientStaffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],
      // Daily Summary Configuration
      dailySummary: {
        enabled: { type: Boolean, default: false },
        time: { type: String, default: '21:00' }, // HH:mm format
        recipientStaffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }]
      },
      // Weekly Summary Configuration
      weeklySummary: {
        enabled: { type: Boolean, default: false },
        day: { type: String, enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], default: 'sunday' },
        time: { type: String, default: '20:00' }, // HH:mm format
        recipientStaffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }]
      },
      // Appointment Notifications
      appointmentNotifications: {
        enabled: { type: Boolean, default: false },
        newAppointments: { type: Boolean, default: false },
        cancellations: { type: Boolean, default: false },
        noShows: { type: Boolean, default: false },
        reminders: { type: Boolean, default: false },
        reminderHoursBefore: { type: Number, default: 24 },
        recipientStaffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }]
      },
      // Receipt Notifications
      receiptNotifications: {
        enabled: { type: Boolean, default: false },
        sendToClients: { type: Boolean, default: true },
        sendToStaff: { type: Boolean, default: false },
        highValueThreshold: { type: Number, default: 0 }, // Alert if receipt > this amount
        recipientStaffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }]
      },
      // Export Notifications
      exportNotifications: {
        enabled: { type: Boolean, default: false },
        recipientStaffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }]
      },
      // System Alerts
      systemAlerts: {
        enabled: { type: Boolean, default: false },
        lowInventory: { type: Boolean, default: false },
        paymentFailures: { type: Boolean, default: false },
        systemErrors: { type: Boolean, default: false },
        recipientStaffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }]
      },
      
      // WhatsApp Notification Configuration
      whatsappNotificationSettings: {
        enabled: { type: Boolean, default: false },
        receiptNotifications: {
          enabled: { type: Boolean, default: false },
          autoSendToClients: { type: Boolean, default: true },
          highValueThreshold: { type: Number, default: 0 }
        },
        appointmentNotifications: {
          enabled: { type: Boolean, default: false },
          newAppointments: { type: Boolean, default: false },
          confirmations: { type: Boolean, default: false },
          reminders: { type: Boolean, default: false },
          cancellations: { type: Boolean, default: false }
        },
        systemAlerts: {
          enabled: { type: Boolean, default: false },
          lowInventory: { type: Boolean, default: false },
          paymentFailures: { type: Boolean, default: false }
        }
      }
    },
    
    // Branding
    branding: {
      logo: { type: String },
      primaryColor: { type: String, default: '#3B82F6' },
      secondaryColor: { type: String, default: '#1E40AF' },
      fontFamily: { type: String, default: 'Inter' }
    }
  },
  
  
  // Owner Information
  owner: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Status and Metadata
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended', 'deleted'], 
    default: 'active' 
  },
  isOnboarded: { type: Boolean, default: false },
  onboardingStep: { type: Number, default: 0 },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, // Track who deleted it
  
  // Multi-tenant support
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  
  // Pricing Plan Management
  plan: {
    planId: { 
      type: String, 
      enum: ['starter', 'professional', 'enterprise'], 
      default: 'starter' 
    },
    billingPeriod: { 
      type: String, 
      enum: ['monthly', 'yearly'], 
      default: 'monthly' 
    },
    renewalDate: { type: Date },
    isTrial: { type: Boolean, default: false },
    trialEndsAt: { type: Date },
    // Promotional feature overrides
    overrides: {
      features: [{ type: String }], // Array of feature IDs
      expiresAt: { type: Date }, // Optional expiry for promo features
      notes: { type: String }, // Reason for override
    },
    // Add-ons (e.g., WhatsApp, SMS)
    addons: {
      whatsapp: {
        enabled: { type: Boolean, default: false },
        quota: { type: Number, default: 0 }, // Monthly quota
        used: { type: Number, default: 0 }, // Current month usage
        lastResetAt: { type: Date }, // Last quota reset date
      },
      sms: {
        enabled: { type: Boolean, default: false },
        quota: { type: Number, default: 0 },
        used: { type: Number, default: 0 },
        lastResetAt: { type: Date },
      },
    },
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Generate unique business code
businessSchema.pre('save', async function(next) {
  if (!this.code) {
    let code;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
      // Count only non-deleted businesses for code generation
      const count = await mongoose.model('Business').countDocuments({ 
        status: { $ne: 'deleted' } 
      });
      code = `BIZ${String(count + 1).padStart(4, '0')}`;
      
      // Check if this code already exists (including deleted ones - codes are never reused)
      const existing = await mongoose.model('Business').findOne({ code });
      if (!existing) {
        isUnique = true;
      } else {
        attempts++;
      }
    }
    
    // Fallback to timestamp-based code if count-based fails
    if (!isUnique) {
      code = `BIZ${Date.now().toString().slice(-4)}`;
    }
    
    this.code = code;
  }
  next();
});

// Export both schema and model for flexibility
module.exports = {
  schema: businessSchema,
  model: mongoose.model('Business', businessSchema)
};
