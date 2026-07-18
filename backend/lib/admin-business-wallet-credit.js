'use strict';

const {
  getWalletGstRate,
  computeWalletRechargeBreakdown,
} = require('./wallet-recharge-breakdown');

const MIN_ADMIN_WALLET_CREDIT_RUPEES = 1;
const MAX_ADMIN_WALLET_CREDIT_RUPEES = 50000;

const PAID_PROVIDERS = new Set(['razorpay', 'stripe', 'zoho', 'manual']);

function parseCreditAmountPaise(amountRupees) {
  const amount = Number(amountRupees);
  if (
    !Number.isFinite(amount)
    || amount < MIN_ADMIN_WALLET_CREDIT_RUPEES
    || amount > MAX_ADMIN_WALLET_CREDIT_RUPEES
  ) {
    const err = new Error(
      `Amount must be between ₹${MIN_ADMIN_WALLET_CREDIT_RUPEES} and ₹${MAX_ADMIN_WALLET_CREDIT_RUPEES}`,
    );
    err.status = 400;
    throw err;
  }
  return Math.round(amount * 100);
}

function normalizeCreditKind(raw) {
  const kind = String(raw || 'promo').trim().toLowerCase();
  if (kind === 'paid' || kind === 'invoice' || kind === 'paid_recharge') return 'paid';
  return 'promo';
}

function normalizePaymentProvider(raw) {
  const provider = String(raw || 'manual').trim().toLowerCase();
  return PAID_PROVIDERS.has(provider) ? provider : 'manual';
}

function buildPromoDescription(note) {
  const trimmed = String(note || '').trim();
  return trimmed || 'Promotional messaging credit';
}

function buildPaidDescription(note, breakdown) {
  const trimmed = String(note || '').trim();
  const gstSuffix =
    breakdown.gstPaise > 0
      ? ` (incl. ₹${(breakdown.gstPaise / 100).toFixed(2)} GST @ ${(breakdown.gstRate * 100).toFixed(0)}%)`
      : '';
  const base = trimmed || 'Wallet recharge — external payment';
  return `${base}${gstSuffix}`;
}

/**
 * Credit a tenant messaging wallet from the platform admin console.
 *
 * @param {'promo'|'paid'} [creditKind] promo = complimentary (no invoice); paid = GST invoice eligible
 */
async function creditBusinessWalletFromAdmin({
  Business,
  WalletTransaction,
  businessId,
  amountRupees,
  note,
  admin,
  creditKind = 'promo',
  paymentProvider = 'manual',
  paymentReference = null,
  generateInvoice = false,
  emailInvoice = false,
}) {
  const kind = normalizeCreditKind(creditKind);
  const wantsInvoice = kind === 'paid' || generateInvoice === true;
  const amountPaiseInput = parseCreditAmountPaise(amountRupees);

  const business = await Business.findById(businessId).select('wallet status name contact').lean();
  if (!business) {
    const err = new Error('Business not found');
    err.status = 404;
    throw err;
  }
  if (business.status === 'deleted') {
    const err = new Error('Cannot credit wallet for a deleted business');
    err.status = 400;
    throw err;
  }

  let creditPaise = amountPaiseInput;
  let gstPaise = 0;
  let gstRateApplied = 0;
  let totalChargedPaise = amountPaiseInput;
  let taxInvoiceEligible = false;
  let provider = 'system';
  let providerPaymentId = null;
  let description = buildPromoDescription(note);

  if (wantsInvoice) {
    const gstRate = await getWalletGstRate();
    const breakdown = computeWalletRechargeBreakdown(amountRupees, gstRate);
    creditPaise = breakdown.basePaise;
    gstPaise = breakdown.gstPaise;
    gstRateApplied = breakdown.gstRate;
    totalChargedPaise = breakdown.totalPaise;
    taxInvoiceEligible = true;
    provider = normalizePaymentProvider(paymentProvider);
    providerPaymentId = String(paymentReference || '').trim() || null;
    description = buildPaidDescription(note, breakdown);
  }

  const updated = await Business.findByIdAndUpdate(
    businessId,
    {
      $inc: { 'wallet.balancePaise': creditPaise },
      $set: { updatedAt: new Date() },
    },
    { new: true },
  )
    .select('wallet')
    .lean();

  const newBalancePaise = Number(updated?.wallet?.balancePaise || 0);

  const txn = await WalletTransaction.create({
    businessId,
    type: 'credit',
    amountPaise: creditPaise,
    gstPaise,
    gstRate: gstRateApplied,
    totalChargedPaise,
    taxInvoiceEligible,
    provider,
    providerPaymentId,
    description,
    balanceAfterPaise: newBalancePaise,
    timestamp: new Date(),
  });

  let invoiceNumber = null;
  let invoiceEmailed = false;
  let invoiceError = null;

  if (wantsInvoice) {
    try {
      const { buildInvoicePDFForTransaction, sendWalletRechargeInvoice } = require('./send-wallet-invoice');
      const built = await buildInvoicePDFForTransaction({ transactionId: txn._id });
      invoiceNumber = built.invoiceNumber;

      if (emailInvoice) {
        const sendResult = await sendWalletRechargeInvoice({
          transactionId: txn._id,
          triggeredByEmail: admin?.email || null,
        });
        invoiceEmailed = Boolean(sendResult?.success && !sendResult?.skippedEmail);
        if (!sendResult?.success && sendResult?.error) {
          invoiceError = sendResult.error;
        }
      }
    } catch (err) {
      invoiceError = err?.message || String(err);
    }
  }

  return {
    transactionId: txn._id,
    amountPaise: creditPaise,
    amountRupees: creditPaise / 100,
    gstPaise,
    gstRate: gstRateApplied,
    totalChargedPaise,
    totalChargedRupees: totalChargedPaise / 100,
    newBalancePaise,
    newBalanceRupees: newBalancePaise / 100,
    businessName: business.name,
    creditKind: wantsInvoice ? 'paid' : 'promo',
    taxInvoiceEligible,
    invoiceNumber,
    invoiceGenerated: Boolean(invoiceNumber),
    invoiceEmailed,
    invoiceError,
  };
}

module.exports = {
  creditBusinessWalletFromAdmin,
  parseCreditAmountPaise,
  normalizeCreditKind,
  MIN_ADMIN_WALLET_CREDIT_RUPEES,
  MAX_ADMIN_WALLET_CREDIT_RUPEES,
};
