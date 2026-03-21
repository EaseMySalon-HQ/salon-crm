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