const mongoose = require('mongoose');

const clientWalletTransactionSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientWallet',
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit', 'adjustment', 'refund_credit'],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    description: { type: String, default: '' },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      default: null,
    },
    serviceNames: [{ type: String }],
  },
  { timestamps: true }
);

clientWalletTransactionSchema.index({ branchId: 1, createdAt: -1 });
clientWalletTransactionSchema.index({ walletId: 1, createdAt: -1 });
clientWalletTransactionSchema.index({ clientId: 1, createdAt: -1 });

module.exports = {
  schema: clientWalletTransactionSchema,
  model: mongoose.model('ClientWalletTransaction', clientWalletTransactionSchema),
};
