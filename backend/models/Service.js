const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  fullPrice: {
    type: Number,
    min: 0,
    default: undefined
  },
  offerPrice: {
    type: Number,
    min: 0,
    default: undefined
  },
  taxApplicable: {
    type: Boolean,
    default: false
  },
  hsnSacCode: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isAutoConsumptionEnabled: {
    type: Boolean,
    default: false
  },
  serviceKind: {
    type: String,
    enum: ['simple', 'bundle'],
    default: 'simple'
  },
  bundleItems: {
    type: [{
      serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
      sortOrder: { type: Number, default: 0 }
    }],
    default: undefined
  },
  bundleScheduleType: {
    type: String,
    enum: ['sequence', 'parallel'],
    default: undefined
  },
  bundlePricingType: {
    type: String,
    enum: ['full_price', 'custom', 'percent_discount', 'free'],
    default: undefined
  },
  bundlePercentOff: {
    type: Number,
    min: 0,
    max: 100,
    default: undefined
  },
  bundleRetailPrice: {
    type: Number,
    min: 0,
    default: undefined
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
}, {
  timestamps: true
});

serviceSchema.index({ branchId: 1, isActive: 1, name: 1 });
serviceSchema.index({ branchId: 1, category: 1 });

// Export both schema and model for flexibility
module.exports = {
  schema: serviceSchema,
  model: mongoose.model('Service', serviceSchema)
}; 