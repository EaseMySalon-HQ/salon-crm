/**
 * Unified outbound + inbound WhatsApp message log. Replaces the legacy
 * `WhatsAppMessageLog` collection going forward; the old collection is kept
 * read-only for 30 days for rollback.
 */

'use strict';

const mongoose = require('mongoose');

const STATUS_PRIORITY = Object.freeze({
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 99,
});

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const whatsappMessageSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['meta', 'msg91', 'gupshup'],
      required: true,
      default: 'meta',
      index: true,
    },
    direction: {
      type: String,
      enum: ['outbound', 'inbound'],
      required: true,
      default: 'outbound',
      index: true,
    },
    recipientPhone: { type: String, required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WhatsAppTemplate',
      default: null,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WhatsAppCampaign',
      default: null,
      index: true,
    },

    intent: { type: String, default: null, index: true },
    category: {
      type: String,
      enum: ['marketing', 'utility', 'authentication', 'service'],
      default: null,
      index: true,
    },

    metaMessageId: { type: String, default: null },
    // Provider-agnostic message id (Meta wamid / Gupshup message id). Populated
    // for every provider; metaMessageId is kept for back-compat during the
    // Gupshup migration and mirrors this for Meta sends.
    providerMessageId: { type: String, default: null },
    dedupeKey: { type: String, default: null },

    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WhatsAppConversation',
      default: null,
      index: true,
    },
    freeWindow: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'read', 'failed', 'deleted'],
      required: true,
      default: 'queued',
      index: true,
    },
    statusEvents: { type: [statusEventSchema], default: [] },

    failureCode: { type: String, default: null },
    failureReason: { type: String, default: null },

    inboundText: { type: String, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },

    costPaise: { type: Number, default: null },
    priceListVersion: { type: String, default: null },
    countryCode: { type: String, default: null },

    // Meta-reported telemetry from status webhooks (per Graph API v23.0 spec).
    // We persist these so reports use Meta's source of truth instead of
    // re-deriving free-window / category from local state.
    metaConversationId: { type: String, default: null, index: true },
    metaConversationExpiresAt: { type: Date, default: null },
    metaConversationOrigin: { type: String, default: null },
    metaPricingModel: { type: String, default: null }, // CBP | PMP
    metaPricingCategory: { type: String, default: null },
    metaPricingBillable: { type: Boolean, default: null },

    relatedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    relatedEntityType: { type: String, default: null },

    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

whatsappMessageSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);
whatsappMessageSchema.index({ businessId: 1, timestamp: -1 });
whatsappMessageSchema.index({ businessId: 1, status: 1, timestamp: -1 });
whatsappMessageSchema.index({ businessId: 1, recipientPhone: 1, timestamp: -1 }, { background: true });
whatsappMessageSchema.index({ campaignId: 1, status: 1 });
whatsappMessageSchema.index({ clientId: 1, timestamp: -1 });
whatsappMessageSchema.index(
  { metaMessageId: 1 },
  { sparse: true, name: 'metaMessageId_1_sparse', background: true }
);
whatsappMessageSchema.index(
  { providerMessageId: 1 },
  { sparse: true, name: 'providerMessageId_1_sparse', background: true }
);

module.exports = {
  schema: whatsappMessageSchema,
  STATUS_PRIORITY,
  model:
    mongoose.models.WhatsAppMessage ||
    mongoose.model('WhatsAppMessage', whatsappMessageSchema),
};
