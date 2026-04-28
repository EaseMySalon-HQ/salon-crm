/**
 * Client prepaid wallet API (salon-issued service credit).
 * Mounted at /api/client-wallet
 *
 * Register literal paths before /plans/:id
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { logger } = require('../utils/logger');
const { authenticateToken, requireManager, requireStaff } = require('../middleware/auth');
const { setupBusinessDatabase, setupMainDatabase } = require('../middleware/business-db');
const walletSvc = require('../services/client-wallet-service');

function ok(res, data, message = 'Success') {
  return res.json({ success: true, data, message, errors: [] });
}

function fail(res, status, message, errors = []) {
  return res.status(status).json({ success: false, data: null, message, errors });
}

const authStaff = [authenticateToken, setupBusinessDatabase, requireStaff];
const authManager = [authenticateToken, setupBusinessDatabase, requireManager];
const authMainStaff = [authenticateToken, setupMainDatabase, requireStaff];
const authMainManager = [authenticateToken, setupMainDatabase, requireManager];

// ── Business rules (main DB) ───────────────────────────────────────────────

router.get('/settings', authMainStaff, async (req, res) => {
  try {
    const Business = req.mainModels.Business;
    const b = await Business.findById(req.user.branchId).select('clientWalletSettings').lean();
    const settings = walletSvc.mergeClientWalletSettings(b?.clientWalletSettings);
    return ok(res, settings);
  } catch (e) {
    logger.error('[client-wallet] GET settings', e);
    return fail(res, 500, e.message);
  }
});

router.put('/settings', authMainManager, async (req, res) => {
  try {
    const Business = req.mainModels.Business;
    const allowed = [
      'allowCouponStacking',
      'gracePeriodDays',
      'allowMultiBranch',
      'refundPolicy',
      'minRechargeAmount',
      'expiryAlertsEnabled',
      'combineMultipleWallets',
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[`clientWalletSettings.${k}`] = req.body[k];
    }
    await Business.updateOne({ _id: req.user.branchId }, { $set: patch });
    const b = await Business.findById(req.user.branchId).select('clientWalletSettings').lean();
    return ok(res, walletSvc.mergeClientWalletSettings(b?.clientWalletSettings), 'Settings updated');
  } catch (e) {
    logger.error('[client-wallet] PUT settings', e);
    return fail(res, 500, e.message);
  }
});

// ── Liability & history (tenant) ─────────────────────────────────────────────

router.get('/liability', authStaff, async (req, res) => {
  try {
    const summary = await walletSvc.getLiabilitySummary(req.user.branchId, req.businessModels);
    return ok(res, summary);
  } catch (e) {
    logger.error('[client-wallet] liability', e);
    return fail(res, 500, e.message);
  }
});

router.get('/history', authStaff, async (req, res) => {
  try {
    const { ClientWalletTransaction } = req.businessModels;
    const branchId = req.user.branchId;
    const match = { branchId, type: 'debit' };
    if (req.query.service) {
      match.serviceNames = { $elemMatch: { $regex: req.query.service, $options: 'i' } };
    }
    if (req.query.from || req.query.to) {
      match.createdAt = {};
      if (req.query.from) match.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const t = new Date(req.query.to);
        t.setHours(23, 59, 59, 999);
        match.createdAt.$lte = t;
      }
    }
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const rows = await ClientWalletTransaction.find(match)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('walletId', 'planSnapshot remainingBalance status')
      .lean();
    return ok(res, { history: rows });
  } catch (e) {
    logger.error('[client-wallet] history', e);
    return fail(res, 500, e.message);
  }
});

router.get('/client/:clientId', authStaff, async (req, res) => {
  try {
    const { ClientWallet, ClientWalletTransaction } = req.businessModels;
    const branchId = req.user.branchId;
    const clientId = req.params.clientId;
    if (!mongoose.Types.ObjectId.isValid(clientId)) return fail(res, 400, 'Invalid client id');

    const wallets = await ClientWallet.find({ branchId, clientId })
      .sort({ createdAt: -1 })
      .populate('planId', 'name status payAmount creditAmount')
      .lean();

    const txByWallet = {};
    for (const w of wallets) {
      const txs = await ClientWalletTransaction.find({ walletId: w._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate({ path: 'saleId', select: 'billNo' })
        .lean();
      txByWallet[String(w._id)] = txs;
    }
    return ok(res, { wallets, transactionsByWallet: txByWallet });
  } catch (e) {
    logger.error('[client-wallet] client wallets', e);
    return fail(res, 500, e.message);
  }
});

router.post('/issue', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const clientId = req.body.clientId ?? req.body.client_id;
    const planId = req.body.planId ?? req.body.plan_id;
    const amountPaid = req.body.amountPaid ?? req.body.amount_paid;
    const saleId = req.body.saleId ?? req.body.sale_id;
    if (!clientId || !planId) return fail(res, 400, 'clientId and planId are required');
    const { ClientWallet } = req.businessModels;
    await walletSvc.repairClientWalletIndexesIfNeeded(ClientWallet);
    const role = String(req.user?.role || '').toLowerCase();
    const linkedToSale = saleId && mongoose.Types.ObjectId.isValid(String(saleId));
    if (linkedToSale) {
      if (!['admin', 'manager', 'staff'].includes(role)) {
        return fail(res, 403, 'Insufficient permissions');
      }
    } else if (!['admin', 'manager'].includes(role)) {
      return fail(res, 403, 'Manager access required to issue prepaid without a POS bill');
    }
    const result = linkedToSale
      ? await walletSvc.issueWalletLinkedToSale({
          branchId: req.user.branchId,
          businessModels: req.businessModels,
          staffUser: req.user,
          clientId,
          planId,
          amountPaid: amountPaid != null ? amountPaid : undefined,
          saleId,
        })
      : await walletSvc.issueWallet({
          branchId: req.user.branchId,
          businessModels: req.businessModels,
          staffUser: req.user,
          clientId,
          planId,
          amountPaid: amountPaid != null ? amountPaid : undefined,
        });
    return ok(res, { wallet: result.wallet, sale: result.sale }, 'Wallet issued');
  } catch (e) {
    const status = e.status || 500;
    logger.error('[client-wallet] issue', e);
    return fail(res, status, e.message);
  }
});

router.post('/redeem', authStaff, async (req, res) => {
  try {
    const { walletId, amount, saleId, serviceNames, couponApplied } = req.body;
    if (!walletId || !amount) return fail(res, 400, 'walletId and amount are required');
    const amt = Number(amount);
    if (saleId && mongoose.Types.ObjectId.isValid(String(saleId))) {
      const { Sale, BusinessSettings } = req.businessModels;
      if (Sale && BusinessSettings) {
        const sale = await Sale.findById(saleId).select('items payments loyaltyPointsRedeemed').lean();
        if (sale) {
          const {
            mergePaymentConfiguration,
            eligibleRedemptionSubtotal,
            sumWalletPayments,
          } = require('../lib/payment-redemption-eligibility');
          const payDoc = await BusinessSettings.findOne().select('paymentConfiguration').lean();
          const payCfg = mergePaymentConfiguration(payDoc?.paymentConfiguration);
          const eligibleWallet = eligibleRedemptionSubtotal(sale.items || [], payCfg, 'wallet');
          const walletOnSale = sumWalletPayments(sale.payments);
          const loyOnSale = Math.floor(Number(sale.loyaltyPointsRedeemed) || 0);
          if (payCfg.billingRedemption?.allowWalletAndPointsTogether === false && loyOnSale > 0 && amt > 0.02) {
            return fail(
              res,
              400,
              'Wallet cannot be redeemed on this bill while reward points are applied (payment configuration).'
            );
          }
          /** Sale is usually saved with Wallet in payments before redeem; amount must match and stay within eligible lines. */
          if (amt > eligibleWallet + 0.02 || walletOnSale > eligibleWallet + 0.02) {
            return fail(
              res,
              400,
              'Wallet redeem amount exceeds eligible bill lines (payment configuration).'
            );
          }
        }
      }
    }
    const out = await walletSvc.redeemBalance({
      branchId: req.user.branchId,
      businessModels: req.businessModels,
      staffUser: req.user,
      walletId,
      amount,
      saleId,
      serviceNames,
      couponApplied: !!couponApplied,
    });
    return ok(res, out, 'Redeemed');
  } catch (e) {
    const status = e.status || 500;
    logger.error('[client-wallet] redeem', e);
    return fail(res, status, e.message);
  }
});

router.post('/adjust', authManager, async (req, res) => {
  try {
    const { walletId, delta, reason } = req.body;
    if (!walletId || req.body.delta === undefined) return fail(res, 400, 'walletId and delta are required');
    const w = await walletSvc.manualAdjust({
      branchId: req.user.branchId,
      businessModels: req.businessModels,
      staffUser: req.user,
      walletId,
      delta: Number(req.body.delta),
      reason: reason || '',
      saleId: null,
    });
    return ok(res, { wallet: w }, 'Adjusted');
  } catch (e) {
    const status = e.status || 500;
    logger.error('[client-wallet] adjust', e);
    return fail(res, status, e.message);
  }
});

/** Staff: credit bill overpayment (no physical change) to a client prepaid wallet */
router.post('/credit-change', authStaff, async (req, res) => {
  try {
    const { walletId, amount, saleId, billNo } = req.body;
    if (!walletId || amount == null) return fail(res, 400, 'walletId and amount are required');
    const w = await walletSvc.creditChangeReturnFromPos({
      branchId: req.user.branchId,
      businessModels: req.businessModels,
      staffUser: req.user,
      walletId,
      amount: Number(amount),
      saleId: saleId || undefined,
      billNo: billNo || '',
    });
    return ok(res, { wallet: w }, 'Change credited to wallet');
  } catch (e) {
    const status = e.status || 500;
    logger.error('[client-wallet] credit-change', e);
    return fail(res, status, e.message);
  }
});

/** Staff: no wallet yet — open one from an active prepaid plan template and credit bill change */
router.post('/credit-change-open-wallet', authStaff, async (req, res) => {
  try {
    const { clientId, amount, saleId, billNo } = req.body;
    if (!clientId || amount == null || !saleId) {
      return fail(res, 400, 'clientId, amount, and saleId are required');
    }
    const out = await walletSvc.creditChangeOpenWalletFromPos({
      branchId: req.user.branchId,
      businessModels: req.businessModels,
      staffUser: req.user,
      clientId: String(clientId),
      amount: Number(amount),
      saleId: String(saleId),
      billNo: billNo || '',
    });
    return ok(res, out, 'Wallet opened and change credited');
  } catch (e) {
    const status = e.status || 500;
    logger.error('[client-wallet] credit-change-open-wallet', e);
    return fail(res, status, e.message);
  }
});

router.post('/bulk-issue', authManager, async (req, res) => {
  try {
    const { clientIds, planId, amountPaid } = req.body;
    if (!Array.isArray(clientIds) || !planId) return fail(res, 400, 'clientIds[] and planId required');
    const { ClientWallet } = req.businessModels;
    await walletSvc.repairClientWalletIndexesIfNeeded(ClientWallet);
    const results = [];
    const errors = [];
    for (const clientId of clientIds.slice(0, 200)) {
      try {
        const r = await walletSvc.issueWallet({
          branchId: req.user.branchId,
          businessModels: req.businessModels,
          staffUser: req.user,
          clientId,
          planId,
          amountPaid,
        });
        results.push({ clientId, walletId: r.wallet._id });
      } catch (err) {
        errors.push({ clientId, error: err.message });
      }
    }
    return ok(res, { issued: results, errors }, 'Bulk issue completed');
  } catch (e) {
    logger.error('[client-wallet] bulk-issue', e);
    return fail(res, 500, e.message);
  }
});

// ── Plans CRUD (tenant) — after literal paths ───────────────────────────────

router.get('/plans', authStaff, async (req, res) => {
  try {
    const { PrepaidPlan } = req.businessModels;
    const branchId = req.user.branchId;
    const q = { branchId };
    if (req.query.status) q.status = req.query.status;
    const plans = await PrepaidPlan.find(q).sort({ createdAt: -1 }).lean();
    return ok(res, { plans });
  } catch (e) {
    logger.error('[client-wallet] list plans', e);
    return fail(res, 500, e.message);
  }
});

router.post('/plans', authManager, async (req, res) => {
  try {
    const { PrepaidPlan } = req.businessModels;
    const branchId = req.user.branchId;
    const {
      name,
      payAmount,
      creditAmount,
      validityDays,
      maxPerClient,
      allowCouponStacking,
      branchIds,
    } = req.body;
    if (!name || payAmount == null || creditAmount == null || !validityDays) {
      return fail(res, 400, 'name, payAmount, creditAmount, validityDays are required');
    }
    const plan = await PrepaidPlan.create({
      branchId,
      name: String(name).trim(),
      payAmount: Number(payAmount),
      creditAmount: Number(creditAmount),
      validityDays: Number(validityDays),
      status: 'active',
      maxPerClient: maxPerClient != null ? Number(maxPerClient) : null,
      allowCouponStacking: !!allowCouponStacking,
      branchIds: Array.isArray(branchIds)
        ? branchIds.filter((id) => mongoose.Types.ObjectId.isValid(id))
        : [],
      createdBy: req.user._id,
    });
    return ok(res, { plan }, 'Plan created');
  } catch (e) {
    logger.error('[client-wallet] create plan', e);
    return fail(res, 500, e.message);
  }
});

router.put('/plans/:id', authManager, async (req, res) => {
  try {
    const { PrepaidPlan } = req.businessModels;
    const branchId = req.user.branchId;
    const plan = await PrepaidPlan.findOne({ _id: req.params.id, branchId });
    if (!plan) return fail(res, 404, 'Plan not found');
    const fields = [
      'name',
      'payAmount',
      'creditAmount',
      'validityDays',
      'maxPerClient',
      'allowCouponStacking',
      'branchIds',
    ];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (f === 'branchIds' && Array.isArray(req.body.branchIds)) {
          plan.branchIds = req.body.branchIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
        } else if (f === 'name') plan.name = String(req.body.name).trim();
        else plan[f] = req.body[f];
      }
    }
    await plan.save();
    return ok(res, { plan }, 'Plan updated');
  } catch (e) {
    logger.error('[client-wallet] update plan', e);
    return fail(res, 500, e.message);
  }
});

router.patch('/plans/:id/status', authManager, async (req, res) => {
  try {
    const { PrepaidPlan } = req.businessModels;
    const branchId = req.user.branchId;
    const { status } = req.body;
    if (!['active', 'paused', 'archived'].includes(status)) {
      return fail(res, 400, 'Invalid status');
    }
    const plan = await PrepaidPlan.findOneAndUpdate(
      { _id: req.params.id, branchId },
      { $set: { status } },
      { new: true }
    );
    if (!plan) return fail(res, 404, 'Plan not found');
    return ok(res, { plan }, 'Status updated');
  } catch (e) {
    logger.error('[client-wallet] plan status', e);
    return fail(res, 500, e.message);
  }
});

/** Permanently remove an archived plan only if no client wallet was ever issued from it. */
router.delete('/plans/:id', authManager, async (req, res) => {
  try {
    const { PrepaidPlan, ClientWallet } = req.businessModels;
    const branchId = req.user.branchId;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return fail(res, 400, 'Invalid plan id');
    }
    const plan = await PrepaidPlan.findOne({ _id: req.params.id, branchId });
    if (!plan) return fail(res, 404, 'Plan not found');
    if (plan.status !== 'archived') {
      return fail(res, 409, 'Archive the plan first, then you can delete it.');
    }
    const issued = await ClientWallet.countDocuments({ branchId, planId: plan._id });
    if (issued > 0) {
      return fail(
        res,
        409,
        'Cannot delete: at least one client wallet was issued from this plan. Keep it archived instead.'
      );
    }
    await PrepaidPlan.deleteOne({ _id: plan._id, branchId });
    return ok(res, { deleted: true }, 'Plan deleted');
  } catch (e) {
    logger.error('[client-wallet] delete plan', e);
    return fail(res, 500, e.message);
  }
});

module.exports = router;
