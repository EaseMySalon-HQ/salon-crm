const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

const adminSettingsSchema = new mongoose.Schema({
  // System Configuration
  system: {
    inactiveBusinessMonitoring: {
      enabled: { type: Boolean, default: true },
      daysThreshold: { type: Number, default: 30 },
      action: { type: String, enum: ['notify', 'suspend', 'delete'], default: 'notify' }
    },
    sessionManagement: {
      maxSessionDuration: { type: Number, default: 24 },
      enableSessionTimeout: { type: Boolean, default: true },
      sessionTimeoutMinutes: { type: Number, default: 30 }
    },
    security: {
      enableTwoFactor: { type: Boolean, default: false },
      passwordPolicy: {
        minLength: { type: Number, default: 8 },
        requireUppercase: { type: Boolean, default: true },
        requireLowercase: { type: Boolean, default: true },
        requireNumbers: { type: Boolean, default: true },
        requireSpecialChars: { type: Boolean, default: false }
      }
    },
    monitoring: {
      enableHealthChecks: { type: Boolean, default: true },
      healthCheckInterval: { type: Number, default: 5 },
      enablePerformanceMonitoring: { type: Boolean, default: true }
    }
  },
  
  // Business Management
  business: {
    defaultSettings: {
      currency: { type: String, default: 'INR' },
      timezone: { type: String, default: 'Asia/Kolkata' },
      dateFormat: { type: String, default: 'DD/MM/YYYY' }
    },
    creationRules: {
      requireEmailVerification: { type: Boolean, default: false },
      autoApprove: { type: Boolean, default: true },
      maxBusinessesPerUser: { type: Number, default: 1 }
    }
  },
  
  // User Management
  users: {
    defaultRole: { type: String, default: 'staff' },
    enableUserRegistration: { type: Boolean, default: false },
    requireEmailVerification: { type: Boolean, default: false }
  },
  
  // Database & System
  database: {
    backupFrequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
    enableAutoBackup: { type: Boolean, default: true },
    retentionDays: { type: Number, default: 30 }
  },
  
  // Notifications & Alerts
  notifications: {
    email: {
      enabled: { type: Boolean, default: true },
      provider: { type: String, enum: ['resend', 'smtp', 'sendgrid', 'ses', 'mailgun'], default: 'resend' },
      // Resend configuration
      resendApiKey: { type: String, default: '' },
      // SMTP configuration
      smtpHost: { type: String, default: 'smtp.gmail.com' },
      smtpPort: { type: Number, default: 587 },
      smtpSecure: { type: Boolean, default: false },
      smtpUser: { type: String, default: '' },
      smtpPassword: { type: String, default: '' },
      // SendGrid configuration
      sendgridApiKey: { type: String, default: '' },
      // AWS SES configuration
      sesAccessKeyId: { type: String, default: '' },
      sesSecretAccessKey: { type: String, default: '' },
      sesRegion: { type: String, default: 'us-east-1' },
      // Mailgun configuration
      mailgunApiKey: { type: String, default: '' },
      mailgunDomain: { type: String, default: '' },
      // Common settings
      fromEmail: { type: String, default: 'noreply@easemysalon.in' },
      fromName: { type: String, default: 'EaseMySalon' },
      replyTo: { type: String, default: 'support@easemysalon.in' },
      maxRetries: { type: Number, default: 3 },
      retryDelay: { type: Number, default: 5000 }
    },
    sms: {
      enabled: { type: Boolean, default: false },
      provider: { type: String, enum: ['twilio', 'aws', 'nexmo', 'textlocal', 'msg91'], default: 'twilio' },
      twilioAccountSid: { type: String, default: '' },
      twilioAuthToken: { type: String, default: '' },
      twilioFromNumber: { type: String, default: '' },
      awsAccessKeyId: { type: String, default: '' },
      awsSecretAccessKey: { type: String, default: '' },
      awsRegion: { type: String, default: 'us-east-1' },
      msg91AuthKey: { type: String, default: '' },
      templates: {
        receipt: { type: String, default: '' },
        appointmentConfirmation: { type: String, default: '' },
        appointmentCancellation: { type: String, default: '' },
        test: { type: String, default: '' }
      },
      // Optional: map MSG91 variables to receipt fields (e.g. { VAR1: 'clientName', VAR2: 'businessName', VAR3: 'total', VAR4: 'receiptNumber' })
      receiptVariableMapping: { type: mongoose.Schema.Types.Mixed, default: undefined },
      maxRetries: { type: Number, default: 3 },
      retryDelay: { type: Number, default: 5000 }
    },
    whatsapp: {
      enabled: { type: Boolean, default: false },
      provider: { type: String, enum: ['msg91'], default: 'msg91' },
      msg91ApiKey: { type: String, default: '' },
      msg91SenderId: { type: String, default: '' },
      // Template IDs for different notification types
      templates: {
        welcomeMessage: { type: String, default: '' }, // Welcome message
        businessAccountCreated: { type: String, default: '' }, // Business account created
        receipt: { type: String, default: '' }, // Sending bills/receipts
        receiptCancellation: { type: String, default: '' }, // Bill cancellation
        appointmentScheduling: { type: String, default: '' }, // Appointment scheduling
        appointmentConfirmation: { type: String, default: '' }, // Appointment confirmation
        appointmentCancellation: { type: String, default: '' }, // Appointment cancellation
        appointmentReminder: { type: String, default: '' }, // Appointment reminder
        appointmentReschedule: { type: String, default: '' }, // Appointment reschedule
        default: { type: String, default: '' } // Default/fallback template
      },
      // Template variable mappings - configure which variables each template uses
      // Maps template variable names (body_1, body_2, etc.) to data field names
      // These are auto-populated when JavaScript code is parsed from approved MSG91 templates
      // Example structure: { welcomeMessage: { body_1: 'clientName', body_2: 'businessName' }, ... }
      templateVariables: {
        type: mongoose.Schema.Types.Mixed,
        default: {} // Start empty - will be populated when templates are configured with JavaScript code
      },
      // Store the raw JavaScript code for each template (for parsing and re-display)
      templateJavaScriptCodes: {
        type: mongoose.Schema.Types.Mixed,
        default: {} // Stores JavaScript code for each template type
      },
      // Legacy: Keep for backward compatibility
      msg91TemplateId: { type: String, default: '' },
      // Template configuration
      templateIncludesBaseUrl: { type: Boolean, default: true }, // If true, template already has base URL, only pass path variables
      templateIncludesGoogleMapsBaseUrl: { type: Boolean, default: true }, // If true, MSG91 template URL is https://maps.app.goo.gl/{{1}} — send slug only
      // Notification preferences (system defaults)
      receiptNotifications: { type: Boolean, default: true },
      appointmentNotifications: { type: Boolean, default: true },
      systemAlerts: { type: Boolean, default: false },
      quietHours: {
        enabled: { type: Boolean, default: false },
        start: { type: String, default: '22:00' },
        end: { type: String, default: '08:00' }
      },
      maxRetries: { type: Number, default: 3 },
      retryDelay: { type: Number, default: 5000 }
    },
    templates: {
      businessCreated: {
        subject: { type: String, default: 'Welcome to EaseMySalon - Business Account Created' },
        body: { type: String, default: 'Your business account has been successfully created. Business Code: {businessCode}' },
        enabled: { type: Boolean, default: true }
      },
      businessInactive: {
        subject: { type: String, default: 'Business Account Inactive - Action Required' },
        body: { type: String, default: 'Your business account has been marked as inactive due to no login activity for {days} days.' },
        enabled: { type: Boolean, default: true }
      },
      systemAlert: {
        subject: { type: String, default: 'System Alert - {alertType}' },
        body: { type: String, default: 'System alert: {message}. Please check the admin panel for details.' },
        enabled: { type: Boolean, default: true }
      },
      userCreated: {
        subject: { type: String, default: 'Welcome to EaseMySalon - User Account Created' },
        body: { type: String, default: 'Your user account has been created. Please log in to access the system.' },
        enabled: { type: Boolean, default: true }
      },
      receiptNotification: {
        subject: { type: String, default: 'Receipt {receiptNumber} - {businessName}' },
        body: { type: String, default: 'Dear {clientName},\n\nThank you for your visit!\n\n{receiptLink}\n\nThank you for choosing {businessName}!' },
        enabled: { type: Boolean, default: true }
      },
      appointmentNotification: {
        subject: { type: String, default: 'Appointment Confirmation - {date}' },
        body: { type: String, default: 'Dear {clientName},\n\nYour appointment has been confirmed!\n\nAppointment Details:\nService: {serviceName}\nDate: {date}\nTime: {time}\nStaff: {staffName}\nBusiness: {businessName}\nPhone: {businessPhone}\n\n{notes}\n\nWe look forward to seeing you!' },
        enabled: { type: Boolean, default: true }
      }
    },
    alerts: {
      systemHealth: {
        enabled: { type: Boolean, default: true },
        cpuThreshold: { type: Number, default: 80 },
        memoryThreshold: { type: Number, default: 85 },
        diskThreshold: { type: Number, default: 90 },
        recipients: [{ type: String }]
      },
      businessInactive: {
        enabled: { type: Boolean, default: true },
        daysThreshold: { type: Number, default: 7 },
        recipients: [{ type: String }]
      },
      errorAlerts: {
        enabled: { type: Boolean, default: true },
        errorLevel: { type: String, enum: ['error', 'warn', 'info'], default: 'error' },
        recipients: [{ type: String }]
      },
      securityAlerts: {
        enabled: { type: Boolean, default: true },
        failedLoginThreshold: { type: Number, default: 5 },
        recipients: [{ type: String }]
      }
    },
    preferences: {
      realTimeNotifications: { type: Boolean, default: true },
      digestNotifications: { type: Boolean, default: false },
      digestFrequency: { type: String, enum: ['hourly', 'daily', 'weekly'], default: 'daily' },
      quietHours: {
        enabled: { type: Boolean, default: false },
        start: { type: String, default: '22:00' },
        end: { type: String, default: '08:00' }
      },
      channels: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        inApp: { type: Boolean, default: true }
      }
    }
  },
  
  // API & Integration
  // Note: the admin UI's "API & Integration" category submits several sibling
  // keys (authentication, rateLimiting, integrations, webhooks, security) that
  // are merged into `api` by updateSettings(). Those keys are declared Mixed so
  // the full payload (payment gateway credentials, webhook configs, etc.) is
  // actually persisted — otherwise strict mode silently drops them on save.
  api: {
    version: { type: String, default: 'v1' },
    baseUrl: { type: String, default: 'https://api.ease-my-salon.com' },
    timeout: { type: Number, default: 30000 },
    maxRequestsPerMinute: { type: Number, default: 100 },
    enableCORS: { type: Boolean, default: true },
    allowedOrigins: [{ type: String }],
    enableRateLimiting: { type: Boolean, default: true },
    enableLogging: { type: Boolean, default: true },
    enableMetrics: { type: Boolean, default: true },
    authentication: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    rateLimiting: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    integrations: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    webhooks: { type: mongoose.Schema.Types.Mixed, default: () => [] },
    security: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
  }
}, {
  timestamps: true
});

// Create a singleton document
adminSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  
  // Ensure WhatsApp settings structure exists with proper defaults
  if (!settings.notifications) {
    settings.notifications = {};
  }
  if (!settings.notifications.whatsapp) {
    settings.notifications.whatsapp = {
      enabled: false,
      provider: 'msg91',
      msg91ApiKey: '',
      msg91SenderId: '',
      templateIncludesBaseUrl: true,
      templateIncludesGoogleMapsBaseUrl: true,
      templates: {
        welcomeMessage: '',
        businessAccountCreated: '',
        receipt: '',
        receiptCancellation: '',
        appointmentScheduling: '',
        appointmentConfirmation: '',
        appointmentCancellation: '',
        appointmentReminder: '',
        default: ''
      },
      templateVariables: {},
      templateJavaScriptCodes: {},
      receiptNotifications: true,
      appointmentNotifications: true,
      systemAlerts: false,
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00'
      }
    };
    await settings.save();
  } else {
    // Ensure enabled field exists, but only set to false if it's truly undefined
    // Don't overwrite existing false/true values
    if (!settings.notifications.whatsapp.hasOwnProperty('enabled')) {
      settings.notifications.whatsapp.enabled = false;
      await settings.save();
    }
  }
  
  if (settings) {
    // Ensure new templates are added to existing settings
    const defaultTemplates = {
      receiptNotification: {
        subject: 'Receipt {receiptNumber} - {businessName}',
        body: 'Dear {clientName},\n\nThank you for your visit!\n\n{receiptLink}\n\nThank you for choosing {businessName}!',
        enabled: true
      },
      appointmentNotification: {
        subject: 'Appointment Confirmation - {date}',
        body: 'Dear {clientName},\n\nYour appointment has been confirmed!\n\nAppointment Details:\nService: {serviceName}\nDate: {date}\nTime: {time}\nStaff: {staffName}\nBusiness: {businessName}\nPhone: {businessPhone}\n\n{notes}\n\nWe look forward to seeing you!',
        enabled: true
      }
    };

    // Merge missing templates
    if (!settings.notifications) {
      settings.notifications = {};
    }
    if (!settings.notifications.templates) {
      settings.notifications.templates = {};
    }

    // Add missing templates and mark for save
    let needsSave = false;
    Object.keys(defaultTemplates).forEach(templateKey => {
      if (!settings.notifications.templates[templateKey]) {
        settings.notifications.templates[templateKey] = defaultTemplates[templateKey];
        needsSave = true;
      }
    });

    // Update old receiptNotification template format to new simplified format
    const receiptTemplate = settings.notifications.templates.receiptNotification;
    if (receiptTemplate && receiptTemplate.body) {
      const oldFormatIndicators = [
        'Please find the PDF receipt attached',
        'Items:',
        'Subtotal:',
        'Payment Method:'
      ];
      const hasOldFormat = oldFormatIndicators.some(indicator => 
        receiptTemplate.body.includes(indicator)
      );
      
      if (hasOldFormat) {
        logger.debug('🔄 Updating old receiptNotification template to new format');
        settings.notifications.templates.receiptNotification = {
          subject: 'Receipt {receiptNumber} - {businessName}',
          body: 'Dear {clientName},\n\nThank you for your visit!\n\n{receiptLink}\n\nThank you for choosing {businessName}!',
          enabled: receiptTemplate.enabled !== false
        };
        needsSave = true;
      }
    }

    // Save if we added new templates or updated old ones
    if (needsSave) {
      await settings.save();
    }
  }
  return settings;
};

adminSettingsSchema.statics.updateSettings = async function(category, updates) {
  const settings = await this.getSettings();
  
  // Deep merge function for nested objects
  const deepMerge = (target, source) => {
    for (const key in source) {
      // Check if the value exists (including false, 0, empty string, null, undefined)
      // Use hasOwnProperty to check if key exists, and check if value is not undefined
      if (source.hasOwnProperty(key) && source[key] !== undefined) {
        // Check if it's an object that should be merged (not null, not array, not Date, not ObjectId)
        if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) && !(source[key] instanceof Date) && !(source[key] instanceof mongoose.Types.ObjectId)) {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          deepMerge(target[key], source[key]);
        } else {
          // For primitives (including false, 0, empty string), boolean false, etc., directly assign
          target[key] = source[key];
        }
      }
    }
  };
  
  if (category) {
    // Deep merge for nested objects like notifications.whatsapp and notifications.sms
    if (category === 'notifications' && (updates.whatsapp || updates.sms)) {
      if (!settings[category]) {
        settings[category] = {};
      }
      if (updates.whatsapp) {
        if (!settings[category].whatsapp) {
          settings[category].whatsapp = {};
        }
        deepMerge(settings[category].whatsapp, updates.whatsapp);
        settings.markModified(`notifications.whatsapp.templateJavaScriptCodes`);
        settings.markModified(`notifications.whatsapp.templateVariables`);
        settings.markModified('notifications.whatsapp');
      }
      if (updates.sms) {
        if (!settings[category].sms) {
          settings[category].sms = {};
        }
        deepMerge(settings[category].sms, updates.sms);
        settings.markModified('notifications.sms');
      }
      // Merge other notification keys (email, etc.)
      Object.keys(updates).forEach(key => {
        if (key !== 'whatsapp' && key !== 'sms') {
          if (!settings[category][key]) {
            settings[category][key] = {};
          }
          deepMerge(settings[category][key], updates[key]);
        }
      });
    } else {
      // For other categories, use deep merge
      if (!settings[category]) {
        settings[category] = {};
      }
      deepMerge(settings[category], updates);
    }
  } else {
    deepMerge(settings, updates);
  }

  // The `api` category stores several Mixed sub-paths (integrations,
  // authentication, rateLimiting, webhooks, security). Mongoose cannot auto-
  // detect writes inside Mixed fields, so we must mark them modified
  // explicitly — otherwise razorpay/stripe/zoho credentials silently fail to save.
  if (category === 'api') {
    ['authentication', 'rateLimiting', 'integrations', 'webhooks', 'security'].forEach(key => {
      if (updates && Object.prototype.hasOwnProperty.call(updates, key)) {
        settings.markModified(`api.${key}`);
      }
    });
  }

  await settings.save();
  return settings;
};

module.exports = {
  schema: adminSettingsSchema,
  model: mongoose.model('AdminSettings', adminSettingsSchema)
};

