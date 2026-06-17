/**
 * Self-service plan-subscription checkout.
 *
 * Surface for the Settings → Plan & Billing → Proceed to Checkout button:
 *   POST /api/plan/checkout/order          — create payment order for a renewal/upgrade
 *   POST /api/plan/checkout/verify         — verify gateway callback, activate plan, email invoice
 *   POST /api/plan/checkout/wallet         — debit messaging wallet and activate plan
 *   GET  /api/plan/checkout/status         — current pending-downgrade + last tx summary (for UI state)
 *   POST /api/plan/schedule-downgrade      — queue a lower-tier plan to apply at next renewal (no charge)
 *   DELETE /api/plan/schedule-downgrade    — cancel a previously scheduled downgrade
 *   GET  /api/plan/invoice/:transactionId  — download a GST tax invoice PDF for a past plan payment
 *
 * Design notes
 * ────────────
 *  • Only the business owner can use these endpoints.
 *  • Charging logic mirrors the wallet-recharge flow — 18% GST is added on
 *    top of the list price; the gateway captures base + GST; the
 *    PlanInvoiceTransaction records both slices for audit.
 *  • Renewals/upgrades extend the existing `renewalDate` by the selected
 *    period, so paying early doesn't burn days on the current cycle.
 *  • Downgrades are always scheduled for the next renewal — this endpoint
 *    family NEVER charges the user for a downgrade.
 *  • Whenever a payment succeeds we clear any queued downgrade, since the
 *    plan state has just been re-committed to the chosen tier.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const databaseManager = require('../config/database-manager');
const paymentGateway = require('../lib/payment-gateway');
const {
  sendPlanRenewalInvoice,
  buildPlanInvoicePDFForTransaction,
} = require('../lib/send-plan-invoice');
const { getPlanConfig } = require('../config/plans');
const { normalizePlanId, tierOf, isValidPlanId } = require('../lib/plan-id');
const entitlementsCache = require('../lib/entitlements-cache');
const { atomicDeduct } = require('../lib/wallet-deduction');

const GST_RATE = 0.18;

async function getMainModels() {
  const mainConnection = await databaseManager.getMainConnection();
  return {
    Business: mainConnection.model('Business', require('../models/Business').schema),
    AdminSettings: mainConnection.model(
      'AdminSettings',
      require('../models/AdminSettings').schema
    ),
    PlanInvoiceTransaction: mainConnection.model(
      'PlanInvoiceTransaction',
      require('../models/PlanInvoiceTransaction').schema
    ),
    // PlanChangeLog exports `{ schema, model }` — pull the schema.
    PlanChangeLog: mainConnection.model(
      'PlanChangeLog',
      require('../models/PlanChangeLog').schema
    ),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function requireOwner(req, res) {
  if (!req.user?.isOwner) {
    res.status(403).json({
      success: false,
      error: 'Only the business owner can manage plan & billing.',
    });
    return false;
  }
  return true;
}

function getPlanPriceRupees(planId, billingPeriod) {
  const cfg = getPlanConfig(planId);
  if (!cfg) return null;
  const raw =
    billingPeriod === 'yearly' ? cfg.yearlyPrice : cfg.monthlyPrice;
  if (raw === null || raw === undefined) return null;
  if (!Number.isFinite(raw)) return null;
  return Number(raw);
}

function computeBreakdown(planId, billingPeriod) {
  const price = getPlanPriceRupees(planId, billingPeriod);
  if (price === null) return null;
  if (price === 0) {
    return {
      basePaise: 0,
      gstPaise: 0,
      totalPaise: 0,
      baseRupees: 0,
      gstRupees: 0,
      totalRupees: 0,
      gstRate: GST_RATE,
    };
  }
  const basePaise = Math.round(price * 100);
  const gstPaise = Math.round(basePaise * GST_RATE);
  const totalPaise = basePaise + gstPaise;
  return {
    basePaise,
    gstPaise,
    totalPaise,
    baseRupees: basePaise / 100,
    gstRupees: gstPaise / 100,
    totalRupees: totalPaise / 100,
    gstRate: GST_RATE,
  };
}

/**
 * Advance a date by the selected billing period.
 * Treats `null`/`undefined` base as "starting from now".
 */
function advanceDate(baseDate, billingPeriod) {
  const d = baseDate ? new Date(baseDate) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return advanceDate(now, billingPeriod);
  }
  if (billingPeriod === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

function classifyKind({ previousPlanId, selectedPlanId, hasPriorPaidPlan }) {
  if (!hasPriorPaidPlan) return 'new';
  if (previousPlanId === selectedPlanId) return 'renewal';
  const prev = tierOf(previousPlanId);
  const next = tierOf(selectedPlanId);
  if (next > prev) return 'upgrade';
  if (next < prev) return 'change'; // caught earlier — shouldn't reach here
  return 'change';
}

/**
 * Shared post-payment handler: mutate Business.plan, write ledger + audit rows,
 * enqueue the GST invoice email. Used by gateway verify and wallet checkout.
 */
async function finalizePlanCheckout({
  req,
  businessId,
  planId,
  billingPeriod,
  expected,
  payment: {
    provider,
    providerOrderId = null,
    providerPaymentId = null,
    totalChargedPaise,
  },
}) {
  const { Business, PlanInvoiceTransaction, PlanChangeLog } = await getMainModels();

  const business = await Business.findById(businessId);
  if (!business) {
    const err = new Error('Business not found');
    err.status = 404;
    throw err;
  }

  const previousPlan = {
    planId: business.plan?.planId || null,
    billingPeriod: business.plan?.billingPeriod || null,
    renewalDate: business.plan?.renewalDate || null,
    isTrial: !!business.plan?.isTrial,
  };
  const hasPriorPaidPlan = !!(previousPlan.planId && !previousPlan.isTrial);
  const kind = classifyKind({
    previousPlanId: previousPlan.planId,
    selectedPlanId: planId,
    hasPriorPaidPlan,
  });

  const baseForExtension =
    previousPlan.renewalDate && new Date(previousPlan.renewalDate) > new Date()
      ? previousPlan.renewalDate
      : null;
  const newRenewalDate = advanceDate(baseForExtension, billingPeriod);

  if (!business.plan) business.plan = {};
  business.plan.planId = planId;
  business.plan.billingPeriod = billingPeriod;
  business.plan.renewalDate = newRenewalDate;
  business.plan.isTrial = false;
  business.plan.trialEndsAt = null;
  business.plan.pendingPlanId = null;
  business.plan.pendingBillingPeriod = null;
  business.plan.pendingEffectiveAt = null;

  const planConfig = getPlanConfig(planId);
  if (planConfig?.limits) {
    if (!business.plan.addons) business.plan.addons = {};
    if (!business.plan.addons.sms) business.plan.addons.sms = {};
    business.plan.addons.sms.enabled =
      (planConfig.limits.smsMessages ?? 0) > 0;
    if (!business.plan.addons.whatsapp) business.plan.addons.whatsapp = {};
    business.plan.addons.whatsapp.enabled =
      (planConfig.limits.whatsappMessages ?? 0) > 0;
  }

  await business.save();
  entitlementsCache.invalidate(businessId);

  const now = new Date();
  const planTxn = await PlanInvoiceTransaction.create({
    businessId,
    kind,
    planId,
    billingPeriod,
    amountPaise: expected.basePaise,
    gstPaise: expected.gstPaise,
    gstRate: expected.gstRate,
    totalChargedPaise: totalChargedPaise ?? expected.totalPaise,
    provider,
    providerOrderId,
    providerPaymentId,
    description: `${kind === 'renewal' ? 'Renewal' : kind === 'upgrade' ? 'Upgrade' : kind === 'new' ? 'New subscription' : 'Plan change'} — ${planId} (${billingPeriod}) via ${provider}`,
    previousRenewalDate: previousPlan.renewalDate,
    newRenewalDate,
    previousPlanId: previousPlan.planId,
    previousBillingPeriod: previousPlan.billingPeriod,
    timestamp: now,
  });

  try {
    await PlanChangeLog.create({
      businessId,
      changedBy: req.user._id,
      changeType:
        previousPlan.planId === planId ? 'billing_period_change' : 'plan_change',
      previousValue: previousPlan,
      newValue: {
        planId,
        billingPeriod,
        renewalDate: newRenewalDate,
        isTrial: false,
      },
      field: previousPlan.planId === planId ? 'billingPeriod' : 'planId',
      reason: `Self-service ${kind}`,
      metadata: {
        source: 'self_service',
        provider,
        providerOrderId,
        providerPaymentId,
        transactionId: planTxn._id,
        amountPaise: expected.basePaise,
        gstPaise: expected.gstPaise,
        totalChargedPaise: totalChargedPaise ?? expected.totalPaise,
      },
    });
  } catch (logErr) {
    logger.warn(
      '[plan-checkout] PlanChangeLog write failed:',
      logErr?.message || logErr
    );
  }

  setImmediate(() => {
    sendPlanRenewalInvoice({
      transactionId: planTxn._id,
      triggeredByEmail: req.user?.email || null,
    }).catch(err => {
      logger.error(
        '[plan-invoice] fire-and-forget send failed:',
        err?.message || err
      );
    });
  });

  return {
    kind,
    planId,
    billingPeriod,
    newRenewalDate,
    planTxn,
    expected,
    plan: {
      planId,
      billingPeriod,
      renewalDate: newRenewalDate,
      isTrial: false,
      pendingPlanId: null,
      pendingBillingPeriod: null,
      pendingEffectiveAt: null,
    },
  };
}

function buildCheckoutSuccessPayload(result) {
  const { kind, planId, billingPeriod, newRenewalDate, planTxn, expected, plan } =
    result;
  return {
    transactionId: String(planTxn._id),
    kind,
    planId,
    billingPeriod,
    newRenewalDate,
    amounts: {
      basePaise: expected.basePaise,
      gstPaise: expected.gstPaise,
      totalChargedPaise: expected.totalPaise,
      gstRate: expected.gstRate,
    },
    plan,
  };
}

async function activateFreePlan({ businessId, planId, billingPeriod }) {
  const { Business } = await getMainModels();
  const business = await Business.findById(businessId);
  if (!business) {
    return { ok: false, status: 404, error: 'Business not found' };
  }
  if (!business.plan) business.plan = {};
  const baseForExtension =
    business.plan.renewalDate && new Date(business.plan.renewalDate) > new Date()
      ? business.plan.renewalDate
      : null;
  business.plan.planId = planId;
  business.plan.billingPeriod = billingPeriod;
  business.plan.renewalDate = advanceDate(baseForExtension, billingPeriod);
  business.plan.isTrial = false;
  business.plan.trialEndsAt = null;
  business.plan.pendingPlanId = null;
  business.plan.pendingBillingPeriod = null;
  business.plan.pendingEffectiveAt = null;
  await business.save();
  entitlementsCache.invalidate(business._id);
  return { ok: true };
}

// ── POST /checkout/order ────────────────────────────────────────────────────

router.post('/checkout/order', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    if (!requireOwner(req, res)) return;
    const businessId = req.user?.branchId;
    if (!businessId) {
      return res.status(400).json({ success: false, error: 'Business ID not found' });
    }

    const { planId: rawPlanId, billingPeriod } = req.body || {};
    const planId = normalizePlanId(rawPlanId);
    if (!rawPlanId || !isValidPlanId(rawPlanId)) {
      return res.status(400).json({ success: false, error: 'Invalid planId' });
    }
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      return res.status(400).json({ success: false, error: 'Invalid billingPeriod' });
    }

    const { Business, AdminSettings } = await getMainModels();
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    // Downgrades must go through /schedule-downgrade — they don't charge.
    const currentPlanId = business?.plan?.planId || 'starter';
    if (tierOf(planId) < tierOf(currentPlanId)) {
      return res.status(400).json({
        success: false,
        error:
          'Downgrades are scheduled for your next renewal and do not require a payment. Use the schedule-downgrade endpoint instead.',
      });
    }

    const breakdown = computeBreakdown(planId, billingPeriod);
    if (!breakdown) {
      return res.status(400).json({
        success: false,
        error:
          'This plan does not have a self-service price. Please contact sales.',
      });
    }

    if (breakdown.totalPaise === 0) {
      if (!business.plan) business.plan = {};
      const baseForExtension =
        business.plan.renewalDate && new Date(business.plan.renewalDate) > new Date()
          ? business.plan.renewalDate
          : null;
      business.plan.planId = planId;
      business.plan.billingPeriod = billingPeriod;
      business.plan.renewalDate = advanceDate(baseForExtension, billingPeriod);
      business.plan.isTrial = false;
      business.plan.trialEndsAt = null;
      business.plan.pendingPlanId = null;
      business.plan.pendingBillingPeriod = null;
      business.plan.pendingEffectiveAt = null;
      await business.save();

      entitlementsCache.invalidate(business._id);

      return res.json({
        success: true,
        data: {
          freeActivation: true,
          planId,
          billingPeriod,
          baseAmountPaise: 0,
          gstPaise: 0,
          totalAmountPaise: 0,
          gstRate: GST_RATE,
        },
      });
    }

    const adminSettings = await AdminSettings.getSettings();

    // Razorpay enforces a 40-char receipt cap — keep it tight.
    const shortBiz = String(businessId).slice(-10);
    const shortTs = Date.now().toString(36);
    const receipt = `sub_${shortBiz}_${shortTs}`;

    const order = await paymentGateway.createOrder(
      adminSettings,
      breakdown.totalPaise,
      receipt
    );

    return res.json({
      success: true,
      data: {
        ...order,
        planId,
        billingPeriod,
        baseAmountPaise: breakdown.basePaise,
        gstPaise: breakdown.gstPaise,
        totalAmountPaise: breakdown.totalPaise,
        gstRate: breakdown.gstRate,
      },
    });
  } catch (err) {
    logger.error('[plan-checkout] Error creating order:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to create checkout order',
    });
  }
});

// ── POST /checkout/verify ───────────────────────────────────────────────────

router.post('/checkout/verify', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    if (!requireOwner(req, res)) return;
    const businessId = req.user?.branchId;
    if (!businessId) {
      return res.status(400).json({ success: false, error: 'Business ID not found' });
    }

    const {
      provider,
      orderId,
      paymentId,
      signature,
      planId: rawPlanId,
      billingPeriod,
    } = req.body || {};

    const planId = normalizePlanId(rawPlanId);

    if (!provider) return res.status(400).json({ success: false, error: 'Missing provider' });
    if (!isValidPlanId(rawPlanId)) {
      return res.status(400).json({ success: false, error: 'Invalid planId' });
    }
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      return res.status(400).json({ success: false, error: 'Invalid billingPeriod' });
    }

    const {
      Business,
      AdminSettings,
      PlanInvoiceTransaction,
    } = await getMainModels();
    const adminSettings = await AdminSettings.getSettings();

    const verification = await paymentGateway.verifyPayment(adminSettings, {
      provider,
      orderId,
      paymentId,
      signature,
    });
    if (!verification?.verified) {
      return res.status(400).json({
        success: false,
        error: verification?.error || 'Payment could not be verified',
      });
    }

    // Idempotency — if this payment was already applied, return current plan.
    const existing = await PlanInvoiceTransaction.findOne({
      businessId,
      providerPaymentId: verification.providerPaymentId || paymentId || null,
    }).lean();
    if (existing) {
      const existingBiz = await Business.findById(businessId)
        .select('plan')
        .lean();
      return res.json({
        success: true,
        data: {
          alreadyApplied: true,
          transactionId: String(existing._id),
          invoiceNumber: existing.invoiceNumber,
          plan: existingBiz?.plan || null,
        },
      });
    }

    // Cross-check the gateway-captured amount against what we expected to
    // charge. Tolerate ±1 paise of rounding slop.
    const expected = computeBreakdown(planId, billingPeriod);
    if (!expected) {
      return res.status(400).json({
        success: false,
        error: 'Selected plan does not have a self-service price',
      });
    }
    const gatewayTotalPaise =
      Number.isInteger(verification.amountPaise) && verification.amountPaise > 0
        ? verification.amountPaise
        : null;
    if (gatewayTotalPaise !== null) {
      if (Math.abs(gatewayTotalPaise - expected.totalPaise) > 1) {
        return res.status(400).json({
          success: false,
          error: 'Amount mismatch between client and payment gateway',
        });
      }
    }

    const result = await finalizePlanCheckout({
      req,
      businessId,
      planId,
      billingPeriod,
      expected,
      payment: {
        provider,
        providerOrderId: verification.providerOrderId || orderId || null,
        providerPaymentId: verification.providerPaymentId || paymentId || null,
        totalChargedPaise: gatewayTotalPaise ?? expected.totalPaise,
      },
    });

    return res.json({
      success: true,
      data: buildCheckoutSuccessPayload(result),
    });
  } catch (err) {
    logger.error('[plan-checkout] Error verifying payment:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to verify payment',
    });
  }
});

// ── POST /checkout/wallet ───────────────────────────────────────────────────
// Debits the messaging wallet at the plan list price (no extra GST — tax was
// collected when the wallet was recharged).

router.post('/checkout/wallet', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    if (!requireOwner(req, res)) return;
    const businessId = req.user?.branchId;
    if (!businessId) {
      return res.status(400).json({ success: false, error: 'Business ID not found' });
    }

    const { planId: rawPlanId, billingPeriod } = req.body || {};
    const planId = normalizePlanId(rawPlanId);
    if (!rawPlanId || !isValidPlanId(rawPlanId)) {
      return res.status(400).json({ success: false, error: 'Invalid planId' });
    }
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      return res.status(400).json({ success: false, error: 'Invalid billingPeriod' });
    }

    const { Business } = await getMainModels();
    const business = await Business.findById(businessId).select('plan wallet').lean();
    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    const currentPlanId = business?.plan?.planId || 'starter';
    if (tierOf(planId) < tierOf(currentPlanId)) {
      return res.status(400).json({
        success: false,
        error:
          'Downgrades are scheduled for your next renewal and do not require a payment.',
      });
    }

    const expected = computeBreakdown(planId, billingPeriod);
    if (!expected) {
      return res.status(400).json({
        success: false,
        error:
          'This plan does not have a self-service price. Please contact sales.',
      });
    }

    const walletChargePaise = expected.basePaise;

    if (walletChargePaise === 0) {
      const free = await activateFreePlan({ businessId, planId, billingPeriod });
      if (!free.ok) {
        return res.status(free.status || 500).json({ success: false, error: free.error });
      }
      return res.json({
        success: true,
        data: {
          freeActivation: true,
          planId,
          billingPeriod,
        },
      });
    }

    const balancePaise = Number(business?.wallet?.balancePaise || 0);
    if (balancePaise < walletChargePaise) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance',
      });
    }

    const deduct = await atomicDeduct({
      businessId,
      costPaise: walletChargePaise,
      channel: null,
      messageCategory: null,
      description: `Plan subscription — ${planId} (${billingPeriod})`,
    });
    if (!deduct.success) {
      return res.status(400).json({
        success: false,
        error: deduct.error || 'Insufficient wallet balance',
      });
    }

    const walletExpected = {
      ...expected,
      gstPaise: 0,
      totalPaise: walletChargePaise,
      gstRate: 0,
    };

    try {
      const result = await finalizePlanCheckout({
        req,
        businessId,
        planId,
        billingPeriod,
        expected: walletExpected,
        payment: {
          provider: 'system',
          providerPaymentId: String(deduct.walletTransactionId),
          totalChargedPaise: walletChargePaise,
        },
      });

      return res.json({
        success: true,
        data: {
          ...buildCheckoutSuccessPayload(result),
          walletBalancePaise: deduct.newBalancePaise,
        },
      });
    } catch (finalizeErr) {
      await Business.findByIdAndUpdate(businessId, {
        $inc: { 'wallet.balancePaise': walletChargePaise },
      });
      logger.error(
        '[plan-checkout] Wallet checkout failed after debit — balance restored:',
        finalizeErr?.message || finalizeErr
      );
      const status = finalizeErr.status || 500;
      return res.status(status).json({
        success: false,
        error: finalizeErr?.message || 'Failed to complete wallet checkout',
      });
    }
  } catch (err) {
    logger.error('[plan-checkout] Error in wallet checkout:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to complete wallet checkout',
    });
  }
});

// ── POST /schedule-downgrade ────────────────────────────────────────────────

router.post(
  '/schedule-downgrade',
  authenticateToken,
  setupMainDatabase,
  async (req, res) => {
    try {
      if (!requireOwner(req, res)) return;
      const businessId = req.user?.branchId;
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'Business ID not found' });
      }
      const { planId: rawPlanId, billingPeriod } = req.body || {};
      const planId = normalizePlanId(rawPlanId);
      if (!isValidPlanId(rawPlanId)) {
        return res.status(400).json({ success: false, error: 'Invalid planId' });
      }
      if (!['monthly', 'yearly'].includes(billingPeriod)) {
        return res.status(400).json({ success: false, error: 'Invalid billingPeriod' });
      }

      const { Business, PlanChangeLog } = await getMainModels();
      const business = await Business.findById(businessId);
      if (!business) {
        return res.status(404).json({ success: false, error: 'Business not found' });
      }
      const currentPlanId = business.plan?.planId || 'starter';
      if (tierOf(planId) >= tierOf(currentPlanId)) {
        return res.status(400).json({
          success: false,
          error:
            'This endpoint is for downgrades only. Use /checkout/order to upgrade or renew.',
        });
      }

      const effectiveAt = business.plan?.renewalDate || null;
      if (!business.plan) business.plan = {};
      business.plan.pendingPlanId = planId;
      business.plan.pendingBillingPeriod = billingPeriod;
      business.plan.pendingEffectiveAt = effectiveAt;
      await business.save();

      try {
        await PlanChangeLog.create({
          businessId,
          changedBy: req.user._id,
          changeType: 'plan_change',
          previousValue: {
            planId: currentPlanId,
            billingPeriod: business.plan?.billingPeriod || null,
          },
          newValue: {
            pendingPlanId: planId,
            pendingBillingPeriod: billingPeriod,
            pendingEffectiveAt: effectiveAt,
          },
          field: 'pendingPlanId',
          reason: 'Self-service downgrade scheduled for next renewal',
          metadata: { source: 'self_service', scheduled: true },
        });
      } catch (logErr) {
        logger.warn(
          '[plan-checkout] Downgrade audit-log write failed:',
          logErr?.message || logErr
        );
      }

      return res.json({
        success: true,
        data: {
          pendingPlanId: planId,
          pendingBillingPeriod: billingPeriod,
          pendingEffectiveAt: effectiveAt,
        },
      });
    } catch (err) {
      logger.error('[plan-checkout] Error scheduling downgrade:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to schedule downgrade',
      });
    }
  }
);

router.delete(
  '/schedule-downgrade',
  authenticateToken,
  setupMainDatabase,
  async (req, res) => {
    try {
      if (!requireOwner(req, res)) return;
      const businessId = req.user?.branchId;
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'Business ID not found' });
      }
      const { Business } = await getMainModels();
      const updated = await Business.findByIdAndUpdate(
        businessId,
        {
          $set: {
            'plan.pendingPlanId': null,
            'plan.pendingBillingPeriod': null,
            'plan.pendingEffectiveAt': null,
          },
        },
        { new: true, lean: true }
      );
      return res.json({
        success: true,
        data: {
          pendingPlanId: updated?.plan?.pendingPlanId || null,
          pendingBillingPeriod: updated?.plan?.pendingBillingPeriod || null,
          pendingEffectiveAt: updated?.plan?.pendingEffectiveAt || null,
        },
      });
    } catch (err) {
      logger.error('[plan-checkout] Error cancelling downgrade:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to cancel scheduled downgrade',
      });
    }
  }
);

// ── GET /checkout/status ────────────────────────────────────────────────────
// Lightweight read used by the UI to show "Scheduled downgrade" chips and
// the most recent checkout transaction (for the invoice link).
router.get(
  '/checkout/status',
  authenticateToken,
  setupMainDatabase,
  async (req, res) => {
    try {
      const businessId = req.user?.branchId;
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'Business ID not found' });
      }
      const { Business, PlanInvoiceTransaction } = await getMainModels();
      const business = await Business.findById(businessId).select('plan').lean();
      const lastTxn = await PlanInvoiceTransaction.findOne({ businessId })
        .sort({ timestamp: -1 })
        .lean();
      return res.json({
        success: true,
        data: {
          plan: business?.plan || null,
          pending: {
            pendingPlanId: business?.plan?.pendingPlanId || null,
            pendingBillingPeriod: business?.plan?.pendingBillingPeriod || null,
            pendingEffectiveAt: business?.plan?.pendingEffectiveAt || null,
          },
          lastTransaction: lastTxn
            ? {
                _id: String(lastTxn._id),
                kind: lastTxn.kind,
                planId: lastTxn.planId,
                billingPeriod: lastTxn.billingPeriod,
                invoiceNumber: lastTxn.invoiceNumber || null,
                totalChargedPaise: lastTxn.totalChargedPaise || 0,
                timestamp: lastTxn.timestamp,
              }
            : null,
        },
      });
    } catch (err) {
      logger.error('[plan-checkout] Error reading status:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to read plan status',
      });
    }
  }
);

// ── GET /transactions ───────────────────────────────────────────────────────
// Paginated list of past plan-checkout payments for the current business.
// Feeds the Billing History card on Settings → Plan & Billing so users can
// download GST invoices for renewals / upgrades / plan changes.
router.get(
  '/transactions',
  authenticateToken,
  setupMainDatabase,
  async (req, res) => {
    try {
      const businessId = req.user?.branchId;
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'Business ID not found' });
      }
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const skip = (page - 1) * limit;

      const { PlanInvoiceTransaction } = await getMainModels();
      const filter = { businessId };

      const [items, total] = await Promise.all([
        PlanInvoiceTransaction.find(filter)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        PlanInvoiceTransaction.countDocuments(filter),
      ]);

      return res.json({
        success: true,
        data: {
          items: items.map(t => ({
            _id: String(t._id),
            kind: t.kind,
            planId: t.planId,
            billingPeriod: t.billingPeriod,
            amountPaise: Number(t.amountPaise || 0),
            gstPaise: Number(t.gstPaise || 0),
            gstRate: Number(t.gstRate || 0),
            totalChargedPaise: Number(t.totalChargedPaise || 0),
            provider: t.provider,
            providerOrderId: t.providerOrderId || null,
            providerPaymentId: t.providerPaymentId || null,
            invoiceNumber: t.invoiceNumber || null,
            previousRenewalDate: t.previousRenewalDate || null,
            newRenewalDate: t.newRenewalDate || null,
            previousPlanId: t.previousPlanId || null,
            previousBillingPeriod: t.previousBillingPeriod || null,
            description: t.description || null,
            timestamp: t.timestamp,
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          },
        },
      });
    } catch (err) {
      logger.error('[plan-checkout] Error listing transactions:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to load plan transactions',
      });
    }
  }
);

// ── GET /invoice/:transactionId ─────────────────────────────────────────────

router.get(
  '/invoice/:transactionId',
  authenticateToken,
  setupMainDatabase,
  async (req, res) => {
    try {
      const businessId = req.user?.branchId;
      if (!businessId) {
        return res.status(400).json({ success: false, error: 'Business ID not found' });
      }
      const { transactionId } = req.params;
      if (!transactionId || !/^[a-f0-9]{24}$/i.test(transactionId)) {
        return res.status(400).json({ success: false, error: 'Invalid transaction id' });
      }

      let built;
      try {
        built = await buildPlanInvoicePDFForTransaction({
          transactionId,
          businessIdScope: businessId,
        });
      } catch (err) {
        if (err?.code === 'FORBIDDEN') {
          return res.status(403).json({ success: false, error: err.message });
        }
        if (err?.code === 'NOT_FOUND') {
          return res.status(404).json({ success: false, error: err.message });
        }
        throw err;
      }

      const { pdfBuffer, invoiceNumber } = built;
      const safeFilename = `${String(invoiceNumber).replace(/[^A-Za-z0-9_-]+/g, '_')}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.end(pdfBuffer);
    } catch (err) {
      logger.error('[plan-checkout] Error downloading invoice:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Failed to generate invoice',
      });
    }
  }
);

module.exports = router;
