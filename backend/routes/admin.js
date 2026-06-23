const express = require('express');
const { logger } = require('../utils/logger');
const bcrypt = require('bcryptjs');
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
const { seedDefaultTenantData } = require('../lib/seed-default-tenant-data');
const { applyInitialBusinessPlan, buildLeadTrialPlanPayload, invalidatePlanCache } = require('../lib/apply-initial-business-plan');
const { linkPlatformLeadToBusiness } = require('../lib/link-platform-lead-to-business');
const { creditBusinessWalletFromAdmin } = require('../lib/admin-business-wallet-credit');
const { getPlanInfo } = require('../lib/entitlements');
const { generateNextBusinessCode } = require('../lib/generate-business-code');
const crypto = require('crypto');
const emailService = require('../services/email-service');
const {
  signPlatformAdminAccess,
  setAdminAuthCookies,
  clearAdminAuthCookies,
  signTenantAccess,
  setTenantAuthCookies,
  COOKIE,
} = require('../lib/auth-tokens');
const { validate } = require('../middleware/validate');
const { adminLoginSchema } = require('../validation/schemas');
const { setCsrfCookie } = require('../middleware/csrf');

const router = express.Router();

function escapeHtml(str) {
  if (str == null || str === '') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Admin Login — role/permissions come from DB after verify; never trust client-supplied role
router.post('/login', setupMainDatabase, validate(adminLoginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const { Admin } = req.mainModels;

    logger.debug('🔍 Admin login attempt:', { email: email ? email.toLowerCase() : 'missing' });

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

    const token = signPlatformAdminAccess(admin);
    setAdminAuthCookies(res, { accessToken: token });
    const csrfToken = setCsrfCookie(res);

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
        token,
        csrfToken
      }
    });
  } catch (error) {
    logger.error('Admin login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/logout', setupMainDatabase, authenticateAdmin, (req, res) => {
  clearAdminAuthCookies(res);
  res.json({ success: true, message: 'Logged out' });
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
      query['plan.planId'] = plan;
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
      plan: getPlanInfo(b),
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

// POST /businesses/:id/impersonate - Impersonate business owner
router.post('/businesses/:id/impersonate', setupMainDatabase, authenticateAdmin, requireAdminRole('super_admin'), async (req, res) => {
  try {
    const { id: businessId } = req.params;
    const { Business } = req.mainModels;

    const business = await Business.findById(businessId).populate('owner');
    if (!business) return res.status(404).json({ success: false, error: 'Business not found' });
    if (!business.owner) return res.status(400).json({ success: false, error: 'Business has no owner' });
    const { isAccessBlockedBySuspension } = require('../lib/suspension-grace');
    if (isAccessBlockedBySuspension(business)) {
      return res.status(403).json({ success: false, error: 'Cannot impersonate suspended business' });
    }

    const owner = business.owner;
    const token = signTenantAccess(
      {
        _id: owner._id,
        email: owner.email,
        role: owner.role || 'admin',
        branchId: business._id,
        impersonatedBy: req.admin._id.toString(),
        isImpersonation: true,
      },
      '1h'
    );

    setTenantAuthCookies(res, { accessToken: token, refreshToken: '' });
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

    res.json({ success: true, data: { businessId: business._id.toString(), businessCode: business.code } });
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

// GET /businesses/:id/logs — per-business append-only audit (main DB activity_logs)
router.get(
  '/businesses/:id/logs',
  setupMainDatabase,
  authenticateAdmin,
  checkAdminPermission('logs', 'view'),
  async (req, res) => {
    try {
      const { id: businessId } = req.params;
      const {
        page = 1,
        limit = 50,
        action: actionFilter,
        actorType: actorTypeFilter,
        startDate,
        endDate,
      } = req.query;

      if (!mongoose.Types.ObjectId.isValid(businessId)) {
        return res.status(400).json({ success: false, error: 'Invalid business id' });
      }

      const { Business, ActivityLog } = req.mainModels;

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

      const bid = new mongoose.Types.ObjectId(businessId);
      const query = { businessId: bid };

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }
      if (actionFilter && String(actionFilter).trim()) {
        query.action = String(actionFilter).trim();
      }
      if (actorTypeFilter && ['admin', 'staff', 'system'].includes(String(actorTypeFilter))) {
        query.actorType = actorTypeFilter;
      }

      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const skip = (pageNum - 1) * limitNum;

      const [total, logs] = await Promise.all([
        ActivityLog.countDocuments(query),
        ActivityLog.find(query)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
      ]);

      const data = (logs || []).map((log) => ({
        id: log._id?.toString(),
        businessId: log.businessId?.toString(),
        actorType: log.actorType,
        actorId: log.actorId?.toString() || null,
        action: log.action,
        entity: log.entity || '',
        entityId: log.entityId?.toString() || null,
        summary: log.summary,
        metadata: log.metadata || {},
        createdAt: log.createdAt,
      }));

      res.json({
        success: true,
        data,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      });
    } catch (error) {
      logger.error('Get business logs error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// Create New Business
router.post('/businesses', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'create'), async (req, res) => {
  try {
    
    const {
      businessInfo,
      ownerInfo,
      plan: planPayload,
      leadId,
    } = req.body;

    // Handle both data structures - ownerInfo as separate field or nested under businessInfo.owner
    const ownerData = ownerInfo || businessInfo?.owner;
    
    if (!ownerData) {
      return res.status(400).json({ success: false, error: 'Owner information is required' });
    }
    
    if (!ownerData.password) {
      return res.status(400).json({ success: false, error: 'Owner password is required' });
    }

    // Find-or-create owner. Multi-branch: one User per email, many Business docs
    // pointing to the same User._id. The unique index on User.email is preserved.
    const ownerEmail = String(ownerData.email || '').toLowerCase().trim();
    let owner = await req.mainModels.User.findOne({ email: ownerEmail });

    if (!owner) {
      // First branch for this email — create the owner user with full business-admin access
      const hashedPassword = await bcrypt.hash(ownerData.password, 10);
      owner = new req.mainModels.User({
        firstName: ownerData.firstName,
        lastName: ownerData.lastName,
        email: ownerEmail,
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
    } else {
      // Email already exists — this owner is adding another branch. Verify the
      // password matches their existing account before attaching a new business.
      const validPassword = await bcrypt.compare(ownerData.password, owner.password);
      if (!validPassword) {
        return res.status(400).json({
          success: false,
          message:
            'This email is already registered. Please enter your existing password to add a new branch to your account.',
        });
      }

      // Defense-in-depth: only allow attaching a new business to an account that
      // already owns at least one business (prevents accidentally binding a new
      // branch to an unrelated user record that happens to share the email).
      const ownsAny = await req.mainModels.Business.exists({
        owner: owner._id,
        status: { $ne: 'deleted' },
      });
      if (!ownsAny) {
        return res.status(409).json({
          success: false,
          message:
            'This email already belongs to a non-owner account and cannot be used to register a new business.',
        });
      }
    }

    const businessCode = await generateNextBusinessCode(req.mainModels.Business);

    // Build address and contact from whatever the user filled (same as in Business Settings)
    const address = {
      street: String(businessInfo.address?.street || businessInfo.location?.street || '').trim() || 'Not provided',
      city: String(businessInfo.address?.city || businessInfo.location?.city || '').trim() || 'Not provided',
      state: String(businessInfo.address?.state || businessInfo.location?.state || '').trim() || 'NA',
      zipCode: String(businessInfo.address?.zipCode || businessInfo.location?.zipCode || '').trim() || 'NA',
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

    try {
      if (leadId) {
        applyInitialBusinessPlan(business, buildLeadTrialPlanPayload('pro'));
      } else {
        applyInitialBusinessPlan(business, planPayload);
      }
    } catch (planError) {
      if (planError.code === 'INVALID_PLAN') {
        return res.status(400).json({ success: false, error: planError.message });
      }
      throw planError;
    }

    await business.save();
    invalidatePlanCache(business._id);

    // Set the owner's primary/default branch only on their first business. For
    // subsequent branches we leave User.branchId untouched so existing single-branch
    // flows (and anything reading user.branchId) keep their current semantics; the
    // owner's full set of branches is derived from Business docs, not from User.
    if (!owner.branchId) {
      owner.branchId = business._id;
      await owner.save();
    }

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

      await seedDefaultTenantData(businessModels, business._id, {
        businessCode: business.code,
        logger,
      });
    } catch (settingsError) {
      logger.error('Error creating default business settings:', settingsError);
      // Don't fail the business creation if settings creation fails
    }

    if (leadId) {
      try {
        await linkPlatformLeadToBusiness(req.mainModels, {
          leadId,
          businessId: business._id,
          admin: req.admin,
          applyBusinessTrial: false,
        });
      } catch (leadError) {
        if (leadError.code === 'ALREADY_CONVERTED') {
          logger.warn('Lead %s already converted when linking new business %s', leadId, business._id);
        } else {
          logger.error('Error linking lead after business create:', leadError);
        }
      }
    }

    res.status(201).json({
      success: true,
      data: {
        business,
        owner: {
          id: owner._id,
          name: `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || 'Business Owner',
          email: owner.email,
        }
      },
      message: 'Business created successfully'
    });
  } catch (error) {
    logger.error('Create business error:', error);
    logger.error('Error stack:', error.stack);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
});

// Toggle platform-level tenant email kill switch (operational emails only)
router.patch(
  '/businesses/:id/platform-email',
  setupMainDatabase,
  authenticateAdmin,
  checkAdminPermission('businesses', 'update'),
  async (req, res) => {
    try {
      const { platformEmailDisabled } = req.body;
      if (typeof platformEmailDisabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'platformEmailDisabled must be a boolean',
        });
      }
      const business = await req.mainModels.Business.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            'settings.platformEmailDisabled': platformEmailDisabled,
            updatedAt: new Date(),
          },
        },
        { new: true }
      )
        .populate('owner', 'firstName lastName email mobile')
        .lean();

      if (!business) {
        return res.status(404).json({ success: false, error: 'Business not found' });
      }

      logAdminActivity({
        adminId: req.admin,
        action: 'update',
        module: 'businesses',
        details: {
          businessId: req.params.id,
          platformEmailDisabled,
        },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      }).catch((err) => logger.error('Failed to log admin activity:', err));

      res.json({
        success: true,
        data: business,
        message: platformEmailDisabled
          ? 'Email notifications disabled for this business'
          : 'Email notifications enabled for this business',
      });
    } catch (error) {
      logger.error('platform-email toggle error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

router.get(
  '/businesses/:id/wallet',
  setupMainDatabase,
  authenticateAdmin,
  checkAdminPermission('businesses', 'view'),
  async (req, res) => {
    try {
      const { Business } = req.mainModels;
      const business = await Business.findById(req.params.id).select('wallet name status').lean();
      if (!business) {
        return res.status(404).json({ success: false, error: 'Business not found' });
      }
      const balancePaise = Number(business?.wallet?.balancePaise || 0);
      res.json({
        success: true,
        data: {
          businessId: business._id,
          businessName: business.name,
          status: business.status,
          balancePaise,
          balanceRupees: balancePaise / 100,
        },
      });
    } catch (error) {
      logger.error('Get business wallet error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

router.post(
  '/businesses/:id/wallet/credit',
  setupMainDatabase,
  authenticateAdmin,
  checkAdminPermission('businesses', 'update'),
  async (req, res) => {
    try {
      const { Business } = req.mainModels;
      const WalletTransaction = req.mainConnection.model(
        'WalletTransaction',
        require('../models/WalletTransaction').schema,
      );
      const { amountRupees, note } = req.body || {};

      const result = await creditBusinessWalletFromAdmin({
        Business,
        WalletTransaction,
        businessId: req.params.id,
        amountRupees,
        note,
        admin: req.admin,
      });

      logAdminActivity({
        adminId: req.admin,
        action: 'update',
        module: 'businesses',
        resourceId: req.params.id,
        resourceType: 'Business',
        details: {
          walletCredit: true,
          amountRupees: result.amountRupees,
          newBalanceRupees: result.newBalanceRupees,
          transactionId: result.transactionId,
          note: note != null ? String(note).trim() : '',
        },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      }).catch((err) => logger.error('Failed to log admin activity:', err));

      res.json({
        success: true,
        data: result,
        message: `Added ₹${result.amountRupees.toFixed(2)} to messaging wallet`,
      });
    } catch (error) {
      if (error.status === 400 || error.status === 404) {
        return res.status(error.status).json({ success: false, error: error.message });
      }
      logger.error('Admin wallet credit error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

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
      const business = await Business.findById(req.params.id);
      if (!business) {
        return res.status(404).json({ success: false, error: 'Business not found' });
      }

      const { User } = req.mainModels;
      const ownerUpdate = {};
      if (ownerInfo.firstName) ownerUpdate.firstName = ownerInfo.firstName;
      if (ownerInfo.lastName) ownerUpdate.lastName = ownerInfo.lastName;
      if (ownerInfo.phone) ownerUpdate.mobile = ownerInfo.phone;
      if (typeof ownerInfo.hasLoginAccess === 'boolean') ownerUpdate.hasLoginAccess = ownerInfo.hasLoginAccess;

      if (ownerInfo.password && ownerInfo.password.trim()) {
        ownerUpdate.password = await bcrypt.hash(ownerInfo.password, 10);
        ownerUpdate.passwordUpdatedAt = new Date();
        ownerUpdate.updatedAt = new Date();
        ownerUpdate.hasLoginAccess = true;
      }

      let targetOwnerId = business.owner;

      if (ownerInfo.email) {
        const newEmail = String(ownerInfo.email).toLowerCase().trim();
        const currentOwner = business.owner ? await User.findById(business.owner) : null;

        if (!currentOwner) {
          return res.status(400).json({ success: false, error: 'Business has no owner account to update' });
        }

        if (newEmail !== currentOwner.email) {
          const existingUser = await User.findOne({ email: newEmail });
          if (existingUser && String(existingUser._id) !== String(currentOwner._id)) {
            const ownsAny = await Business.exists({
              owner: existingUser._id,
              status: { $ne: 'deleted' },
            });
            if (!ownsAny) {
              return res.status(409).json({
                success: false,
                error: 'This email already belongs to a non-owner account and cannot be assigned to this business.',
              });
            }
            targetOwnerId = existingUser._id;
            updateData.owner = existingUser._id;
          } else {
            ownerUpdate.email = newEmail;
          }
        }
      }

      if (Object.keys(ownerUpdate).length > 0 && targetOwnerId) {
        await User.findByIdAndUpdate(targetOwnerId, { $set: ownerUpdate }, { new: true });
      } else if (updateData.owner) {
        // Owner re-linked to an existing account; no other user fields to patch.
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
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({
        success: false,
        error:
          'That email is already registered to another account. Use an existing owner email to link this business to their account, or choose a different email.',
      });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Toggle Business Status
router.patch('/businesses/:id/status', setupMainDatabase, authenticateAdmin, checkAdminPermission('businesses', 'update'), async (req, res) => {
  try {
    const { status } = req.body;
    const { statusUpdateFields } = require('../lib/suspension-grace');
    const business = await req.mainModels.Business.findByIdAndUpdate(
      req.params.id,
      statusUpdateFields(status),
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
router.get(
  '/businesses/:id/stats',
  setupMainDatabase,
  authenticateAdmin,
  checkAdminPermission('businesses', 'view'),
  async (req, res) => {
    try {
      const businessId = req.params.id;
      const { User, Business } = req.mainModels;

      const business = await Business.findById(businessId).select('code').lean();
      if (!business) {
        return res.status(404).json({ success: false, error: 'Business not found' });
      }

      const mainConnection = await databaseManager.getMainConnection();
      const businessDb = await databaseManager.getConnection(business.code || businessId, mainConnection);

      const Client = businessDb.model('Client', require('../models/Client').schema);
      const Appointment = businessDb.model('Appointment', require('../models/Appointment').schema);
      const Sale = businessDb.model('Sale', require('../models/Sale').schema);
      const Staff = businessDb.model('Staff', require('../models/Staff').schema);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        totalUsers,
        activeUsers,
        totalStaff,
        activeStaff,
        totalClients,
        totalAppointments,
        totalSales,
        monthlyRevenueAgg,
      ] = await Promise.all([
        User.countDocuments({ branchId: businessId }),
        User.countDocuments({ branchId: businessId, isActive: true }),
        Staff.countDocuments({}),
        Staff.countDocuments({ isActive: true }),
        Client.countDocuments(),
        Appointment.countDocuments(),
        Sale.countDocuments(),
        Sale.aggregate([
          {
            $match: {
              createdAt: { $gte: thirtyDaysAgo },
              status: { $nin: ['cancelled', 'Cancelled'] },
            },
          },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$grossTotal', 0] } } } },
        ]),
      ]);

      const monthlyRevenue = monthlyRevenueAgg[0]?.total || 0;

      res.json({
        success: true,
        data: {
          totalUsers,
          activeUsers,
          totalStaff,
          activeStaff,
          totalClients,
          totalAppointments,
          totalSales,
          monthlyRevenue,
        },
      });
    } catch (error) {
      logger.error('Get business stats error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);



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

    // Delete the business owner from the main database ONLY if they do not own any
    // other non-deleted business. Multi-branch owners share a single User across
    // every branch, so deleting one branch must not orphan the owner's remaining
    // branches (which would lock them out of those branches entirely).
    if (business.owner) {
      const remainingOwned = await req.mainModels.Business.countDocuments({
        owner: business.owner._id,
        _id: { $ne: business._id },
        status: { $ne: 'deleted' },
      });

      if (remainingOwned === 0) {
        await req.mainModels.User.findByIdAndDelete(business.owner._id);
      } else if (String(business.owner.branchId) === String(business._id)) {
        // Owner still has active branches but their active-branch pointer referenced
        // the branch being deleted — repoint it to a surviving branch so login and
        // branch resolution keep working.
        const fallbackBranch = await req.mainModels.Business.findOne({
          owner: business.owner._id,
          _id: { $ne: business._id },
          status: { $ne: 'deleted' },
        })
          .sort({ createdAt: 1 })
          .select('_id');

        await req.mainModels.User.findByIdAndUpdate(business.owner._id, {
          branchId: fallbackBranch?._id,
          updatedAt: new Date(),
        });
      }
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
