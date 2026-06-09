/**
 * WhatsApp campaign (Meta Cloud API). Replaces the legacy `Campaign` collection.
 */

'use strict';

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    queued: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    read: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
  },
  { _id: false }
);

const whatsappCampaignSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WhatsAppTemplate',
      required: true,
    },
    audienceType: {
      type: String,
      enum: ['all_optin', 'segment', 'custom'],
      default: 'all_optin',
    },
    audienceFilters: { type: mongoose.Schema.Types.Mixed, default: {} },
    variableMapping: { type: mongoose.Schema.Types.Mixed, default: {} },

    recipientCount: { type: Number, default: 0 },
    counts: { type: counterSchema, default: () => ({}) },
    walletDebitedPaise: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['draft', 'scheduled', 'queued', 'sending', 'sent', 'cancelled', 'failed'],
      default: 'draft',
      index: true,
    },
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    /** Frozen state of compliance booster at the moment of send. */
    complianceSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },

    /** Populated by the scheduler when a scheduled campaign aborts on a
     * pre-flight gate (WABA disconnected, template not approved, etc.). */
    failureReason: { type: String, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** When migrated from the legacy Campaign collection, original _id is preserved here. */
    legacyCampaignId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

whatsappCampaignSchema.index({ businessId: 1, status: 1, createdAt: -1 });
whatsappCampaignSchema.index({ businessId: 1, scheduledAt: 1 });

module.exports = {
  schema: whatsappCampaignSchema,
  model:
    mongoose.models.WhatsAppCampaign ||
    mongoose.model('WhatsAppCampaign', whatsappCampaignSchema),
};
