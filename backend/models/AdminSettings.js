const mongoose = require('mongoose');

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
      fromName: { type: String, default: 'Ease My Salon' },
      replyTo: { type: String, default: 'support@easemysalon.in' },
      maxRetries: { type: Number, default: 3 },
      retryDelay: { type: Number, default: 5000 }
    },
    sms: {
      enabled: { type: Boolean, default: false },
      provider: { type: String, enum: ['twilio', 'aws', 'nexmo', 'textlocal'], default: 'twilio' },
      twilioAccountSid: { type: String, default: '' },
      twilioAuthToken: { type: String, default: '' },
      twilioFromNumber: { type: String, default: '' },
      awsAccessKeyId: { type: String, default: '' },
      awsSecretAccessKey: { type: String, default: '' },
      awsRegion: { type: String, default: 'us-east-1' },
      maxRetries: { type: Number, default: 3 },
      retryDelay: { type: Number, default: 5000 }
    },
    templates: {
      businessCreated: {
        subject: { type: String, default: 'Welcome to Ease My Salon - Business Account Created' },
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
        subject: { type: String, default: 'Welcome to Ease My Salon - User Account Created' },
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
  api: {
    version: { type: String, default: 'v1' },
    baseUrl: { type: String, default: 'https://api.ease-my-salon.com' },
    timeout: { type: Number, default: 30000 },
    maxRequestsPerMinute: { type: Number, default: 100 },
    enableCORS: { type: Boolean, default: true },
    allowedOrigins: [{ type: String }],
    enableRateLimiting: { type: Boolean, default: true },
    enableLogging: { type: Boolean, default: true },
    enableMetrics: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

// Create a singleton document
adminSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  } else {
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
        console.log('🔄 Updating old receiptNotification template to new format');
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
  if (category) {
    settings[category] = { ...settings[category], ...updates };
  } else {
    Object.assign(settings, updates);
  }
  await settings.save();
  return settings;
};

module.exports = {
  schema: adminSettingsSchema,
  model: mongoose.model('AdminSettings', adminSettingsSchema)
};

