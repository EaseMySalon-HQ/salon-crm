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
  }
}, {
  timestamps: true
});

pettyCashTransactionSchema.index({ branchId: 1, date: -1 });

module.exports = {
  schema: pettyCashTransactionSchema,
  model: mongoose.model('PettyCashTransaction', pettyCashTransactionSchema)
};
