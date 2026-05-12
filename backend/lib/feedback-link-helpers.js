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

module.exports = {
  buildFeedbackPublicUrl,
  ensureFeedbackTokenPersisted,
};
