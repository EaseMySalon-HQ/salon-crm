const mongoose = require('mongoose');

const membershipUsageSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MembershipSubscription',
    required: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  usedOn: {
    type: Date,
    required: true,
    default: Date.now
  },
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  billingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    required: true
  }
}, {
  timestamps: true
});

membershipUsageSchema.index({ branchId: 1, subscriptionId: 1, serviceId: 1 });
membershipUsageSchema.index({ branchId: 1 });

module.exports = {
  schema: membershipUsageSchema,
  model: mongoose.model('MembershipUsage', membershipUsageSchema)
};
