/**
 * Per-business Google Business Profile OAuth account (main DB).
 * One row per branch when multi-location; branchId null = default branch mapping.
 */

'use strict';

const mongoose = require('mongoose');

const gmbAccountSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['connected', 'disconnected', 'error', 'pending_location'],
      default: 'pending_location',
    },
    accountId: { type: String, default: null },
    accountName: { type: String, default: null },
    locationId: { type: String, default: null },
    locationName: { type: String, default: null },
    locationCount: { type: Number, default: 0 },

    accessTokenCipher: { type: String, default: null },
    refreshTokenCipher: { type: String, default: null },
    expiryDate: { type: Date, default: null },
    tokenLastUsedAt: { type: Date, default: null },

    autoReplyEnabled: { type: Boolean, default: false },
    autoReplyMode: {
      type: String,
      enum: ['auto', 'draft'],
      default: 'draft',
    },
    autoReplyDelay: { type: Number, default: 60 },
    replyTone: {
      type: String,
      enum: ['formal', 'friendly', 'casual'],
      default: 'friendly',
    },
    replyLanguage: {
      type: String,
      enum: ['english', 'hindi', 'hinglish', 'auto'],
      default: 'auto',
    },

    reviewRequestEnabled: { type: Boolean, default: false },
    reviewRequestDelayMinutes: { type: Number, default: 120 },
    reviewRequestCooldownDays: { type: Number, default: 90 },

    negativeAlertEnabled: { type: Boolean, default: true },
    negativeAlertThreshold: { type: Number, default: 2 },
    negativeAlertEscalationHours: { type: Number, default: 4 },
    negativeAlertRecipients: {
      type: String,
      enum: ['owner', 'owner_manager'],
      default: 'owner',
    },

    postingEnabled: { type: Boolean, default: false },
    postFrequency: {
      type: String,
      enum: ['daily', '3x', 'weekly', 'off'],
      default: 'weekly',
    },
    postMode: {
      type: String,
      enum: ['auto', 'draft'],
      default: 'draft',
    },
    postTopics: {
      type: [String],
      default: ['offers', 'new_services', 'festivals', 'tips', 'milestones'],
    },

    servicesSyncEnabled: { type: Boolean, default: false },
    hoursSyncEnabled: { type: Boolean, default: false },

    connectedAt: { type: Date, default: null },
    disconnectedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
    lastErrorMessage: { type: String, default: null },

    draftModeUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

gmbAccountSchema.index({ businessId: 1, branchId: 1 }, { unique: true });

module.exports = {
  schema: gmbAccountSchema,
  model: mongoose.models.GmbAccount || mongoose.model('GmbAccount', gmbAccountSchema),
};
