/**
 * Conversation state per (businessId, recipientPhone). Tracks Meta's 24h
 * Customer Service Window (CSW) and the 72h Free Entry Point (FEP) window so
 * the sender can decide free vs paid for utility/service messages.
 */

'use strict';

const mongoose = require('mongoose');

const whatsappConversationSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    recipientPhone: { type: String, required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    cswOpenAt: { type: Date, default: null },
    cswExpiresAt: { type: Date, default: null },
    fepOpenAt: { type: Date, default: null },
    fepExpiresAt: { type: Date, default: null },

    lastInboundAt: { type: Date, default: null },
    lastOutboundAt: { type: Date, default: null },
    lastBusinessTemplateCategory: { type: String, default: null },

    /** Optional simple agent assignment for the inbox. */
    assignedTo: { type: mongoose.Schema.Types.ObjectId, default: null },
    resolved: { type: Boolean, default: false },
    unreadCount: { type: Number, default: 0 },
    lastInboundPreview: { type: String, default: null },
  },
  { timestamps: true }
);

whatsappConversationSchema.index(
  { businessId: 1, recipientPhone: 1 },
  { unique: true }
);
whatsappConversationSchema.index({ businessId: 1, cswExpiresAt: -1 });
whatsappConversationSchema.index({ businessId: 1, lastInboundAt: -1 });
whatsappConversationSchema.index({ businessId: 1, unreadCount: 1, lastInboundAt: -1 }, { background: true });
whatsappConversationSchema.index({ businessId: 1, resolved: 1, lastInboundAt: -1 }, { background: true });

/**
 * Returns whether the conversation has any free window currently open
 * (CSW within 24h OR FEP within 72h).
 */
whatsappConversationSchema.methods.hasOpenFreeWindow = function hasOpenFreeWindow(now = new Date()) {
  const cswOpen = this.cswExpiresAt && this.cswExpiresAt.getTime() > now.getTime();
  const fepOpen = this.fepExpiresAt && this.fepExpiresAt.getTime() > now.getTime();
  return Boolean(cswOpen || fepOpen);
};

module.exports = {
  schema: whatsappConversationSchema,
  model:
    mongoose.models.WhatsAppConversation ||
    mongoose.model('WhatsAppConversation', whatsappConversationSchema),
};
