const mongoose = require('mongoose');

/**
 * Immutable log of inventory consumed by a completed service.
 * Reversals create new documents with isReversal: true and referenceLogId set.
 */
const inventoryConsumptionLogSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    default: null
  },
  billId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    default: null
  },
  /** auto | manual_bill | manual_bulk */
  source: {
    type: String,
    enum: ['auto', 'manual_bill', 'manual_bulk'],
    default: 'auto'
  },
  staffId: {
    type: String,
    default: ''
  },
  quantityConsumed: {
    type: Number,
    required: true
  },
  stockBefore: {
    type: Number,
    required: true
  },
  stockAfter: {
    type: Number,
    required: true
  },
  isReversal: {
    type: Boolean,
    default: false
  },
  referenceLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryConsumptionLog',
    default: null
  },
  adjustedQuantity: {
    type: Number
  },
  adjustmentReason: {
    type: String,
    default: ''
  },
  itemIndex: {
    type: Number
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
}, {
  timestamps: true
});

inventoryConsumptionLogSchema.index({ productId: 1, createdAt: -1 });
inventoryConsumptionLogSchema.index({ serviceId: 1, createdAt: -1 });
inventoryConsumptionLogSchema.index({ billId: 1 });
inventoryConsumptionLogSchema.index({ branchId: 1, createdAt: -1 });

module.exports = {
  schema: inventoryConsumptionLogSchema,
  model: mongoose.model('InventoryConsumptionLog', inventoryConsumptionLogSchema)
};
