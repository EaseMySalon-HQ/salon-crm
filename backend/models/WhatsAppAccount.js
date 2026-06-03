/**
 * Per-business WhatsApp Cloud API account (Meta Embedded Signup result).
 * Lives on the main DB; one row per business.
 */

'use strict';

const mongoose = require('mongoose');

const whatsappAccountSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      unique: true,
      index: true,
    },
    wabaId: { type: String, required: true },
    metaBusinessId: { type: String, default: null },
    phoneNumberId: { type: String, required: true },
    phoneE164: { type: String, default: null },
    displayName: { type: String, default: null },

    // Encrypted access token (envelope from backend/lib/crypto.js).
    accessTokenCipher: { type: String, default: null },
    tokenVersion: { type: Number, default: 1 },
    tokenCreatedAt: { type: Date, default: null },
    tokenLastRotatedAt: { type: Date, default: null },
    tokenLastUsedAt: { type: Date, default: null },
    tokenExpiresAt: { type: Date, default: null },

    // Meta health metadata (refreshed by the rotation job).
    qualityRating: { type: String, default: null }, // GREEN | YELLOW | RED
    messagingLimitTier: { type: String, default: null }, // TIER_50 | TIER_250 | ...
    webhookVerified: { type: Boolean, default: false },

    /**
     * State captured from `account_update`, `account_review_update`,
     * `account_settings_update`, `business_status_update` and
     * `business_capability_update` webhooks. Each stores Meta's most recent
     * value so the admin UI can surface verification + capability state
     * without re-querying Graph.
     */
    accountReviewStatus: { type: String, default: null }, // APPROVED | PENDING | REJECTED | etc.
    businessVerificationStatus: { type: String, default: null },
    decisionState: { type: String, default: null }, // PASS / FAIL / PENDING per Meta docs
    bannedAt: { type: Date, default: null },
    restrictedAt: { type: Date, default: null },
    restrictionType: { type: String, default: null },

    /**
     * `business_capability_update` payload — limits Meta enforces on this
     * account (max numbers per business / per WABA, max daily conversations).
     */
    capabilities: {
      maxPhoneNumbersPerBusiness: { type: Number, default: null },
      maxPhoneNumbersPerWaba: { type: Number, default: null },
      maxDailyConversationPerPhone: { type: Number, default: null },
    },

    /**
     * `payment_configuration_update` — payment method status reported by Meta.
     * Useful for surfacing "Add a card" warnings before a billing failure.
     */
    paymentStatus: { type: String, default: null }, // ACTIVE | INACTIVE | PENDING
    paymentReason: { type: String, default: null },

    /**
     * `phone_number_*` enrichment — capture beyond just qualityRating so the
     * admin UI can show throughput and verified status in one place.
     */
    phoneCodeVerificationStatus: { type: String, default: null },
    phoneNameStatus: { type: String, default: null },
    phoneThroughputLevel: { type: String, default: null },

    /**
     * `security` events — TFA / certificate changes. Append-only mirror keeps
     * the most recent N events for fast admin display; the audit log is the
     * full history.
     */
    securityEvents: {
      type: [
        {
          event: { type: String, default: null },
          requester: { type: String, default: null },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    /**
     * Webhook heartbeat — populated on every accepted webhook. Lets ops
     * detect a tunnel that silently stopped delivering events.
     */
    lastWebhookEventAt: { type: Date, default: null },
    lastWebhookField: { type: String, default: null },

    connectedAt: { type: Date, default: null },
    disconnectedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ['connected', 'disconnected', 'error'],
      default: 'disconnected',
      index: true,
    },
    mode: {
      type: String,
      enum: ['test', 'live'],
      default: 'test',
    },
    testRecipientWhitelist: { type: [String], default: [] },
    lastErrorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

whatsappAccountSchema.index({ status: 1, lastSyncAt: -1 });

module.exports = {
  schema: whatsappAccountSchema,
  model: mongoose.models.WhatsAppAccount || mongoose.model('WhatsAppAccount', whatsappAccountSchema),
};
