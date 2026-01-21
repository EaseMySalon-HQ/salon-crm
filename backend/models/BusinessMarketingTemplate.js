const mongoose = require('mongoose');

const businessMarketingTemplateSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  },
  templateName: {
    type: String,
    required: true
  },
  msg91TemplateId: {
    type: String,
    default: null
  },
  language: {
    type: String,
    default: 'en'
  },
  category: {
    type: String,
    enum: ['MARKETING'],
    default: 'MARKETING'
  },
  components: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'active'],
    default: 'pending',
    index: true
  },
  statusMessage: {
    type: String,
    default: null
  },
  msg91Response: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: {
    type: Date,
    default: null
  },
  description: {
    type: String,
    default: ''
  },
  tags: [{
    type: String
  }],
  campaignCount: {
    type: Number,
    default: 0
  },
  lastUsedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
businessMarketingTemplateSchema.index({ businessId: 1, status: 1 });
businessMarketingTemplateSchema.index({ businessId: 1, templateName: 1 });
businessMarketingTemplateSchema.index({ businessId: 1, category: 1 });

// Export both schema and model for flexibility
module.exports = {
  schema: businessMarketingTemplateSchema,
  model: mongoose.model('BusinessMarketingTemplate', businessMarketingTemplateSchema)
};

