/**
 * Reports endpoints powered by `WhatsAppMessage`.
 *
 * Mounted at /api/whatsapp/v2/messages — Reports → Messages tab.
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const { logger } = require('../utils/logger');
const databaseManager = require('../config/database-manager');

async function getModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Message: main.model('WhatsAppMessage', require('../models/WhatsAppMessage').schema),
    Template: main.model('WhatsAppTemplate', require('../models/WhatsAppTemplate').schema),
    Campaign: main.model('WhatsAppCampaign', require('../models/WhatsAppCampaign').schema),
  };
}

async function getTenantClientModel(businessId) {
  const main = await databaseManager.getMainConnection();
  const tenant = await databaseManager.getConnection(String(businessId), main);
  return tenant.model('Client', require('../models/Client').schema);
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildFilter(req) {
  const businessId = req.user.branchId;
  const filter = { businessId };
  const { from, to, campaignId, templateId, status, category, intent, freeWindowOnly, q } = req.query;
  const fromD = parseDate(from);
  const toD = parseDate(to);
  if (fromD || toD) {
    filter.timestamp = {};
    if (fromD) filter.timestamp.$gte = fromD;
    if (toD) filter.timestamp.$lte = toD;
  }
  if (campaignId) filter.campaignId = campaignId;
  if (templateId) filter.templateId = templateId;
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (intent) filter.intent = intent;
  if (freeWindowOnly === 'true') filter.freeWindow = true;
  if (q) {
    const digits = String(q).replace(/\D/g, '');
    if (digits) {
      // Match against the trailing 10 digits — handles 91XXXXXXXXXX vs XXXXXXXXXX.
      filter.recipientPhone = { $regex: digits.slice(-10) + '$' };
    }
  }
  return filter;
}

/**
 * Enrich a batch of messages with template name, campaign name, and client
 * display name. We do this in three parallel round trips and then build
 * lookup maps so the per-row mapping is O(1). Failures are non-fatal — a
 * missing tenant DB or deleted template just leaves that field blank rather
 * than 500'ing the whole report.
 */
async function enrichMessages(items, businessId) {
  if (items.length === 0) return items;
  const { Template, Campaign } = await getModels();
  const templateIds = Array.from(
    new Set(items.map((m) => m.templateId).filter(Boolean).map(String))
  );
  const campaignIds = Array.from(
    new Set(items.map((m) => m.campaignId).filter(Boolean).map(String))
  );
  const clientIds = Array.from(
    new Set(items.map((m) => m.clientId).filter(Boolean).map(String))
  );
  const phoneSuffixes = Array.from(
    new Set(
      items
        .map((m) => String(m.recipientPhone || '').replace(/\D/g, '').slice(-10))
        .filter(Boolean)
    )
  );

  const [templates, campaigns, clientLookup] = await Promise.all([
    templateIds.length
      ? Template.find({ _id: { $in: templateIds } })
          .select('_id name category language')
          .lean()
      : Promise.resolve([]),
    campaignIds.length
      ? Campaign.find({ _id: { $in: campaignIds } })
          .select('_id name')
          .lean()
      : Promise.resolve([]),
    (async () => {
      try {
        const Client = await getTenantClientModel(businessId);
        const filter = {
          $or: [
            ...(clientIds.length ? [{ _id: { $in: clientIds } }] : []),
            ...phoneSuffixes.map((s) => ({ phone: { $regex: s + '$' } })),
          ],
        };
        if (filter.$or.length === 0) return { byId: new Map(), bySuffix: new Map() };
        const clients = await Client.find(filter).select('_id name phone').lean();
        const byId = new Map(clients.map((c) => [String(c._id), c]));
        const bySuffix = new Map();
        for (const c of clients) {
          const suffix = String(c.phone || '').replace(/\D/g, '').slice(-10);
          if (suffix && !bySuffix.has(suffix)) bySuffix.set(suffix, c);
        }
        return { byId, bySuffix };
      } catch (err) {
        logger.warn(`[whatsapp-messages] tenant DB unavailable for ${businessId}: ${err?.message || err}`);
        return { byId: new Map(), bySuffix: new Map() };
      }
    })(),
  ]);

  const tplById = new Map(templates.map((t) => [String(t._id), t]));
  const campById = new Map(campaigns.map((c) => [String(c._id), c]));

  return items.map((m) => {
    const tpl = m.templateId ? tplById.get(String(m.templateId)) : null;
    const camp = m.campaignId ? campById.get(String(m.campaignId)) : null;
    const direct = m.clientId ? clientLookup.byId.get(String(m.clientId)) : null;
    const suffix = String(m.recipientPhone || '').replace(/\D/g, '').slice(-10);
    const client = direct || (suffix ? clientLookup.bySuffix.get(suffix) : null);
    return {
      ...m,
      templateName: tpl?.name || m.templateName || null,
      templateCategory: tpl?.category || null,
      campaignName: camp?.name || null,
      clientName: client?.name || null,
    };
  });
}

router.get('/', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const { Message } = await getModels();
    const businessId = req.user.branchId;
    const filter = buildFilter(req);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = parseInt(req.query.skip, 10) || 0;
    const [items, total] = await Promise.all([
      Message.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      Message.countDocuments(filter),
    ]);
    const enriched = await enrichMessages(items, businessId);
    res.json({ success: true, data: { items: enriched, total, limit, skip } });
  } catch (err) {
    logger.error('[whatsapp-messages] list failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load messages' });
  }
});

router.get('/usage', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const { Message } = await getModels();
    const filter = buildFilter(req);
    const agg = await Message.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $in: ['$status', ['sent', 'delivered', 'read']] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          freeWindow: { $sum: { $cond: ['$freeWindow', 1, 0] } },
          totalCost: { $sum: { $ifNull: ['$costPaise', 0] } },
        },
      },
    ]);

    const byCategory = await Message.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] } },
          totalCost: { $sum: { $ifNull: ['$costPaise', 0] } },
        },
      },
    ]);

    const byStatus = await Message.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    /**
     * Daily volume sparkline — 14-day window so the report header can show
     * a small trend chart without forcing a separate request. We bucket by
     * UTC day to keep the math simple; clients render with their local TZ
     * which is "good enough" for SaaS dashboards (we never claim minute-
     * level accuracy in reports).
     */
    const dailyAgg = await Message.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
          },
          sent: { $sum: { $cond: [{ $in: ['$status', ['sent', 'delivered', 'read']] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 60 },
    ]);

    const summary = agg[0] || { total: 0, sent: 0, delivered: 0, read: 0, failed: 0, freeWindow: 0, totalCost: 0 };
    const deliveryRate = summary.sent > 0 ? summary.delivered / summary.sent : 0;
    const readRate = summary.delivered > 0 ? summary.read / summary.delivered : 0;

    res.json({
      success: true,
      data: {
        ...summary,
        deliveryRate,
        readRate,
        byCategory: byCategory.reduce((acc, c) => ({ ...acc, [c._id || 'unknown']: c }), {}),
        byStatus: byStatus.reduce((acc, c) => ({ ...acc, [c._id || 'unknown']: c.count }), {}),
        daily: dailyAgg.map((d) => ({
          date: d._id,
          sent: d.sent,
          delivered: d.delivered,
          read: d.read,
          failed: d.failed,
        })),
      },
    });
  } catch (err) {
    logger.error('[whatsapp-messages] usage failed:', err);
    res.status(500).json({ success: false, error: 'Failed to compute usage' });
  }
});

module.exports = router;
