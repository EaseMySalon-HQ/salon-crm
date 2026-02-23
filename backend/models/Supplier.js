const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  contactPerson: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  whatsapp: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  gstNumber: {
    type: String,
    default: ''
  },
  paymentTerms: {
    type: String,
    enum: ['7', '15', '30', '45', '60', 'custom'],
    default: '30'
  },
  bankDetails: {
    type: String,
    default: ''
  },
  categories: {
    type: [String],
    default: []
  },
  notes: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster lookups
supplierSchema.index({ branchId: 1, name: 1 });
supplierSchema.index({ branchId: 1, isActive: 1 });

// Export both schema and model for flexibility
module.exports = {
  schema: supplierSchema,
  model: mongoose.model('Supplier', supplierSchema)
};

