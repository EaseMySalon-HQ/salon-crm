const mongoose = require('mongoose');

const supplierPayableSchema = new mongoose.Schema({
  purchaseOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'partial', 'paid'],
    default: 'pending'
  },
  paidOn: {
    type: Date,
    default: null
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

supplierPayableSchema.virtual('balanceDue').get(function() {
  return Math.max(0, this.totalAmount - this.amountPaid);
});

supplierPayableSchema.index({ branchId: 1, supplierId: 1 });
supplierPayableSchema.index({ branchId: 1, status: 1 });
supplierPayableSchema.index({ purchaseOrderId: 1 }, { unique: true });

module.exports = {
  schema: supplierPayableSchema,
  model: mongoose.model('SupplierPayable', supplierPayableSchema)
};
