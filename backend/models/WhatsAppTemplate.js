/**
 * WhatsApp template (Meta Cloud API). Replaces the legacy
 * `BusinessMarketingTemplate` collection going forward.
 */

'use strict';

const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'],
      required: true,
    },
    text: { type: String, required: true },
    url: { type: String, default: null },
    phone: { type: String, default: null },
  },
  { _id: false }
);

const componentSchema = new mongoose.Schema(
  {
    header: {
      format: {
        type: String,
        enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', null],
        default: null,
      },
      text: { type: String, default: null },
      mediaSampleUrl: { type: String, default: null },
    },
    body: {
      text: { type: String, default: null },
      examples: { type: [[String]], default: [] },
    },
    footer: {
      text: { type: String, default: null },
    },
    buttons: { type: [buttonSchema], default: [] },
  },
  { _id: false }
);

const whatsappTemplateSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    language: { type: String, required: true, default: 'en_US' },
    category: {
      type: String,
      enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
      required: true,
      index: true,
    },
    /**
     * If Meta auto-recategorizes a template (e.g. MARKETING → UTILITY) the
     * previous category is reported via `previous_category` on the template
     * read endpoint. We surface it in the UI so salons see the change.
     */
    previousCategory: {
      type: String,
      enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION', null],
      default: null,
    },
    components: { type: componentSchema, default: () => ({}) },
    /** Variable map keyed by placeholder index (1-based) → label/sampleValue. */
    variables: { type: mongoose.Schema.Types.Mixed, default: {} },
    samples: { type: mongoose.Schema.Types.Mixed, default: {} },

    metaTemplateId: { type: String, default: null, index: true },
    metaTemplateName: { type: String, default: null },

    status: {
      type: String,
      /**
       * Mirror Meta's full template state machine. Local-only states are:
       *  - `draft`  : never submitted yet
       * Meta-reported states (lower-cased on persist):
       *  - `pending`   : submitted, awaiting Meta review
       *  - `in_appeal` : rejected once, appeal in progress
       *  - `approved`  : usable for sends
       *  - `rejected`  : Meta rejected; can be edited or deleted
       *  - `paused`    : auto-paused (often due to quality drops)
       *  - `flagged`   : Meta flagged for policy violation
       *  - `disabled`  : permanently disabled by Meta
       */
      enum: [
        'draft',
        'pending',
        'in_appeal',
        'approved',
        'rejected',
        'paused',
        'flagged',
        'disabled',
      ],
      default: 'draft',
      index: true,
    },
    rejectionReason: { type: String, default: null },
    qualityScore: { type: String, default: null },

    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },

    /**
     * Captured from `template_correct_category_detection` — Meta detected
     * the template should be a different category. Operators can review
     * and either accept (category will be auto-changed via
     * `template_category_update`) or appeal.
     */
    detectedCorrectCategory: { type: String, default: null },
    detectedCorrectCategoryAt: { type: Date, default: null },

    /**
     * Captured from `message_template_components_update` — when an admin
     * edits a template in Meta Manager, components arrive here so we can
     * keep our local copy in sync without a full template re-fetch.
     */
    lastComponentsUpdateAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Set by the migration script when a template was lifted from BusinessMarketingTemplate. */
    legacyMsg91TemplateId: { type: String, default: null },
  },
  { timestamps: true }
);

whatsappTemplateSchema.index(
  { businessId: 1, name: 1, language: 1 },
  { unique: true }
);
whatsappTemplateSchema.index({ businessId: 1, status: 1, updatedAt: -1 });

module.exports = {
  schema: whatsappTemplateSchema,
  model:
    mongoose.models.WhatsAppTemplate ||
    mongoose.model('WhatsAppTemplate', whatsappTemplateSchema),
};
