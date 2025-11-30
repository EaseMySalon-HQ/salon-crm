const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { setupMainDatabase } = require('../middleware/business-db');
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin, checkAdminPermission } = require('../middleware/admin-auth');
const { logAdminActivity, getClientIp } = require('../utils/admin-logger');
const Business = require('../models/Business').model;
const User = require('../models/User').model;
const databaseManager = require('../config/database-manager');
const { modelFactory } = require('../models/model-factory');

const router = express.Router();

// Admin Login
router.post('/login', setupMainDatabase, async (req, res) => {
  try {
    const { email, password } = req.body;
    const { Admin } = req.mainModels;

    console.log('🔍 Admin login attempt:', { email: email ? email.toLowerCase() : 'missing' });

    if (!email || !password) {
      console.log('❌ Admin login failed: Missing email or password');
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Find admin by email (case-insensitive)
    const emailLower = email.toLowerCase();
    console.log('🔍 Looking for admin with email:', emailLower);
    
    const admin = await Admin.findOne({ email: emailLower, isActive: true });
    if (!admin) {
      console.log(`❌ Admin login failed: No admin found with email ${emailLower}`);
      // Check if admin exists but is inactive
      const inactiveAdmin = await Admin.findOne({ email: emailLower });
      if (inactiveAdmin) {
        console.log('⚠️ Admin exists but is inactive');
      }
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    console.log('✅ Admin found:', { id: admin._id, email: admin.email, role: admin.role });
    
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      console.log('❌ Admin login failed: Invalid password');
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    console.log('✅ Password validated successfully');

    const token = jwt.sign(
      { id: admin._id, role: 'admin' },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
      { expiresIn: '24h' }
    );

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Log login activity
    logAdminActivity({
      adminId: admin,
      action: 'login',
      module: 'auth',
      details: { email: admin.email, role: admin.role },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent']
    }).catch(err => console.error('Failed to log login activity:', err));

    // Get admin name (virtual or constructed)
    const adminName = admin.name || `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || 'Admin User';
    
    res.json({
      success: true,
      data: {
        admin: {
          id: admin._id,
          name: adminName,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions
        },
        token
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get Admin Profile
router.get('/profile', setupMainDatabase, authenticateAdmin, async (req, res) => {
  try {
    const { AdminRole } = req.mainModels;
    
    // If admin has a roleId, populate permissions from the role
    let permissions = req.admin.permissions || [];
    if (req.admin.roleId) {
      const role = await AdminRole.findById(req.admin.roleId).lean();
      if (role && role.permissions) {
        permissions = role.permissions;
      }
    }
    
    // Get admin name (virtual or constructed)
    const adminName = req.admin.name || `${req.admin.firstName || ''} ${req.admin.lastName || ''}`.trim() || 'Admin User';
    
    res.json({
      success: true,
      data: {
        id: req.admin._id,
        name: adminName,
        email: req.admin.email,
        role: req.admin.role,
        permissions: permissions,
        lastLogin: req.admin.lastLogin
      }
    });
  } catch (error) {
    console.error('Get admin profile error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
});

// Get All Businesses
router.get('/businesses', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'view'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, plan, includeDeleted = true } = req.query;
    const { Business } = req.mainModels;
    
    let query = {};
    
    // By default, include deleted businesses for accountability/audit trail
    // Only exclude if explicitly requested
    if (includeDeleted === 'false' || includeDeleted === false) {
      query.status = { $ne: 'deleted' };
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { 'contact.email': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Status filter (if provided, override the default)
    if (status && status !== 'all') {
      if (status === 'deleted') {
        query.status = 'deleted';
      } else {
        query.status = status;
        // When filtering by specific status, still include deleted unless explicitly excluded
        if (includeDeleted === 'false' || includeDeleted === false) {
          query.status = { $in: [status, { $ne: 'deleted' }] };
        }
      }
    }
    
    // Plan filter
    if (plan && plan !== 'all') {
      query['subscription.plan'] = plan;
    }
    
    const skip = (page - 1) * limit;
    const businesses = await Business.find(query)
      .populate('owner', 'firstName lastName email mobile lastLoginAt')
      .populate('deletedBy', 'firstName lastName email') // Show who deleted it
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Business.countDocuments(query);
    
    res.json({
      success: true,
      data: businesses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get businesses error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get Single Business
router.get('/businesses/:id', authenticateAdmin, checkAdminPermission('businesses', 'view'), async (req, res) => {
  try {
    // Setup main database connection
    await new Promise((resolve, reject) => {
      setupMainDatabase(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    const { Business } = req.mainModels;
    const business = await Business.findById(req.params.id)
      .populate('owner', 'firstName lastName email mobile role')
      .populate('deletedBy', 'firstName lastName email');
    
    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }
    
    // Transform the business data to match frontend expectations
    const businessData = {
      _id: business._id,
      name: business.name,
      code: business.code,
      businessType: business.businessType,
      status: business.status,
      address: business.address,
      contact: business.contact,
      subscription: business.subscription,
      deletedAt: business.deletedAt,
      deletedBy: business.deletedBy ? {
        _id: business.deletedBy._id,
        name: `${business.deletedBy.firstName || ''} ${business.deletedBy.lastName || ''}`.trim() || 'Admin',
        email: business.deletedBy.email
      } : null,
      owner: business.owner ? {
        _id: business.owner._id,
        name: `${business.owner.firstName || ''} ${business.owner.lastName || ''}`.trim() || 'Business Owner',
        email: business.owner.email,
        phone: business.owner.mobile
      } : null,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
      isOnboarded: business.isOnboarded,
      onboardingStep: business.onboardingStep
    };
    
    res.json({ success: true, data: businessData });
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Create New Business
router.post('/businesses', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'create'), async (req, res) => {
  try {
    
    const {
      businessInfo,
      ownerInfo
    } = req.body;

    // Handle both data structures - ownerInfo as separate field or nested under businessInfo.owner
    const ownerData = ownerInfo || businessInfo?.owner;
    
    if (!ownerData) {
      return res.status(400).json({ success: false, error: 'Owner information is required' });
    }
    
    if (!ownerData.password) {
      return res.status(400).json({ success: false, error: 'Owner password is required' });
    }

    // Create owner user first (using main database models)
    const hashedPassword = await bcrypt.hash(ownerData.password, 10);
    const owner = new req.mainModels.User({
      firstName: ownerData.firstName,
      lastName: ownerData.lastName,
      email: ownerData.email,
      mobile: ownerData.phone,
      password: hashedPassword,
      role: 'admin',
      hasLoginAccess: true,
      allowAppointmentScheduling: true,
      isActive: true,
      permissions: [
        // Business admin gets all permissions for their business
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
        { module: 'settings', feature: 'view', enabled: true },
        { module: 'settings', feature: 'edit', enabled: true },
      ]
    });
    
    await owner.save();

    // Generate unique business code
    let businessCode;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
      // Count only non-deleted businesses
      const count = await req.mainModels.Business.countDocuments({ 
        status: { $ne: 'deleted' } 
      });
      businessCode = `BIZ${String(count + 1).padStart(4, '0')}`;
      
      // Check if this code already exists (including deleted - codes are never reused)
      const existing = await req.mainModels.Business.findOne({ code: businessCode });
      if (!existing) {
        isUnique = true;
      } else {
        attempts++;
      }
    }
    
    // Fallback to timestamp-based code if count-based fails
    if (!isUnique) {
      businessCode = `BIZ${Date.now().toString().slice(-4)}`;
    }

    // Create business (using main database models)
    const business = new req.mainModels.Business({
      code: businessCode,
      name: businessInfo.name || businessInfo.businessName,
      businessType: (businessInfo.businessType || 'salon').toLowerCase(),
      address: {
        street: (businessInfo.address?.street || businessInfo.location?.street) || 'Not provided',
        city: businessInfo.address?.city || businessInfo.location?.city,
        state: businessInfo.address?.state || businessInfo.location?.state,
        zipCode: businessInfo.address?.zipCode || businessInfo.location?.zipCode,
        country: businessInfo.address?.country || businessInfo.location?.country || 'India'
      },
      contact: {
        phone: businessInfo.contact?.phone || businessInfo.phone,
        email: businessInfo.contact?.email || businessInfo.email,
        website: businessInfo.contact?.website || businessInfo.website || ''
      },
      settings: {
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        currencySymbol: '₹',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '12',
        taxRate: 18,
        gstNumber: '',
        businessLicense: '',
        operatingHours: {
          monday: { open: '09:00', close: '18:00', closed: false },
          tuesday: { open: '09:00', close: '18:00', closed: false },
          wednesday: { open: '09:00', close: '18:00', closed: false },
          thursday: { open: '09:00', close: '18:00', closed: false },
          friday: { open: '09:00', close: '18:00', closed: false },
          saturday: { open: '09:00', close: '18:00', closed: false },
          sunday: { open: '10:00', close: '16:00', closed: false }
        },
        appointmentSettings: {
          slotDuration: 30,
          advanceBookingDays: 30,
          bufferTime: 15,
          allowOnlineBooking: false
        },
        notifications: {
          emailNotifications: true,
          smsNotifications: false,
          appointmentReminders: true,
          paymentConfirmations: true
        },
        branding: {
          logo: '',
          primaryColor: '#3B82F6',
          secondaryColor: '#1E40AF',
          fontFamily: 'Inter'
        },
        ...businessInfo.settings // Allow frontend to override defaults if needed
      },
      owner: owner._id,
      status: 'active'
    });

    await business.save();

    // Update owner with business reference
    owner.branchId = business._id;
    await owner.save();

    // Create default business settings in the business-specific database (optional)
    try {
      // Get business-specific database connection (uses new naming convention: ease_my_salon_{businessCode})
      // IMPORTANT: business.code must be set before calling getConnection
      if (!business.code) {
        throw new Error('Business code is required but not set. Cannot create business database.');
      }
      console.log(`🔧 Creating business database for new business: ${business.name} (Code: ${business.code})`);
      const businessConnection = await databaseManager.getConnection(business.code, req.mainConnection);
      const businessModels = modelFactory.createBusinessModels(businessConnection);
      
      // Create default business settings
      const defaultSettings = new businessModels.BusinessSettings({
        name: business.name,
        email: business.contact.email,
        phone: business.contact.phone,
        website: business.contact.website || '',
        description: `${business.name} - Professional salon and spa services`,
        address: business.address.street,
        city: business.address.city,
        state: business.address.state,
        zipCode: business.address.zipCode,
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
        socialMedia: `@${business.name.toLowerCase().replace(/\s+/g, '')}`
      });
      
      await defaultSettings.save();
      console.log(`✅ Default business settings created for ${business.name}`);
    } catch (settingsError) {
      console.error('Error creating default business settings:', settingsError);
      // Don't fail the business creation if settings creation fails
    }

    res.status(201).json({
      success: true,
      data: {
        business,
        owner: {
          id: owner._id,
          name: `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || 'Business Owner',
          email: owner.email,
          password: ownerData.password // Return plain password for admin
        }
      },
      message: 'Business created successfully'
    });
  } catch (error) {
    console.error('Create business error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
});

// Update Business
router.put('/businesses/:id', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'update'), async (req, res) => {
  try {
    console.log('Update business request:', req.params.id, req.body);
    const { Business } = req.mainModels;
    const { businessInfo, ownerInfo, subscriptionInfo } = req.body;
    
    // Build update object from nested structure
    const updateData = {
      updatedAt: new Date()
    };

    // Handle business info
    if (businessInfo) {
      if (businessInfo.name) updateData.name = businessInfo.name;
      if (businessInfo.businessType) updateData.businessType = businessInfo.businessType;
      if (businessInfo.address) updateData.address = businessInfo.address;
      if (businessInfo.contact) updateData.contact = businessInfo.contact;
      if (businessInfo.settings) updateData.settings = businessInfo.settings;
    }

    // Handle owner info
    if (ownerInfo) {
      const ownerUpdate = {};
      if (ownerInfo.firstName) ownerUpdate.firstName = ownerInfo.firstName;
      if (ownerInfo.lastName) ownerUpdate.lastName = ownerInfo.lastName;
      if (ownerInfo.email) ownerUpdate.email = ownerInfo.email;
      if (ownerInfo.phone) ownerUpdate.mobile = ownerInfo.phone;
      if (typeof ownerInfo.hasLoginAccess === 'boolean') ownerUpdate.hasLoginAccess = ownerInfo.hasLoginAccess;

      if (ownerInfo.password && ownerInfo.password.trim()) {
        ownerUpdate.password = await bcrypt.hash(ownerInfo.password, 10);
        ownerUpdate.passwordUpdatedAt = new Date();
        ownerUpdate.updatedAt = new Date();
        // Ensure owner retains login access when password is changed
        ownerUpdate.hasLoginAccess = true;
      }

      if (Object.keys(ownerUpdate).length > 0) {
        // Update owner document in the main database (where owners are stored)
        const business = await Business.findById(req.params.id);
        
        if (business && business.owner) {
          // Update owner in the main database
          const { User } = req.mainModels;
          await User.findByIdAndUpdate(
            business.owner,
            { $set: ownerUpdate },
            { new: true }
          );
        }
      }
    }

    // Handle subscription info
    if (subscriptionInfo) {
      if (subscriptionInfo.plan) updateData['subscription.plan'] = subscriptionInfo.plan;
      if (subscriptionInfo.maxUsers !== undefined) updateData['subscription.maxUsers'] = subscriptionInfo.maxUsers;
      if (subscriptionInfo.maxBranches !== undefined) updateData['subscription.maxBranches'] = subscriptionInfo.maxBranches;
      if (subscriptionInfo.features) updateData['subscription.features'] = subscriptionInfo.features;
    }

    const business = await Business.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('owner', 'firstName lastName email mobile');

    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    res.json({
      success: true,
      data: business,
      message: 'Business updated successfully'
    });
  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Toggle Business Status
router.patch('/businesses/:id/status', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'update'), async (req, res) => {
  try {
    const { status } = req.body;
    const business = await req.mainModels.Business.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: new Date() },
      { new: true }
    );

    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    res.json({
      success: true,
      data: business,
      message: `Business ${status} successfully`
    });
  } catch (error) {
    console.error('Toggle business status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// Get Business Statistics
router.get('/businesses/:id/stats', authenticateAdmin, checkAdminPermission('businesses', 'view'), async (req, res) => {
  try {
    const businessId = req.params.id;
    
    // Connect to business-specific database
    const databaseManager = require('../config/database-manager');
    const dbName = databaseManager.getDatabaseName(businessId);
    const businessDb = mongoose.connection.useDb(dbName);
    
    // Get models for business database
    const Client = businessDb.model('Client', require('../models/Client').schema);
    const Appointment = businessDb.model('Appointment', require('../models/Appointment').schema);
    const Sale = businessDb.model('Sale', require('../models/Sale').schema);
    
    // Get user count from main database
    const totalUsers = await User.countDocuments({ branchId: businessId });
    const activeUsers = await User.countDocuments({ branchId: businessId, status: 'active' });
    
    // Get business-specific stats
    const [totalClients, totalAppointments, totalSales] = await Promise.all([
      Client.countDocuments(),
      Appointment.countDocuments(),
      Sale.countDocuments()
    ]);
    
    // Calculate monthly revenue (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const monthlySales = await Sale.find({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    const monthlyRevenue = monthlySales.reduce((total, sale) => {
      return total + (sale.grossTotal || 0);
    }, 0);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalClients,
        totalAppointments,
        totalSales,
        monthlyRevenue
      }
    });
  } catch (error) {
    console.error('Get business stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});



// Dashboard Statistics
router.get('/dashboard/stats', setupMainDatabase, authenticateAdmin, checkAdminPermission('dashboard', 'view'), async (req, res) => {
  try {
    const { Business, User } = req.mainModels;
    
    const [
      totalBusinesses,
      activeBusinesses,
      totalUsers,
      recentBusinessesRaw
    ] = await Promise.all([
      Business.countDocuments({ status: { $ne: 'deleted' } }), // Exclude deleted
      Business.countDocuments({ status: 'active' }),
      User.countDocuments(),
      Business.find({ status: { $ne: 'deleted' } }) // Exclude deleted
        .populate('owner', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean() // Use lean() for better performance
    ]);

    // Transform recent businesses to handle null owners
    const recentBusinesses = recentBusinessesRaw.map(business => ({
      _id: business._id,
      name: business.name,
      code: business.code,
      status: business.status,
      createdAt: business.createdAt,
      owner: business.owner ? {
        name: `${business.owner.firstName || ''} ${business.owner.lastName || ''}`.trim() || 'N/A',
        email: business.owner.email || 'N/A'
      } : null
    }));

    res.json({
      success: true,
      data: {
        totalBusinesses,
        activeBusinesses,
        totalUsers,
        recentBusinesses
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get All Users with Business Associations
router.get('/users', setupMainDatabase, authenticateAdmin, checkAdminPermission('users', 'view'), async (req, res) => {
  try {
    console.log('🔍🔍🔍 ADMIN USERS ENDPOINT CALLED - NEW VERSION 🔍🔍🔍');
    const { User, Business } = req.mainModels;
    
    // Get all businesses first
    const businesses = await Business.find({}).lean();
    console.log('📊 Found businesses:', businesses.length);
    
    // Get all users from main database (business owners)
    const mainUsers = await User.find({ branchId: { $exists: true, $ne: null } })
      .populate('branchId', 'name code status')
      .sort({ createdAt: -1 })
      .lean();

    // Transform main database users
    const mainUsersWithBusiness = mainUsers
      .filter(user => user.branchId && user.branchId.name)
      .map(user => ({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        branchId: user.branchId._id,
        businessName: user.branchId.name,
        createdAt: user.createdAt,
        source: 'main'
      }));
    
    console.log('👥 Main users found:', mainUsersWithBusiness.length);

    // Get staff from each business database
    const allStaff = [];
    for (const business of businesses) {
      try {
        console.log(`🔍 Processing business: ${business.name} (${business.code})`);
        // Connect to business database using business code
        const databaseManager = require('../config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const businessDb = await databaseManager.getConnection(business.code || business._id, mainConnection);
        console.log(`📡 Connected to database for business: ${business.name} (${business.code})`);
        
        const Staff = businessDb.model('Staff', require('../models/Staff').schema);
        console.log(`📋 Staff model created for ${business.name}`);
        
        // Get staff from this business
        const staff = await Staff.find({}).lean();
        console.log(`👥 Raw staff count for ${business.name}:`, staff.length);
        
        // Transform staff data
        const staffWithBusiness = staff.map(staffMember => ({
          _id: staffMember._id,
          firstName: staffMember.name?.split(' ')[0] || '',
          lastName: staffMember.name?.split(' ').slice(1).join(' ') || '',
          email: staffMember.email,
          role: staffMember.role,
          status: staffMember.isActive ? 'active' : 'inactive',
          branchId: business._id,
          businessName: business.name,
          createdAt: staffMember.createdAt,
          source: 'business'
        }));
        
        allStaff.push(...staffWithBusiness);
        console.log(`👷 Staff from ${business.name}:`, staffWithBusiness.length);
      } catch (error) {
        console.error(`Error fetching staff for business ${business.name}:`, error);
        // Continue with other businesses even if one fails
      }
    }
    
    console.log('👷 Total staff found:', allStaff.length);

    // Combine main users and staff
    const allUsers = [...mainUsersWithBusiness, ...allStaff];
    
    // Sort by creation date
    allUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    console.log('📋 Total users to return:', allUsers.length);

    res.json({
      success: true,
      data: allUsers
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Delete Business (Soft Delete)
router.delete('/businesses/:id', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'delete'), async (req, res) => {
  try {
    const { id } = req.params;

    // Find the business first to get info
    const business = await req.mainModels.Business.findById(id).populate('owner');
    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    const businessCode = business.code;

    // If business already deleted -> perform permanent deletion
    if (business.status === 'deleted') {
      try {
        const databaseManager = require('../config/database-manager');
        await databaseManager.deleteDatabase(businessCode);
      } catch (dbError) {
        console.error('⚠️  Error deleting business database during permanent delete:', dbError.message);
      }

      await req.mainModels.Business.findByIdAndDelete(id);

      return res.json({
        success: true,
        message: 'Business permanently deleted and code is now reusable',
        data: {
          business: {
            id,
            code: businessCode,
            name: business.name,
            status: 'permanently_deleted'
          }
        }
      });
    }

    // Soft delete: Mark business as deleted
    business.status = 'deleted';
    business.deletedAt = new Date();
    business.deletedBy = req.admin._id; // Track who deleted it
    await business.save();

    // Delete the business owner from main database (hard delete owner)
    if (business.owner) {
      await req.mainModels.User.findByIdAndDelete(business.owner._id);
    }

    // Delete the business-specific database
    try {
      const databaseManager = require('../config/database-manager');
      await databaseManager.deleteDatabase(businessCode);
      console.log(`✅ Business database deleted: ease_my_salon_${businessCode}`);
    } catch (dbError) {
      console.error('⚠️  Error deleting business database:', dbError);
      // Log but don't fail - business is already marked as deleted
    }

    res.json({ 
      success: true, 
      message: 'Business marked as deleted and database removed successfully',
      data: {
        business: {
          id: business._id,
          code: business.code,
          name: business.name,
          status: business.status,
          deletedAt: business.deletedAt
        }
      }
    });
  } catch (error) {
    console.error('Delete business error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
