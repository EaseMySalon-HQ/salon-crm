const mongoose = require('mongoose');

const clientWalletSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PrepaidPlan',
      required: true,
    },
    planSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    paidAmount: { type: Number, required: true, min: 0 },
    creditedBalance: { type: Number, required: true, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    purchasedAt: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true },
    gracePeriodDays: { type: Number, default: 0, min: 0 },
    effectiveExpiryDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['active', 'expired', 'exhausted', 'cancelled'],
      default: 'active',
      index: true,
    },
    issuedBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      default: null,
    },
    /** Reminder thresholds already sent: e.g. [30, 15, 7] */
    notifiedDays: { type: [Number], default: [] },
  },
  { timestamps: true }
);

clientWalletSchema.index({ branchId: 1, clientId: 1, status: 1 });
clientWalletSchema.index({ branchId: 1, status: 1, effectiveExpiryDate: 1 });

module.exports = {
  schema: clientWalletSchema,
  model: mongoose.model('ClientWallet', clientWalletSchema),
};
