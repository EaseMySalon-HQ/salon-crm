const mongoose = require('mongoose');

/**
 * Reward points ledger — append-only audit trail per branch.
 * `points` is signed: positive credits (earn, bonus, reversal of redeem), negative debits (redeem, reversal of earn).
 */
const pointsLedgerSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: ['earn', 'redeem', 'expire', 'adjust'],
      required: true,
      index: true,
    },
    /** Signed point delta */
    points: { type: Number, required: true },
    source: {
      type: String,
      enum: ['bill', 'manual', 'bonus', 'system'],
      required: true,
      default: 'bill',
    },
    /** Sale this row relates to (earn/redeem/reversal) */
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      default: null,
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    balanceAfter: { type: Number, required: true, min: 0 },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

pointsLedgerSchema.index({ branchId: 1, clientId: 1, createdAt: -1 });
pointsLedgerSchema.index({ branchId: 1, createdAt: -1 });
/** At most one earn row per completed sale (idempotent processing) */
pointsLedgerSchema.index(
  { branchId: 1, saleId: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'earn', saleId: { $exists: true, $ne: null } },
  }
);

module.exports = {
  schema: pointsLedgerSchema,
  model: mongoose.model('PointsLedger', pointsLedgerSchema),
};
