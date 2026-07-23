'use strict';

/**
 * Analytics and log queries over the unified WhatsAppMessage collection (Gupshup pipeline).
 * Replaces legacy MSG91 WhatsAppMessageLog reads for tracking/logs.
 */

const databaseManager = require('../config/database-manager');

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Outbound statuses that count as successfully sent for delivery metrics. */
function isSentStatus(status) {
  return ['sent', 'delivered', 'read'].includes(String(status || '').toLowerCase());
}

function isDeliveredStatus(status) {
  return ['delivered', 'read'].includes(String(status || '').toLowerCase());
}

/**
 * Build a Mongo filter for WhatsAppMessage rows.
 * Supports both report params (from/to) and legacy log params (dateFrom/dateTo).
 */
function buildMessageFilter({
  businessId = null,
  from = null,
  to = null,
  dateFrom = null,
  dateTo = null,
  status = null,
  category = null,
  intent = null,
  messageType = null,
  provider = null,
  direction = null,
} = {}) {
  const filter = {};
  if (businessId) filter.businessId = businessId;
  if (provider) filter.provider = provider;
  if (direction) filter.direction = direction;
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (intent) filter.intent = intent;
  if (messageType) {
    filter.$or = [{ intent: messageType }, { category: messageType }];
  }
  const start = parseDate(from || dateFrom);
  const end = parseDate(to || dateTo);
  if (start || end) {
    filter.timestamp = {};
    if (start) filter.timestamp.$gte = start;
    if (end) filter.timestamp.$lte = end;
  }
  return filter;
}

async function getMessageModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('WhatsAppMessage', require('../models/WhatsAppMessage').schema);
}

async function aggregateAdminTracking({ dateFrom = null, dateTo = null, provider = null } = {}) {
  const Message = await getMessageModel();
  const filter = buildMessageFilter({ dateFrom, dateTo, provider, direction: 'outbound' });
  const rows = await Message.find(filter).select('businessId status').lean();

  let sentMessages = 0;
  let failedMessages = 0;
  const businessStats = {};

  for (const row of rows) {
    if (isSentStatus(row.status)) sentMessages += 1;
    if (row.status === 'failed') failedMessages += 1;

    const id = String(row.businessId || '');
    if (!id) continue;
    if (!businessStats[id]) {
      businessStats[id] = { businessId: id, total: 0, sent: 0, failed: 0 };
    }
    businessStats[id].total += 1;
    if (isSentStatus(row.status)) businessStats[id].sent += 1;
    if (row.status === 'failed') businessStats[id].failed += 1;
  }

  const totalMessages = rows.length;
  const successRate =
    totalMessages > 0 ? Number(((sentMessages / totalMessages) * 100).toFixed(2)) : 0;

  return {
    totalMessages,
    sentMessages,
    failedMessages,
    deliveredMessages: rows.filter((r) => isDeliveredStatus(r.status)).length,
    successRate,
    businessStats: Object.values(businessStats),
    dateRange: { from: dateFrom || null, to: dateTo || null },
  };
}

async function attachBusinessNames(businessStats) {
  if (!businessStats.length) return businessStats;
  const main = await databaseManager.getMainConnection();
  const Business = main.model('Business', require('../models/Business').schema);
  const ids = businessStats.map((s) => s.businessId);
  const businesses = await Business.find({ _id: { $in: ids } }).select('name').lean();
  const nameById = new Map(businesses.map((b) => [String(b._id), b.name]));
  return businessStats.map((stat) => ({
    ...stat,
    businessName: nameById.get(String(stat.businessId)) || 'Unknown',
  }));
}

async function aggregateBusinessTracking({
  businessId,
  dateFrom = null,
  dateTo = null,
  provider = null,
} = {}) {
  const Message = await getMessageModel();
  const filter = buildMessageFilter({ businessId, dateFrom, dateTo, provider });

  const baseScope = { businessId, ...(provider ? { provider } : {}) };
  const [totalMessages, sentMessages, failedMessages, recentMessages] = await Promise.all([
    Message.countDocuments(baseScope),
    Message.countDocuments({
      ...baseScope,
      status: { $in: ['sent', 'delivered', 'read'] },
    }),
    Message.countDocuments({ ...baseScope, status: 'failed' }),
    Message.find(filter).sort({ timestamp: -1 }).limit(100).lean(),
  ]);

  const successRate =
    totalMessages > 0 ? Number(((sentMessages / totalMessages) * 100).toFixed(2)) : 0;

  const typeStats = {};
  for (const msg of recentMessages) {
    const type = msg.intent || msg.category || 'unknown';
    if (!typeStats[type]) typeStats[type] = { total: 0, sent: 0, failed: 0 };
    typeStats[type].total += 1;
    if (isSentStatus(msg.status)) typeStats[type].sent += 1;
    if (msg.status === 'failed') typeStats[type].failed += 1;
  }

  return {
    totalMessages,
    sentMessages,
    failedMessages,
    successRate,
    typeStats,
    recentMessages: recentMessages.slice(0, 20),
    dateRange: { from: dateFrom || null, to: dateTo || null },
  };
}

function formatLogRow(row) {
  return {
    _id: row._id,
    businessId: row.businessId,
    recipientPhone: row.recipientPhone,
    status: row.status,
    messageType: row.intent || row.category || null,
    intent: row.intent || null,
    category: row.category || null,
    provider: row.provider,
    direction: row.direction,
    failureReason: row.failureReason || null,
    costPaise: row.costPaise ?? null,
    timestamp: row.timestamp,
    templateId: row.templateId || null,
    campaignId: row.campaignId || null,
    businessName: row.businessName || null,
  };
}

async function listMessageLogs({
  filter = {},
  page = 1,
  limit = 50,
  attachNames = false,
} = {}) {
  const Message = await getMessageModel();
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const [rows, total] = await Promise.all([
    Message.find(filter).sort({ timestamp: -1 }).skip(skip).limit(safeLimit).lean(),
    Message.countDocuments(filter),
  ]);

  let logs = rows.map(formatLogRow);

  if (attachNames && logs.length) {
    const main = await databaseManager.getMainConnection();
    const Business = main.model('Business', require('../models/Business').schema);
    const businessIds = [...new Set(logs.map((l) => String(l.businessId)).filter(Boolean))];
    const businesses = await Business.find({ _id: { $in: businessIds } }).select('name').lean();
    const nameById = new Map(businesses.map((b) => [String(b._id), b.name]));
    logs = logs.map((log) => ({
      ...log,
      businessName: nameById.get(String(log.businessId)) || log.businessName || 'Unknown',
    }));
  }

  return {
    logs,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 0,
    },
  };
}

module.exports = {
  parseDate,
  isSentStatus,
  isDeliveredStatus,
  buildMessageFilter,
  aggregateAdminTracking,
  attachBusinessNames,
  aggregateBusinessTracking,
  listMessageLogs,
  formatLogRow,
};
