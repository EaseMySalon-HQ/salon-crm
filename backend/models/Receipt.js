const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  receiptNumber: {
    type: String,
    required: true,
    unique: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  date: {
    type: String,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  items: [{
    id: String,
    name: String,
    type: {
      type: String,
      enum: ['service', 'product']
    },
    price: Number,
    quantity: Number,
    discount: Number,
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage'
    },
    // Legacy fields for backward compatibility
    staffId: String,
    staffName: String,
    total: Number,
    // New multi-staff support
    staffContributions: [{
      staffId: { type: String, required: true },
      staffName: { type: String, required: true },
      percentage: { type: Number, required: true, min: 0, max: 100 },
      amount: { type: Number, required: true, min: 0 }
    }]
  }],
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  tip: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  payments: [{
    type: {
      type: String,
      enum: ['cash', 'card', 'digital'],
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  notes: {
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

receiptSchema.index({ branchId: 1, date: -1 });
receiptSchema.index({ branchId: 1, clientId: 1 });
receiptSchema.index({ branchId: 1, createdAt: -1 });

// Export both schema and model for flexibility
module.exports = {
  schema: receiptSchema,
  model: mongoose.model('Receipt', receiptSchema)
}; 