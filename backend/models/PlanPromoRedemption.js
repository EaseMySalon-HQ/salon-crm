'use strict';

const mongoose = require('mongoose');

const planPromoRedemptionSchema = new mongoose.Schema(
  {
    promoCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlanPromoCode',
      required: true,
      index: true,
    },
    code: { type: String, required: true, uppercase: true, trim: true },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    planId: {
      type: String,
      enum: ['starter', 'growth', 'pro'],
      required: true,
    },
    billingPeriod: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: true,
    },
    discountPaise: { type: Number, required: true, min: 0 },
    planInvoiceTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlanInvoiceTransaction',
      default: null,
    },
    redeemedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

planPromoRedemptionSchema.index({ promoCodeId: 1, businessId: 1 }, { unique: true });

module.exports = {
  schema: planPromoRedemptionSchema,
  model:
    mongoose.models.PlanPromoRedemption ||
    mongoose.model('PlanPromoRedemption', planPromoRedemptionSchema),
};
