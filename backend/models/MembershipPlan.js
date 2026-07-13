const mongoose = require('mongoose');

const includedServiceSchema = new mongoose.Schema({
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  usageLimit: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const membershipPlanSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  planName: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  durationInDays: {
    type: Number,
    required: true,
    min: 1
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  includedServices: {
    type: [includedServiceSchema],
    default: []
  },
  /** Services that do not receive the plan's discountPercentage (full price unless manually discounted). */
  excludedServiceIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Service',
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  /** When true (and plan is active), new clients get this plan; saving also backfills clients without an active membership. Only one plan per branch should have this flag. */
  appliesToAllClients: {
    type: Boolean,
    default: false
  },
  /** When true, new subscriptions use expiryDate: null (never expires via daily job). */
  unlimitedDuration: {
    type: Boolean,
    default: false
  },
  isPublic: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0 },
  slug: { type: String, trim: true, lowercase: true, default: '' },
  shortDescription: { type: String, default: '', maxlength: 500 },
  description: { type: String, default: '' },
  seoTitle: { type: String, default: '', maxlength: 120 },
  seoDescription: { type: String, default: '', maxlength: 320 },
  imageUrl: { type: String, default: '' },
  imageAlt: { type: String, default: '' },
}, {
  timestamps: true
});

membershipPlanSchema.index({ branchId: 1, isActive: 1 });
membershipPlanSchema.index({ branchId: 1, slug: 1 });
membershipPlanSchema.index({ branchId: 1, isPublic: 1 });

module.exports = {
  schema: membershipPlanSchema,
  model: mongoose.model('MembershipPlan', membershipPlanSchema)
};
