/**
 * Synced Google Business Profile reviews (tenant DB).
 */

'use strict';

const mongoose = require('mongoose');

const gmbReviewSchema = new mongoose.Schema(
  {
    locationId: { type: String, required: true, index: true },
    reviewId: { type: String, required: true, unique: true, index: true },
    reviewerName: { type: String, default: 'Anonymous' },
    starRating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
    createTime: { type: Date, default: null },
    replyText: { type: String, default: null },
    replySource: {
      type: String,
      enum: ['ai_auto', 'ai_draft_approved', 'manual', null],
      default: null,
    },
    repliedAt: { type: Date, default: null },
    alertSent: { type: Boolean, default: false },
    alertEscalatedAt: { type: Date, default: null },
    aiDraftText: { type: String, default: null },
    autoReplyScheduledAt: { type: Date, default: null },
    autoReplyProcessed: { type: Boolean, default: false },
    googleUpdateTime: { type: Date, default: null },
  },
  { timestamps: true }
);

gmbReviewSchema.index({ starRating: 1, repliedAt: 1 });
gmbReviewSchema.index({ createTime: -1 });

module.exports = {
  schema: gmbReviewSchema,
  model: mongoose.models.GmbReview || mongoose.model('GmbReview', gmbReviewSchema),
};
