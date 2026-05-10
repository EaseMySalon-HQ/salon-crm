/**
 * Customer reward / loyalty points — business logic (tenant ledger + main Business settings).
 */

const mongoose = require('mongoose');
const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');

const DEFAULT_SETTINGS = {
  enabled: false,
  earnRupeeStep: 100,
  earnPointsStep: 10,
  redeemPointsStep: 100,
  redeemRupeeStep: 10,
  minRedeemPoints: 100,
  maxRedeemPercentOfBill: 20,
  earnOnWalletPurchaseLines: false,
  /** Eligible spend for earning: include service line totals (default on for new merges). */
  earnPointsOnServices: true,
  earnPointsOnProducts: true,
  earnPointsOnMembershipPurchases: true,
  /** Prepaid wallet plan purchase lines — kept in sync with legacy earnOnWalletPurchaseLines on read. */
  earnPointsOnPrepaidPlan: false,
  /** Package lines on a bill (UI not exposed; default earn on). */
  earnPointsOnPackages: true,
  firstVisitBonusPoints: 0,
  birthdayBonusPoints: 0,
  birthdayBonusWindowDays: 0,
};

function mergeRewardPointsSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const merged = { ...DEFAULT_SETTINGS, ...r };
  if (merged.earnPointsOnServices === undefined) merged.earnPointsOnServices = DEFAULT_SETTINGS.earnPointsOnServices;
  if (merged.earnPointsOnProducts === undefined) merged.earnPointsOnProducts = DEFAULT_SETTINGS.earnPointsOnProducts;
  if (merged.earnPointsOnMembershipPurchases === undefined) {
    merged.earnPointsOnMembershipPurchases = DEFAULT_SETTINGS.earnPointsOnMembershipPurchases;
  }
  const prepaidExplicit = Object.prototype.hasOwnProperty.call(r, 'earnPointsOnPrepaidPlan');
  if (!prepaidExplicit && Object.prototype.hasOwnProperty.call(r, 'earnOnWalletPurchaseLines')) {
    merged.earnPointsOnPrepaidPlan = r.earnOnWalletPurchaseLines === true;
  } else if (!prepaidExplicit) {
    merged.earnPointsOnPrepaidPlan = DEFAULT_SETTINGS.earnPointsOnPrepaidPlan;
  }
  merged.earnPointsOnPrepaidPlan = merged.earnPointsOnPrepaidPlan !== false;
  if (merged.earnPointsOnPackages === undefined) merged.earnPointsOnPackages = DEFAULT_SETTINGS.earnPointsOnPackages;
  merged.earnPointsOnPackages = merged.earnPointsOnPackages !== false;
  merged.earnPointsOnServices = merged.earnPointsOnServices !== false;
  merged.earnPointsOnProducts = merged.earnPointsOnProducts !== false;
  merged.earnPointsOnMembershipPurchases = merged.earnPointsOnMembershipPurchases !== false;
  merged.earnOnWalletPurchaseLines = merged.earnPointsOnPrepaidPlan;
  return merged;
}

async function getMergedSettings(branchId) {
  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const b = await Business.findById(branchId).select('rewardPointsSettings').lean();
  return mergeRewardPointsSettings(b?.rewardPointsSettings);
}

function rupeeDiscountFromPoints(settings, points) {
  const step = Number(settings.redeemPointsStep) || 1;
  const rupee = Number(settings.redeemRupeeStep) || 0;
  if (points <= 0 || rupee <= 0) return 0;
  return Math.floor(points / step) * rupee;
}

function maxRedeemPointsForBill(settings, subtotalBeforeLoyalty, currentBalance) {
  const pct = Math.min(100, Math.max(0, Number(settings.maxRedeemPercentOfBill) || 0));
  const maxDiscount = (Number(subtotalBeforeLoyalty) || 0) * (pct / 100);
  const step = Number(settings.redeemPointsStep) || 1;
  const rupee = Number(settings.redeemRupeeStep) || 0;
  if (rupee <= 0 || step <= 0) return 0;
  const maxFromPct = Math.floor((maxDiscount * step) / rupee / step) * step;
  return Math.min(Math.max(0, currentBalance), Math.max(0, maxFromPct));
}

/**
 * Server-side preview: caps points and returns rupee discount.
 */
function previewRedemption(settings, billSubtotalBeforeLoyalty, pointsRequested, currentBalance) {
  const minR = Number(settings.minRedeemPoints) || 0;
  let pts = Math.floor(Number(pointsRequested) || 0);
  if (pts > 0 && pts < minR) {
    return { ok: false, error: `Minimum redemption is ${minR} points`, pointsToRedeem: 0, discountRupees: 0 };
  }
  const cap = maxRedeemPointsForBill(settings, billSubtotalBeforeLoyalty, currentBalance);
  pts = Math.min(pts, cap);
  const step = Number(settings.redeemPointsStep) || 1;
  pts = Math.floor(pts / step) * step;
  if (pts < minR) {
    pts = 0;
  }
  const discountRupees = rupeeDiscountFromPoints(settings, pts);
  return { ok: true, pointsToRedeem: pts, discountRupees };
}

function computeBaseEarnPoints(settings, eligibleSpendRupees) {
  const stepR = Number(settings.earnRupeeStep) || 1;
  const stepP = Number(settings.earnPointsStep) || 0;
  if (stepP <= 0 || eligibleSpendRupees <= 0) return 0;
  return Math.floor(Number(eligibleSpendRupees) / stepR) * stepP;
}

/**
 * Whether a sale line contributes to the earn base (completed bill).
 */
function lineContributesToEarn(settings, item) {
  const t = String(item?.type || '').toLowerCase();
  if (t === 'service') return settings.earnPointsOnServices !== false;
  if (t === 'product') return settings.earnPointsOnProducts !== false;
  if (t === 'membership') return settings.earnPointsOnMembershipPurchases !== false;
  if (t === 'prepaid_wallet') return settings.earnPointsOnPrepaidPlan !== false;
  if (t === 'package') return settings.earnPointsOnPackages !== false;
  return true;
}

function eligibleSpendFromSale(sale, settings) {
  const items = sale.items || [];
  let sum = 0;
  for (const it of items) {
    if (!lineContributesToEarn(settings, it)) continue;
    sum += Number(it.total) || 0;
  }
  const loyaltyDisc = Number(sale.loyaltyDiscountAmount) || 0;
  return Math.max(0, sum - loyaltyDisc);
}

function isBirthdayInWindow(dob, billDate, windowDays) {
  if (!dob || !billDate) return false;
  const d = new Date(dob);
  const b = new Date(billDate);
  if (Number.isNaN(d.getTime()) || Number.isNaN(b.getTime())) return false;
  const wd = Math.min(15, Math.max(0, Number(windowDays) || 0));
  if (wd === 0) {
    return d.getMonth() === b.getMonth() && d.getDate() === b.getDate();
  }
  const y = b.getFullYear();
  const candidates = [new Date(y, d.getMonth(), d.getDate())];
  candidates.push(new Date(y - 1, d.getMonth(), d.getDate()));
  candidates.push(new Date(y + 1, d.getMonth(), d.getDate()));
  const billT = b.getTime();
  for (const c of candidates) {
    const diff = Math.abs(billT - c.getTime()) / (86400000);
    if (diff <= wd + 0.5) return true;
  }
  return false;
}

/**
 * Validate loyalty redemption on payload before persisting sale. Throws Error with .status = 400.
 * @param {number} [eligibleSubtotalBeforeLoyalty] — cap base from payment rules (eligible line totals only); omit for legacy full-bill behavior.
 */
function validateSaleLoyaltyBeforeSave(saleBody, settings, eligibleSubtotalBeforeLoyalty) {
  /** When disabled, do not validate (legacy bills may still carry stored loyalty fields). */
  if (!settings.enabled) {
    return;
  }
  const redeemed = Math.floor(Number(saleBody.loyaltyPointsRedeemed) || 0);
  const disc = Number(saleBody.loyaltyDiscountAmount) || 0;
  if (redeemed === 0 && disc === 0) return;
  const minR = Number(settings.minRedeemPoints) || 0;
  if (redeemed > 0 && redeemed < minR) {
    const err = new Error(`Minimum redemption is ${minR} points`);
    err.status = 400;
    throw err;
  }
  const gross = Number(saleBody.grossTotal) || 0;
  const subtotalBefore = gross + disc;
  const capBase =
    eligibleSubtotalBeforeLoyalty != null && Number.isFinite(Number(eligibleSubtotalBeforeLoyalty))
      ? Math.max(0, Number(eligibleSubtotalBeforeLoyalty))
      : subtotalBefore;
  const expectedDisc = rupeeDiscountFromPoints(settings, redeemed);
  if (Math.abs(expectedDisc - disc) > 0.05) {
    const err = new Error('Loyalty discount does not match points redeemed');
    err.status = 400;
    throw err;
  }
  const cap = maxRedeemPointsForBill(settings, capBase, Number.MAX_SAFE_INTEGER);
  if (redeemed > cap + 1e-6) {
    const err = new Error('Points redemption exceeds maximum allowed for this bill');
    err.status = 400;
    throw err;
  }
  const maxDisc = capBase * (Math.min(100, Math.max(0, Number(settings.maxRedeemPercentOfBill) || 0)) / 100);
  if (disc > maxDisc + 0.05) {
    const err = new Error('Loyalty discount exceeds maximum percent of bill');
    err.status = 400;
    throw err;
  }
}

/**
 * After sale is saved and completed — writes ledger + updates Client.rewardPointsBalance.
 */
async function processSaleCompletionLoyalty({ savedSale, branchId, businessModels, userId }) {
  const settings = await getMergedSettings(branchId);
  if (!settings.enabled) return { skipped: true };

  const status = String(savedSale.status || '').toLowerCase();
  if (status !== 'completed') return { skipped: true };

  const cid = savedSale.customerId;
  if (!cid || !mongoose.Types.ObjectId.isValid(String(cid))) return { skipped: true };

  const { PointsLedger, Client, Sale } = businessModels;
  const saleId = savedSale._id;
  const branchOid = new mongoose.Types.ObjectId(String(branchId));
  const clientOid = new mongoose.Types.ObjectId(String(cid));

  const existingEarn = await PointsLedger.findOne({
    branchId: branchOid,
    saleId,
    type: 'earn',
  }).lean();
  if (existingEarn) return { skipped: true, reason: 'already_processed' };

  const redeemed = Math.floor(Number(savedSale.loyaltyPointsRedeemed) || 0);
  const disc = Number(savedSale.loyaltyDiscountAmount) || 0;

  let eligibleRewardSub = null;
  try {
    const { BusinessSettings } = businessModels;
    if (BusinessSettings) {
      const bs = await BusinessSettings.findOne().select('paymentConfiguration').lean();
      const { mergePaymentConfiguration, eligibleRedemptionSubtotal } = require('../lib/payment-redemption-eligibility');
      const pc = mergePaymentConfiguration(bs?.paymentConfiguration);
      eligibleRewardSub = eligibleRedemptionSubtotal(savedSale.items || [], pc, 'reward');
    }
  } catch (cfgErr) {
    logger.warn('[reward-points] payment configuration load failed', cfgErr?.message || cfgErr);
  }

  try {
    validateSaleLoyaltyBeforeSave(
      {
        grossTotal: savedSale.grossTotal,
        loyaltyPointsRedeemed: redeemed,
        loyaltyDiscountAmount: disc,
      },
      settings,
      eligibleRewardSub
    );
  } catch (e) {
    logger.warn('[reward-points] validation failed post-save', e.message);
    return { skipped: true, error: e.message };
  }

  const client = await Client.findById(clientOid).select('rewardPointsBalance dob').lean();
  if (!client) return { skipped: true, error: 'client_not_found' };

  let balance = Number(client.rewardPointsBalance) || 0;

  if (redeemed > 0) {
    if (balance < redeemed) {
      logger.error('[reward-points] insufficient balance after save', { saleId, redeemed, balance });
      return { skipped: true, error: 'insufficient_points' };
    }
    const updated = await Client.findOneAndUpdate(
      { _id: clientOid, rewardPointsBalance: { $gte: redeemed } },
      { $inc: { rewardPointsBalance: -redeemed } },
      { new: true }
    );
    if (!updated) {
      logger.error('[reward-points] concurrent redeem failed', { saleId, redeemed });
      return { skipped: true, error: 'insufficient_points' };
    }
    balance = Number(updated.rewardPointsBalance) || 0;
    await PointsLedger.create({
      branchId: branchOid,
      clientId: clientOid,
      type: 'redeem',
      points: -redeemed,
      source: 'bill',
      saleId,
      metadata: { billNo: savedSale.billNo },
      balanceAfter: balance,
      performedBy: userId && mongoose.Types.ObjectId.isValid(String(userId)) ? userId : null,
    });
  }

  const eligible = eligibleSpendFromSale(savedSale, settings);
  let baseEarn = computeBaseEarnPoints(settings, eligible);
  let firstVisitBonus = 0;
  let birthdayBonus = 0;

  const priorCompleted = await Sale.countDocuments({
    branchId: branchOid,
    customerId: clientOid,
    status: { $regex: /^completed$/i },
    _id: { $ne: saleId },
  });
  if (priorCompleted === 0 && Number(settings.firstVisitBonusPoints) > 0) {
    firstVisitBonus = Number(settings.firstVisitBonusPoints);
  }
  if (
    Number(settings.birthdayBonusPoints) > 0 &&
    isBirthdayInWindow(client.dob, savedSale.date, settings.birthdayBonusWindowDays)
  ) {
    birthdayBonus = Number(settings.birthdayBonusPoints);
  }

  const totalEarn = baseEarn + firstVisitBonus + birthdayBonus;
  if (totalEarn <= 0 && redeemed <= 0) {
    return { skipped: false, earned: 0, redeemed: 0 };
  }

  if (totalEarn > 0) {
    const afterInc = await Client.findByIdAndUpdate(
      clientOid,
      { $inc: { rewardPointsBalance: totalEarn } },
      { new: true }
    );
    balance = Number(afterInc?.rewardPointsBalance) || balance + totalEarn;
    try {
      await PointsLedger.create({
        branchId: branchOid,
        clientId: clientOid,
        type: 'earn',
        points: totalEarn,
        source: 'bill',
        saleId,
        metadata: {
          billNo: savedSale.billNo,
          baseEarn,
          firstVisitBonus,
          birthdayBonus,
          eligibleSpendRupees: eligible,
        },
        balanceAfter: balance,
        performedBy: userId && mongoose.Types.ObjectId.isValid(String(userId)) ? userId : null,
      });
    } catch (dup) {
      if (dup && dup.code === 11000) {
        logger.warn('[reward-points] duplicate earn ignored', { saleId: String(saleId) });
        await Client.findByIdAndUpdate(clientOid, { $inc: { rewardPointsBalance: -totalEarn } });
        return { skipped: true, reason: 'duplicate_earn' };
      }
      throw dup;
    }

    await Sale.updateOne(
      { _id: saleId },
      { $set: { loyaltyPointsEarned: totalEarn } }
    ).catch(() => {});

    return { earned: totalEarn, redeemed, baseEarn, firstVisitBonus, birthdayBonus };
  }

  return { earned: 0, redeemed, baseEarn, firstVisitBonus, birthdayBonus };
}

/**
 * Reverse loyalty effects for a completed sale (cancel or delete). Idempotent.
 */
async function reverseSaleLoyalty({ sale, branchId, businessModels, userId }) {
  const settings = await getMergedSettings(branchId);
  if (!settings.enabled) return { skipped: true };

  const saleId = sale._id;
  const branchOid = new mongoose.Types.ObjectId(String(branchId));
  const cid = sale.customerId;
  if (!cid) return { skipped: true };

  const clientOid = new mongoose.Types.ObjectId(String(cid));
  const { PointsLedger, Client, Sale } = businessModels;

  if (sale.loyaltyReversedAt) return { skipped: true, reason: 'already_reversed' };

  const existing = await PointsLedger.findOne({
    branchId: branchOid,
    saleId,
    type: 'adjust',
    'metadata.reversalKind': 'sale_completion',
  }).lean();
  if (existing) return { skipped: true, reason: 'already_reversed' };

  const earnRow = await PointsLedger.findOne({ branchId: branchOid, saleId, type: 'earn' }).lean();
  const redeemRow = await PointsLedger.findOne({ branchId: branchOid, saleId, type: 'redeem' }).lean();

  const earned = earnRow ? Number(earnRow.points) : Number(sale.loyaltyPointsEarned) || 0;
  const redeemedMag = redeemRow ? -Number(redeemRow.points) : Number(sale.loyaltyPointsRedeemed) || 0;

  if (earned <= 0 && redeemedMag <= 0) return { skipped: true };

  const client = await Client.findById(clientOid).select('rewardPointsBalance').lean();
  let balance = Number(client?.rewardPointsBalance) || 0;

  /** Net client adjustment: subtract what we gave, add back what they spent */
  const netDelta = -earned + redeemedMag;
  const newBal = Math.max(0, balance + netDelta);
  await Client.findByIdAndUpdate(clientOid, { $set: { rewardPointsBalance: newBal } });

  await PointsLedger.create({
    branchId: branchOid,
    clientId: clientOid,
    type: 'adjust',
    points: netDelta,
    source: 'system',
    saleId,
    metadata: {
      reversalKind: 'sale_completion',
      excludeFromLifetime: true,
      billNo: sale.billNo,
      reversedEarned: earned,
      reversedRedeemed: redeemedMag,
    },
    balanceAfter: newBal,
    performedBy: userId && mongoose.Types.ObjectId.isValid(String(userId)) ? userId : null,
  });

  await Sale.updateOne({ _id: saleId }, { $set: { loyaltyReversedAt: new Date() } }).catch(() => {});

  return { ok: true, netDelta, newBalance: newBal };
}

async function grantManualBonus({ branchId, businessModels, clientId, points, reason, userId }) {
  const p = Math.floor(Number(points) || 0);
  if (p <= 0) {
    const err = new Error('Points must be a positive integer');
    err.status = 400;
    throw err;
  }
  const settings = await getMergedSettings(branchId);
  if (!settings.enabled) {
    const err = new Error('Reward points are disabled');
    err.status = 400;
    throw err;
  }
  const { PointsLedger, Client } = businessModels;
  const branchOid = new mongoose.Types.ObjectId(String(branchId));
  const clientOid = new mongoose.Types.ObjectId(String(clientId));

  const updated = await Client.findByIdAndUpdate(
    clientOid,
    { $inc: { rewardPointsBalance: p } },
    { new: true }
  );
  if (!updated) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  const balance = Number(updated.rewardPointsBalance) || 0;
  await PointsLedger.create({
    branchId: branchOid,
    clientId: clientOid,
    type: 'adjust',
    points: p,
    source: 'manual',
    saleId: null,
    metadata: { reason: reason || 'Manual bonus' },
    balanceAfter: balance,
    performedBy: userId && mongoose.Types.ObjectId.isValid(String(userId)) ? userId : null,
  });
  return { balance };
}

async function getClientSummary(branchId, businessModels, clientId) {
  const branchOid = new mongoose.Types.ObjectId(String(branchId));
  const clientOid = new mongoose.Types.ObjectId(String(clientId));
  const { PointsLedger, Client } = businessModels;

  const client = await Client.findById(clientOid).select('rewardPointsBalance name').lean();
  if (!client) return null;

  const agg = await PointsLedger.aggregate([
    { $match: { branchId: branchOid, clientId: clientOid } },
    {
      $group: {
        _id: null,
        lifetimeEarned: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ['$points', 0] },
                  { $ne: ['$metadata.excludeFromLifetime', true] },
                ],
              },
              '$points',
              0,
            ],
          },
        },
        lifetimeRedeemed: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $lt: ['$points', 0] },
                  { $ne: ['$metadata.excludeFromLifetime', true] },
                ],
              },
              { $multiply: ['$points', -1] },
              0,
            ],
          },
        },
      },
    },
  ]);

  const lastEarn = await PointsLedger.findOne({
    branchId: branchOid,
    clientId: clientOid,
    type: 'earn',
    source: 'bill',
  })
    .sort({ createdAt: -1 })
    .select('points metadata createdAt')
    .lean();

  const row = agg[0] || { lifetimeEarned: 0, lifetimeRedeemed: 0 };
  return {
    balance: Number(client.rewardPointsBalance) || 0,
    lifetimeEarned: row.lifetimeEarned,
    lifetimeRedeemed: row.lifetimeRedeemed,
    lastBillEarnPoints: lastEarn ? Number(lastEarn.points) : 0,
    lastBillEarnAt: lastEarn?.createdAt || null,
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  mergeRewardPointsSettings,
  getMergedSettings,
  previewRedemption,
  computeBaseEarnPoints,
  eligibleSpendFromSale,
  validateSaleLoyaltyBeforeSave,
  processSaleCompletionLoyalty,
  reverseSaleLoyalty,
  grantManualBonus,
  getClientSummary,
  rupeeDiscountFromPoints,
  maxRedeemPointsForBill,
};
