/**
 * Wallet-invoice sender.
 *
 * Entry point: `sendWalletRechargeInvoice({ transactionId })`.
 *
 * Loads the WalletTransaction + Business (+ optionally the admin user who
 * triggered the recharge), assembles a tax-invoice context, generates a PDF
 * via `utils/wallet-invoice-pdf`, emails it via the shared EmailService, and
 * stamps the emitted `invoiceNumber` onto the transaction.
 *
 * Designed to be called fire-and-forget from the recharge verify route —
 * errors are logged but never thrown back.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const emailService = require('../services/email-service');
const { generateWalletInvoicePDF } = require('../utils/wallet-invoice-pdf');
const { writeInvoiceRow } = require('./invoice-ledger');

// ──────────────────────────────────────────────────────────────────────────
// Seller defaults — come from env vars so deploys can customise without code
// changes. These are intentionally permissive (blank when unset) so a fresh
// install does not emit a fake GSTIN.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Load `invoice` sub-document from AdminSettings, falling back to env vars
 * field-by-field. Anything the admin hasn't configured yet keeps reading
 * from `INVOICE_SELLER_*` so existing deploys keep working.
 */
async function loadInvoiceSettings() {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const AdminSettings = mainConnection.model(
      'AdminSettings',
      require('../models/AdminSettings').schema
    );
    const doc = await AdminSettings.getSettings();
    return doc?.toObject?.()?.invoice || doc?.invoice || {};
  } catch (err) {
    logger.warn(
      '[wallet-invoice] Could not load AdminSettings.invoice, using env only:',
      err?.message || err
    );
    return {};
  }
}

function firstNonEmpty(...values) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

async function getSellerContext() {
  const invoiceSettings = await loadInvoiceSettings();
  const seller = invoiceSettings.seller || {};

  const addressRaw = firstNonEmpty(
    seller.address,
    process.env.INVOICE_SELLER_ADDRESS
  );

  return {
    name: firstNonEmpty(seller.name, process.env.INVOICE_SELLER_NAME) || 'EaseMySalon',
    addressLines: addressRaw
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean),
    gstin: firstNonEmpty(seller.gstin, process.env.INVOICE_SELLER_GSTIN),
    stateCode: firstNonEmpty(seller.stateCode, process.env.INVOICE_SELLER_STATE_CODE),
    state: firstNonEmpty(seller.state, process.env.INVOICE_SELLER_STATE),
    email: firstNonEmpty(
      seller.email,
      process.env.INVOICE_SELLER_EMAIL,
      process.env.EMAIL_REPLY_TO
    ),
    phone: firstNonEmpty(seller.phone, process.env.INVOICE_SELLER_PHONE),
    website: firstNonEmpty(seller.website, process.env.INVOICE_SELLER_WEBSITE),
  };
}

async function getInvoicePrefix() {
  const invoiceSettings = await loadInvoiceSettings();
  return (
    firstNonEmpty(invoiceSettings.invoicePrefix, process.env.INVOICE_PREFIX) ||
    'EMS/WLT'
  );
}

function buildBuyerContext(business) {
  const addr = business?.address || {};
  const addressLines = [
    addr.street,
    [addr.city, addr.zipCode].filter(Boolean).join(' - '),
    [addr.state, addr.country || 'India'].filter(Boolean).join(', '),
  ]
    .map(s => (s || '').trim())
    .filter(Boolean);

  return {
    name: business?.name || '',
    addressLines,
    gstin: business?.settings?.gstNumber || '',
    state: addr.state || '',
    // We store human-readable state strings, not numeric codes — compare
    // by (case-insensitive) state name. The PDF generator handles this.
    stateCode: addr.state || '',
    email: business?.contact?.email || '',
    phone: business?.contact?.phone || '',
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Invoice number
// ──────────────────────────────────────────────────────────────────────────

/**
 * Indian fiscal year runs Apr 1 → Mar 31. A date in Apr–Dec belongs to
 * `YYYY-(YY+1)`, a date in Jan–Mar belongs to `(YYYY-1)-YY`.
 * Returns `{ key, label }` — `key` is the counter key (used in the DB),
 * `label` is what appears in the invoice number.
 *
 * `counterScope` keeps different billing surfaces on independent sequences —
 * `WLT/` for wallet recharges, `SUB/` for plan subscriptions, etc.
 */
function fiscalYearContext(date, counterScope = 'WLT') {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan
  const fyStart = month >= 3 ? year : year - 1; // Apr–Dec start this year
  const fyEnd = fyStart + 1;
  const label = `${fyStart}-${String(fyEnd).slice(-2)}`;
  const scope = String(counterScope || 'WLT').replace(/[^A-Za-z0-9_-]+/g, '');
  return { key: `${scope || 'WLT'}/${label}`, label };
}

function sanitizePrefix(prefix) {
  return String(prefix || 'EMS/WLT')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^A-Za-z0-9/_-]+/g, '-') || 'EMS/WLT';
}

function formatInvoiceNumber({ prefix, fiscalLabel, seq }) {
  const padded = String(seq).padStart(5, '0');
  return `${sanitizePrefix(prefix)}/${fiscalLabel}/${padded}`;
}

/**
 * Fallback invoice number used only when the DB counter is unreachable.
 * Keeps a deterministic-from-ObjectId format so the caller still gets a
 * unique string — the UI stays functional even if Mongo briefly flakes.
 */
function fallbackInvoiceNumber(transaction, prefix) {
  const d = transaction?.timestamp
    ? new Date(transaction.timestamp)
    : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const idSuffix = String(transaction?._id || '').slice(-8).toUpperCase();
  return `${sanitizePrefix(prefix)}/${yyyy}${mm}/${idSuffix || Date.now().toString(36).toUpperCase()}`;
}

/**
 * Atomically allocate the next sequence number for the transaction's fiscal
 * year and format it. Uses `findOneAndUpdate({ upsert, $inc })` so concurrent
 * recharges never collide.
 */
async function allocateInvoiceNumber(txDoc) {
  const prefix = await getInvoicePrefix();
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const InvoiceCounter = mainConnection.model(
      'InvoiceCounter',
      require('../models/InvoiceCounter').schema
    );
    const { key, label } = fiscalYearContext(txDoc?.timestamp);
    const updated = await InvoiceCounter.findOneAndUpdate(
      { key },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    const seq = Number(updated?.seq || 1);
    return formatInvoiceNumber({ prefix, fiscalLabel: label, seq });
  } catch (err) {
    logger.warn(
      '[wallet-invoice] Counter allocation failed, using fallback:',
      err?.message || err
    );
    return fallbackInvoiceNumber(txDoc, prefix);
  }
}

/**
 * Return the invoice number for a transaction, allocating + persisting one
 * if it isn't set yet. Idempotent — subsequent calls return the existing
 * number without bumping the counter.
 */
async function getOrAllocateInvoiceNumber(txDoc) {
  if (!txDoc) return null;
  if (txDoc.invoiceNumber) return txDoc.invoiceNumber;

  const number = await allocateInvoiceNumber(txDoc);
  txDoc.invoiceNumber = number;
  try {
    await txDoc.save();
  } catch (persistErr) {
    logger.warn(
      `[wallet-invoice] Could not persist invoiceNumber on transaction ${txDoc._id}:`,
      persistErr?.message || persistErr
    );
  }
  return number;
}

// ──────────────────────────────────────────────────────────────────────────
// Email body (simple, self-contained HTML — no dependency on templates.js)
// ──────────────────────────────────────────────────────────────────────────

function formatRupeesINR(paise) {
  const value = Math.round(Number(paise) || 0) / 100;
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildEmailBody({ buyer, invoice, amounts, payment }) {
  const greetingName = (buyer.name || '').split(' ')[0] || 'there';
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f172a;">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;font-size:18px;">Your wallet has been recharged 🎉</h2>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;padding:22px;border-radius:0 0 8px 8px;">
      <p>Hi ${greetingName},</p>
      <p>We've received your wallet recharge payment. A GST tax invoice is attached to this email for your records.</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0;">
        <tr>
          <td style="padding:8px 0;color:#64748b;">Wallet credit</td>
          <td style="padding:8px 0;text-align:right;font-weight:600;">${formatRupeesINR(amounts.basePaise)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;">GST (${(
            (amounts.gstRate || 0) * 100
          ).toFixed(0)}%)</td>
          <td style="padding:8px 0;text-align:right;">${formatRupeesINR(amounts.gstPaise)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-top:1px solid #e2e8f0;font-weight:700;">Total charged</td>
          <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;font-weight:700;">${formatRupeesINR(amounts.totalPaise)}</td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#334155;">
        <tr><td style="padding:4px 0;width:140px;color:#64748b;">Invoice #</td><td>${invoice.number}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;">Payment provider</td><td>${String(payment.provider || '').toUpperCase()}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;">Payment ID</td><td>${payment.paymentId || '—'}</td></tr>
      </table>
      <p style="margin-top:22px;">Thanks for using EaseMySalon.</p>
      <p style="color:#64748b;font-size:12px;margin-top:26px;">
        If you didn't initiate this recharge, please reply to this email right away.
      </p>
    </div>
  </div>`;

  const text = [
    `Your wallet has been recharged.`,
    ``,
    `Wallet credit: ${formatRupeesINR(amounts.basePaise)}`,
    `GST (${((amounts.gstRate || 0) * 100).toFixed(0)}%): ${formatRupeesINR(amounts.gstPaise)}`,
    `Total charged: ${formatRupeesINR(amounts.totalPaise)}`,
    ``,
    `Invoice #: ${invoice.number}`,
    `Payment provider: ${String(payment.provider || '').toUpperCase()}`,
    `Payment ID: ${payment.paymentId || '—'}`,
    ``,
    `A GST tax invoice PDF is attached.`,
    ``,
    `— EaseMySalon`,
  ].join('\n');

  return { html, text };
}

// ──────────────────────────────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────────────────────────────

/**
 * Generate and email the wallet-recharge invoice for a given transaction.
 * Errors are logged but never thrown — this is always safe to await/fire.
 *
 * @param {Object} opts
 * @param {string|ObjectId} opts.transactionId - WalletTransaction _id (credit row).
 * @param {string} [opts.triggeredByEmail] - Optional second recipient (the
 *   logged-in user who initiated the recharge, if different from the
 *   business contact email).
 * @returns {Promise<{ success: boolean, invoiceNumber?: string, error?: string }>}
 */
/**
 * Load a wallet-transaction + business, ensure an invoice number exists,
 * and render the PDF. Shared by the email orchestrator and the
 * user-facing download endpoint.
 *
 * @param {Object} opts
 * @param {string|ObjectId} opts.transactionId
 * @param {string|ObjectId} [opts.businessIdScope] - If provided, the
 *   transaction must belong to this business (used for authz on downloads).
 * @returns {Promise<{
 *   pdfBuffer: Buffer,
 *   invoiceNumber: string,
 *   context: object,
 *   txDoc: object,
 *   business: object,
 * }>}
 */
async function buildInvoicePDFForTransaction({
  transactionId,
  businessIdScope,
} = {}) {
  if (!transactionId) {
    throw new Error('transactionId is required');
  }

  const mainConnection = await databaseManager.getMainConnection();
  const WalletTransaction = mainConnection.model(
    'WalletTransaction',
    require('../models/WalletTransaction').schema
  );
  const Business = mainConnection.model(
    'Business',
    require('../models/Business').schema
  );

  const txDoc = await WalletTransaction.findById(transactionId);
  if (!txDoc) {
    const err = new Error('Transaction not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (txDoc.type !== 'credit') {
    const err = new Error('Invoice is only generated for credit transactions');
    err.code = 'INVALID_TYPE';
    throw err;
  }
  if (
    businessIdScope &&
    String(txDoc.businessId) !== String(businessIdScope)
  ) {
    const err = new Error('Transaction does not belong to this business');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const business = await Business.findById(txDoc.businessId).lean();
  if (!business) {
    const err = new Error('Business not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const invoiceNumber = await getOrAllocateInvoiceNumber(txDoc);

  const basePaise = Number(txDoc.amountPaise || 0);
  const gstPaise = Number(txDoc.gstPaise || 0);
  const gstRate = Number(txDoc.gstRate || 0);
  const totalPaise =
    Number(txDoc.totalChargedPaise || 0) || basePaise + gstPaise;

  const seller = await getSellerContext();
  const buyer = buildBuyerContext(business);

  const context = {
    seller,
    buyer,
    invoice: {
      number: invoiceNumber,
      date: txDoc.timestamp || new Date(),
      placeOfSupply: buyer.state || null,
    },
    amounts: { basePaise, gstPaise, gstRate, totalPaise },
    payment: {
      provider: txDoc.provider,
      orderId: txDoc.providerOrderId,
      paymentId: txDoc.providerPaymentId,
      capturedAt: txDoc.timestamp || new Date(),
    },
  };

  const pdfBuffer = await generateWalletInvoicePDF(context);

  // Persist the statutory invoice row (idempotent — safe on re-download).
  // Failures here never break the response; they're logged internally.
  try {
    await writeInvoiceRow({
      source: 'wallet',
      sourceTx: txDoc,
      business,
      invoiceNumber,
      invoiceDate: context.invoice.date,
      seller,
      buyer,
      amounts: context.amounts,
      payment: context.payment,
      lineItem: {
        description: 'Wallet recharge — prepaid messaging credits',
      },
    });
  } catch (ledgerErr) {
    logger.warn(
      '[wallet-invoice] invoice-ledger write failed (non-fatal):',
      ledgerErr?.message || ledgerErr
    );
  }

  return { pdfBuffer, invoiceNumber, context, txDoc, business };
}

async function sendWalletRechargeInvoice({ transactionId, triggeredByEmail } = {}) {
  try {
    let built;
    try {
      built = await buildInvoicePDFForTransaction({ transactionId });
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
    const { pdfBuffer, invoiceNumber, context, business } = built;

    const recipients = Array.from(
      new Set(
        [business?.contact?.email, triggeredByEmail]
          .map(s => (s || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );

    if (recipients.length === 0) {
      logger.warn(
        `[wallet-invoice] No recipient email on business ${business._id} — skipping email (PDF generated).`
      );
    } else {
      try {
        await emailService.initialize();
      } catch (initErr) {
        logger.warn(
          '[wallet-invoice] Email service initialize failed, attempting send anyway:',
          initErr?.message || initErr
        );
      }

      if (!emailService.enabled) {
        logger.warn(
          `[wallet-invoice] Email service not configured — skipping send for invoice ${invoiceNumber}.`
        );
      } else {
        const { html, text } = buildEmailBody(context);
        const subject = `Tax Invoice ${invoiceNumber} — Wallet recharge`;

        const result = await emailService.sendEmail({
          to: recipients,
          subject,
          html,
          text,
          attachments: [
            {
              filename: `${invoiceNumber.replace(/[^A-Za-z0-9_-]+/g, '_')}.pdf`,
              content: pdfBuffer,
            },
          ],
        });

        if (!result?.success) {
          logger.error(
            `[wallet-invoice] Email send failed for invoice ${invoiceNumber}:`,
            result?.error
          );
        } else {
          logger.info(
            `[wallet-invoice] Invoice ${invoiceNumber} emailed to ${recipients.join(', ')}`
          );
        }
      }
    }

    return { success: true, invoiceNumber };
  } catch (err) {
    logger.error(
      '[wallet-invoice] Unexpected error while sending recharge invoice:',
      err?.message || err
    );
    return { success: false, error: err?.message || String(err) };
  }
}

module.exports = {
  sendWalletRechargeInvoice,
  buildInvoicePDFForTransaction,
  getOrAllocateInvoiceNumber,
  // Shared helpers re-used by sibling orchestrators (plan invoices, etc.)
  // so the seller-context / FY-counter logic stays in one place.
  _shared: {
    getSellerContext,
    buildBuyerContext,
    getInvoicePrefix,
    fiscalYearContext,
    sanitizePrefix,
    formatInvoiceNumber,
    fallbackInvoiceNumber,
  },
};
