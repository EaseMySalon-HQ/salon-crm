const mongoose = require('mongoose');

/**
 * Payable for supplier purchases.
 * - PO receive: purchaseOrderId set (purchaseInvoiceId null until linked PI updates same row).
 * - PI post (standalone): purchaseInvoiceId set only.
 * - PI post linked to PO: both refs may be set on one row (single liability, GRN + invoice aligned).
 */
const supplierPayableSchema = new mongoose.Schema({
  purchaseOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
  },
  purchaseInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseInvoice',
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
  return Math.max(0, this.totalAmount - (this.amountPaid || 0));
});

supplierPayableSchema.index({ branchId: 1, supplierId: 1 });
supplierPayableSchema.index({ branchId: 1, status: 1 });
supplierPayableSchema.index({ branchId: 1, createdAt: 1 });
/** Unique per branch when a real PO is linked (standalone payables omit this field; null would collide under a plain unique index). */
supplierPayableSchema.index(
  { branchId: 1, purchaseOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { purchaseOrderId: { $type: 'objectId' } },
  }
);
/** Unique per branch when a real PI is linked. */
supplierPayableSchema.index(
  { branchId: 1, purchaseInvoiceId: 1 },
  {
    unique: true,
    partialFilterExpression: { purchaseInvoiceId: { $type: 'objectId' } },
  }
);

module.exports = {
  schema: supplierPayableSchema,
  model: mongoose.model('SupplierPayable', supplierPayableSchema)
};
