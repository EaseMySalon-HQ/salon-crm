const mongoose = require('mongoose');

const serviceConsumptionRuleSchema = new mongoose.Schema({
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantityUsed: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    enum: ['mg', 'g', 'kg', 'ml', 'l', 'oz', 'pcs', 'pkt'],
    required: true
  },
  isAdjustable: {
    type: Boolean,
    default: false
  },
  maxAdjustmentPercent: {
    type: Number,
    default: 20,
    min: 0,
    max: 100
  },
  variantKey: {
    type: String,
    default: ''
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
}, {
  timestamps: true
});

serviceConsumptionRuleSchema.index({ serviceId: 1, variantKey: 1 });
serviceConsumptionRuleSchema.index({ productId: 1 });
serviceConsumptionRuleSchema.index({ branchId: 1 });

module.exports = {
  schema: serviceConsumptionRuleSchema,
  model: mongoose.model('ServiceConsumptionRule', serviceConsumptionRuleSchema)
};
