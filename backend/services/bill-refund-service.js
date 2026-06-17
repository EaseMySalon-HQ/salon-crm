const mongoose = require('mongoose');
const { calculatePaymentAdjustments } = require('../utils/payment-refund-handler');
const walletSvc = require('./client-wallet-service');
const { logger } = require('../utils/logger');

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function productReturnKey(product) {
  const id = product?.productId != null ? String(product.productId) : '';
  const qty = Math.max(0, Number(product?.quantity) || 0);
  return `${id}:${qty}`;
}

function hasDuplicateRefundForProducts(existingRefunds, returnedProducts) {
  const priorKeys = new Set();
  for (const entry of existingRefunds || []) {
    for (const rp of entry.returnedProducts || []) {
      priorKeys.add(productReturnKey(rp));
    }
  }
  for (const rp of returnedProducts || []) {
    if (priorKeys.has(productReturnKey(rp))) return true;
  }
  return false;
}

function scalePaymentsToTarget(payments, targetPaid) {
  const list = Array.isArray(payments) ? payments.filter(Boolean) : [];
  const oldTotal = list.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const target = roundMoney(targetPaid);
  if (oldTotal <= 0.005 || target >= oldTotal - 0.01) return list;
  const ratio = target / oldTotal;
  const scaled = list.map((p) => ({
    mode: p.mode,
    amount: roundMoney(Number(p.amount || 0) * ratio),
  }));
  const scaledTotal = scaled.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const drift = roundMoney(target - scaledTotal);
  if (Math.abs(drift) >= 0.01 && scaled.length > 0) {
    scaled[scaled.length - 1].amount = roundMoney(
      (Number(scaled[scaled.length - 1].amount) || 0) + drift
    );
  }
  return scaled;
}

/**
 * Process a product-return refund after bill edit reduces total below amount paid.
 */
async function processBillEditRefund({
  sale,
  refundProcessing,
  newTotalAmount,
  previousPaidAmount,
  branchId,
  businessModels,
  staffUser,
}) {
  const amount = roundMoney(refundProcessing?.amount);
  const modeRaw = String(refundProcessing?.mode || '').toLowerCase();
  const returnedProducts = Array.isArray(refundProcessing?.returnedProducts)
    ? refundProcessing.returnedProducts
    : [];

  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Refund amount must be positive');
    err.status = 400;
    throw err;
  }
  if (modeRaw !== 'wallet' && modeRaw !== 'cash') {
    const err = new Error('Refund mode is required (wallet or cash)');
    err.status = 400;
    throw err;
  }

  const newTotal = roundMoney(newTotalAmount);
  const prevPaid = roundMoney(previousPaidAmount);
  const adjustments = calculatePaymentAdjustments(
    { totalAmount: newTotal, paidAmount: prevPaid },
    newTotal
  );
  const maxRefund = roundMoney(adjustments.refundAmount);

  if (amount > maxRefund + 0.02) {
    const err = new Error(`Refund amount cannot exceed overpaid amount (₹${maxRefund.toFixed(2)})`);
    err.status = 400;
    throw err;
  }

  if (returnedProducts.length > 0 && hasDuplicateRefundForProducts(sale.refundHistory, returnedProducts)) {
    const err = new Error('A refund for these returned items was already processed');
    err.status = 409;
    throw err;
  }

  const refundedByName =
    staffUser?.name ||
    [staffUser?.firstName, staffUser?.lastName].filter(Boolean).join(' ') ||
    'Staff';

  let walletTransactionId = null;
  const refundModeLabel = modeRaw === 'wallet' ? 'Wallet' : 'Cash';

  if (modeRaw === 'wallet') {
    if (!sale.customerId) {
      const err = new Error('Customer is required for wallet refund');
      err.status = 400;
      throw err;
    }
    const walletResult = await walletSvc.creditProductReturnRefundToWallet({
      branchId,
      businessModels,
      staffUser,
      clientId: sale.customerId,
      amount,
      saleId: sale._id,
      billNo: sale.billNo,
    });
    walletTransactionId = walletResult?.transaction?._id || null;
  }

  const normalizedReturnedProducts = returnedProducts.map((rp) => ({
    productId:
      rp?.productId && mongoose.Types.ObjectId.isValid(String(rp.productId))
        ? new mongoose.Types.ObjectId(String(rp.productId))
        : null,
    name: String(rp?.name || 'Product'),
    quantity: Math.max(0, Number(rp?.quantity) || 0),
  }));

  const refundEntry = {
    date: new Date(),
    amount,
    mode: refundModeLabel,
    refundedBy: refundedByName,
    refundedByUserId:
      staffUser?._id && mongoose.Types.ObjectId.isValid(String(staffUser._id))
        ? staffUser._id
        : staffUser?.id && mongoose.Types.ObjectId.isValid(String(staffUser.id))
          ? staffUser.id
          : null,
    editReason: String(refundProcessing?.editReason || '').trim(),
    returnedProducts: normalizedReturnedProducts,
    walletTransactionId,
  };

  sale.refundHistory = sale.refundHistory || [];
  sale.refundHistory.push(refundEntry);
  sale.markModified('refundHistory');

  sale.paymentStatus = sale.paymentStatus || {};
  sale.paymentStatus.totalAmount = newTotal;
  sale.paymentStatus.lastPaymentDate = new Date();

  if (modeRaw === 'wallet') {
    // Wallet refund: credit goes to prepaid wallet — physical tender in `payments` is unchanged
    // so cash/card collection reports still reflect what was actually collected at POS.
    sale.paymentStatus.paidAmount = newTotal;
    sale.paymentStatus.remainingAmount = 0;
    const priorWalletRefund = Number(sale.walletRefundCredited) || 0;
    sale.walletRefundCredited = roundMoney(priorWalletRefund + amount);
  } else {
    // Cash refund: money left the till — reduce recorded tender to match revised bill total.
    const newPaidAmount = roundMoney(prevPaid - amount);
    sale.paymentStatus.paidAmount = newPaidAmount;
    sale.paymentStatus.remainingAmount = Math.max(0, roundMoney(newTotal - newPaidAmount));
    sale.payments = scalePaymentsToTarget(sale.payments, newPaidAmount);
    sale.markModified('payments');
  }

  const effectivePaid = Number(sale.paymentStatus.paidAmount) || 0;
  if (effectivePaid >= newTotal - 0.01) {
    sale.status = 'completed';
  } else if (effectivePaid > 0.005) {
    sale.status = 'partial';
  } else {
    sale.status = 'unpaid';
  }

  logger.info('[bill-refund] Processed refund', {
    saleId: String(sale._id),
    billNo: sale.billNo,
    amount,
    mode: refundModeLabel,
  });

  return {
    refundEntry,
    newPaidAmount: Number(sale.paymentStatus.paidAmount) || 0,
    refundAmount: amount,
    refundMethods: [refundModeLabel],
    walletTransactionId,
  };
}

module.exports = {
  processBillEditRefund,
  hasDuplicateRefundForProducts,
  scalePaymentsToTarget,
};
