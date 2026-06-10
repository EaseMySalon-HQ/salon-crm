'use strict';

const crypto = require('crypto');

/**
 * @param {string} branchId - Tenant Business _id
 * @param {string} feedbackToken
 * @param {'whatsapp'|'sms'|'public_link'} [source]
 */
function buildFeedbackPublicUrl(branchId, feedbackToken, source = 'public_link') {
  if (!branchId || !feedbackToken) return null;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const s =
    source === 'whatsapp' || source === 'sms' || source === 'public_link'
      ? source
      : 'public_link';
  return `${frontendUrl}/feedback/${branchId}/${feedbackToken}?s=${encodeURIComponent(s)}`;
}

/**
 * Legacy sales may lack feedbackToken; generate and persist.
 * @param {import('mongoose').Model} Sale
 * @param {{ _id: unknown, feedbackToken?: string } | null} sale - lean or doc
 * @returns {Promise<string|null>}
 */
async function ensureFeedbackTokenPersisted(Sale, sale) {
  if (!sale || !sale._id) return null;
  if (sale.feedbackToken) return String(sale.feedbackToken);
  const token = crypto.randomBytes(32).toString('hex');
  await Sale.updateOne({ _id: sale._id }, { $set: { feedbackToken: token } });
  return token;
}

function buildReceiptPublicUrl(sale) {
  if (!sale?.shareToken || !sale?.billNo) return null;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${frontendUrl}/receipt/public/${sale.billNo}/${sale.shareToken}`;
}

/**
 * Receipt + direct feedback URLs for WhatsApp/SMS receipt templates.
 * @param {import('mongoose').Model} Sale
 * @param {string} businessId
 * @param {{ _id: unknown, billNo?: string, shareToken?: string, feedbackToken?: string } | null} sale
 * @param {'whatsapp'|'sms'} [source]
 */
async function buildSaleNotificationLinks(Sale, businessId, sale, source = 'whatsapp') {
  if (!sale) return { receiptLink: null, feedbackLink: null };
  const receiptLink = buildReceiptPublicUrl(sale);
  let feedbackLink = null;
  if (Sale && businessId) {
    const feedbackToken = await ensureFeedbackTokenPersisted(Sale, sale);
    if (feedbackToken) {
      feedbackLink = buildFeedbackPublicUrl(businessId, feedbackToken, source);
    }
  }
  return { receiptLink, feedbackLink };
}

/**
 * Whether this business may attach a feedback link to WhatsApp receipt sends.
 * Starter plans always use the plain receipt template.
 */
function canUseReceiptFeedbackLink(business) {
  if (!business) return false;
  const { hasFeature } = require('./entitlements');
  return hasFeature(business, 'feedback_management');
}

/**
 * Apply business WhatsApp settings + plan gate to a generated feedback URL.
 * @returns {string|null}
 */
function resolveReceiptFeedbackLinkForSend(business, whatsappSettings, feedbackLink) {
  if (!feedbackLink) return null;
  if (!canUseReceiptFeedbackLink(business)) return null;
  const includeFeedbackLink =
    whatsappSettings?.receiptNotifications?.includeFeedbackLink === true;
  return includeFeedbackLink ? feedbackLink : null;
}

module.exports = {
  buildFeedbackPublicUrl,
  buildReceiptPublicUrl,
  ensureFeedbackTokenPersisted,
  buildSaleNotificationLinks,
  canUseReceiptFeedbackLink,
  resolveReceiptFeedbackLinkForSend,
};
