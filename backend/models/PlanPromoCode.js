'use strict';

const mongoose = require('mongoose');

const planPromoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: { type: String, default: '' },
    discountType: {
      type: String,
      enum: ['percent', 'fixed'],
      required: true,
    },
    /** Percent (0–100) or fixed discount in rupees. */
    discountValue: { type: Number, required: true, min: 0 },
    /** Empty = all plans. */
    planIds: {
      type: [{ type: String, enum: ['starter', 'growth', 'pro'] }],
      default: [],
    },
    /** Empty = all billing periods. */
    billingPeriods: {
      type: [{ type: String, enum: ['monthly', 'yearly'] }],
      default: [],
    },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    maxRedemptions: { type: Number, default: null, min: 1 },
    redemptionCount: { type: Number, default: 0, min: 0 },
    onePerBusiness: { type: Boolean, default: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = {
  schema: planPromoCodeSchema,
  model:
    mongoose.models.PlanPromoCode ||
    mongoose.model('PlanPromoCode', planPromoCodeSchema),
};
