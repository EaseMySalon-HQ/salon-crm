const express = require('express');
const { logger } = require('../utils/logger');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { setupMainDatabase } = require('../middleware/business-db');
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin, checkAdminPermission, requireAdminRole } = require('../middleware/admin-auth');
const { logAdminActivity, getClientIp } = require('../utils/admin-logger');
const {
  getBusinessMetrics,
  attachMetricsToBusinesses,
  syncOverdueBillingSuspensions,
  syncAllOverdueBillingSuspensions,
} = require('../lib/business-metrics');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const crypto = require('crypto');
const emailService = require('../services/email-service');

const router = express.Router();

function escapeHtml(str) {
  if (str == null || str === '') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Admin Login
router.post('/login', setupMainDatabase, async (req, res) => {
  try {
    const { email, password } = req.body;
    const { Admin } = req.mainModels;

    logger.debug('🔍 Admin login attempt:', { email: email ? email.toLowerCase() : 'missing' });

    if (!email || !password) {
      logger.debug('❌ Admin login failed: Missing email or password');
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Find admin by email (case-insensitive)
    const emailLower = email.toLowerCase();
    logger.debug('🔍 Looking for admin with email:', emailLower);
    
    const admin = await Admin.findOne({ email: emailLower, isActive: true });
    if (!admin) {
      logger.debug(`❌ Admin login failed: No admin found with email ${emailLower}`);
      // Check if admin exists but is inactive
      const inactiveAdmin = await Admin.findOne({ email: emailLower });
      if (inactiveAdmin) {
        logger.debug('⚠️ Admin exists but is inactive');
      }
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    logger.debug('✅ Admin found:', { id: admin._id, email: admin.email, role: admin.role });
    
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      logger.debug('❌ Admin login failed: Invalid password');
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    logger.debug('✅ Password validated successfully');

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
    }).catch(err => logger.error('Failed to log login activity:', err));

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
    logger.error('Admin login error:', error);
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
    logger.error('Get admin profile error:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
});

// Get business counts by status (for dashboard metrics)
router.get('/businesses/stats', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'view'), async (req, res) => {
  try {
    const { Business } = req.mainModels;
    await syncAllOverdueBillingSuspensions(Business);
    const [row] = await Business.aggregate([
      {
        $facet: {
          total: [{ $count: 'c' }],
          active: [{ $match: { status: 'active' } }, { $count: 'c' }],
          suspended: [{ $match: { status: 'suspended' } }, { $count: 'c' }],
          inactive: [{ $match: { status: 'inactive' } }, { $count: 'c' }],
          deleted: [{ $match: { status: 'deleted' } }, { $count: 'c' }],
        },
      },
    ]);
    const pick = (name) => row?.[name]?.[0]?.c ?? 0;
    res.json({
      success: true,
      data: {
        total: pick('total'),
        active: pick('active'),
        suspended: pick('suspended'),
        inactive: pick('inactive'),
        deleted: pick('deleted'),
      },
    });
  } catch (error) {
    logger.error('Businesses stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get All Businesses
router.get('/businesses', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'view'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, plan, includeDeleted = true } = req.query;
    const { Business } = req.mainModels;

    await syncAllOverdueBillingSuspensions(Business);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    let query = {};

    // By default, include deleted businesses for accountability/audit trail
    if (includeDeleted === 'false' || includeDeleted === false) {
      query.status = { $ne: 'deleted' };
    }

    const searchTrim = typeof search === 'string' ? search.trim() : '';
    if (searchTrim.length >= 3) {
      query.$text = { $search: searchTrim };
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (plan && plan !== 'all') {
      query['subscription.plan'] = plan;
    }

    const [businesses, total] = await Promise.all([
      Business.find(query)
        .populate('owner', 'firstName lastName email mobile lastLoginAt')
        .populate('deletedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Business.countDocuments(query),
    ]);

    await attachMetricsToBusinesses(businesses, req.mainConnection);

    const data = businesses.map((b) => ({
      ...b,
      usersCount: b.usersCount,
      invoicesCount: b.invoicesCount,
      revenue: b.revenue,
      nextBillingDate: b.nextBillingDate,
    }));

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 0,
      },
    });
  } catch (error) {
    logger.error('Get businesses error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get Single Business (with metrics for View Business page)
router.get('/businesses/:id', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'view'), async (req, res) => {
  try {
    const { Business } = req.mainModels;
    const business = await Business.findById(req.params.id)
      .populate('owner', 'firstName lastName email mobile role lastLoginAt')
      .populate('deletedBy', 'firstName lastName email')
      .lean();
    
    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    await syncOverdueBillingSuspensions([business], Business);

    const metrics = await getBusinessMetrics(business.code || req.params.id, req.mainConnection);
    const owner = business.owner;
    const ownerName = owner
      ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email || '—'
      : '—';
    
    const businessData = {
      _id: business._id,
      businessId: business.code || business._id.toString(),
      name: business.name,
      code: business.code,
      businessType: business.businessType,
      status: business.status,
      address: business.address,
      contact: business.contact,
      subscription: business.subscription,
      plan: business.subscription?.plan || '—',
      staffCount: metrics.usersCount ?? 0,
      invoiceCount: metrics.invoicesCount ?? 0,
      totalRevenue: metrics.revenue ?? 0,
      lastActiveAt: owner?.lastLoginAt || business.updatedAt || null,
      deletedAt: business.deletedAt,
      deletedBy: business.deletedBy ? {
        _id: business.deletedBy._id,
        name: `${business.deletedBy.firstName || ''} ${business.deletedBy.lastName || ''}`.trim() || 'Admin',
        email: business.deletedBy.email
      } : null,
      owner: business.owner ? {
        _id: business.owner._id,
        name: ownerName,
        email: business.owner.email,
        phone: business.owner.mobile,
        lastLoginAt: business.owner.lastLoginAt
      } : null,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
      isOnboarded: business.isOnboarded,
      onboardingStep: business.onboardingStep
    };
    
    res.json({ success: true, data: businessData });
  } catch (error) {
    logger.error('Get business error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// --- Platform Admin Only (super_admin) Business Actions ---
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// POST /businesses/:id/impersonate - Impersonate business owner
router.post('/businesses/:id/impersonate', setupMainDatabase, authenticateAdmin, requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { id: businessId } = req.params;
    const { Business } = req.mainModels;

    const business = await Business.findById(businessId).populate('owner');
    if (!business) return res.status(404).json({ success: false, error: 'Business not found' });
    if (!business.owner) return res.status(400).json({ success: false, error: 'Business has no owner' });
    if (business.status === 'suspended') return res.status(403).json({ success: false, error: 'Cannot impersonate suspended business' });

    const owner = business.owner;
    const payload = {
      id: owner._id,
      email: owner.email,
      role: owner.role || 'admin',
      branchId: business._id,
      impersonatedBy: req.admin._id.toString(),
      isImpersonation: true,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    await logAdminActivity({
      adminId: req.admin,
      action: 'admin_impersonation',
      module: 'businesses',
      resourceId: businessId,
      resourceType: 'Business',
      details: { businessName: business.name, businessCode: business.code, ownerEmail: owner.email },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: { token, businessId: business._id.toString(), businessCode: business.code } });
  } catch (error) {
    logger.error('Impersonate error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /businesses/:id/reset-owner-password
router.post('/businesses/:id/reset-owner-password', setupMainDatabase, authenticateAdmin, requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { id: businessId } = req.params;
    const { Business, User } = req.mainModels;

    const business = await Business.findById(businessId).populate('owner');
    if (!business) return res.status(404).json({ success: false, error: 'Business not found' });
    if (!business.owner) return res.status(400).json({ success: false, error: 'Business has no owner' });

    const owner = business.owner;
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);
    await User.findByIdAndUpdate(owner._id, { password: hashed, updatedAt: new Date() });

    let emailSent = false;
    if (owner.email) {
      try {
        await emailService.initialize();
        if (emailService.enabled) {
          const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'there';
          const bizName = escapeHtml(business.name);
          const safeOwner = escapeHtml(ownerName);
          const html = `<p>Hello ${safeOwner},</p>
<p>An administrator reset your password for <strong>${bizName}</strong>.</p>
<p>Your temporary password is:</p>
<p style="font-family:ui-monospace,monospace;font-size:16px;font-weight:600;letter-spacing:0.04em;">${escapeHtml(tempPassword)}</p>
<p>Please sign in and change your password as soon as possible.</p>`;
          const text = `Hello ${ownerName},\n\nAn administrator reset your password for ${business.name}.\n\nYour temporary password is: ${tempPassword}\n\nPlease sign in and change your password as soon as possible.`;
          const mailResult = await emailService.sendEmail({
            to: owner.email,
            subject: `Your ${business.name} account password was reset`,
            html,
            text,
          });
          emailSent = mailResult.success === true;
          if (!emailSent) {
            logger.warn('Owner password reset: email not sent:', mailResult.error || mailResult);
          }
        }
      } catch (mailErr) {
        logger.error('Owner password reset email error:', mailErr);
      }
    }

    await logAdminActivity({
      adminId: req.admin,
      action: 'admin_password_reset',
      module: 'businesses',
      resourceId: businessId,
      resourceType: 'Business',
      details: { businessName: business.name, ownerEmail: owner.email, emailSent },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      data: {
        message: 'Password reset successfully. Share the temporary password with the owner securely.',
        tempPassword,
        emailSent,
      },
    });
  } catch (error) {
    logger.error('Reset owner password error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /businesses/:id/logs - Business activity logs
router.get('/businesses/:id/logs', setupMainDatabase, authenticateAdmin, requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { id: businessId } = req.params;
    const { page = 1, limit = 20, action: actionFilter, startDate, endDate } = req.query;
    const { Business } = req.mainModels;

    const business = await Business.findById(businessId).lean();
    if (!business) return res.status(404).json({ success: false, error: 'Business not found' });

    await logAdminActivity({
      adminId: req.admin,
      action: 'admin_log_access',
      module: 'businesses',
      resourceId: businessId,
      resourceType: 'Business',
      details: { businessName: business.name },
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    const conn = await databaseManager.getConnection(business.code || businessId, req.mainConnection);
    const models = modelFactory.getCachedBusinessModels(conn);
    const Sale = models.Sale;
    const Staff = models.Staff;
    const Appointment = models.Appointment;

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const logs = [];
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

    const sales = await Sale.find(dateFilter).sort({ createdAt: -1 }).limit(limitNum * 2).populate('staffId', 'name').lean();
    for (const s of sales) {
      if (actionFilter && !['invoice_created', 'sale_created'].includes(actionFilter)) continue;
      logs.push({ action: 'invoice_created', user: s.staffId?.name || 'System', description: `Invoice ${s.receiptNumber || s._id} created`, createdAt: s.createdAt });
    }
    const staffAdded = await Staff.find(dateFilter).sort({ createdAt: -1 }).limit(limitNum).lean();
    for (const st of staffAdded) {
      if (actionFilter && actionFilter !== 'staff_added') continue;
      logs.push({ action: 'staff_added', user: 'Owner', description: `Added staff member ${st.name || st.email}`, createdAt: st.createdAt });
    }
    const appointments = await Appointment.find(dateFilter).sort({ createdAt: -1 }).limit(limitNum).populate('clientId', 'name').populate('staffId', 'name').lean();
    for (const a of appointments) {
      if (actionFilter && actionFilter !== 'appointment_created') continue;
      logs.push({ action: 'appointment_created', user: a.staffId?.name || 'System', description: `Appointment for ${a.clientId?.name || 'Client'}`, createdAt: a.createdAt });
    }

    logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = logs.length;
    const pageNum = parseInt(page, 10);
    const skip = (pageNum - 1) * limitNum;
    const paginatedLogs = logs.slice(skip, skip + limitNum);

    res.json({
      success: true,
      data: paginatedLogs,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    logger.error('Get business logs error:', error);
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

    // Create owner user first — they are the first user and have full control as business admin
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

    // Build address and contact from whatever the user filled (same as in Business Settings)
    const address = {
      street: (businessInfo.address?.street || businessInfo.location?.street) || 'Not provided',
      city: businessInfo.address?.city || businessInfo.location?.city || '',
      state: businessInfo.address?.state || businessInfo.location?.state || '',
      zipCode: businessInfo.address?.zipCode || businessInfo.location?.zipCode || '',
      country: businessInfo.address?.country || businessInfo.location?.country || 'India'
    };
    const contact = {
      phone: businessInfo.contact?.phone || businessInfo.phone || '',
      email: businessInfo.contact?.email || businessInfo.email || '',
      website: (businessInfo.contact?.website || businessInfo.website) || ''
    };

    // Default settings; form can override via businessInfo.settings (e.g. operatingHours)
    const defaultOperatingHours = {
      monday: { open: '09:00', close: '18:00', closed: false },
      tuesday: { open: '09:00', close: '18:00', closed: false },
      wednesday: { open: '09:00', close: '18:00', closed: false },
      thursday: { open: '09:00', close: '18:00', closed: false },
      friday: { open: '09:00', close: '18:00', closed: false },
      saturday: { open: '09:00', close: '18:00', closed: false },
      sunday: { open: '10:00', close: '16:00', closed: false }
    };

    // Create business with all details from the form so they appear in Business Settings
    const business = new req.mainModels.Business({
      code: businessCode,
      name: businessInfo.name || businessInfo.businessName,
      businessType: (businessInfo.businessType || 'salon').toLowerCase(),
      address,
      contact,
      settings: {
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        currencySymbol: '₹',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '12',
        taxRate: 18,
        gstNumber: (businessInfo.settings && businessInfo.settings.gstNumber) || '',
        businessLicense: (businessInfo.settings && businessInfo.settings.businessLicense) || '',
        operatingHours: (businessInfo.settings && businessInfo.settings.operatingHours) || defaultOperatingHours,
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
        ...(businessInfo.settings || {})
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
      logger.debug(`🔧 Creating business database for new business: ${business.name} (Code: ${business.code})`);
      const businessConnection = await databaseManager.getConnection(business.code, req.mainConnection);
      const businessModels = modelFactory.getCachedBusinessModels(businessConnection);
      
      // Create default business settings from creation form data so Business Settings reflect the same info
      const defaultSettings = new businessModels.BusinessSettings({
        branchId: business._id,
        name: business.name,
        email: business.contact.email,
        phone: business.contact.phone,
        website: business.contact.website || '',
        description: `${business.name} - ${(business.businessType || 'salon').replace('_', ' ')}`,
        address: business.address.street,
        city: business.address.city,
        state: business.address.state,
        zipCode: business.address.zipCode,
        receiptPrefix: "INV",
        invoicePrefix: "INV",
        receiptNumber: 1,
        autoIncrementReceipt: true,
        currency: (business.settings && business.settings.currency) || 'INR',
        taxRate: (business.settings && business.settings.taxRate) != null ? business.settings.taxRate : 18,
        gstNumber: (business.settings && business.settings.gstNumber) || '',
        processingFee: 2.9,
        enableCurrency: true,
        enableTax: true,
        enableProcessingFees: true,
        socialMedia: `@${(business.name || '').toLowerCase().replace(/\s+/g, '')}`
      });
      
      await defaultSettings.save();
      logger.debug(`✅ Default business settings created for ${business.name}`);
    } catch (settingsError) {
      logger.error('Error creating default business settings:', settingsError);
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
    logger.error('Create business error:', error);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
});

// Update Business
router.put('/businesses/:id', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'update'), async (req, res) => {
  try {
    logger.debug('Update business request:', req.params.id, req.body);
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
    logger.error('Update business error:', error);
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
    logger.error('Toggle business status error:', error);
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
    logger.error('Get business stats error:', error);
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
        totalRevenue: 0,
        recentBusinesses,
        systemStatus: {
          api: 'operational',
          database: 'operational',
          uptime: 99.9
        }
      }
    });
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get All Users with Business Associations
router.get('/users', setupMainDatabase, authenticateAdmin, checkAdminPermission('users', 'view'), async (req, res) => {
  try {
    logger.debug('🔍🔍🔍 ADMIN USERS ENDPOINT CALLED - NEW VERSION 🔍🔍🔍');
    const { User, Business } = req.mainModels;
    
    // Get all businesses first
    const businesses = await Business.find({}).lean();
    logger.debug('📊 Found businesses:', businesses.length);
    
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
    
    logger.debug('👥 Main users found:', mainUsersWithBusiness.length);

    // Get staff from each business database
    const allStaff = [];
    for (const business of businesses) {
      try {
        logger.debug(`🔍 Processing business: ${business.name} (${business.code})`);
        // Connect to business database using business code
        const databaseManager = require('../config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const businessDb = await databaseManager.getConnection(business.code || business._id, mainConnection);
        logger.debug(`📡 Connected to database for business: ${business.name} (${business.code})`);
        
        const Staff = businessDb.model('Staff', require('../models/Staff').schema);
        logger.debug(`📋 Staff model created for ${business.name}`);
        
        // Get staff from this business
        const staff = await Staff.find({}).lean();
        logger.debug(`👥 Raw staff count for ${business.name}:`, staff.length);
        
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
        logger.debug(`👷 Staff from ${business.name}:`, staffWithBusiness.length);
      } catch (error) {
        logger.error(`Error fetching staff for business ${business.name}:`, error);
        // Continue with other businesses even if one fails
      }
    }
    
    logger.debug('👷 Total staff found:', allStaff.length);

    // Combine main users and staff
    const allUsers = [...mainUsersWithBusiness, ...allStaff];
    
    // Sort by creation date
    allUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    logger.debug('📋 Total users to return:', allUsers.length);

    res.json({
      success: true,
      data: allUsers
    });
  } catch (error) {
    logger.error('Get all users error:', error);
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
        logger.error('⚠️  Error deleting business database during permanent delete:', dbError.message);
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
      logger.debug(`✅ Business database deleted: ease_my_salon_${businessCode}`);
    } catch (dbError) {
      logger.error('⚠️  Error deleting business database:', dbError);
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
    logger.error('Delete business error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
