const express = require('express');
const { logger } = require('../utils/logger');
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
    logger.error('Error testing WhatsApp:', error);
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
    logger.error('Error fetching admin WhatsApp tracking:', error);
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
    logger.debug('📱 WhatsApp tracking/business route hit');
    const { dateFrom, dateTo } = req.query;
    const businessId = req.user?.branchId;
    
    logger.debug('📱 Business ID:', businessId);
    
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
    logger.error('Error fetching business WhatsApp tracking:', error);
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
    logger.error('Error fetching WhatsApp logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch message logs'
    });
  }
});

/**
 * POST /api/whatsapp/marketing-templates/create
 * Create a new marketing template for the logged-in business
 */
router.post('/marketing-templates/create', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    logger.debug('📱 [Template Create] Request received:', {
      businessId: req.user?.branchId,
      hasBody: !!req.body,
      templateName: req.body?.templateName,
      hasComponents: !!req.body?.components,
      componentsLength: req.body?.components?.length
    });

    const businessId = req.user?.branchId;
    
    if (!businessId) {
      logger.error('❌ [Template Create] Business ID not found');
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const {
      templateName,
      language,
      components,
      description,
      tags
    } = req.body;

    // Validation
    if (!templateName) {
      logger.error('❌ [Template Create] Template name missing');
      return res.status(400).json({
        success: false,
        error: 'Template name is required'
      });
    }

    if (!components || !Array.isArray(components) || components.length === 0) {
      logger.error('❌ [Template Create] Components missing or invalid:', {
        hasComponents: !!components,
        isArray: Array.isArray(components),
        length: components?.length
      });
      return res.status(400).json({
        success: false,
        error: 'Template components are required'
      });
    }

    // Get MSG91 config from AdminSettings (platform-level)
    const mainConnection = await databaseManager.getMainConnection();
    const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
    const settings = await AdminSettings.getSettings();
    const whatsappConfig = settings.notifications?.whatsapp;

    if (!whatsappConfig?.msg91ApiKey || !whatsappConfig?.msg91SenderId) {
      logger.error('❌ [Template Create] WhatsApp service not configured:', {
        hasApiKey: !!whatsappConfig?.msg91ApiKey,
        hasSenderId: !!whatsappConfig?.msg91SenderId
      });
      return res.status(400).json({
        success: false,
        error: 'WhatsApp service not configured. Please contact administrator.'
      });
    }

    // Create template via MSG91 (category is always MARKETING for business users)
    const templateData = {
      templateName: `${templateName}_${businessId}`, // Make unique per business
      language: language || 'en',
      category: 'MARKETING', // Always MARKETING for business-created templates
      integratedNumber: whatsappConfig.msg91SenderId,
      buttonUrl: components.some(c => c.type === 'BUTTONS' && c.buttons?.some(b => b.type === 'URL')) ? 'true' : 'false',
      components
    };

    const result = await whatsappService.createTemplate(templateData);

    if (result.success) {
      // Save template to business database
      const BusinessMarketingTemplate = mainConnection.model('BusinessMarketingTemplate', require('../models/BusinessMarketingTemplate').schema);
      
      const template = new BusinessMarketingTemplate({
        businessId,
        templateName,
        msg91TemplateId: result.templateId,
        language: templateData.language,
        category: 'MARKETING',
        components,
        status: 'pending',
        msg91Response: result.data,
        description: description || '',
        tags: tags || [],
        submittedAt: new Date()
      });

      await template.save();

      res.json({
        success: true,
        message: 'Marketing template created and submitted for approval',
        data: {
          templateId: template._id,
          msg91TemplateId: result.templateId,
          status: 'pending',
          note: 'Template will be available for use once approved by MSG91 (typically 10-30 minutes)'
        }
      });
    } else {
      logger.error('❌ [Template Create] MSG91 API returned error:', {
        error: result.error,
        responseData: result.responseData
      });
      res.status(400).json({
        success: false,
        error: result.error || 'Template creation failed',
        details: result.responseData
      });
    }
  } catch (error) {
    logger.error('Error creating marketing template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create template'
    });
  }
});

/**
 * GET /api/whatsapp/marketing-templates
 * Get all marketing templates for the logged-in business
 */
router.get('/marketing-templates', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    const { status, page = 1, limit = 50 } = req.query;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const mainConnection = await databaseManager.getMainConnection();
    const BusinessMarketingTemplate = mainConnection.model('BusinessMarketingTemplate', require('../models/BusinessMarketingTemplate').schema);

    // Build filter
    const filter = { businessId };
    if (status) {
      filter.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await BusinessMarketingTemplate.countDocuments(filter);

    const templates = await BusinessMarketingTemplate.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: templates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching marketing templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates'
    });
  }
});

/**
 * GET /api/whatsapp/marketing-templates/:templateId
 * Get a specific marketing template
 */
router.get('/marketing-templates/:templateId', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    const { templateId } = req.params;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const mainConnection = await databaseManager.getMainConnection();
    const BusinessMarketingTemplate = mainConnection.model('BusinessMarketingTemplate', require('../models/BusinessMarketingTemplate').schema);

    const template = await BusinessMarketingTemplate.findOne({
      _id: templateId,
      businessId
    }).lean();

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error('Error fetching marketing template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template'
    });
  }
});

/**
 * PUT /api/whatsapp/marketing-templates/:templateId/check-status
 * Check MSG91 template approval status
 */
router.put('/marketing-templates/:templateId/check-status', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    const { templateId } = req.params;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const mainConnection = await databaseManager.getMainConnection();
    const BusinessMarketingTemplate = mainConnection.model('BusinessMarketingTemplate', require('../models/BusinessMarketingTemplate').schema);

    const template = await BusinessMarketingTemplate.findOne({
      _id: templateId,
      businessId
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Note: MSG91 doesn't provide a direct API to check template status
    // This endpoint can be used to manually update status if user checks MSG91 dashboard
    // Or we can implement webhook handling if MSG91 provides webhooks
    
    res.json({
      success: true,
      message: 'Status check endpoint. Please check MSG91 dashboard for approval status.',
      data: {
        templateId: template._id,
        currentStatus: template.status,
        msg91TemplateId: template.msg91TemplateId,
        submittedAt: template.submittedAt
      }
    });
  } catch (error) {
    logger.error('Error checking template status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check template status'
    });
  }
});

/**
 * DELETE /api/whatsapp/marketing-templates/:templateId
 * Delete a marketing template
 */
router.delete('/marketing-templates/:templateId', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    const { templateId } = req.params;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const mainConnection = await databaseManager.getMainConnection();
    const BusinessMarketingTemplate = mainConnection.model('BusinessMarketingTemplate', require('../models/BusinessMarketingTemplate').schema);

    const template = await BusinessMarketingTemplate.findOne({
      _id: templateId,
      businessId
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Only allow deletion if status is 'rejected' or 'pending'
    // Or if it hasn't been used in any campaigns
    if (template.status === 'approved' && template.campaignCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete template that has been used in campaigns'
      });
    }

    await BusinessMarketingTemplate.deleteOne({ _id: templateId });

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting marketing template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete template'
    });
  }
});

module.exports = router;

