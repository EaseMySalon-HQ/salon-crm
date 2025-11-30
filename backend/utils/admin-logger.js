const databaseManager = require('../config/database-manager');

/**
 * Log admin activity to the database
 * @param {Object} options - Logging options
 * @param {string|Object} options.adminId - Admin user ID or admin object
 * @param {string} options.action - Action type (create, update, delete, etc.)
 * @param {string} options.module - Module name (businesses, users, roles, etc.)
 * @param {string} [options.resourceId] - ID of the affected resource
 * @param {string} [options.resourceType] - Type of resource (e.g., 'Business', 'Admin', 'Role')
 * @param {Object} [options.details] - Additional details/metadata
 * @param {string} [options.ipAddress] - IP address of the request
 * @param {string} [options.userAgent] - User agent string
 */
async function logAdminActivity(options) {
  try {
    const {
      adminId,
      action,
      module,
      resourceId,
      resourceType,
      details = {},
      ipAddress,
      userAgent
    } = options;

    if (!adminId || !action || !module) {
      console.warn('Admin logger: Missing required fields', { adminId, action, module });
      return;
    }

    const mainConnection = await databaseManager.getMainConnection();
    const AdminActivityLog = mainConnection.model('AdminActivityLog', require('../models/AdminActivityLog').schema);
    const Admin = mainConnection.model('Admin', require('../models/Admin').schema);

    // Resolve admin info
    let adminEmail, adminName;
    if (typeof adminId === 'object' && adminId.email) {
      // Already have admin object
      adminEmail = adminId.email;
      adminName = `${adminId.firstName || ''} ${adminId.lastName || ''}`.trim() || adminId.email;
    } else {
      // Fetch admin by ID
      const admin = await Admin.findById(adminId).select('email firstName lastName').lean();
      if (!admin) {
        console.warn('Admin logger: Admin not found', { adminId });
        return;
      }
      adminEmail = admin.email;
      adminName = `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email;
    }

    const resolvedAdminId = typeof adminId === 'object' ? adminId._id : adminId;

    // Create log entry
    await AdminActivityLog.create({
      adminId: resolvedAdminId,
      adminEmail,
      adminName,
      action,
      module,
      resourceId: resourceId?.toString(),
      resourceType,
      details,
      ipAddress,
      userAgent,
      timestamp: new Date()
    });
  } catch (error) {
    // Log errors but don't throw - logging should never break the main flow
    console.error('Failed to log admin activity:', error);
  }
}

/**
 * Middleware to automatically log admin actions
 * @param {string} action - Action type
 * @param {string} module - Module name
 * @param {Function} [getResourceId] - Function to extract resource ID from req
 * @param {Function} [getResourceType] - Function to extract resource type
 * @param {Function} [getDetails] - Function to extract additional details from req
 */
function createLoggingMiddleware(action, module, getResourceId = null, getResourceType = null, getDetails = null) {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json to log after response
    res.json = function(data) {
      // Only log successful operations (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300 && data.success !== false) {
        const resourceId = getResourceId ? getResourceId(req) : req.params.id || req.params.userId || req.params.roleId || req.params.businessId;
        const resourceType = getResourceType ? getResourceType(req) : null;
        const details = getDetails ? getDetails(req, data) : {};

        logAdminActivity({
          adminId: req.admin,
          action,
          module,
          resourceId,
          resourceType,
          details,
          ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          userAgent: req.headers['user-agent']
        }).catch(err => {
          console.error('Error in logging middleware:', err);
        });
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Helper to extract IP address from request
 */
function getClientIp(req) {
  return req.ip || 
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         'unknown';
}

module.exports = {
  logAdminActivity,
  createLoggingMiddleware,
  getClientIp
};

