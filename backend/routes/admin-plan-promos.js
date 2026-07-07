'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const { setupMainDatabase } = require('../middleware/business-db');
const { authenticateAdmin, checkAdminPermission } = require('../middleware/admin-auth');
const { logAdminActivity, getClientIp } = require('../utils/admin-logger');
const { normalizePromoCode } = require('../lib/plan-promo');

const router = express.Router();

const CANONICAL_PLANS = ['starter', 'growth', 'pro'];
const BILLING_PERIODS = ['monthly', 'yearly'];

function serializePromo(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(d._id),
    code: d.code,
    description: d.description || '',
    discountType: d.discountType,
    discountValue: d.discountValue,
    planIds: Array.isArray(d.planIds) ? d.planIds : [],
    billingPeriods: Array.isArray(d.billingPeriods) ? d.billingPeriods : [],
    validFrom: d.validFrom || null,
    validUntil: d.validUntil || null,
    maxRedemptions: d.maxRedemptions ?? null,
    redemptionCount: d.redemptionCount ?? 0,
    onePerBusiness: d.onePerBusiness !== false,
    active: d.active !== false,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function parseOptionalDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { error: 'Invalid date' };
  return { value: d };
}

function validatePromoPayload(body, { isUpdate = false } = {}) {
  const errors = [];

  const code = body.code != null ? normalizePromoCode(String(body.code)) : '';
  if (!isUpdate && !code) errors.push('Code is required');
  if (code && !/^[A-Z0-9_-]{3,32}$/.test(code)) {
    errors.push('Code must be 3–32 characters (letters, numbers, underscore, hyphen)');
  }

  const discountType = body.discountType;
  if (!isUpdate || body.discountType !== undefined) {
    if (!['percent', 'fixed'].includes(discountType)) {
      errors.push('Discount type must be percent or fixed');
    }
  }

  const discountValue = Number(body.discountValue);
  if (!isUpdate || body.discountValue !== undefined) {
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      errors.push('Discount value must be greater than 0');
    } else if (discountType === 'percent' && discountValue > 100) {
      errors.push('Percent discount cannot exceed 100');
    }
  }

  let planIds = body.planIds;
  if (planIds !== undefined) {
    if (!Array.isArray(planIds)) {
      errors.push('planIds must be an array');
    } else {
      planIds = planIds.filter((id) => CANONICAL_PLANS.includes(id));
    }
  }

  let billingPeriods = body.billingPeriods;
  if (billingPeriods !== undefined) {
    if (!Array.isArray(billingPeriods)) {
      errors.push('billingPeriods must be an array');
    } else {
      billingPeriods = billingPeriods.filter((p) => BILLING_PERIODS.includes(p));
    }
  }

  let validFrom = undefined;
  let validUntil = undefined;
  if (body.validFrom !== undefined) {
    const parsed = parseOptionalDate(body.validFrom);
    if (parsed.error) errors.push('validFrom is invalid');
    else validFrom = parsed.value;
  }
  if (body.validUntil !== undefined) {
    const parsed = parseOptionalDate(body.validUntil);
    if (parsed.error) errors.push('validUntil is invalid');
    else validUntil = parsed.value;
  }
  if (validFrom && validUntil && validFrom > validUntil) {
    errors.push('validFrom must be before validUntil');
  }

  let maxRedemptions = body.maxRedemptions;
  if (maxRedemptions !== undefined && maxRedemptions !== null && maxRedemptions !== '') {
    maxRedemptions = Number(maxRedemptions);
    if (!Number.isFinite(maxRedemptions) || maxRedemptions < 1) {
      errors.push('maxRedemptions must be at least 1 when set');
    }
  } else if (maxRedemptions === '' || maxRedemptions === null) {
    maxRedemptions = null;
  }

  if (errors.length) return { errors };

  const payload = {};
  if (code) payload.code = code;
  if (body.description !== undefined) payload.description = String(body.description || '').trim();
  if (body.discountType !== undefined) payload.discountType = discountType;
  if (body.discountValue !== undefined) payload.discountValue = discountValue;
  if (planIds !== undefined) payload.planIds = planIds;
  if (billingPeriods !== undefined) payload.billingPeriods = billingPeriods;
  if (body.validFrom !== undefined) payload.validFrom = validFrom;
  if (body.validUntil !== undefined) payload.validUntil = validUntil;
  if (body.maxRedemptions !== undefined) payload.maxRedemptions = maxRedemptions;
  if (body.onePerBusiness !== undefined) payload.onePerBusiness = Boolean(body.onePerBusiness);
  if (body.active !== undefined) payload.active = Boolean(body.active);

  return { payload };
}

// GET /api/admin/plan-promos
router.get(
  '/',
  authenticateAdmin,
  setupMainDatabase,
  checkAdminPermission('plans', 'view'),
  async (req, res) => {
    try {
      const { PlanPromoCode } = req.mainModels;
      const { active, search } = req.query;

      const query = {};
      if (active === 'true') query.active = true;
      if (active === 'false') query.active = false;
      if (search && String(search).trim()) {
        query.code = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }

      const docs = await PlanPromoCode.find(query).sort({ createdAt: -1 }).lean();
      res.json({
        success: true,
        data: docs.map(serializePromo),
      });
    } catch (err) {
      logger.error('[admin-plan-promos] list failed:', err);
      res.status(500).json({ success: false, error: 'Failed to list promo codes' });
    }
  }
);

// POST /api/admin/plan-promos
router.post(
  '/',
  authenticateAdmin,
  setupMainDatabase,
  checkAdminPermission('plans', 'create'),
  async (req, res) => {
    try {
      const { PlanPromoCode } = req.mainModels;
      const validated = validatePromoPayload(req.body || {});
      if (validated.errors) {
        return res.status(400).json({ success: false, error: validated.errors.join('; ') });
      }

      const existing = await PlanPromoCode.findOne({ code: validated.payload.code });
      if (existing) {
        return res.status(409).json({ success: false, error: 'A promo code with this code already exists' });
      }

      const doc = await PlanPromoCode.create({
        ...validated.payload,
        redemptionCount: 0,
      });

      await logAdminActivity({
        adminId: req.admin,
        action: 'plan_promo_created',
        module: 'plans',
        resourceId: String(doc._id),
        resourceType: 'PlanPromoCode',
        details: { code: doc.code, discountType: doc.discountType, discountValue: doc.discountValue },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ success: true, data: serializePromo(doc) });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ success: false, error: 'A promo code with this code already exists' });
      }
      logger.error('[admin-plan-promos] create failed:', err);
      res.status(500).json({ success: false, error: 'Failed to create promo code' });
    }
  }
);

// PUT /api/admin/plan-promos/:id
router.put(
  '/:id',
  authenticateAdmin,
  setupMainDatabase,
  checkAdminPermission('plans', 'update'),
  async (req, res) => {
    try {
      const { PlanPromoCode } = req.mainModels;
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid promo id' });
      }

      const existing = await PlanPromoCode.findById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Promo code not found' });
      }

      const validated = validatePromoPayload(req.body || {}, { isUpdate: true });
      if (validated.errors) {
        return res.status(400).json({ success: false, error: validated.errors.join('; ') });
      }

      if (validated.payload.code && validated.payload.code !== existing.code) {
        const dup = await PlanPromoCode.findOne({ code: validated.payload.code, _id: { $ne: id } });
        if (dup) {
          return res.status(409).json({ success: false, error: 'A promo code with this code already exists' });
        }
      }

      Object.assign(existing, validated.payload);
      await existing.save();

      await logAdminActivity({
        adminId: req.admin,
        action: 'plan_promo_updated',
        module: 'plans',
        resourceId: String(existing._id),
        resourceType: 'PlanPromoCode',
        details: { code: existing.code },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });

      res.json({ success: true, data: serializePromo(existing) });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ success: false, error: 'A promo code with this code already exists' });
      }
      logger.error('[admin-plan-promos] update failed:', err);
      res.status(500).json({ success: false, error: 'Failed to update promo code' });
    }
  }
);

// PATCH /api/admin/plan-promos/:id/active
router.patch(
  '/:id/active',
  authenticateAdmin,
  setupMainDatabase,
  checkAdminPermission('plans', 'update'),
  async (req, res) => {
    try {
      const { PlanPromoCode } = req.mainModels;
      const { id } = req.params;
      const { active } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid promo id' });
      }
      if (typeof active !== 'boolean') {
        return res.status(400).json({ success: false, error: 'active must be a boolean' });
      }

      const doc = await PlanPromoCode.findByIdAndUpdate(
        id,
        { $set: { active } },
        { new: true }
      );
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Promo code not found' });
      }

      await logAdminActivity({
        adminId: req.admin,
        action: active ? 'plan_promo_activated' : 'plan_promo_deactivated',
        module: 'plans',
        resourceId: String(doc._id),
        resourceType: 'PlanPromoCode',
        details: { code: doc.code, active },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });

      res.json({ success: true, data: serializePromo(doc) });
    } catch (err) {
      logger.error('[admin-plan-promos] toggle active failed:', err);
      res.status(500).json({ success: false, error: 'Failed to update promo status' });
    }
  }
);

module.exports = router;
