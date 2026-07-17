'use strict';

const mongoose = require('mongoose');

const platformWhatsAppConversationSchema = new mongoose.Schema(
  {
    recipientPhone: { type: String, required: true, index: true },
    platformLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformLead',
      default: null,
      index: true,
    },
    cswOpenAt: { type: Date, default: null },
    cswExpiresAt: { type: Date, default: null },
    fepOpenAt: { type: Date, default: null },
    fepExpiresAt: { type: Date, default: null },
    lastInboundAt: { type: Date, default: null },
    lastOutboundAt: { type: Date, default: null },
    lastInboundPreview: { type: String, default: null },
    assignedAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    resolved: { type: Boolean, default: false },
    unreadCount: { type: Number, default: 0 },
    marketingOptOut: { type: Boolean, default: false },
  },
  { timestamps: true }
);

platformWhatsAppConversationSchema.index({ recipientPhone: 1 }, { unique: true });
platformWhatsAppConversationSchema.index({ cswExpiresAt: -1 });
platformWhatsAppConversationSchema.index({ lastInboundAt: -1 });
platformWhatsAppConversationSchema.index({ unreadCount: 1, lastInboundAt: -1 });

platformWhatsAppConversationSchema.methods.hasOpenFreeWindow = function hasOpenFreeWindow(now = new Date()) {
  const cswOpen = this.cswExpiresAt && this.cswExpiresAt.getTime() > now.getTime();
  const fepOpen = this.fepExpiresAt && this.fepExpiresAt.getTime() > now.getTime();
  return Boolean(cswOpen || fepOpen);
};

module.exports = {
  schema: platformWhatsAppConversationSchema,
  model:
    mongoose.models.PlatformWhatsAppConversation ||
    mongoose.model('PlatformWhatsAppConversation', platformWhatsAppConversationSchema),
};
