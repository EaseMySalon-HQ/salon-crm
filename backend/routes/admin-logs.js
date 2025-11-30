const express = require('express');
const router = express.Router();
const databaseManager = require('../config/database-manager');
const { setupMainDatabase } = require('../middleware/business-db');
const { authenticateAdmin, checkAdminPermission } = require('../middleware/admin-auth');

// Apply setupMainDatabase to all routes
router.use(setupMainDatabase);

// Test route to verify router is working
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Logs router is working' });
});

/**
 * GET /api/admin/logs
 * Get activity logs with filtering, pagination, and search
 */
router.get('/', authenticateAdmin, checkAdminPermission('logs', 'view'), async (req, res) => {
  try {
    const { AdminActivityLog } = req.mainModels;

    if (!AdminActivityLog) {
      console.error('AdminActivityLog model not found in req.mainModels:', Object.keys(req.mainModels || {}));
      return res.status(500).json({ 
        success: false, 
        error: 'Database model not available' 
      });
    }

    const {
      page = 1,
      limit = 50,
      adminId,
      action,
      module,
      search,
      startDate,
      endDate,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {};

    if (adminId) {
      // Convert string to ObjectId if needed
      const mongoose = require('mongoose');
      query.adminId = mongoose.Types.ObjectId.isValid(adminId) 
        ? new mongoose.Types.ObjectId(adminId) 
        : adminId;
    }

    if (action) {
      query.action = action;
    }

    if (module) {
      query.module = module;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    // Search across admin name, email, and details
    if (search) {
      query.$or = [
        { adminName: { $regex: search, $options: 'i' } },
        { adminEmail: { $regex: search, $options: 'i' } },
        { resourceId: { $regex: search, $options: 'i' } },
        { 'details.description': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [logs, total] = await Promise.all([
      AdminActivityLog.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .catch(() => []),
      AdminActivityLog.countDocuments(query).catch(() => 0)
    ]);

    // Format response
    const formattedLogs = (logs || []).map(log => ({
      id: log._id?.toString() || '',
      adminId: log.adminId?.toString() || '',
      adminName: log.adminName || 'Unknown',
      adminEmail: log.adminEmail || '',
      action: log.action || '',
      module: log.module || '',
      resourceId: log.resourceId || '',
      resourceType: log.resourceType || '',
      details: log.details || {},
      ipAddress: log.ipAddress || '',
      userAgent: log.userAgent || '',
      timestamp: log.timestamp || new Date()
    }));

    res.json({
      success: true,
      data: formattedLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Failed to fetch activity logs:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch activity logs',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/logs/stats
 * Get statistics about activity logs
 */
router.get('/stats', authenticateAdmin, checkAdminPermission('logs', 'view'), async (req, res) => {
  try {
    const { AdminActivityLog } = req.mainModels;
    const { startDate, endDate } = req.query;

    const dateQuery = {};
    if (startDate || endDate) {
      dateQuery.timestamp = {};
      if (startDate) dateQuery.timestamp.$gte = new Date(startDate);
      if (endDate) dateQuery.timestamp.$lte = new Date(endDate);
    }

    const [
      totalLogs,
      actionsByType,
      modulesByType,
      topAdmins,
      recentActivity
    ] = await Promise.all([
      // Total logs
      AdminActivityLog.countDocuments(dateQuery),
      
      // Actions by type
      AdminActivityLog.aggregate([
        { $match: dateQuery },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      // Modules by type
      AdminActivityLog.aggregate([
        { $match: dateQuery },
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      // Top admins by activity
      AdminActivityLog.aggregate([
        { $match: dateQuery },
        { $group: { _id: '$adminId', count: { $sum: 1 }, adminName: { $first: '$adminName' }, adminEmail: { $first: '$adminEmail' } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      
      // Recent activity (last 24 hours)
      AdminActivityLog.countDocuments({
        ...dateQuery,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalLogs,
        actionsByType: actionsByType.map(item => ({ action: item._id, count: item.count })),
        modulesByType: modulesByType.map(item => ({ module: item._id, count: item.count })),
        topAdmins: topAdmins.map(item => ({
          adminId: item._id.toString(),
          adminName: item.adminName,
          adminEmail: item.adminEmail,
          count: item.count
        })),
        recentActivity
      }
    });
  } catch (error) {
    console.error('Failed to fetch log statistics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch log statistics' });
  }
});

/**
 * GET /api/admin/logs/filters
 * Get available filter options
 */
router.get('/filters', authenticateAdmin, checkAdminPermission('logs', 'view'), async (req, res) => {
  try {
    const { AdminActivityLog, Admin } = req.mainModels;

    if (!AdminActivityLog || !Admin) {
      console.error('Models not found in req.mainModels:', Object.keys(req.mainModels || {}));
      return res.status(500).json({ 
        success: false, 
        error: 'Database models not available' 
      });
    }

    const [actions, modules, admins] = await Promise.all([
      AdminActivityLog.distinct('action').catch(() => []),
      AdminActivityLog.distinct('module').catch(() => []),
      Admin.find({ isActive: true }).select('_id firstName lastName email').lean().catch(() => [])
    ]);

    res.json({
      success: true,
      data: {
        actions: (actions || []).sort(),
        modules: (modules || []).sort(),
        admins: (admins || []).map(admin => ({
          id: admin._id.toString(),
          name: `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email,
          email: admin.email
        }))
      }
    });
  } catch (error) {
    console.error('Failed to fetch filter options:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch filter options',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

