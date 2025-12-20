const mongoose = require('mongoose');

const leadActivitySchema = new mongoose.Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: true,
    index: true
  },
  activityType: {
    type: String,
    enum: [
      'created',
      'status_changed',
      'follow_up_scheduled',
      'follow_up_updated',
      'staff_assigned',
      'staff_changed',
      'notes_updated',
      'converted',
      'updated'
    ],
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  performedByName: {
    type: String,
    required: true
  },
  previousValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  field: {
    type: String // e.g., 'status', 'notes', 'assignedStaffId', 'followUpDate'
  },
  description: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
leadActivitySchema.index({ leadId: 1, createdAt: -1 });
leadActivitySchema.index({ branchId: 1, createdAt: -1 });
leadActivitySchema.index({ performedBy: 1, createdAt: -1 });

// Export both schema and model for flexibility
module.exports = {
  schema: leadActivitySchema,
  model: mongoose.model('LeadActivity', leadActivitySchema)
};

