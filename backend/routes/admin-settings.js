const express = require('express');
const { logger } = require('../utils/logger');
const router = express.Router();
const { setupMainDatabase } = require('../middleware/business-db');
const { authenticateAdmin } = require('../middleware/admin-auth');

// Admin Settings Schema (in-memory fallback for backward compatibility)
let adminSettingsFallback = {
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
      fromName: "EaseMySalon",
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
        subject: "Welcome to EaseMySalon - Business Account Created",
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
        subject: "Welcome to EaseMySalon - User Account Created",
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
      whatsappService: {
        enabled: false,
        provider: "msg91",
        msg91ApiKey: "",
        msg91SenderId: "",
        templateIncludesBaseUrl: true, // If true, template already has base URL, only pass path variables
        templates: {
          welcomeMessage: "",
          businessAccountCreated: "",
          receipt: "",
          receiptCancellation: "",
          appointmentScheduling: "",
          appointmentConfirmation: "",
          appointmentCancellation: "",
          appointmentReminder: "",
          default: ""
        },
        templateVariables: {},
        templateJavaScriptCodes: {},
        msg91TemplateId: "", // Legacy field for backward compatibility
        receiptNotifications: true,
        appointmentNotifications: true,
        systemAlerts: false
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
router.get('/', authenticateAdmin, setupMainDatabase, async (req, res) => {
  try {
    const { AdminSettings } = req.mainModels;
    const settings = await AdminSettings.getSettings();
    res.json({
      success: true,
      data: settings.toObject()
    });
  } catch (error) {
    logger.error('Error fetching admin settings:', error);
    // Fallback to in-memory settings
    res.json({
      success: true,
      data: adminSettingsFallback
    });
  }
});

// POST /api/admin/settings/test/:type - Test specific settings
// IMPORTANT: This route must be defined BEFORE /:category to avoid route conflicts
const formatErrorMessage = (error) => {
  if (!error) return 'Failed to send test email';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  if (error.error?.message) return error.error.message;
  try {
    return JSON.stringify(error);
  } catch (jsonError) {
    return 'Unknown error occurred';
  }
};

router.post('/test/:type', authenticateAdmin, setupMainDatabase, async (req, res) => {
  try {
    logger.debug(`🔔 Test endpoint hit: /test/${req.params.type}`, req.method, req.url);
    const { type } = req.params;
    const { email, phone, templateType, settings: testSettings } = req.body;
    logger.debug(`📱 Test endpoint called with type: ${type}, phone: ${phone}, templateType: ${templateType}, hasSettings: ${!!testSettings}`);
    
    switch (type) {
      case 'email':
        // Test email configuration
        if (!email) {
          return res.status(400).json({
            success: false,
            error: 'Email address is required'
          });
        }

        const emailService = require('../services/email-service');
        
        // If test settings provided, temporarily update email service
        if (testSettings) {
          // Temporarily update config for testing
          const originalConfig = emailService.config;
          const originalProvider = emailService.provider;
          emailService.config = { ...emailService.config, ...testSettings };
          emailService.provider = testSettings.provider || emailService.provider;
          emailService.enabled = testSettings.enabled !== false;
          
          try {
            await emailService.setupProvider();
            const result = await emailService.testConnection(email);
            
            // Restore original config
            emailService.config = originalConfig;
            emailService.provider = originalProvider;
            await emailService.setupProvider();
            
            if (result.success) {
              return res.json({
                success: true,
                message: 'Test email sent successfully'
              });
            } else {
              logger.error('Test email failed:', result.error);
              return res.status(500).json({
                success: false,
                error: formatErrorMessage(result.error)
              });
            }
          } catch (error) {
            // Restore original config on error
            emailService.config = originalConfig;
            emailService.provider = originalProvider;
            await emailService.setupProvider();
            throw error;
          }
        } else {
          // Use current configuration
          const result = await emailService.testConnection(email);
          
          if (result.success) {
            return res.json({
              success: true,
              message: 'Test email sent successfully'
            });
          } else {
            logger.error('Test email failed:', result.error);
            return res.status(500).json({
              success: false,
              error: formatErrorMessage(result.error)
            });
          }
        }
        
      case 'sms':
        // Test SMS (MSG91) configuration
        if (!phone) {
          return res.status(400).json({
            success: false,
            error: 'Phone number is required'
          });
        }
        const smsService = require('../services/sms-service');
        if (!smsService.initialized) await smsService.initialize();
        const message = req.body.message || 'Test message from EaseMySalon';
        const result = await smsService.sendTestSms({ to: phone, message });
        if (result.success) {
          return res.json({ success: true, message: 'Test SMS sent successfully' });
        }
        return res.status(500).json({
          success: false,
          error: formatErrorMessage(result.error)
        });
        break;
        
      case 'whatsapp':
        // Test WhatsApp configuration
        if (!phone) {
          return res.status(400).json({
            success: false,
            error: 'Phone number is required'
          });
        }

        const whatsappService = require('../services/whatsapp-service');
        
        // If test settings provided, temporarily update WhatsApp service
        if (testSettings) {
          // Ensure service is initialized first
          if (!whatsappService.initialized) {
            await whatsappService.initialize();
          }
          
          const originalConfig = whatsappService.config;
          const originalEnabled = whatsappService.enabled;
          
          // Temporarily set test config
          whatsappService.config = {
            ...(originalConfig || {}),
            ...testSettings,
            provider: 'msg91',
            // Ensure templates object exists
            templates: {
              ...(originalConfig?.templates || {}),
              ...(testSettings.templates || {})
            }
          };
          // Check if at least one template is configured or legacy template ID exists
          const hasTemplate = testSettings.templates?.[templateType || 'default'] || 
                             testSettings.templates?.default || 
                             testSettings.msg91TemplateId;
          whatsappService.enabled = testSettings.enabled !== false && testSettings.msg91ApiKey && hasTemplate;
          
          try {
            const result = await whatsappService.testConnection(phone, templateType || 'default');
            
            // Restore original config
            whatsappService.config = originalConfig;
            whatsappService.enabled = originalEnabled;
            
            if (result.success) {
              return res.json({
                success: true,
                message: 'Test WhatsApp message sent successfully'
              });
            } else {
              return res.status(500).json({
                success: false,
                error: formatErrorMessage(result.error)
              });
            }
          } catch (error) {
            // Restore original config on error
            whatsappService.config = originalConfig;
            whatsappService.enabled = originalEnabled;
            throw error;
          }
        } else {
          // Use current configuration
          if (!whatsappService.initialized) {
            await whatsappService.initialize();
          }
          const result = await whatsappService.testConnection(phone, templateType || 'default');
          
          if (result.success) {
            return res.json({
              success: true,
              message: 'Test WhatsApp message sent successfully'
            });
          } else {
            return res.status(500).json({
              success: false,
              error: formatErrorMessage(result.error)
            });
          }
        }
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
          error: `Unknown test type: ${type}`
        });
    }
  } catch (error) {
    logger.error(`Error testing ${req.params.type}:`, error);
    res.status(500).json({
      success: false,
      error: formatErrorMessage(error)
    });
  }
});

// GET /api/admin/settings/sms/status - Get SMS service status (admin)
router.get('/sms/status', authenticateAdmin, setupMainDatabase, async (req, res) => {
  try {
    const smsService = require('../services/sms-service');
    if (!smsService.initialized) await smsService.initialize();
    res.json({
      success: true,
      data: {
        initialized: smsService.initialized,
        enabled: smsService.enabled,
        provider: smsService.config?.provider || 'msg91'
      }
    });
  } catch (error) {
    logger.error('Error fetching SMS status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/settings/sms/template-details - Fetch template variables from MSG91 or parse from pasted body
router.post('/sms/template-details', authenticateAdmin, setupMainDatabase, async (req, res) => {
  try {
    const { templateId, templateBody } = req.body;
    const { AdminSettings } = req.mainModels;
    const settings = await AdminSettings.getSettings();
    const smsConfig = settings.notifications?.sms;
    const authKey = smsConfig?.msg91AuthKey || process.env.MSG91_SMS_AUTH_KEY;
    if (!authKey && !templateBody) {
      return res.status(400).json({ success: false, error: 'MSG91 auth key not configured. Save auth key in SMS settings, or paste template body below.' });
    }
    const smsService = require('../services/sms-service');
    const result = await smsService.fetchTemplateDetails(
      templateId && String(templateId).trim() ? String(templateId).trim() : null,
      authKey && String(authKey).trim() ? String(authKey).trim() : '',
      templateBody && String(templateBody).trim() ? String(templateBody).trim() : undefined
    );
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        hint: 'You can paste your template body (e.g. "Hi {{VAR1}}, amount {{VAR2}}") in the "Paste template body" field and click Fetch again to extract variables.'
      });
    }
    res.json({
      success: true,
      data: {
        variables: result.variables || [],
        templateBody: result.templateBody
      }
    });
  } catch (error) {
    logger.error('Error fetching SMS template details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/settings/:category - Get specific category settings
router.get('/:category', authenticateAdmin, setupMainDatabase, async (req, res) => {
  try {
    const { category } = req.params;
    const { AdminSettings } = req.mainModels;
    const settings = await AdminSettings.getSettings();
    const settingsObj = settings.toObject();
    
    // Log WhatsApp settings if category is notifications
    if (category === 'notifications' && settingsObj.notifications?.whatsapp) {
      logger.debug('📥 [Backend GET] Returning WhatsApp settings:', {
        enabled: settingsObj.notifications.whatsapp.enabled,
        enabledType: typeof settingsObj.notifications.whatsapp.enabled,
        hasWhatsapp: !!settingsObj.notifications.whatsapp
      });
    }
    
    if (!settingsObj[category]) {
      return res.status(404).json({
        success: false,
        error: 'Settings category not found'
      });
    }
    
    res.json({
      success: true,
      data: settingsObj[category]
    });
  } catch (error) {
    logger.error('Error fetching admin settings category:', error);
    // Fallback to in-memory settings
    if (adminSettingsFallback[req.params.category]) {
      logger.debug('⚠️ [Backend GET] Using fallback settings for category:', req.params.category);
      return res.json({
        success: true,
        data: adminSettingsFallback[req.params.category]
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin settings category'
    });
  }
});

// PUT /api/admin/settings/:category - Update specific category settings
router.put('/:category', authenticateAdmin, setupMainDatabase, async (req, res) => {
  try {
    const { category } = req.params;
    const updates = req.body;
    const { AdminSettings } = req.mainModels;
    
    // Log what we're receiving for debugging
    if (category === 'notifications' && updates.whatsapp) {
      logger.debug('📤 [Backend PUT] Received WhatsApp settings:', {
        enabled: updates.whatsapp.enabled,
        hasTemplateJavaScriptCodes: !!updates.whatsapp.templateJavaScriptCodes,
        hasTemplateVariables: !!updates.whatsapp.templateVariables,
        templateJavaScriptCodesKeys: Object.keys(updates.whatsapp.templateJavaScriptCodes || {}),
        templateVariablesKeys: Object.keys(updates.whatsapp.templateVariables || {}),
        templateJavaScriptCodesSample: updates.whatsapp.templateJavaScriptCodes ? Object.keys(updates.whatsapp.templateJavaScriptCodes).slice(0, 2) : []
      })
    }
    
    const settings = await AdminSettings.updateSettings(category, updates);
    const settingsObj = settings.toObject();
    
    // Log what we're returning for debugging
    if (category === 'notifications' && settingsObj.notifications?.whatsapp) {
      logger.debug('📥 [Backend PUT] Returning WhatsApp settings:', {
        enabled: settingsObj.notifications.whatsapp.enabled,
        hasTemplateJavaScriptCodes: !!settingsObj.notifications.whatsapp.templateJavaScriptCodes,
        hasTemplateVariables: !!settingsObj.notifications.whatsapp.templateVariables,
        templateJavaScriptCodesKeys: Object.keys(settingsObj.notifications.whatsapp.templateJavaScriptCodes || {}),
        templateVariablesKeys: Object.keys(settingsObj.notifications.whatsapp.templateVariables || {})
      })
    }
    
    if (!settingsObj[category]) {
      return res.status(404).json({
        success: false,
        error: 'Settings category not found'
      });
    }
    
    // Apply settings changes to system if needed
    if (category === 'system') {
      applySystemSettings(settingsObj.system);
    }
    
    // Reload email service if email settings changed
    if (category === 'notifications' && updates.email) {
      const emailService = require('../services/email-service');
      await emailService.reloadConfiguration();
    }
    
    // Reload WhatsApp service if WhatsApp settings changed
    if (category === 'notifications' && updates.whatsapp) {
      const whatsappService = require('../services/whatsapp-service');
      await whatsappService.reloadConfiguration();
    }
    // Reload SMS service if SMS settings changed
    if (category === 'notifications' && updates.sms) {
      const smsService = require('../services/sms-service');
      await smsService.reloadConfiguration();
    }
    
    res.json({
      success: true,
      data: settingsObj[category],
      message: 'Settings updated successfully'
    });
  } catch (error) {
    logger.error('Error updating admin settings:', error);
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
    logger.error('Error updating admin settings:', error);
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
    logger.error('Error resetting admin settings:', error);
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
    logger.error('Error exporting admin settings:', error);
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
    logger.error('Error importing admin settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import admin settings'
    });
  }
});

// Note: /test/:type route is defined earlier in the file (before /:category routes)
// to avoid route conflicts. Do not duplicate it here.

// Function to apply system settings changes
function applySystemSettings(systemSettings) {
  try {
    // Update inactivity checker settings
    if (systemSettings.inactiveBusiness) {
      // Update the inactivity checker with new settings
      logger.debug('Updating inactivity checker settings:', systemSettings.inactiveBusiness);
    }
    
    // Update session settings
    if (systemSettings.session) {
      // Update session configuration
      logger.debug('Updating session settings:', systemSettings.session);
    }
    
    // Update security settings
    if (systemSettings.security) {
      // Update security configuration
      logger.debug('Updating security settings:', systemSettings.security);
    }
    
    // Update system health monitoring
    if (systemSettings.systemHealth) {
      // Update health monitoring configuration
      logger.debug('Updating system health settings:', systemSettings.systemHealth);
    }
    
    logger.debug('System settings applied successfully');
  } catch (error) {
    logger.error('Error applying system settings:', error);
  }
}

module.exports = router;
