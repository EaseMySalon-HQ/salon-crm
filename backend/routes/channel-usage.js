const express = require('express');
const { logger } = require('../utils/logger');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase, setupMainDatabase } = require('../middleware/business-db');
const databaseManager = require('../config/database-manager');

/**
 * SMS and WhatsApp no longer have free quotas — every message is billed per
 * message from the business wallet (see lib/wallet-deduction.js). These
 * endpoints return delivery stats + paginated logs. The `quota` / `used` /
 * `remaining` / `percentUsed` fields are kept in the response for backward
 * compatibility but are always null/0.
 */
const EMPTY_QUOTA = Object.freeze({
  quota: null,
  used: 0,
  remaining: null,
  percentUsed: 0,
  unlimited: true,
});

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildDateFilter(query) {
  const { dateFrom, dateTo } = query;
  if (!dateFrom && !dateTo) return null;
  const range = {};
  if (dateFrom) range.$gte = new Date(dateFrom);
  if (dateTo) range.$lte = new Date(dateTo);
  return range;
}

/**
 * GET /api/channel-usage/sms
 * Returns paginated SMS logs for the authenticated business.
 */
router.get(
  '/sms',
  authenticateToken,
  setupMainDatabase,
  setupBusinessDatabase,
  async (req, res) => {
    try {
      const businessId = req.user?.branchId;
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'Business ID not found' });
      }

      const mainConnection = await databaseManager.getMainConnection();
      const SmsMessageLog = mainConnection.model(
        'SmsMessageLog',
        require('../models/SmsMessageLog').schema
      );

      const filter = { businessId };
      const { status, messageType } = req.query;
      if (status) filter.status = status;
      if (messageType) filter.messageType = messageType;
      const dateFilter = buildDateFilter(req.query);
      if (dateFilter) filter.timestamp = dateFilter;

      const { page, limit, skip } = parsePagination(req.query);

      const [logs, total, sentCount, failedCount] = await Promise.all([
        SmsMessageLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
        SmsMessageLog.countDocuments(filter),
        SmsMessageLog.countDocuments({ businessId, status: 'sent' }),
        SmsMessageLog.countDocuments({ businessId, status: 'failed' }),
      ]);

      res.json({
        success: true,
        data: {
          ...EMPTY_QUOTA,
          stats: {
            total,
            sent: sentCount,
            failed: failedCount,
          },
          logs: logs.map(l => ({
            _id: l._id,
            recipientPhone: l.recipientPhone,
            messageType: l.messageType,
            status: l.status,
            error: l.error,
            timestamp: l.timestamp,
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching SMS channel usage:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch SMS channel usage' });
    }
  }
);

/**
 * GET /api/channel-usage/email
 * Returns paginated email logs (no quota).
 */
router.get(
  '/email',
  authenticateToken,
  setupMainDatabase,
  setupBusinessDatabase,
  async (req, res) => {
    try {
      const businessId = req.user?.branchId;
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'Business ID not found' });
      }

      const mainConnection = await databaseManager.getMainConnection();
      const EmailMessageLog = mainConnection.model(
        'EmailMessageLog',
        require('../models/EmailMessageLog').schema
      );

      const filter = { businessId };
      const { status, messageType } = req.query;
      if (status) filter.status = status;
      if (messageType) filter.messageType = messageType;
      const dateFilter = buildDateFilter(req.query);
      if (dateFilter) filter.timestamp = dateFilter;

      const { page, limit, skip } = parsePagination(req.query);

      const [logs, total, sentCount, failedCount] = await Promise.all([
        EmailMessageLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
        EmailMessageLog.countDocuments(filter),
        EmailMessageLog.countDocuments({ businessId, status: 'sent' }),
        EmailMessageLog.countDocuments({ businessId, status: 'failed' }),
      ]);

      res.json({
        success: true,
        data: {
          ...EMPTY_QUOTA,
          stats: {
            total,
            sent: sentCount,
            failed: failedCount,
          },
          logs: logs.map(l => ({
            _id: l._id,
            recipientEmail: l.recipientEmail,
            messageType: l.messageType,
            status: l.status,
            subject: l.subject,
            error: l.error,
            timestamp: l.timestamp,
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching Email channel usage:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch Email channel usage' });
    }
  }
);

/**
 * GET /api/channel-usage/whatsapp
 * Returns paginated WhatsApp logs for the authenticated business.
 */
router.get(
  '/whatsapp',
  authenticateToken,
  setupMainDatabase,
  setupBusinessDatabase,
  async (req, res) => {
    try {
      const businessId = req.user?.branchId;
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'Business ID not found' });
      }

      const mainConnection = await databaseManager.getMainConnection();
      const WhatsAppMessageLog = mainConnection.model(
        'WhatsAppMessageLog',
        require('../models/WhatsAppMessageLog').schema
      );

      const filter = { businessId };
      const { status, messageType } = req.query;
      if (status) filter.status = status;
      if (messageType) filter.messageType = messageType;
      const dateFilter = buildDateFilter(req.query);
      if (dateFilter) filter.timestamp = dateFilter;

      const { page, limit, skip } = parsePagination(req.query);

      const [logs, total, sentCount, failedCount] = await Promise.all([
        WhatsAppMessageLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
        WhatsAppMessageLog.countDocuments(filter),
        WhatsAppMessageLog.countDocuments({ businessId, status: 'sent' }),
        WhatsAppMessageLog.countDocuments({ businessId, status: 'failed' }),
      ]);

      res.json({
        success: true,
        data: {
          ...EMPTY_QUOTA,
          stats: {
            total,
            sent: sentCount,
            failed: failedCount,
          },
          logs: logs.map(l => ({
            _id: l._id,
            recipientPhone: l.recipientPhone,
            messageType: l.messageType,
            status: l.status,
            error: l.error,
            timestamp: l.timestamp,
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching WhatsApp channel usage:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch WhatsApp channel usage' });
    }
  }
);

module.exports = router;
