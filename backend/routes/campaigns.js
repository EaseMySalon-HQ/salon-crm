const express = require('express');
const { logger } = require('../utils/logger');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase, setupMainDatabase } = require('../middleware/business-db');
const whatsappService = require('../services/whatsapp-service');
const databaseManager = require('../config/database-manager');

/**
 * Helper function to get recipients for a campaign
 */
async function getRecipientsForCampaign(campaign, businessId, businessModels) {
  const { Client } = businessModels;
  let recipients = [];

  if (campaign.recipientType === 'all_clients') {
    // Get all clients with phone numbers
    const clients = await Client.find({
      branchId: businessId,
      phone: { $exists: true, $ne: null, $ne: '' }
    }).select('name phone email').lean();

    recipients = clients.map(client => ({
      phone: client.phone,
      name: client.name || 'Customer',
      email: client.email || null
    }));
  } else if (campaign.recipientType === 'segment') {
    // Apply segment filters
    const filters = campaign.recipientFilters || {};
    const query = { branchId: businessId, phone: { $exists: true, $ne: null, $ne: '' } };

    // Last visit date range
    if (filters.lastVisitDateFrom || filters.lastVisitDateTo) {
      query.lastVisitDate = {};
      if (filters.lastVisitDateFrom) {
        query.lastVisitDate.$gte = new Date(filters.lastVisitDateFrom);
      }
      if (filters.lastVisitDateTo) {
        query.lastVisitDate.$lte = new Date(filters.lastVisitDateTo);
      }
    }

    // Total spent range
    if (filters.totalSpentMin || filters.totalSpentMax) {
      query.totalSpent = {};
      if (filters.totalSpentMin) {
        query.totalSpent.$gte = parseFloat(filters.totalSpentMin);
      }
      if (filters.totalSpentMax) {
        query.totalSpent.$lte = parseFloat(filters.totalSpentMax);
      }
    }

    // Service categories
    if (filters.serviceCategories && filters.serviceCategories.length > 0) {
      query['services.category'] = { $in: filters.serviceCategories };
    }

    // Tags
    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }

    const clients = await Client.find(query).select('name phone email').lean();
    recipients = clients.map(client => ({
      phone: client.phone,
      name: client.name || 'Customer',
      email: client.email || null
    }));
  } else if (campaign.recipientType === 'custom') {
    // Use custom phone list
    const customList = campaign.recipientFilters?.phoneList || [];
    recipients = customList.map(item => ({
      phone: typeof item === 'string' ? item : item.phone,
      name: typeof item === 'string' ? 'Customer' : (item.name || 'Customer'),
      email: typeof item === 'object' ? item.email : null
    }));
  }

  return recipients;
}

/**
 * POST /api/campaigns
 * Create a new campaign
 */
router.post('/', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const {
      name,
      description,
      templateId,
      recipientType,
      recipientFilters,
      templateVariables,
      scheduledAt
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Campaign name is required'
      });
    }

    if (!templateId) {
      return res.status(400).json({
        success: false,
        error: 'Template is required'
      });
    }

    if (!recipientType || !['all_clients', 'segment', 'custom'].includes(recipientType)) {
      return res.status(400).json({
        success: false,
        error: 'Valid recipient type is required'
      });
    }

    const mainConnection = await databaseManager.getMainConnection();
    const BusinessMarketingTemplate = mainConnection.model('BusinessMarketingTemplate', require('../models/BusinessMarketingTemplate').schema);
    const Campaign = mainConnection.model('Campaign', require('../models/Campaign').schema);

    // Verify template exists and is approved
    const template = await BusinessMarketingTemplate.findOne({
      _id: templateId,
      businessId,
      status: 'approved'
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found or not approved. Please use an approved template.'
      });
    }

    // Calculate recipient count
    const recipients = await getRecipientsForCampaign(
      { recipientType, recipientFilters },
      businessId,
      req.businessModels
    );

    // Create campaign
    const campaign = new Campaign({
      businessId,
      name,
      description: description || '',
      templateId,
      templateName: template.templateName,
      status: scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      recipientType,
      recipientFilters: recipientFilters || {},
      recipientCount: recipients.length,
      sentCount: 0,
      failedCount: 0,
      templateVariables: templateVariables || {},
      createdBy: req.user._id
    });

    await campaign.save();

    res.json({
      success: true,
      message: 'Campaign created successfully',
      data: {
        campaignId: campaign._id,
        recipientCount: recipients.length
      }
    });
  } catch (error) {
    logger.error('Error creating campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create campaign'
    });
  }
});

/**
 * GET /api/campaigns
 * Get all campaigns for the logged-in business
 */
router.get('/', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
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
    const Campaign = mainConnection.model('Campaign', require('../models/Campaign').schema);

    // Build filter
    const filter = { businessId };
    if (status) {
      filter.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Campaign.countDocuments(filter);

    const campaigns = await Campaign.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: campaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching campaigns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaigns'
    });
  }
});

/**
 * GET /api/campaigns/:campaignId
 * Get a specific campaign
 */
router.get('/:campaignId', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    const { campaignId } = req.params;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const mainConnection = await databaseManager.getMainConnection();
    const Campaign = mainConnection.model('Campaign', require('../models/Campaign').schema);
    const BusinessMarketingTemplate = mainConnection.model('BusinessMarketingTemplate', require('../models/BusinessMarketingTemplate').schema);

    const campaign = await Campaign.findOne({
      _id: campaignId,
      businessId
    }).lean();

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    // Get template details
    const template = await BusinessMarketingTemplate.findById(campaign.templateId).lean();

    res.json({
      success: true,
      data: {
        ...campaign,
        template
      }
    });
  } catch (error) {
    logger.error('Error fetching campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign'
    });
  }
});

/**
 * GET /api/campaigns/:campaignId/recipients
 * Get recipients for a campaign without sending
 */
router.get('/:campaignId/recipients', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    const { campaignId } = req.params;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const mainConnection = await databaseManager.getMainConnection();
    const Campaign = mainConnection.model('Campaign', require('../models/Campaign').schema);

    const campaign = await Campaign.findOne({
      _id: campaignId,
      businessId
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    const recipients = await getRecipientsForCampaign(
      campaign,
      businessId,
      req.businessModels
    );

    res.json({
      success: true,
      data: {
        recipients,
        count: recipients.length
      }
    });
  } catch (error) {
    logger.error('Error fetching campaign recipients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recipients'
    });
  }
});

/**
 * POST /api/campaigns/:campaignId/send
 * Send a campaign
 */
router.post('/:campaignId/send', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    const { campaignId } = req.params;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const mainConnection = await databaseManager.getMainConnection();
    const Campaign = mainConnection.model('Campaign', require('../models/Campaign').schema);
    const BusinessMarketingTemplate = mainConnection.model('BusinessMarketingTemplate', require('../models/BusinessMarketingTemplate').schema);
    const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

    const campaign = await Campaign.findOne({
      _id: campaignId,
      businessId
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    // Verify campaign status
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        error: `Cannot send campaign with status: ${campaign.status}`
      });
    }

    // Get template
    const template = await BusinessMarketingTemplate.findById(campaign.templateId);
    if (!template || template.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Template not found or not approved'
      });
    }

    // Get recipients
    const recipients = await getRecipientsForCampaign(
      campaign,
      businessId,
      req.businessModels
    );

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No recipients found for this campaign'
      });
    }

    // Update campaign status
    campaign.status = 'sending';
    campaign.startedAt = new Date();
    await campaign.save();

    // Send messages in batches
    let sentCount = 0;
    let failedCount = 0;
    const batchSize = 10; // Send 10 messages at a time to avoid rate limits

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (recipient) => {
        try {
          // Map template variables - use recipient data and campaign templateVariables
          const variables = { ...campaign.templateVariables };
          
          // Add recipient-specific variables if needed
          if (recipient.name) {
            variables.body_1 = recipient.name;
          }

          const result = await whatsappService.sendMessage({
            to: recipient.phone,
            templateId: template.msg91TemplateId || template.templateName,
            variables
          });

          // Log message
          await WhatsAppMessageLog.create({
            businessId,
            recipientPhone: recipient.phone,
            messageType: 'campaign',
            status: result.success ? 'sent' : 'failed',
            msg91Response: result.data || null,
            relatedEntityId: campaign._id,
            relatedEntityType: 'Campaign',
            campaignId: campaign._id,
            error: result.error || null,
            timestamp: new Date()
          });

          if (result.success) {
            sentCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          logger.error(`Error sending to ${recipient.phone}:`, error);
          failedCount++;
          
          await WhatsAppMessageLog.create({
            businessId,
            recipientPhone: recipient.phone,
            messageType: 'campaign',
            status: 'failed',
            relatedEntityId: campaign._id,
            relatedEntityType: 'Campaign',
            campaignId: campaign._id,
            error: error.message,
            timestamp: new Date()
          });
        }
      }));

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Update campaign stats
    campaign.sentCount = sentCount;
    campaign.failedCount = failedCount;
    campaign.status = 'completed';
    campaign.completedAt = new Date();
    await campaign.save();

    // Update template usage
    template.campaignCount = (template.campaignCount || 0) + sentCount;
    template.lastUsedAt = new Date();
    await template.save();

    res.json({
      success: true,
      message: `Campaign sent to ${sentCount} recipients`,
      data: {
        total: recipients.length,
        successful: sentCount,
        failed: failedCount
      }
    });
  } catch (error) {
    logger.error('Error sending campaign:', error);
    
    // Update campaign status to failed if it was in sending state
    try {
      const mainConnection = await databaseManager.getMainConnection();
      const Campaign = mainConnection.model('Campaign', require('../models/Campaign').schema);
      await Campaign.updateOne(
        { _id: campaignId },
        { status: 'draft' } // Revert to draft on error
      );
    } catch (updateError) {
      logger.error('Error updating campaign status:', updateError);
    }

    res.status(500).json({
      success: false,
      error: 'Failed to send campaign'
    });
  }
});

/**
 * GET /api/campaigns/:campaignId/stats
 * Get campaign statistics
 */
router.get('/:campaignId/stats', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    const { campaignId } = req.params;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const mainConnection = await databaseManager.getMainConnection();
    const Campaign = mainConnection.model('Campaign', require('../models/Campaign').schema);
    const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

    const campaign = await Campaign.findOne({
      _id: campaignId,
      businessId
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    // Get detailed stats from message logs
    const logs = await WhatsAppMessageLog.find({
      campaignId: campaign._id
    }).lean();

    const stats = {
      total: logs.length,
      sent: logs.filter(l => l.status === 'sent').length,
      failed: logs.filter(l => l.status === 'failed').length,
      pending: logs.filter(l => l.status === 'pending').length,
      successRate: logs.length > 0 
        ? ((logs.filter(l => l.status === 'sent').length / logs.length) * 100).toFixed(2)
        : 0
    };

    res.json({
      success: true,
      data: {
        campaign: {
          name: campaign.name,
          status: campaign.status,
          recipientCount: campaign.recipientCount,
          sentCount: campaign.sentCount,
          failedCount: campaign.failedCount
        },
        stats
      }
    });
  } catch (error) {
    logger.error('Error fetching campaign stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch campaign stats'
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/cancel
 * Cancel a campaign
 */
router.put('/:campaignId/cancel', authenticateToken, setupMainDatabase, setupBusinessDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    const { campaignId } = req.params;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID not found'
      });
    }

    const mainConnection = await databaseManager.getMainConnection();
    const Campaign = mainConnection.model('Campaign', require('../models/Campaign').schema);

    const campaign = await Campaign.findOne({
      _id: campaignId,
      businessId
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    // Only allow cancellation if status is 'sending' or 'scheduled'
    if (campaign.status !== 'sending' && campaign.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel campaign with status: ${campaign.status}`
      });
    }

    campaign.status = 'cancelled';
    await campaign.save();

    res.json({
      success: true,
      message: 'Campaign cancelled successfully',
      data: campaign
    });
  } catch (error) {
    logger.error('Error cancelling campaign:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel campaign'
    });
  }
});

module.exports = router;

