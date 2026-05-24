const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      required: true,
    },
    customerName: { type: String, required: true, default: '' },
    customerPhone: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    reviewText: { type: String, default: '' },
    source: {
      type: String,
      enum: ['whatsapp', 'sms', 'public_link', 'invoice_page'],
      default: 'public_link',
    },
    googlePromptShown: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['new', 'reviewed', 'resolved'],
      default: 'new',
    },
    internalNotes: { type: String, default: '' },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

feedbackSchema.index({ businessId: 1, submittedAt: -1 });
feedbackSchema.index({ branchId: 1, status: 1 });
feedbackSchema.index({ rating: 1 });
feedbackSchema.index({ saleId: 1 }, { unique: true });

module.exports = {
  schema: feedbackSchema,
  model: mongoose.model('Feedback', feedbackSchema),
};
