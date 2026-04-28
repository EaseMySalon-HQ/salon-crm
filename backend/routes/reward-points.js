/**
 * Reward / loyalty points API
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { logger } = require('../utils/logger');
const { authenticateToken, requireManager, requireStaff } = require('../middleware/auth');
const { setupBusinessDatabase, setupMainDatabase } = require('../middleware/business-db');
const rewardSvc = require('../services/reward-points-service');

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

router.get('/settings', authMainStaff, async (req, res) => {
  try {
    const Business = req.mainModels.Business;
    const b = await Business.findById(req.user.branchId).select('rewardPointsSettings').lean();
    const settings = rewardSvc.mergeRewardPointsSettings(b?.rewardPointsSettings);
    return ok(res, settings);
  } catch (e) {
    logger.error('[reward-points] GET settings', e);
    return fail(res, 500, e.message);
  }
});

router.put('/settings', authMainManager, async (req, res) => {
  try {
    const Business = req.mainModels.Business;
    const allowed = [
      'enabled',
      'earnRupeeStep',
      'earnPointsStep',
      'redeemPointsStep',
      'redeemRupeeStep',
      'minRedeemPoints',
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
    await Business.updateOne({ _id: req.user.branchId }, { $set: patch });
    const b = await Business.findById(req.user.branchId).select('rewardPointsSettings').lean();
    return ok(res, rewardSvc.mergeRewardPointsSettings(b?.rewardPointsSettings), 'Settings updated');
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
