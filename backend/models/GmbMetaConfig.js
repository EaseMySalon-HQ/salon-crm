/**
 * Platform-wide Google OAuth app credentials (main DB).
 */

'use strict';

const mongoose = require('mongoose');

const gmbMetaConfigSchema = new mongoose.Schema(
  {
    scope: { type: String, default: 'platform', unique: true },
    clientId: { type: String, default: null },
    clientSecretCipher: { type: String, default: null },
    redirectUri: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = {
  schema: gmbMetaConfigSchema,
  model: mongoose.models.GmbMetaConfig || mongoose.model('GmbMetaConfig', gmbMetaConfigSchema),
};
