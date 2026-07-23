'use strict';

const express = require('express');
const router = express.Router();

const { checkAdminPermission } = require('../middleware/admin-auth');
const { logger } = require('../utils/logger');
const gupshupConfig = require('../lib/gupshup-config');
const {
  getCampaignModels,
  previewCampaignAudience,
  runPlatformCampaign,
  MAX_RECIPIENTS,
} = require('../lib/platform-whatsapp-campaign-runner');
const {
  buildCampaignPerformanceReport,
  buildCampaignsSummaryReport,
  aggregateMessageCountsForCampaigns,
} = require('../lib/platform-whatsapp-campaign-report');

router.get('/', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const { Campaign } = await getCampaignModels();
    const items = await Campaign.find({}).sort({ createdAt: -1 }).lean();
    const countMap = await aggregateMessageCountsForCampaigns(items.map((c) => c._id));
    const data = items.map((c) => ({
      ...c,
      counts: countMap.get(String(c._id)) || c.counts || {},
    }));
    return res.json({ success: true, data });
  } catch (err) {
    logger.error('[admin-gupshup-campaigns] list failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load campaigns' });
  }
});

router.post('/', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const { name, description, templateId, audienceType, audienceFilters, variableMapping, scheduledAt } =
      req.body || {};
    if (!name || !templateId) {
      return res.status(400).json({ success: false, error: 'name and templateId are required' });
    }
    const { Campaign, Template } = await getCampaignModels();
    const template = await Template.findById(templateId).lean();
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const created = await Campaign.create({
      name,
      description: description || '',
      templateId,
      audienceType: audienceType || 'all_leads',
      audienceFilters: audienceFilters || {},
      variableMapping: variableMapping || {},
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'scheduled' : 'draft',
      createdBy: req.admin?._id || null,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    logger.error('[admin-gupshup-campaigns] create failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to create campaign' });
  }
});

router.get('/limits', checkAdminPermission('settings', 'view'), async (_req, res) => {
  return res.json({
    success: true,
    data: { maxRecipients: MAX_RECIPIENTS },
  });
});

/** @deprecated use GET /limits */
router.get('/meta/limits', checkAdminPermission('settings', 'view'), async (_req, res) => {
  return res.json({
    success: true,
    data: { maxRecipients: MAX_RECIPIENTS },
  });
});

router.post('/audience/preview', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const { audienceType, audienceFilters } = req.body || {};
    const preview = await previewCampaignAudience({
      audienceType: audienceType || 'segment',
      audienceFilters: audienceFilters || {},
    });
    return res.json({ success: true, data: preview });
  } catch (err) {
    logger.error('[admin-gupshup-campaigns] audience preview failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to preview audience' });
  }
});

router.get('/reports/summary', checkAdminPermission('settings', 'view'), async (_req, res) => {
  try {
    const data = await buildCampaignsSummaryReport();
    return res.json({ success: true, data });
  } catch (err) {
    logger.error('[admin-gupshup-campaigns] summary report failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load performance summary' });
  }
});

router.get('/:id/report', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const data = await buildCampaignPerformanceReport(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'Campaign not found' });
    return res.json({ success: true, data });
  } catch (err) {
    logger.error('[admin-gupshup-campaigns] campaign report failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load campaign report' });
  }
});

router.get('/:id', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const { Campaign } = await getCampaignModels();
    const campaign = await Campaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    return res.json({ success: true, data: campaign });
  } catch (err) {
    logger.error('[admin-gupshup-campaigns] get failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load campaign' });
  }
});

router.put('/:id', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const { Campaign } = await getCampaignModels();
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot edit a campaign in status "${campaign.status}"`,
      });
    }
    const editable = [
      'name',
      'description',
      'templateId',
      'audienceType',
      'audienceFilters',
      'variableMapping',
      'scheduledAt',
    ];
    for (const key of editable) {
      if (req.body[key] !== undefined) {
        campaign[key] =
          key === 'scheduledAt' && req.body[key] ? new Date(req.body[key]) : req.body[key];
      }
    }
    if (campaign.scheduledAt && campaign.status === 'draft') campaign.status = 'scheduled';
    await campaign.save();
    return res.json({ success: true, data: campaign });
  } catch (err) {
    logger.error('[admin-gupshup-campaigns] update failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to update campaign' });
  }
});

router.post('/:id/cancel', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const { Campaign } = await getCampaignModels();
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    if (['sent', 'failed', 'cancelled'].includes(campaign.status)) {
      return res.status(400).json({ success: false, error: `Campaign already ${campaign.status}` });
    }
    campaign.status = 'cancelled';
    campaign.cancelledAt = new Date();
    await campaign.save();
    return res.json({ success: true, data: campaign });
  } catch (err) {
    logger.error('[admin-gupshup-campaigns] cancel failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to cancel campaign' });
  }
});

router.post('/:id/recipients/preview', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const { Campaign } = await getCampaignModels();
    const campaign = await Campaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    const preview = await previewCampaignAudience(campaign);
    return res.json({ success: true, data: preview });
  } catch (err) {
    logger.error('[admin-gupshup-campaigns] preview failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to preview audience' });
  }
});

router.post('/:id/send', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const platformOk = await gupshupConfig.isPlatformConfiguredAsync();
    if (!platformOk) {
      return res.status(400).json({
        success: false,
        error: 'Platform Gupshup app is not configured (Admin → Gupshup shared app).',
      });
    }

    const { Campaign } = await getCampaignModels();
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    setImmediate(async () => {
      try {
        await runPlatformCampaign(campaign._id, { createdBy: req.admin?._id || null });
      } catch (err) {
        logger.error('[admin-gupshup-campaigns] async run failed:', err);
        await Campaign.updateOne(
          { _id: campaign._id },
          {
            $set: {
              status: 'failed',
              failureReason: err?.message || 'Campaign run failed',
              completedAt: new Date(),
            },
          }
        );
      }
    });

    campaign.status = 'queued';
    await campaign.save();
    return res.json({
      success: true,
      data: campaign,
      message: 'Campaign queued for sending',
    });
  } catch (err) {
    logger.error('[admin-gupshup-campaigns] send failed:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to start campaign' });
  }
});

module.exports = router;
