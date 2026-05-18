const mongoose = require('mongoose');

const CASH_MOVEMENT_TYPES = [
  'owner_withdrawal',
  'bank_deposit',
  'safe_transfer',
  'petty_cash_transfer',
  'cash_added',
  'other',
];

const cashMovementSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: CASH_MOVEMENT_TYPES,
  },
  direction: {
    type: String,
    required: true,
    enum: ['in', 'out'],
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01,
  },
  reason: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500,
  },
  referenceNo: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100,
  },
  createdBy: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'void'],
    default: 'active',
  },
  voidedAt: { type: Date },
  voidedBy: { type: String, default: '' },
  pettyCashTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PettyCashTransaction',
    default: null,
  },
}, {
  timestamps: true,
});

cashMovementSchema.index({ branchId: 1, date: -1, status: 1 });

module.exports = {
  schema: cashMovementSchema,
  CASH_MOVEMENT_TYPES,
  model: mongoose.models.CashMovement || mongoose.model('CashMovement', cashMovementSchema),
};
