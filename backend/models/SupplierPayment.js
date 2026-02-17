const mongoose = require('mongoose');

const supplierPaymentSchema = new mongoose.Schema({
  supplierPayableId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierPayable',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank', 'UPI', 'Card', 'Cheque'],
    required: true
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  reference: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

supplierPaymentSchema.index({ supplierPayableId: 1 });
supplierPaymentSchema.index({ branchId: 1, paymentDate: -1 });

module.exports = {
  schema: supplierPaymentSchema,
  model: mongoose.model('SupplierPayment', supplierPaymentSchema)
};
