'use strict';

const mongoose = require('mongoose');

const websiteEnquirySchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['bridal', 'package', 'membership', 'product', 'product_request', 'general'],
      default: 'general',
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, default: '', trim: true, maxlength: 320 },
    city: { type: String, default: '', trim: true, maxlength: 120 },
    message: { type: String, default: '', trim: true, maxlength: 2000 },
    relatedServiceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    relatedPackageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    relatedProductId: { type: mongoose.Schema.Types.ObjectId, default: null },
    relatedMembershipId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Multi-product purchase requests from the public mini-site cart. */
    requestedProducts: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, default: null },
        productName: { type: String, default: '', trim: true, maxlength: 200 },
        quantity: { type: Number, default: 1, min: 1 },
      },
    ],
    fulfillmentType: {
      type: String,
      enum: ['delivery', 'pickup'],
      default: '',
    },
    deliveryAddress: { type: String, default: '', trim: true, maxlength: 500 },
    preferredPickupSlot: { type: String, default: '', trim: true, maxlength: 200 },
    source: { type: String, default: 'website' },
    status: {
      type: String,
      enum: ['new', 'contacted', 'converted', 'closed'],
      default: 'new',
    },
    leadId: { type: mongoose.Schema.Types.ObjectId, default: null },
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

websiteEnquirySchema.index({ branchId: 1, createdAt: -1 });
websiteEnquirySchema.index({ branchId: 1, status: 1 });

module.exports = {
  schema: websiteEnquirySchema,
  model: mongoose.models.WebsiteEnquiry || mongoose.model('WebsiteEnquiry', websiteEnquirySchema),
};
