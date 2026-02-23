const mongoose = require('mongoose');

const purchaseOrderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitCost: { type: Number, required: true, min: 0 },
  gstPercent: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 }
}, { _id: false });

const receivedItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  orderedQty: { type: Number, required: true },
  receivedQty: { type: Number, required: true, min: 0 },
  unitCost: { type: Number, required: true, min: 0 }
}, { _id: false });

const deliveryEventSchema = new mongoose.Schema({
  receivedAt: { type: Date, required: true, default: Date.now },
  receivedItems: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, default: '' },
    receivedQty: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 }
  }],
  grnNotes: { type: String, default: '' }
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: {
    type: String,
    required: true,
    trim: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  orderDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  expectedDeliveryDate: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['draft', 'ordered', 'partially_received', 'received', 'cancelled'],
    default: 'draft'
  },
  items: {
    type: [purchaseOrderItemSchema],
    default: []
  },
  subtotal: {
    type: Number,
    default: 0,
    min: 0
  },
  gstAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  grandTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  notes: {
    type: String,
    default: ''
  },
  // GRN - embedded received data
  receivedAt: {
    type: Date,
    default: null
  },
  receivedItems: {
    type: [receivedItemSchema],
    default: []
  },
  invoiceUrl: {
    type: String,
    default: ''
  },
  grnNotes: {
    type: String,
    default: ''
  },
  deliveryHistory: {
    type: [deliveryEventSchema],
    default: []
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

purchaseOrderSchema.index({ branchId: 1, poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ branchId: 1, supplierId: 1 });
purchaseOrderSchema.index({ branchId: 1, status: 1 });
purchaseOrderSchema.index({ branchId: 1, orderDate: -1 });

module.exports = {
  schema: purchaseOrderSchema,
  model: mongoose.model('PurchaseOrder', purchaseOrderSchema)
};
