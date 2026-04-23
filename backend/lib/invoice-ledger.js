/**
 * Writes unified tax-invoice rows to the `Invoice` collection from the two
 * SaaS billing surfaces (wallet recharge + plan subscription).
 *
 * Idempotent: call sites may retry (e.g. PDF regenerated on download); the
 * `(source, sourceRef)` unique index + upsert ensures no duplicate rows.
 *
 * Keeps CGST/SGST vs IGST split logic identical to the PDF generator so the
 * database and the printed invoice never disagree.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');

const DEFAULT_SAC = '998399';

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function safeStr(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function toPaise(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

/**
 * Indian fiscal year — Apr 1 to Mar 31. Returns `"YYYY-YY"` format matching
 * the InvoiceCounter labels (e.g. `"2025-26"`).
 */
function fiscalYearLabel(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const y = d.getFullYear();
  const m = d.getMonth(); // 0 = Jan
  const fyStart = m >= 3 ? y : y - 1;
  const fyEnd = fyStart + 1;
  return `${fyStart}-${String(fyEnd).slice(-2)}`;
}

function filingPeriodLabel(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Same split rule used by `backend/utils/wallet-invoice-pdf.js` so the DB
 * totals always match the printed invoice.
 */
function splitGst({ gstPaise, gstRate, sellerState, buyerState }) {
  const total = toPaise(gstPaise);
  const a = safeStr(sellerState).toLowerCase();
  const b = safeStr(buyerState).toLowerCase();
  const sameState = a && b && a === b;

  if (sameState) {
    const half = Math.round(total / 2);
    return {
      intraState: true,
      cgstPaise: half,
      sgstPaise: total - half,
      igstPaise: 0,
    };
  }

  return {
    intraState: false,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: total,
  };
}

function mapProvider(raw) {
  const p = safeStr(raw).toLowerCase();
  if (!p) return null;
  if (p === 'razorpay' || p === 'stripe' || p === 'zoho' || p === 'system') return p;
  // Map any unexpected aliases back to a known enum value or null.
  if (p === 'zohopay') return 'zoho';
  return null;
}

async function getInvoiceModel() {
  const conn = await databaseManager.getMainConnection();
  return conn.model('Invoice', require('../models/Invoice').schema);
}

async function getGstFilingModel() {
  const conn = await databaseManager.getMainConnection();
  return conn.model('GstFiling', require('../models/GstFiling').schema);
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Upsert one Invoice row for a successful SaaS payment.
 *
 * @param {Object} args
 * @param {"wallet"|"plan"} args.source
 * @param {Object} args.sourceTx              Mongoose doc or plain object; must have `_id`.
 * @param {Object} args.business              Business mongoose doc or plain object.
 * @param {string} args.invoiceNumber         Already allocated number.
 * @param {Date}   args.invoiceDate
 * @param {Object} args.seller                Seller snapshot (from getSellerContext).
 * @param {Object} args.buyer                 Buyer snapshot (from buildBuyerContext).
 * @param {Object} args.amounts               { basePaise, gstPaise, gstRate, totalPaise }
 * @param {Object} args.payment               { provider, orderId, paymentId, capturedAt }
 * @param {Object} [args.lineItem]            { description, sac, quantity }
 * @returns {Promise<{ success: boolean, invoiceId?: string, skipped?: boolean, error?: string }>}
 */
async function writeInvoiceRow({
  source,
  sourceTx,
  business,
  invoiceNumber,
  invoiceDate,
  seller,
  buyer,
  amounts,
  payment,
  lineItem,
} = {}) {
  try {
    if (!source || (source !== 'wallet' && source !== 'plan')) {
      throw new Error(`invoice-ledger: invalid source "${source}"`);
    }
    if (!sourceTx?._id) throw new Error('invoice-ledger: sourceTx._id required');
    if (!invoiceNumber) throw new Error('invoice-ledger: invoiceNumber required');

    const Invoice = await getInvoiceModel();

    const basePaise = toPaise(amounts?.basePaise);
    const gstPaise = toPaise(amounts?.gstPaise);
    const gstRate = Number(amounts?.gstRate) || 0;
    const totalPaise = toPaise(amounts?.totalPaise) || basePaise + gstPaise;

    const dateObj = invoiceDate instanceof Date ? invoiceDate : new Date(invoiceDate || Date.now());

    const buyerGstin = safeStr(buyer?.gstin);
    const buyerType = buyerGstin ? 'B2B' : 'B2C';
    const placeOfSupply = safeStr(buyer?.state) || safeStr(seller?.state) || '';

    const split = splitGst({
      gstPaise,
      gstRate,
      sellerState: seller?.stateCode || seller?.state,
      buyerState: buyer?.stateCode || buyer?.state,
    });

    const doc = {
      invoiceNumber,
      invoiceDate: dateObj,
      fiscalYear: fiscalYearLabel(dateObj),
      filingPeriod: filingPeriodLabel(dateObj),
      source,
      sourceRef: sourceTx._id,
      businessId: business?._id || sourceTx.businessId,
      seller: {
        name: safeStr(seller?.name),
        gstin: safeStr(seller?.gstin),
        state: safeStr(seller?.state),
        stateCode: safeStr(seller?.stateCode),
        address: Array.isArray(seller?.addressLines)
          ? seller.addressLines.join('\n')
          : safeStr(seller?.address),
        email: safeStr(seller?.email),
        phone: safeStr(seller?.phone),
      },
      buyer: {
        name: safeStr(buyer?.name),
        gstin: buyerGstin,
        state: safeStr(buyer?.state),
        stateCode: safeStr(buyer?.stateCode),
        address: Array.isArray(buyer?.addressLines)
          ? buyer.addressLines.join('\n')
          : safeStr(buyer?.address),
        email: safeStr(buyer?.email),
        phone: safeStr(buyer?.phone),
        type: buyerType,
      },
      taxableValuePaise: basePaise,
      cgstPaise: split.cgstPaise,
      sgstPaise: split.sgstPaise,
      igstPaise: split.igstPaise,
      totalTaxPaise: split.cgstPaise + split.sgstPaise + split.igstPaise,
      grandTotalPaise: totalPaise,
      gstRate,
      placeOfSupply,
      intraState: split.intraState,
      lineItems: [
        {
          description: safeStr(lineItem?.description) ||
            (source === 'wallet'
              ? 'Wallet recharge — prepaid messaging credits'
              : 'Plan subscription'),
          sac: safeStr(lineItem?.sac) || DEFAULT_SAC,
          hsn: '',
          quantity: Number(lineItem?.quantity) || 1,
          unitPricePaise: basePaise,
          amountPaise: basePaise,
        },
      ],
      payment: {
        provider: mapProvider(payment?.provider),
        providerOrderId: safeStr(payment?.orderId) || null,
        providerPaymentId: safeStr(payment?.paymentId) || null,
        capturedAt: payment?.capturedAt
          ? new Date(payment.capturedAt)
          : dateObj,
      },
      createdBy: 'system',
    };

    const updated = await Invoice.findOneAndUpdate(
      { source, sourceRef: sourceTx._id },
      {
        $setOnInsert: {
          ...doc,
          status: 'generated',
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return { success: true, invoiceId: String(updated?._id) };
  } catch (err) {
    // Ledger writes must never break the payment flow — log and return.
    logger.error('[invoice-ledger] writeInvoiceRow failed:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Throws if the period containing `date` has a finalised GstFiling row.
 * Call this before any code path that would mutate an existing Invoice.
 *
 * @param {Date|string|number} date
 * @returns {Promise<void>}
 */
async function assertPeriodEditable(date) {
  const period = filingPeriodLabel(date);
  const GstFiling = await getGstFilingModel();
  const existing = await GstFiling.findOne({
    period,
    reopenedAt: null,
  }).lean();
  if (existing) {
    const err = new Error(
      `GST return for ${period} has already been filed on ${new Date(
        existing.filedAt
      ).toISOString().slice(0, 10)} — the period is locked and cannot be modified.`
    );
    err.code = 'PERIOD_LOCKED';
    throw err;
  }
}

module.exports = {
  writeInvoiceRow,
  assertPeriodEditable,
  // Exposed for the backfill script and tests.
  _internal: {
    fiscalYearLabel,
    filingPeriodLabel,
    splitGst,
    mapProvider,
  },
};
