'use strict';

const mongoose = require('mongoose');

const websiteGallerySchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    title: { type: String, default: '' },
    imageUrl: { type: String, required: true },
    alt: { type: String, default: '' },
    displayOrder: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

websiteGallerySchema.index({ branchId: 1, isPublic: 1, displayOrder: 1 });

module.exports = {
  schema: websiteGallerySchema,
  model: mongoose.models.WebsiteGallery || mongoose.model('WebsiteGallery', websiteGallerySchema),
};
