const mongoose = require('mongoose');

const adminActivityLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
    index: true
  },
  adminEmail: {
    type: String,
    required: true,
    index: true
  },
  adminName: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'create', 'update', 'delete', 'login', 'logout', 'password_reset',
      'status_change', 'permission_change', 'role_assigned', 'role_removed',
      'export', 'assign', 'activate', 'deactivate'
    ],
    index: true
  },
  module: {
    type: String,
    required: true,
    enum: [
      'dashboard', 'businesses', 'plans', 'users', 'roles', 'settings',
      'support_tools', 'auth', 'logs'
    ],
    index: true
  },
  resourceId: {
    type: String,
    index: true
  },
  resourceType: {
    type: String
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false // We use custom timestamp field
});

// Compound indexes for common queries
adminActivityLogSchema.index({ adminId: 1, timestamp: -1 });
adminActivityLogSchema.index({ module: 1, timestamp: -1 });
adminActivityLogSchema.index({ action: 1, timestamp: -1 });
adminActivityLogSchema.index({ timestamp: -1 });

// Prevent deletion - add a pre-remove hook that throws
adminActivityLogSchema.pre('remove', function() {
  throw new Error('Activity logs cannot be deleted');
});

adminActivityLogSchema.pre('deleteOne', function() {
  throw new Error('Activity logs cannot be deleted');
});

adminActivityLogSchema.pre('deleteMany', function() {
  throw new Error('Activity logs cannot be deleted');
});

module.exports = {
  schema: adminActivityLogSchema,
  model: mongoose.model('AdminActivityLog', adminActivityLogSchema)
};

