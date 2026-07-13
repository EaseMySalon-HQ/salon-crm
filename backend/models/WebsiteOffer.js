'use strict';

const mongoose = require('mongoose');

const websiteOfferSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    shortDescription: { type: String, default: '', maxlength: 500 },
    imageUrl: { type: String, default: '' },
    ctaLabel: { type: String, default: 'Learn more' },
    ctaHref: { type: String, default: '' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    isPublic: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

websiteOfferSchema.index({ branchId: 1, isPublic: 1, displayOrder: 1 });

module.exports = {
  schema: websiteOfferSchema,
  model: mongoose.models.WebsiteOffer || mongoose.model('WebsiteOffer', websiteOfferSchema),
};
