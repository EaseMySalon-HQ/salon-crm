const mongoose = require('mongoose');
const { TENANT_ACTIVITY_LOG_RETENTION_SECONDS } = require('../constants/tenant-log-retention');

const metadataSchema = new mongoose.Schema(
  {
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    source: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web',
    },
  },
  { _id: false }
);

/**
 * Per-business audit trail stored on the main DB (queryable by platform admins).
 * Append-only: updates/deletes are blocked at the schema layer.
 */
const activityLogSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
    },
    actorType: {
      type: String,
      required: true,
      enum: ['admin', 'staff', 'system'],
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    action: {
      type: String,
      required: true,
    },
    entity: {
      type: String,
      default: '',
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    summary: {
      type: String,
      required: true,
    },
    metadata: {
      type: metadataSchema,
      default: () => ({}),
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'activity_logs',
    timestamps: false,
  }
);

activityLogSchema.index({ businessId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1 });
activityLogSchema.index({ actorType: 1 });
// MongoDB TTL — purge tenant audit rows after retention window (bypasses mongoose immutability hooks).
activityLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: TENANT_ACTIVITY_LOG_RETENTION_SECONDS }
);

function blockMutate() {
  throw new Error('ActivityLog is immutable');
}

activityLogSchema.pre('findOneAndUpdate', blockMutate);
activityLogSchema.pre('updateOne', blockMutate);
activityLogSchema.pre('updateMany', blockMutate);
activityLogSchema.pre('replaceOne', blockMutate);
activityLogSchema.pre('deleteOne', blockMutate);
activityLogSchema.pre('deleteMany', blockMutate);

module.exports = {
  schema: activityLogSchema,
};
