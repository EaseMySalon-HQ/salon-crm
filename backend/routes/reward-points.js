/**
 * Reward / loyalty points API
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { logger } = require('../utils/logger');
const { authenticateToken, requireManager, requireStaff } = require('../middleware/auth');
const { setupBusinessDatabase, setupMainDatabase } = require('../middleware/business-db');
const { gate, FEATURE } = require('../config/feature-routes');
const rewardSvc = require('../services/reward-points-service');

function ok(res, data, message = 'Success') {
  return res.json({ success: true, data, message, errors: [] });
}

function fail(res, status, message, errors = []) {
  return res.status(status).json({ success: false, data: null, message, errors });
}

const authStaff = [authenticateToken, setupBusinessDatabase, requireStaff, gate(FEATURE.REWARD_POINTS)];
const authManager = [authenticateToken, setupBusinessDatabase, requireManager, gate(FEATURE.REWARD_POINTS)];
const authMainStaff = [authenticateToken, setupMainDatabase, requireStaff, gate(FEATURE.REWARD_POINTS)];
const authMainManager = [authenticateToken, setupMainDatabase, requireManager, gate(FEATURE.REWARD_POINTS)];
const authMainBusinessStaff = [authenticateToken, setupMainDatabase, setupBusinessDatabase, requireStaff, gate(FEATURE.REWARD_POINTS)];
const authMainBusinessManager = [authenticateToken, setupMainDatabase, setupBusinessDatabase, requireManager, gate(FEATURE.REWARD_POINTS)];

async function loadRewardSettingsPayload(req) {
  const Business = req.mainModels.Business;
  const b = await Business.findById(req.user.branchId).select('rewardPointsSettings').lean();
  const settings = rewardSvc.mergeRewardPointsSettings(b?.rewardPointsSettings);
  const { mergePaymentConfiguration } = require('../lib/payment-redemption-eligibility');
  let rewardPointRedemption = mergePaymentConfiguration(null).rewardPointRedemption;
  const { BusinessSettings } = req.businessModels || {};
  if (BusinessSettings) {
    const bs = await BusinessSettings.findOne().select('paymentConfiguration').lean();
    if (bs) {
      rewardPointRedemption = mergePaymentConfiguration(bs.paymentConfiguration).rewardPointRedemption;
    }
  }
  return { ...settings, rewardPointRedemption };
}

router.get('/settings', authMainBusinessStaff, async (req, res) => {
  try {
    const payload = await loadRewardSettingsPayload(req);
    return ok(res, payload);
  } catch (e) {
    logger.error('[reward-points] GET settings', e);
    return fail(res, 500, e.message);
  }
});

router.put('/settings', authMainBusinessManager, async (req, res) => {
  try {
    const Business = req.mainModels.Business;
    const allowed = [
      'enabled',
      'earnRupeeStep',
      'earnPointsStep',
      'redeemPointsStep',
      'redeemRupeeStep',
      'minRedeemPoints',
      'minBillAmountForRedemption',
      'maxRedeemPercentOfBill',
      'earnOnWalletPurchaseLines',
      'earnPointsOnServices',
      'earnPointsOnProducts',
      'earnPointsOnMembershipPurchases',
      'earnPointsOnPrepaidPlan',
      'earnPointsOnPackages',
      'firstVisitBonusPoints',
      'birthdayBonusPoints',
      'birthdayBonusWindowDays',
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[`rewardPointsSettings.${k}`] = req.body[k];
    }
    if (req.body.earnPointsOnPrepaidPlan !== undefined) {
      patch['rewardPointsSettings.earnOnWalletPurchaseLines'] = req.body.earnPointsOnPrepaidPlan === true;
    }
    if (Object.keys(patch).length > 0) {
      await Business.updateOne({ _id: req.user.branchId }, { $set: patch });
    }

    if (req.body.rewardPointRedemption !== undefined && typeof req.body.rewardPointRedemption === 'object') {
      const { BusinessSettings } = req.businessModels;
      const { mergePaymentConfiguration } = require('../lib/payment-redemption-eligibility');
      const settingsDoc = await BusinessSettings.findOne();
      if (settingsDoc) {
        const existing = mergePaymentConfiguration(settingsDoc.paymentConfiguration);
        settingsDoc.paymentConfiguration = mergePaymentConfiguration({
          ...existing,
          rewardPointRedemption: {
            ...existing.rewardPointRedemption,
            ...req.body.rewardPointRedemption,
          },
        });
        settingsDoc.markModified('paymentConfiguration');
        await settingsDoc.save();
      }
    }

    const payload = await loadRewardSettingsPayload(req);
    return ok(res, payload, 'Settings updated');
  } catch (e) {
    logger.error('[reward-points] PUT settings', e);
    return fail(res, 500, e.message);
  }
});

router.get('/preview', authStaff, async (req, res) => {
  try {
    const billSubtotal = Number(req.query.billSubtotal);
    const pointsRequested = Number(req.query.points);
    const clientId = String(req.query.clientId || '').trim();
    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return fail(res, 400, 'clientId is required');
    }
    if (!Number.isFinite(billSubtotal) || billSubtotal < 0) {
      return fail(res, 400, 'billSubtotal must be a non-negative number');
    }
    const settings = await rewardSvc.getMergedSettings(req.user.branchId);
    const { Client } = req.businessModels;
    const c = await Client.findById(clientId).select('rewardPointsBalance').lean();
    const balance = Number(c?.rewardPointsBalance) || 0;
    const preview = rewardSvc.previewRedemption(settings, billSubtotal, pointsRequested, balance);
    return ok(res, { ...preview, currentBalance: balance, settings });
  } catch (e) {
    logger.error('[reward-points] preview', e);
    return fail(res, 500, e.message);
  }
});

router.get('/ledger', authStaff, async (req, res) => {
  try {
    const clientId = String(req.query.clientId || '').trim();
    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return fail(res, 400, 'clientId is required');
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = Math.max(0, Number(req.query.skip) || 0);
    const { PointsLedger } = req.businessModels;
    const branchId = req.user.branchId;
    const [rows, total] = await Promise.all([
      PointsLedger.find({ branchId, clientId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PointsLedger.countDocuments({ branchId, clientId }),
    ]);
    return ok(res, { rows, total, limit, skip });
  } catch (e) {
    logger.error('[reward-points] ledger', e);
    return fail(res, 500, e.message);
  }
});

router.get('/summary', authStaff, async (req, res) => {
  try {
    const clientId = String(req.query.clientId || '').trim();
    if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
      return fail(res, 400, 'clientId is required');
    }
    const summary = await rewardSvc.getClientSummary(req.user.branchId, req.businessModels, clientId);
    if (!summary) return fail(res, 404, 'Client not found');
    return ok(res, summary);
  } catch (e) {
    logger.error('[reward-points] summary', e);
    return fail(res, 500, e.message);
  }
});

router.get('/client-balances', authStaff, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 25), 100);
    const includeZero = req.query.includeZero === 'true' || req.query.includeZero === '1';
    const data = await rewardSvc.listClientBalances(req.businessModels, req.user.branchId, {
      search,
      page,
      limit,
      includeZero,
    });
    return ok(res, data);
  } catch (e) {
    logger.error('[reward-points] client-balances', e);
    return fail(res, 500, e.message);
  }
});

router.post('/manual-bonus', authManager, async (req, res) => {
  try {
    const { clientId, points, reason } = req.body || {};
    if (!clientId || !mongoose.Types.ObjectId.isValid(String(clientId))) {
      return fail(res, 400, 'clientId is required');
    }
    const out = await rewardSvc.grantManualBonus({
      branchId: req.user.branchId,
      businessModels: req.businessModels,
      clientId,
      points,
      reason,
      userId: req.user._id,
    });
    return ok(res, out, 'Bonus applied');
  } catch (e) {
    const st = e.status || 500;
    logger.error('[reward-points] manual-bonus', e);
    return fail(res, st, e.message);
  }
});

module.exports = router;
