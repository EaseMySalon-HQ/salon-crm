/**
 * Plan-subscription invoice sender.
 *
 * Mirrors `send-wallet-invoice.js` but for self-service plan checkouts:
 *   - loads a PlanInvoiceTransaction + Business
 *   - allocates a fiscal-year sequential invoice number on the
 *     independent `SUB/<FY>` counter
 *   - renders a GST tax invoice PDF using the shared layout util
 *   - emails the PDF to the business contact (+ the admin who paid)
 *
 * Designed to be called fire-and-forget from the checkout verify route;
 * never throws.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const emailService = require('../services/email-service');
const { generateWalletInvoicePDF } = require('../utils/wallet-invoice-pdf');
const { _shared } = require('./send-wallet-invoice');
const { writeInvoiceRow } = require('./invoice-ledger');

const {
  getSellerContext,
  buildBuyerContext,
  fiscalYearContext,
  formatInvoiceNumber,
  fallbackInvoiceNumber,
  sanitizePrefix,
} = _shared;

// Counter scope for plan subscriptions — stays independent of wallet (`WLT/`).
const COUNTER_SCOPE = 'SUB';
// Invoice-number prefix for the printed/emailed number. Admins can override
// via `INVOICE_PLAN_PREFIX`; fall back to a sibling of the wallet default.
function getPlanInvoicePrefix() {
  const raw = (process.env.INVOICE_PLAN_PREFIX || 'EMS/SUB').trim();
  return raw || 'EMS/SUB';
}

/**
 * Atomically allocate the next sequence for the transaction's fiscal year.
 * Uses the `InvoiceCounter` collection with a `SUB/<FY>` key so the wallet
 * and plan counters never collide.
 */
async function allocatePlanInvoiceNumber(txDoc) {
  const prefix = getPlanInvoicePrefix();
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const InvoiceCounter = mainConnection.model(
      'InvoiceCounter',
      require('../models/InvoiceCounter').schema
    );
    const { key, label } = fiscalYearContext(txDoc?.timestamp, COUNTER_SCOPE);
    const updated = await InvoiceCounter.findOneAndUpdate(
      { key },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    const seq = Number(updated?.seq || 1);
    return formatInvoiceNumber({ prefix, fiscalLabel: label, seq });
  } catch (err) {
    logger.warn(
      '[plan-invoice] Counter allocation failed, using fallback:',
      err?.message || err
    );
    return fallbackInvoiceNumber(txDoc, prefix);
  }
}

async function getOrAllocatePlanInvoiceNumber(txDoc) {
  if (!txDoc) return null;
  if (txDoc.invoiceNumber) return txDoc.invoiceNumber;

  const number = await allocatePlanInvoiceNumber(txDoc);
  txDoc.invoiceNumber = number;
  try {
    await txDoc.save();
  } catch (persistErr) {
    logger.warn(
      `[plan-invoice] Could not persist invoiceNumber on transaction ${txDoc._id}:`,
      persistErr?.message || persistErr
    );
  }
  return number;
}

function planLabel(planId) {
  const map = {
    starter: 'Starter',
    professional: 'Professional',
    enterprise: 'Enterprise',
  };
  return map[planId] || (planId ? String(planId) : 'Subscription');
}

function kindLabel(kind) {
  switch (kind) {
    case 'new':
      return 'New subscription';
    case 'renewal':
      return 'Renewal';
    case 'upgrade':
      return 'Upgrade';
    case 'change':
      return 'Plan change';
    default:
      return 'Subscription';
  }
}

function formatRupeesINR(paise) {
  const value = Math.round(Number(paise) || 0) / 100;
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildEmailBody({ buyer, invoice, amounts, payment, meta }) {
  const greetingName = (buyer.name || '').split(' ')[0] || 'there';
  const periodLabel = meta.billingPeriod === 'yearly' ? 'annual' : 'monthly';
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f172a;">
    <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;font-size:18px;">Your subscription is active 🎉</h2>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;padding:22px;border-radius:0 0 8px 8px;">
      <p>Hi ${greetingName},</p>
      <p>Thanks for your payment. Your ${planLabel(meta.planId)} plan (${periodLabel} billing) is now active. A GST tax invoice is attached to this email for your records.</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0;">
        <tr>
          <td style="padding:8px 0;color:#64748b;">${kindLabel(meta.kind)} — ${planLabel(meta.planId)} (${periodLabel})</td>
          <td style="padding:8px 0;text-align:right;font-weight:600;">${formatRupeesINR(amounts.basePaise)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;">GST (${((amounts.gstRate || 0) * 100).toFixed(0)}%)</td>
          <td style="padding:8px 0;text-align:right;">${formatRupeesINR(amounts.gstPaise)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-top:1px solid #e2e8f0;font-weight:700;">Total charged</td>
          <td style="padding:10px 0;border-top:1px solid #e2e8f0;text-align:right;font-weight:700;">${formatRupeesINR(amounts.totalPaise)}</td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#334155;">
        <tr><td style="padding:4px 0;width:160px;color:#64748b;">Invoice #</td><td>${invoice.number}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;">Next renewal date</td><td>${meta.newRenewalDate ? new Date(meta.newRenewalDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;">Payment provider</td><td>${String(payment.provider || '').toUpperCase()}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;">Payment ID</td><td>${payment.paymentId || '—'}</td></tr>
      </table>
      <p style="margin-top:22px;">Thanks for choosing EaseMySalon.</p>
      <p style="color:#64748b;font-size:12px;margin-top:26px;">
        If you didn't authorise this payment, please reply to this email right away.
      </p>
    </div>
  </div>`;

  const text = [
    `Your subscription is active.`,
    ``,
    `${kindLabel(meta.kind)} — ${planLabel(meta.planId)} (${periodLabel}): ${formatRupeesINR(amounts.basePaise)}`,
    `GST (${((amounts.gstRate || 0) * 100).toFixed(0)}%): ${formatRupeesINR(amounts.gstPaise)}`,
    `Total charged: ${formatRupeesINR(amounts.totalPaise)}`,
    ``,
    `Invoice #: ${invoice.number}`,
    meta.newRenewalDate ? `Next renewal: ${new Date(meta.newRenewalDate).toLocaleDateString('en-IN')}` : '',
    `Payment provider: ${String(payment.provider || '').toUpperCase()}`,
    `Payment ID: ${payment.paymentId || '—'}`,
    ``,
    `A GST tax invoice PDF is attached.`,
    ``,
    `— EaseMySalon`,
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

/**
 * Load a PlanInvoiceTransaction + business, ensure an invoice number,
 * and render the PDF. Shared between the email orchestrator and the
 * download endpoint.
 */
async function buildPlanInvoicePDFForTransaction({
  transactionId,
  businessIdScope,
} = {}) {
  if (!transactionId) {
    throw new Error('transactionId is required');
  }

  const mainConnection = await databaseManager.getMainConnection();
  const PlanInvoiceTransaction = mainConnection.model(
    'PlanInvoiceTransaction',
    require('../models/PlanInvoiceTransaction').schema
  );
  const Business = mainConnection.model(
    'Business',
    require('../models/Business').schema
  );

  const txDoc = await PlanInvoiceTransaction.findById(transactionId);
  if (!txDoc) {
    const err = new Error('Transaction not found');
    err.code = 'NOT_FOUND';
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

  const invoiceNumber = await getOrAllocatePlanInvoiceNumber(txDoc);

  const basePaise = Number(txDoc.amountPaise || 0);
  const gstPaise = Number(txDoc.gstPaise || 0);
  const gstRate = Number(txDoc.gstRate || 0);
  const totalPaise =
    Number(txDoc.totalChargedPaise || 0) || basePaise + gstPaise;

  const seller = await getSellerContext();
  const buyer = buildBuyerContext(business);

  const periodLabel = txDoc.billingPeriod === 'yearly' ? 'Annual' : 'Monthly';
  const lineItemDescription = `${kindLabel(
    txDoc.kind
  )} — ${planLabel(txDoc.planId)} plan (${periodLabel})`;

  const context = {
    seller,
    buyer,
    invoice: {
      number: invoiceNumber,
      date: txDoc.timestamp || new Date(),
      placeOfSupply: buyer.state || null,
      lineItemDescription,
      subject: lineItemDescription,
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

  try {
    await writeInvoiceRow({
      source: 'plan',
      sourceTx: txDoc,
      business,
      invoiceNumber,
      invoiceDate: context.invoice.date,
      seller,
      buyer,
      amounts: context.amounts,
      payment: context.payment,
      lineItem: {
        description: lineItemDescription,
      },
    });
  } catch (ledgerErr) {
    logger.warn(
      '[plan-invoice] invoice-ledger write failed (non-fatal):',
      ledgerErr?.message || ledgerErr
    );
  }

  return {
    pdfBuffer,
    invoiceNumber,
    context,
    txDoc,
    business,
  };
}

async function sendPlanRenewalInvoice({ transactionId, triggeredByEmail } = {}) {
  try {
    let built;
    try {
      built = await buildPlanInvoicePDFForTransaction({ transactionId });
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
    const { pdfBuffer, invoiceNumber, context, business, txDoc } = built;

    const recipients = Array.from(
      new Set(
        [business?.contact?.email, triggeredByEmail]
          .map(s => (s || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );

    if (recipients.length === 0) {
      logger.warn(
        `[plan-invoice] No recipient email on business ${business._id} — skipping email (PDF generated).`
      );
    } else {
      try {
        await emailService.initialize();
      } catch (initErr) {
        logger.warn(
          '[plan-invoice] Email service initialize failed, attempting send anyway:',
          initErr?.message || initErr
        );
      }

      if (!emailService.enabled) {
        logger.warn(
          `[plan-invoice] Email service not configured — skipping send for invoice ${invoiceNumber}.`
        );
      } else {
        const emailCtx = {
          ...context,
          meta: {
            kind: txDoc.kind,
            planId: txDoc.planId,
            billingPeriod: txDoc.billingPeriod,
            newRenewalDate: txDoc.newRenewalDate,
          },
        };
        const { html, text } = buildEmailBody(emailCtx);
        const subject = `Tax Invoice ${invoiceNumber} — ${planLabel(
          txDoc.planId
        )} subscription`;

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
            `[plan-invoice] Email send failed for invoice ${invoiceNumber}:`,
            result?.error
          );
        } else {
          logger.info(
            `[plan-invoice] Invoice ${invoiceNumber} emailed to ${recipients.join(', ')}`
          );
        }
      }
    }

    return { success: true, invoiceNumber };
  } catch (err) {
    logger.error(
      '[plan-invoice] Unexpected error while sending plan invoice:',
      err?.message || err
    );
    return { success: false, error: err?.message || String(err) };
  }
}

module.exports = {
  sendPlanRenewalInvoice,
  buildPlanInvoicePDFForTransaction,
  getOrAllocatePlanInvoiceNumber,
};

// Silence linter about unused `sanitizePrefix` import — kept available for
// future consumers that need to normalise a custom prefix.
void sanitizePrefix;
