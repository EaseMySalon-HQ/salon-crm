console.log('🚀 Starting Ease My Salon Backend Server...');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const { ensureAdminAccessDefaults } = require('./utils/admin-access');

// Import database manager and middleware
const databaseManager = require('./config/database-manager');
const modelFactory = require('./models/model-factory');
const { setupBusinessDatabase, setupMainDatabase } = require('./middleware/business-db');

// Import main database models (for admin operations)
const User = require('./models/User').model;
const Admin = require('./models/Admin').model;
const Business = require('./models/Business').model;
const PasswordResetToken = require('./models/PasswordResetToken').model;

// Import business-specific models (for backward compatibility)
const BusinessSettings = require('./models/BusinessSettings').model;
const Service = require('./models/Service').model;
const Product = require('./models/Product').model;
const Staff = require('./models/Staff').model;
const Client = require('./models/Client').model;
const Appointment = require('./models/Appointment').model;
const Receipt = require('./models/Receipt').model;
const Sale = require('./models/Sale').model;
const Expense = require('./models/Expense').model;
const CashRegistry = require('./models/CashRegistry').model;
const InventoryTransaction = require('./models/InventoryTransaction').model;
const BillEditHistory = require('./models/BillEditHistory').model;
const BillArchive = require('./models/BillArchive').model;

// Import Routes
const cashRegistryRoutes = require('./routes/cashRegistry');
const adminRoutes = require('./routes/admin');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Connect to MongoDB and initialize admin access defaults
const dbPromise = connectDB();
dbPromise
  .then(() => ensureAdminAccessDefaults())
  .then(() => console.log('✅ Admin access defaults ensured'))
  .catch((error) => {
    console.error('Failed to initialize admin access defaults:', error);
  });

// Middleware
app.use(helmet());

// Enhanced CORS configuration for Railway deployment
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('🔗 CORS Origins:', allowedOrigins);
console.log('🗄️ MongoDB URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('🔑 JWT Secret:', process.env.JWT_SECRET ? 'Set' : 'Not set');

// Dynamic CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      console.log('✅ Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

app.use((req, res, next) => {
  console.log(`📥 Incoming ${req.method} ${req.path}`);
  next();
});

app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Handle CORS preflight for all routes
app.options('*', cors());

// Helper function to apply WhatsApp settings defaults
// This ensures that even if settings don't exist in DB, we use schema defaults
function getWhatsAppSettingsWithDefaults(whatsappSettings) {
  // Default values from Business model schema
  const defaults = {
    enabled: true,
    receiptNotifications: {
      enabled: true,
      autoSendToClients: true,
      highValueThreshold: 0
    },
    appointmentNotifications: {
      enabled: false,
      newAppointments: false,
      confirmations: false,
      reminders: false,
      cancellations: false
    },
    systemAlerts: {
      enabled: false,
      lowInventory: false,
      paymentFailures: false
    }
  };

  // If no settings exist, return defaults
  if (!whatsappSettings || typeof whatsappSettings !== 'object' || Array.isArray(whatsappSettings)) {
    return defaults;
  }

  // Merge with defaults, preserving existing values (including false)
  const merged = {
    ...defaults,
    ...whatsappSettings,
    // Explicitly handle enabled field - use saved value if it exists, otherwise default
    enabled: whatsappSettings.hasOwnProperty('enabled') ? whatsappSettings.enabled : defaults.enabled,
    // Merge nested objects, explicitly preserving enabled fields
    receiptNotifications: whatsappSettings.receiptNotifications ? {
      ...defaults.receiptNotifications,
      ...whatsappSettings.receiptNotifications,
      // CRITICAL: Explicitly preserve enabled field if it exists (even if false)
      enabled: whatsappSettings.receiptNotifications.hasOwnProperty('enabled')
        ? whatsappSettings.receiptNotifications.enabled
        : defaults.receiptNotifications.enabled,
      // CRITICAL: Explicitly preserve autoSendToClients if it exists (even if false)
      autoSendToClients: whatsappSettings.receiptNotifications.hasOwnProperty('autoSendToClients')
        ? whatsappSettings.receiptNotifications.autoSendToClients
        : defaults.receiptNotifications.autoSendToClients
    } : defaults.receiptNotifications,
    appointmentNotifications: whatsappSettings.appointmentNotifications ? {
      ...defaults.appointmentNotifications,
      ...whatsappSettings.appointmentNotifications,
      // CRITICAL: Explicitly preserve enabled field if it exists (even if false)
      enabled: whatsappSettings.appointmentNotifications.hasOwnProperty('enabled')
        ? whatsappSettings.appointmentNotifications.enabled
        : defaults.appointmentNotifications.enabled
    } : defaults.appointmentNotifications,
    systemAlerts: whatsappSettings.systemAlerts ? {
      ...defaults.systemAlerts,
      ...whatsappSettings.systemAlerts,
      // CRITICAL: Explicitly preserve enabled field if it exists (even if false)
      enabled: whatsappSettings.systemAlerts.hasOwnProperty('enabled')
        ? whatsappSettings.systemAlerts.enabled
        : defaults.systemAlerts.enabled
    } : defaults.systemAlerts
  };
  
  return merged;
}

// Helper function to apply Email settings defaults
// This ensures that even if settings don't exist in DB, we use defaults
function getEmailSettingsWithDefaults(emailSettings) {
  // Default values from email-notifications route
  const defaults = {
    enabled: true,
    recipientStaffIds: [],
    dailySummary: {
      enabled: true,
      time: '21:00'
    },
    weeklySummary: {
      enabled: true,
      day: 'sunday',
      time: '20:00'
    },
    appointmentNotifications: {
      enabled: true,
      newAppointment: true,
      cancellation: true,
      noShow: false,
      reminderTime: 24
    },
    receiptNotifications: {
      enabled: true,
      sendToClients: true,
      sendToStaff: true,
      highValueTransactionThreshold: 10000
    },
    exportNotifications: {
      enabled: true,
      reportExport: true,
      dataExport: true
    },
    systemAlerts: {
      enabled: true,
      lowInventory: true,
      paymentFailures: true,
      systemErrors: true
    }
  };

  // If no settings exist, return defaults
  if (!emailSettings || typeof emailSettings !== 'object' || Array.isArray(emailSettings)) {
    return defaults;
  }

  // Merge with defaults, preserving existing values (including false)
  const merged = {
    ...defaults,
    ...emailSettings,
    // Explicitly handle enabled field - use saved value if it exists, otherwise default
    enabled: emailSettings.hasOwnProperty('enabled') ? emailSettings.enabled : defaults.enabled,
    // Merge nested objects, explicitly preserving enabled fields
    dailySummary: emailSettings.dailySummary ? {
      ...defaults.dailySummary,
      ...emailSettings.dailySummary,
      enabled: emailSettings.dailySummary.hasOwnProperty('enabled')
        ? emailSettings.dailySummary.enabled
        : defaults.dailySummary.enabled
    } : defaults.dailySummary,
    weeklySummary: emailSettings.weeklySummary ? {
      ...defaults.weeklySummary,
      ...emailSettings.weeklySummary,
      enabled: emailSettings.weeklySummary.hasOwnProperty('enabled')
        ? emailSettings.weeklySummary.enabled
        : defaults.weeklySummary.enabled
    } : defaults.weeklySummary,
    receiptNotifications: emailSettings.receiptNotifications ? {
      ...defaults.receiptNotifications,
      ...emailSettings.receiptNotifications,
      // CRITICAL: Explicitly preserve enabled field if it exists (even if false)
      enabled: emailSettings.receiptNotifications.hasOwnProperty('enabled')
        ? emailSettings.receiptNotifications.enabled
        : defaults.receiptNotifications.enabled,
      // CRITICAL: Explicitly preserve sendToClients if it exists (even if false)
      sendToClients: emailSettings.receiptNotifications.hasOwnProperty('sendToClients')
        ? emailSettings.receiptNotifications.sendToClients
        : defaults.receiptNotifications.sendToClients
    } : defaults.receiptNotifications,
    appointmentNotifications: emailSettings.appointmentNotifications ? {
      ...defaults.appointmentNotifications,
      ...emailSettings.appointmentNotifications,
      // CRITICAL: Explicitly preserve enabled field if it exists (even if false)
      enabled: emailSettings.appointmentNotifications.hasOwnProperty('enabled')
        ? emailSettings.appointmentNotifications.enabled
        : defaults.appointmentNotifications.enabled
    } : defaults.appointmentNotifications,
    exportNotifications: emailSettings.exportNotifications ? {
      ...defaults.exportNotifications,
      ...emailSettings.exportNotifications,
      enabled: emailSettings.exportNotifications.hasOwnProperty('enabled')
        ? emailSettings.exportNotifications.enabled
        : defaults.exportNotifications.enabled
    } : defaults.exportNotifications,
    systemAlerts: emailSettings.systemAlerts ? {
      ...defaults.systemAlerts,
      ...emailSettings.systemAlerts,
      // CRITICAL: Explicitly preserve enabled field if it exists (even if false)
      enabled: emailSettings.systemAlerts.hasOwnProperty('enabled')
        ? emailSettings.systemAlerts.enabled
        : defaults.systemAlerts.enabled
    } : defaults.systemAlerts
  };
  
  console.log('📧 [getEmailSettingsWithDefaults] Merged settings:', {
    rawEnabled: emailSettings?.enabled,
    mergedEnabled: merged.enabled,
    rawReceiptEnabled: emailSettings?.receiptNotifications?.enabled,
    mergedReceiptEnabled: merged.receiptNotifications?.enabled,
    rawSendToClients: emailSettings?.receiptNotifications?.sendToClients,
    mergedSendToClients: merged.receiptNotifications?.sendToClients
  });
  
  return merged;
}

// Register Routes
app.use('/api/admin', adminRoutes);
app.use('/api/admin/settings', require('./routes/admin-settings'));
app.use('/api/admin/plans', require('./routes/admin-plans'));
app.use('/api/admin/access', require('./routes/admin-access'));
app.use('/api/admin/logs', require('./routes/admin-logs'));
app.use('/api/email-notifications', require('./routes/email-notifications'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/campaigns', require('./routes/campaigns'));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Initialize default users if they don't exist
const initializeDefaultUsers = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const defaultUsers = [
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'admin@salon.com',
          password: '$2a$10$20S481avXVWGJ3bN.6NJD.t6j/f771tQZkiz6CUQbUo460YXb15Fa',
          role: 'admin',
          hasLoginAccess: true,
          allowAppointmentScheduling: true,
          isActive: true,
          permissions: [
            // Admin gets all permissions
            { module: 'dashboard', feature: 'view', enabled: true },
            { module: 'dashboard', feature: 'edit', enabled: true },
            { module: 'appointments', feature: 'view', enabled: true },
            { module: 'appointments', feature: 'create', enabled: true },
            { module: 'appointments', feature: 'edit', enabled: true },
            { module: 'appointments', feature: 'delete', enabled: true },
            { module: 'customers', feature: 'view', enabled: true },
            { module: 'customers', feature: 'create', enabled: true },
            { module: 'customers', feature: 'edit', enabled: true },
            { module: 'customers', feature: 'delete', enabled: true },
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
            { module: 'settings', feature: 'view', enabled: true },
            { module: 'settings', feature: 'edit', enabled: true },
          ]
        }
      ];

      await User.insertMany(defaultUsers);
      console.log('Default admin user created');
    }
  } catch (error) {
    console.error('Error initializing default users:', error);
  }
};

// Initialize default business settings
const initializeBusinessSettings = async () => {
  try {
    const settingsCount = await BusinessSettings.countDocuments();
    if (settingsCount === 0) {
      const defaultSettings = new BusinessSettings({
        name: "Glamour Salon & Spa",
        email: "info@glamoursalon.com",
        phone: "(555) 123-4567",
        website: "www.glamoursalon.com",
        description: "Premium salon and spa services in the heart of the city",
        address: "123 Beauty Street",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        receiptPrefix: "INV",
        invoicePrefix: "INV",
        receiptNumber: 1,
        autoIncrementReceipt: true,
        socialMedia: "@glamoursalon"
      });
      await defaultSettings.save();
      console.log("Default business settings created");
    }
  } catch (error) {
    console.error("Error initializing business settings:", error);
  }
};
// Import authentication middleware
const { authenticateToken, requireAdmin, requireManager, requireStaff } = require('./middleware/auth');

// Granular permission middleware
const checkPermission = (module, feature) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Admin has all permissions
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user has login access
    if (!req.user.hasLoginAccess) {
      return res.status(403).json({ 
        success: false, 
        error: 'Login access not granted' 
      });
    }

    // Check specific permission
    const hasPermission = req.user.permissions?.some(p => 
      p.module === module && p.feature === feature && p.enabled
    );

    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        error: `Access denied. Required permission: ${module}.${feature}` 
      });
    }

    next();
  };
};

// Helper function to generate JWT token
const generateToken = (user) => {
  const payload = {
    id: user._id || user.id,
    email: user.email,
    role: user.role
  };
  
  // Include branchId for staff users
  if (user.branchId) {
    payload.branchId = user.branchId;
  }
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};

// Helper function to hash password
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Helper function to compare password
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Routes

// Authentication routes
app.post('/api/auth/login', setupMainDatabase, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Use main database User model
    const { User } = req.mainModels;
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // If user is a business owner, check business status
    if (user.branchId) {
      const databaseManager = require('./config/database-manager');
      const mainConnection = await databaseManager.getMainConnection();
      const Business = mainConnection.model('Business', require('./models/Business').schema);
      
      // Find the business owned by this user
      const business = await Business.findOne({ owner: user._id });
      
      if (!business) {
        return res.status(403).json({
          success: false,
          error: 'Business not found for this user'
        });
      }
      
      // Check if business is suspended
      if (business.status === 'suspended') {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been suspended. Please contact your host for assistance.'
        });
      }
      
      // Reactivate inactive businesses (but not suspended ones)
      if (business.status === 'inactive') {
        await Business.updateMany(
          { owner: user._id, status: 'inactive' },
          { status: 'active', updatedAt: new Date() }
        );
      }
    }

    // Update last login timestamp
    await User.findByIdAndUpdate(user._id, { 
      lastLoginAt: new Date(),
      updatedAt: new Date()
    });

    // Generate token
    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user.toObject();

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Staff login endpoint
app.post('/api/auth/staff-login', async (req, res) => {
  try {
    const { email, password, businessCode } = req.body;

    if (!email || !password || !businessCode) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and business code are required'
      });
    }

    // Get business ID from business code
    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);
    const business = await Business.findOne({ code: businessCode });
    
    if (!business) {
      return res.status(400).json({
        success: false,
        error: 'Invalid business code'
      });
    }
    
    // Connect to business-specific database using business code
    const businessDb = await databaseManager.getConnection(business.code || business._id, mainConnection);
    const Staff = businessDb.model('Staff', require('./models/Staff').schema);
    
    // Find staff member
    const staff = await Staff.findOne({ 
      email: email.toLowerCase(),
      hasLoginAccess: true,
      isActive: true
    });
    
    if (!staff) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials or no login access'
      });
    }

    // Check password
    const isValidPassword = await comparePassword(password, staff.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login timestamp
    await Staff.findByIdAndUpdate(staff._id, { 
      lastLoginAt: new Date(),
      updatedAt: new Date()
    });

    // Generate token with staff info
    const token = generateToken({
      _id: staff._id,
      email: staff.email,
      role: staff.role,
      branchId: staff.branchId,
      firstName: staff.name.split(' ')[0],
      lastName: staff.name.split(' ').slice(1).join(' ') || '',
      mobile: staff.phone,
      hasLoginAccess: staff.hasLoginAccess,
      allowAppointmentScheduling: staff.allowAppointmentScheduling,
      isActive: staff.isActive
    });

    const { password: _, ...staffWithoutPassword } = staff.toObject();

    res.json({
      success: true,
      data: {
        user: {
          _id: staff._id,
          firstName: staff.name.split(' ')[0],
          lastName: staff.name.split(' ').slice(1).join(' ') || '',
          email: staff.email,
          mobile: staff.phone,
          role: staff.role,
          branchId: staff.branchId,
          hasLoginAccess: staff.hasLoginAccess,
          allowAppointmentScheduling: staff.allowAppointmentScheduling,
          isActive: staff.isActive,
          specialties: staff.specialties,
          commissionProfileIds: staff.commissionProfileIds,
          notes: staff.notes,
          createdAt: staff.createdAt,
          updatedAt: staff.updatedAt
        },
        token
      }
    });
  } catch (error) {
    console.error('Staff login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Profile endpoint - req.user:', {
      id: req.user.id,
      _id: req.user._id,
      email: req.user.email,
      branchId: req.user.branchId,
      role: req.user.role
    });

    // Check if user is staff (has branchId) or regular user
    if (req.user.branchId) {
      // Staff user - req.user is already populated by authenticateToken middleware
      // Just return the user data that was already validated
      res.json({
        success: true,
        data: {
          _id: req.user._id,
          id: req.user.id,
          firstName: req.user.firstName || '',
          lastName: req.user.lastName || '',
          name: req.user.firstName && req.user.lastName 
            ? `${req.user.firstName} ${req.user.lastName}`.trim()
            : req.user.email || 'User',
          email: req.user.email,
          mobile: req.user.mobile,
          role: req.user.role,
          branchId: req.user.branchId,
          hasLoginAccess: req.user.hasLoginAccess,
          allowAppointmentScheduling: req.user.allowAppointmentScheduling,
          isActive: req.user.isActive,
          specialties: req.user.specialties,
          commissionProfileIds: req.user.commissionProfileIds,
          notes: req.user.notes,
          createdAt: req.user.createdAt,
          updatedAt: req.user.updatedAt
        }
      });
    } else {
      // Regular user - lookup from main database
      const mainConnection = await require('./config/database-manager').getMainConnection();
      const User = mainConnection.model('User', require('./models/User').schema);
      const user = await User.findById(req.user.id || req.user._id);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const { password: _, ...userWithoutPassword } = user.toObject();
      res.json({
        success: true,
        data: userWithoutPassword
      });
    }
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get business plan information
app.get('/api/business/plan', authenticateToken, async (req, res) => {
  try {
    const businessId = req.user?.branchId;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);

    const business = await Business.findById(businessId).select('plan status name code');

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    const { getPlanInfo } = require('./lib/entitlements');
    const planInfo = getPlanInfo(business);

    if (!planInfo) {
      return res.status(500).json({
        success: false,
        error: 'Failed to get plan information'
      });
    }

    res.json({
      success: true,
      data: {
        plan: planInfo
      }
    });
  } catch (error) {
    console.error('Error fetching business plan:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get business information (for plan & billing page)
app.get('/api/business/info', authenticateToken, async (req, res) => {
  try {
    const businessId = req.user?.branchId;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);

    const business = await Business.findById(businessId).select('_id code name address contact createdAt');

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    res.json({
      success: true,
      data: {
        _id: business._id,
        code: business.code,
        name: business.name,
        address: business.address,
        contact: business.contact,
        createdAt: business.createdAt,
      }
    });
  } catch (error) {
    console.error('Error fetching business info:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// New endpoint for authenticated business users to get available plans
app.get('/api/business/plans', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const { PlanTemplate } = req.mainModels;
    const { getAllPlans } = require('./config/plans');
    
    // Get plans from database (active templates) and merge with config file
    const dbPlans = await PlanTemplate.find({ isActive: true }).sort({ createdAt: 1 });
    const configPlans = getAllPlans();

    // Merge database plans with config plans (database takes precedence)
    const planMap = new Map();
    
    // First add config plans
    configPlans.forEach(plan => {
      planMap.set(plan.id, {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        features: plan.features || [],
        limits: plan.limits || {},
      });
    });
    
    // Then override/add database plans
    dbPlans.forEach(dbPlan => {
      planMap.set(dbPlan.id, {
        id: dbPlan.id,
        name: dbPlan.name,
        description: dbPlan.description,
        monthlyPrice: dbPlan.monthlyPrice,
        yearlyPrice: dbPlan.yearlyPrice,
        features: dbPlan.features || [],
        limits: dbPlan.limits || {},
      });
    });

    const plans = Array.from(planMap.values());

    res.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error('Error fetching available plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available plans',
      details: error.message,
    });
  }
});

// Password Reset Routes
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    // Check if user has login access
    if (!user.hasLoginAccess) {
      return res.status(400).json({
        success: false,
        error: 'This account does not have login access. Please contact your administrator.'
      });
    }

    // Generate reset token
    const token = PasswordResetToken.generateToken();
    
    // Create reset token record
    const resetToken = new PasswordResetToken({
      userId: user._id,
      token: token,
      email: user.email,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    });

    await resetToken.save();

    // In a real application, you would send an email here
    // For now, we'll return the token in development
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    
    console.log(`Password reset link for ${user.email}: ${resetUrl}`);

    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
      // Always include resetUrl in development mode
      resetUrl: resetUrl
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required'
      });
    }

    // Find the reset token
    const resetToken = await PasswordResetToken.findOne({ token });
    if (!resetToken || !resetToken.isValid()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Find the user
    const user = await User.findById(resetToken.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate new password
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update user password
    await User.findByIdAndUpdate(
      user._id,
      { password: hashedPassword },
      { new: true, runValidators: true }
    );

    // Mark token as used
    resetToken.used = true;
    await resetToken.save();

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/auth/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const resetToken = await PasswordResetToken.findOne({ token });
    if (!resetToken || !resetToken.isValid()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Get user info (without password)
    const user = await User.findById(resetToken.userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// User Management routes (Admin only)
app.get('/api/users', authenticateToken, setupMainDatabase, requireAdmin, async (req, res) => {
  try {
    const { User } = req.mainModels;
    const { page = 1, limit = 10, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {};
    if (search) {
      query = {
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/users', authenticateToken, setupMainDatabase, requireAdmin, async (req, res) => {
  try {
    const { User } = req.mainModels;
    const {
      firstName,
      lastName,
      email,
      password,
      mobile,
      hasLoginAccess = false,
      allowAppointmentScheduling = false,
      commissionProfileIds = [],
    } = req.body;

    // Validate required fields
    if (!firstName || firstName.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'First name is required'
      });
    }

    if (!mobile || mobile.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Mobile number is required'
      });
    }

    if (!email || email.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already exists'
      });
    }

    // Check if trying to create admin user
    const isAdmin = email && email.toLowerCase() === 'admin@salon.com';
    if (isAdmin) {
      // Check if admin user already exists
      const existingAdmin = await User.findOne({ role: 'admin' });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          error: 'Admin user already exists. Only one admin user is allowed in the system.'
        });
      }
    }

    // Validate password requirement (admin users always have login access)
    if (hasLoginAccess && !password && !isAdmin) {
      return res.status(400).json({
        success: false,
        error: 'Password is required when login access is enabled'
      });
    }

    const userData = {
      firstName: firstName.trim(),
      lastName: lastName || '',
      email: email.toLowerCase(),
      mobile: mobile.trim(),
      role: email && email.toLowerCase() === 'admin@salon.com' ? 'admin' : 'staff', // Admin role for admin@salon.com
      hasLoginAccess: email && email.toLowerCase() === 'admin@salon.com' ? true : hasLoginAccess, // Admin always has login access
      allowAppointmentScheduling: email && email.toLowerCase() === 'admin@salon.com' ? true : allowAppointmentScheduling, // Admin always has appointment access
      isActive: true, // Default to active
      permissions: email && email.toLowerCase() === 'admin@salon.com' ? [
        // Admin gets all permissions
        { module: 'dashboard', feature: 'view', enabled: true },
        { module: 'dashboard', feature: 'edit', enabled: true },
        { module: 'appointments', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'create', enabled: true },
        { module: 'appointments', feature: 'edit', enabled: true },
        { module: 'appointments', feature: 'delete', enabled: true },
        { module: 'customers', feature: 'view', enabled: true },
        { module: 'customers', feature: 'create', enabled: true },
        { module: 'customers', feature: 'edit', enabled: true },
        { module: 'customers', feature: 'delete', enabled: true },
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
        { module: 'settings', feature: 'view', enabled: true },
        { module: 'settings', feature: 'edit', enabled: true },
      ] : [], // Empty permissions for staff
      specialties: [], // Empty specialties
      hourlyRate: 0, // Default hourly rate
      commissionRate: 0, // Default commission rate
      notes: '', // Empty notes
      commissionProfileIds: commissionProfileIds, // Commission profile IDs
    };

    // Only add password if provided
    if (password) {
      const hashedPassword = await hashPassword(password);
      userData.password = hashedPassword;
    }

    const user = new User(userData);
    await user.save();

    const { password: _, ...userWithoutPassword } = user.toObject();

    res.status(201).json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('Create user error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/users/:id', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const { User } = req.mainModels;
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.put('/api/users/:id', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const { User } = req.mainModels;
    const {
      firstName,
      lastName,
      email,
      password,
      mobile,
      hasLoginAccess,
      allowAppointmentScheduling,
      commissionProfileIds,
      avatar,
    } = req.body;

    // Check if user is updating their own profile or is admin
    const isAdmin = req.user.role === 'admin';
    const isOwnProfile = req.user.id === req.params.id || req.user._id === req.params.id;
    
    if (!isAdmin && !isOwnProfile) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own profile'
      });
    }

    // Validate required fields
    if (!firstName || firstName.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'First name is required'
      });
    }

    if (!mobile || mobile.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Mobile number is required'
      });
    }

    // Get the existing user to check current state
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if email already exists (only if email is provided and different from current)
    if (email && email.trim() !== '' && email.toLowerCase() !== existingUser.email) {
      const existingUserWithEmail = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: req.params.id }
      });
      if (existingUserWithEmail) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists'
        });
      }
    }

    // Validate password requirement only if enabling login access for the first time (except for admin users)
    if (hasLoginAccess && !existingUser.hasLoginAccess && !password && existingUser.role !== 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Password is required when enabling login access for the first time'
      });
    }

    // For admin users, always ensure login access is enabled
    if (existingUser.role === 'admin') {
      req.body.hasLoginAccess = true;
    }

    // Check if trying to change role to admin
    if (req.body.role === 'admin' && existingUser.role !== 'admin') {
      // Check if admin user already exists
      const existingAdmin = await User.findOne({ role: 'admin' });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          error: 'Admin user already exists. Only one admin user is allowed in the system.'
        });
      }
    }

    const updateData = {
      firstName: firstName.trim(),
      lastName: lastName || '',
      email: email ? email.toLowerCase() : '',
      mobile: mobile.trim(),
    };

    // Only allow admins to update these fields
    if (isAdmin) {
      updateData.hasLoginAccess = hasLoginAccess;
      updateData.allowAppointmentScheduling = allowAppointmentScheduling;
      updateData.role = req.body.role;
      updateData.commissionProfileIds = commissionProfileIds || [];
    }

    // Add avatar if provided
    if (avatar) {
      updateData.avatar = avatar;
    }

    // Hash password if provided
    if (password) {
      updateData.password = await hashPassword(password);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.delete('/api/users/:id', authenticateToken, setupMainDatabase, requireAdmin, async (req, res) => {
  try {
    const { User } = req.mainModels;
    // First check if the user exists and is admin
    const userToDelete = await User.findById(req.params.id);
    
    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent deletion of admin users
    if (userToDelete.role === 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete admin user. Admin account is protected.'
      });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get user permissions
app.get('/api/users/:id/permissions', authenticateToken, setupMainDatabase, requireAdmin, async (req, res) => {
  try {
    const { User } = req.mainModels;
    const user = await User.findById(req.params.id).select('permissions');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user.permissions
    });
  } catch (error) {
    console.error('Get user permissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update user permissions
app.put('/api/users/:id/permissions', authenticateToken, setupMainDatabase, requireAdmin, async (req, res) => {
  try {
    const { permissions } = req.body;
    const { User } = req.mainModels;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { permissions },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Update user permissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Change user password (no current password required; admin or self can reset)
app.post('/api/users/:id/change-password', authenticateToken, setupMainDatabase, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const { User } = req.mainModels;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password is required'
      });
    }

    // Find the user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await User.findByIdAndUpdate(
      req.params.id,
      { password: hashedNewPassword },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Verify admin password for editing admin details
app.post('/api/users/:id/verify-admin-password', authenticateToken, setupMainDatabase, requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    const { User } = req.mainModels;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required'
      });
    }

    // Find the user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Only allow verification for admin users
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only for admin users'
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Incorrect password'
      });
    }

    res.json({
      success: true,
      message: 'Password verified successfully'
    });
  } catch (error) {
    console.error('Admin password verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Clients routes
app.get('/api/clients', authenticateToken, requireStaff, setupBusinessDatabase, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // Use business-specific Client model
    const { Client } = req.businessModels;

    // Build query for business-specific database
    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      };
    }

    console.log('🔍 Clients API Debug:', {
      businessId: req.user.branchId,
      userEmail: req.user.email,
      query: query,
      database: req.businessConnection.name
    });

    const totalClients = await Client.countDocuments(query);
    console.log('📊 Total clients found:', totalClients);
    const clients = await Client.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });
    console.log('📋 Clients returned:', clients.length);

    res.json({
      success: true,
      data: clients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalClients,
        totalPages: Math.ceil(totalClients / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/clients/search', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Client } = req.businessModels;
    const { q } = req.query;
    
    if (!q) {
      const clients = await Client.find({}).sort({ createdAt: -1 });
      return res.json({
        success: true,
        data: clients
      });
    }

    const searchResults = await Client.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: searchResults
    });
  } catch (error) {
    console.error('Error searching clients:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/clients/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Client } = req.businessModels;
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    res.json({
      success: true,
      data: client
    });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/clients', authenticateToken, requireManager, setupBusinessDatabase, async (req, res) => {
  try {
    const { name, email, phone, address, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name and phone are required'
      });
    }

    // Use business-specific Client model
    const { Client } = req.businessModels;

    // Check for duplicate phone number within the business database
    const existingClient = await Client.findOne({ phone });
    if (existingClient) {
      return res.status(400).json({
        success: false,
        error: 'Phone number already exists. Please use a different number.'
      });
    }

    const newClient = new Client({
      name,
      email,
      phone,
      address,
      notes,
      status: 'active',
      totalVisits: 0,
      totalSpent: 0,
      branchId: req.user.branchId
    });

    const savedClient = await newClient.save();

    res.status(201).json({
      success: true,
      data: savedClient
    });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.put('/api/clients/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { Client } = req.businessModels;
    const { phone } = req.body;
    
    // If phone number is being updated, check for duplicates
    if (phone) {
      const existingClient = await Client.findOne({ 
        phone, 
        _id: { $ne: req.params.id } // Exclude current client
      });
      if (existingClient) {
        return res.status(400).json({
          success: false,
          error: 'Phone number already exists. Please use a different number.'
        });
      }
    }

    const updatedClient = await Client.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedClient) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    res.json({
      success: true,
      data: updatedClient
    });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.delete('/api/clients/:id', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { Client } = req.businessModels;
    const deletedClient = await Client.findByIdAndDelete(req.params.id);
    
    if (!deletedClient) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get client statistics (O(1) database queries)
app.get('/api/clients/stats', authenticateToken, requireStaff, setupBusinessDatabase, async (req, res) => {
  try {
    console.log('📊 /api/clients/stats endpoint called');
    console.log('📊 User:', req.user?.email, 'BranchId:', req.user?.branchId);
    
    if (!req.businessModels) {
      console.error('❌ req.businessModels not found');
      return res.status(500).json({
        success: false,
        error: 'Business models not initialized'
      });
    }
    
    const { Client } = req.businessModels;
    
    if (!Client) {
      console.error('❌ Client model not found in req.businessModels');
      console.error('Available models:', Object.keys(req.businessModels || {}));
      return res.status(500).json({
        success: false,
        error: 'Client model not available'
      });
    }
    
    console.log('✅ Client model found');
    
    // Calculate date 3 months ago from current date
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    
    console.log(`📅 Date threshold (3 months ago): ${threeMonthsAgo.toISOString()}`);
    
    // Total Customers: Count all clients (simple O(1) query)
    console.log('📊 Counting total customers...');
    let totalCustomers = 0;
    try {
      totalCustomers = await Client.countDocuments({}) || 0;
      console.log(`✅ Total customers: ${totalCustomers}`);
    } catch (countError) {
      console.error('❌ Error counting customers:', countError);
      throw countError;
    }
    
    // Fetch all clients with just lastVisit field for accurate calculation
    console.log('📊 Fetching all clients with lastVisit field...');
    let allClients = [];
    try {
      // Use lean() for performance but handle dates carefully
      allClients = await Client.find({}).select('lastVisit').lean();
      console.log(`✅ Fetched ${allClients.length} clients`);
      
      // Convert dates from MongoDB format to JavaScript Date objects
      // When using lean(), dates come as strings or ISODate objects
      allClients = allClients.map(client => {
        if (client.lastVisit) {
          // Handle MongoDB ISODate or string dates
          if (client.lastVisit instanceof Date) {
            return client;
          } else if (typeof client.lastVisit === 'string') {
            const date = new Date(client.lastVisit);
            if (!isNaN(date.getTime())) {
              return { ...client, lastVisit: date };
            }
          } else if (client.lastVisit.$date) {
            // Handle MongoDB extended JSON format
            return { ...client, lastVisit: new Date(client.lastVisit.$date) };
          }
        }
        return client;
      });
    } catch (fetchError) {
      console.error('❌ Error fetching clients:', fetchError);
      console.error('❌ Fetch error details:', {
        message: fetchError.message,
        stack: fetchError.stack,
        name: fetchError.name
      });
      throw fetchError;
    }
    
    if (allClients.length === 0) {
      console.log('📊 No clients found, returning zero stats');
      return res.json({
        success: true,
        data: {
          totalCustomers: 0,
          activeCustomers: 0,
          inactiveCustomers: 0
        }
      });
    }
    
    // Sample first 3 clients for debugging
    try {
      console.log('📊 Sample clients:', JSON.stringify(allClients.slice(0, 3).map(c => ({
        hasLastVisit: !!c.lastVisit,
        lastVisitType: c.lastVisit ? typeof c.lastVisit : 'null',
        lastVisitValue: c.lastVisit ? c.lastVisit.toString() : null,
        isDate: c.lastVisit instanceof Date
      })), null, 2));
    } catch (logError) {
      console.warn('⚠️ Error logging sample clients:', logError);
    }
    
    // Count active: lastVisit exists, is a Date, AND >= threeMonthsAgo
    let activeCount = 0;
    let inactiveCount = 0;
    let nullCount = 0;
    let oldVisitCount = 0;
    let invalidDateCount = 0;
    
    for (const client of allClients) {
      try {
        if (!client.lastVisit || client.lastVisit === null || client.lastVisit === undefined) {
          // No lastVisit = inactive
          inactiveCount++;
          nullCount++;
        } else {
          // Convert to Date if it's not already
          let lastVisitDate = client.lastVisit;
          if (!(lastVisitDate instanceof Date)) {
            // Try to convert string or other format to Date
            lastVisitDate = new Date(lastVisitDate);
            // Check if conversion was successful
            if (isNaN(lastVisitDate.getTime())) {
              // Invalid date = inactive
              inactiveCount++;
              invalidDateCount++;
              continue;
            }
          }
          
          // Has a valid Date - compare
          if (lastVisitDate >= threeMonthsAgo) {
            activeCount++;
          } else {
            inactiveCount++;
            oldVisitCount++;
          }
        }
      } catch (clientError) {
        console.warn('⚠️ Error processing client:', clientError);
        inactiveCount++; // Default to inactive on error
      }
    }
    
    console.log(`📊 Breakdown - Active: ${activeCount}, Inactive: ${inactiveCount}`);
    console.log(`📊 Details - null: ${nullCount}, invalid dates: ${invalidDateCount}, old visits: ${oldVisitCount}`);
    console.log(`📊 Verification - Calculated total: ${activeCount + inactiveCount}, DB total: ${totalCustomers}`);
    
    let activeCustomers = activeCount;
    let inactiveCustomers = inactiveCount;
    
    // Ensure they add up correctly (safety check)
    if (activeCustomers + inactiveCustomers !== totalCustomers) {
      console.warn(`⚠️ Count mismatch! Adjusting inactive: ${activeCustomers + inactiveCustomers} vs ${totalCustomers}`);
      inactiveCustomers = Math.max(0, totalCustomers - activeCustomers);
    }
    
    const result = {
      totalCustomers: Number(totalCustomers) || 0,
      activeCustomers: Number(activeCustomers) || 0,
      inactiveCustomers: Number(inactiveCustomers) || 0
    };
    
    console.log(`✅ Final stats:`, result);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error fetching client stats:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    });
  }
});

// Import clients from Excel/CSV
app.post('/api/clients/import', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    console.log('🔍 Client import request received');
    const { Client } = req.businessModels;
    const { clients, mapping, updateExisting } = req.body;

    if (!clients || !Array.isArray(clients) || clients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No clients data provided'
      });
    }

    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Column mapping is required'
      });
    }

    console.log(`📊 Processing ${clients.length} clients for import`);
    console.log(`⚙️  Update existing clients: ${updateExisting ? 'YES' : 'NO'}`);
    
    // Count existing clients in database for reference
    const existingCount = await Client.countDocuments({});
    console.log(`📋 Current clients in database: ${existingCount}`);
    
    // Build a phone number lookup map for efficient duplicate detection
    // This avoids querying the database for every row
    const phoneLookupMap = new Map(); // last10 -> client _id
    if (existingCount > 0) {
      console.log(`🔍 Building phone number lookup map...`);
      const allClients = await Client.find({ 
        phone: { $exists: true, $ne: null, $ne: '' } 
      }).select('phone _id').lean();
      
      for (const client of allClients) {
        const clientPhone = String(client.phone || '').replace(/\D/g, ''); // Remove all non-digits
        const clientLast10 = clientPhone.slice(-10);
        if (clientLast10.length === 10) {
          // Store both the normalized phone and last10 for lookup
          phoneLookupMap.set(clientPhone, client._id);
          phoneLookupMap.set(clientLast10, client._id);
          // Also store with original phone format for exact match
          phoneLookupMap.set(String(client.phone), client._id);
        }
      }
      console.log(`✅ Built lookup map with ${phoneLookupMap.size} phone number entries`);
    }

    // Robust Excel date parser: supports numbers (Excel serial), and common string formats
    const parseExcelDate = (input) => {
      if (!input && input !== 0) return undefined
      // If number: treat as Excel serial date (days since 1899-12-30)
      if (typeof input === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30))
        const ms = input * 24 * 60 * 60 * 1000
        const d = new Date(excelEpoch.getTime() + ms)
        return isNaN(d.getTime()) ? undefined : d
      }
      // Trim string
      const str = String(input).trim()
      if (!str) return undefined
      // Handle dd/mm/yyyy or dd-mm-yyyy
      const dmY = str.match(/^([0-3]?\d)[\/-]([0-1]?\d)[\/-](\d{2,4})$/)
      if (dmY) {
        let [ , dd, mm, yyyy ] = dmY
        if (yyyy.length === 2) yyyy = String(2000 + parseInt(yyyy, 10))
        const iso = `${yyyy.padStart(4,'0')}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
        const d = new Date(iso)
        return isNaN(d.getTime()) ? undefined : d
      }
      // Handle yyyy-mm-dd or yyyy/mm/dd
      const yMd = str.match(/^(\d{4})[\/-]([0-1]?\d)[\/-]([0-3]?\d)$/)
      if (yMd) {
        const iso = `${yMd[1]}-${String(yMd[2]).padStart(2,'0')}-${String(yMd[3]).padStart(2,'0')}`
        const d = new Date(iso)
        return isNaN(d.getTime()) ? undefined : d
      }
      // Fallback to Date.parse
      const parsed = new Date(str)
      return isNaN(parsed.getTime()) ? undefined : parsed
    }

    const results = {
      success: [],
      errors: [],
      skipped: [],
      created: 0,  // Track actual new clients created
      updated: 0   // Track existing clients updated
    };

    // Track phone numbers seen in this import batch to detect duplicates within the file
    const seenPhonesInBatch = new Map(); // phone -> first row number where it appeared

    // Process each client
    for (let i = 0; i < clients.length; i++) {
      const clientData = clients[i];
      const rowNumber = (clientData._rowIndex || i + 1) + 1; // Excel row number (accounting for header)

      try {
        // Map the data according to the mapping
        const mappedData = {};
        Object.keys(mapping).forEach(excelColumn => {
          const clientField = mapping[excelColumn];
          if (clientField && clientField !== 'none') {
            mappedData[clientField] = clientData[excelColumn];
          }
        });

        // Validate required fields (if updating existing, only phone is mandatory)
        if ((!mappedData.name && !updateExisting) || !mappedData.phone) {
          results.errors.push({
            row: rowNumber,
            error: 'Name and phone are required',
            data: mappedData
          });
          continue;
        }

        // Normalize name and phone for duplicate check
        const normalizedName = String(mappedData.name).trim();
        const normalizedPhone = String(mappedData.phone).trim().replace(/\D/g, ''); // Remove non-digits

        if (!normalizedPhone || normalizedPhone.length < 10) {
          results.errors.push({
            row: rowNumber,
            error: 'Phone number must be at least 10 digits',
            data: mappedData
          });
          continue;
        }

        // Check for duplicate phone number within this import batch
        const last10 = normalizedPhone.slice(-10);
        if (seenPhonesInBatch.has(last10)) {
          const firstRow = seenPhonesInBatch.get(last10);
          results.skipped.push({
            row: rowNumber,
            reason: `Duplicate phone number in import file (first seen at row ${firstRow})`,
            data: mappedData
          });
          continue;
        }
        seenPhonesInBatch.set(last10, rowNumber);

        // Check if client already exists using the pre-built lookup map
        // This is much more efficient than querying the database for each row
        let existingClientId = null;
        
        // Try multiple lookup strategies using the map
        if (phoneLookupMap.has(normalizedPhone)) {
          existingClientId = phoneLookupMap.get(normalizedPhone);
        } else if (last10 && phoneLookupMap.has(last10)) {
          existingClientId = phoneLookupMap.get(last10);
        }
        
        // If found in map, fetch the full client document
        let existingClient = null;
        if (existingClientId) {
          existingClient = await Client.findById(existingClientId);
        }
        
        // Fallback: If not found in map, try database queries (for edge cases)
        // This handles cases where phone format changed or wasn't in the initial fetch
        if (!existingClient && last10) {
          // Try regex match as fallback
          existingClient = await Client.findOne({ phone: { $regex: new RegExp(`${last10}$`) } })
        }
        
        // Log for debugging (only log first few to avoid spam)
        if (existingClient && (results.success.length + results.skipped.length) < 5) {
          console.log(`📞 Found existing client for phone ${normalizedPhone} (last10: ${last10}): ${existingClient.name} (ID: ${existingClient._id})`)
        }

        if (existingClient) {
          if (updateExisting) {
            // Prepare fields to update: only those provided and mapped
            const updateDoc = {};
            if (mappedData.lastVisit) {
            const lv = parseExcelDate(mappedData.lastVisit);
              if (lv) updateDoc.lastVisit = lv;
            }
            if (mappedData.totalSpent !== undefined && mappedData.totalSpent !== null && mappedData.totalSpent !== '') {
              const ts = parseFloat(mappedData.totalSpent);
              if (!isNaN(ts)) updateDoc.totalSpent = ts;
            }
            if (mappedData.visits !== undefined && mappedData.visits !== null && mappedData.visits !== '') {
              const vs = parseInt(mappedData.visits);
              if (!isNaN(vs)) updateDoc.totalVisits = vs;
            }
            if (mappedData.dob) {
            const d = parseExcelDate(mappedData.dob);
              if (d) updateDoc.dob = d;
            }
            if (mappedData.gender) {
              const g = String(mappedData.gender).toLowerCase().trim();
              if (['male','female','other'].includes(g)) updateDoc.gender = g;
            }
            if (mappedData.email) updateDoc.email = String(mappedData.email).trim().toLowerCase();

            if (Object.keys(updateDoc).length === 0) {
              results.skipped.push({ row: rowNumber, reason: 'No updatable fields provided', data: mappedData });
              continue;
            }

            const updated = await Client.findByIdAndUpdate(existingClient._id, updateDoc, { new: true });
            results.success.push({ row: rowNumber, data: { id: updated._id, name: updated.name, phone: updated.phone }, updated: true });
            results.updated++;
            continue;
          } else {
            results.skipped.push({
              row: rowNumber,
              reason: 'Client with this phone number already exists',
              data: mappedData
            });
            continue;
          }
        }

        // Prepare client data
        const clientToCreate = {
          name: normalizedName,
          phone: normalizedPhone,
          email: mappedData.email ? String(mappedData.email).trim().toLowerCase() : undefined,
          gender: mappedData.gender ? String(mappedData.gender).toLowerCase().trim() : undefined,
          totalVisits: mappedData.visits ? parseInt(mappedData.visits) || 0 : 0,
          totalSpent: mappedData.totalSpent ? parseFloat(mappedData.totalSpent) || 0 : 0,
          status: 'active',
          branchId: req.user.branchId
        };

        // Parse date of birth
        if (mappedData.dob) {
          const dobDate = parseExcelDate(mappedData.dob);
          if (dobDate) clientToCreate.dob = dobDate;
        }

        // Parse last visit date
        if (mappedData.lastVisit) {
          const lastVisitDate = parseExcelDate(mappedData.lastVisit);
          if (lastVisitDate) clientToCreate.lastVisit = lastVisitDate;
        }

        // Validate gender if provided
        if (clientToCreate.gender && !['male', 'female', 'other'].includes(clientToCreate.gender)) {
          clientToCreate.gender = undefined; // Invalid gender, skip it
        }

        // Create new client
        const newClient = new Client(clientToCreate);
        const savedClient = await newClient.save();

        results.success.push({
          row: rowNumber,
          data: {
            id: savedClient._id,
            name: savedClient.name,
            phone: savedClient.phone
          },
          updated: false
        });
        results.created++;

      } catch (error) {
        console.error(`Error processing client row ${rowNumber}:`, error);
        results.errors.push({
          row: rowNumber,
          error: error.message || 'Failed to create client',
          data: clientData
        });
      }
    }

    console.log(`📊 Import completed:`);
    console.log(`   ✅ Success: ${results.success.length} (${results.created} created, ${results.updated} updated)`);
    console.log(`   ❌ Errors: ${results.errors.length}`);
    console.log(`   ⏭️  Skipped: ${results.skipped.length}`);
    console.log(`   📋 Final database count: ${await Client.countDocuments({})}`);

    res.json({
      success: true,
      data: {
        totalProcessed: clients.length,
        successful: results.success.length,
        created: results.created,
        updated: results.updated,
        errors: results.errors.length,
        skipped: results.skipped.length,
        results: {
          success: results.success,
          errors: results.errors,
          skipped: results.skipped
        }
      }
    });

  } catch (error) {
    console.error('Error importing clients:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during import'
    });
  }
});

// ============================================
// LEAD MANAGEMENT ROUTES
// ============================================

// Get all leads with filters
app.get('/api/leads', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'view'), async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status, 
      assignedStaffId, 
      source,
      startDate,
      endDate
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = { branchId: req.user.branchId };

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // Assigned staff filter
    if (assignedStaffId) {
      query.assignedStaffId = assignedStaffId;
    }

    // Source filter
    if (source) {
      query.source = source;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const leads = await Lead.find(query)
      .populate('assignedStaffId', 'name')
      .populate('interestedServices.serviceId', 'name price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Lead.countDocuments(query);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get single lead by ID
app.get('/api/leads/:id', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'view'), async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    })
      .populate('assignedStaffId', 'name')
      .populate('interestedServices.serviceId', 'name price duration')
      .populate('convertedToAppointmentId', 'date time status')
      .populate('convertedToClientId', 'name phone');

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    res.json({
      success: true,
      data: lead
    });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get lead activities
app.get('/api/leads/:id/activities', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'view'), async (req, res) => {
  try {
    const { Lead, LeadActivity } = req.businessModels;
    
    // Verify lead exists and belongs to user's branch
    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    // Fetch all activities for this lead, sorted by creation date (newest first)
    // Convert string ID to ObjectId to ensure proper matching
    const leadObjectId = new mongoose.Types.ObjectId(req.params.id);
    
    // Note: We don't populate 'performedBy' because User model is in main DB, not business DB
    // We already have 'performedByName' stored in the activity document
    const activities = await LeadActivity.find({ 
      leadId: leadObjectId,
      branchId: req.user.branchId
    })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Error fetching lead activities:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Create new lead
app.post('/api/leads', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'create'), async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const { 
      name, 
      phone, 
      email, 
      source = 'walk-in', 
      status = 'new',
      interestedServices,
      assignedStaffId,
      followUpDate,
      notes
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name and phone are required'
      });
    }

    // Format interested services (allow custom services without serviceId)
    const formattedServices = interestedServices?.map(service => ({
      serviceId: service.serviceId && service.serviceId !== 'null' && service.serviceId !== 'none' 
        ? service.serviceId 
        : null,
      serviceName: service.serviceName || service.name
    })) || [];

    const newLead = new Lead({
      name,
      phone,
      email,
      source,
      status,
      interestedServices: formattedServices,
      assignedStaffId,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
      notes,
      branchId: req.user.branchId
    });

    const savedLead = await newLead.save();
    const populatedLead = await Lead.findById(savedLead._id)
      .populate('assignedStaffId', 'name')
      .populate('interestedServices.serviceId', 'name price');

    // Log creation activity and any initial values
    try {
      const { LeadActivity } = req.businessModels;
      const activities = [];

      // Log creation
      activities.push({
        leadId: savedLead._id,
        activityType: 'created',
        performedBy: req.user.userId,
        performedByName: req.user.name || req.user.email || 'System',
        newValue: {
          name: savedLead.name,
          phone: savedLead.phone,
          source: savedLead.source,
          status: savedLead.status,
          notes: savedLead.notes || null // Include notes in created activity
        },
        description: `Lead created from ${source}`,
        branchId: req.user.branchId
      });

      // Log follow-up date if set during creation
      if (savedLead.followUpDate) {
        activities.push({
          leadId: savedLead._id,
          activityType: 'follow_up_scheduled',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          newValue: savedLead.followUpDate,
          field: 'followUpDate',
          description: `Follow-up scheduled for ${new Date(savedLead.followUpDate).toLocaleDateString()}`,
          branchId: req.user.branchId
        });
      }

      // Log status if not 'new'
      if (savedLead.status && savedLead.status !== 'new') {
        activities.push({
          leadId: savedLead._id,
          activityType: 'status_changed',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: 'new',
          newValue: savedLead.status,
          field: 'status',
          description: `Status set to ${savedLead.status}`,
          branchId: req.user.branchId
        });
      }

      // Log staff assignment if set during creation
      if (savedLead.assignedStaffId) {
        activities.push({
          leadId: savedLead._id,
          activityType: 'staff_assigned',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          newValue: savedLead.assignedStaffId,
          field: 'assignedStaffId',
          description: 'Staff assigned',
          branchId: req.user.branchId
        });
      }

      // Log notes if set during creation
      if (savedLead.notes && savedLead.notes.trim()) {
        activities.push({
          leadId: savedLead._id,
          activityType: 'notes_updated',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          newValue: savedLead.notes,
          field: 'notes',
          description: 'Notes added',
          branchId: req.user.branchId
        });
      }

      // Insert all activities
      if (activities.length > 0) {
        await LeadActivity.insertMany(activities);
      }
    } catch (activityError) {
      console.error('Error logging lead creation activities:', activityError);
      // Don't fail the request if activity logging fails
    }

    res.status(201).json({
      success: true,
      data: populatedLead
    });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update lead
app.put('/api/leads/:id', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'edit'), async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const { 
      name, 
      phone, 
      email, 
      source, 
      status,
      interestedServices,
      assignedStaffId,
      followUpDate,
      notes
    } = req.body;

    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    const { LeadActivity } = req.businessModels;
    const activities = [];

    // Track changes and log activities
    // Always create a status activity if status is provided (for "Add Status" functionality)
    // This ensures we preserve history even if status value doesn't change
    if (status !== undefined) {
      if (lead.status !== status) {
        // Status actually changed
        activities.push({
          leadId: lead._id,
          activityType: 'status_changed',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: lead.status,
          newValue: status,
          field: 'status',
          description: `Status changed from ${lead.status} to ${status}`,
          branchId: req.user.branchId
        });
        lead.status = status;
      } else {
        // Status is the same, but we still want to record this as a status update activity
        // This happens when user clicks "Add Status" with the same status value
        activities.push({
          leadId: lead._id,
          activityType: 'status_changed',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: lead.status,
          newValue: status,
          field: 'status',
          description: `Status confirmed: ${status}`,
          branchId: req.user.branchId
        });
        // Don't update lead.status since it's the same, but we still log the activity
      }
    }

    if (assignedStaffId !== undefined && String(lead.assignedStaffId) !== String(assignedStaffId)) {
      const activityType = lead.assignedStaffId ? 'staff_changed' : 'staff_assigned';
      activities.push({
        leadId: lead._id,
        activityType: activityType,
        performedBy: req.user.userId,
        performedByName: req.user.name || req.user.email || 'System',
        previousValue: lead.assignedStaffId,
        newValue: assignedStaffId,
        field: 'assignedStaffId',
        description: assignedStaffId 
          ? `Staff ${activityType === 'staff_changed' ? 'changed' : 'assigned'}`
          : 'Staff assignment removed',
        branchId: req.user.branchId
      });
      lead.assignedStaffId = assignedStaffId;
    }

    if (followUpDate !== undefined) {
      const oldDate = lead.followUpDate ? lead.followUpDate.toISOString() : null;
      const newDate = followUpDate ? new Date(followUpDate).toISOString() : null;
      if (oldDate !== newDate) {
        const activityType = lead.followUpDate ? 'follow_up_updated' : 'follow_up_scheduled';
        activities.push({
          leadId: lead._id,
          activityType: activityType,
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: lead.followUpDate,
          newValue: followUpDate ? new Date(followUpDate) : null,
          field: 'followUpDate',
          description: followUpDate 
            ? `Follow-up ${activityType === 'follow_up_updated' ? 'updated' : 'scheduled'} for ${new Date(followUpDate).toLocaleDateString()}`
            : 'Follow-up date removed',
          branchId: req.user.branchId
        });
        lead.followUpDate = followUpDate ? new Date(followUpDate) : null;
      }
    }

    // Always create a notes activity if notes are provided (for "Add Status" functionality)
    // This ensures we preserve history even if notes value doesn't change
    if (notes !== undefined) {
      if (lead.notes !== notes) {
        // Notes actually changed
        activities.push({
          leadId: lead._id,
          activityType: 'notes_updated',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: lead.notes,
          newValue: notes,
          field: 'notes',
          description: notes ? 'Notes updated' : 'Notes cleared',
          details: { notesLength: notes?.length || 0 },
          branchId: req.user.branchId
        });
        lead.notes = notes;
      } else if (notes && notes.trim()) {
        // Notes are the same but not empty - still record as an activity
        // This happens when user clicks "Add Status" with the same notes
        activities.push({
          leadId: lead._id,
          activityType: 'notes_updated',
          performedBy: req.user.id || req.user.userId || req.user._id,
          performedByName: req.user.name || req.user.email || 'System',
          previousValue: lead.notes,
          newValue: notes,
          field: 'notes',
          description: 'Notes confirmed',
          details: { notesLength: notes?.length || 0 },
          branchId: req.user.branchId
        });
        // Don't update lead.notes since it's the same, but we still log the activity
      }
    }

    // Update other fields
    if (name) lead.name = name;
    if (phone) lead.phone = phone;
    if (email !== undefined) lead.email = email;
    if (source) lead.source = source;

    // Update interested services (allow custom services without serviceId)
    if (interestedServices !== undefined) {
      lead.interestedServices = interestedServices.map(service => ({
        serviceId: service.serviceId && service.serviceId !== 'null' && service.serviceId !== 'none'
          ? service.serviceId
          : null,
        serviceName: service.serviceName || service.name
      }));
    }

    const updatedLead = await lead.save();

    // Log all activities
    if (activities.length > 0) {
      try {
        await LeadActivity.insertMany(activities);
      } catch (activityError) {
        console.error('Error logging lead activities:', activityError);
        // Don't fail the request if activity logging fails
      }
    }
    const populatedLead = await Lead.findById(updatedLead._id)
      .populate('assignedStaffId', 'name')
      .populate('interestedServices.serviceId', 'name price');

    res.json({
      success: true,
      data: populatedLead
    });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update lead status
app.patch('/api/leads/:id/status', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'edit'), async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const { status } = req.body;

    if (!status || !['new', 'follow-up', 'converted', 'lost'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Valid status is required'
      });
    }

    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    const oldStatus = lead.status;
    lead.status = status;
    const updatedLead = await lead.save();

    // Log status change activity
    try {
      const { LeadActivity } = req.businessModels;
      await LeadActivity.create({
        leadId: lead._id,
        activityType: 'status_changed',
        performedBy: req.user.userId,
        performedByName: req.user.name || req.user.email || 'System',
        previousValue: oldStatus,
        newValue: status,
        field: 'status',
        description: `Status changed from ${oldStatus} to ${status}`,
        branchId: req.user.branchId
      });
    } catch (activityError) {
      console.error('Error logging lead status change activity:', activityError);
      // Don't fail the request if activity logging fails
    }

    res.json({
      success: true,
      data: updatedLead
    });
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Convert lead to appointment
app.post('/api/leads/:id/convert-to-appointment', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'edit'), async (req, res) => {
  try {
    const { Lead, Appointment, Client, Service } = req.businessModels;
    const { date, time, staffId, staffAssignments, notes: appointmentNotes } = req.body;

    if (!date || !time) {
      return res.status(400).json({
        success: false,
        error: 'Date and time are required'
      });
    }

    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    }).populate('interestedServices.serviceId');

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    if (lead.status === 'converted') {
      return res.status(400).json({
        success: false,
        error: 'Lead has already been converted'
      });
    }

    // Check if client exists, create if not
    let client = await Client.findOne({ phone: lead.phone, branchId: req.user.branchId });
    
    if (!client) {
      client = new Client({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        branchId: req.user.branchId,
        status: 'active'
      });
      await client.save();
    }

    // Create appointments for interested services
    // Note: Custom services (without serviceId) will be skipped - they can be added manually later
    const createdAppointments = [];
    
    for (const interestedService of lead.interestedServices) {
      const serviceId = interestedService.serviceId?._id || interestedService.serviceId;
      
      // Skip custom services (those without a serviceId)
      if (!serviceId) {
        console.log(`Skipping custom service "${interestedService.serviceName}" - no serviceId available`);
        continue;
      }
      
      const service = await Service.findById(serviceId);
      
      if (!service) {
        console.log(`Service with ID ${serviceId} not found, skipping`);
        continue;
      }

      const appointmentData = {
        clientId: client._id,
        serviceId: serviceId,
        date,
        time,
        duration: service.duration || 60,
        status: 'scheduled',
        notes: appointmentNotes || lead.notes || '',
        price: service.price || 0,
        branchId: req.user.branchId
      };

      // Handle staff assignments
      if (staffAssignments && Array.isArray(staffAssignments)) {
        appointmentData.staffAssignments = staffAssignments;
      } else if (staffId) {
        appointmentData.staffId = staffId;
        appointmentData.staffAssignments = [{
          staffId: staffId,
          percentage: 100,
          role: 'primary'
        }];
      } else if (lead.assignedStaffId) {
        appointmentData.staffId = lead.assignedStaffId;
        appointmentData.staffAssignments = [{
          staffId: lead.assignedStaffId,
          percentage: 100,
          role: 'primary'
        }];
      }

      const newAppointment = new Appointment(appointmentData);
      const savedAppointment = await newAppointment.save();
      const populatedAppointment = await Appointment.findById(savedAppointment._id)
        .populate('clientId', 'name phone')
        .populate('serviceId', 'name price')
        .populate('staffId', 'name');
      
      createdAppointments.push(populatedAppointment);
    }

    // Update lead status
    lead.status = 'converted';
    lead.convertedToAppointmentId = createdAppointments[0]?._id;
    lead.convertedToClientId = client._id;
    lead.convertedAt = new Date();
    await lead.save();

    // Log conversion activity
    try {
      const { LeadActivity } = req.businessModels;
      await LeadActivity.create({
        leadId: lead._id,
        activityType: 'converted',
        performedBy: req.user.userId,
        performedByName: req.user.name || req.user.email || 'System',
        newValue: {
          appointmentIds: createdAppointments.map(a => a._id),
          clientId: client._id
        },
        description: `Lead converted to ${createdAppointments.length} appointment(s) and client`,
        details: {
          appointmentCount: createdAppointments.length,
          clientName: client.name
        },
        branchId: req.user.branchId
      });
    } catch (activityError) {
      console.error('Error logging lead conversion activity:', activityError);
      // Don't fail the request if activity logging fails
    }

    res.json({
      success: true,
      data: {
        lead,
        appointments: createdAppointments,
        client
      },
      message: 'Lead converted to appointment successfully'
    });
  } catch (error) {
    console.error('Error converting lead to appointment:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Delete lead
app.delete('/api/leads/:id', authenticateToken, setupBusinessDatabase, checkPermission('lead_management', 'delete'), async (req, res) => {
  try {
    const { Lead } = req.businessModels;
    const deletedLead = await Lead.findOneAndDelete({ 
      _id: req.params.id, 
      branchId: req.user.branchId 
    });

    if (!deletedLead) {
      return res.status(404).json({
        success: false,
        error: 'Lead not found'
      });
    }

    res.json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Services routes
app.get('/api/services', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    console.log('🔍 Services request for user:', req.user?.email, 'branchId:', req.user?.branchId);
    
    const { Service } = req.businessModels;
    const { page = 1, limit = 10, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const total = await Service.countDocuments(query);
    const services = await Service.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ category: 1, name: 1 }); // Sort by category alphabetically, then by name

    console.log('✅ Services found:', services.length);
    res.json({
      success: true,
      data: services,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/services', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { Service } = req.businessModels;
    const { name, category, duration, price, description } = req.body;

    if (!name || !category || !duration || !price) {
      return res.status(400).json({
        success: false,
        error: 'Name, category, duration, and price are required'
      });
    }

    const newService = new Service({
      name,
      category,
      duration: parseInt(duration),
      price: parseFloat(price),
      description: description || '',
      isActive: true,
      branchId: req.user.branchId
    });

    const savedService = await newService.save();

    res.status(201).json({
      success: true,
      data: savedService
    });
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.put('/api/services/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { Service } = req.businessModels;
    const { name, category, duration, price, description, isActive } = req.body;

    if (!name || !category || !duration || !price) {
      return res.status(400).json({
        success: false,
        error: 'Name, category, duration, and price are required'
      });
    }

    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      {
        name,
        category,
        duration: parseInt(duration),
        price: parseFloat(price),
        description: description || '',
        isActive: isActive !== undefined ? isActive : true,
      },
      { new: true }
    );

    if (!updatedService) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    res.json({
      success: true,
      data: updatedService
    });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.delete('/api/services/:id', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { Service } = req.businessModels;
    const deletedService = await Service.findByIdAndDelete(req.params.id);
    
    if (!deletedService) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Bulk delete services
app.delete('/api/services', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { Service } = req.businessModels;
    
    // Delete all services for this branch
    const result = await Service.deleteMany({ branchId: req.user.branchId });
    
    console.log(`✅ Deleted ${result.deletedCount} services for branch ${req.user.branchId}`);
    
    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} services`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting all services:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Import services from Excel/CSV
app.post('/api/services/import', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    console.log('🔍 Service import request received');
    const { Service } = req.businessModels;
    const { services, mapping } = req.body;

    if (!services || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No services data provided'
      });
    }

    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Column mapping is required'
      });
    }

    console.log(`📊 Processing ${services.length} services for import`);

    const results = {
      success: [],
      errors: [],
      skipped: []
    };

    // Process each service
    for (let i = 0; i < services.length; i++) {
      const serviceData = services[i];
      const rowNumber = i + 1;

      try {
        // Map the data according to the mapping
        const mappedData = {};
        Object.keys(mapping).forEach(excelColumn => {
          const serviceField = mapping[excelColumn];
          if (serviceField && serviceField !== 'none') {
            mappedData[serviceField] = serviceData[excelColumn];
          }
        });

        // Validate required fields (price can be 0, so check for undefined/null/empty string)
        if (!mappedData.name || !mappedData.category || !mappedData.duration || 
            mappedData.price === undefined || mappedData.price === null || mappedData.price === '') {
          results.errors.push({
            row: rowNumber,
            error: 'Name, category, duration, and price are required',
            data: mappedData
          });
          continue;
        }

        // Convert to string and normalize name and category for duplicate check
        const normalizedName = String(mappedData.name).trim().toLowerCase();
        const normalizedCategory = String(mappedData.category).trim().toLowerCase();

        // Check if service already exists (by normalized name and category)
        const existingService = await Service.findOne({
          name: { $regex: new RegExp(`^${normalizedName}$`, 'i') },
          category: { $regex: new RegExp(`^${normalizedCategory}$`, 'i') },
          branchId: req.user.branchId
        });

        if (existingService) {
          results.skipped.push({
            row: rowNumber,
            reason: 'Service already exists',
            data: mappedData
          });
          continue;
        }

        // Validate duration and price are numbers
        const duration = parseInt(mappedData.duration);
        const price = parseFloat(mappedData.price);

        if (isNaN(duration) || duration < 1) {
          results.errors.push({
            row: rowNumber,
            error: 'Duration must be a positive number (in minutes)',
            data: mappedData
          });
          continue;
        }

        // Price can be 0 or greater (will be adjusted at billing time)
        if (isNaN(price) || price < 0) {
          results.errors.push({
            row: rowNumber,
            error: 'Price must be a valid number (0 or greater)',
            data: mappedData
          });
          continue;
        }

        // Prepare service data
        const serviceToCreate = {
          name: String(mappedData.name).trim(),
          category: String(mappedData.category).trim(),
          duration: duration,
          price: price,
          description: mappedData.description ? String(mappedData.description).trim() : '',
          branchId: req.user.branchId,
          isActive: true
        };

        // Create the service
        const newService = new Service(serviceToCreate);
        const savedService = await newService.save();

        results.success.push({
          row: rowNumber,
          service: savedService
        });

        console.log(`✅ Service imported successfully: ${savedService.name}`);

      } catch (error) {
        console.error(`❌ Error importing service at row ${rowNumber}:`, error);
        results.errors.push({
          row: rowNumber,
          error: error.message || 'Unknown error occurred',
          data: serviceData
        });
      }
    }

    console.log(`📊 Import completed: ${results.success.length} success, ${results.errors.length} errors, ${results.skipped.length} skipped`);

    res.json({
      success: true,
      data: {
        totalProcessed: services.length,
        successful: results.success.length,
        errors: results.errors.length,
        skipped: results.skipped.length,
        results: {
          success: results.success,
          errors: results.errors,
          skipped: results.skipped
        }
      }
    });

  } catch (error) {
    console.error('Error importing services:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during import'
    });
  }
});

// Products routes
app.get('/api/products', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    console.log('🔍 Products request for user:', req.user?.email, 'branchId:', req.user?.branchId);
    
    const { Product } = req.businessModels;
    const { page = 1, limit = 10, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ category: 1, name: 1 }); // Sort by category alphabetically, then by name

    console.log('✅ Products found:', products.length);
    res.json({
      success: true,
      data: products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/products', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { Product, InventoryTransaction } = req.businessModels;
    const { name, category, price, stock, minimumStock, sku, supplier, description, taxCategory, productType, transactionType } = req.body;

    console.log('🔍 Product creation request body:', req.body);
    console.log('🔍 Extracted fields:', { name, category, price, stock, minimumStock, sku, supplier, description, taxCategory, productType });

    // For service products, price is not required
    const isServiceProduct = productType === 'service';
    const priceRequired = !isServiceProduct;
    
    if (!name || !category || !stock || (priceRequired && (price === undefined || price === null || price === ''))) {
      console.log('❌ Validation failed - missing required fields:', { 
        name: !!name, 
        category: !!category, 
        price: price, 
        stock: !!stock,
        productType: productType,
        isServiceProduct: isServiceProduct,
        priceRequired: priceRequired
      });
      return res.status(400).json({
        success: false,
        error: isServiceProduct 
          ? 'Name, category, and stock are required for service products' 
          : 'Name, category, price, and stock are required'
      });
    }

    const newProduct = new Product({
      name,
      category,
      price: isServiceProduct ? 0 : parseFloat(price), // Service products have price 0
      stock: parseInt(stock),
      minimumStock: minimumStock !== undefined ? parseInt(minimumStock) : undefined,
      sku: sku || `SKU-${Date.now()}`,
      supplier,
      description,
      taxCategory: taxCategory || 'standard',
      productType: productType || 'retail',
      isActive: true,
      branchId: req.user.branchId
    });

    const savedProduct = await newProduct.save();

    // Create inventory transaction for stock addition
    const inventoryTransaction = new InventoryTransaction({
      productId: savedProduct._id,
      productName: savedProduct.name,
      transactionType: transactionType || 'purchase',
      quantity: parseInt(stock),
      previousStock: 0,
      newStock: parseInt(stock),
      unitCost: parseFloat(price) || 0,
      totalValue: (parseFloat(price) || 0) * parseInt(stock),
      referenceType: 'purchase',
      referenceId: savedProduct._id.toString(),
      referenceNumber: `PROD-${savedProduct._id.toString().slice(-6)}`,
      processedBy: req.user.email,
      location: 'main',
      reason: `Product added to inventory`,
      notes: `Initial stock addition via ${transactionType || 'purchase'}`,
      transactionDate: new Date()
    });

    await inventoryTransaction.save();

    res.status(201).json({
      success: true,
      data: savedProduct
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.put('/api/products/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    console.log('🔍 PUT /api/products/:id - Product update request received');
    console.log('🔍 Product ID:', req.params.id);
    console.log('🔍 Request body:', req.body);
    
    const { Product, InventoryTransaction } = req.businessModels;
    const { name, category, price, stock, minimumStock, sku, supplier, description, isActive, taxCategory, productType, transactionType } = req.body;

    // For service products, price is not required
    const isServiceProduct = productType === 'service';
    const priceRequired = !isServiceProduct;
    
    if (!name || !category || !stock || (priceRequired && (price === undefined || price === null || price === ''))) {
      return res.status(400).json({
        success: false,
        error: isServiceProduct 
          ? 'Name, category, and stock are required for service products' 
          : 'Name, category, price, and stock are required'
      });
    }

    // Get current product to compare stock levels
    const currentProduct = await Product.findById(req.params.id);
    if (!currentProduct) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const previousStock = currentProduct.stock || 0;
    const newStock = parseInt(stock);
    const stockDifference = newStock - previousStock;

    // Update the product
    const updateData = {
      name,
      category,
      price: isServiceProduct ? 0 : parseFloat(price), // Service products have price 0
      stock: newStock,
      sku: sku || `SKU-${Date.now()}`,
      supplier,
      description,
      taxCategory: taxCategory || 'standard',
      productType: productType || 'retail',
      isActive: isActive !== undefined ? isActive : true,
    };
    
    // Add minimumStock if provided (handle empty string, null, and undefined)
    if (minimumStock !== undefined && minimumStock !== null && minimumStock !== '') {
      updateData.minimumStock = parseInt(minimumStock);
    } else if (minimumStock === '' || minimumStock === null) {
      // Allow clearing minimumStock by setting it to null
      updateData.minimumStock = null;
    }
    
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // Create inventory transaction if stock changed
    console.log('🔍 Stock difference:', stockDifference);
    if (stockDifference !== 0) {
      console.log('🔍 Creating inventory transaction...');
      try {
        const inventoryTransaction = new InventoryTransaction({
          productId: req.params.id,
          productName: updatedProduct.name,
          transactionType: transactionType || (stockDifference > 0 ? 'purchase' : 'adjustment'),
          quantity: stockDifference,
          previousStock: previousStock,
          newStock: newStock,
          unitCost: parseFloat(price) || 0,
          totalValue: Math.abs(stockDifference * (parseFloat(price) || 0)),
          referenceType: 'product_edit',
          referenceId: req.params.id,
          referenceNumber: `EDIT-${Date.now()}`,
          processedBy: req.user.firstName + ' ' + req.user.lastName || 'System',
          reason: stockDifference > 0 ? 'Stock restocked via product edit' : 'Stock adjusted via product edit',
          notes: `Stock updated from ${previousStock} to ${newStock} units`,
          transactionDate: new Date()
        });
        
        await inventoryTransaction.save();
        console.log(`✅ Inventory transaction created for product ${updatedProduct.name}: ${stockDifference > 0 ? '+' : ''}${stockDifference} units`);
        console.log('🔍 Inventory transaction details:', {
          productId: req.params.id,
          productName: updatedProduct.name,
          transactionType: transactionType || (stockDifference > 0 ? 'purchase' : 'adjustment'),
          quantity: stockDifference,
          previousStock: previousStock,
          newStock: newStock
        });
      } catch (inventoryError) {
        console.error('❌ Error creating inventory transaction:', inventoryError);
        // Don't fail the product update if inventory tracking fails
      }
    } else {
      console.log('🔍 No stock change detected, skipping inventory transaction');
    }

    // Check for low inventory after stock update
    if (stockDifference !== 0) {
      try {
        const { checkAndSendLowInventoryAlerts } = require('./utils/low-inventory-checker');
        // Check only the updated product if stock decreased
        if (stockDifference < 0) {
          await checkAndSendLowInventoryAlerts(req.user.branchId, req.params.id);
        }
      } catch (inventoryCheckError) {
        console.error('❌ Error checking low inventory:', inventoryCheckError);
        // Don't fail the product update if inventory check fails
      }
    }

    res.json({
      success: true,
      data: updatedProduct
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Bulk delete all products
app.delete('/api/products', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { Product } = req.businessModels;
    
    // Delete all products for this branch
    const result = await Product.deleteMany({ branchId: req.user.branchId });
    
    console.log(`✅ Deleted ${result.deletedCount} products for branch ${req.user.branchId}`);
    
    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} products`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting all products:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.delete('/api/products/:id', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { Product } = req.businessModels;
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    
    if (!deletedProduct) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Import products from Excel/CSV data
app.post('/api/products/import', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    console.log('🔍 Product import request received');
    const { Product, InventoryTransaction } = req.businessModels;
    const { products, mapping } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No products data provided'
      });
    }

    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Column mapping is required'
      });
    }

    console.log(`📊 Processing ${products.length} products for import`);

    const results = {
      success: [],
      errors: [],
      skipped: []
    };

    // Process each product
    for (let i = 0; i < products.length; i++) {
      const productData = products[i];
      const rowNumber = i + 1;

      try {
        // Map the data according to the mapping
        const mappedData = {};
        Object.keys(mapping).forEach(excelColumn => {
          const productField = mapping[excelColumn];
          if (productField && productField !== 'none') {
            mappedData[productField] = productData[excelColumn];
          }
        });

        // Validate required fields
        if (!mappedData.name || !mappedData.category) {
          results.errors.push({
            row: rowNumber,
            error: 'Name and category are required',
            data: mappedData
          });
          continue;
        }

        // Convert to string and normalize name and category for duplicate check
        const normalizedName = String(mappedData.name).trim().toLowerCase();
        const normalizedCategory = String(mappedData.category).trim().toLowerCase();
        
        // Normalize productType (handle case variations: Retail, RETAIL, retail, etc.)
        let normalizedProductType = 'retail'; // default
        if (mappedData.productType) {
          const productTypeStr = String(mappedData.productType).trim().toLowerCase();
          if (['retail', 'service', 'both'].includes(productTypeStr)) {
            normalizedProductType = productTypeStr;
          } else {
            // Handle variations like "Retail", "RETAIL", "Retail Product", etc.
            if (productTypeStr.includes('retail') && !productTypeStr.includes('service') && !productTypeStr.includes('both')) {
              normalizedProductType = 'retail';
            } else if (productTypeStr.includes('service') && !productTypeStr.includes('retail') && !productTypeStr.includes('both')) {
              normalizedProductType = 'service';
            } else if (productTypeStr.includes('both')) {
              normalizedProductType = 'both';
            }
          }
          console.log(`📦 Product "${mappedData.name}": productType "${mappedData.productType}" normalized to "${normalizedProductType}"`);
        } else {
          console.log(`📦 Product "${mappedData.name}": No productType specified, defaulting to "retail"`);
        }

        // Check if product already exists (by normalized name, category, AND productType)
        // Products with same name/category but different type are NOT duplicates
        const existingProduct = await Product.findOne({
          name: { $regex: new RegExp(`^${normalizedName}$`, 'i') },
          category: { $regex: new RegExp(`^${normalizedCategory}$`, 'i') },
          productType: normalizedProductType,
          branchId: req.user.branchId
        });

        if (existingProduct) {
          results.skipped.push({
            row: rowNumber,
            reason: 'Product already exists',
            data: mappedData
          });
          continue;
        }

        // Prepare product data
        const productToCreate = {
          name: mappedData.name,
          category: mappedData.category,
          price: mappedData.price ? parseFloat(mappedData.price) : (normalizedProductType === 'service' ? 0 : 0),
          stock: mappedData.stock ? parseInt(mappedData.stock) : 0,
          sku: mappedData.sku && mappedData.sku.trim() !== '' ? mappedData.sku.trim() : undefined,
          supplier: mappedData.supplier || '',
          description: mappedData.description || '',
          taxCategory: mappedData.taxCategory || 'standard',
          productType: normalizedProductType, // Use normalized productType from above
          branchId: req.user.branchId,
          isActive: true
        };

        // Validate product type (already normalized above, but double-check)
        if (!['retail', 'service', 'both'].includes(productToCreate.productType)) {
          console.warn(`⚠️ Invalid productType "${mappedData.productType}", defaulting to "retail"`);
          productToCreate.productType = 'retail';
        }

        // Validate tax category
        if (!['essential', 'intermediate', 'standard', 'luxury', 'exempt'].includes(productToCreate.taxCategory)) {
          productToCreate.taxCategory = 'standard';
        }

        // Create the product
        const newProduct = new Product(productToCreate);
        const savedProduct = await newProduct.save();

        // Create inventory transaction if stock > 0
        if (savedProduct.stock > 0) {
          const inventoryTransaction = new InventoryTransaction({
            productId: savedProduct._id,
            productName: savedProduct.name,
            transactionType: 'restock', // Changed from 'in' to 'restock'
            quantity: savedProduct.stock,
            previousStock: 0,
            newStock: savedProduct.stock,
            unitCost: savedProduct.price || 0,
            totalValue: (savedProduct.price || 0) * savedProduct.stock,
            referenceType: 'product_edit', // Changed from 'product_import' to 'product_edit'
            referenceId: savedProduct._id.toString(),
            referenceNumber: `IMPORT-${savedProduct._id.toString().slice(-6)}`,
            reason: 'Product imported via Excel/CSV',
            processedBy: req.user.name || req.user.email || 'System',
            branchId: req.user.branchId
          });

          await inventoryTransaction.save();
          console.log(`✅ Inventory transaction created for imported product ${savedProduct.name}: +${savedProduct.stock} units`);
        }

        results.success.push({
          row: rowNumber,
          product: savedProduct
        });

        console.log(`✅ Product imported successfully: ${savedProduct.name}`);

      } catch (error) {
        console.error(`❌ Error importing product at row ${rowNumber}:`, error);
        results.errors.push({
          row: rowNumber,
          error: error.message || 'Unknown error occurred',
          data: productData
        });
      }
    }

    console.log(`📊 Import completed: ${results.success.length} success, ${results.errors.length} errors, ${results.skipped.length} skipped`);

    res.json({
      success: true,
      data: {
        totalProcessed: products.length,
        successful: results.success.length,
        errors: results.errors.length,
        skipped: results.skipped.length,
        results: {
          success: results.success,
          errors: results.errors,
          skipped: results.skipped
        }
      }
    });

  } catch (error) {
    console.error('Error importing products:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during import'
    });
  }
});

// ==================== SUPPLIER ROUTES ====================

// Get all suppliers
app.get('/api/suppliers', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Supplier } = req.businessModels;
    const { search, activeOnly } = req.query;

    let query = { branchId: req.user.branchId };

    // Filter by active status if requested
    if (activeOnly === 'true') {
      query.isActive = true;
    }

    // Search by name if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const suppliers = await Supplier.find(query).sort({ name: 1 });

    res.json({
      success: true,
      data: suppliers
    });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get a single supplier by ID
app.get('/api/suppliers/:id', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Supplier } = req.businessModels;
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    res.json({
      success: true,
      data: supplier
    });
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Create a new supplier
app.post('/api/suppliers', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Supplier } = req.businessModels;
    const { name, contactPerson, phone, email, address, notes } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Supplier name is required'
      });
    }

    // Check if supplier with same name already exists for this branch
    const existingSupplier = await Supplier.findOne({
      branchId: req.user.branchId,
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingSupplier) {
      return res.status(400).json({
        success: false,
        error: 'A supplier with this name already exists'
      });
    }

    // Create new supplier
    const supplier = new Supplier({
      name: name.trim(),
      contactPerson: contactPerson || '',
      phone: phone || '',
      email: email || '',
      address: address || '',
      notes: notes || '',
      branchId: req.user.branchId,
      isActive: true
    });

    await supplier.save();

    res.status(201).json({
      success: true,
      data: supplier
    });
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update a supplier
app.put('/api/suppliers/:id', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Supplier } = req.businessModels;
    const { name, contactPerson, phone, email, address, notes, isActive } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Supplier name is required'
      });
    }

    // Check if another supplier with same name exists
    const existingSupplier = await Supplier.findOne({
      _id: { $ne: req.params.id },
      branchId: req.user.branchId,
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingSupplier) {
      return res.status(400).json({
        success: false,
        error: 'A supplier with this name already exists'
      });
    }

    const updatedSupplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        contactPerson: contactPerson || '',
        phone: phone || '',
        email: email || '',
        address: address || '',
        notes: notes || '',
        isActive: isActive !== undefined ? isActive : true
      },
      { new: true, runValidators: true }
    );

    if (!updatedSupplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    res.json({
      success: true,
      data: updatedSupplier
    });
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Delete a supplier
app.delete('/api/suppliers/:id', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { Supplier } = req.businessModels;
    const deletedSupplier = await Supplier.findByIdAndDelete(req.params.id);

    if (!deletedSupplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    res.json({
      success: true,
      message: 'Supplier deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ==================== INVENTORY MANAGEMENT ROUTES ====================
// Product Out - Deduct products from inventory
app.post('/api/inventory/out', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Product, InventoryTransaction } = req.businessModels;
    const { productId, quantity, transactionType, reason, notes } = req.body;

    if (!productId || !quantity || !transactionType) {
      return res.status(400).json({
        success: false,
        error: 'Product ID, quantity, and transaction type are required'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    const deductionQuantity = Math.abs(parseInt(quantity));
    if (product.stock < deductionQuantity) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Available: ${product.stock}, Requested: ${deductionQuantity}`
      });
    }

    // Update product stock
    const previousStock = product.stock;
    const newStock = previousStock - deductionQuantity;
    
    await Product.findByIdAndUpdate(productId, { stock: newStock });

    // Create inventory transaction
    const inventoryTransaction = new InventoryTransaction({
      productId: product._id,
      productName: product.name,
      transactionType: transactionType,
      quantity: -deductionQuantity, // Negative for deduction
      previousStock: previousStock,
      newStock: newStock,
      unitCost: product.price || 0,
      totalValue: (product.price || 0) * deductionQuantity,
      referenceType: 'adjustment',
      referenceId: product._id.toString(),
      referenceNumber: `OUT-${Date.now()}`,
      processedBy: req.user.email,
      location: 'main',
      reason: reason || `Stock deduction - ${transactionType}`,
      notes: notes || '',
      transactionDate: new Date()
    });

    await inventoryTransaction.save();

    // Check for low inventory after stock deduction
    try {
      const { checkAndSendLowInventoryAlerts } = require('./utils/low-inventory-checker');
      await checkAndSendLowInventoryAlerts(req.user.branchId, productId);
    } catch (inventoryCheckError) {
      console.error('❌ Error checking low inventory:', inventoryCheckError);
      // Don't fail the deduction if inventory check fails
    }

    res.json({
      success: true,
      data: {
        product: await Product.findById(productId),
        transaction: inventoryTransaction
      },
      message: `Successfully deducted ${deductionQuantity} units of ${product.name}`
    });
  } catch (error) {
    console.error('Error deducting product:', error);
    
    // Return more detailed error message for validation errors
    let errorMessage = 'Internal server error';
    if (error.name === 'ValidationError') {
      errorMessage = error.message || 'Validation error';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get inventory transactions
app.get('/api/inventory/transactions', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { InventoryTransaction } = req.businessModels;
    const { page = 1, limit = 50, productId, transactionType, dateFrom, dateTo } = req.query;

    let query = {};
    
    if (productId) {
      query.productId = productId;
    }
    
    if (transactionType) {
      query.transactionType = transactionType;
    }
    
    if (dateFrom || dateTo) {
      query.transactionDate = {};
      if (dateFrom) {
        query.transactionDate.$gte = new Date(dateFrom);
        console.log('🔍 Date filter - From:', dateFrom, 'Parsed:', new Date(dateFrom));
      }
      if (dateTo) {
        query.transactionDate.$lte = new Date(dateTo);
        console.log('🔍 Date filter - To:', dateTo, 'Parsed:', new Date(dateTo));
      }
      console.log('🔍 Final date query:', query.transactionDate);
    }

    console.log('🔍 Final query being executed:', JSON.stringify(query, null, 2));
    
    const transactions = await InventoryTransaction.find(query)
      .sort({ transactionDate: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    console.log('🔍 Found transactions:', transactions.length);
    if (transactions.length > 0) {
      console.log('🔍 First transaction date:', transactions[0].transactionDate);
    }

    const total = await InventoryTransaction.countDocuments(query);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching inventory transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Delete all inventory transactions (Reset transaction log)
app.delete('/api/inventory/transactions', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { InventoryTransaction } = req.businessModels;
    
    // Delete all inventory transactions for this business
    const result = await InventoryTransaction.deleteMany({});
    
    console.log(`✅ Deleted ${result.deletedCount} inventory transactions for branch ${req.user.branchId}`);
    
    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} inventory transactions`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting inventory transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ==================== CATEGORY ROUTES ====================

// Get all categories
app.get('/api/categories', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Category } = req.businessModels;
    const { search, type, activeOnly } = req.query;

    let query = { branchId: req.user.branchId };

    // Filter by type if provided (product, service, both)
    if (type && ['product', 'service', 'both'].includes(type)) {
      query.$or = [
        { type: type },
        { type: 'both' }
      ];
    }

    // Filter by active status if requested
    if (activeOnly === 'true') {
      query.isActive = true;
    }

    // Search by name if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const categories = await Category.find(query).sort({ name: 1 });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get a single category by ID
app.get('/api/categories/:id', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Category } = req.businessModels;
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Create a new category
app.post('/api/categories', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Category } = req.businessModels;
    const { name, type, description } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Category name is required'
      });
    }

    // Validate type if provided
    if (type && !['product', 'service', 'both'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category type. Must be: product, service, or both'
      });
    }

    // Check if category with same name already exists for this branch
    const existingCategory = await Category.findOne({
      branchId: req.user.branchId,
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        error: 'A category with this name already exists'
      });
    }

    // Create new category
    const category = new Category({
      name: name.trim(),
      type: type || 'both',
      description: description || '',
      branchId: req.user.branchId,
      isActive: true
    });

    await category.save();

    res.status(201).json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update a category
app.put('/api/categories/:id', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Category } = req.businessModels;
    const { name, type, description, isActive } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Category name is required'
      });
    }

    // Validate type if provided
    if (type && !['product', 'service', 'both'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category type. Must be: product, service, or both'
      });
    }

    // Check if another category with same name exists
    const existingCategory = await Category.findOne({
      _id: { $ne: req.params.id },
      branchId: req.user.branchId,
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        error: 'A category with this name already exists'
      });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        type: type || 'both',
        description: description || '',
        isActive: isActive !== undefined ? isActive : true
      },
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    res.json({
      success: true,
      data: updatedCategory
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Delete a category
app.delete('/api/categories/:id', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { Category } = req.businessModels;
    const deletedCategory = await Category.findByIdAndDelete(req.params.id);

    if (!deletedCategory) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update product stock
app.patch('/api/products/:id/stock', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Product } = req.businessModels;
    const { id } = req.params;
    const { quantity, operation = 'decrease' } = req.body; // operation can be 'decrease' or 'increase'
    
    if (quantity === undefined || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid quantity is required'
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    let newStock;
    if (operation === 'decrease') {
      // Check if we have enough stock
      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock. Available: ${product.stock}, Requested: ${quantity}`
        });
      }
      newStock = product.stock - quantity;
    } else if (operation === 'increase') {
      newStock = product.stock + quantity;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid operation. Use "decrease" or "increase"'
      });
    }

    // Update the product stock
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { stock: newStock },
      { new: true }
    );

    res.json({
      success: true,
      data: updatedProduct,
      message: `Stock ${operation}d successfully. New stock: ${newStock}`
    });
  } catch (error) {
    console.error('Error updating product stock:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Staff routes
app.get('/api/staff', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const { page = 1, limit = 10, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { role: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const total = await Staff.countDocuments(query);
    const staff = await Staff.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: staff,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get single staff member by ID
app.get('/api/staff/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const staff = await Staff.findById(req.params.id).select('-password');
    
    if (!staff) {
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    res.json({
      success: true,
      data: staff
    });
  } catch (error) {
    console.error('Error fetching staff member:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Staff Directory (includes business owner + staff members)
app.get('/api/staff-directory', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const { search = '' } = req.query;

    // Get business owner from main database
    const mainConnection = await databaseManager.getMainConnection();
    const User = mainConnection.model('User', require('./models/User').schema);
    const businessOwner = await User.findOne({ 
      branchId: req.user.branchId,
      role: 'admin'
    });

    // Get staff members from business database
    let staffQuery = {};
    if (search) {
      staffQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { role: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const staffMembers = await Staff.find(staffQuery).sort({ createdAt: -1 });

    // Combine business owner and staff members
    const allStaff = [];

    // Add business owner first (if exists and matches search)
    if (businessOwner) {
      const ownerMatchesSearch = !search || 
        businessOwner.name.toLowerCase().includes(search.toLowerCase()) ||
        businessOwner.email.toLowerCase().includes(search.toLowerCase()) ||
        businessOwner.role.toLowerCase().includes(search.toLowerCase());

      if (ownerMatchesSearch) {
        allStaff.push({
          _id: businessOwner._id,
          name: businessOwner.name,
          email: businessOwner.email,
          phone: businessOwner.mobile,
          role: 'admin',
          specialties: businessOwner.specialties || [],
          salary: businessOwner.salary || 0,
          commissionProfileIds: businessOwner.commissionProfileIds || [],
          notes: businessOwner.notes || 'Business Owner',
          isActive: businessOwner.isActive,
          hasLoginAccess: businessOwner.hasLoginAccess || true, // Business owner always has login access
          allowAppointmentScheduling: businessOwner.allowAppointmentScheduling !== false, // Respect owner's choice; default true for legacy
          permissions: businessOwner.permissions || [],
          createdAt: businessOwner.createdAt,
          updatedAt: businessOwner.updatedAt,
          isOwner: true // Flag to identify business owner
        });
      }
    }

    // Add staff members
    allStaff.push(...staffMembers.map(staff => ({
      ...staff.toObject(),
      salary: staff.salary || 0,
      commissionProfileIds: staff.commissionProfileIds || [],
      hasLoginAccess: staff.hasLoginAccess || false,
      allowAppointmentScheduling: staff.allowAppointmentScheduling || false,
      permissions: staff.permissions || [],
      isOwner: false
    })));

    res.json({
      success: true,
      data: allStaff,
      pagination: {
        page: 1,
        limit: allStaff.length,
        total: allStaff.length,
        totalPages: 1
      }
    });
  } catch (error) {
    console.error('Error fetching staff directory:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.post('/api/staff', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const { name, email, phone, role, specialties, salary, commissionProfileIds, notes, hasLoginAccess, allowAppointmentScheduling, password, isActive, workSchedule } = req.body;

    if (!name || !email || !phone || !role) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, phone, and role are required'
      });
    }

    // Validate password requirement when login access is enabled
    if (hasLoginAccess && (!password || password.trim() === '')) {
      return res.status(400).json({
        success: false,
        error: 'Password is required when login access is enabled'
      });
    }

    // Validate specialties requirement when appointment scheduling is enabled
    if (allowAppointmentScheduling && (!specialties || specialties.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'At least one specialty is required when appointment scheduling is enabled'
      });
    }

    const staffData = {
      name,
      email,
      phone,
      role,
      specialties: specialties || [],
      salary: parseFloat(salary) || 0,
      commissionProfileIds: commissionProfileIds || [],
      notes: notes || '',
      hasLoginAccess: hasLoginAccess || false,
      allowAppointmentScheduling: allowAppointmentScheduling || false,
      isActive: isActive !== undefined ? isActive : true,
      branchId: req.user.branchId
    };
    if (Array.isArray(workSchedule) && workSchedule.length > 0) {
      staffData.workSchedule = workSchedule.map(ws => ({
        day: typeof ws.day === 'number' ? ws.day : parseInt(ws.day, 10),
        enabled: ws.enabled !== false,
        startTime: typeof ws.startTime === 'string' ? ws.startTime : '09:00',
        endTime: typeof ws.endTime === 'string' ? ws.endTime : '21:00'
      }));
    }

    // Add password if provided
    if (password && password.trim() !== '') {
      const bcrypt = require('bcryptjs');
      staffData.password = await bcrypt.hash(password, 10);
    }

    const newStaff = new Staff(staffData);
    const savedStaff = await newStaff.save();

    res.status(201).json({
      success: true,
      data: savedStaff
    });
  } catch (error) {
    console.error('Error creating staff:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.put('/api/staff/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const { name, email, phone, role, specialties, salary, commissionProfileIds, notes, hasLoginAccess, allowAppointmentScheduling, password, isActive } = req.body;

    // Get existing staff to check current state
    const existingStaff = await Staff.findById(req.params.id);
    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    // Check authorization: staff can only update their own profile, admins can update anyone
    const isSelfUpdate = req.user._id?.toString() === req.params.id || req.user.id === req.params.id
    const isAdmin = req.user.role === 'admin'
    
    if (!isSelfUpdate && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: You can only update your own profile'
      });
    }

    // Admin work-schedule-only update (e.g. from Working Hours page)
    if (isAdmin && Array.isArray(req.body.workSchedule) && req.body.workSchedule.length > 0 && req.body.name === undefined) {
      const workSchedule = req.body.workSchedule.map(ws => ({
        day: typeof ws.day === 'number' ? ws.day : parseInt(ws.day, 10),
        enabled: ws.enabled !== false,
        startTime: typeof ws.startTime === 'string' ? ws.startTime : '09:00',
        endTime: typeof ws.endTime === 'string' ? ws.endTime : '21:00'
      }));
      const updatedStaff = await Staff.findByIdAndUpdate(
        req.params.id,
        { workSchedule },
        { new: true }
      );
      if (!updatedStaff) {
        return res.status(404).json({ success: false, error: 'Staff member not found' });
      }
      return res.json({ success: true, data: updatedStaff });
    }

    // For self-updates, only allow updating name, email, phone (not role, salary, etc.)
    if (isSelfUpdate && !isAdmin) {
      if (!name || !email || !phone) {
        return res.status(400).json({
          success: false,
          error: 'Name, email, and phone are required'
        });
      }
      
      // Only update allowed fields for self-updates
      const updateData = {
        name,
        email,
        phone
      };
      
      // Add password if provided
      if (password && password.trim() !== '') {
        const bcrypt = require('bcryptjs');
        updateData.password = await bcrypt.hash(password, 10);
      }

      const updatedStaff = await Staff.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      ).select('-password');

      return res.json({
        success: true,
        data: updatedStaff
      });
    }

    // Admin updates - require all fields
    if (!name || !email || !phone || !role) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, phone, and role are required'
      });
    }

    // Validate password requirement when enabling login access for the first time
    if (hasLoginAccess && !existingStaff.hasLoginAccess && (!password || password.trim() === '')) {
      return res.status(400).json({
        success: false,
        error: 'Password is required when enabling login access for the first time'
      });
    }

    // Validate specialties requirement when appointment scheduling is enabled
    if (allowAppointmentScheduling && (!specialties || specialties.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'At least one specialty is required when appointment scheduling is enabled'
      });
    }

    const updateData = {
      name,
      email,
      phone,
      role,
      specialties: specialties || [],
      salary: parseFloat(salary) || 0,
      commissionProfileIds: commissionProfileIds || [],
      notes: notes || '',
      hasLoginAccess: hasLoginAccess !== undefined ? hasLoginAccess : false,
      allowAppointmentScheduling: allowAppointmentScheduling !== undefined ? allowAppointmentScheduling : false,
      isActive: isActive !== undefined ? isActive : true,
    };
    const { workSchedule } = req.body;
    if (Array.isArray(workSchedule)) {
      updateData.workSchedule = workSchedule.map(ws => ({
        day: typeof ws.day === 'number' ? ws.day : parseInt(ws.day, 10),
        enabled: ws.enabled !== false,
        startTime: typeof ws.startTime === 'string' ? ws.startTime : '09:00',
        endTime: typeof ws.endTime === 'string' ? ws.endTime : '21:00'
      }));
    }

    // Add password if provided
    if (password && password.trim() !== '') {
      const bcrypt = require('bcryptjs');
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedStaff = await Staff.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedStaff) {
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    res.json({
      success: true,
      data: updatedStaff
    });
  } catch (error) {
    console.error('Error updating staff:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.delete('/api/staff/:id', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
  try {
    const { Staff } = req.businessModels;
    const deletedStaff = await Staff.findByIdAndDelete(req.params.id);
    
    if (!deletedStaff) {
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    res.json({
      success: true,
      message: 'Staff member deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting staff:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Block Time (staff unavailability / blocked slots)
app.get('/api/block-time', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { BlockTime } = req.businessModels;
    const { staffId, startDate, endDate } = req.query;
    const query = { branchId: req.user.branchId };
    if (staffId) query.staffId = staffId;
    if (startDate && endDate) {
      query.$or = [
        { recurringFrequency: 'none', startDate: { $gte: startDate, $lte: endDate } },
        {
          recurringFrequency: { $in: ['daily', 'weekly', 'monthly'] },
          startDate: { $lte: endDate },
          endDate: { $gte: startDate, $ne: null }
        }
      ];
    } else if (startDate) {
      query.$or = [
        { recurringFrequency: 'none', startDate: { $gte: startDate } },
        { recurringFrequency: { $in: ['daily', 'weekly', 'monthly'] }, endDate: { $gte: startDate, $ne: null } }
      ];
    } else if (endDate) {
      query.$or = [
        { recurringFrequency: 'none', startDate: { $lte: endDate } },
        { recurringFrequency: { $in: ['daily', 'weekly', 'monthly'] }, startDate: { $lte: endDate } }
      ];
    }
    const blocks = await BlockTime.find(query).sort({ startDate: 1, startTime: 1 }).lean();
    const populated = await Promise.all(blocks.map(async (b) => {
      const staff = await req.businessModels.Staff.findById(b.staffId).select('name').lean();
      return { ...b, staffId: { _id: b.staffId, name: staff?.name || 'Staff' } };
    }));
    res.json({ success: true, data: populated });
  } catch (error) {
    console.error('Error fetching block time:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/block-time', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { BlockTime } = req.businessModels;
    const { staffId, title, startDate, startTime, endTime, recurringFrequency, endDate, description } = req.body;
    if (!staffId || !title || !startDate || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Staff, title, start date, start time, and end time are required'
      });
    }
    const doc = {
      staffId,
      title: String(title).trim(),
      startDate: String(startDate),
      startTime: String(startTime),
      endTime: String(endTime),
      recurringFrequency: ['none', 'daily', 'weekly', 'monthly'].includes(recurringFrequency) ? recurringFrequency : 'none',
      endDate: endDate && ['daily', 'weekly', 'monthly'].includes(recurringFrequency) ? String(endDate) : null,
      description: description ? String(description).slice(0, 200) : '',
      branchId: req.user.branchId
    };
    const created = await BlockTime.create(doc);
    const populated = await BlockTime.findById(created._id).lean();
    const staff = await req.businessModels.Staff.findById(created.staffId).select('name').lean();
    const data = { ...populated, staffId: { _id: created.staffId, name: staff?.name || 'Staff' } };
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creating block time:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.put('/api/block-time/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { BlockTime } = req.businessModels;
    const existing = await BlockTime.findOne({ _id: req.params.id, branchId: req.user.branchId });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Block time not found' });
    }
    const { title, startDate, startTime, endTime, recurringFrequency, endDate, description } = req.body;
    const updateData = {};
    if (title !== undefined) updateData.title = String(title).trim();
    if (startDate !== undefined) updateData.startDate = String(startDate);
    if (startTime !== undefined) updateData.startTime = String(startTime);
    if (endTime !== undefined) updateData.endTime = String(endTime);
    if (recurringFrequency !== undefined) updateData.recurringFrequency = ['none', 'daily', 'weekly', 'monthly'].includes(recurringFrequency) ? recurringFrequency : 'none';
    if (endDate !== undefined) {
      const rec = updateData.recurringFrequency !== undefined ? updateData.recurringFrequency : existing.recurringFrequency;
      updateData.endDate = (rec === 'daily' || rec === 'weekly' || rec === 'monthly') ? String(endDate) : null;
    }
    if (description !== undefined) updateData.description = String(description).slice(0, 200) || '';
    const updated = await BlockTime.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true }).lean();
    const staff = await req.businessModels.Staff.findById(updated.staffId).select('name').lean();
    const data = { ...updated, staffId: { _id: updated.staffId, name: staff?.name || 'Staff' } };
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error updating block time:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.delete('/api/block-time/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { BlockTime } = req.businessModels;
    const deleted = await BlockTime.findOneAndDelete({ _id: req.params.id, branchId: req.user.branchId });
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Block time not found' });
    }
    res.json({ success: true, message: 'Block time deleted' });
  } catch (error) {
    console.error('Error deleting block time:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

const markAppointmentCompleted = async (AppointmentModel, appointmentId) => {
  if (!AppointmentModel || !appointmentId) return;
  try {
    const appointment = await AppointmentModel.findById(appointmentId);
    if (!appointment) {
      console.warn('⚠️ Appointment not found for completion update:', appointmentId);
      return;
    }

    if (appointment.status === 'completed' || appointment.status === 'cancelled') {
      return;
    }

    appointment.status = 'completed';
    await appointment.save();
    console.log(`✅ Appointment ${appointmentId} marked as completed after sale.`);
  } catch (error) {
    console.error('❌ Failed to mark appointment as completed:', error);
  }
};

// Appointments routes
app.get('/api/appointments', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Appointment } = req.businessModels;
    const { page = 1, limit = 10, date, status, clientId } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let query = {};

    if (date) {
      query.date = date;
    }

    if (status) {
      query.status = status;
    }

    if (clientId) {
      query.clientId = clientId;
    }

    const totalAppointments = await Appointment.countDocuments(query);
    const appointments = await Appointment.find(query)
      .populate('clientId', 'name phone email')
      .populate('serviceId', 'name price duration')
      .populate('staffId', 'name role')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: appointments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalAppointments,
        totalPages: Math.ceil(totalAppointments / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch appointments'
    });
  }
});

app.post('/api/appointments', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Appointment } = req.businessModels;
    const { clientId, clientName, date, time, services, totalDuration, totalAmount, notes, status = 'scheduled' } = req.body;

    if (!clientId || !date || !time || !services || services.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Client, date, time, and at least one service are required'
      });
    }

    // Create appointments for each service
    const createdAppointments = [];
    
    for (const service of services) {
      const appointmentData = {
        clientId,
        serviceId: service.serviceId,
        date,
        time,
        duration: service.duration,
        status,
        notes,
        price: service.price,
        branchId: req.user.branchId
      };

      // Handle multiple staff assignments
      if (service.staffAssignments && Array.isArray(service.staffAssignments)) {
        appointmentData.staffAssignments = service.staffAssignments;
        // Validate that percentages add up to 100%
        const totalPercentage = service.staffAssignments.reduce((sum, assignment) => sum + assignment.percentage, 0);
        if (Math.abs(totalPercentage - 100) > 0.01) {
          return res.status(400).json({
            success: false,
            error: 'Staff assignment percentages must add up to 100%'
          });
        }
      } else if (service.staffId) {
        // Legacy support - single staff member
        appointmentData.staffId = service.staffId;
        appointmentData.staffAssignments = [{
          staffId: service.staffId,
          percentage: 100,
          role: 'primary'
        }];
      } else {
        return res.status(400).json({
          success: false,
          error: 'Either staffId or staffAssignments is required'
        });
      }

      const newAppointment = new Appointment(appointmentData);
      const savedAppointment = await newAppointment.save();
      
      // Populate the saved appointment with related data
      const populatedAppointment = await Appointment.findById(savedAppointment._id)
        .populate('clientId', 'name phone email')
        .populate('serviceId', 'name price duration')
        .populate('staffId', 'name role')
        .populate('staffAssignments.staffId', 'name role');

      createdAppointments.push(populatedAppointment);
    }

    // Send email notifications if enabled
    try {
      const emailService = require('./services/email-service');
      
      // Ensure email service is initialized
      if (!emailService.initialized) {
        console.log('📧 Initializing email service...');
        await emailService.initialize();
      }
      
      // Debug: Log email service status
      console.log('📧 Email Service Status:', {
        initialized: emailService.initialized,
        enabled: emailService.enabled,
        provider: emailService.provider,
        hasConfig: !!emailService.config
      });
      
      // Check if email service is enabled (from AdminSettings)
      if (!emailService.enabled) {
        console.log('❌ Email service is disabled, skipping appointment email');
        console.log('💡 To enable: Check Admin Settings → Notifications → Email and ensure it\'s enabled with valid API key');
      } else {
        // Get Business from main database (not business database)
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const business = await Business.findById(req.user.branchId);
        
        if (!business) {
          console.error('❌ Business not found for branchId:', req.user.branchId);
        } else {
          console.log('✅ Business found:', business.name);
        }
        
        const rawEmailSettings = business?.settings?.emailNotificationSettings;
        
        // Apply defaults to email settings (similar to WhatsApp)
        const emailSettings = getEmailSettingsWithDefaults(rawEmailSettings);
        
        // Debug: Log email settings
        console.log('📧 Email Settings:', {
          emailSettingsExists: !!rawEmailSettings,
          appointmentNotificationsEnabled: emailSettings?.appointmentNotifications?.enabled,
          newAppointmentsEnabled: emailSettings?.appointmentNotifications?.newAppointments
        });
        
        const { Staff, Client } = req.businessModels;

        // Check if business has enabled appointment notifications
        // Use merged settings with defaults - defaults to true if not explicitly set to false
        const appointmentNotificationsEnabled = emailSettings.appointmentNotifications?.enabled === true;
        
        console.log(`📧 Appointment notifications enabled: ${appointmentNotificationsEnabled}`, {
          enabled: emailSettings?.appointmentNotifications?.enabled,
          newAppointments: emailSettings?.appointmentNotifications?.newAppointments
        });
        
        if (appointmentNotificationsEnabled) {
        // Send confirmation to client if email exists
        // Check if new appointments are enabled
        const sendNewAppointments = emailSettings?.appointmentNotifications?.newAppointments === true;
        console.log(`📧 Send new appointments to clients: ${sendNewAppointments}`);
        
        if (sendNewAppointments) {
          console.log(`📧 Processing ${createdAppointments.length} appointment(s) for client emails`);
          
          for (const appointment of createdAppointments) {
            // Debug: Log appointment structure
            console.log('📧 Appointment Structure:', {
              appointmentId: appointment._id,
              clientIdType: typeof appointment.clientId,
              clientIdIsObject: typeof appointment.clientId === 'object',
              clientIdValue: appointment.clientId?._id || appointment.clientId,
              clientIdEmail: appointment.clientId?.email,
              clientIdName: appointment.clientId?.name
            });
            
            // Check if clientId is already populated (from the populate call above)
            let client = null;
            let clientEmail = null;
            let clientName = null;
            
            if (appointment.clientId && typeof appointment.clientId === 'object') {
              // Client is populated
              client = appointment.clientId;
              clientEmail = client.email ? client.email.trim() : null;
              clientName = client.name || 'Client';
              
              console.log('📧 Using populated client data:', {
                name: clientName,
                email: clientEmail,
                hasEmail: !!clientEmail
              });
            } else {
              // Client is not populated, fetch it
              const clientId = appointment.clientId?._id || appointment.clientId;
              console.log('📧 Client not populated, fetching from database. ClientId:', clientId);
              
              if (clientId) {
                client = await Client.findById(clientId);
                if (client) {
                  clientEmail = client.email ? client.email.trim() : null;
                  clientName = client.name || 'Client';
                  console.log('📧 Fetched client from database:', {
                    name: clientName,
                    email: clientEmail,
                    hasEmail: !!clientEmail
                  });
                } else {
                  console.error('❌ Client not found in database with ID:', clientId);
                }
              } else {
                console.error('❌ No clientId found in appointment');
              }
            }
            
            // Debug: Log client email check
            console.log('📧 Client Email Check Summary:', {
              appointmentId: appointment._id,
              clientId: appointment.clientId?._id || appointment.clientId,
              clientEmail: clientEmail,
              clientName: clientName,
              hasEmail: !!clientEmail,
              emailLength: clientEmail?.length || 0
            });
            
            if (clientEmail && clientEmail.length > 0) {
              console.log(`📧 Attempting to send appointment confirmation to: ${clientEmail}`);
              try {
                // Get service name - check if populated or fetch
                let serviceName = 'Service';
                if (appointment.serviceId) {
                  if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) {
                    serviceName = appointment.serviceId.name;
                  } else {
                    const Service = req.businessModels.Service;
                    const service = await Service.findById(appointment.serviceId);
                    serviceName = service?.name || 'Service';
                  }
                }
                
                // Get staff name - check if populated or fetch
                let staffName = 'Not assigned';
                if (appointment.staffId) {
                  if (typeof appointment.staffId === 'object' && appointment.staffId.name) {
                    staffName = appointment.staffId.name;
                  } else {
                    const staff = await Staff.findById(appointment.staffId);
                    staffName = staff?.name || 'Not assigned';
                  }
                } else if (appointment.staffAssignments && appointment.staffAssignments.length > 0) {
                  const firstAssignment = appointment.staffAssignments[0];
                  if (firstAssignment.staffId && typeof firstAssignment.staffId === 'object' && firstAssignment.staffId.name) {
                    staffName = firstAssignment.staffId.name;
                  } else if (firstAssignment.staffId) {
                    const staff = await Staff.findById(firstAssignment.staffId);
                    staffName = staff?.name || 'Not assigned';
                  }
                }
                
                console.log(`📧 Preparing to send email to: ${clientEmail}`);
                console.log(`📧 Email details:`, {
                  to: clientEmail,
                  clientName: clientName,
                  serviceName: serviceName,
                  date: appointment.date,
                  time: appointment.time,
                  staffName: staffName,
                  businessName: business.name
                });
                
                const emailResult = await emailService.sendAppointmentConfirmation({
                  to: clientEmail,
                  clientName: clientName,
                  appointmentData: {
                    serviceName: serviceName,
                    date: appointment.date,
                    time: appointment.time,
                    staffName: staffName,
                    businessName: business.name,
                    businessPhone: business.contact?.phone,
                    notes: appointment.notes || ''
                  }
                });
                
                console.log(`📧 Email result:`, {
                  success: emailResult?.success,
                  error: emailResult?.error,
                  data: emailResult?.data
                });
                
                if (emailResult && emailResult.success !== false) {
                  console.log(`✅ Appointment confirmation sent to client: ${clientEmail}`);
                } else {
                  console.error(`❌ Failed to send appointment email to ${clientEmail}:`, emailResult?.error || 'Unknown error');
                  console.error(`❌ Full email result:`, JSON.stringify(emailResult, null, 2));
                }
              } catch (clientEmailError) {
                console.error('❌ Error sending appointment confirmation to client:', clientEmailError);
                console.error('❌ Error details:', {
                  message: clientEmailError.message,
                  stack: clientEmailError.stack
                });
              }
            } else {
              console.log(`⚠️ Skipping email for appointment - client has no email address.`);
              console.log(`   Appointment ID: ${appointment._id}`);
              console.log(`   Client ID: ${appointment.clientId?._id || appointment.clientId}`);
              console.log(`   Client Name: ${clientName || 'Unknown'}`);
              console.log(`   💡 To fix: Add email address to client profile in Clients section`);
            }
          }
        }
        
        // Send notification to staff if enabled
        // Use same logic as client notifications - default to enabled unless explicitly disabled AND configured
        const staffHasRecipientList = emailSettings?.appointmentNotifications?.recipientStaffIds?.length > 0;
        const staffExplicitlyDisabled = emailSettings?.appointmentNotifications?.enabled === false;
        const staffNotificationsEnabled = !emailSettings || 
          !emailSettings?.appointmentNotifications ||
          (!staffExplicitlyDisabled || !staffHasRecipientList);
        
        const recipientStaffIds = emailSettings?.appointmentNotifications?.recipientStaffIds || [];
        
        console.log('📧 Staff Notification Check:', {
          staffNotificationsEnabled,
          staffExplicitlyDisabled,
          staffHasRecipientList,
          recipientStaffIdsCount: recipientStaffIds.length,
          recipientStaffIds: recipientStaffIds.map(id => id.toString())
        });
        
        if (staffNotificationsEnabled) {
          // If recipient list is empty, find all staff with appointment alerts enabled
          let recipients = [];
          
          if (recipientStaffIds.length > 0) {
            // Use configured recipient list
            recipients = await Staff.find({
              _id: { $in: recipientStaffIds },
              'emailNotifications.enabled': true,
              'emailNotifications.preferences.appointmentAlerts': true,
              email: { $exists: true, $ne: '' }
            }).lean();
          } else {
            // Fallback: Find all staff with appointment alerts enabled
            console.log('⚠️ No recipient list configured, finding all staff with appointment alerts enabled');
            recipients = await Staff.find({
              branchId: req.user.branchId,
              'emailNotifications.enabled': true,
              'emailNotifications.preferences.appointmentAlerts': true,
              email: { $exists: true, $ne: '' }
            }).lean();
          }
          
          // Also check for admin users (business owners) who should receive notifications
          // Admin users are in the main database, not the business database
          const User = mainConnection.model('User', require('./models/User').schema);
          const adminUsers = await User.find({
            branchId: req.user.branchId,
            role: 'admin',
            email: { $exists: true, $ne: '' }
          }).lean();
          
          console.log(`📧 Found ${adminUsers.length} admin user(s) for business`);
          
          // Add admin users to recipients (they always have notifications enabled)
          let adminCount = 0;
          for (const admin of adminUsers) {
            // Check if admin is already in recipients
            const alreadyInList = recipients.some(r => r.email === admin.email);
            if (!alreadyInList) {
              recipients.push({
                _id: admin._id,
                name: admin.name || `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email,
                email: admin.email,
                role: 'admin',
                emailNotifications: {
                  enabled: true,
                  preferences: {
                    appointmentAlerts: true // Admin users always have this enabled
                  }
                }
              });
              adminCount++;
              console.log(`📧 Added admin user to recipients: ${admin.email} (${admin.name || admin.email})`);
            } else {
              console.log(`📧 Admin user already in recipients: ${admin.email}`);
            }
          }
          
          console.log(`📧 Found ${recipients.length} total recipients for appointment notifications (${recipients.length - adminCount} staff + ${adminCount} admin)`);
          
          if (recipients.length === 0) {
            console.log('⚠️ No recipients found. Reasons:');
            console.log('   - Check if staff have email notifications enabled');
            console.log('   - Check if staff have appointment alerts preference enabled');
            console.log('   - Check if staff have valid email addresses');
            console.log('   - Check if recipient list is configured in business settings');
            console.log('   - Check if admin users have email addresses');
          }
          
          for (const recipient of recipients) {
            try {
              console.log(`📧 Sending appointment notification to: ${recipient.email} (${recipient.name || recipient.role})`);
              
              // Get appointment details for the first appointment (if available)
              const firstAppointment = createdAppointments[0];
              let appointmentDetails = {
                date: firstAppointment?.date,
                time: firstAppointment?.time,
                clientName: null,
                serviceName: null
              };
              
              // Try to get client and service names
              if (firstAppointment) {
                if (firstAppointment.clientId && typeof firstAppointment.clientId === 'object') {
                  appointmentDetails.clientName = firstAppointment.clientId.name;
                }
                if (firstAppointment.serviceId && typeof firstAppointment.serviceId === 'object') {
                  appointmentDetails.serviceName = firstAppointment.serviceId.name;
                }
              }
              
              await emailService.sendAppointmentNotification({
                to: recipient.email,
                appointmentCount: createdAppointments.length,
                businessName: business.name,
                appointmentDetails: appointmentDetails
              });
              console.log(`✅ Appointment notification sent to: ${recipient.email}`);
            } catch (emailError) {
              console.error(`❌ Error sending appointment notification to ${recipient.email}:`, emailError);
              console.error('❌ Error details:', {
                message: emailError.message,
                stack: emailError.stack
              });
            }
          }
        } else {
          console.log('⚠️ Staff appointment notifications are disabled in business settings');
        }
      }
      }
    } catch (emailError) {
      console.error('❌ Error sending appointment email:', emailError);
      console.error('❌ Error stack:', emailError.stack);
      // Don't fail appointment creation if email fails
    }

    // Send WhatsApp appointment confirmation if enabled
    try {
      const whatsappService = require('./services/whatsapp-service');
      await whatsappService.initialize();
      
      if (whatsappService.enabled) {
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const AdminSettings = mainConnection.model('AdminSettings', require('./models/AdminSettings').schema);
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('./models/WhatsAppMessageLog').schema);
        
        const adminSettings = await AdminSettings.getSettings();
        const whatsappEnabled = adminSettings?.notifications?.whatsapp?.enabled === true;
        const adminAppointmentNotificationsEnabled = adminSettings?.notifications?.whatsapp?.appointmentNotifications === true;
        
        console.log('📱 [WhatsApp] Admin WhatsApp enabled:', whatsappEnabled);
        console.log('📱 [WhatsApp] Admin Appointment Notifications enabled:', adminAppointmentNotificationsEnabled);
        
        if (whatsappEnabled && adminAppointmentNotificationsEnabled) {
          const business = await Business.findById(req.user.branchId);
          const rawWhatsappSettings = business?.settings?.whatsappNotificationSettings;
          const whatsappSettings = getWhatsAppSettingsWithDefaults(rawWhatsappSettings);
          const businessWhatsappEnabled = whatsappSettings.enabled === true;
          const appointmentWhatsappEnabled = whatsappSettings.appointmentNotifications?.enabled === true;
          const confirmationsEnabled = whatsappSettings.appointmentNotifications?.confirmations === true;
          
          if (businessWhatsappEnabled && appointmentWhatsappEnabled && confirmationsEnabled) {
            // Check quiet hours
            const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
            const inQuietHours = whatsappService.isQuietHours(quietHours);
            
            if (!inQuietHours) {
              const { Client, Staff } = req.businessModels;
              
              for (const appointment of createdAppointments) {
                // Get client
                let client = null;
                if (appointment.clientId && typeof appointment.clientId === 'object') {
                  client = appointment.clientId;
                } else {
                  const clientId = appointment.clientId?._id || appointment.clientId;
                  if (clientId) {
                    client = await Client.findById(clientId);
                  }
                }
                
                if (client?.phone) {
                  try {
                    // Get service name
                    let serviceName = 'Service';
                    if (appointment.serviceId) {
                      if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) {
                        serviceName = appointment.serviceId.name;
                      } else {
                        const { Service } = req.businessModels;
                        const service = await Service.findById(appointment.serviceId);
                        serviceName = service?.name || 'Service';
                      }
                    }
                    
                    // Get staff name
                    let staffName = 'Not assigned';
                    if (appointment.staffId) {
                      if (typeof appointment.staffId === 'object' && appointment.staffId.name) {
                        staffName = appointment.staffId.name;
                      } else {
                        const staff = await Staff.findById(appointment.staffId);
                        staffName = staff?.name || 'Not assigned';
                      }
                    } else if (appointment.staffAssignments && appointment.staffAssignments.length > 0) {
                      const firstAssignment = appointment.staffAssignments[0];
                      if (firstAssignment.staffId && typeof firstAssignment.staffId === 'object' && firstAssignment.staffId.name) {
                        staffName = firstAssignment.staffId.name;
                      } else if (firstAssignment.staffId) {
                        const staff = await Staff.findById(firstAssignment.staffId);
                        staffName = staff?.name || 'Not assigned';
                      }
                    }
                    
                    const result = await whatsappService.sendAppointmentConfirmation({
                      to: client.phone,
                      clientName: client.name || 'Client',
                      appointmentData: {
                        serviceName: serviceName,
                        date: appointment.date,
                        time: appointment.time,
                        staffName: staffName,
                        businessName: business.name,
                        businessPhone: business.contact?.phone
                      }
                    });
                    
                    // Log to WhatsAppMessageLog
                    await WhatsAppMessageLog.create({
                      businessId: business._id,
                      recipientPhone: client.phone,
                      messageType: 'appointment',
                      status: result.success ? 'sent' : 'failed',
                      msg91Response: result.data || null,
                      relatedEntityId: appointment._id,
                      relatedEntityType: 'Appointment',
                      error: result.error || null,
                      timestamp: new Date()
                    });
                    
                    if (result.success) {
                      // Increment WhatsApp quota usage
                      try {
                        const mainConnection = await databaseManager.getMainConnection();
                        const Business = mainConnection.model('Business', require('./models/Business').schema);
                        await Business.updateOne(
                          { _id: business._id },
                          { $inc: { 'plan.addons.whatsapp.used': 1 } }
                        );
                        console.log(`📊 WhatsApp quota incremented for business: ${business._id}`);
                      } catch (quotaError) {
                        console.error('❌ Error incrementing WhatsApp quota:', quotaError);
                        // Don't fail the appointment if quota increment fails
                      }
                      
                      console.log(`✅ Appointment WhatsApp sent to client: ${client.phone}`);
                    } else {
                      console.error(`❌ Failed to send appointment WhatsApp to ${client.phone}:`, result.error);
                    }
                  } catch (whatsappError) {
                    console.error('❌ Error sending appointment WhatsApp to client:', whatsappError);
                  }
                }
              }
            } else {
              console.log('📱 WhatsApp quiet hours active, skipping appointment message');
            }
          }
        }
      }
    } catch (whatsappError) {
      console.error('Error sending appointment WhatsApp:', whatsappError);
      // Don't fail appointment creation if WhatsApp fails
    }

    res.status(201).json({
      success: true,
      data: createdAppointments,
      message: 'Appointments created successfully'
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create appointment'
    });
  }
});

// Receipts routes
app.get('/api/receipts', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Receipt } = req.businessModels;
    const { page = 1, limit = 10, clientId, date } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let query = {};
    
    if (clientId) {
      query.clientId = clientId;
    }
    
    if (date) {
      query.date = date;
    }

    const totalReceipts = await Receipt.countDocuments(query);
    const receipts = await Receipt.find(query)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: receipts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalReceipts,
        totalPages: Math.ceil(totalReceipts / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching receipts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch receipts'
    });
  }
});

app.post('/api/receipts', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Receipt } = req.businessModels;
    const { clientId, staffId, items, subtotal, tip, discount, tax, total, payments, notes } = req.body;

    if (!clientId || !staffId || !items || !total) {
      return res.status(400).json({
        success: false,
        error: 'Client, staff, items, and total are required'
      });
    }

    // Process items to handle staff contributions
    const processedItems = items.map(item => {
      // If staffContributions is provided, calculate amounts
      if (item.staffContributions && Array.isArray(item.staffContributions)) {
        item.staffContributions = item.staffContributions.map(contribution => ({
          ...contribution,
          amount: (item.total * contribution.percentage) / 100
        }));
      }
      
      // Maintain backward compatibility - if no staffContributions but has staffId/staffName
      if (!item.staffContributions && item.staffId && item.staffName) {
        item.staffContributions = [{
          staffId: item.staffId,
          staffName: item.staffName,
          percentage: 100,
          amount: item.total
        }];
      }
      
      return item;
    });

    const newReceipt = new Receipt({
      receiptNumber: `RCP-${Date.now()}`,
      clientId,
      staffId,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      items: processedItems,
      subtotal: parseFloat(subtotal) || 0,
      tip: parseFloat(tip) || 0,
      discount: parseFloat(discount) || 0,
      tax: parseFloat(tax) || 0,
      total: parseFloat(total),
      payments: payments || [],
      notes,
      branchId: req.user.branchId
    });

    const savedReceipt = await newReceipt.save();

    // Send email notifications if enabled
    try {
      const emailService = require('./services/email-service');
      
      // Ensure email service is initialized
      if (!emailService.initialized) {
        await emailService.initialize();
      }
      
      // Check if email service is enabled (from AdminSettings)
      if (!emailService.enabled) {
        console.log('📧 Email service is disabled, skipping receipt email');
      } else {
        // Get Business from main database (not business database)
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        
        const { Staff, Client } = req.businessModels;
        const business = await Business.findById(req.user.branchId);
        const rawEmailSettings = business?.settings?.emailNotificationSettings;
        
        // Apply defaults to email settings (similar to WhatsApp)
        const emailSettings = getEmailSettingsWithDefaults(rawEmailSettings);
        
        // Check if business has enabled receipt notifications
        // Use merged settings with defaults - defaults to true if not explicitly set to false
        const receiptNotificationsEnabled = emailSettings.receiptNotifications?.enabled === true;
        
        console.log(`📧 Receipt notifications enabled: ${receiptNotificationsEnabled}`, {
          enabled: emailSettings?.receiptNotifications?.enabled,
          sendToClients: emailSettings?.receiptNotifications?.sendToClients
        });
        
        if (receiptNotificationsEnabled) {
          // Send receipt to client if enabled
          const sendToClients = emailSettings?.receiptNotifications?.sendToClients === true;
          if (sendToClients) {
            const client = await Client.findById(clientId);
            if (client?.email) {
            try {
              console.log(`📧 Attempting to send receipt email to: ${client.email}`);
              
              // Try to find related sale by receiptNumber (which might match billNo)
              let receiptLink = null;
              try {
                const { Sale } = req.businessModels;
                const relatedSale = await Sale.findOne({ billNo: savedReceipt.receiptNumber });
                if (relatedSale?.shareToken) {
                  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                  receiptLink = `${frontendUrl}/receipt/public/${relatedSale.billNo}/${relatedSale.shareToken}`;
                  console.log(`✅ Receipt link generated from related sale: ${receiptLink}`);
                } else {
                  console.log('⚠️ No related sale found or sale does not have shareToken');
                }
              } catch (saleLookupError) {
                console.warn('⚠️ Error looking up related sale:', saleLookupError.message);
              }
              
              const emailResult = await emailService.sendReceipt({
                to: client.email,
                clientName: client.name,
                receiptNumber: savedReceipt.receiptNumber,
                receiptData: {
                  businessName: business.name,
                  date: savedReceipt.date,
                  items: savedReceipt.items,
                  subtotal: savedReceipt.subtotal,
                  tax: savedReceipt.tax,
                  discount: savedReceipt.discount,
                  total: savedReceipt.total,
                  paymentMethod: savedReceipt.payments?.[0]?.type || 'N/A'
                },
                receiptLink: receiptLink
              });
              if (emailResult && emailResult.success !== false) {
                console.log(`✅ Receipt email sent to client: ${client.email}`);
              } else {
                console.error(`❌ Failed to send receipt email to ${client.email}:`, emailResult?.error || 'Unknown error');
              }
            } catch (clientEmailError) {
              console.error('❌ Error sending receipt email to client:', clientEmailError);
              console.error('❌ Error details:', {
                message: clientEmailError.message,
                stack: clientEmailError.stack
              });
            }
          }
          
          // Send notification to staff if enabled
          const sendToStaff = emailSettings?.receiptNotifications?.sendToStaff === true;
          if (sendToStaff) {
            const recipientStaffIds = emailSettings.receiptNotifications.recipientStaffIds || [];
            const recipients = await Staff.find({
              _id: { $in: recipientStaffIds },
              'emailNotifications.enabled': true,
              'emailNotifications.preferences.receiptAlerts': true,
              email: { $exists: true, $ne: '' }
            }).lean();
            
            for (const staff of recipients) {
              try {
                await emailService.sendSystemAlert({
                  to: staff.email,
                  alertType: 'Receipt Generated',
                  message: `A new receipt ${savedReceipt.receiptNumber} has been generated for ₹${savedReceipt.total}`,
                  businessName: business.name
                });
                console.log(`✅ Receipt notification sent to staff: ${staff.email}`);
              } catch (staffEmailError) {
                console.error('Error sending receipt notification to staff:', staffEmailError);
              }
            }
          }
        }
      }
      }
    } catch (emailError) {
      console.error('Error sending receipt email:', emailError);
      // Don't fail receipt creation if email fails
    }

    // Send WhatsApp receipt if enabled
    try {
      const whatsappService = require('./services/whatsapp-service');
      await whatsappService.initialize();
      
      if (whatsappService.enabled) {
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const AdminSettings = mainConnection.model('AdminSettings', require('./models/AdminSettings').schema);
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('./models/WhatsAppMessageLog').schema);
        
        const adminSettings = await AdminSettings.getSettings();
        const whatsappEnabled = adminSettings?.notifications?.whatsapp?.enabled === true;
        const adminReceiptNotificationsEnabled = adminSettings?.notifications?.whatsapp?.receiptNotifications === true;
        
        if (whatsappEnabled && adminReceiptNotificationsEnabled) {
          // Use lean() to get plain object so nested objects are accessible
          const business = await Business.findById(req.user.branchId).lean();
          const rawWhatsappSettings = business?.settings?.whatsappNotificationSettings;
          const whatsappSettings = getWhatsAppSettingsWithDefaults(rawWhatsappSettings);
          const businessWhatsappEnabled = whatsappSettings.enabled === true;
          const receiptNotificationsEnabled = whatsappSettings.receiptNotifications?.enabled === true;
          const autoSendEnabled = whatsappSettings.receiptNotifications?.autoSendToClients === true;
          
          if (businessWhatsappEnabled && receiptNotificationsEnabled && autoSendEnabled) {
            // Check quiet hours
            const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
            const inQuietHours = whatsappService.isQuietHours(quietHours);
            
            if (!inQuietHours) {
              const { Client } = req.businessModels;
              const client = await Client.findById(clientId);
              
              if (client?.phone) {
                try {
                  // Get receipt link
                  let receiptLink = null;
                  try {
                    const { Sale } = req.businessModels;
                    const relatedSale = await Sale.findOne({ billNo: savedReceipt.receiptNumber });
                    if (relatedSale?.shareToken) {
                      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                      receiptLink = `${frontendUrl}/receipt/public/${relatedSale.billNo}/${relatedSale.shareToken}`;
                    }
                  } catch (saleLookupError) {
                    console.warn('⚠️ Error looking up related sale for WhatsApp:', saleLookupError.message);
                  }
                  
                  const result = await whatsappService.sendReceipt({
                    to: client.phone,
                    clientName: client.name,
                    receiptNumber: savedReceipt.receiptNumber,
                    receiptData: {
                      businessName: business.name,
                      total: savedReceipt.total
                    },
                    receiptLink: receiptLink
                  });
                  
                  // Log to WhatsAppMessageLog
                  await WhatsAppMessageLog.create({
                    businessId: business._id,
                    recipientPhone: client.phone,
                    messageType: 'receipt',
                    status: result.success ? 'sent' : 'failed',
                    msg91Response: result.data || null,
                    relatedEntityId: savedReceipt._id,
                    relatedEntityType: 'Receipt',
                    error: result.error || null,
                    timestamp: new Date()
                  });
                  
                  if (result.success) {
                    // Increment WhatsApp quota usage
                    try {
                      const mainConnection = await databaseManager.getMainConnection();
                      const Business = mainConnection.model('Business', require('./models/Business').schema);
                      await Business.updateOne(
                        { _id: business._id },
                        { $inc: { 'plan.addons.whatsapp.used': 1 } }
                      );
                      console.log(`📊 WhatsApp quota incremented for business: ${business._id}`);
                    } catch (quotaError) {
                      console.error('❌ Error incrementing WhatsApp quota:', quotaError);
                      // Don't fail the receipt if quota increment fails
                    }
                    
                    console.log(`✅ Receipt WhatsApp sent to client: ${client.phone}`);
                  } else {
                    console.error(`❌ Failed to send receipt WhatsApp to ${client.phone}:`, result.error);
                  }
                } catch (whatsappError) {
                  console.error('❌ Error sending receipt WhatsApp to client:', whatsappError);
                }
              }
            } else {
              console.log('📱 WhatsApp quiet hours active, skipping receipt message');
            }
          }
        }
      }
    } catch (whatsappError) {
      console.error('Error sending receipt WhatsApp:', whatsappError);
      // Don't fail receipt creation if WhatsApp fails
    }

    res.status(201).json({
      success: true,
      data: savedReceipt
    });
  } catch (error) {
    console.error('Error creating receipt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create receipt'
    });
  }
});

// Update appointment
app.put('/api/appointments/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const { Appointment } = req.businessModels;

    // Find the appointment
    const appointment = await Appointment.findById(id)
      .populate('clientId', 'name phone email')
      .populate('serviceId', 'name price duration')
      .populate('staffId', 'name role');
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    // Check if status is being changed to cancelled
    const previousStatus = appointment.status;
    const isBeingCancelled = updateData.status === 'cancelled' && previousStatus !== 'cancelled';
    
    console.log('📧 Appointment Update Check:', {
      appointmentId: id,
      previousStatus: previousStatus,
      newStatus: updateData.status,
      isBeingCancelled: isBeingCancelled
    });

    // Update the appointment
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('clientId', 'name phone email')
    .populate('serviceId', 'name price duration')
    .populate('staffId', 'name role');

    // Send cancellation emails if appointment was cancelled
    if (isBeingCancelled) {
      console.log('📧 Appointment is being cancelled, sending emails...');
      try {
        const emailService = require('./services/email-service');
        
        // Ensure email service is initialized
        if (!emailService.initialized) {
          console.log('📧 Initializing email service...');
          await emailService.initialize();
        }
        
        console.log('📧 Email Service Status:', {
          initialized: emailService.initialized,
          enabled: emailService.enabled
        });
        
        if (emailService.enabled) {
          // Get business info
          const databaseManager = require('./config/database-manager');
          const mainConnection = await databaseManager.getMainConnection();
          const Business = mainConnection.model('Business', require('./models/Business').schema);
          const business = await Business.findById(req.user.branchId);
          
          if (!business) {
            console.error('❌ Business not found for branchId:', req.user.branchId);
          } else {
            console.log('✅ Business found:', business.name);
          }
          
          const emailSettings = business?.settings?.emailNotificationSettings;
          // Default to enabled unless explicitly disabled AND recipient list exists (meaning it was configured)
          const hasRecipientList = emailSettings?.appointmentNotifications?.recipientStaffIds?.length > 0;
          const explicitlyDisabledCancellations = emailSettings?.appointmentNotifications?.cancellations === false;
          const cancellationEnabled = !emailSettings || 
            !emailSettings?.appointmentNotifications ||
            (!explicitlyDisabledCancellations || !hasRecipientList);
          
          console.log('📧 Cancellation Email Settings:', {
            emailSettingsExists: !!emailSettings,
            cancellations: emailSettings?.appointmentNotifications?.cancellations,
            explicitlyDisabledCancellations: explicitlyDisabledCancellations,
            hasRecipientList: hasRecipientList,
            cancellationEnabled: cancellationEnabled
          });
          
          if (cancellationEnabled && updatedAppointment.clientId) {
            const client = updatedAppointment.clientId;
            console.log('📧 Client Check:', {
              clientId: client?._id || client,
              clientName: client?.name,
              clientEmail: client?.email,
              clientIsObject: typeof client === 'object'
            });
            
            const clientEmail = client?.email ? client.email.trim() : null;
            
            if (clientEmail) {
              console.log(`📧 Sending cancellation email to client: ${clientEmail}`);
              
              // Get service name
              let serviceName = 'Service';
              if (updatedAppointment.serviceId) {
                if (typeof updatedAppointment.serviceId === 'object' && updatedAppointment.serviceId.name) {
                  serviceName = updatedAppointment.serviceId.name;
                } else {
                  const Service = req.businessModels.Service;
                  const service = await Service.findById(updatedAppointment.serviceId);
                  serviceName = service?.name || 'Service';
                }
              }
              
              console.log('📧 Cancellation Email Details:', {
                to: clientEmail,
                clientName: client.name || 'Client',
                serviceName: serviceName,
                date: updatedAppointment.date,
                time: updatedAppointment.time,
                businessName: business?.name || 'Business'
              });
              
              const emailResult = await emailService.sendAppointmentCancellation({
                to: clientEmail,
                clientName: client.name || 'Client',
                appointmentData: {
                  serviceName: serviceName,
                  date: updatedAppointment.date,
                  time: updatedAppointment.time,
                  businessName: business?.name || 'Business',
                  businessPhone: business?.contact?.phone || ''
                }
              });
              
              console.log('📧 Cancellation Email Result:', {
                success: emailResult?.success,
                error: emailResult?.error
              });
              
              if (emailResult && emailResult.success !== false) {
                console.log(`✅ Cancellation email sent to client: ${clientEmail}`);
              } else {
                console.error(`❌ Failed to send cancellation email:`, emailResult?.error);
                console.error(`❌ Full error:`, JSON.stringify(emailResult, null, 2));
              }
            } else {
              console.log(`⚠️ Skipping cancellation email - client has no email address`);
              console.log(`   Client ID: ${client?._id || client}`);
              console.log(`   Client Name: ${client?.name || 'Unknown'}`);
            }
          } else {
            if (!cancellationEnabled) {
              console.log('⚠️ Client cancellation emails are disabled in business settings');
            }
            if (!updatedAppointment.clientId) {
              console.log('⚠️ No client found for appointment');
            }
          }
          
          // Send notification to staff/admin about cancellation (use same logic - default to enabled)
          const staffCancellationEnabled = !emailSettings || 
            !emailSettings?.appointmentNotifications ||
            (!explicitlyDisabledCancellations || !hasRecipientList);
          
          console.log('📧 Staff Cancellation Notification Check:', {
            staffCancellationEnabled: staffCancellationEnabled,
            explicitlyDisabledCancellations: explicitlyDisabledCancellations,
            hasRecipientList: hasRecipientList
          });
          
          if (staffCancellationEnabled) {
            const { Staff } = req.businessModels;
            const recipientStaffIds = emailSettings?.appointmentNotifications?.recipientStaffIds || [];
            
            let recipients = [];
            if (recipientStaffIds.length > 0) {
              recipients = await Staff.find({
                _id: { $in: recipientStaffIds },
                'emailNotifications.enabled': true,
                'emailNotifications.preferences.appointmentAlerts': true,
                email: { $exists: true, $ne: '' }
              }).lean();
            } else {
              recipients = await Staff.find({
                branchId: req.user.branchId,
                'emailNotifications.enabled': true,
                'emailNotifications.preferences.appointmentAlerts': true,
                email: { $exists: true, $ne: '' }
              }).lean();
            }
            
            // Add admin users
            const User = mainConnection.model('User', require('./models/User').schema);
            const adminUsers = await User.find({
              branchId: req.user.branchId,
              role: 'admin',
              email: { $exists: true, $ne: '' }
            }).lean();
            
            console.log(`📧 Found ${adminUsers.length} admin user(s) for cancellation notification`);
            
            for (const admin of adminUsers) {
              const alreadyInList = recipients.some(r => r.email === admin.email);
              if (!alreadyInList) {
                recipients.push({
                  _id: admin._id,
                  name: admin.name || `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email,
                  email: admin.email,
                  role: 'admin'
                });
                console.log(`📧 Added admin user to cancellation recipients: ${admin.email}`);
              }
            }
            
            // Send cancellation notification to staff/admin
            // Get service name for staff notifications
            let serviceNameForStaff = 'Service';
            if (updatedAppointment.serviceId) {
              if (typeof updatedAppointment.serviceId === 'object' && updatedAppointment.serviceId.name) {
                serviceNameForStaff = updatedAppointment.serviceId.name;
              } else {
                const Service = req.businessModels.Service;
                const service = await Service.findById(updatedAppointment.serviceId);
                serviceNameForStaff = service?.name || 'Service';
              }
            }
            
            console.log(`📧 Found ${recipients.length} total recipients for cancellation notification`);
            
            for (const recipient of recipients) {
              try {
                console.log(`📧 Sending cancellation notification to: ${recipient.email} (${recipient.name || recipient.role})`);
                await emailService.sendAppointmentCancellationNotification({
                  to: recipient.email,
                  appointmentCount: 1,
                  businessName: business?.name || 'Business',
                  appointmentDetails: {
                    date: updatedAppointment.date,
                    time: updatedAppointment.time,
                    clientName: updatedAppointment.clientId?.name,
                    serviceName: serviceNameForStaff
                  }
                });
                console.log(`✅ Cancellation notification sent to: ${recipient.email}`);
              } catch (error) {
                console.error(`❌ Error sending cancellation notification to ${recipient.email}:`, error);
                console.error(`❌ Error details:`, {
                  message: error.message,
                  stack: error.stack
                });
              }
            }
          } else {
            console.log('⚠️ Staff cancellation notifications are disabled in business settings');
          }
        }
      } catch (emailError) {
        console.error('❌ Error sending cancellation emails:', emailError);
        console.error('❌ Error stack:', emailError.stack);
        // Don't fail the update if email fails
      }
    }

    res.json({
      success: true,
      data: updatedAppointment
    });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update appointment'
    });
  }
});

// Delete appointment
app.delete('/api/appointments/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    const { Appointment } = req.businessModels;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    await Appointment.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Appointment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete appointment'
    });
  }
});

// Get receipts by client ID
app.get('/api/receipts/client/:clientId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  const { clientId } = req.params;
  const { Receipt } = req.businessModels;
  
  try {
    const clientReceipts = await Receipt.find({ clientId }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: clientReceipts
    });
  } catch (error) {
    console.error('Error fetching receipts by client:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client receipts'
    });
  }
});

// Reports routes
app.get('/api/reports/dashboard', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    console.log('🔍 Dashboard stats request for user:', req.user?.email, 'branchId:', req.user?.branchId);
    
    const { Service, Product, Staff, Client, Appointment, Receipt, Sale } = req.businessModels;
    
    // Get counts from business-specific database
    const totalServices = await Service.countDocuments();
    console.log('Total services:', totalServices);
    
    const totalProducts = await Product.countDocuments();
    console.log('Total products:', totalProducts);
    
    const totalStaff = await Staff.countDocuments();
    console.log('Total staff:', totalStaff);
    
    const totalClients = await Client.countDocuments();
    console.log('Total clients:', totalClients);
    
    const totalAppointments = await Appointment.countDocuments();
    console.log('Total appointments:', totalAppointments);
    
    const totalReceipts = await Receipt.countDocuments();
    console.log('Total receipts:', totalReceipts);

    // Calculate total revenue from receipts
    const receipts = await Receipt.find();
    const totalRevenue = receipts.reduce((sum, receipt) => sum + receipt.total, 0);
    console.log('Total revenue:', totalRevenue);

    console.log('✅ Dashboard stats calculated for business:', req.user?.branchId);
    res.json({
      success: true,
      data: {
        totalServices,
        totalProducts,
        totalStaff,
        totalClients,
        totalAppointments,
        totalReceipts,
        totalRevenue
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// --- SALES API ---
app.get('/api/sales', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    console.log('🔍 Sales request for user:', req.user?.email, 'branchId:', req.user?.branchId);
    
    const { Sale, BillEditHistory } = req.businessModels;
    const sales = await Sale.find().sort({ date: -1 }).lean();
    
    // For bills that don't have isEdited set but have edit history, mark them as edited
    if (BillEditHistory) {
      const editedBillIds = await BillEditHistory.distinct('saleId');
      sales.forEach(sale => {
        const saleIdStr = sale._id.toString();
        if (editedBillIds.some(id => id.toString() === saleIdStr) && !sale.isEdited) {
          sale.isEdited = true;
        }
      });
    }
    
    console.log('✅ Sales found:', sales.length);
    res.json({ success: true, data: sales });
  } catch (err) {
    console.error('Error fetching sales:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sales', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    console.log('🔍 Sales POST request received');
    console.log('📋 Request body:', JSON.stringify(req.body, null, 2));
    console.log('👤 User:', req.user);
    console.log('🌐 Request headers:', req.headers);
    console.log('🌐 Request method:', req.method);
    console.log('🌐 Request url:', req.url);
    
    const { Sale, Product, InventoryTransaction, Appointment } = req.businessModels;
    const saleData = req.body;
    
    // Process items to handle staff contributions and ensure productId is preserved
    if (saleData.items && Array.isArray(saleData.items)) {
      saleData.items = saleData.items.map(item => {
        // Ensure productId is preserved and converted to ObjectId if it's a string
        if (item.type === 'product' && item.productId) {
          // Convert string productId to ObjectId if needed
          const mongoose = require('mongoose');
          if (typeof item.productId === 'string' && mongoose.Types.ObjectId.isValid(item.productId)) {
            item.productId = new mongoose.Types.ObjectId(item.productId);
          }
        }
        
        // If staffContributions is provided, calculate amounts
        if (item.staffContributions && Array.isArray(item.staffContributions)) {
          item.staffContributions = item.staffContributions.map(contribution => ({
            ...contribution,
            amount: (item.total * contribution.percentage) / 100
          }));
        }
        
        // Maintain backward compatibility - if no staffContributions but has staffId/staffName
        if (!item.staffContributions && item.staffId && item.staffName) {
          item.staffContributions = [{
            staffId: item.staffId,
            staffName: item.staffName,
            percentage: 100,
            amount: item.total
          }];
        }
        
        return item;
      });
    }
    
    // Add branchId to sale data
    saleData.branchId = req.user.branchId;
    
    const sale = new Sale(saleData);
    await sale.save();
    
    // Reload sale to ensure shareToken is included (generated by pre-save middleware)
    const savedSale = await Sale.findById(sale._id);
    if (!savedSale.shareToken) {
      console.warn('⚠️ Sale saved but shareToken is missing, generating now...');
      const crypto = require('crypto');
      savedSale.shareToken = crypto.randomBytes(32).toString('hex');
      await savedSale.save();
    }

    if (savedSale.appointmentId && String(savedSale.status).toLowerCase() === 'completed') {
      await markAppointmentCompleted(Appointment, savedSale.appointmentId);
    }

    // Track products that had stock updated for low inventory check
    const updatedProductIds = new Set();
    
    // Create inventory transactions for product items
    if (saleData.items && Array.isArray(saleData.items)) {
      for (const item of saleData.items) {
        if (item.type === 'product' && item.productId) {
          try {
            const product = await Product.findById(item.productId);
            if (product) {
              // Update product stock
              const previousStock = product.stock;
              const newStock = previousStock - item.quantity;
              
              await Product.findByIdAndUpdate(item.productId, { stock: newStock });
              
              // Create inventory transaction
              const inventoryTransaction = new InventoryTransaction({
                productId: item.productId,
                productName: item.name,
                transactionType: 'sale',
                quantity: -item.quantity, // Negative for deduction
                previousStock: previousStock,
                newStock: newStock,
                unitCost: item.price,
                totalValue: item.total,
                referenceType: 'sale',
                referenceId: sale._id.toString(),
                referenceNumber: sale.billNo,
                processedBy: saleData.staffName || 'System',
                reason: 'Product sold',
                notes: `Sold to ${saleData.customerName}`,
                transactionDate: new Date()
              });
              
              await inventoryTransaction.save();
              
              // Track product for low inventory check
              updatedProductIds.add(item.productId.toString());
              
              console.log(`✅ Inventory transaction created for product ${item.name}: ${item.quantity} units sold`);
            }
          } catch (inventoryError) {
            console.error('Error creating inventory transaction:', inventoryError);
            // Don't fail the sale if inventory tracking fails
          }
        }
      }
    }
    
    // Check for low inventory after sales (for all products that had stock updated)
    if (updatedProductIds.size > 0) {
      try {
        const { checkAndSendLowInventoryAlerts } = require('./utils/low-inventory-checker');
        // Check all products that had stock updated
        for (const productId of updatedProductIds) {
          await checkAndSendLowInventoryAlerts(req.user.branchId, productId);
        }
      } catch (inventoryCheckError) {
        console.error('❌ Error checking low inventory:', inventoryCheckError);
        // Don't fail the sale if inventory check fails
      }
    }

    console.log('✅ Sale created successfully:', sale._id);
    console.log('📧 Sale customer email check:', {
      customerEmail: sale.customerEmail,
      hasEmail: !!sale.customerEmail,
      customerName: sale.customerName,
      billNo: sale.billNo
    });

    // Track email sending status for response
    let emailStatus = {
      attempted: false,
      sent: false,
      error: null,
      debug: {
        emailServiceEnabled: null,
        receiptNotificationsEnabled: null,
        sendToClients: null,
        hasCustomerEmail: null,
        customerEmail: null
      }
    };

    // Send email notifications if enabled
    try {
      const emailService = require('./services/email-service');
      
      // Ensure email service is initialized
      if (!emailService.initialized) {
        console.log('📧 Email service not initialized, initializing now...');
        await emailService.initialize();
      }
      
      console.log('📧 Email service status:', {
        initialized: emailService.initialized,
        enabled: emailService.enabled,
        provider: emailService.provider
      });
      
      emailStatus.debug.emailServiceEnabled = emailService.enabled;
      
      // Check if email service is enabled (from AdminSettings)
      if (!emailService.enabled) {
        console.log('📧 Email service is disabled, skipping receipt email');
        emailStatus.error = 'Email service is disabled';
      } else {
        // Get Business from main database (not business database)
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        
        const business = await Business.findById(req.user.branchId);
        const rawEmailSettings = business?.settings?.emailNotificationSettings;
        
        // Apply defaults to email settings (similar to WhatsApp)
        const emailSettings = getEmailSettingsWithDefaults(rawEmailSettings);
        
        // Check if business has enabled receipt notifications
        // Use merged settings with defaults - defaults to true if not explicitly set to false
        const receiptNotificationsEnabled = emailSettings.receiptNotifications?.enabled === true;
        
        emailStatus.debug.receiptNotificationsEnabled = receiptNotificationsEnabled;
        emailStatus.debug.hasCustomerEmail = !!sale.customerEmail;
        emailStatus.debug.customerEmail = sale.customerEmail || null;
        emailStatus.debug.emailSettingsExists = !!emailSettings;
        emailStatus.debug.receiptNotificationsExists = !!emailSettings?.receiptNotifications;
        emailStatus.debug.receiptNotificationsEnabledValue = emailSettings?.receiptNotifications?.enabled;
        
        console.log(`📧 Receipt notifications enabled: ${receiptNotificationsEnabled}, emailSettings exists: ${!!emailSettings}, receiptNotifications exists: ${!!emailSettings?.receiptNotifications}, enabled value: ${emailSettings?.receiptNotifications?.enabled}`);
        
        if (!receiptNotificationsEnabled) {
          emailStatus.error = 'Receipt notifications disabled in business settings';
          console.log('📧 Receipt notifications are disabled in business settings');
        } else {
          // Send receipt to client if email exists (default to true if not set)
          const sendToClients = !emailSettings || emailSettings?.receiptNotifications?.sendToClients !== false;
          emailStatus.debug.sendToClients = sendToClients;
          
          console.log(`📧 Email sending check:`, {
            sendToClients,
            hasCustomerEmail: !!sale.customerEmail,
            customerEmail: sale.customerEmail
          });
          if (sendToClients && sale.customerEmail) {
            emailStatus.attempted = true;
            console.log(`📧 Attempting to send receipt email to: ${sale.customerEmail}`);
            try {
              // Calculate subtotal from items
              const subtotal = sale.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;
              
              // Use savedSale (with shareToken) instead of sale
              const saleForEmail = savedSale || sale;
              
              // Generate receipt link using shareToken
              let receiptLink = null;
              if (saleForEmail.shareToken) {
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                receiptLink = `${frontendUrl}/receipt/public/${saleForEmail.billNo}/${saleForEmail.shareToken}`;
                console.log(`✅ Receipt link generated: ${receiptLink}`);
                console.log(`🔍 ShareToken: ${saleForEmail.shareToken.substring(0, 10)}...`);
              } else {
                console.error('❌ Sale does not have shareToken, cannot generate receipt link');
                console.error('❌ Sale data:', {
                  _id: saleForEmail._id,
                  billNo: saleForEmail.billNo,
                  hasShareToken: !!saleForEmail.shareToken
                });
              }
              
              console.log(`📧 Calling emailService.sendReceipt with:`, {
                to: saleForEmail.customerEmail,
                clientName: saleForEmail.customerName,
                receiptNumber: saleForEmail.billNo,
                businessName: business?.name,
                hasReceiptLink: !!receiptLink,
                receiptLink: receiptLink || 'NOT GENERATED'
              });
              
              const emailResult = await emailService.sendReceipt({
                to: saleForEmail.customerEmail,
                clientName: saleForEmail.customerName,
                receiptNumber: saleForEmail.billNo,
                receiptData: {
                  businessName: business?.name || 'Business',
                  date: saleForEmail.date ? new Date(saleForEmail.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                  items: saleForEmail.items || [],
                  subtotal: subtotal,
                  tax: saleForEmail.taxAmount || 0,
                  discount: saleForEmail.discount || 0,
                  total: saleForEmail.netTotal || saleForEmail.grossTotal || 0,
                  paymentMethod: saleForEmail.paymentMode || saleForEmail.paymentHistory?.[0]?.method || 'N/A'
                },
                receiptLink: receiptLink
              });
              
              console.log(`📧 Email result:`, emailResult);
              
              if (emailResult && emailResult.success !== false) {
                console.log(`✅ Receipt email sent to client: ${sale.customerEmail}`);
                emailStatus.sent = true;
              } else {
                console.error(`❌ Failed to send receipt email to ${sale.customerEmail}:`, emailResult?.error || 'Unknown error');
                console.error(`❌ Full email result:`, JSON.stringify(emailResult, null, 2));
                emailStatus.error = emailResult?.error || 'Unknown error';
              }
            } catch (clientEmailError) {
              console.error('❌ Error sending receipt email to client:', clientEmailError);
              console.error('❌ Error details:', {
                message: clientEmailError.message,
                stack: clientEmailError.stack
              });
              emailStatus.error = clientEmailError.message;
            }
          } else {
            emailStatus.error = !sendToClients ? 'Send to clients disabled' : 'No customer email';
          }
        }
      }
    } catch (emailError) {
      console.error('Error sending receipt email:', emailError);
      emailStatus.error = emailError.message;
      // Don't fail sale creation if email fails
    }

    // Send WhatsApp receipt if enabled
    const whatsappStatus = { sent: false, error: null };
    try {
      console.log('📱 [WhatsApp] Starting WhatsApp receipt sending for sale...');
      const whatsappService = require('./services/whatsapp-service');
      await whatsappService.initialize();
      
      console.log('📱 [WhatsApp] Service initialized. Enabled:', whatsappService.enabled);
      
      if (whatsappService.enabled) {
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const AdminSettings = mainConnection.model('AdminSettings', require('./models/AdminSettings').schema);
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('./models/WhatsAppMessageLog').schema);
        
        const adminSettings = await AdminSettings.getSettings();
        const whatsappEnabled = adminSettings?.notifications?.whatsapp?.enabled === true;
        const adminReceiptNotificationsEnabled = adminSettings?.notifications?.whatsapp?.receiptNotifications === true; // Admin master switch
        
        console.log('📱 [WhatsApp] Admin WhatsApp enabled:', whatsappEnabled);
        console.log('📱 [WhatsApp] Admin Receipt Notifications enabled:', adminReceiptNotificationsEnabled);
        
        if (whatsappEnabled && adminReceiptNotificationsEnabled) { // Check admin master switch
          // Use lean() to get plain object so nested objects are accessible
          const business = await Business.findById(req.user.branchId).lean();
          
          // Debug: Log the entire business object structure
          console.log('📱 [WhatsApp] Business object structure:', {
            hasBusiness: !!business,
            hasSettings: !!business?.settings,
            settingsKeys: business?.settings ? Object.keys(business.settings) : [],
            hasWhatsappSettings: !!business?.settings?.whatsappNotificationSettings,
            whatsappSettingsEnabled: business?.settings?.whatsappNotificationSettings?.enabled,
            fullBusinessSettings: JSON.stringify(business?.settings, null, 2)
          });
          
          // Access WhatsApp settings from plain object (accessible with lean())
          // Apply defaults if settings don't exist
          const rawWhatsappSettings = business?.settings?.whatsappNotificationSettings;
          const whatsappSettings = getWhatsAppSettingsWithDefaults(rawWhatsappSettings);
          const businessWhatsappEnabled = whatsappSettings.enabled === true;
          const receiptNotificationsEnabled = whatsappSettings.receiptNotifications?.enabled === true;
          const autoSendEnabled = whatsappSettings.receiptNotifications?.autoSendToClients === true;
          
          console.log('📱 [WhatsApp] Business settings:', {
            businessWhatsappEnabled,
            receiptNotificationsEnabled,
            autoSendEnabled,
            whatsappSettings: JSON.stringify(whatsappSettings, null, 2)
          });
          
          if (businessWhatsappEnabled && receiptNotificationsEnabled && autoSendEnabled) {
            // Check quiet hours
            const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
            const inQuietHours = whatsappService.isQuietHours(quietHours);
            
            console.log('📱 [WhatsApp] Quiet hours check:', { inQuietHours, quietHours });
            
            if (!inQuietHours) {
              // Get client phone number from sale
              const customerPhone = sale?.customerPhone || sale?.customerMobile;
              
              console.log('📱 [WhatsApp] Customer phone from sale:', customerPhone);
              
              if (customerPhone) {
                try {
                  // Generate receipt link for WhatsApp (use savedSale which has shareToken)
                  let whatsappReceiptLink = null;
                  const saleForWhatsapp = savedSale || sale;
                  if (saleForWhatsapp?.shareToken) {
                    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                    whatsappReceiptLink = `${frontendUrl}/receipt/public/${saleForWhatsapp.billNo}/${saleForWhatsapp.shareToken}`;
                    console.log(`📱 [WhatsApp] Receipt link generated: ${whatsappReceiptLink}`);
                  } else {
                    console.warn('⚠️ [WhatsApp] Sale does not have shareToken, receipt link will be null');
                  }
                  
                  const result = await whatsappService.sendReceipt({
                    to: customerPhone,
                    clientName: sale.customerName || 'Customer',
                    receiptNumber: sale.billNo,
                    receiptData: {
                      businessName: business?.name || 'Business',
                      total: sale.netTotal || sale.grossTotal || 0
                    },
                    receiptLink: whatsappReceiptLink
                  });
                  
                  // Log to WhatsAppMessageLog
                  await WhatsAppMessageLog.create({
                    businessId: business._id,
                    recipientPhone: customerPhone,
                    messageType: 'receipt',
                    status: result.success ? 'sent' : 'failed',
                    msg91Response: result.data || null,
                    relatedEntityId: savedSale?._id || sale._id,
                    relatedEntityType: 'Sale',
                    error: result.error || null,
                    timestamp: new Date()
                  });
                  
                  if (result.success) {
                    // Increment WhatsApp quota usage
                    try {
                      const mainConnection = await databaseManager.getMainConnection();
                      const Business = mainConnection.model('Business', require('./models/Business').schema);
                      await Business.updateOne(
                        { _id: business._id },
                        { $inc: { 'plan.addons.whatsapp.used': 1 } }
                      );
                      console.log(`📊 WhatsApp quota incremented for business: ${business._id}`);
                    } catch (quotaError) {
                      console.error('❌ Error incrementing WhatsApp quota:', quotaError);
                      // Don't fail the sale if quota increment fails
                    }
                    
                    if (result.queued) {
                      console.log(`⏳ Sale receipt WhatsApp queued for delivery to client: ${customerPhone}`);
                      console.log(`📱 Request ID: ${result.requestId || 'N/A'}`);
                      console.log(`⚠️ Message is queued. Check MSG91 dashboard for delivery status.`);
                      whatsappStatus.sent = true;
                      whatsappStatus.queued = true;
                      whatsappStatus.requestId = result.requestId;
                      whatsappStatus.message = 'Message queued for delivery. Check MSG91 dashboard for status.';
                    } else {
                      console.log(`✅ Sale receipt WhatsApp sent to client: ${customerPhone}`);
                      whatsappStatus.sent = true;
                    }
                  } else {
                    console.error(`❌ Failed to send sale receipt WhatsApp to ${customerPhone}:`, result.error);
                    whatsappStatus.error = result.error;
                  }
                } catch (whatsappError) {
                  console.error('❌ Error sending sale receipt WhatsApp to client:', whatsappError);
                  console.error('❌ Error stack:', whatsappError.stack);
                  whatsappStatus.error = whatsappError.message;
                }
              } else {
                console.log('📱 [WhatsApp] No customer phone number found in sale');
                whatsappStatus.error = 'No customer phone number';
              }
            } else {
              console.log('📱 [WhatsApp] Quiet hours active, skipping sale receipt message');
              whatsappStatus.error = 'Quiet hours active';
            }
          } else {
            console.log('📱 [WhatsApp] Business WhatsApp settings not enabled:', {
              businessWhatsappEnabled,
              receiptNotificationsEnabled,
              autoSendEnabled
            });
            
            // Provide specific error message
            if (!businessWhatsappEnabled) {
              whatsappStatus.error = 'WhatsApp is not enabled for this business. Please enable it in Business Settings → Notifications → WhatsApp.';
            } else if (!receiptNotificationsEnabled) {
              whatsappStatus.error = 'Receipt notifications are not enabled for this business. Please enable them in Business Settings → Notifications → WhatsApp.';
            } else if (!autoSendEnabled) {
              whatsappStatus.error = 'Auto-send receipts is not enabled for this business. Please enable it in Business Settings → Notifications → WhatsApp.';
            } else {
              whatsappStatus.error = 'WhatsApp notifications disabled for this business or receipt type';
            }
          }
        } else {
          if (!whatsappEnabled) {
            console.log('📱 [WhatsApp] WhatsApp not enabled at admin level');
            whatsappStatus.error = 'WhatsApp not enabled at admin level';
          } else if (!adminReceiptNotificationsEnabled) {
            console.log('📱 [WhatsApp] Receipt notifications not enabled at admin level');
            whatsappStatus.error = 'Receipt notifications not enabled at admin level';
          }
        }
      } else {
        console.log('📱 [WhatsApp] WhatsApp service not configured (enabled=false)');
        whatsappStatus.error = 'WhatsApp service not configured';
      }
    } catch (whatsappError) {
      console.error('❌ [WhatsApp] Error in WhatsApp sending block:', whatsappError);
      console.error('❌ [WhatsApp] Error stack:', whatsappError.stack);
      whatsappStatus.error = whatsappError.message;
      // Don't fail sale creation if WhatsApp fails
    }
    
    console.log('📱 [WhatsApp] Final WhatsApp status:', whatsappStatus);

    res.status(201).json({ 
      success: true, 
      data: savedSale || sale,
      emailStatus: emailStatus, // Include email sending status in response
      whatsappStatus: whatsappStatus // Include WhatsApp sending status in response
    });
  } catch (err) {
    console.error('❌ Sales creation error:', err);
    console.error('❌ Error details:', {
      message: err.message,
      name: err.name,
      stack: err.stack,
      validationErrors: err.errors
    });
    res.status(400).json({ 
      success: false, 
      error: err.message,
      details: err.errors || err.message
    });
  }
});

app.get('/api/sales/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Sale } = req.businessModels;
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    res.json({ success: true, data: sale });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/sales/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
    const { Sale } = req.businessModels;
  
  // For standalone MongoDB, transactions are not supported
  // We'll proceed without transactions - operations will still work
  const session = null;
  const useTransactions = false;
  
  console.log('⚠️ Running PUT /api/sales/:id without transactions (standalone MongoDB)');

  try {
    const {
      Sale,
      Product,
      InventoryTransaction,
      BillEditHistory,
      BillArchive,
    } = req.businessModels;

    const saleId = req.params.id;
    const updateData = req.body || {};

    const existingSale = session 
      ? await Sale.findById(saleId).session(session)
      : await Sale.findById(saleId);
    if (!existingSale) {
      if (useTransactions && session) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    // Archive original bill snapshot once per edit
    try {
      if (BillArchive) {
        await BillArchive.create(
          [
            {
              originalBill: existingSale.toObject(),
              billNo: existingSale.billNo,
              saleId: existingSale._id,
              archivedAt: new Date(),
              archivedBy: req.user?._id || req.user?.id || null,
              archivedByName: req.user?.name || req.user?.firstName || '',
              reason: updateData.editReason || 'Bill edited',
            },
          ],
          session ? { session } : {},
        );
      }
    } catch (archiveError) {
      console.error('⚠️ Failed to archive original bill before edit:', archiveError);
    }

    // Ensure immutable fields are not changed
    const immutableFields = ['billNo', 'customerName', 'customerPhone', 'date', 'time', 'branchId', '_id', 'id'];
    immutableFields.forEach((field) => {
      if (field in updateData && String(updateData[field]) !== String(existingSale[field])) {
        updateData[field] = existingSale[field];
      }
    });

    const originalItems = existingSale.items || [];
    const updatedItems = Array.isArray(updateData.items) ? updateData.items : originalItems;

    // Compute per-product quantity differences between original and updated items
    const productDiffMap = new Map();
    const addToDiff = (productId, deltaQty, name) => {
      if (!productId || !deltaQty) return;
      const key = String(productId);
      const existing = productDiffMap.get(key) || { productId, quantityDelta: 0, name };
      existing.quantityDelta += deltaQty;
      productDiffMap.set(key, existing);
    };

    // Original items: treat as negative (we will add updated later)
    originalItems.forEach((item) => {
      if (item.type === 'product' && item.productId) {
        addToDiff(item.productId, -Number(item.quantity || 0), item.name);
      }
    });

    // Updated items: treat as positive
    updatedItems.forEach((item) => {
      if (item.type === 'product' && item.productId) {
        addToDiff(item.productId, Number(item.quantity || 0), item.name);
      }
    });

    const inventoryChangesForHistory = [];

    // Validate and apply inventory changes
    for (const diff of productDiffMap.values()) {
      const { productId, quantityDelta } = diff;
      if (!quantityDelta) continue;

      const product = session
        ? await Product.findById(productId).session(session)
        : await Product.findById(productId);
      if (!product) {
        // Product was deleted - allow keeping it in the bill but mark as unavailable
        // Don't fail the edit, but log a warning
        console.warn(`⚠️ Product ${productId} (${diff.name}) not found - may have been deleted. Keeping in bill but cannot adjust inventory.`);
        // Skip inventory adjustment for deleted products
        continue;
      }

      // Check if product is active
      if (product.isActive === false) {
        console.warn(`⚠️ Product ${product.name} is inactive. Proceeding with inventory adjustment.`);
      }

      const previousStock = Number(product.stock || 0);
      let newStock = previousStock;

      // quantityDelta > 0 means more units are now part of the bill (stock should decrease)
      // quantityDelta < 0 means fewer units than before (stock should increase)
      if (quantityDelta > 0) {
        if (previousStock < quantityDelta) {
          if (useTransactions && session) {
            await session.abortTransaction();
            session.endSession();
          }
          return res.status(400).json({
            success: false,
            error: `Insufficient stock for product ${product.name}. Available: ${previousStock}, Required additional: ${quantityDelta}`,
          });
        }
        newStock = previousStock - quantityDelta;
      } else if (quantityDelta < 0) {
        newStock = previousStock + Math.abs(quantityDelta);
      }

      product.stock = newStock;
      await product.save({ session });

      // Create inventory transaction to record the adjustment
      const transaction = new InventoryTransaction({
        productId: product._id,
        productName: product.name,
        transactionType: quantityDelta > 0 ? 'sale' : 'return',
        quantity: quantityDelta > 0 ? -quantityDelta : Math.abs(quantityDelta),
        previousStock,
        newStock,
        unitCost: product.price || 0,
        totalValue: Math.abs(quantityDelta * (product.price || 0)),
        referenceType: 'sale',
        referenceId: existingSale._id.toString(),
        referenceNumber: existingSale.billNo,
        processedBy: req.user?.name || req.user?.firstName || existingSale.staffName || 'System',
        reason: quantityDelta > 0 ? 'Bill edit - additional quantity sold' : 'Bill edit - quantity reduced/returned',
        notes: updateData.editReason || 'Bill edited',
        transactionDate: new Date(),
      });

      const savedTransaction = await transaction.save(session ? { session } : {});

      inventoryChangesForHistory.push({
        productId: product._id,
        quantityChange: quantityDelta,
        previousStock,
        newStock,
        transactionIds: [savedTransaction._id],
      });
    }

    // Update editable fields on the sale
    const editableRootFields = [
      'items',
      'netTotal',
      'taxAmount',
      'grossTotal',
      'discount',
      'discountType',
      'notes',
      'paymentStatus',
      // Allow changing how money was paid (cash/card/online) without altering amounts received
      'payments',
      'paymentMode',
      'status', // Allow updating status when payments change
    ];

    editableRootFields.forEach((field) => {
      if (field in updateData) {
        if (field === 'paymentStatus') {
          // Only allow adjusting dueDate and totalAmount; keep paidAmount as is
          const currentPaymentStatus = existingSale.paymentStatus || {};
          const incoming = updateData.paymentStatus || {};
          existingSale.paymentStatus = {
            ...currentPaymentStatus,
            totalAmount: Number(updateData.grossTotal ?? currentPaymentStatus.totalAmount),
            dueDate: incoming.dueDate || currentPaymentStatus.dueDate,
          };
        } else if (field === 'items') {
          existingSale.items = updatedItems;
        } else if (field === 'payments') {
          // Explicitly handle payments array update
          console.log('💳 Updating payments array:', updateData.payments);
          if (Array.isArray(updateData.payments)) {
            existingSale.payments = updateData.payments;
            // Mark the array as modified for Mongoose to save it
            existingSale.markModified('payments');
            console.log('💳 Updated payments on sale:', existingSale.payments);
          }
        } else if (field === 'paymentMode') {
          // Explicitly handle paymentMode update
          console.log('💳 Updating paymentMode:', updateData.paymentMode);
          existingSale.paymentMode = updateData.paymentMode || '';
          console.log('💳 Updated paymentMode on sale:', existingSale.paymentMode);
        } else {
          existingSale[field] = updateData[field];
        }
      }
    });

    // Recalculate paidAmount from payments array if payments were updated
    if (updateData.payments && Array.isArray(updateData.payments)) {
      console.log('💰 Recalculating payment amounts from payments array:', updateData.payments);
      const newPaidAmount = updateData.payments.reduce((sum, payment) => {
        const amount = Number(payment.amount) || 0;
        console.log(`  - Payment: ${payment.mode || payment.type}, Amount: ${amount}`);
        return sum + amount;
      }, 0);
      
      console.log('💰 Calculated newPaidAmount:', newPaidAmount);
      const totalAmount = Number(updateData.grossTotal || existingSale.grossTotal || existingSale.paymentStatus?.totalAmount || 0);
      console.log('💰 Total amount:', totalAmount);
      
      if (!existingSale.paymentStatus) {
        existingSale.paymentStatus = {
          totalAmount: totalAmount,
          paidAmount: newPaidAmount,
          remainingAmount: totalAmount - newPaidAmount,
          dueDate: new Date(),
        };
      } else {
        existingSale.paymentStatus.paidAmount = newPaidAmount;
        existingSale.paymentStatus.totalAmount = totalAmount;
        existingSale.paymentStatus.remainingAmount = totalAmount - newPaidAmount;
      }
      
      console.log('💰 Updated paymentStatus:', existingSale.paymentStatus);
      
      // Update status based on payment
      if (newPaidAmount === 0) {
        existingSale.status = 'unpaid';
      } else if (newPaidAmount >= totalAmount) {
        existingSale.status = 'completed';
      } else {
        existingSale.status = 'partial';
      }
      
      console.log('💰 Updated status:', existingSale.status);
    } else {
      // Ensure paymentStatus totalAmount matches grossTotal (when payments not updated)
      if (!existingSale.paymentStatus) {
        existingSale.paymentStatus = {
          totalAmount: Number(existingSale.grossTotal || 0),
          paidAmount: 0,
          remainingAmount: Number(existingSale.grossTotal || 0),
          dueDate: new Date(),
        };
      } else {
        existingSale.paymentStatus.totalAmount = Number(existingSale.grossTotal || existingSale.paymentStatus.totalAmount || 0);
      }
    }

    const beforeSnapshot = existingSale.toObject();

    // Mark bill as edited
    existingSale.isEdited = true;
    existingSale.editedAt = new Date();

    // Debug: Log what we're about to save
    console.log('💾 About to save sale with:', {
      billNo: existingSale.billNo,
      payments: existingSale.payments,
      paymentMode: existingSale.paymentMode,
      paymentStatus: existingSale.paymentStatus,
      status: existingSale.status
    });

    const savedSale = await existingSale.save(session ? { session } : {});
    
    // Debug: Log what was actually saved
    console.log('✅ Sale saved with:', {
      billNo: savedSale.billNo,
      payments: savedSale.payments,
      paymentMode: savedSale.paymentMode,
      paymentStatus: savedSale.paymentStatus,
      status: savedSale.status
    });

    // Mark linked appointment as completed if now fully paid
    if (savedSale.appointmentId && String(savedSale.status).toLowerCase() === 'completed') {
      const { Appointment } = req.businessModels;
      await markAppointmentCompleted(Appointment, savedSale.appointmentId);
    }

    // Record edit history
    try {
      if (BillEditHistory) {
        await BillEditHistory.create(
          [
            {
              saleId: savedSale._id,
              billNo: savedSale.billNo,
              editedBy: req.user?._id || req.user?.id || null,
              editedByName: req.user?.name || req.user?.firstName || '',
              editDate: new Date(),
              editReason: updateData.editReason || 'Bill edited',
              changes: {
                before: beforeSnapshot,
                after: savedSale.toObject(),
                diff: {}, // For now we store full snapshots; diff can be computed later if needed
              },
              inventoryChanges: inventoryChangesForHistory,
              paymentAdjustments: {
                refundAmount: 0,
                additionalAmount: 0,
                refundMethods: [],
              },
            },
          ],
          session ? { session } : {},
        );
      }
    } catch (historyError) {
      console.error('⚠️ Failed to record bill edit history:', historyError);
    }

    if (useTransactions && session) {
      await session.commitTransaction();
      session.endSession();
    } else if (session) {
      session.endSession();
    }

    res.json({ success: true, data: savedSale });
  } catch (err) {
    console.error('❌ Error updating sale:', err);
    if (useTransactions && session) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    if (session) {
      session.endSession();
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get sales by client name
app.get('/api/sales/client/:clientName', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { clientName } = req.params;
    
    const { Sale } = req.businessModels;
    
    // Search for sales by customer name (case-insensitive)
    const sales = await Sale.find({
      customerName: { $regex: clientName, $options: 'i' }
    }).sort({ date: -1 });
    
    res.json({
      success: true,
      data: sales
    });
  } catch (error) {
    console.error('Error fetching sales by client:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client sales'
    });
  }
});

// Get sales by bill number
app.get('/api/sales/bill/:billNo', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Sale } = req.businessModels;
    const sale = await Sale.findOne({ billNo: req.params.billNo });
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    res.json({ success: true, data: sale });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Public endpoint to get sale by bill number and share token (for SMS sharing)
app.get('/api/public/sales/bill/:billNo/:token', async (req, res) => {
  try {
    const { billNo, token } = req.params;
    
    if (!billNo || !token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Bill number and token are required' 
      });
    }

    // Get main connection to iterate through businesses
    const databaseManager = require('./config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('./models/Business').schema);
    const modelFactory = require('./models/model-factory');
    
    // Get all active businesses
    const businesses = await Business.find({ status: 'active' });
    
    // Search through each business database
    for (const business of businesses) {
      try {
        const businessDb = await databaseManager.getConnection(business._id, mainConnection);
        const businessModels = modelFactory.createBusinessModels(businessDb);
        const { Sale, BusinessSettings } = businessModels;
        
        // Find sale by billNo and shareToken
        const sale = await Sale.findOne({ 
          billNo: billNo,
          shareToken: token 
        });
        
        if (sale) {
          // Found the sale - get business settings
          let businessSettings = await BusinessSettings.findOne();
          if (!businessSettings) {
            // Use business info as fallback
            businessSettings = {
              name: business.name || 'Business',
              address: business.address?.street || '',
              city: business.address?.city || '',
              state: business.address?.state || '',
              zipCode: business.address?.zipCode || '',
              phone: business.contact?.phone || business.phone || '',
              email: business.contact?.email || business.email || '',
              logo: '',
              gstNumber: '',
              currency: 'INR',
              taxRate: 18
            };
          } else {
            // Convert to plain object and include business info
            businessSettings = businessSettings.toObject();
            businessSettings.name = businessSettings.name || business.name || 'Business';
            businessSettings.phone = businessSettings.phone || business.contact?.phone || business.phone || '';
            businessSettings.email = businessSettings.email || business.contact?.email || business.email || '';
          }
          
          // Return sale with business settings
          return res.json({ 
            success: true, 
            data: sale,
            businessSettings: businessSettings
          });
        }
      } catch (businessError) {
        // Continue searching other businesses if one fails
        console.error(`Error searching business ${business.name}:`, businessError.message);
        continue;
      }
    }
    
    // Sale not found
    return res.status(404).json({ 
      success: false, 
      error: 'Receipt not found or invalid token' 
    });
  } catch (err) {
    console.error('Error in public sale endpoint:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve receipt' 
    });
  }
});

// Add payment to a sale
app.post('/api/sales/:id/payment', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, method, notes, collectedBy } = req.body;
    const { Sale, Appointment } = req.businessModels;
    
    if (!amount || !method) {
      return res.status(400).json({ 
        success: false, 
        error: 'Amount and payment method are required' 
      });
    }
    
    const sale = await Sale.findById(id);
    if (!sale) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sale not found' 
      });
    }
    
    // Validate payment amount
    if (amount > sale.paymentStatus.remainingAmount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Payment amount cannot exceed remaining balance' 
      });
    }
    
    // Add payment using the model method
    const paymentData = {
      date: new Date(),
      amount: parseFloat(amount),
      method,
      notes: notes || '',
      collectedBy: collectedBy || req.user.name || 'Staff'
    };
    
    const updatedSale = await sale.addPayment(paymentData);

    if (updatedSale.appointmentId && String(updatedSale.status).toLowerCase() === 'completed') {
      await markAppointmentCompleted(Appointment, updatedSale.appointmentId);
    }
    
    res.json({ 
      success: true, 
      data: updatedSale,
      message: `Payment of ₹${amount} collected successfully`,
      paymentSummary: updatedSale.getPaymentSummary()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get payment summary for a sale
app.get('/api/sales/:id/payment-summary', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { id } = req.params;
    const { Sale } = req.businessModels;
    const sale = await Sale.findById(id);
    
    if (!sale) {
      return res.status(404).json({ 
        success: false, 
        error: 'Sale not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: sale.getPaymentSummary(),
      paymentHistory: sale.paymentHistory
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Exchange products within a sale (bill)
app.post('/api/sales/:id/exchange', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  const { Sale } = req.businessModels;
  const session = await Sale.startSession();
  session.startTransaction();

  try {
    const {
      Product,
      InventoryTransaction,
      BillEditHistory,
      BillArchive,
    } = req.businessModels;

    const saleId = req.params.id;
    const payload = req.body || {};

    const existingSale = await Sale.findById(saleId).session(session);
    if (!existingSale) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }

    // Validation: Require edit reason for exchange
    if (!payload.editReason || payload.editReason.trim() === '') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: 'Exchange reason is required. Please provide a reason for this exchange.',
      });
    }

    // Validation: Check time limit for exchanges (configurable, default 30 days)
    const billDate = new Date(existingSale.date);
    const daysSinceBill = Math.floor((new Date().getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
    const maxExchangeDays = 30; // Can be made configurable per business
    if (daysSinceBill > maxExchangeDays) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: `This bill is ${daysSinceBill} days old. Exchanges are only allowed within ${maxExchangeDays} days of purchase.`,
      });
    }

    const updatedItems = Array.isArray(payload.items) ? payload.items : existingSale.items || [];

    // Archive original bill snapshot once per exchange
    try {
      if (BillArchive) {
        await BillArchive.create(
          [
            {
              originalBill: existingSale.toObject(),
              billNo: existingSale.billNo,
              saleId: existingSale._id,
              archivedAt: new Date(),
              archivedBy: req.user?._id || req.user?.id || null,
              archivedByName: req.user?.name || req.user?.firstName || '',
              reason: payload.editReason || 'Bill exchanged',
            },
          ],
          session ? { session } : {},
        );
      }
    } catch (archiveError) {
      console.error('⚠️ Failed to archive original bill before exchange:', archiveError);
    }

    const originalItems = existingSale.items || [];

    // Compute product quantity differences
    const productDiffMap = new Map();
    const addToDiff = (productId, deltaQty, name) => {
      if (!productId || !deltaQty) return;
      const key = String(productId);
      const existing = productDiffMap.get(key) || { productId, quantityDelta: 0, name };
      existing.quantityDelta += deltaQty;
      productDiffMap.set(key, existing);
    };

    originalItems.forEach((item) => {
      if (item.type === 'product' && item.productId) {
        addToDiff(item.productId, -Number(item.quantity || 0), item.name);
      }
    });

    updatedItems.forEach((item) => {
      if (item.type === 'product' && item.productId) {
        addToDiff(item.productId, Number(item.quantity || 0), item.name);
      }
    });

    const inventoryChangesForHistory = [];

    for (const diff of productDiffMap.values()) {
      const { productId, quantityDelta } = diff;
      if (!quantityDelta) continue;

      const product = await Product.findById(productId).session(session);
      if (!product) {
        // Product was deleted - allow keeping it in the bill but mark as unavailable
        console.warn(`⚠️ Product ${productId} (${diff.name}) not found during exchange - may have been deleted. Keeping in bill but cannot adjust inventory.`);
        // Skip inventory adjustment for deleted products
        continue;
      }

      // Check if product is active
      if (product.isActive === false) {
        console.warn(`⚠️ Product ${product.name} is inactive during exchange. Proceeding with inventory adjustment.`);
      }

      const previousStock = Number(product.stock || 0);
      let newStock = previousStock;

      if (quantityDelta > 0) {
        if (previousStock < quantityDelta) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            error: `Insufficient stock for product ${product.name}. Available: ${previousStock}, Required additional: ${quantityDelta}`,
          });
        }
        newStock = previousStock - quantityDelta;
      } else if (quantityDelta < 0) {
        newStock = previousStock + Math.abs(quantityDelta);
      }

      product.stock = newStock;
      await product.save({ session });

      const transaction = new InventoryTransaction({
        productId: product._id,
        productName: product.name,
        transactionType: quantityDelta > 0 ? 'sale' : 'return',
        quantity: quantityDelta > 0 ? -quantityDelta : Math.abs(quantityDelta),
        previousStock,
        newStock,
        unitCost: product.price || 0,
        totalValue: Math.abs(quantityDelta * (product.price || 0)),
        referenceType: 'sale',
        referenceId: existingSale._id.toString(),
        referenceNumber: existingSale.billNo,
        processedBy: req.user?.name || req.user?.firstName || existingSale.staffName || 'System',
        reason: quantityDelta > 0 ? 'Bill exchange - additional quantity sold' : 'Bill exchange - quantity returned',
        notes: payload.editReason || 'Bill exchanged',
        transactionDate: new Date(),
      });

      const savedTransaction = await transaction.save(session ? { session } : {});

      inventoryChangesForHistory.push({
        productId: product._id,
        quantityChange: quantityDelta,
        previousStock,
        newStock,
        transactionIds: [savedTransaction._id],
      });
    }

    // Update sale with provided financials (frontend is responsible for recalculation)
    const beforeSnapshot = existingSale.toObject();

    existingSale.items = updatedItems;
    if (typeof payload.netTotal === 'number') existingSale.netTotal = payload.netTotal;
    if (typeof payload.taxAmount === 'number') existingSale.taxAmount = payload.taxAmount;
    if (typeof payload.grossTotal === 'number') existingSale.grossTotal = payload.grossTotal;
    if (typeof payload.discount === 'number') existingSale.discount = payload.discount;
    if (payload.discountType) existingSale.discountType = payload.discountType;
    if (payload.notes) existingSale.notes = payload.notes;

    if (!existingSale.paymentStatus) {
      existingSale.paymentStatus = {
        totalAmount: Number(existingSale.grossTotal || 0),
        paidAmount: 0,
        remainingAmount: Number(existingSale.grossTotal || 0),
        dueDate: new Date(),
      };
    } else {
      existingSale.paymentStatus.totalAmount = Number(existingSale.grossTotal || existingSale.paymentStatus.totalAmount || 0);
    }

    const savedSale = await existingSale.save(session ? { session } : {});

    try {
      if (BillEditHistory) {
        await BillEditHistory.create(
          [
            {
              saleId: savedSale._id,
              billNo: savedSale.billNo,
              editedBy: req.user?._id || req.user?.id || null,
              editedByName: req.user?.name || req.user?.firstName || '',
              editDate: new Date(),
              editReason: payload.editReason || 'Bill exchanged',
              changes: {
                before: beforeSnapshot,
                after: savedSale.toObject(),
                diff: {},
              },
              inventoryChanges: inventoryChangesForHistory,
              paymentAdjustments: {
                refundAmount: 0,
                additionalAmount: 0,
                refundMethods: [],
              },
            },
          ],
          session ? { session } : {},
        );
      }
    } catch (historyError) {
      console.error('⚠️ Failed to record bill exchange history:', historyError);
    }

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, data: savedSale });
  } catch (err) {
    console.error('❌ Error exchanging products in sale:', err);
    try {
      await session.abortTransaction();
    } catch {
      // ignore
    }
    session.endSession();
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get unpaid/overdue bills
app.get('/api/sales/unpaid/overdue', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    const { Sale } = req.businessModels;
    
    const unpaidBills = await Sale.find({
      status: { $in: ['unpaid', 'partial', 'overdue', 'Unpaid', 'Partial', 'Overdue'] }
    })
    .sort({ 'paymentStatus.dueDate': 1, date: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    const total = await Sale.countDocuments({
      status: { $in: ['unpaid', 'partial', 'overdue', 'Unpaid', 'Partial', 'Overdue'] }
    });
    
    res.json({
      success: true,
      data: unpaidBills,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- EXPENSES API ---
app.get('/api/expenses', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { Expense } = req.businessModels;
    const { page = 1, limit = 100, search, dateFrom, dateTo, category, paymentMethod } = req.query;
    
    let query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Date range filter
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }
    
    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }
    
    // Payment method filter
    if (paymentMethod && paymentMethod !== 'all') {
      query.paymentMode = paymentMethod;
    }
    
    const skip = (page - 1) * limit;
    const expenses = await Expense.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Expense.countDocuments(query);
    
    res.json({
      success: true,
      data: expenses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/expenses', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { Expense } = req.businessModels;
    const expenseData = {
      ...req.body,
      createdBy: req.user.id,
      branchId: req.user.branchId
    };
    
    const expense = new Expense(expenseData);
    await expense.save();
    
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/expenses/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { Expense } = req.businessModels;
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/expenses/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { Expense } = req.businessModels;
    const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, data: expense });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/expenses/:id', authenticateToken, setupBusinessDatabase, requireManager, async (req, res) => {
  try {
    const { Expense } = req.businessModels;
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- BUSINESS SETTINGS API ---
app.get("/api/settings/business", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    console.log('🔍 Business settings request for user:', req.user?.email, 'branchId:', req.user?.branchId);
    
    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      // Create default settings if none exist
      settings = new BusinessSettings({
        name: "Glamour Salon & Spa",
        email: "info@glamoursalon.com",
        phone: "(555) 123-4567",
        website: "www.glamoursalon.com",
        description: "Premium salon and spa services in the heart of the city",
        address: "123 Beauty Street",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        receiptPrefix: "INV",
        invoicePrefix: "INV",
        receiptNumber: 1,
        autoIncrementReceipt: true,
        currency: "INR",
        taxRate: 8.25,
        processingFee: 2.9,
        enableCurrency: true,
        enableTax: true,
        enableProcessingFees: true,
        socialMedia: "@glamoursalon",
        branchId: req.user.branchId
      });
      await settings.save();
    }

    console.log('✅ Business settings found:', settings.name);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error("Get business settings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

app.put("/api/settings/business", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    console.log('📝 Business settings update request received for user:', req.user?.email, 'branchId:', req.user?.branchId);
    console.log('📊 Request body size:', JSON.stringify(req.body).length, 'characters');
    
    const { BusinessSettings } = req.businessModels;
    const {
      name,
      email,
      phone,
      website,
      description,
      address,
      city,
      state,
      zipCode,
      socialMedia,
      logo,
      gstNumber
    } = req.body;
    
    console.log('🖼️ Logo data length:', logo ? logo.length : 0, 'characters');
    console.log('🧾 GST Number:', gstNumber);

    // Validate required fields
    if (!name || !email || !phone || !address || !city || !state || !zipCode) {
      return res.status(400).json({
        success: false,
        error: "Required fields are missing"
      });
    }

    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      settings = new BusinessSettings();
    }

    // Update settings
    settings.name = name;
    settings.email = email;
    settings.phone = phone;
    settings.website = website || "";
    settings.description = description || "";
    settings.address = address;
    settings.city = city;
    settings.state = state;
    settings.zipCode = zipCode;
    settings.socialMedia = socialMedia || "@glamoursalon";
    settings.logo = logo || "";
    settings.gstNumber = gstNumber || "";

    await settings.save();

    console.log('✅ Business settings updated for:', settings.name);
    res.json({
      success: true,
      data: settings,
      message: "Business settings updated successfully"
    });
  } catch (error) {
    console.error("❌ Update business settings error:", error);
    console.error("❌ Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message
    });
  }
});

// Test endpoint to check authentication
app.get("/api/test-auth", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Authentication working",
    user: {
      id: req.user._id,
      email: req.user.email,
      branchId: req.user.branchId,
      role: req.user.role
    }
  });
});

// Test endpoint to check business database setup
app.get("/api/test-business-db", authenticateToken, setupBusinessDatabase, (req, res) => {
  res.json({
    success: true,
    message: "Business database setup working",
    user: {
      id: req.user._id,
      email: req.user.email,
      branchId: req.user.branchId,
      role: req.user.role
    },
    businessModels: Object.keys(req.businessModels || {})
  });
});

// Test endpoint to verify logging is working
app.post("/api/test-increment", authenticateToken, async (req, res) => {
  console.log('🧪 ===== TEST INCREMENT ENDPOINT CALLED =====');
  console.log('🧪 User:', req.user);
  res.json({ success: true, message: "Test endpoint working", user: req.user });
});

// API to increment receipt number atomically
app.post("/api/settings/business/increment-receipt", authenticateToken, async (req, res) => {
  try {
    console.log('🔢 ===== INCREMENT RECEIPT ENDPOINT CALLED =====');
    console.log('🔢 Increment receipt number request received');
    console.log('👤 User:', req.user?.email, 'Branch:', req.user?.branchId);

    // Set up business database manually to avoid middleware issues
    const businessId = req.user?.branchId;
    if (!businessId) {
      console.error('❌ Business ID not found in user data');
      return res.status(400).json({
        success: false,
        error: 'Business ID not found in user data'
      });
    }

    console.log('🔍 Getting business connection for ID:', businessId);
    let businessConnection;
    try {
      // Get main connection to look up business code
      const mainConnection = await databaseManager.getMainConnection();
      businessConnection = await databaseManager.getConnection(businessId, mainConnection);
    } catch (connectionError) {
      console.error('❌ Error getting business connection:', connectionError);
      return res.status(500).json({
        success: false,
        error: 'Failed to connect to business database',
        details: connectionError.message
      });
    }
    console.log('🔍 Business connection obtained:', !!businessConnection);

    let businessModels;
    try {
      businessModels = modelFactory.createBusinessModels(businessConnection);
    } catch (modelsError) {
      console.error('❌ Error creating business models:', modelsError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create business models',
        details: modelsError.message
      });
    }
    console.log('🔍 Business models created:', Object.keys(businessModels));

    const { BusinessSettings, Sale } = businessModels;
    
    if (!BusinessSettings) {
      console.error('❌ BusinessSettings model not found in businessModels');
      return res.status(500).json({
        success: false,
        error: 'BusinessSettings model not available'
      });
    }
    
    // Atomically increment receipt number to prevent race conditions
    console.log('🔍 Atomically incrementing receipt number...');
    
    // First, ensure settings exist
    let settings = await BusinessSettings.findOne();
    if (!settings) {
      console.log('❌ Business settings not found, creating new one');
      console.log('📝 Creating with branchId:', businessId);
      settings = new BusinessSettings({
        branchId: businessId,
        receiptNumber: 0
      });
      try {
        await settings.save();
      } catch (createError) {
        console.error('❌ Error creating settings:', createError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create business settings',
          details: createError.message
        });
      }
    } else if (!settings.branchId) {
      // Ensure existing settings have branchId (for backward compatibility)
      console.log('⚠️ Existing settings missing branchId, adding it now');
      settings.branchId = businessId;
      await settings.save();
    }

    // Use findOneAndUpdate with $inc for atomic increment
    const updatedSettings = await BusinessSettings.findOneAndUpdate(
      { _id: settings._id },
      { $inc: { receiptNumber: 1 } },
      { new: true } // Return the updated document
    );

    if (!updatedSettings) {
      console.error('❌ Failed to atomically increment receipt number');
      return res.status(500).json({
        success: false,
        error: 'Failed to increment receipt number'
      });
    }

    const newReceiptNumber = updatedSettings.receiptNumber;
    console.log('📊 Atomically incremented to:', newReceiptNumber);

    // Check if receipt number already exists (duplicate prevention)
    const prefix = updatedSettings.invoicePrefix || updatedSettings.receiptPrefix || "INV";
    let formattedReceiptNumber = `${prefix}-${newReceiptNumber.toString().padStart(6, '0')}`;

    console.log('🔍 Checking for duplicate receipt number:', formattedReceiptNumber);

    let existingSale = await Sale.findOne({ billNo: formattedReceiptNumber });

    if (existingSale) {
      console.log('⚠️ Duplicate receipt number found, finding next available');
      // If duplicate exists, find the next available number
      let nextNumber = newReceiptNumber + 1;
      let nextFormattedNumber = `${prefix}-${nextNumber.toString().padStart(6, '0')}`;

      // Set a reasonable limit to prevent infinite loops
      let attempts = 0;
      const maxAttempts = 1000;

      while (attempts < maxAttempts && await Sale.findOne({ billNo: nextFormattedNumber })) {
        nextNumber++;
        nextFormattedNumber = `${prefix}-${nextNumber.toString().padStart(6, '0')}`;
        attempts++;
      }

      if (attempts >= maxAttempts) {
        console.error('❌ Could not find available receipt number after', maxAttempts, 'attempts');
        return res.status(500).json({
          success: false,
          error: 'Could not find available receipt number. Please contact support.'
        });
      }

      // Update to the next available number
      await BusinessSettings.findOneAndUpdate(
        { _id: settings._id },
        { receiptNumber: nextNumber }
      );

      formattedReceiptNumber = nextFormattedNumber;
      console.log('✅ Using next available receipt number:', nextNumber);
    } else {
      console.log('✅ Using incremented receipt number:', newReceiptNumber);
    }

    // Extract the final number from the formatted receipt number
    const finalReceiptNumber = parseInt(formattedReceiptNumber.split('-').pop() || '0');

    res.json({
      success: true,
      data: { 
        receiptNumber: finalReceiptNumber,
        formattedReceiptNumber: formattedReceiptNumber
      },
      message: "Receipt number incremented successfully"
    });
  } catch (error) {
    console.error("❌ Increment receipt number error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message
    });
  }
});

// POS Settings API
app.get("/api/settings/pos", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        error: "Business settings not found"
      });
    }

    console.log('=== POS SETTINGS DEBUG ===')
    console.log('Full settings object:', settings)
    console.log('settings.invoicePrefix:', settings.invoicePrefix)
    console.log('settings.receiptPrefix:', settings.receiptPrefix)
    console.log('settings.receiptNumber:', settings.receiptNumber)

    // Return the NEXT receipt number (current + 1) for display
    const nextReceiptNumber = (settings.receiptNumber || 0) + 1;

    res.json({
      success: true,
      data: {
        invoicePrefix: settings.invoicePrefix || "INV",
        receiptNumber: nextReceiptNumber,
        autoResetReceipt: settings.autoResetReceipt || false
      }
    });
  } catch (error) {
    console.error("Get POS settings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

app.put("/api/settings/pos", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { invoicePrefix, autoResetReceipt } = req.body;

    console.log('=== UPDATE POS SETTINGS DEBUG ===')
    console.log('Request body:', req.body)
    console.log('invoicePrefix from request:', invoicePrefix)
    console.log('autoResetReceipt from request:', autoResetReceipt)

    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        error: "Business settings not found"
      });
    }

    console.log('Settings before update:', {
      invoicePrefix: settings.invoicePrefix,
      receiptPrefix: settings.receiptPrefix,
      receiptNumber: settings.receiptNumber
    })

    // Update POS settings
    settings.invoicePrefix = invoicePrefix || "INV";
    settings.autoResetReceipt = autoResetReceipt || false;

    await settings.save();

    console.log('Settings after update:', {
      invoicePrefix: settings.invoicePrefix,
      receiptPrefix: settings.receiptPrefix,
      receiptNumber: settings.receiptNumber
    })

    res.json({
      success: true,
      data: settings,
      message: "POS settings updated successfully"
    });
  } catch (error) {
    console.error("Update POS settings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

app.post("/api/settings/pos/reset-sequence", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        error: "Business settings not found"
      });
    }

    // Reset receipt number to 0 (so next bill will be 1)
    settings.receiptNumber = 0;
    await settings.save();

    res.json({
      success: true,
      data: { receiptNumber: settings.receiptNumber },
      message: "Receipt sequence reset successfully. Next receipt will be 1."
    });
  } catch (error) {
    console.error("Reset receipt sequence error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

// --- PAYMENT SETTINGS API ---
app.get("/api/settings/payment", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { BusinessSettings } = req.businessModels;
    let settings = await BusinessSettings.findOne();
    
    // If no settings exist, create default settings
    if (!settings) {
      console.log("📝 No business settings found, creating default settings...");
      const branchId = req.user?.branchId;
      
      if (!branchId) {
        return res.status(400).json({
          success: false,
          error: "Business ID not found in user data"
        });
      }
      
      settings = new BusinessSettings({
        name: "Ease My Salon",
        email: req.user?.email || "info@easemysalon.in",
        phone: "",
        website: "",
        description: "",
        address: "",
        city: "",
        state: "",
        zipCode: "",
        receiptPrefix: "INV",
        invoicePrefix: "INV",
        receiptNumber: 1,
        autoIncrementReceipt: true,
        currency: "INR",
        taxRate: 8.25,
        processingFee: 2.9,
        enableCurrency: true,
        enableTax: true,
        enableProcessingFees: true,
        taxType: "gst",
        cgstRate: 9,
        sgstRate: 9,
        igstRate: 18,
        serviceTaxRate: 5,
        productTaxRate: 18,
        essentialProductRate: 5,
        intermediateProductRate: 12,
        standardProductRate: 18,
        luxuryProductRate: 28,
        exemptProductRate: 0,
        taxCategories: [
          { id: "essential", name: "Essential Products", rate: 5 },
          { id: "intermediate", name: "Intermediate Products", rate: 12 },
          { id: "standard", name: "Standard Products", rate: 18 },
          { id: "luxury", name: "Luxury Products", rate: 28 },
          { id: "exempt", name: "Exempt Products", rate: 0 }
        ],
        socialMedia: "",
        logo: "",
        gstNumber: "",
        autoResetReceipt: false,
        resetFrequency: "monthly",
        branchId: branchId
      });
      await settings.save();
      console.log("✅ Default business settings created");
    }

    // Build tax categories array from settings
    let taxCategories = []
    if (settings.taxCategories && Array.isArray(settings.taxCategories) && settings.taxCategories.length > 0) {
      taxCategories = settings.taxCategories
    } else {
      // Fallback: Create categories from individual rate fields (backward compatibility)
      if (settings.essentialProductRate !== undefined) {
        taxCategories.push({ id: "essential", name: "Essential Products", rate: settings.essentialProductRate || 5 })
      }
      if (settings.intermediateProductRate !== undefined) {
        taxCategories.push({ id: "intermediate", name: "Intermediate Products", rate: settings.intermediateProductRate || 12 })
      }
      if (settings.standardProductRate !== undefined) {
        taxCategories.push({ id: "standard", name: "Standard Products", rate: settings.standardProductRate || 18 })
      }
      if (settings.luxuryProductRate !== undefined) {
        taxCategories.push({ id: "luxury", name: "Luxury Products", rate: settings.luxuryProductRate || 28 })
      }
      if (settings.exemptProductRate !== undefined) {
        taxCategories.push({ id: "exempt", name: "Exempt Products", rate: settings.exemptProductRate || 0 })
      }
      
      // If still no categories, use defaults
      if (taxCategories.length === 0) {
        taxCategories = [
          { id: "essential", name: "Essential Products", rate: 5 },
          { id: "intermediate", name: "Intermediate Products", rate: 12 },
          { id: "standard", name: "Standard Products", rate: 18 },
          { id: "luxury", name: "Luxury Products", rate: 28 },
          { id: "exempt", name: "Exempt Products", rate: 0 }
        ]
      }
    }

    res.json({
      success: true,
      data: {
        currency: settings.currency || "INR",
        taxRate: settings.taxRate || 8.25,
        processingFee: settings.processingFee || 2.9,
        enableCurrency: settings.enableCurrency !== false,
        enableTax: settings.enableTax !== false,
        enableProcessingFees: settings.enableProcessingFees !== false,
        taxType: settings.taxType || "gst",
        cgstRate: settings.cgstRate || 9,
        sgstRate: settings.sgstRate || 9,
        igstRate: settings.igstRate || 18,
        serviceTaxRate: settings.serviceTaxRate || 5,
        productTaxRate: settings.productTaxRate || 18,
        essentialProductRate: settings.essentialProductRate || 5,
        intermediateProductRate: settings.intermediateProductRate || 12,
        standardProductRate: settings.standardProductRate || 18,
        luxuryProductRate: settings.luxuryProductRate || 28,
        exemptProductRate: settings.exemptProductRate || 0,
        taxCategories: taxCategories
      }
    });
  } catch (error) {
    console.error("Get payment settings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

app.put("/api/settings/payment", authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { 
      currency, 
      taxRate, 
      processingFee, 
      enableCurrency, 
      enableTax, 
      enableProcessingFees,
      taxType,
      cgstRate,
      sgstRate,
      igstRate,
      serviceTaxRate,
      productTaxRate,
      essentialProductRate,
      intermediateProductRate,
      standardProductRate,
      luxuryProductRate,
      exemptProductRate,
      taxCategories
    } = req.body;
    const { BusinessSettings } = req.businessModels;

    let settings = await BusinessSettings.findOne();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        error: "Business settings not found"
      });
    }

    // Update payment settings
    if (currency !== undefined) settings.currency = currency;
    if (taxRate !== undefined) settings.taxRate = taxRate;
    if (processingFee !== undefined) settings.processingFee = processingFee;
    if (enableCurrency !== undefined) settings.enableCurrency = enableCurrency;
    if (enableTax !== undefined) settings.enableTax = enableTax;
    if (enableProcessingFees !== undefined) settings.enableProcessingFees = enableProcessingFees;
    
    // Update tax settings
    if (taxType !== undefined) settings.taxType = taxType;
    if (cgstRate !== undefined) settings.cgstRate = cgstRate;
    if (sgstRate !== undefined) settings.sgstRate = sgstRate;
    if (igstRate !== undefined) settings.igstRate = igstRate;
    if (serviceTaxRate !== undefined) settings.serviceTaxRate = serviceTaxRate;
    if (productTaxRate !== undefined) settings.productTaxRate = productTaxRate;
    if (essentialProductRate !== undefined) settings.essentialProductRate = essentialProductRate;
    if (intermediateProductRate !== undefined) settings.intermediateProductRate = intermediateProductRate;
    if (standardProductRate !== undefined) settings.standardProductRate = standardProductRate;
    if (luxuryProductRate !== undefined) settings.luxuryProductRate = luxuryProductRate;
    if (exemptProductRate !== undefined) settings.exemptProductRate = exemptProductRate;
    if (taxCategories !== undefined && Array.isArray(taxCategories)) {
      settings.taxCategories = taxCategories;
    }

    await settings.save();

    res.json({
      success: true,
      data: settings,
      message: "Payment settings updated successfully"
    });
  } catch (error) {
    console.error("Update payment settings error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

app.delete('/api/sales/:id', authenticateToken, setupBusinessDatabase, requireAdmin, async (req, res) => {
    const { Sale } = req.businessModels;
  
  // For standalone MongoDB, transactions are not supported
  // We'll proceed without transactions - operations will still work
  // All operations will execute individually without atomic rollback
  const session = null;
  const useTransactions = false;
  
  console.log('⚠️ Running DELETE without transactions (standalone MongoDB)');

  try {
    const {
      Sale,
      Product,
      InventoryTransaction,
      BillArchive,
    } = req.businessModels;

    const saleId = req.params.id;
    console.log(`🗑️ DELETE /api/sales/${saleId} - Starting deletion process`);
    const sale = session
      ? await Sale.findById(saleId).session(session)
      : await Sale.findById(saleId);
    if (!sale) {
      console.error(`❌ Sale not found: ${saleId}`);
      if (useTransactions && session) {
        await session.abortTransaction();
        session.endSession();
      }
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    console.log(`✅ Sale found: ${sale.billNo}, items count: ${sale.items?.length || 0}`);

    // Archive bill before deletion
    try {
      if (BillArchive) {
        await BillArchive.create(
          [
            {
              originalBill: sale.toObject(),
              billNo: sale.billNo,
              saleId: sale._id,
              archivedAt: new Date(),
              archivedBy: req.user?._id || req.user?.id || null,
              archivedByName: req.user?.name || req.user?.firstName || '',
              reason: 'Bill deleted',
            },
          ],
          session ? { session } : {},
        );
      }
    } catch (archiveError) {
      console.error('⚠️ Failed to archive bill before deletion:', archiveError);
    }

    // Restore inventory for all product items
    const inventoryChanges = [];
    const productItems = (sale.items || []).filter(item => item.type === 'product');
    console.log(`\n🗑️ ========== DELETING BILL ${sale.billNo} ==========`);
    console.log(`📊 Total items: ${sale.items?.length || 0}, Products: ${productItems.length}`);
    console.log(`📋 Full bill items structure:`, JSON.stringify(sale.items, null, 2));
    console.log(`🔍 Sale object keys:`, Object.keys(sale.toObject ? sale.toObject() : sale));
    
    for (const item of sale.items || []) {
      console.log(`  📦 Checking item: ${item.name}, type: ${item.type}, productId: ${item.productId || 'MISSING'}, quantity: ${item.quantity}`);
      
      // Skip if not a product or missing required fields
      if (item.type !== 'product') {
        console.log(`  ⏭️ Skipping ${item.name} - not a product`);
        continue;
      }
      
      if (!item.productId) {
        console.warn(`  ⚠️ Missing productId for ${item.name}. Trying to find by name...`);
        // Try to find product by name as fallback (case-insensitive, partial match)
        const productByName = session
          ? await Product.findOne({ 
              name: { $regex: new RegExp(`^${item.name}$`, 'i') } 
            }).session(session)
          : await Product.findOne({ 
              name: { $regex: new RegExp(`^${item.name}$`, 'i') } 
            });
        
        if (!productByName) {
          // Try partial match
          const productByPartialName = session
            ? await Product.findOne({ 
                name: { $regex: item.name, $options: 'i' } 
              }).session(session)
            : await Product.findOne({ 
                name: { $regex: item.name, $options: 'i' } 
              });
          
          if (productByPartialName) {
            console.log(`  ✅ Found product by partial name match: ${productByPartialName._id} (${productByPartialName.name})`);
            item.productId = productByPartialName._id;
          } else {
            console.warn(`  ❌ Cannot restore inventory for "${item.name}" - product not found by name. Item data:`, JSON.stringify(item, null, 2));
            console.warn(`  ⚠️ Available products in database:`, await Product.find({}).select('name _id').limit(10).lean());
            continue;
          }
        } else {
          console.log(`  ✅ Found product by exact name: ${productByName._id} (${productByName.name})`);
          item.productId = productByName._id;
        }
      }
      
      if (!item.quantity || item.quantity <= 0) {
        console.log(`  ⏭️ Skipping ${item.name} - invalid quantity: ${item.quantity}`);
        continue;
      }

      // Convert productId to ObjectId if it's a string
      const mongoose = require('mongoose');
      let productIdToFind = item.productId;
      if (typeof productIdToFind === 'string') {
        if (mongoose.Types.ObjectId.isValid(productIdToFind)) {
          productIdToFind = new mongoose.Types.ObjectId(productIdToFind);
        } else {
          console.error(`  ❌ Invalid productId format: ${productIdToFind} for item ${item.name}`);
          // Try to find by name as fallback
          const productByName = session
            ? await Product.findOne({ name: item.name }).session(session)
            : await Product.findOne({ name: item.name });
          if (productByName) {
            console.log(`  ✅ Found product by name as fallback: ${productByName._id}`);
            productIdToFind = productByName._id;
          } else {
            console.warn(`  ❌ Cannot restore inventory for ${item.name} - invalid productId and product not found by name`);
            continue;
          }
        }
      }

      const product = session
        ? await Product.findById(productIdToFind).session(session)
        : await Product.findById(productIdToFind);
      if (!product) {
        console.error(`  ❌ Product not found: ${productIdToFind} for item ${item.name}`);
        // Don't abort transaction, just skip this item and continue with others
        console.warn(`  ⚠️ Skipping inventory restoration for ${item.name} - product not found, continuing with other items`);
        continue;
      }
      
      console.log(`  ✅ Found product: ${product.name}, current stock: ${product.stock}`);

      const previousStock = Number(product.stock || 0);
      const restoreQty = Number(item.quantity || 0);
      const newStock = previousStock + restoreQty;

      console.log(`  📈 Restoring ${restoreQty} units: ${previousStock} → ${newStock}`);

      product.stock = newStock;
      await product.save(session ? { session } : {});
      
      console.log(`  ✅ Stock updated for ${product.name}`);

      const transaction = new InventoryTransaction({
        productId: product._id,
        productName: product.name,
        transactionType: 'return',
        quantity: restoreQty,
        previousStock,
        newStock,
        unitCost: product.price || 0,
        totalValue: restoreQty * (product.price || 0),
        referenceType: 'sale',
        referenceId: sale._id.toString(),
        referenceNumber: sale.billNo,
        processedBy: req.user?.name || req.user?.firstName || sale.staffName || 'System',
        reason: 'Bill deleted - stock restored',
        notes: 'Bill deleted by admin, inventory restored',
        transactionDate: new Date(),
      });

      const savedTxn = await transaction.save(session ? { session } : {});
      inventoryChanges.push({
        productId: product._id,
        quantityChange: -restoreQty,
        previousStock,
        newStock,
        transactionIds: [savedTxn._id],
      });
    }

    if (session) {
      await Sale.findByIdAndDelete(saleId).session(session);
    } else {
      await Sale.findByIdAndDelete(saleId);
    }

    if (useTransactions && session) {
      await session.commitTransaction();
      session.endSession();
    } else if (session) {
      session.endSession();
    }

    console.log(`\n✅ ========== BILL ${sale.billNo} DELETED SUCCESSFULLY ==========`);
    console.log(`📦 Inventory restored for ${inventoryChanges.length} product(s)`);
    if (inventoryChanges.length > 0) {
      console.log(`📋 Restored products:`, inventoryChanges.map(ic => ({
        productId: ic.productId,
        quantityRestored: Math.abs(ic.quantityChange),
        stockChange: `${ic.previousStock} → ${ic.newStock}`
      })));
    } else {
      console.warn(`⚠️ WARNING: No inventory was restored! Check if items have productId or if products exist.`);
    }
    console.log(`==========================================\n`);

    res.json({ 
      success: true, 
      data: sale,
      inventoryRestored: inventoryChanges.length,
      message: `Bill deleted. Inventory restored for ${inventoryChanges.length} product(s).`
    });
  } catch (err) {
    console.error('❌ Error deleting sale:', err);
    if (useTransactions && session) {
      try {
        await session.abortTransaction();
      } catch {
        // ignore
      }
    }
    if (session) {
      session.endSession();
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cash Registry Routes
// Note: Specific routes must come before parameterized routes
app.get('/api/cash-registry/summary/dashboard', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    console.log('🔍 Cash Registry Summary request for user:', req.user?.email, 'branchId:', req.user?.branchId);
    
    const { CashRegistry, Sale, Expense } = req.businessModels;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's cash registry summary
    const todaySummary = await CashRegistry.findOne({
      date: { $gte: today, $lt: tomorrow },
      shiftType: 'closing'
    });

    // Get total sales for today
    const todaySales = await Sale.find({
      createdAt: { $gte: today, $lt: tomorrow }
    });

    const totalSales = todaySales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);

    // Get total expenses for today
    const todayExpenses = await Expense.find({
      date: { $gte: today, $lt: tomorrow }
    });

    const totalExpenses = todayExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);

    res.json({
      success: true,
      data: {
        todaySummary: todaySummary || null,
        totalSales,
        totalExpenses,
        netCash: totalSales - totalExpenses
      }
    });
  } catch (error) {
    console.error('Error fetching cash registry summary:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/cash-registry', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { CashRegistry } = req.businessModels;
    const { page = 1, limit = 50, dateFrom, dateTo, shiftType, search } = req.query;
    
    const query = {};
    
    // Date range filtering
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }
    
    // Shift type filtering
    if (shiftType) {
      query.shiftType = shiftType;
    }
    
    // Search filtering
    if (search) {
      query.$or = [
        { createdBy: { $regex: search, $options: 'i' } },
        { balanceDifferenceReason: { $regex: search, $options: 'i' } },
        { onlineCashDifferenceReason: { $regex: search, $options: 'i' } }
      ];
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { date: -1, createdAt: -1 }
    };
    
    const cashRegistries = await CashRegistry.find(query)
      .sort(options.sort)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit);
    
    const total = await CashRegistry.countDocuments(query);
    
    res.json({
      success: true,
      data: cashRegistries,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error fetching cash registries:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/cash-registry/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { CashRegistry } = req.businessModels;
    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }
    res.json(cashRegistry);
  } catch (error) {
    console.error('Error fetching cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/cash-registry', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { CashRegistry, Sale, Expense } = req.businessModels;
    const {
      date,
      shiftType,
      denominations,
      notes,
      openingBalance,
      closingBalance,
      onlineCash,
      posCash,
      createdBy
    } = req.body;
    
    // Calculate totals from denominations
    const totalBalance = denominations.reduce((sum, denom) => sum + denom.total, 0);
    
    // For opening shift, set opening balance
    // For closing shift, calculate cash flow from other sources
    let cashCollected = 0;
    let expenseValue = 0;
    let cashBalance = 0;
    let balanceDifference = 0;
    let onlinePosDifference = 0;
    
    if (shiftType === 'closing') {
      // Convert date string to Date object and set time ranges
      const dateObj = new Date(date);
      const startOfDay = new Date(dateObj);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateObj);
      endOfDay.setHours(23, 59, 59, 999);
      
      // Get cash collected from sales for the date
      const sales = await Sale.find({
        date: {
          $gte: startOfDay,
          $lt: endOfDay
        },
        paymentMode: 'Cash'
      });
      
      cashCollected = sales.reduce((sum, sale) => sum + sale.netTotal, 0);
      
      // Get expenses for the date
      const expenses = await Expense.find({
        date: {
          $gte: startOfDay,
          $lt: endOfDay
        },
        paymentMethod: 'Cash'
      });
      
      expenseValue = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      
      // Calculate cash balance and differences
      cashBalance = openingBalance + cashCollected - expenseValue;
      balanceDifference = closingBalance - cashBalance;
      onlinePosDifference = onlineCash - posCash;
    }
    
    const cashRegistry = new CashRegistry({
      date: new Date(date),
      shiftType,
      createdBy: createdBy || `${req.user.firstName} ${req.user.lastName}`.trim() || req.user.email,
      userId: req.user.id,
      branchId: req.user.branchId,
      denominations,
      openingBalance: shiftType === 'opening' ? totalBalance : openingBalance,
      closingBalance: shiftType === 'closing' ? totalBalance : 0,
      cashCollected,
      expenseValue,
      cashBalance,
      balanceDifference,
      balanceDifferenceReason: balanceDifference !== 0 ? 'Manual adjustment required' : 'Balanced',
      onlineCash: shiftType === 'closing' ? onlineCash : 0,
      posCash: shiftType === 'closing' ? posCash : 0,
      onlinePosDifference,
      onlineCashDifferenceReason: onlinePosDifference !== 0 ? 'Difference detected' : 'Balanced',
      notes,
      branchId: req.user.branchId
    });
    
    await cashRegistry.save();
    res.status(201).json({
      success: true,
      data: cashRegistry,
      message: 'Cash registry entry created successfully'
    });
  } catch (error) {
    console.error('Error creating cash registry:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: error
    });
  }
});

app.put('/api/cash-registry/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const {
      denominations,
      notes,
      closingBalance,
      onlineCash,
      posCash,
      balanceDifferenceReason,
      onlineCashDifferenceReason
    } = req.body;
    const { CashRegistry } = req.businessModels;
    
    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }
    
    // Only allow updates to certain fields
    const updates = {
      denominations,
      notes,
      balanceDifferenceReason,
      onlineCashDifferenceReason
    };
    
    if (cashRegistry.shiftType === 'closing') {
      updates.closingBalance = closingBalance;
      updates.onlineCash = onlineCash;
      updates.posCash = posCash;
      
      // Recalculate differences
      const cashBalance = cashRegistry.openingBalance + cashRegistry.cashCollected - cashRegistry.expenseValue;
      updates.cashBalance = cashBalance;
      updates.balanceDifference = closingBalance - cashBalance;
      updates.onlinePosDifference = onlineCash - posCash;
    }
    
    const updatedCashRegistry = await CashRegistry.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    
    res.json(updatedCashRegistry);
  } catch (error) {
    console.error('Error updating cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/cash-registry/:id/verify', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { CashRegistry } = req.businessModels;
    const { verificationNotes, balanceDifferenceReason, onlineCashDifferenceReason } = req.body;
    
    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }
    
    // Check if verification is required
    const hasBalanceDifference = cashRegistry.balanceDifference !== 0;
    const hasOnlinePosDifference = cashRegistry.onlinePosDifference !== 0;
    
    if ((hasBalanceDifference || hasOnlinePosDifference) && !verificationNotes) {
      return res.status(400).json({ 
        message: 'Verification notes are required when there are balance differences' 
      });
    }
    
    // Update verification fields
    const updates = {
      isVerified: true,
      verifiedBy: req.user.firstName && req.user.lastName ? 
        `${req.user.firstName} ${req.user.lastName}`.trim() : 
        req.user.email || 'Unknown User',
      verifiedAt: new Date(),
      verificationNotes,
      status: 'verified'
    };
    
    // Update difference reasons if provided
    if (balanceDifferenceReason) {
      updates.balanceDifferenceReason = balanceDifferenceReason;
    }
    if (onlineCashDifferenceReason) {
      updates.onlineCashDifferenceReason = onlineCashDifferenceReason;
    }
    
    const verifiedCashRegistry = await CashRegistry.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    
    res.json(verifiedCashRegistry);
  } catch (error) {
    console.error('Error verifying cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/cash-registry/:id', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { CashRegistry } = req.businessModels;
    const cashRegistry = await CashRegistry.findById(req.params.id);
    if (!cashRegistry) {
      return res.status(404).json({ message: 'Cash registry entry not found' });
    }
    
    // Only allow deletion of unverified entries, unless user is admin
    if (cashRegistry.isVerified && req.user.role !== 'admin') {
      return res.status(400).json({ 
        message: 'Cannot delete verified cash registry entries. Only administrators can delete verified entries.' 
      });
    }
    
    await CashRegistry.findByIdAndDelete(req.params.id);
    res.json({ message: 'Cash registry entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting cash registry:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Commission Profiles API
const { requireFeature } = require('./middleware/feature-gate');

// Get all commission profiles
app.get('/api/commission-profiles', authenticateToken, setupBusinessDatabase, requireManager, requireFeature('staff_commissions'), async (req, res) => {
  try {
    const { CommissionProfile } = req.businessModels;
    const commissionProfiles = await CommissionProfile.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      data: commissionProfiles
    });
  } catch (error) {
    console.error('Error fetching commission profiles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch commission profiles'
    });
  }
});

// Create commission profile
app.post('/api/commission-profiles', authenticateToken, setupBusinessDatabase, requireAdmin, requireFeature('staff_commissions'), async (req, res) => {
  try {
    const { CommissionProfile } = req.businessModels;
    const profile = await CommissionProfile.create({
      ...req.body,
      createdBy: req.user?._id
    });

    res.status(201).json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Error creating commission profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create commission profile'
    });
  }
});

// Update commission profile
app.put('/api/commission-profiles/:id', authenticateToken, setupBusinessDatabase, requireAdmin, requireFeature('staff_commissions'), async (req, res) => {
  try {
    const { CommissionProfile } = req.businessModels;
    const { id } = req.params;

    const updatedProfile = await CommissionProfile.findByIdAndUpdate(
      id,
      {
      ...req.body,
        updatedBy: req.user?._id,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!updatedProfile) {
      return res.status(404).json({
        success: false,
        error: 'Commission profile not found'
      });
    }

    res.json({
      success: true,
      data: updatedProfile
    });
  } catch (error) {
    console.error('Error updating commission profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update commission profile'
    });
  }
});

// Delete commission profile
app.delete('/api/commission-profiles/:id', authenticateToken, setupBusinessDatabase, requireAdmin, requireFeature('staff_commissions'), async (req, res) => {
  try {
    const { CommissionProfile } = req.businessModels;
    const { id } = req.params;

    const deletedProfile = await CommissionProfile.findByIdAndDelete(id);

    if (!deletedProfile) {
      return res.status(404).json({
        success: false,
        error: 'Commission profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Commission profile deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting commission profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete commission profile'
    });
  }
});

// Get inventory transactions
app.get('/api/inventory-transactions', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { productId, transactionType, startDate, endDate, page = 1, limit = 50 } = req.query;
    const { InventoryTransaction } = req.businessModels;
    
    const filter = {};
    if (productId) filter.productId = productId;
    if (transactionType) filter.transactionType = transactionType;
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }

    const transactions = await InventoryTransaction.find(filter)
      .populate('productId', 'name sku category')
      .sort({ transactionDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await InventoryTransaction.countDocuments(filter);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching inventory transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory transactions'
    });
  }
});

// ==================== Report Export Endpoints ====================

// Export products report (emailed to admin)
app.post('/api/reports/export/products', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;
    
    const { exportProductsReport } = require('./utils/report-exporter');
    const result = await exportProductsReport({
      branchId: req.user.branchId,
      format,
      filters
    });
    
    res.json({
      success: true,
      message: result.message || 'Products report has been generated and sent to admin email(s)'
    });
  } catch (error) {
    console.error('Error exporting products report:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export products report'
    });
  }
});

// Export sales report (emailed to admin)
app.post('/api/reports/export/sales', authenticateToken, setupBusinessDatabase, requireStaff, async (req, res) => {
  try {
    const { format = 'xlsx', filters = {} } = req.body;
    
    const { exportSalesReport } = require('./utils/report-exporter');
    const result = await exportSalesReport({
      branchId: req.user.branchId,
      format,
      filters
    });
    
    res.json({
      success: true,
      message: result.message || 'Sales report has been generated and sent to admin email(s)'
    });
  } catch (error) {
    console.error('Error exporting sales report:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export sales report'
    });
  }
});

// ==================== GDPR Compliance Endpoints ====================

// Export user data (GDPR Right to Data Portability)
app.get('/api/gdpr/export/:userId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { userId } = req.params
    const { User, Client, Sale, Appointment, Product, Service, Expense, Receipt, CashRegistry } = req.businessModels

    // Verify user can only export their own data (unless admin)
    if (req.user.role !== 'admin' && req.user._id?.toString() !== userId && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only export your own data'
      })
    }

    // Find user
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }

    // Collect all user-related data
    const exportData = {
      exportDate: new Date().toISOString(),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      // If user is business owner/admin, include business data
      businessData: null,
      personalData: {
        profile: {
          firstName: user.firstName,
          lastName: user.lastName,
          mobile: user.mobile,
          avatar: user.avatar
        }
      },
      // Sales created by this user
      salesCreated: [],
      // Appointments assigned to this user
      appointments: [],
      // Clients (if user has access)
      clients: [],
      metadata: {
        exportVersion: '1.0',
        gdprCompliant: true
      }
    }

    // Get sales created by this user
    try {
      const sales = await Sale.find({ createdBy: userId }).lean()
      exportData.salesCreated = sales.map(sale => ({
        id: sale._id,
        date: sale.date,
        clientName: sale.clientName,
        total: sale.grossTotal,
        items: sale.items,
        paymentMode: sale.paymentMode
      }))
    } catch (err) {
      console.error('Error fetching sales:', err)
    }

    // Get appointments assigned to this user
    try {
      const appointments = await Appointment.find({ 
        $or: [
          { assignedStaff: userId },
          { createdBy: userId }
        ]
      }).lean()
      exportData.appointments = appointments.map(apt => ({
        id: apt._id,
        clientName: apt.clientName,
        serviceName: apt.serviceName,
        date: apt.date,
        time: apt.time,
        status: apt.status
      }))
    } catch (err) {
      console.error('Error fetching appointments:', err)
    }

    // If admin/owner, include business-wide data
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      try {
        const Business = req.businessModels.Business
        const business = await Business.findOne({ _id: req.user.businessId })
        if (business) {
          exportData.businessData = {
            businessName: business.name,
            businessCode: business.code,
            address: business.address,
            phone: business.phone,
            email: business.email
          }
        }
      } catch (err) {
        console.error('Error fetching business data:', err)
      }
    }

    // Generate export file and send via email to admin
    try {
      const emailService = require('./services/email-service');
      
      // Ensure email service is initialized
      if (!emailService.initialized) {
        await emailService.initialize();
      }
      
      // Check if email service is enabled
      if (emailService.enabled) {
        // Get Business from main database
        const databaseManager = require('./config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const Business = mainConnection.model('Business', require('./models/Business').schema);
        const business = await Business.findById(req.user.branchId);
        const emailSettings = business?.settings?.emailNotificationSettings;
        
        // Generate JSON file from export data
        const exportFileName = `export-${user.name || user.email || userId}-${new Date().toISOString().split('T')[0]}.json`;
        const exportFileContent = JSON.stringify(exportData, null, 2);
        const exportFileBuffer = Buffer.from(exportFileContent, 'utf-8');
        
        // Get admin users to send export to
        const User = mainConnection.model('User', require('./models/User').schema);
        const adminUsers = await User.find({
          branchId: req.user.branchId,
          role: 'admin',
          email: { $exists: true, $ne: '' }
        }).lean();
        
        // If no admin users found, try to get the requesting user if they're admin
        let recipients = [...adminUsers];
        if (recipients.length === 0 && req.user.role === 'admin' && req.user.email) {
          recipients.push({
            email: req.user.email,
            name: req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
            role: 'admin'
          });
        }
        
        // Also check export notification settings for additional recipients
        const exportNotificationsEnabled = emailSettings?.exportNotifications?.enabled === true;
        if (exportNotificationsEnabled) {
          const { Staff } = req.businessModels;
          const recipientStaffIds = emailSettings.exportNotifications.recipientStaffIds || [];
          let staffRecipients = [];
          
          if (recipientStaffIds.length > 0) {
            staffRecipients = await Staff.find({
              _id: { $in: recipientStaffIds },
              'emailNotifications.enabled': true,
              'emailNotifications.preferences.exportAlerts': true,
              email: { $exists: true, $ne: '' }
            }).lean();
          } else {
            staffRecipients = await Staff.find({
              branchId: req.user.branchId,
              'emailNotifications.enabled': true,
              'emailNotifications.preferences.exportAlerts': true,
              email: { $exists: true, $ne: '' }
            }).lean();
          }
          
          // Add staff recipients (avoid duplicates)
          for (const staff of staffRecipients) {
            if (!recipients.some(r => r.email === staff.email)) {
              recipients.push({
                email: staff.email,
                name: staff.name || staff.email,
                role: 'staff'
              });
            }
          }
        }
        
        if (recipients.length === 0) {
          console.log(`⚠️ No admin email found to send export to`);
          return res.status(400).json({
            success: false,
            error: 'No admin email found. Please ensure at least one admin user has an email address configured.'
          });
        }
        
        // Prepare attachment
        const attachment = {
          filename: exportFileName,
          content: exportFileBuffer.toString('base64')
        };
        
        // Send export file to all recipients
        for (const recipient of recipients) {
          try {
            console.log(`📧 Sending export file to ${recipient.role}: ${recipient.email}`);
            await emailService.sendExportReady({
              to: recipient.email,
              exportType: 'User Data Export',
              businessName: business?.name || 'Business',
              attachments: [attachment]
            });
            console.log(`✅ Export file sent to ${recipient.email}`);
          } catch (emailError) {
            console.error(`❌ Error sending export file to ${recipient.email}:`, emailError);
            console.error(`❌ Error details:`, {
              message: emailError.message,
              stack: emailError.stack
            });
          }
        }
      } else {
        console.log(`⚠️ Email service is disabled, cannot send export file`);
        return res.status(400).json({
          success: false,
          error: 'Email service is disabled. Please enable email service to receive export files.'
        });
      }
    } catch (emailError) {
      console.error('Error sending export file:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Failed to send export file via email. Please try again later.'
      });
    }

    // Return success message instead of data
    res.json({
      success: true,
      message: 'Export file has been generated and sent to admin email(s)',
      data: {
        exportDate: exportData.exportDate,
        user: {
          id: exportData.user.id,
          name: exportData.user.name,
          email: exportData.user.email
        }
      }
    })
  } catch (error) {
    console.error('Error exporting user data:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to export user data'
    })
  }
})

// Delete user data (GDPR Right to Erasure / Right to be Forgotten)
app.delete('/api/gdpr/delete/:userId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { userId } = req.params
    const { User, Client, Sale, Appointment } = req.businessModels

    // Verify user can only delete their own data (unless admin)
    if (req.user.role !== 'admin' && req.user._id?.toString() !== userId && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own account'
      })
    }

    // Prevent deletion of last admin
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }

    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', businessId: user.businessId })
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete the last admin user. Please assign another admin first.'
        })
      }
    }

    // Mark user for deletion (soft delete with 30-day retention as per GDPR)
    const deletionDate = new Date()
    deletionDate.setDate(deletionDate.getDate() + 30) // 30 days retention

    await User.findByIdAndUpdate(userId, {
      deletedAt: new Date(),
      deletionScheduledFor: deletionDate,
      email: `deleted_${Date.now()}_${user.email}`, // Anonymize email
      name: 'Deleted User',
      isDeleted: true
    })

    // Anonymize sales created by this user (keep for business records but remove personal identifiers)
    await Sale.updateMany(
      { createdBy: userId },
      { 
        $set: { 
          createdBy: null,
          staffName: 'Deleted User'
        }
      }
    )

    // Remove appointments assigned to this user
    await Appointment.deleteMany({ assignedStaff: userId })

    res.json({
      success: true,
      message: 'Account marked for deletion. Data will be permanently deleted within 30 days.',
      deletionDate: deletionDate.toISOString()
    })
  } catch (error) {
    console.error('Error deleting user data:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete user data'
    })
  }
})

// Get consent status
app.get('/api/gdpr/consent/:userId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { userId } = req.params
    const { Staff } = req.businessModels

    if (!Staff) {
      return res.status(500).json({
        success: false,
        error: 'Staff model not available'
      })
    }

    if (req.user.role !== 'admin' && req.user._id?.toString() !== userId && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      })
    }

    const staff = await Staff.findById(userId).select('consentPreferences consentUpdatedAt')
    res.json({
      success: true,
      data: {
        consent: staff?.consentPreferences || null,
        lastUpdated: staff?.consentUpdatedAt || null
      }
    })
  } catch (error) {
    console.error('Error fetching consent status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch consent status',
      message: error.message
    })
  }
})

// Update consent
app.post('/api/gdpr/consent/:userId', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const { userId } = req.params
    const { consent } = req.body
    const { Staff } = req.businessModels

    if (!Staff) {
      return res.status(500).json({
        success: false,
        error: 'Staff model not available'
      })
    }

    if (req.user.role !== 'admin' && req.user._id?.toString() !== userId && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      })
    }

    await Staff.findByIdAndUpdate(userId, {
      consentPreferences: consent,
      consentUpdatedAt: new Date()
    })

    res.json({
      success: true,
      message: 'Consent preferences updated'
    })
  } catch (error) {
    console.error('Error updating consent:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update consent'
    })
  }
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Ease My Salon API is running',
    timestamp: new Date().toISOString()
  });
});

// Email service status check
app.get('/api/email-service/status', authenticateToken, async (req, res) => {
  try {
    const emailService = require('./services/email-service');
    
    // Ensure email service is initialized
    if (!emailService.initialized) {
      await emailService.initialize();
    }
    
    res.json({
      success: true,
      data: {
        initialized: emailService.initialized,
        enabled: emailService.enabled,
        provider: emailService.provider,
        hasConfig: !!emailService.config
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Start server

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Ease My Salon Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 API Base: http://localhost:${PORT}/api`);
  // Old initialization functions disabled for multi-tenant architecture
  // Admin users should be created via create-admin.js script
  // await initializeDefaultUsers();
  // await initializeBusinessSettings();
  
  // Setup cron job for inactivity checking
  setupInactivityChecker();
  
  // Setup email scheduler jobs
  const { setupEmailScheduler } = require('./jobs/email-scheduler');
  setupEmailScheduler();
  
  // Initialize email service on server start
  const emailService = require('./services/email-service');
  emailService.initialize().catch(err => {
    console.error('⚠️  Failed to initialize email service:', err.message);
  });
});

// Setup inactivity checker cron job
function setupInactivityChecker() {
  // Run every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🕐 Running daily inactivity check...');
    const { checkInactiveBusinesses } = require('./inactivity-checker');
    await checkInactiveBusinesses();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  console.log('⏰ Inactivity checker scheduled to run daily at 2 AM IST');
}

