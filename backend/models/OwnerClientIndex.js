const mongoose = require('mongoose');

/** Cross-branch client index keyed by owner + phone (main DB). */
const ownerClientIndexSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    phone: { type: String, required: true },
    homeBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    branchVisits: { type: mongoose.Schema.Types.Mixed, default: {} },
    totalVisits: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastVisit: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ownerClientIndexSchema.index({ ownerId: 1, phone: 1 }, { unique: true });

module.exports = {
  schema: ownerClientIndexSchema,
  model: mongoose.model('OwnerClientIndex', ownerClientIndexSchema),
};
