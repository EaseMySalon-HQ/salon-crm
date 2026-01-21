const mongoose = require('mongoose');

const billEditHistorySchema = new mongoose.Schema({
  saleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    required: true,
  },
  billNo: {
    type: String,
    required: true,
    index: true,
  },
  editedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  editedByName: {
    type: String,
    default: '',
  },
  editDate: {
    type: Date,
    default: Date.now,
  },
  editReason: {
    type: String,
    required: true,
  },
  changes: {
    before: {
      type: Object,
      required: true,
    },
    after: {
      type: Object,
      required: true,
    },
    diff: {
      type: Object,
      default: {},
    },
  },
  inventoryChanges: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
      quantityChange: Number,
      previousStock: Number,
      newStock: Number,
      transactionIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'InventoryTransaction',
        },
      ],
    },
  ],
  paymentAdjustments: {
    refundAmount: {
      type: Number,
      default: 0,
    },
    additionalAmount: {
      type: Number,
      default: 0,
    },
    refundMethods: [
      {
        type: String,
      },
    ],
  },
}, {
  timestamps: true,
});

billEditHistorySchema.index({ saleId: 1, editDate: -1 });

module.exports = {
  schema: billEditHistorySchema,
  model: mongoose.model('BillEditHistory', billEditHistorySchema),
};


