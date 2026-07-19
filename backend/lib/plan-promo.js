'use strict';

const { normalizePlanId, isValidPlanId } = require('./plan-id');

function normalizePromoCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase();
}

function computeDiscountPaise({ discountType, discountValue, basePaise }) {
  if (!Number.isFinite(basePaise) || basePaise <= 0) {
    return { discountPaise: 0, finalPaise: 0 };
  }

  let discountPaise = 0;
  if (discountType === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(discountValue) || 0));
    discountPaise = Math.round((basePaise * pct) / 100);
  } else {
    discountPaise = Math.round((Number(discountValue) || 0) * 100);
  }

  discountPaise = Math.min(basePaise, Math.max(0, discountPaise));
  return { discountPaise, finalPaise: basePaise - discountPaise };
}

async function getPromoModels() {
  const databaseManager = require('../config/database-manager');
  const mainConnection = await databaseManager.getMainConnection();
  return {
    PlanPromoCode: mainConnection.model(
      'PlanPromoCode',
      require('../models/PlanPromoCode').schema
    ),
    PlanPromoRedemption: mainConnection.model(
      'PlanPromoRedemption',
      require('../models/PlanPromoRedemption').schema
    ),
  };
}

/**
 * Validate a plan billing promo/coupon for checkout (no side effects).
 */
async function validatePlanPromoCode({
  code,
  businessId,
  planId: rawPlanId,
  billingPeriod,
  basePaise,
}) {
  const normalized = normalizePromoCode(code);
  if (!normalized) {
    return { ok: false, error: 'Enter a promo code' };
  }
  if (!isValidPlanId(rawPlanId)) {
    return { ok: false, error: 'Invalid plan' };
  }
  if (!['monthly', 'yearly'].includes(billingPeriod)) {
    return { ok: false, error: 'Invalid billing period' };
  }
  if (!Number.isFinite(basePaise) || basePaise < 0) {
    return { ok: false, error: 'Invalid plan price' };
  }

  const planId = normalizePlanId(rawPlanId);
  const { PlanPromoCode, PlanPromoRedemption } = await getPromoModels();
  const promo = await PlanPromoCode.findOne({ code: normalized, active: true }).lean();
  if (!promo) {
    return { ok: false, error: 'Invalid or expired promo code' };
  }

  const now = new Date();
  if (promo.validFrom && new Date(promo.validFrom) > now) {
    return { ok: false, error: 'This promo code is not active yet' };
  }
  if (promo.validUntil && new Date(promo.validUntil) < now) {
    return { ok: false, error: 'This promo code has expired' };
  }
  if (
    Array.isArray(promo.planIds) &&
    promo.planIds.length > 0 &&
    !promo.planIds.includes(planId)
  ) {
    return { ok: false, error: 'This promo code does not apply to the selected plan' };
  }
  if (
    Array.isArray(promo.billingPeriods) &&
    promo.billingPeriods.length > 0 &&
    !promo.billingPeriods.includes(billingPeriod)
  ) {
    return {
      ok: false,
      error: 'This promo code does not apply to the selected billing period',
    };
  }
  if (
    promo.maxRedemptions != null &&
    Number(promo.redemptionCount) >= Number(promo.maxRedemptions)
  ) {
    return { ok: false, error: 'This promo code has reached its usage limit' };
  }
  if (promo.onePerBusiness !== false && businessId) {
    const prior = await PlanPromoRedemption.findOne({
      promoCodeId: promo._id,
      businessId,
    })
      .select('_id')
      .lean();
    if (prior) {
      return { ok: false, error: 'You have already used this promo code' };
    }
  }

  const { discountPaise, finalPaise } = computeDiscountPaise({
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    basePaise,
  });

  if (discountPaise <= 0) {
    return { ok: false, error: 'This promo code does not apply a discount' };
  }

  return {
    ok: true,
    promo: {
      id: String(promo._id),
      code: promo.code,
      description: promo.description || '',
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discountPaise,
      discountRupees: discountPaise / 100,
      finalPaise,
      finalRupees: finalPaise / 100,
      basePaise,
      baseRupees: basePaise / 100,
    },
  };
}

/**
 * Record redemption after successful checkout. Throws on duplicate/limit races.
 */
async function recordPlanPromoRedemption({
  promoCodeId,
  code,
  businessId,
  planId,
  billingPeriod,
  discountPaise,
  planInvoiceTransactionId,
}) {
  const { PlanPromoCode, PlanPromoRedemption } = await getPromoModels();

  const updated = await PlanPromoCode.findOneAndUpdate(
    {
      _id: promoCodeId,
      active: true,
      $or: [
        { maxRedemptions: null },
        { $expr: { $lt: ['$redemptionCount', '$maxRedemptions'] } },
      ],
    },
    { $inc: { redemptionCount: 1 } },
    { new: true }
  );
  if (!updated) {
    throw new Error('Promo code is no longer available');
  }

  try {
    await PlanPromoRedemption.create({
      promoCodeId,
      code,
      businessId,
      planId,
      billingPeriod,
      discountPaise,
      planInvoiceTransactionId: planInvoiceTransactionId || null,
    });
  } catch (err) {
    await PlanPromoCode.updateOne({ _id: promoCodeId }, { $inc: { redemptionCount: -1 } });
    if (err?.code === 11000) {
      throw new Error('You have already used this promo code');
    }
    throw err;
  }
}

/**
 * Apply a validated promo to a GST checkout breakdown (discount on base, then GST).
 */
function applyPromoToGstBreakdown(breakdown, promoResult) {
  if (!promoResult?.ok || !promoResult.promo) {
    return { breakdown, promo: null };
  }
  const { promo } = promoResult;
  const basePaise = promo.finalPaise;
  const gstRate = Number(breakdown?.gstRate || 0);
  const gstPaise = gstRate > 0 ? Math.round(basePaise * gstRate) : 0;
  const totalPaise = basePaise + gstPaise;
  return {
    breakdown: {
      ...breakdown,
      basePaise,
      gstPaise,
      totalPaise,
      baseRupees: basePaise / 100,
      gstRupees: gstPaise / 100,
      totalRupees: totalPaise / 100,
    },
    promo,
  };
}

/**
 * Validate promo (if code provided) and return adjusted breakdown for checkout.
 */
async function resolvePromoForCheckout({
  code,
  businessId,
  planId,
  billingPeriod,
  breakdown,
}) {
  const trimmed = String(code || '').trim();
  if (!trimmed) {
    return { breakdown, promo: null };
  }
  const validation = await validatePlanPromoCode({
    code: trimmed,
    businessId,
    planId,
    billingPeriod,
    basePaise: breakdown.basePaise,
  });
  if (!validation.ok) {
    return { error: validation.error };
  }
  return applyPromoToGstBreakdown(breakdown, validation);
}

module.exports = {
  normalizePromoCode,
  computeDiscountPaise,
  validatePlanPromoCode,
  recordPlanPromoRedemption,
  applyPromoToGstBreakdown,
  resolvePromoForCheckout,
};
