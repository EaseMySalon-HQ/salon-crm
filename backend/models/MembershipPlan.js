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
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

membershipPlanSchema.index({ branchId: 1, isActive: 1 });

module.exports = {
  schema: membershipPlanSchema,
  model: mongoose.model('MembershipPlan', membershipPlanSchema)
};
