const jwt = require('jsonwebtoken');
const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const {
  applyPermissionOverrides,
  normalizePermissionOverrides
} = require('../utils/permission-helpers');
const { JWT_SECRET } = require('../config/jwt');
const { COOKIE, TOKEN_USE } = require('../lib/auth-tokens');

require('dotenv').config();

/**
 * Bearer first, then HttpOnly admin cookie (credentialed admin UI requests).
 */
function getPlatformAdminToken(req) {
  const fromHeader = req.header('Authorization')?.replace('Bearer ', '');
  if (fromHeader) return fromHeader;
  if (req.cookies && req.cookies[COOKIE.adminAccess]) {
    return req.cookies[COOKIE.adminAccess];
  }
  return null;
}

const authenticateAdmin = async (req, res, next) => {
  try {
    const token = getPlatformAdminToken(req);

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Reject tenant tokens on platform admin API
    if (
      decoded.tokenUse === TOKEN_USE.tenantAccess ||
      decoded.tokenUse === TOKEN_USE.tenantRefresh
    ) {
      return res.status(403).json({ success: false, error: 'Invalid admin token' });
    }
    if (decoded.tokenUse && decoded.tokenUse !== TOKEN_USE.platformAdmin) {
      return res.status(403).json({ success: false, error: 'Invalid admin token' });
    }
    const mainConnection = await databaseManager.getMainConnection();
    const Admin = mainConnection.model('Admin', require('../models/Admin').schema);
    const AdminRole = mainConnection.model('AdminRole', require('../models/AdminRole').schema);

    const admin = await Admin.findById(decoded.id).select('-password');

    if (!admin || !admin.isActive) {
      return res.status(401).json({ success: false, error: 'Invalid admin token' });
    }

    let role = null;

    if (admin.roleId) {
      role = await AdminRole.findById(admin.roleId);
    }

    if (!role && admin.role) {
      role = await AdminRole.findOne({ key: admin.role });
      if (role && !admin.roleId) {
        admin.roleId = role._id;
        await admin.save();
      }
    }

    if (role) {
      admin.role = role.key;
    }

    const basePermissions = role?.permissions || admin.permissions || [];
    const overrides = normalizePermissionOverrides(admin.permissionOverrides || {});
    const effectivePermissions = applyPermissionOverrides(basePermissions, overrides);
    admin.permissions = effectivePermissions;

    req.admin = admin;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    logger.error('Admin authentication error:', error.message);
    return res.status(500).json({ success: false, error: 'Authentication service error' });
  }
};

const requireAdminRole = (...roles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient admin permissions' });
    }

    next();
  };
};

/**
 * Check if admin has permission for a specific module and action
 * Super admins have all permissions
 */
const checkAdminPermission = (module, action) => {
  return async (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Super admin has all permissions
    if (req.admin.role === 'super_admin') {
      return next();
    }

    // Check if admin has the required permission
    const hasPermission = req.admin.permissions?.some(
      (permission) => permission.module === module && permission.actions?.includes(action)
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required permission: ${module}.${action}`
      });
    }

    next();
  };
};

module.exports = {
  authenticateAdmin,
  requireAdminRole,
  checkAdminPermission
};

