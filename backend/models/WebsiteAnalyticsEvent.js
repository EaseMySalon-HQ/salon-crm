'use strict';

const mongoose = require('mongoose');

const WEBSITE_ANALYTICS_EVENTS = [
  'page_view',
  'book_appointment_click',
  'service_book_now_click',
  'whatsapp_click',
  'call_click',
  'directions_click',
  'product_enquiry',
  'package_enquiry',
  'membership_enquiry',
  'lead_submission',
];

const websiteAnalyticsEventSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    path: { type: String, default: '', maxlength: 500 },
    event: {
      type: String,
      enum: WEBSITE_ANALYTICS_EVENTS,
      required: true,
    },
    refId: { type: String, default: '' },
    sessionId: { type: String, default: '', maxlength: 64 },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    referer: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

websiteAnalyticsEventSchema.index({ businessId: 1, createdAt: -1 });
websiteAnalyticsEventSchema.index({ businessId: 1, event: 1, createdAt: -1 });
/** Auto-expire after ~400 days */
websiteAnalyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

module.exports = {
  WEBSITE_ANALYTICS_EVENTS,
  schema: websiteAnalyticsEventSchema,
  model:
    mongoose.models.WebsiteAnalyticsEvent ||
    mongoose.model('WebsiteAnalyticsEvent', websiteAnalyticsEventSchema),
};
