const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessMarketingTemplate',
    required: true
  },
  templateName: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'completed', 'cancelled'],
    default: 'draft',
    index: true
  },
  scheduledAt: {
    type: Date,
    default: null
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  recipientType: {
    type: String,
    enum: ['all_clients', 'segment', 'custom'],
    required: true
  },
  recipientFilters: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  recipientCount: {
    type: Number,
    default: 0
  },
  sentCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  templateVariables: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
campaignSchema.index({ businessId: 1, status: 1 });
campaignSchema.index({ businessId: 1, createdAt: -1 });
campaignSchema.index({ templateId: 1 });

// Export both schema and model for flexibility
module.exports = {
  schema: campaignSchema,
  model: mongoose.model('Campaign', campaignSchema)
};

