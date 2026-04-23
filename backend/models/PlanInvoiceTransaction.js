/**
 * Audit + billing ledger for plan-subscription payments (self-service
 * checkout from Settings → Plan & Billing).
 *
 * Distinct from `WalletTransaction` so the two money-flow surfaces stay
 * cleanly separated. One row is written per *successful* payment capture
 * (renewal, upgrade, or plan change). Scheduled downgrades do NOT write a
 * row — they simply flip `Business.plan.pending*` fields.
 */

'use strict';

const mongoose = require('mongoose');

const planInvoiceTransactionSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    // 'renewal' = same plan, extend renewal date
    // 'upgrade'  = higher-tier plan, immediate switch + extend
    // 'change'   = same-tier plan swap (rare; treated like upgrade)
    // 'new'      = fresh subscription (no prior paid plan)
    kind: {
      type: String,
      enum: ['renewal', 'upgrade', 'change', 'new'],
      required: true,
      index: true,
    },
    planId: {
      type: String,
      enum: ['starter', 'professional', 'enterprise'],
      required: true,
    },
    billingPeriod: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: true,
    },
    // Pre-GST list price for the selected period (in paise).
    amountPaise: { type: Number, required: true, min: 0 },
    gstPaise: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, default: 0, min: 0 },
    totalChargedPaise: { type: Number, default: 0, min: 0 },

    // GST tax-invoice number emitted for this payment.
    invoiceNumber: { type: String, default: null, index: true },

    provider: {
      type: String,
      enum: ['razorpay', 'stripe', 'zoho', 'system'],
      required: true,
      index: true,
    },
    providerOrderId: { type: String, default: null, index: true },
    providerPaymentId: { type: String, default: null, index: true },

    description: { type: String, default: null },

    // Renewal-date bookkeeping — snapshot at payment time, for audit.
    previousRenewalDate: { type: Date, default: null },
    newRenewalDate: { type: Date, default: null },
    previousPlanId: { type: String, default: null },
    previousBillingPeriod: { type: String, default: null },

    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

planInvoiceTransactionSchema.index({ businessId: 1, timestamp: -1 });
planInvoiceTransactionSchema.index(
  { businessId: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } }
);

module.exports = mongoose.model(
  'PlanInvoiceTransaction',
  planInvoiceTransactionSchema
);
