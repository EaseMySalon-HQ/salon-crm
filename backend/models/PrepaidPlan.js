const mongoose = require('mongoose');

const prepaidPlanSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    payAmount: { type: Number, required: true, min: 0 },
    creditAmount: { type: Number, required: true, min: 0 },
    validityDays: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['active', 'paused', 'archived'],
      default: 'active',
      index: true,
    },
    maxPerClient: { type: Number, default: null },
    allowCouponStacking: { type: Boolean, default: false },
    /** Empty array = all branches can sell; otherwise restricted to these branches */
    branchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Business' }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

prepaidPlanSchema.index({ branchId: 1, status: 1 });
prepaidPlanSchema.index({ branchId: 1, name: 1 });

module.exports = {
  schema: prepaidPlanSchema,
  model: mongoose.model('PrepaidPlan', prepaidPlanSchema),
};
