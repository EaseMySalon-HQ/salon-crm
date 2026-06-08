const mongoose = require('mongoose');

const transferRequestSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fromBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    toBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    productKey: { type: String, required: true },
    productName: { type: String, required: true },
    sku: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** Branch that created the request — counterparty approves/rejects. */
    initiatedByBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

transferRequestSchema.index({ ownerId: 1, createdAt: -1 });
transferRequestSchema.index({ ownerId: 1, toBranchId: 1, status: 1, createdAt: -1 });
transferRequestSchema.index({ ownerId: 1, fromBranchId: 1, status: 1, createdAt: -1 });

module.exports = {
  schema: transferRequestSchema,
  model: mongoose.model('TransferRequest', transferRequestSchema),
};
