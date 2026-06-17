/**
 * Per-branch GMB sync audit log (tenant DB).
 */

'use strict';

const mongoose = require('mongoose');

const gmbSyncLogSchema = new mongoose.Schema(
  {
    locationId: { type: String, default: null },
    operation: {
      type: String,
      enum: [
        'review_sync',
        'review_reply',
        'auto_reply',
        'services_sync',
        'hours_sync',
        'post_publish',
        'insights_sync',
        'health_snapshot',
        'oauth_connect',
        'oauth_disconnect',
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ['success', 'error', 'skipped'],
      default: 'success',
    },
    message: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

gmbSyncLogSchema.index({ createdAt: -1 });

module.exports = {
  schema: gmbSyncLogSchema,
  model: mongoose.models.GmbSyncLog || mongoose.model('GmbSyncLog', gmbSyncLogSchema),
};
