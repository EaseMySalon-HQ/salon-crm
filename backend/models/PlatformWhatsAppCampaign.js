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

const platformWhatsAppCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformWhatsAppTemplate',
      required: true,
    },
    audienceType: {
      type: String,
      enum: ['all_leads', 'segment', 'custom'],
      default: 'all_leads',
    },
    audienceFilters: { type: mongoose.Schema.Types.Mixed, default: {} },
    variableMapping: { type: mongoose.Schema.Types.Mixed, default: {} },
    recipientCount: { type: Number, default: 0 },
    counts: { type: counterSchema, default: () => ({}) },
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
    failureReason: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

platformWhatsAppCampaignSchema.index({ status: 1, createdAt: -1 });
platformWhatsAppCampaignSchema.index({ scheduledAt: 1 });

module.exports = {
  schema: platformWhatsAppCampaignSchema,
  model:
    mongoose.models.PlatformWhatsAppCampaign ||
    mongoose.model('PlatformWhatsAppCampaign', platformWhatsAppCampaignSchema),
};
