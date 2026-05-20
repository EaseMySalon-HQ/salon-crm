const mongoose = require('mongoose');

const platformLeadActivitySchema = new mongoose.Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlatformLead',
    required: true,
    index: true,
  },
  activityType: {
    type: String,
    enum: [
      'created',
      'status_changed',
      'follow_up_scheduled',
      'follow_up_updated',
      'admin_assigned',
      'admin_changed',
      'notes_updated',
      'converted',
      'updated',
    ],
    required: true,
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  performedByName: {
    type: String,
    required: true,
  },
  previousValue: {
    type: mongoose.Schema.Types.Mixed,
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
  },
  field: {
    type: String,
  },
  description: {
    type: String,
    required: true,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

platformLeadActivitySchema.index({ leadId: 1, createdAt: -1 });

module.exports = {
  schema: platformLeadActivitySchema,
  model: mongoose.model('PlatformLeadActivity', platformLeadActivitySchema),
};
