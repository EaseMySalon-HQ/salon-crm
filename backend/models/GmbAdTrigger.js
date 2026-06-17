/**
 * AI-driven ad trigger suggestions from GMB signals (tenant DB).
 */

'use strict';

const mongoose = require('mongoose');

const gmbAdTriggerSchema = new mongoose.Schema(
  {
    signalType: {
      type: String,
      enum: [
        'profile_views_drop',
        'conversion_drop',
        'competitor_reviews',
        'low_weekday_utilization',
      ],
      required: true,
    },
    signalData: { type: mongoose.Schema.Types.Mixed, default: null },
    suggestion: { type: String, default: '' },
    suggestedBudgetInr: { type: Number, default: null },
    suggestedChannel: {
      type: String,
      enum: ['google_ads', 'meta_ads', 'gmb_post'],
      default: 'gmb_post',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'dismissed', 'launched'],
      default: 'pending',
    },
    launchedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = {
  schema: gmbAdTriggerSchema,
  model: mongoose.models.GmbAdTrigger || mongoose.model('GmbAdTrigger', gmbAdTriggerSchema),
};
