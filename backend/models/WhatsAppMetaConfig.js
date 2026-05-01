/**
 * Platform-wide WhatsApp / Meta Cloud API configuration.
 *
 * One singleton document on the main DB (`scope: 'platform'`). Holds the App
 * ID, encrypted App Secret, Embedded Signup config ID, and encrypted webhook
 * verify token. Edited only through the admin settings UI; never via env.
 *
 * The encryption key (`WHATSAPP_TOKEN_ENC_KEY`) lives in env — that is the
 * only secret an operator needs to keep on the server.
 */

'use strict';

const mongoose = require('mongoose');

const whatsappMetaConfigSchema = new mongoose.Schema(
  {
    /** Always 'platform'. Provides a stable upsert key. */
    scope: { type: String, default: 'platform', unique: true, index: true },

    /** Public values — safe to ship to the browser bundle. */
    appId: { type: String, default: null },
    configId: { type: String, default: null },

    /**
     * Encrypted secrets (AES-256-GCM envelope strings; see backend/lib/crypto).
     * Plaintext is never read except inside `getMetaConfig()`.
     */
    appSecretCipher: { type: String, default: null },
    verifyTokenCipher: { type: String, default: null },

    /** Informational — the public callback URL we expect Meta to POST to. */
    webhookCallbackUrl: { type: String, default: null },

    /** Audit trail. */
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedByEmail: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = {
  schema: whatsappMetaConfigSchema,
  model:
    mongoose.models.WhatsAppMetaConfig ||
    mongoose.model('WhatsAppMetaConfig', whatsappMetaConfigSchema),
};
