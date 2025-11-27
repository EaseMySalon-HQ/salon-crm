const mongoose = require('mongoose');

const planChangeLogSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true,
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  changeType: {
    type: String,
    enum: ['plan_change', 'billing_period_change', 'trial_status_change', 'feature_override', 'addon_change'],
    required: true,
  },
  previousValue: {
    type: mongoose.Schema.Types.Mixed, // Can be any type
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  field: {
    type: String, // e.g., 'planId', 'billingPeriod', 'overrides.features', 'addons.whatsapp.enabled'
  },
  reason: {
    type: String, // Optional reason/notes for the change
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // Additional context
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
});

// Index for efficient queries
planChangeLogSchema.index({ businessId: 1, createdAt: -1 });
planChangeLogSchema.index({ changedBy: 1, createdAt: -1 });

// Export both schema and model
module.exports = {
  schema: planChangeLogSchema,
  model: mongoose.model('PlanChangeLog', planChangeLogSchema),
};

