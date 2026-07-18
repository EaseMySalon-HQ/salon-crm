'use strict';

const mongoose = require('mongoose');

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const platformWhatsAppMessageSchema = new mongoose.Schema(
  {
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    recipientPhone: { type: String, required: true, index: true },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformWhatsAppConversation',
      default: null,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformWhatsAppCampaign',
      default: null,
      index: true,
    },
    platformLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformLead',
      default: null,
    },
    platformTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformWhatsAppTemplate',
      default: null,
    },
    gupshupTemplateId: { type: String, default: null },
    params: { type: [String], default: [] },
    category: { type: String, default: null },
    intent: { type: String, default: null },
    inboundText: { type: String, default: null },
    outboundText: { type: String, default: null },
    provider: { type: String, default: 'gupshup' },
    providerMessageId: { type: String, default: null, index: true },
    /** Meta wamid when it differs from the initial Gupshup gsId (template sends). */
    metaMessageId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
      default: 'queued',
      index: true,
    },
    statusEvents: { type: [statusEventSchema], default: [] },
    failureReason: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

platformWhatsAppMessageSchema.index({ conversationId: 1, timestamp: -1 });
platformWhatsAppMessageSchema.index({ campaignId: 1, status: 1 });

module.exports = {
  schema: platformWhatsAppMessageSchema,
  model:
    mongoose.models.PlatformWhatsAppMessage ||
    mongoose.model('PlatformWhatsAppMessage', platformWhatsAppMessageSchema),
};
