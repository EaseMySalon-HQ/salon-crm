/**
 * WhatsApp messages for GMB review requests and negative review alerts.
 */

'use strict';

const { sendWhatsApp } = require('./send-whatsapp');
const { INTENTS } = require('./whatsapp-intents');
const { logger } = require('../utils/logger');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function appendUtm(url, params) {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

async function sendGmbReviewRequest({ business, account, appointment, models }) {
  const { Client, BusinessSettings, GmbReviewRequestLog } = models;
  const client = await Client.findById(appointment.clientId).lean();
  if (!client?.phone) return false;
  if (client.whatsappConsent?.optedIn === false) return false;

  const settings = await BusinessSettings.findOne().lean();
  const salonName = settings?.businessName || business.name || 'Our salon';
  const reviewUrl = appendUtm(settings?.googleReviewUrl || '', {
    utm_source: 'google',
    utm_medium: 'gmb',
    utm_campaign: 'review_request',
  });

  const message = `Hi ${client.name || 'there'}, thank you for visiting ${salonName} today! We hope you loved your experience. It would mean a lot if you could leave us a quick Google review — it helps other customers find us. ${reviewUrl} — Team ${salonName}`;

  try {
    const result = await sendWhatsApp({
      businessId: business._id,
      clientId: client._id,
      recipientPhone: client.phone,
      intent: INTENTS.MARKETING_CAMPAIGN,
      isService: true,
      serviceText: message,
      related: { type: 'gmb_review_request', appointmentId: String(appointment._id) },
    });

    await GmbReviewRequestLog.create({
      clientId: client._id,
      appointmentId: appointment._id,
      messageId: result?.messageId || null,
    });
    return true;
  } catch (err) {
    logger.warn('[send-gmb-whatsapp] review request failed:', err?.message);
    return false;
  }
}

async function sendGmbNegativeReviewAlert({ business, account, review, models, escalation = false }) {
  const { BusinessSettings } = models;
  const settings = await BusinessSettings.findOne().lean();
  const ownerPhone = settings?.phone || business.phone;
  if (!ownerPhone) return false;

  const excerpt = (review.comment || '').slice(0, 120);
  const deepLink = `${FRONTEND_URL}/gmb/reviews?reviewId=${encodeURIComponent(review.reviewId)}`;
  const prefix = escalation ? 'Reminder: ' : '';
  const message = `${prefix}New ${review.starRating}★ Google review from ${review.reviewerName}: "${excerpt}" — Reply now: ${deepLink}`;

  try {
    await sendWhatsApp({
      businessId: business._id,
      recipientPhone: ownerPhone,
      intent: INTENTS.STAFF_ALERT,
      isService: true,
      serviceText: message,
      related: { type: 'gmb_negative_alert', reviewId: review.reviewId },
    });
    return true;
  } catch (err) {
    logger.warn('[send-gmb-whatsapp] negative alert failed:', err?.message);
    return false;
  }
}

module.exports = {
  sendGmbReviewRequest,
  sendGmbNegativeReviewAlert,
  appendUtm,
};
