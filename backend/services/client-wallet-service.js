/**
 * Client prepaid wallet (salon-issued service credit) — business logic.
 * Distinct from platform `Business.wallet` / SMS credits.
 */

const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const databaseManager = require('../config/database-manager');
const { sendClientWalletTransactionWhatsApp } = require('../lib/send-client-wallet-transaction-whatsapp');

function queueWalletTxnWhatsApp(branchId, businessModels, wallet, transactionDoc) {
  if (!branchId || !businessModels || !wallet || !transactionDoc) return;
  const tx =
    typeof transactionDoc.toObject === 'function' ? transactionDoc.toObject() : { ...transactionDoc };
  const w = typeof wallet.toObject === 'function' ? wallet.toObject() : { ...wallet };
  void sendClientWalletTransactionWhatsApp(branchId, businessModels, w, tx).catch((err) =>
    logger.error('[client-wallet] WhatsApp notify failed', err?.message || err)
  );
}

const DEFAULT_SETTINGS = {
  allowCouponStacking: false,
  gracePeriodDays: 0,
  allowMultiBranch: false,
  refundPolicy: 'service_credit_only',
  minRechargeAmount: 500,
  expiryAlertsEnabled: true,
};

async function getMainBusiness(branchId) {
  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const doc = await Business.findById(branchId).select('clientWalletSettings name').lean();
  return doc;
}

function mergeClientWalletSettings(raw) {
  return { ...DEFAULT_SETTINGS, ...(raw || {}) };
}

/**
 * Allocate next bill number (same rules as POST /api/settings/business/increment-receipt).
 */
async function allocateNextBillNo(branchId, businessModels) {
  const { BusinessSettings, Sale } = businessModels;
  let settings = await BusinessSettings.findOne();
  if (!settings) {
    settings = new BusinessSettings({ branchId, receiptNumber: 0 });
    await settings.save();
  } else if (!settings.branchId) {
    settings.branchId = branchId;
    await settings.save();
  }

  const updatedSettings = await BusinessSettings.findOneAndUpdate(
    { _id: settings._id },
    { $inc: { receiptNumber: 1 } },
    { new: true }
  );
  if (!updatedSettings) throw new Error('Failed to increment receipt number');

  let newReceiptNumber = updatedSettings.receiptNumber;
  const prefix = updatedSettings.invoicePrefix || updatedSettings.receiptPrefix || 'INV';
  let formattedReceiptNumber = `${prefix}-${String(newReceiptNumber).padStart(6, '0')}`;

  let existingSale = await Sale.findOne({ billNo: formattedReceiptNumber });
  let attempts = 0;
  while (existingSale && attempts < 1000) {
    newReceiptNumber += 1;
    formattedReceiptNumber = `${prefix}-${String(newReceiptNumber).padStart(6, '0')}`;
    existingSale = await Sale.findOne({ billNo: formattedReceiptNumber });
    attempts += 1;
  }
  if (attempts >= 1000) throw new Error('Could not find available receipt number');

  if (newReceiptNumber !== updatedSettings.receiptNumber) {
    await BusinessSettings.findOneAndUpdate({ _id: settings._id }, { receiptNumber: newReceiptNumber });
  }

  return { billNo: formattedReceiptNumber, receiptNumber: newReceiptNumber };
}

async function issueWallet({
  branchId,
  businessModels,
  staffUser,
  clientId,
  planId,
  amountPaid,
}) {
  const { PrepaidPlan, ClientWallet, ClientWalletTransaction, Client, Sale, Staff } = businessModels;
  const mainBiz = await getMainBusiness(branchId);
  const cwSettings = mergeClientWalletSettings(mainBiz?.clientWalletSettings);

  if (!mongoose.Types.ObjectId.isValid(clientId)) {
    const err = new Error('Invalid client id');
    err.status = 400;
    throw err;
  }

  const plan = await PrepaidPlan.findOne({ _id: planId, branchId });
  if (!plan) {
    const err = new Error('Plan not found');
    err.status = 404;
    throw err;
  }
  if (plan.status !== 'active') {
    const err = new Error('This plan is not available for sale');
    err.status = 409;
    throw err;
  }

  if (plan.branchIds && plan.branchIds.length > 0) {
    const ok = plan.branchIds.some((b) => String(b) === String(branchId));
    if (!ok) {
      const err = new Error('This plan cannot be sold at this branch');
      err.status = 403;
      throw err;
    }
  }

  const paid = amountPaid != null && amountPaid !== '' ? Number(amountPaid) : Number(plan.payAmount);
  if (!Number.isFinite(paid) || paid < cwSettings.minRechargeAmount) {
    const err = new Error(`Amount must be at least ₹${cwSettings.minRechargeAmount}`);
    err.status = 400;
    throw err;
  }
  if (Math.abs(paid - plan.payAmount) > 0.009) {
    const err = new Error(`Amount must match plan price (₹${plan.payAmount})`);
    err.status = 400;
    throw err;
  }

  if (plan.maxPerClient != null && plan.maxPerClient > 0) {
    const count = await ClientWallet.countDocuments({
      branchId,
      clientId,
      planId: plan._id,
      status: { $nin: ['cancelled'] },
    });
    if (count >= plan.maxPerClient) {
      const err = new Error('This client has reached the maximum purchases for this plan');
      err.status = 409;
      throw err;
    }
  }

  const client = await Client.findOne({ _id: clientId, branchId }).select('name phone email').lean();
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }

  let staffName = staffUser?.firstName
    ? `${staffUser.firstName} ${staffUser.lastName || ''}`.trim()
    : 'Staff';
  if (staffUser?._id && mongoose.Types.ObjectId.isValid(String(staffUser._id))) {
    const st = await Staff.findOne({ _id: staffUser._id, branchId }).select('name').lean();
    if (st?.name) staffName = st.name;
  }

  const { billNo } = await allocateNextBillNo(branchId, businessModels);

  const purchasedAt = new Date();
  const expiryDate = new Date(purchasedAt);
  expiryDate.setDate(expiryDate.getDate() + Number(plan.validityDays || 1));

  const grace = Number(cwSettings.gracePeriodDays || 0);
  const effectiveExpiryDate = new Date(expiryDate);
  effectiveExpiryDate.setDate(effectiveExpiryDate.getDate() + grace);

  const planSnapshot = {
    planName: plan.name,
    payAmount: plan.payAmount,
    creditAmount: plan.creditAmount,
    validityDays: plan.validityDays,
    allowCouponStacking: !!plan.allowCouponStacking,
  };

  const credit = Number(plan.creditAmount);
  const sale = new Sale({
    billNo,
    customerId: client._id,
    customerName: client.name || 'Customer',
    customerPhone: client.phone || '',
    customerEmail: client.email || '',
    date: purchasedAt,
    time: '',
    status: 'completed',
    paymentStatus: {
      totalAmount: paid,
      paidAmount: paid,
      remainingAmount: 0,
      dueDate: purchasedAt,
      lastPaymentDate: purchasedAt,
      isOverdue: false,
    },
    paymentMode: 'Cash',
    payments: [{ mode: 'Cash', amount: paid }],
    netTotal: paid,
    taxAmount: 0,
    grossTotal: paid,
    discount: 0,
    discountType: 'percentage',
    tip: 0,
    staffName,
    staffId: String(staffUser?._id || ''),
    items: [
      {
        name: `Prepaid wallet — ${plan.name}`,
        type: 'prepaid_wallet',
        prepaidPlanId: plan._id,
        quantity: 1,
        price: paid,
        total: paid,
        discount: 0,
        staffId: String(staffUser?._id || ''),
        staffName,
        staffContributions: [],
      },
    ],
    notes: `Client prepaid wallet issued (plan ${plan.name})`,
    branchId,
  });
  await sale.save();
  const savedSale = await Sale.findById(sale._id);
  if (savedSale && !savedSale.shareToken) {
    const crypto = require('crypto');
    savedSale.shareToken = crypto.randomBytes(32).toString('hex');
    await savedSale.save();
  }

  const wallet = await ClientWallet.create({
    branchId,
    clientId,
    planId: plan._id,
    planSnapshot,
    paidAmount: paid,
    creditedBalance: credit,
    remainingBalance: credit,
    purchasedAt,
    expiryDate,
    gracePeriodDays: grace,
    effectiveExpiryDate,
    status: 'active',
    issuedBranchId: branchId,
    saleId: sale._id,
    notifiedDays: [],
  });

  const walletTx = await ClientWalletTransaction.create({
    branchId,
    walletId: wallet._id,
    clientId: client._id,
    type: 'credit',
    amount: credit,
    balanceAfter: credit,
    description: `Wallet issued — ${plan.name}`,
    performedBy: staffUser?._id || null,
    saleId: sale._id,
    serviceNames: [],
  });
  queueWalletTxnWhatsApp(branchId, businessModels, wallet, walletTx);

  return { wallet, sale: savedSale || sale };
}

/**
 * Issue wallet credit against an existing POS sale that already includes matching prepaid_wallet line(s).
 * Does not create a second bill. Staff may call when saleId is present; standalone issue remains manager-only.
 */
async function issueWalletLinkedToSale({
  branchId,
  businessModels,
  staffUser,
  clientId,
  planId,
  amountPaid,
  saleId,
}) {
  const { PrepaidPlan, ClientWallet, ClientWalletTransaction, Client, Sale, Staff } = businessModels;
  const mainBiz = await getMainBusiness(branchId);
  const cwSettings = mergeClientWalletSettings(mainBiz?.clientWalletSettings);

  if (!mongoose.Types.ObjectId.isValid(clientId)) {
    const err = new Error('Invalid client id');
    err.status = 400;
    throw err;
  }
  if (!mongoose.Types.ObjectId.isValid(saleId)) {
    const err = new Error('Invalid sale id');
    err.status = 400;
    throw err;
  }

  const plan = await PrepaidPlan.findOne({ _id: planId, branchId });
  if (!plan) {
    const err = new Error('Plan not found');
    err.status = 404;
    throw err;
  }
  if (plan.status !== 'active') {
    const err = new Error('This plan is not available for sale');
    err.status = 409;
    throw err;
  }

  if (plan.branchIds && plan.branchIds.length > 0) {
    const ok = plan.branchIds.some((b) => String(b) === String(branchId));
    if (!ok) {
      const err = new Error('This plan cannot be sold at this branch');
      err.status = 403;
      throw err;
    }
  }

  const paid = amountPaid != null && amountPaid !== '' ? Number(amountPaid) : Number(plan.payAmount);
  if (!Number.isFinite(paid) || paid < cwSettings.minRechargeAmount) {
    const err = new Error(`Amount must be at least ₹${cwSettings.minRechargeAmount}`);
    err.status = 400;
    throw err;
  }
  if (Math.abs(paid - plan.payAmount) > 0.009) {
    const err = new Error(`Amount must match plan price (₹${plan.payAmount})`);
    err.status = 400;
    throw err;
  }

  const sale = await Sale.findOne({ _id: saleId, branchId });
  if (!sale) {
    const err = new Error('Sale not found');
    err.status = 404;
    throw err;
  }
  if (String(sale.customerId) !== String(clientId)) {
    const err = new Error('Sale customer does not match this client');
    err.status = 400;
    throw err;
  }

  const matchingLines = (sale.items || []).filter(
    (i) =>
      i.type === 'prepaid_wallet' &&
      i.prepaidPlanId &&
      String(i.prepaidPlanId) === String(plan._id) &&
      Math.abs(Number(i.price || 0) - Number(plan.payAmount)) < 0.02
  );
  const expectedSlots = matchingLines.reduce((s, i) => s + (Number(i.quantity) || 1), 0);
  if (expectedSlots < 1) {
    const err = new Error('This bill does not include a matching prepaid wallet line for this plan');
    err.status = 400;
    throw err;
  }

  const issued = await ClientWallet.countDocuments({
    branchId,
    saleId,
    planId: plan._id,
  });
  if (issued >= expectedSlots) {
    const err = new Error('Prepaid credit for this bill has already been fully issued');
    err.status = 409;
    throw err;
  }

  if (plan.maxPerClient != null && plan.maxPerClient > 0) {
    const count = await ClientWallet.countDocuments({
      branchId,
      clientId,
      planId: plan._id,
      status: { $nin: ['cancelled'] },
    });
    if (count >= plan.maxPerClient) {
      const err = new Error('This client has reached the maximum purchases for this plan');
      err.status = 409;
      throw err;
    }
  }

  const client = await Client.findOne({ _id: clientId, branchId }).select('name phone email').lean();
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }

  let staffName = staffUser?.firstName
    ? `${staffUser.firstName} ${staffUser.lastName || ''}`.trim()
    : 'Staff';
  if (staffUser?._id && mongoose.Types.ObjectId.isValid(String(staffUser._id))) {
    const st = await Staff.findOne({ _id: staffUser._id, branchId }).select('name').lean();
    if (st?.name) staffName = st.name;
  }

  const purchasedAt = new Date();
  const expiryDate = new Date(purchasedAt);
  expiryDate.setDate(expiryDate.getDate() + Number(plan.validityDays || 1));

  const grace = Number(cwSettings.gracePeriodDays || 0);
  const effectiveExpiryDate = new Date(expiryDate);
  effectiveExpiryDate.setDate(effectiveExpiryDate.getDate() + grace);

  const planSnapshot = {
    planName: plan.name,
    payAmount: plan.payAmount,
    creditAmount: plan.creditAmount,
    validityDays: plan.validityDays,
    allowCouponStacking: !!plan.allowCouponStacking,
  };

  const credit = Number(plan.creditAmount);

  const wallet = await ClientWallet.create({
    branchId,
    clientId,
    planId: plan._id,
    planSnapshot,
    paidAmount: paid,
    creditedBalance: credit,
    remainingBalance: credit,
    purchasedAt,
    expiryDate,
    gracePeriodDays: grace,
    effectiveExpiryDate,
    status: 'active',
    issuedBranchId: branchId,
    saleId: sale._id,
    notifiedDays: [],
  });

  const linkedSaleTx = await ClientWalletTransaction.create({
    branchId,
    walletId: wallet._id,
    clientId: client._id,
    type: 'credit',
    amount: credit,
    balanceAfter: credit,
    description: `Wallet issued — ${plan.name}`,
    performedBy: staffUser?._id || null,
    saleId: sale._id,
    serviceNames: [],
  });
  queueWalletTxnWhatsApp(branchId, businessModels, wallet, linkedSaleTx);

  const savedSale = await Sale.findById(sale._id);
  return { wallet, sale: savedSale || sale };
}

/**
 * Atomic debit + ledger row.
 */
async function redeemBalance({
  branchId,
  businessModels,
  staffUser,
  walletId,
  amount,
  saleId,
  serviceNames,
  couponApplied,
}) {
  const { ClientWallet, ClientWalletTransaction } = businessModels;
  const mainBiz = await getMainBusiness(branchId);
  const cwSettings = mergeClientWalletSettings(mainBiz?.clientWalletSettings);

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    const err = new Error('Invalid redeem amount');
    err.status = 400;
    throw err;
  }

  const wallet = await ClientWallet.findOne({ _id: walletId, branchId });
  if (!wallet) {
    const err = new Error('Wallet not found');
    err.status = 404;
    throw err;
  }
  if (wallet.status !== 'active') {
    const err = new Error('Wallet is not active');
    err.status = 409;
    throw err;
  }

  if (
    couponApplied &&
    !cwSettings.allowCouponStacking &&
    !wallet.planSnapshot?.allowCouponStacking
  ) {
    const err = new Error(
      'Wallet cannot be combined with discounts unless stacking is enabled for this business or plan'
    );
    err.status = 409;
    throw err;
  }

  const now = new Date();
  if (now > wallet.effectiveExpiryDate) {
    const err = new Error('Wallet has expired');
    err.status = 409;
    throw err;
  }

  if (!cwSettings.allowMultiBranch && String(wallet.issuedBranchId) !== String(branchId)) {
    const err = new Error('Wallet can only be redeemed at the issuing branch');
    err.status = 403;
    throw err;
  }

  if (amt > wallet.remainingBalance + 1e-6) {
    const err = new Error('Amount exceeds wallet balance');
    err.status = 400;
    throw err;
  }

  const newBal = Math.round((wallet.remainingBalance - amt) * 100) / 100;
  const updated = await ClientWallet.findOneAndUpdate(
    {
      _id: walletId,
      branchId,
      status: 'active',
      remainingBalance: { $gte: amt },
      effectiveExpiryDate: { $gte: now },
    },
    {
      $inc: { remainingBalance: -amt },
      ...(newBal <= 0.009 ? { $set: { status: 'exhausted' } } : {}),
    },
    { new: true }
  );

  if (!updated) {
    const err = new Error('Redeem failed — balance or status changed');
    err.status = 409;
    throw err;
  }

  const finalBal = updated.remainingBalance;
  const debitTx = await ClientWalletTransaction.create({
    branchId,
    walletId: wallet._id,
    clientId: wallet.clientId,
    type: 'debit',
    amount: amt,
    balanceAfter: finalBal,
    description: 'Redeemed at checkout',
    performedBy: staffUser?._id || null,
    saleId: saleId && mongoose.Types.ObjectId.isValid(String(saleId)) ? saleId : null,
    serviceNames: Array.isArray(serviceNames) ? serviceNames.filter(Boolean) : [],
  });
  queueWalletTxnWhatsApp(branchId, businessModels, updated, debitTx);

  return { wallet: updated, balanceAfter: finalBal };
}

async function manualAdjust({
  branchId,
  businessModels,
  staffUser,
  walletId,
  delta,
  reason,
}) {
  const { ClientWallet, ClientWalletTransaction } = businessModels;
  const d = Number(delta);
  if (!Number.isFinite(d) || d === 0) {
    const err = new Error('Adjustment amount must be non-zero');
    err.status = 400;
    throw err;
  }

  const wallet = await ClientWallet.findOne({ _id: walletId, branchId });
  if (!wallet) {
    const err = new Error('Wallet not found');
    err.status = 404;
    throw err;
  }

  const newBal = Math.round((wallet.remainingBalance + d) * 100) / 100;
  if (newBal < 0) {
    const err = new Error('Adjustment would make balance negative');
    err.status = 400;
    throw err;
  }

  wallet.remainingBalance = newBal;
  if (newBal <= 0.009 && wallet.status === 'active') {
    wallet.status = 'exhausted';
  } else if (newBal > 0.009 && wallet.status === 'exhausted') {
    wallet.status = 'active';
  }
  await wallet.save();

  const adjTx = await ClientWalletTransaction.create({
    branchId,
    walletId: wallet._id,
    clientId: wallet.clientId,
    type: 'adjustment',
    amount: Math.abs(d),
    balanceAfter: newBal,
    description: reason || (d > 0 ? 'Manual credit' : 'Manual debit'),
    performedBy: staffUser?._id || null,
    saleId: null,
    serviceNames: [],
  });
  queueWalletTxnWhatsApp(branchId, businessModels, wallet, adjTx);

  return wallet;
}

/**
 * When an invoice is deleted, restore prepaid wallet amounts that were debited at checkout for that bill.
 * Groups multiple debit rows per wallet, writes one refund_credit ledger row per wallet.
 */
async function reverseWalletRedemptionsForDeletedSale({
  branchId,
  sale,
  businessModels,
  staffUser,
  deleteReason,
}) {
  const ClientWalletTransaction = businessModels.ClientWalletTransaction;
  const ClientWallet = businessModels.ClientWallet;
  if (!ClientWalletTransaction || !ClientWallet) {
    return { restored: [], skipped: 'models_missing' };
  }

  const bId =
    sale.branchId != null && mongoose.Types.ObjectId.isValid(String(sale.branchId))
      ? new mongoose.Types.ObjectId(String(sale.branchId))
      : branchId != null && mongoose.Types.ObjectId.isValid(String(branchId))
        ? new mongoose.Types.ObjectId(String(branchId))
        : null;
  if (!bId || !sale?._id) {
    return { restored: [], skipped: 'invalid_ids' };
  }

  const saleId = sale._id;

  const debits = await ClientWalletTransaction.find({
    branchId: bId,
    saleId,
    type: 'debit',
  }).lean();

  if (!debits.length) {
    return { restored: [] };
  }

  const byWallet = new Map();
  for (const d of debits) {
    const wid = d.walletId != null ? String(d.walletId) : '';
    const amt = Number(d.amount);
    if (!wid || !mongoose.Types.ObjectId.isValid(wid) || !Number.isFinite(amt) || amt <= 0) continue;
    byWallet.set(wid, (byWallet.get(wid) || 0) + amt);
  }

  const billRef = sale.billNo != null && String(sale.billNo).trim() !== '' ? String(sale.billNo).trim() : String(saleId);
  let performedBy = staffUser?._id || staffUser?.id || null;
  if (performedBy != null && !mongoose.Types.ObjectId.isValid(String(performedBy))) {
    performedBy = null;
  }
  const performedByOid =
    performedBy != null ? new mongoose.Types.ObjectId(String(performedBy)) : null;

  const reasonSuffix =
    deleteReason && String(deleteReason).trim() && String(deleteReason).trim() !== 'Bill deleted'
      ? ` ${String(deleteReason).trim()}`
      : '';

  const restored = [];
  for (const [walletIdStr, rawSum] of byWallet) {
    const creditAmt = Math.round(Number(rawSum) * 100) / 100;
    if (creditAmt <= 0) continue;

    const wallet = await ClientWallet.findOne({ _id: walletIdStr, branchId: bId });
    if (!wallet) {
      logger.warn('[client-wallet] Sale delete: wallet not found for reversal', { walletIdStr, saleId: String(saleId) });
      continue;
    }
    if (wallet.status === 'cancelled') {
      logger.warn('[client-wallet] Sale delete: skip reversal into cancelled wallet', { walletIdStr });
      continue;
    }

    const dupRefund = await ClientWalletTransaction.exists({
      branchId: bId,
      saleId,
      walletId: wallet._id,
      type: 'refund_credit',
      description: { $regex: /^Bill deleted — wallet payment restored/ },
    });
    if (dupRefund) {
      continue;
    }

    const newBal = Math.round((wallet.remainingBalance + creditAmt) * 100) / 100;
    wallet.remainingBalance = newBal;
    if (newBal > 0.009 && wallet.status === 'exhausted') {
      wallet.status = 'active';
    }
    await wallet.save();

    const refundTx = await ClientWalletTransaction.create({
      branchId: bId,
      walletId: wallet._id,
      clientId: wallet.clientId,
      type: 'refund_credit',
      amount: creditAmt,
      balanceAfter: newBal,
      description: `Bill deleted — wallet payment restored (${billRef})${reasonSuffix}`.trim(),
      performedBy: performedByOid,
      saleId,
      serviceNames: [],
    });
    queueWalletTxnWhatsApp(bId, businessModels, wallet, refundTx);

    restored.push({ walletId: wallet._id, amount: creditAmt, balanceAfter: newBal });
  }

  if (restored.length) {
    logger.info('[client-wallet] Sale delete: restored wallet credits', {
      saleId: String(saleId),
      billRef,
      wallets: restored.length,
    });
  }

  return { restored };
}

/**
 * Legacy / mistaken indexes used `client_id` while the schema field is `clientId`.
 * MongoDB then indexed every document as client_id: null → unique (branchId, client_id) broke second wallet.
 * Drops any index whose key includes `client_id`, then re-syncs schema indexes.
 */
const repairedWalletIndexNamespaces = new Set();

async function repairClientWalletIndexesIfNeeded(ClientWallet) {
  const ns = ClientWallet.collection.namespace;
  if (repairedWalletIndexNamespaces.has(ns)) return;
  try {
    const coll = ClientWallet.collection;
    const indexes = await coll.indexes();
    let dropped = false;
    for (const idx of indexes) {
      const key = idx.key || {};
      if (!Object.prototype.hasOwnProperty.call(key, 'client_id')) continue;
      try {
        await coll.dropIndex(idx.name);
        dropped = true;
        logger.warn(
          `[client-wallet] Dropped obsolete index "${idx.name}" — field should be clientId, not client_id`
        );
      } catch (dropErr) {
        logger.warn(`[client-wallet] Could not drop index "${idx.name}":`, dropErr.message || dropErr);
      }
    }
    if (dropped) {
      await ClientWallet.syncIndexes();
    }
    repairedWalletIndexNamespaces.add(ns);
  } catch (e) {
    logger.error('[client-wallet] Index repair:', e.message || e);
  }
}

async function getLiabilitySummary(branchId, businessModels) {
  const { ClientWallet } = businessModels;
  const rows = await ClientWallet.aggregate([
    { $match: { branchId: new mongoose.Types.ObjectId(branchId), status: 'active' } },
    {
      $group: {
        _id: null,
        totalOutstanding: { $sum: '$remainingBalance' },
        walletCount: { $sum: 1 },
      },
    },
  ]);
  const r = rows[0] || { totalOutstanding: 0, walletCount: 0 };
  return {
    totalOutstanding: r.totalOutstanding || 0,
    activeWalletCount: r.walletCount || 0,
  };
}

module.exports = {
  getMainBusiness,
  mergeClientWalletSettings,
  allocateNextBillNo,
  repairClientWalletIndexesIfNeeded,
  issueWallet,
  issueWalletLinkedToSale,
  redeemBalance,
  manualAdjust,
  reverseWalletRedemptionsForDeletedSale,
  getLiabilitySummary,
  DEFAULT_SETTINGS,
};
