'use strict';

const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'], required: true },
    text: { type: String, required: true },
    url: { type: String, default: null },
    phone: { type: String, default: null },
    /** Full example URL required by Gupshup when `url` contains {{N}} placeholders. */
    urlExample: { type: String, default: null },
  },
  { _id: false }
);

const componentSchema = new mongoose.Schema(
  {
    header: {
      format: { type: String, enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', null], default: null },
      text: { type: String, default: null },
    },
    body: {
      text: { type: String, default: null },
      examples: { type: [[String]], default: [] },
    },
    footer: { text: { type: String, default: null } },
    buttons: { type: [buttonSchema], default: [] },
  },
  { _id: false }
);

const platformWhatsAppTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    language: { type: String, required: true, default: 'en_US' },
    category: {
      type: String,
      enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
      required: true,
    },
    /** Optional link to AdminSettings.notifications.whatsapp.templates slot on sync. */
    slotKey: { type: String, default: null },
    /** When false, hidden from tenant library browse (admin can unpublish test templates). */
    publishedToTenantLibrary: { type: Boolean, default: true, index: true },
    components: { type: componentSchema, default: () => ({}) },
    gupshupTemplateId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected', 'paused', 'disabled', 'in_appeal', 'flagged'],
      default: 'draft',
      index: true,
    },
    rejectionReason: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

platformWhatsAppTemplateSchema.index({ name: 1, language: 1 }, { unique: true });

module.exports = {
  schema: platformWhatsAppTemplateSchema,
  model:
    mongoose.models.PlatformWhatsAppTemplate ||
    mongoose.model('PlatformWhatsAppTemplate', platformWhatsAppTemplateSchema),
};
