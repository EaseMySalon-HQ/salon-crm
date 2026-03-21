const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: function() {
      return this.productType !== 'service';
    },
    min: 0,
    default: 0
  },
  cost: {
    type: Number,
    min: 0,
    default: undefined
  },
  offerPrice: {
    type: Number,
    min: 0,
    default: undefined
  },
  stock: {
    type: Number,
    required: true,
    default: 0
    // No min: 0 - allow negative stock when auto consumption runs; alert when below minimumStock
  },
  minimumStock: {
    type: Number,
    min: 0,
    default: 5
  },
  baseUnit: {
    type: String,
    enum: ['g', 'ml', 'pcs'],
    default: 'pcs'
  },
  volume: {
    type: Number,
    min: 0,
    default: undefined
  },
  volumeUnit: {
    type: String,
    enum: ['mg', 'g', 'kg', 'ml', 'l', 'oz', 'pcs', 'pkt'],
    default: 'pcs'
  },
  allowFractionalConsumption: {
    type: Boolean,
    default: false
  },
  sku: {
    type: String,
    unique: true,
    sparse: true
  },
  barcode: {
    type: String,
    default: ''
  },
  hsnSacCode: {
    type: String,
    default: ''
  },
  supplier: {
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
  taxCategory: {
    type: String,
    enum: ['essential', 'intermediate', 'standard', 'luxury', 'exempt'],
    default: 'standard'
  },
  productType: {
    type: String,
    enum: ['retail', 'service', 'both'],
    default: 'retail'
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
}, {
  timestamps: true
});

// Indexes: inventory lists and search by branch
productSchema.index({ branchId: 1, isActive: 1, name: 1 });
productSchema.index({ branchId: 1, category: 1 });
productSchema.index({ branchId: 1, createdAt: -1 });

// Export both schema and model for flexibility
module.exports = {
  schema: productSchema,
  model: mongoose.model('Product', productSchema)
}; 