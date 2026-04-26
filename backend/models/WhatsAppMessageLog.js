const mongoose = require('mongoose');

const whatsappMessageLogSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },
  recipientPhone: {
    type: String,
    required: true,
    index: true
  },
  messageType: {
    type: String,
    enum: ['receipt', 'appointment', 'system', 'campaign', 'client_wallet_transaction', 'client_wallet_expiry'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['sent', 'failed', 'pending'],
    required: true,
    default: 'pending',
    index: true
  },
  msg91Response: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  relatedEntityType: {
    type: String,
    default: null
  },
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    default: null,
    index: true
  },
  error: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
whatsappMessageLogSchema.index({ businessId: 1, timestamp: -1 });
whatsappMessageLogSchema.index({ businessId: 1, status: 1, timestamp: -1 });
whatsappMessageLogSchema.index({ messageType: 1, timestamp: -1 });

module.exports = mongoose.model('WhatsAppMessageLog', whatsappMessageLogSchema);

