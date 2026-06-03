'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { gate, FEATURE } = require('../config/feature-routes');
const { logger } = require('../utils/logger');

const router = express.Router();

function canFeedbackView(req) {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (!req.user.hasLoginAccess) return false;
  return req.user.permissions?.some(
    (p) => p.module === 'feedback' && p.feature === 'view' && p.enabled
  );
}

function canFeedbackEdit(req) {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (!req.user.hasLoginAccess) return false;
  return req.user.permissions?.some(
    (p) =>
      p.module === 'feedback' &&
      p.enabled &&
      (p.feature === 'edit' || p.feature === 'manage')
  );
}

function requireFeedbackView(req, res, next) {
  if (!canFeedbackView(req)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Required permission: feedback.view',
    });
  }
  next();
}

function requireFeedbackEdit(req, res, next) {
  if (!canFeedbackEdit(req)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Required permission: feedback.edit or feedback.manage',
    });
  }
  next();
}

function tenantBusinessFilter(req) {
  const bid = req.user.branchId;
  if (!bid) return null;
  return new mongoose.Types.ObjectId(bid);
}

function sanitizeNotes(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, 5000);
}

router.get(
  '/stats/summary',
  authenticateToken,
  setupBusinessDatabase,
  gate(FEATURE.FEEDBACK_MANAGEMENT),
  requireFeedbackView,
  async (req, res) => {
    try {
      const { Feedback } = req.businessModels;
      const bid = tenantBusinessFilter(req);
      if (!bid) {
        return res.status(400).json({ success: false, error: 'Missing branch context' });
      }

      const match = { businessId: bid };
      const [agg] = await Feedback.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avgRating: { $avg: '$rating' },
            fiveStar: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
            lowRating: { $sum: { $cond: [{ $lte: ['$rating', 4] }, 1, 0] } },
            pendingFollowUp: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
          },
        },
      ]);

      const summary = agg || {
        total: 0,
        avgRating: null,
        fiveStar: 0,
        lowRating: 0,
        pendingFollowUp: 0,
      };

      return res.json({
        success: true,
        data: {
          total: summary.total || 0,
          averageRating:
            summary.avgRating != null ? Math.round(summary.avgRating * 10) / 10 : null,
          fiveStarCount: summary.fiveStar || 0,
          lowRatingCount: summary.lowRating || 0,
          pendingFollowUpCount: summary.pendingFollowUp || 0,
        },
      });
    } catch (err) {
      logger.error('feedback stats:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.get(
  '/branches',
  authenticateToken,
  setupBusinessDatabase,
  gate(FEATURE.FEEDBACK_MANAGEMENT),
  requireFeedbackView,
  async (req, res) => {
    try {
      const { Feedback } = req.businessModels;
      const bid = tenantBusinessFilter(req);
      if (!bid) {
        return res.status(400).json({ success: false, error: 'Missing branch context' });
      }
      const rows = await Feedback.distinct('branchId', { businessId: bid });
      return res.json({
        success: true,
        data: rows.map((id) => ({ id: String(id) })),
      });
    } catch (err) {
      logger.error('feedback branches:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.get(
  '/',
  authenticateToken,
  setupBusinessDatabase,
  gate(FEATURE.FEEDBACK_MANAGEMENT),
  requireFeedbackView,
  async (req, res) => {
    try {
      const { Feedback, Sale } = req.businessModels;
      const bid = tenantBusinessFilter(req);
      if (!bid) {
        return res.status(400).json({ success: false, error: 'Missing branch context' });
      }

      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
      const skip = (page - 1) * limit;

      const filter = { businessId: bid };

      if (req.query.status && ['new', 'reviewed', 'resolved'].includes(req.query.status)) {
        filter.status = req.query.status;
      }
      if (req.query.rating) {
        const r = Number(req.query.rating);
        if (r >= 1 && r <= 5) filter.rating = r;
      }
      if (req.query.branchId && mongoose.Types.ObjectId.isValid(req.query.branchId)) {
        filter.branchId = new mongoose.Types.ObjectId(req.query.branchId);
      }
      if (req.query.from || req.query.to) {
        filter.submittedAt = {};
        if (req.query.from) {
          const d = new Date(req.query.from);
          if (!Number.isNaN(d.getTime())) filter.submittedAt.$gte = d;
        }
        if (req.query.to) {
          const d = new Date(req.query.to);
          if (!Number.isNaN(d.getTime())) filter.submittedAt.$lte = d;
        }
      }

      const [items, total] = await Promise.all([
        Feedback.find(filter)
          .sort({ submittedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Feedback.countDocuments(filter),
      ]);

      const saleIds = [...new Set(items.map((f) => String(f.saleId)))];
      const sales = await Sale.find({ _id: { $in: saleIds } })
        .select('billNo branchId')
        .lean();
      const saleMap = Object.fromEntries(sales.map((s) => [String(s._id), s]));

      const rows = items.map((f) => {
        const sale = saleMap[String(f.saleId)];
        return {
          _id: f._id,
          customerName: f.customerName,
          customerPhone: f.customerPhone,
          invoiceNumber: sale?.billNo || '',
          branchId: f.branchId,
          rating: f.rating,
          reviewText: f.reviewText,
          source: f.source,
          submittedAt: f.submittedAt,
          status: f.status,
        };
      });

      return res.json({
        success: true,
        data: { items: rows, total, page, limit },
      });
    } catch (err) {
      logger.error('feedback list:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.get(
  '/:id',
  authenticateToken,
  setupBusinessDatabase,
  gate(FEATURE.FEEDBACK_MANAGEMENT),
  requireFeedbackView,
  async (req, res) => {
    try {
      const { Feedback, Sale } = req.businessModels;
      const bid = tenantBusinessFilter(req);
      if (!bid || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, error: 'Invalid request' });
      }

      const doc = await Feedback.findOne({
        _id: req.params.id,
        businessId: bid,
      }).lean();

      if (!doc) {
        return res.status(404).json({ success: false, error: 'Feedback not found' });
      }

      const sale = await Sale.findById(doc.saleId).lean();
      const invoice = sale
        ? {
            billNo: sale.billNo,
            date: sale.date,
            netTotal: sale.netTotal,
            grossTotal: sale.grossTotal,
            items: Array.isArray(sale.items)
              ? sale.items.map((it) => ({
                  name: it.name,
                  type: it.type,
                  quantity: it.quantity,
                  total: it.total,
                }))
              : [],
          }
        : null;

      return res.json({
        success: true,
        data: {
          ...doc,
          invoice,
        },
      });
    } catch (err) {
      logger.error('feedback get:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.patch(
  '/:id/status',
  authenticateToken,
  setupBusinessDatabase,
  gate(FEATURE.FEEDBACK_MANAGEMENT),
  requireFeedbackEdit,
  async (req, res) => {
    try {
      const { Feedback } = req.businessModels;
      const bid = tenantBusinessFilter(req);
      const status = req.body?.status;
      if (!bid || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, error: 'Invalid request' });
      }
      if (!['new', 'reviewed', 'resolved'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }

      const doc = await Feedback.findOneAndUpdate(
        { _id: req.params.id, businessId: bid },
        { $set: { status } },
        { new: true }
      ).lean();

      if (!doc) {
        return res.status(404).json({ success: false, error: 'Feedback not found' });
      }
      return res.json({ success: true, data: doc });
    } catch (err) {
      logger.error('feedback status:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.patch(
  '/:id/notes',
  authenticateToken,
  setupBusinessDatabase,
  gate(FEATURE.FEEDBACK_MANAGEMENT),
  requireFeedbackEdit,
  async (req, res) => {
    try {
      const { Feedback } = req.businessModels;
      const bid = tenantBusinessFilter(req);
      if (!bid || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, error: 'Invalid request' });
      }

      const internalNotes = sanitizeNotes(req.body?.internalNotes);

      const doc = await Feedback.findOneAndUpdate(
        { _id: req.params.id, businessId: bid },
        { $set: { internalNotes } },
        { new: true }
      ).lean();

      if (!doc) {
        return res.status(404).json({ success: false, error: 'Feedback not found' });
      }
      return res.json({ success: true, data: doc });
    } catch (err) {
      logger.error('feedback notes:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;
