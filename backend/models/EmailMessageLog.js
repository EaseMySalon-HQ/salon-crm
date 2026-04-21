const mongoose = require('mongoose');

const emailMessageLogSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },
  recipientEmail: {
    type: String,
    required: true,
    index: true
  },
  messageType: {
    type: String,
    enum: [
      'receipt',
      'appointment',
      'system',
      'daily_summary',
      'weekly_summary',
      'low_inventory',
      'campaign',
      'test'
    ],
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
  subject: {
    type: String,
    default: null
  },
  provider: {
    type: String,
    default: null
  },
  providerResponse: {
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

emailMessageLogSchema.index({ businessId: 1, timestamp: -1 });
emailMessageLogSchema.index({ businessId: 1, status: 1, timestamp: -1 });
emailMessageLogSchema.index({ messageType: 1, timestamp: -1 });

module.exports = mongoose.model('EmailMessageLog', emailMessageLogSchema);
