/**
 * Tracks WhatsApp GMB review requests per client (tenant DB).
 */

'use strict';

const mongoose = require('mongoose');

const gmbReviewRequestLogSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    sentAt: { type: Date, default: Date.now },
    clickedAt: { type: Date, default: null },
    reviewEstimatedAt: { type: Date, default: null },
    messageId: { type: String, default: null },
  },
  { timestamps: true }
);

gmbReviewRequestLogSchema.index({ clientId: 1, sentAt: -1 });

module.exports = {
  schema: gmbReviewRequestLogSchema,
  model: mongoose.models.GmbReviewRequestLog || mongoose.model('GmbReviewRequestLog', gmbReviewRequestLogSchema),
};
