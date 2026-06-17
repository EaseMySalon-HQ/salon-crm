/**
 * Google Business Profile local posts (tenant DB).
 */

'use strict';

const mongoose = require('mongoose');

const gmbPostSchema = new mongoose.Schema(
  {
    locationId: { type: String, required: true, index: true },
    triggerType: {
      type: String,
      enum: ['weekly', 'new_service', 'festival', 'low_slots', 'milestone', 'manual', 'ad_trigger'],
      default: 'manual',
    },
    topic: { type: String, default: '' },
    draftText: { type: String, default: '' },
    imageUrl: { type: String, default: null },
    imagePrompt: { type: String, default: null },
    ctaType: {
      type: String,
      enum: ['BOOK', 'CALL', 'LEARN_MORE'],
      default: 'BOOK',
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'published', 'failed'],
      default: 'draft',
    },
    scheduledAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    googlePostId: { type: String, default: null },
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = {
  schema: gmbPostSchema,
  model: mongoose.models.GmbPost || mongoose.model('GmbPost', gmbPostSchema),
};
