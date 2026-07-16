const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true,
    index: true
  },
  amountPaise: {
    type: Number,
    required: true,
    min: 0
  },
  // GST metadata — populated only for `credit` rows where GST was charged at
  // recharge time. `amountPaise` remains the wallet-credited (net) amount;
  // `totalChargedPaise` is what the payment gateway actually captured.
  gstPaise: {
    type: Number,
    default: 0,
    min: 0
  },
  gstRate: {
    type: Number, // e.g. 0.18 for 18% GST
    default: 0,
    min: 0
  },
  totalChargedPaise: {
    type: Number,
    default: 0,
    min: 0
  },
  // GST tax-invoice number emitted for this recharge (null for debits / legacy rows).
  invoiceNumber: {
    type: String,
    default: null,
    index: true
  },
  /** When false, no GST tax invoice is generated (e.g. platform admin credits). */
  taxInvoiceEligible: {
    type: Boolean,
    default: true,
  },
  channel: {
    type: String,
    enum: ['sms', 'whatsapp', null],
    default: null,
    index: true
  },
  messageCategory: {
    type: String,
    // 'promotional'/'transactional' kept for legacy MSG91 rows; new
    // Meta-priced rows use the per-message Meta categories.
    enum: ['promotional', 'transactional', 'marketing', 'utility', 'authentication', 'service', null],
    default: null
  },
  provider: {
    type: String,
    enum: ['razorpay', 'stripe', 'zoho', 'system', 'meta', 'msg91', 'gupshup'],
    default: 'system',
    index: true
  },
  freeWindow: {
    type: Boolean,
    default: false
  },
  priceListVersion: {
    type: String,
    default: null
  },
  providerOrderId: {
    type: String,
    default: null,
    index: true
  },
  providerPaymentId: {
    type: String,
    default: null,
    index: true
  },
  description: {
    type: String,
    default: null
  },
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  relatedEntityType: {
    type: String,
    default: null
  },
  balanceAfterPaise: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

walletTransactionSchema.index({ businessId: 1, timestamp: -1 });
walletTransactionSchema.index({ businessId: 1, type: 1, timestamp: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
