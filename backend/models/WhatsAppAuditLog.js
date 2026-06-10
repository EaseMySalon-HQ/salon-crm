/**
 * Append-only audit log for the WhatsApp Business module.
 * Persists connect/disconnect, template lifecycle, campaign sends, opt-in/out,
 * webhook replays, and token rotations.
 */

'use strict';

const mongoose = require('mongoose');

const EVENTS = Object.freeze([
  // Account / connection lifecycle
  'waba_connect',
  'waba_disconnect',
  'waba_mode_change',

  // Template lifecycle (incl. Meta auto-recategorization)
  'template_submit',
  'template_approved',
  'template_rejected',
  'template_paused',
  'template_disabled',
  'template_category_change',
  'template_components_change',
  'template_quality_change',

  // Campaigns
  'campaign_create',
  'campaign_send',
  'campaign_cancel',
  'campaign_complete',
  'campaign_failed',

  // Consent
  'client_optin',
  'client_optout',
  'client_user_preference', // user_preferences webhook (Meta-level opt-out)

  // Operational
  'webhook_replay',
  'token_rotate',
  'inbox_reply',

  // Account / business / phone state webhooks
  'account_update',
  'account_review_update',
  'account_settings_update',
  'account_alert',
  'business_capability_update',
  'business_status_update',
  'payment_configuration_update',
  'security_event',
  'phone_quality_update',
  'phone_name_update',

  // Multi-device / handover surface
  'message_echo',
  'smb_message_echo',
  'smb_app_state_sync',
  'messaging_handover',
  'standby_message',

  // Conversational extensions
  'flow_event',
  'call_event',
  'group_event',
  'history_event',
  'partner_solution_event',
  'tracking_event',
  'automatic_event',

  // Catch-all for any field Meta adds that we haven't surfaced yet — never
  // silently dropped, always landed here for forensic review.
  'unhandled_webhook',
]);

const whatsappAuditLogSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: ['user', 'admin', 'system', 'webhook'],
      required: true,
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    event: { type: String, enum: EVENTS, required: true, index: true },
    summary: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

whatsappAuditLogSchema.index({ businessId: 1, createdAt: -1 });
whatsappAuditLogSchema.index({ businessId: 1, event: 1, createdAt: -1 });

// Append-only: block updates and deletes.
whatsappAuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function block(next) {
  return next(new Error('WhatsAppAuditLog is append-only'));
});
whatsappAuditLogSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function block(next) {
  return next(new Error('WhatsAppAuditLog is append-only'));
});

module.exports = {
  schema: whatsappAuditLogSchema,
  EVENTS,
  model:
    mongoose.models.WhatsAppAuditLog ||
    mongoose.model('WhatsAppAuditLog', whatsappAuditLogSchema),
};
