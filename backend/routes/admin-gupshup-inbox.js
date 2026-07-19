'use strict';

const express = require('express');
const router = express.Router();

const { checkAdminPermission } = require('../middleware/admin-auth');
const { logger } = require('../utils/logger');
const {
  getPlatformWhatsAppModels,
  decorateWindowFlags,
  attachLeadInfo,
  sendPlatformTextMessage,
  sendPlatformTemplateMessage,
  ensurePlatformSenderReady,
} = require('../lib/platform-whatsapp-send');

function bodyPlaceholderCount(text) {
  if (!text || typeof text !== 'string') return 0;
  let max = 0;
  const re = /\{\{(\d+)\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

router.get('/status', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const ready = await ensurePlatformSenderReady();
    return res.json({
      success: true,
      data: {
        platformConfigured: ready.configured !== false,
        senderReady: ready.ok,
        error: ready.ok ? null : ready.error,
      },
    });
  } catch (err) {
    logger.error('[admin-gupshup-inbox] status failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load inbox status' });
  }
});

router.get('/', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const { Conversation } = await getPlatformWhatsAppModels();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const filterMode = String(req.query.filter || 'all');
    const q = String(req.query.q || '').trim();

    const dbFilter = {};
    if (filterMode === 'unread') dbFilter.unreadCount = { $gt: 0 };
    if (filterMode === 'open') dbFilter.cswExpiresAt = { $gt: new Date() };
    if (filterMode === 'resolved') dbFilter.resolved = true;
    if (filterMode === 'optedout') dbFilter.marketingOptOut = true;

    if (q) {
      const digits = q.replace(/\D/g, '');
      if (digits) dbFilter.recipientPhone = { $regex: digits.slice(-10) + '$' };
    }

    const docs = await Conversation.find(dbFilter)
      .sort({ lastInboundAt: -1, updatedAt: -1 })
      .limit(limit)
      .lean();

    let enriched = await attachLeadInfo(docs);
    if (q && /[a-zA-Z]/.test(q)) {
      const ql = q.toLowerCase();
      enriched = enriched.filter(
        (c) =>
          (c.lead?.name || '').toLowerCase().includes(ql) ||
          (c.lead?.salonName || '').toLowerCase().includes(ql) ||
          String(c.recipientPhone || '').includes(ql)
      );
    }

    return res.json({
      success: true,
      data: enriched.map(decorateWindowFlags),
    });
  } catch (err) {
    logger.error('[admin-gupshup-inbox] list failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load conversations' });
  }
});

router.get('/templates', checkAdminPermission('settings', 'view'), async (_req, res) => {
  try {
    const main = require('../config/database-manager');
    const conn = await main.getMainConnection();
    const PlatformTemplate = conn.model(
      'PlatformWhatsAppTemplate',
      require('../models/PlatformWhatsAppTemplate').schema
    );
    const items = await PlatformTemplate.find({ status: 'approved', gupshupTemplateId: { $ne: null } })
      .sort({ name: 1 })
      .lean();
    return res.json({ success: true, data: items });
  } catch (err) {
    logger.error('[admin-gupshup-inbox] templates failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load templates' });
  }
});

router.get('/:conversationId', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const { Conversation, Message } = await getPlatformWhatsAppModels();
    const conv = await Conversation.findById(req.params.conversationId).lean();
    if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

    const suffix = String(conv.recipientPhone || '').replace(/\D/g, '').slice(-10);
    const messages = await Message.find({
      $or: [
        { conversationId: conv._id },
        ...(suffix ? [{ recipientPhone: { $regex: suffix + '$' } }] : []),
      ],
    })
      .sort({ timestamp: 1 })
      .lean();

    await Conversation.updateOne({ _id: conv._id }, { $set: { unreadCount: 0 } });
    conv.unreadCount = 0;

    const [enriched] = await attachLeadInfo([conv]);
    return res.json({
      success: true,
      data: {
        conversation: decorateWindowFlags(enriched),
        messages,
      },
    });
  } catch (err) {
    logger.error('[admin-gupshup-inbox] thread failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load conversation' });
  }
});

router.post('/:conversationId/reply', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const { Conversation } = await getPlatformWhatsAppModels();
    const conv = await Conversation.findById(req.params.conversationId);
    if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

    const { mode = 'text', text, templateId, params = [] } = req.body || {};
    const createdBy = req.admin?._id || null;

    if (mode === 'text') {
      if (!text?.trim()) {
        return res.status(400).json({ success: false, error: 'Reply text cannot be empty' });
      }
      const result = await sendPlatformTextMessage({
        to: conv.recipientPhone,
        text: String(text).trim(),
        conversationId: conv._id,
        createdBy,
      });
      if (!result.success) {
        const errText =
          typeof result.error === 'string'
            ? result.error
            : result.error?.message || result.error?.cause || 'Reply failed';
        return res.status(400).json({
          success: false,
          code: result.code,
          error: errText,
        });
      }
      return res.json({ success: true, data: result.message });
    }

    if (!templateId) {
      return res.status(400).json({ success: false, error: 'templateId is required for template replies' });
    }

    const main = require('../config/database-manager');
    const conn = await main.getMainConnection();
    const PlatformTemplate = conn.model(
      'PlatformWhatsAppTemplate',
      require('../models/PlatformWhatsAppTemplate').schema
    );
    const tpl = await PlatformTemplate.findById(templateId).lean();
    if (!tpl || tpl.status !== 'approved' || !tpl.gupshupTemplateId) {
      return res.status(400).json({ success: false, error: 'Template must be approved' });
    }

    const expected = bodyPlaceholderCount(tpl.components?.body?.text);
    const sendParams = Array.isArray(params) ? params.map((p) => String(p ?? '')) : [];
    if (expected > 0 && sendParams.length !== expected) {
      return res.status(400).json({
        success: false,
        error: `Template expects ${expected} variable(s); received ${sendParams.length}.`,
      });
    }

    const result = await sendPlatformTemplateMessage({
      to: conv.recipientPhone,
      templateId: tpl.gupshupTemplateId,
      params: sendParams,
      conversationId: conv._id,
      platformLeadId: conv.platformLeadId,
      platformTemplateId: tpl._id,
      category: String(tpl.category || 'UTILITY').toLowerCase(),
      intent: 'platform_inbox_reply',
      createdBy,
    });
    if (!result.success) {
      const errText =
        typeof result.error === 'string'
          ? result.error
          : result.error?.message || result.error?.cause || 'Reply failed';
      return res.status(400).json({
        success: false,
        code: result.code,
        error: errText,
      });
    }
    return res.json({ success: true, data: result.message });
  } catch (err) {
    logger.error('[admin-gupshup-inbox] reply failed:', err);
    return res.status(500).json({ success: false, error: 'Reply failed' });
  }
});

router.post('/:conversationId/resolve', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const { Conversation } = await getPlatformWhatsAppModels();
    const conv = await Conversation.findById(req.params.conversationId);
    if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
    conv.resolved = req.body?.resolved !== false;
    await conv.save();
    const [enriched] = await attachLeadInfo([conv.toObject()]);
    return res.json({ success: true, data: decorateWindowFlags(enriched) });
  } catch (err) {
    logger.error('[admin-gupshup-inbox] resolve failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to update conversation' });
  }
});

module.exports = router;
