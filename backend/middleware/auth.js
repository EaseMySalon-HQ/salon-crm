const jwt = require('jsonwebtoken');
const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const { JWT_SECRET } = require('../config/jwt');
const { COOKIE, TOKEN_USE } = require('../lib/auth-tokens');

require('dotenv').config();

/**
 * Prefer Authorization Bearer; fall back to HttpOnly access cookie (same-site / credentialed requests).
 */
function getTenantAccessToken(req) {
  const authHeader = req.headers['authorization'];
  const fromHeader = authHeader && authHeader.split(' ')[1];
  if (fromHeader) return fromHeader;
  if (req.cookies && req.cookies[COOKIE.tenantAccess]) {
    return req.cookies[COOKIE.tenantAccess];
  }
  return null;
}

const authenticateToken = (req, res, next) => {
  logger.debug('🔍 AuthenticateToken middleware called');
  const token = getTenantAccessToken(req);

  if (!token) {
    logger.debug('🔍 No token found in request');
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  // Reject mock tokens - only allow real JWT tokens
  if (token.startsWith('mock-token-')) {
    logger.debug('🔑 Mock token detected, rejecting for security');
    return res.status(401).json({ success: false, error: 'Invalid token format' });
  }

  // Regular JWT verification for production tokens
  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      logger.debug('🔍 JWT verification error:', err.message);
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }

    // Wrong token type for tenant API (refresh / platform admin must not be used here)
    if (
      decoded.tokenUse === TOKEN_USE.tenantRefresh ||
      decoded.tokenUse === TOKEN_USE.platformAdmin
    ) {
      return res.status(403).json({ success: false, error: 'Invalid token for this endpoint' });
    }
    // Legacy tokens have no tokenUse — treated as tenant access

    logger.debug('🔍 JWT decoded (subject id present):', Boolean(decoded && decoded.id));

    try {
      // First try to find user in main database
      const mainConnection = await databaseManager.getMainConnection();
      const User = mainConnection.model('User', require('../models/User').schema);
      
      let user = await User.findById(decoded.id).select('-password');
      let staffUser = null; // Set when user is from Staff (business DB)
      
      if (!user) {
        logger.debug('🔍 User not found in main database, checking if it\'s a staff user');
        let businessId = decoded.branchId || null;
        
        // If branchId is in token, directly check that business database
        if (businessId) {
          try {
            const businessDb = await databaseManager.getConnection(businessId, mainConnection);
            const Staff = businessDb.model('Staff', require('../models/Staff').schema);
            staffUser = await Staff.findById(decoded.id).select('-password');
            if (staffUser) {
              logger.debug('🔍 Staff user found in business database (from token branchId):', businessId);
            }
          } catch (error) {
            logger.debug('🔍 Error checking business database with branchId from token:', error.message);
          }
        }
        
        // If not found and no branchId in token, check all business databases
        if (!staffUser && !businessId) {
          const Business = mainConnection.model('Business', require('../models/Business').schema);
          const businesses = await Business.find({}).lean();
          
          for (const business of businesses) {
            try {
              const businessDb = await databaseManager.getConnection(business.code || business._id, mainConnection);
              const Staff = businessDb.model('Staff', require('../models/Staff').schema);
              
              const staff = await Staff.findById(decoded.id).select('-password');
              if (staff) {
                staffUser = staff;
                businessId = business._id;
                logger.debug('🔍 Staff user found in business database:', business.name, business._id);
                break;
              }
            } catch (error) {
              logger.debug('🔍 Error checking business database:', business.name, error.message);
              // Continue to next business
            }
          }
        }
        
        if (!staffUser) {
          logger.debug('🔍 User not found in any database for ID:', decoded.id);
          return res.status(401).json({ success: false, error: 'User not found' });
        }

        // Use default permissions for role when staff has none configured
        let staffPermissions = staffUser.permissions || [];
        if (!staffPermissions.length && staffUser.role) {
          const { roleDefinitions } = require('../models/Permission');
          staffPermissions = roleDefinitions[staffUser.role]?.permissions || [];
        }
        
        // Convert staff user to user format (Staff are never owner - only User from business creation)
        user = {
          _id: staffUser._id,
          firstName: staffUser.name?.split(' ')[0] || '',
          lastName: staffUser.name?.split(' ').slice(1).join(' ') || '',
          email: staffUser.email,
          mobile: staffUser.phone,
          role: staffUser.role,
          branchId: businessId || staffUser.branchId,
          hasLoginAccess: staffUser.hasLoginAccess,
          allowAppointmentScheduling: staffUser.allowAppointmentScheduling,
          isActive: staffUser.isActive,
          isOwner: false, // Staff are never owner
          permissions: staffPermissions,
          specialties: staffUser.specialties,
          hourlyRate: staffUser.hourlyRate,
          commissionRate: staffUser.commissionRate,
          notes: staffUser.notes,
          commissionProfileIds: staffUser.commissionProfileIds,
          createdAt: staffUser.createdAt,
          updatedAt: staffUser.updatedAt
        };
      }

      logger.debug('🔍 Auth middleware user:', {
        id: user._id,
        email: user.email,
        branchId: user.branchId,
        role: user.role
      });

      // Ensure the user object has all required fields
      // isOwner: only User created at business creation (main DB, has branchId); Staff are never owner
      let isOwner = false;
      if (staffUser === null && user.branchId && user.role === 'admin') {
        try {
          const Business = mainConnection.model('Business', require('../models/Business').schema);
          const business = await Business.findById(user.branchId).select('owner').lean();
          isOwner = business?.owner && business.owner.toString() === (user._id?.toString() || user.id?.toString());
        } catch (e) {
          // Fallback: User with branchId is typically the owner
          isOwner = true;
        }
      }
      req.user = {
        _id: user._id,
        id: user._id,
        email: user.email,
        branchId: user.branchId,
        role: user.role,
        isOwner,
        firstName: user.firstName,
        lastName: user.lastName,
        mobile: user.mobile,
        avatar: user.avatar,
        hasLoginAccess: user.hasLoginAccess,
        allowAppointmentScheduling: user.allowAppointmentScheduling,
        isActive: user.isActive,
        permissions: user.permissions,
        specialties: user.specialties,
        hourlyRate: user.hourlyRate,
        commissionRate: user.commissionRate,
        notes: user.notes,
        commissionProfileIds: user.commissionProfileIds,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        ...(decoded.isImpersonation && {
          isImpersonation: true,
          impersonatedBy: decoded.impersonatedBy,
        }),
      };

      logger.debug('🔍 Auth middleware req.user set:', {
        id: req.user.id,
        email: req.user.email,
        branchId: req.user.branchId,
        role: req.user.role
      });

      // Platform admin impersonation: full app access (not subject to tenant suspension)
      if (decoded.isImpersonation) {
        req.businessSuspended = false;
        req.businessNextBillingDate = null;
        return next();
      }

      // Tenant billing suspension: allow auth endpoints only (login already issued a token)
      if (req.user.branchId) {
        const Business = mainConnection.model('Business', require('../models/Business').schema);
        const business = await Business.findById(req.user.branchId).select('status plan').lean();
        req.businessStatus = business?.status;
        if (!business) {
          req.businessSuspended = false;
          req.businessNextBillingDate = null;
        } else {
          req.businessSuspended = business.status === 'suspended';
          const plan = business.plan;
          const rawNext = plan?.renewalDate || plan?.trialEndsAt;
          req.businessNextBillingDate =
            rawNext != null ? new Date(rawNext).toISOString() : null;
        }

        const normalizedPath = `${req.baseUrl || ''}${req.path || ''}`.split('?')[0];
        const authOnlyPaths = new Set(['/api/auth/profile', '/api/auth/logout', '/api/auth/refresh']);
        if (req.businessSuspended && !authOnlyPaths.has(normalizedPath)) {
          const supportEmail = process.env.SUSPENSION_SUPPORT_EMAIL || 'support@easemysalon.in';
          return res.status(403).json({
            success: false,
            error: 'BUSINESS_SUSPENDED',
            message:
              'Your account is suspended. Contact support to renew billing and restore access.',
            nextBillingDate: req.businessNextBillingDate,
            suspensionSupportEmail: supportEmail,
            suspensionSupportPhone: process.env.SUSPENSION_SUPPORT_PHONE || undefined,
          });
        }
      }

      next();
    } catch (error) {
      logger.error('Error in auth middleware:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    next();
  };
};

const requireAdmin = authorizeRoles('admin');
const requireManager = authorizeRoles('admin', 'manager');
const requireStaff = authorizeRoles('admin', 'manager', 'staff');

module.exports = {
  authenticateToken,
  authorizeRoles,
  requireAdmin,
  requireManager,
  requireStaff
};
