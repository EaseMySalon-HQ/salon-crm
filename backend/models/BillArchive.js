const mongoose = require('mongoose');

const billArchiveSchema = new mongoose.Schema({
  originalBill: {
    type: Object,
    required: true,
  },
  billNo: {
    type: String,
    required: true,
    index: true,
  },
  saleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
  },
  archivedAt: {
    type: Date,
    default: Date.now,
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  archivedByName: {
    type: String,
    default: '',
  },
  reason: {
    type: String,
    default: '',
  },
  isImmutable: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

billArchiveSchema.index({ billNo: 1, archivedAt: -1 });

module.exports = {
  schema: billArchiveSchema,
  model: mongoose.model('BillArchive', billArchiveSchema),
};


