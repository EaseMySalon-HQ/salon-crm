const mongoose = require('mongoose');

const membershipSubscriptionSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MembershipPlan',
    required: true
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  expiryDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
    default: 'ACTIVE'
  },
  // Sale that created this subscription (assign on checkout) - used to revoke when bill is deleted
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null }
}, {
  timestamps: true
});

membershipSubscriptionSchema.index({ branchId: 1, customerId: 1, status: 1 });
membershipSubscriptionSchema.index({ branchId: 1 });
membershipSubscriptionSchema.index({ expiryDate: 1 });

module.exports = {
  schema: membershipSubscriptionSchema,
  model: mongoose.model('MembershipSubscription', membershipSubscriptionSchema)
};
