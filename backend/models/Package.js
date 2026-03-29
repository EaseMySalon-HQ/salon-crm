const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  image_url: {
    type: String
  },
  type: {
    type: String,
    enum: ['FIXED', 'CUSTOMIZED'],
    required: true
  },
  total_price: {
    type: Number,
    required: true,
    min: 0
  },
  discount_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  discount_type: {
    type: String,
    enum: ['FLAT', 'PERCENT'],
    default: null
  },
  min_service_count: {
    type: Number,
    default: 1,
    min: 1
  },
  max_service_count: {
    type: Number,
    default: null
  },
  total_sittings: {
    type: Number,
    required: true,
    min: 1
  },
  validity_days: {
    type: Number,
    default: null  // null = never expires
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
    default: 'ACTIVE'
  },
  branch_ids: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business'
    }
  ],
  cross_branch_redemption: {
    type: Boolean,
    default: false
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId
  }
}, {
  timestamps: true
});

packageSchema.index({ branchId: 1, status: 1 });
packageSchema.index({ branchId: 1, name: 1 });
packageSchema.index({ branchId: 1, type: 1, status: 1 });

module.exports = {
  schema: packageSchema,
  model: mongoose.model('Package', packageSchema)
};
