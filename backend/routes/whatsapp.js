const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/admin-auth');
const { setupBusinessDatabase, setupMainDatabase } = require('../middleware/business-db');
const whatsappService = require('../services/whatsapp-service');
const databaseManager = require('../config/database-manager');

/**
 * GET /api/whatsapp/health
 * Health check for WhatsApp routes
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'WhatsApp routes are loaded',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/whatsapp/test
 * Test WhatsApp connection (admin only)
 */
router.post('/test', authenticateAdmin, setupMainDatabase, async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    const result = await whatsappService.testConnection(phone);
    
    res.json(result);
  } catch (error) {
    console.error('Error testing WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test WhatsApp connection'
    });
  }
});

/**
 * GET /api/whatsapp/tracking/admin
 * Get admin-level WhatsApp analytics (all businesses)
 */
router.get('/tracking/admin', authenticateAdmin, setupMainDatabase, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const mainConnection = await databaseManager.getMainConnection();
    const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

    // Build date filter
    const dateFilter = {};
    if (dateFrom || dateTo) {
      dateFilter.timestamp = {};
      if (dateFrom) {
        dateFilter.timestamp.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        dateFilter.timestamp.$lte = new Date(dateTo);
      }
    }

    // Get all messages
    const messages = await WhatsAppMessageLog.find(dateFilter).lean();

    // Calculate statistics
    const totalMessages = messages.length;
    const sentMessages = messages.filter(m => m.status === 'sent').length;
    const failedMessages = messages.filter(m => m.status === 'failed').length;
    const successRate = totalMessages > 0 ? ((sentMessages / totalMessages) * 100).toFixed(2) : 0;

    // Group by business
    const businessStats = {};
    messages.forEach(msg => {
      const businessId = msg.businessId.toString();
      if (!businessStats[businessId]) {
        businessStats[businessId] = {
          businessId,
          total: 0,
          sent: 0,
          failed: 0
        };
      }
      businessStats[businessId].total++;
      if (msg.status === 'sent') businessStats[businessId].sent++;
      if (msg.status === 'failed') businessStats[businessId].failed++;
    });

    // Get business names
    const { Business } = req.mainModels;
    const businessIds = Object.keys(businessStats);
    const businesses = await Business.find({ _id: { $in: businessIds } }).select('name').lean();
    const businessMap = {};
    businesses.forEach(b => {
      businessMap[b._id.toString()] = b.name;
    });

    // Add business names to stats
    const businessStatsArray = Object.values(businessStats).map(stat => ({
      ...stat,
      businessName: businessMap[stat.businessId] || 'Unknown'
    }));

    res.json({
      success: true,
      data: {
        totalMessages,
        sentMessages,
        failedMessages,
        successRate: parseFloat(successRate),
        businessStats: businessStatsArray,
        dateRange: {
          from: dateFrom || null,
          to: dateTo || null
        }
      }
    });
  } catch (error) {
    console.error('Error fetching admin WhatsApp tracking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin tracking data'
    });
  }
});

/**
 * GET /api/whatsapp/tracking/business
 * Get business-level WhatsApp analytics
 */
router.get('/tracking/business', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    console.log('📱 WhatsApp tracking/business route hit');
    const { dateFrom, dateTo } = req.query;
    const businessId = req.user?.branchId;
    
    console.log('📱 Business ID:', businessId);
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found. Please ensure you are logged in with a business account.'
      });
    }
    
    const mainConnection = await databaseManager.getMainConnection();
    const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

    // Build date filter
    const dateFilter = { businessId };
    if (dateFrom || dateTo) {
      dateFilter.timestamp = {};
      if (dateFrom) {
        dateFilter.timestamp.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        dateFilter.timestamp.$lte = new Date(dateTo);
      }
    }

    // Get messages for this business
    const messages = await WhatsAppMessageLog.find(dateFilter)
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    // Calculate statistics
    const totalMessages = await WhatsAppMessageLog.countDocuments({ businessId });
    const sentMessages = await WhatsAppMessageLog.countDocuments({ businessId, status: 'sent' });
    const failedMessages = await WhatsAppMessageLog.countDocuments({ businessId, status: 'failed' });
    const successRate = totalMessages > 0 ? ((sentMessages / totalMessages) * 100).toFixed(2) : 0;

    // Group by message type
    const typeStats = {};
    messages.forEach(msg => {
      const type = msg.messageType || 'unknown';
      if (!typeStats[type]) {
        typeStats[type] = { total: 0, sent: 0, failed: 0 };
      }
      typeStats[type].total++;
      if (msg.status === 'sent') typeStats[type].sent++;
      if (msg.status === 'failed') typeStats[type].failed++;
    });

    res.json({
      success: true,
      data: {
        totalMessages,
        sentMessages,
        failedMessages,
        successRate: parseFloat(successRate),
        typeStats,
        recentMessages: messages.slice(0, 20),
        dateRange: {
          from: dateFrom || null,
          to: dateTo || null
        }
      }
    });
  } catch (error) {
    console.error('Error fetching business WhatsApp tracking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch business tracking data'
    });
  }
});

/**
 * GET /api/whatsapp/logs
 * Get message logs with filters
 */
router.get('/logs', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const { dateFrom, dateTo, status, messageType, businessId, page = 1, limit = 50 } = req.query;
    const mainConnection = await databaseManager.getMainConnection();
    const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

    // Check if user is admin or business owner
    const isAdmin = req.user.role === 'admin';
    const userBusinessId = req.user.branchId;

    // Build filter
    const filter = {};

    // Business filter - admins can see all, others only their business
    if (isAdmin && businessId) {
      filter.businessId = businessId;
    } else if (!isAdmin) {
      filter.businessId = userBusinessId;
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Message type filter
    if (messageType) {
      filter.messageType = messageType;
    }

    // Date filter
    if (dateFrom || dateTo) {
      filter.timestamp = {};
      if (dateFrom) {
        filter.timestamp.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.timestamp.$lte = new Date(dateTo);
      }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get logs
    const logs = await WhatsAppMessageLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await WhatsAppMessageLog.countDocuments(filter);

    // Get business names if admin
    if (isAdmin) {
      const { Business } = req.mainModels;
      const businessIds = [...new Set(logs.map(log => log.businessId.toString()))];
      const businesses = await Business.find({ _id: { $in: businessIds } }).select('name').lean();
      const businessMap = {};
      businesses.forEach(b => {
        businessMap[b._id.toString()] = b.name;
      });

      logs.forEach(log => {
        log.businessName = businessMap[log.businessId.toString()] || 'Unknown';
      });
    }

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching WhatsApp logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch message logs'
    });
  }
});

module.exports = router;

