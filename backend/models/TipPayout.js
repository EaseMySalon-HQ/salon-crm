const mongoose = require('mongoose');

const tipPayoutSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  staffName: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  paidAt: { type: Date, default: Date.now },
  // Optional: period this payout covers (for reference)
  dateFrom: { type: Date },
  dateTo: { type: Date },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true }
}, { timestamps: true });

tipPayoutSchema.index({ staffId: 1, paidAt: -1 });
tipPayoutSchema.index({ branchId: 1, paidAt: -1 });

module.exports = {
  schema: tipPayoutSchema,
  model: mongoose.model('TipPayout', tipPayoutSchema)
};
