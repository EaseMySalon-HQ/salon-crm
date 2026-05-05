const mongoose = require('mongoose');

const purchaseInvoiceLineSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, default: '' },
  sku: { type: String, default: '' },
  hsnSacCode: { type: String, default: '' },
  barcode: { type: String, default: '' },
  orderedQty: { type: Number, default: null },
  receivedQty: { type: Number, required: true, min: 0 },
  purchasePrice: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, default: null },
  gstRate: { type: Number, default: 0, min: 0 },
  lineDiscount: { type: Number, default: 0, min: 0 },
  unit: { type: String, default: '' },
  batchNumber: { type: String, default: '' },
  expiryDate: { type: Date, default: null },
  lineTotal: { type: Number, required: true, min: 0 },
  poItemProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null }
}, { _id: false });

const postedLineSnapshotSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, default: '' },
  receivedQty: { type: Number, required: true, min: 0 },
  purchasePrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, default: 0, min: 0 }
}, { _id: false });

const purchaseInvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, trim: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierInvoiceNumber: { type: String, default: '', trim: true },
  invoiceDate: { type: Date, required: true, default: Date.now },
  paymentStatus: {
    type: String,
    enum: ['paid', 'unpaid', 'partially_paid'],
    default: 'unpaid'
  },
  paymentMethod: { type: String, default: '' },
  notes: { type: String, default: '' },
  subtotal: { type: Number, default: 0, min: 0 },
  discountTotal: { type: Number, default: 0, min: 0 },
  gstTotal: { type: Number, default: 0, min: 0 },
  grandTotal: { type: Number, default: 0, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  dueAmount: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['draft', 'posted', 'cancelled'],
    default: 'draft'
  },
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
  lines: { type: [purchaseInvoiceLineSchema], default: [] },
  postedAt: { type: Date, default: null },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  /** Snapshot at post time for accurate cancel reversals */
  postedLinesSnapshot: { type: [postedLineSnapshotSchema], default: [] },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

purchaseInvoiceSchema.index({ branchId: 1, invoiceNumber: 1 }, { unique: true });
purchaseInvoiceSchema.index({ branchId: 1, supplierId: 1 });
purchaseInvoiceSchema.index({ branchId: 1, status: 1 });
purchaseInvoiceSchema.index({ branchId: 1, invoiceDate: -1 });
purchaseInvoiceSchema.index(
  { branchId: 1, supplierId: 1, supplierInvoiceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['draft', 'posted'] },
      supplierInvoiceNumber: { $type: 'string', $ne: '' }
    }
  }
);

module.exports = {
  schema: purchaseInvoiceSchema,
  model: mongoose.model('PurchaseInvoice', purchaseInvoiceSchema)
};
