const mongoose = require('mongoose');

// Sub-document: snapshot of service at redemption time
// Using sub-documents (not raw JSON) for clean utilization reporting
const redeemedServiceSchema = new mongoose.Schema({
  service_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  },
  service_name: {
    type: String    // snapshot — accurate even if service is renamed later
  },
  price: {
    type: Number    // snapshot — accurate even if service price changes later
  }
}, { _id: false });

const packageRedemptionSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  client_package_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientPackage',
    required: true
  },
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  redeemed_at: {
    type: Date,
    default: Date.now
  },
  redeemed_by_staff_id: {
    type: mongoose.Schema.Types.ObjectId
    // intentionally no ref — could be User (owner) or Staff
  },
  redeemed_at_branch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business'
  },
  sitting_number: {
    type: Number,
    required: true,
    min: 1
  },
  /** Links redemption audit row to a scheduled session (optional) */
  package_session_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PackageSession',
    default: null
  },
  services_redeemed: [redeemedServiceSchema],  // sub-documents, NOT raw JSON
  is_reversed: {
    type: Boolean,
    default: false
  },
  reversed_by: {
    type: mongoose.Schema.Types.ObjectId
  },
  reversed_at: {
    type: Date,
    default: null
  },
  reversal_reason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

packageRedemptionSchema.index({ branchId: 1, client_package_id: 1 });
packageRedemptionSchema.index({ branchId: 1, client_id: 1 });
packageRedemptionSchema.index({ branchId: 1, redeemed_at: -1 });

module.exports = {
  schema: packageRedemptionSchema,
  model: mongoose.model('PackageRedemption', packageRedemptionSchema)
};
