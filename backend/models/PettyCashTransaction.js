const mongoose = require('mongoose');

const pettyCashTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['add']
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  /** Set when funded from Cash Registry “To petty cash” movement */
  cashMovementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CashMovement',
    default: null,
  },
}, {
  timestamps: true
});

pettyCashTransactionSchema.index({ branchId: 1, date: -1 });
pettyCashTransactionSchema.index({ cashMovementId: 1 }, { sparse: true });

module.exports = {
  schema: pettyCashTransactionSchema,
  model: mongoose.model('PettyCashTransaction', pettyCashTransactionSchema)
};
