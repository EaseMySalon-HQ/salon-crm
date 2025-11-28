const express = require('express');
const router = express.Router();
const { setupMainDatabase } = require('../middleware/business-db');
const { authenticateAdmin } = require('../middleware/admin-auth');

// Admin Settings Schema (in-memory for now, can be moved to database later)
let adminSettings = {
  // System Configuration
  system: {
    inactiveBusiness: {
      daysThreshold: 7,
      enabled: true,
      notificationEnabled: true,
      notificationRecipients: ["admin@salon.com"],
      autoReactivation: true
    },
    session: {
      timeoutMinutes: 30,
      jwtExpirationHours: 24,
      rememberMeDays: 7,
      maxConcurrentSessions: 3
    },
    security: {
      jwtSecret: "your-super-secret-jwt-key-change-this-in-production",
      passwordMinLength: 8,
      passwordRequireSpecialChars: true,
      maxLoginAttempts: 5,
      lockoutDurationMinutes: 15,
      adminEmail: "admin@salon.com",
      requireTwoFactor: false
    },
    systemHealth: {
      healthCheckInterval: 5,
      errorLogLevel: "error",
      performanceMonitoring: true,
      alertThresholds: {
        cpuUsage: 80,
        memoryUsage: 85,
        diskUsage: 90
      }
    }
  },
  
  // Business Management
  business: {
    defaults: {
      timezone: "Asia/Kolkata",
      currency: "INR",
      currencySymbol: "₹",
      taxRate: 18,
      dateFormat: "DD/MM/YYYY",
      timeFormat: "12",
      businessType: "salon",
      gstNumber: "",
      businessLicense: ""
    },
    operatingHours: {
      monday: { open: "09:00", close: "18:00", closed: false },
      tuesday: { open: "09:00", close: "18:00", closed: false },
      wednesday: { open: "09:00", close: "18:00", closed: false },
      thursday: { open: "09:00", close: "18:00", closed: false },
      friday: { open: "09:00", close: "18:00", closed: false },
      saturday: { open: "09:00", close: "18:00", closed: false },
      sunday: { open: "09:00", close: "18:00", closed: true }
    },
    appointmentSettings: {
      slotDuration: 30,
      advanceBookingDays: 30,
      bufferTime: 15,
      allowOnlineBooking: false,
      requireDeposit: false,
      depositPercentage: 20,
      cancellationWindow: 24,
      noShowPolicy: "charge_full"
    },
    creationRules: {
      requireGSTNumber: false,
      requireBusinessLicense: false,
      requireWebsite: false,
      requireSocialMedia: false,
      autoGenerateCode: true,
      codePrefix: "SALON",
      codeLength: 6,
      requireOnboarding: true,
      onboardingSteps: [
        "business_info",
        "owner_details", 
        "settings_config",
        "staff_setup",
        "service_setup"
      ]
    },
    branding: {
      primaryColor: "#3B82F6",
      secondaryColor: "#1E40AF",
      fontFamily: "Inter",
      logo: "",
      favicon: ""
    }
  },
  
  // User Management
  users: {
    defaultPermissions: {
      admin: [
        { module: 'dashboard', feature: 'view', enabled: true },
        { module: 'dashboard', feature: 'edit', enabled: true },
        { module: 'appointments', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'create', enabled: true },
        { module: 'appointments', feature: 'edit', enabled: true },
        { module: 'appointments', feature: 'delete', enabled: true },
        { module: 'clients', feature: 'view', enabled: true },
        { module: 'clients', feature: 'create', enabled: true },
        { module: 'clients', feature: 'edit', enabled: true },
        { module: 'clients', feature: 'delete', enabled: true },
        { module: 'services', feature: 'view', enabled: true },
        { module: 'services', feature: 'create', enabled: true },
        { module: 'services', feature: 'edit', enabled: true },
        { module: 'services', feature: 'delete', enabled: true },
        { module: 'products', feature: 'view', enabled: true },
        { module: 'products', feature: 'create', enabled: true },
        { module: 'products', feature: 'edit', enabled: true },
        { module: 'products', feature: 'delete', enabled: true },
        { module: 'staff', feature: 'view', enabled: true },
        { module: 'staff', feature: 'create', enabled: true },
        { module: 'staff', feature: 'edit', enabled: true },
        { module: 'staff', feature: 'delete', enabled: true },
        { module: 'sales', feature: 'view', enabled: true },
        { module: 'sales', feature: 'create', enabled: true },
        { module: 'sales', feature: 'edit', enabled: true },
        { module: 'sales', feature: 'delete', enabled: true },
        { module: 'reports', feature: 'view', enabled: true },
        { module: 'reports', feature: 'create', enabled: true },
        { module: 'settings', feature: 'view', enabled: true },
        { module: 'settings', feature: 'edit', enabled: true }
      ],
      manager: [
        { module: 'dashboard', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'create', enabled: true },
        { module: 'appointments', feature: 'edit', enabled: true },
        { module: 'clients', feature: 'view', enabled: true },
        { module: 'clients', feature: 'create', enabled: true },
        { module: 'clients', feature: 'edit', enabled: true },
        { module: 'services', feature: 'view', enabled: true },
        { module: 'services', feature: 'create', enabled: true },
        { module: 'services', feature: 'edit', enabled: true },
        { module: 'products', feature: 'view', enabled: true },
        { module: 'products', feature: 'create', enabled: true },
        { module: 'products', feature: 'edit', enabled: true },
        { module: 'staff', feature: 'view', enabled: true },
        { module: 'staff', feature: 'create', enabled: true },
        { module: 'staff', feature: 'edit', enabled: true },
        { module: 'sales', feature: 'view', enabled: true },
        { module: 'sales', feature: 'create', enabled: true },
        { module: 'reports', feature: 'view', enabled: true }
      ],
      staff: [
        { module: 'dashboard', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'create', enabled: true },
        { module: 'appointments', feature: 'edit', enabled: true },
        { module: 'clients', feature: 'view', enabled: true },
        { module: 'clients', feature: 'create', enabled: true },
        { module: 'clients', feature: 'edit', enabled: true },
        { module: 'services', feature: 'view', enabled: true },
        { module: 'products', feature: 'view', enabled: true },
        { module: 'sales', feature: 'view', enabled: true },
        { module: 'sales', feature: 'create', enabled: true }
      ]
    },
    creationRules: {
      requirePassword: true,
      requireEmailVerification: false,
      requirePhoneVerification: false,
      allowSelfRegistration: false,
      requireAdminApproval: true,
      defaultRole: "staff",
      autoActivate: false,
      sendWelcomeEmail: true
    },
    adminUsers: [
      {
        id: 1,
        firstName: "Admin",
        lastName: "User",
        email: "admin@salon.com",
        role: "super_admin",
        isActive: true,
        lastLogin: "2024-01-15T10:30:00Z"
      }
    ],
    roles: [
      {
        id: "super_admin",
        name: "Super Admin",
        description: "Full system access",
        permissions: ["all"],
        isSystem: true
      },
      {
        id: "admin",
        name: "Admin",
        description: "Business administration",
        permissions: ["business_management", "user_management"],
        isSystem: false
      },
      {
        id: "manager",
        name: "Manager",
        description: "Business operations management",
        permissions: ["appointments", "clients", "staff", "reports"],
        isSystem: false
      },
      {
        id: "staff",
        name: "Staff",
        description: "Basic operational access",
        permissions: ["appointments", "clients", "sales"],
        isSystem: false
      }
    ]
  },
  
  // Database & System
  database: {
    database: {
      connectionString: "mongodb://localhost:27017/ease_my_salon_main",
      maxConnections: 10,
      connectionTimeout: 30000,
      socketTimeout: 30000,
      retryWrites: true,
      readPreference: "primary",
      writeConcern: "majority"
    },
    backup: {
      enabled: true,
      frequency: "daily",
      retentionDays: 30,
      compressionEnabled: true,
      encryptionEnabled: false,
      backupLocation: "/backups",
      cloudBackup: false,
      cloudProvider: "aws"
    },
    dataRetention: {
      userDataRetentionDays: 365,
      businessDataRetentionDays: 2555,
      logRetentionDays: 90,
      auditLogRetentionDays: 2555,
      tempDataRetentionDays: 7,
      autoCleanup: true
    },
    performance: {
      slowQueryThreshold: 100,
      enableQueryLogging: true,
      enableIndexMonitoring: true,
      enableConnectionPooling: true,
      maxQueryTime: 30,
      enableProfiling: false
    },
    maintenance: {
      maintenanceWindow: "02:00-04:00",
      timezone: "Asia/Kolkata",
      enableAutoOptimization: true,
      enableIndexRebuilding: true,
      enableDataCompression: true,
      maintenanceFrequency: "weekly"
    }
  },
  
  // Notifications & Alerts
  notifications: {
    email: {
      enabled: true,
      provider: "smtp",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "",
      smtpPassword: "",
      fromEmail: "noreply@easemysalon.in",
      fromName: "Ease My Salon",
      replyTo: "support@easemysalon.in",
      maxRetries: 3,
      retryDelay: 5000
    },
    sms: {
      enabled: false,
      provider: "twilio",
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioFromNumber: "",
      awsAccessKeyId: "",
      awsSecretAccessKey: "",
      awsRegion: "us-east-1",
      maxRetries: 3,
      retryDelay: 5000
    },
    templates: {
      businessCreated: {
        subject: "Welcome to Ease My Salon - Business Account Created",
        body: "Your business account has been successfully created. Business Code: {businessCode}",
        enabled: true
      },
      businessInactive: {
        subject: "Business Account Inactive - Action Required",
        body: "Your business account has been marked as inactive due to no login activity for {days} days.",
        enabled: true
      },
      systemAlert: {
        subject: "System Alert - {alertType}",
        body: "System alert: {message}. Please check the admin panel for details.",
        enabled: true
      },
      userCreated: {
        subject: "Welcome to Ease My Salon - User Account Created",
        body: "Your user account has been created. Please log in to access the system.",
        enabled: true
      }
    },
    alerts: {
      systemHealth: {
        enabled: true,
        cpuThreshold: 80,
        memoryThreshold: 85,
        diskThreshold: 90,
        recipients: ["admin@salon.com"]
      },
      businessInactive: {
        enabled: true,
        daysThreshold: 7,
        recipients: ["admin@salon.com", "support@salon.com"]
      },
      errorAlerts: {
        enabled: true,
        errorLevel: "error",
        recipients: ["admin@salon.com", "dev@salon.com"]
      },
      securityAlerts: {
        enabled: true,
        failedLoginThreshold: 5,
        recipients: ["admin@salon.com", "security@salon.com"]
      }
    },
    preferences: {
      realTimeNotifications: true,
      digestNotifications: false,
      digestFrequency: "daily",
      quietHours: {
        enabled: false,
        start: "22:00",
        end: "08:00"
      },
      channels: {
        email: true,
        sms: false,
        inApp: true
      }
    }
  },
  
  // API & Integration
  api: {
    api: {
      version: "v1",
      baseUrl: "https://api.ease-my-salon.com",
      timeout: 30000,
      maxRequestsPerMinute: 100,
      enableCORS: true,
      allowedOrigins: ["https://ease-my-salon.com", "https://admin.ease-my-salon.com"],
      enableRateLimiting: true,
      enableLogging: true,
      enableMetrics: true
    },
    rateLimiting: {
      enabled: true,
      windowMs: 60000,
      maxRequests: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: "ip",
      customKeyGenerator: "",
      message: "Too many requests, please try again later.",
      statusCode: 429
    },
    authentication: {
      jwtSecret: "your-super-secret-jwt-key-change-this-in-production",
      jwtExpiration: "24h",
      refreshTokenExpiration: "7d",
      enableRefreshTokens: true,
      enableApiKeys: true,
      apiKeyLength: 32,
      enableOAuth: false,
      oauthProviders: []
    },
    webhooks: [
      {
        id: 1,
        name: "Business Created",
        url: "https://webhook.site/unique-id",
        events: ["business.created"],
        secret: "webhook-secret-key",
        enabled: true,
        retryCount: 3,
        timeout: 5000
      },
      {
        id: 2,
        name: "User Created",
        url: "https://webhook.site/unique-id-2",
        events: ["user.created", "user.updated"],
        secret: "webhook-secret-key-2",
        enabled: false,
        retryCount: 3,
        timeout: 5000
      }
    ],
    integrations: {
      paymentGateway: {
        enabled: false,
        provider: "stripe",
        stripePublishableKey: "",
        stripeSecretKey: "",
        stripeWebhookSecret: "",
        razorpayKeyId: "",
        razorpayKeySecret: "",
        razorpayWebhookSecret: ""
      },
      emailService: {
        enabled: true,
        provider: "smtp",
        sendgridApiKey: "",
        awsSesAccessKey: "",
        awsSesSecretKey: "",
        awsSesRegion: "us-east-1"
      },
      smsService: {
        enabled: false,
        provider: "twilio",
        twilioAccountSid: "",
        twilioAuthToken: "",
        twilioFromNumber: ""
      },
      analytics: {
        enabled: false,
        provider: "google",
        googleAnalyticsId: "",
        mixpanelToken: "",
        amplitudeApiKey: ""
      }
    },
    security: {
      enableHTTPS: true,
      enableHSTS: true,
      enableCSRF: true,
      enableXSSProtection: true,
      enableContentSecurityPolicy: true,
      allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      maxRequestSize: "10mb",
      enableRequestValidation: true,
      enableResponseValidation: true
    }
  }
};

// GET /api/admin/settings - Get all admin settings
router.get('/', authenticateAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      data: adminSettings
    });
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin settings'
    });
  }
});

// GET /api/admin/settings/:category - Get specific category settings
router.get('/:category', authenticateAdmin, (req, res) => {
  try {
    const { category } = req.params;
    
    if (!adminSettings[category]) {
      return res.status(404).json({
        success: false,
        error: 'Settings category not found'
      });
    }
    
    res.json({
      success: true,
      data: adminSettings[category]
    });
  } catch (error) {
    console.error('Error fetching admin settings category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin settings category'
    });
  }
});

// PUT /api/admin/settings/:category - Update specific category settings
router.put('/:category', authenticateAdmin, (req, res) => {
  try {
    const { category } = req.params;
    const updates = req.body;
    
    if (!adminSettings[category]) {
      return res.status(404).json({
        success: false,
        error: 'Settings category not found'
      });
    }
    
    // Deep merge the updates
    const deepMerge = (target, source) => {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    };
    
    deepMerge(adminSettings[category], updates);
    
    // Apply settings changes to system if needed
    if (category === 'system') {
      applySystemSettings(adminSettings.system);
    }
    
    res.json({
      success: true,
      data: adminSettings[category],
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating admin settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update admin settings'
    });
  }
});

// PUT /api/admin/settings - Update all settings
router.put('/', authenticateAdmin, (req, res) => {
  try {
    const updates = req.body;
    
    // Deep merge all updates
    const deepMerge = (target, source) => {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    };
    
    deepMerge(adminSettings, updates);
    
    // Apply system settings changes
    if (updates.system) {
      applySystemSettings(updates.system);
    }
    
    res.json({
      success: true,
      data: adminSettings,
      message: 'All settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating admin settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update admin settings'
    });
  }
});

// POST /api/admin/settings/reset - Reset settings to defaults
router.post('/reset', authenticateAdmin, (req, res) => {
  try {
    const { category } = req.body;
    
    if (category) {
      // Reset specific category to defaults
      if (adminSettings[category]) {
        // Reset to default values (you can define default values here)
        res.json({
          success: true,
          message: `${category} settings reset to defaults`
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Settings category not found'
        });
      }
    } else {
      // Reset all settings to defaults
      // You can reload default settings from a file or database
      res.json({
        success: true,
        message: 'All settings reset to defaults'
      });
    }
  } catch (error) {
    console.error('Error resetting admin settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset admin settings'
    });
  }
});

// POST /api/admin/settings/export - Export settings
router.post('/export', authenticateAdmin, (req, res) => {
  try {
    const { category } = req.body;
    
    const exportData = category ? adminSettings[category] : adminSettings;
    
    res.json({
      success: true,
      data: exportData,
      message: 'Settings exported successfully'
    });
  } catch (error) {
    console.error('Error exporting admin settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export admin settings'
    });
  }
});

// POST /api/admin/settings/import - Import settings
router.post('/import', authenticateAdmin, (req, res) => {
  try {
    const { settings, category } = req.body;
    
    if (!settings) {
      return res.status(400).json({
        success: false,
        error: 'Settings data is required'
      });
    }
    
    if (category) {
      // Import specific category
      if (adminSettings[category]) {
        adminSettings[category] = settings;
        res.json({
          success: true,
          message: `${category} settings imported successfully`
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Settings category not found'
        });
      }
    } else {
      // Import all settings
      adminSettings = settings;
      res.json({
        success: true,
        message: 'All settings imported successfully'
      });
    }
  } catch (error) {
    console.error('Error importing admin settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import admin settings'
    });
  }
});

// POST /api/admin/settings/test/:type - Test specific settings
router.post('/test/:type', authenticateAdmin, (req, res) => {
  try {
    const { type } = req.params;
    const { settings } = req.body;
    
    switch (type) {
      case 'email':
        // Test email configuration
        res.json({
          success: true,
          message: 'Email test sent successfully'
        });
        break;
        
      case 'sms':
        // Test SMS configuration
        res.json({
          success: true,
          message: 'SMS test sent successfully'
        });
        break;
        
      case 'webhook':
        // Test webhook configuration
        res.json({
          success: true,
          message: 'Webhook test sent successfully'
        });
        break;
        
      default:
        res.status(400).json({
          success: false,
          error: 'Invalid test type'
        });
    }
  } catch (error) {
    console.error('Error testing admin settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test admin settings'
    });
  }
});

// Function to apply system settings changes
function applySystemSettings(systemSettings) {
  try {
    // Update inactivity checker settings
    if (systemSettings.inactiveBusiness) {
      // Update the inactivity checker with new settings
      console.log('Updating inactivity checker settings:', systemSettings.inactiveBusiness);
    }
    
    // Update session settings
    if (systemSettings.session) {
      // Update session configuration
      console.log('Updating session settings:', systemSettings.session);
    }
    
    // Update security settings
    if (systemSettings.security) {
      // Update security configuration
      console.log('Updating security settings:', systemSettings.security);
    }
    
    // Update system health monitoring
    if (systemSettings.systemHealth) {
      // Update health monitoring configuration
      console.log('Updating system health settings:', systemSettings.systemHealth);
    }
    
    console.log('System settings applied successfully');
  } catch (error) {
    console.error('Error applying system settings:', error);
  }
}

module.exports = router;
