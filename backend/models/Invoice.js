/**
 * Unified tax-invoice ledger for EaseMySalon's own SaaS revenue
 * (wallet recharges + plan subscriptions).
 *
 * This is the single source of truth for GST reporting, exports, and the
 * monthly filing lock. The underlying payment rows still live in
 * `WalletTransaction` (credit rows) and `PlanInvoiceTransaction` — those
 * collections own the money event; `Invoice` owns the statutory record.
 *
 * One row per issued invoice number. Idempotency is enforced by the
 * `(source, sourceRef)` unique partial index so the writer can be retried
 * safely (e.g. PDF regenerated on download does NOT create duplicates).
 *
 * Once an invoice's `status` transitions to `"filed"` it becomes
 * effectively immutable — the `pre('save')` and `pre('findOneAndUpdate')`
 * hooks reject further mutation.
 */

'use strict';

const mongoose = require('mongoose');

const sellerSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' },
    stateCode: { type: String, default: '' },
    address: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  { _id: false }
);

const buyerSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    gstin: { type: String, default: '' },
    state: { type: String, default: '' },
    stateCode: { type: String, default: '' },
    address: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    type: {
      type: String,
      enum: ['B2B', 'B2C'],
      required: true,
      default: 'B2C',
    },
  },
  { _id: false }
);

const lineItemSchema = new mongoose.Schema(
  {
    description: { type: String, default: '' },
    sac: { type: String, default: '' },
    hsn: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    unitPricePaise: { type: Number, default: 0 },
    amountPaise: { type: Number, default: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    // Sequential per-scope invoice number, reused from InvoiceCounter.
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    invoiceDate: { type: Date, required: true, index: true },

    // Derived on write — kept as plain strings so indexed range queries and
    // "filter by period" dropdowns are trivial. Format: "2025-26", "2026-03".
    fiscalYear: { type: String, required: true, index: true },
    filingPeriod: { type: String, required: true, index: true }, // YYYY-MM

    // Which money surface produced this invoice.
    source: {
      type: String,
      enum: ['wallet', 'plan'],
      required: true,
      index: true,
    },
    // Pointer back to the underlying WalletTransaction / PlanInvoiceTransaction.
    sourceRef: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },

    seller: { type: sellerSnapshotSchema, default: () => ({}) },
    buyer: { type: buyerSnapshotSchema, default: () => ({}) },

    // Money (paise) — all stored as integers to avoid float drift.
    taxableValuePaise: { type: Number, required: true, min: 0 },
    cgstPaise: { type: Number, default: 0, min: 0 },
    sgstPaise: { type: Number, default: 0, min: 0 },
    igstPaise: { type: Number, default: 0, min: 0 },
    totalTaxPaise: { type: Number, default: 0, min: 0 },
    grandTotalPaise: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 0, min: 0 }, // 0.18 for 18%

    placeOfSupply: { type: String, default: '' },
    intraState: { type: Boolean, default: false },

    lineItems: { type: [lineItemSchema], default: [] },

    payment: {
      provider: {
        type: String,
        enum: ['razorpay', 'stripe', 'zoho', 'system', null],
        default: null,
      },
      providerOrderId: { type: String, default: null },
      providerPaymentId: { type: String, default: null },
      capturedAt: { type: Date, default: null },
    },

    // Lifecycle — stays `generated` until admin marks the period as filed.
    status: {
      type: String,
      enum: ['generated', 'reported', 'filed'],
      default: 'generated',
      index: true,
    },
    filingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GstFiling',
      default: null,
      index: true,
    },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null },

    createdBy: { type: String, default: 'system' },
  },
  { timestamps: true }
);

invoiceSchema.index({ filingPeriod: 1, status: 1 });
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ businessId: 1, invoiceDate: -1 });
invoiceSchema.index(
  { source: 1, sourceRef: 1 },
  { unique: true, name: 'invoice_source_sourceRef_unique' }
);
invoiceSchema.index(
  { 'buyer.gstin': 1 },
  { sparse: true, name: 'invoice_buyer_gstin' }
);

/**
 * Guard: once an invoice is filed it is immutable. The only field allowed
 * to mutate afterwards is the `status` → legal reopen (via `reopen` route).
 */
invoiceSchema.pre('save', function preventFiledMutation(next) {
  if (!this.isNew && this.isModified()) {
    // Allow the lock itself (status going to/from "filed" is how filings work).
    const modified = this.modifiedPaths();
    const onlyLifecycle = modified.every(path =>
      ['status', 'filingId', 'lockedAt', 'lockedBy', 'updatedAt'].includes(path)
    );
    // If already filed and someone is touching non-lifecycle fields, block.
    if (this._original?.status === 'filed' && !onlyLifecycle) {
      return next(new Error('Invoice is filed and cannot be modified'));
    }
  }
  next();
});

invoiceSchema.pre('findOneAndUpdate', async function preventFiledMutation(next) {
  try {
    const existing = await this.model.findOne(this.getQuery()).lean();
    if (!existing) return next();
    if (existing.status !== 'filed') return next();

    const update = this.getUpdate() || {};
    const $set = update.$set || {};
    const flat = { ...update, ...$set };
    delete flat.$set;
    delete flat.$setOnInsert;
    delete flat.$inc;

    const touched = Object.keys(flat);
    const allowed = new Set([
      'status',
      'filingId',
      'lockedAt',
      'lockedBy',
      'updatedAt',
    ]);
    const illegal = touched.filter(k => !allowed.has(k));
    if (illegal.length > 0) {
      return next(
        new Error(
          `Invoice is filed and cannot be modified (blocked fields: ${illegal.join(
            ', '
          )})`
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

invoiceSchema.post('init', function capturePriorStatus() {
  this._original = { status: this.status };
});

module.exports = mongoose.model('Invoice', invoiceSchema);
