const mongoose = require('mongoose');

const clientPackageSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  package_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package',
    required: true
  },
  purchase_date: {
    type: Date,
    default: Date.now
  },
  expiry_date: {
    type: Date,
    default: null   // null = never expires (validity_days was null on package)
  },
  total_sittings: {
    type: Number,
    required: true,
    min: 1
  },
  used_sittings: {
    type: Number,
    default: 0,
    min: 0
  },
  remaining_sittings: {
    type: Number,
    required: true,
    min: 0
  },
  total_services: {
    type: Number,
    default: null
  },
  used_services: {
    type: Number,
    default: 0
  },
  remaining_services: {
    type: Number,
    default: null
  },
  payment_status: {
    type: String,
    enum: ['PAID', 'PARTIAL', 'PENDING'],
    default: 'PENDING'
  },
  amount_paid: {
    type: Number,
    default: 0,
    min: 0
  },
  outstanding_balance: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'EXPIRED', 'EXHAUSTED', 'CANCELLED'],
    default: 'ACTIVE'
  },
  purchased_at_branch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business'
  },
  /** Staff who sold / activated this client package (for default on package redemption quick sale). */
  sold_by_staff_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    default: null
  }
}, {
  timestamps: true
});

clientPackageSchema.index({ branchId: 1, client_id: 1, status: 1 });
clientPackageSchema.index({ branchId: 1, package_id: 1 });
clientPackageSchema.index({ expiry_date: 1, status: 1 });   // for expiry cron queries
clientPackageSchema.index({ branchId: 1, status: 1, expiry_date: 1 });

module.exports = {
  schema: clientPackageSchema,
  model: mongoose.model('ClientPackage', clientPackageSchema)
};
