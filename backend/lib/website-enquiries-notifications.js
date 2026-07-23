'use strict';

const ENQUIRY_TYPE_LABELS = {
  bridal: 'Bridal',
  package: 'Package',
  membership: 'Membership',
  product: 'Product',
  product_request: 'Product request',
  general: 'General',
};

function summarizeEnquiry(row) {
  if (row.type === 'product_request' && Array.isArray(row.requestedProducts) && row.requestedProducts.length) {
    const products = row.requestedProducts
      .map((p) => `${p.productName || 'Product'}${p.quantity > 1 ? ` × ${p.quantity}` : ''}`)
      .join(', ');
    const fulfillment =
      row.fulfillmentType === 'delivery'
        ? 'Delivery'
        : row.fulfillmentType === 'pickup'
          ? 'Pickup'
          : '';
    return fulfillment ? `${fulfillment}: ${products}` : products;
  }
  const message = String(row.message || '').trim();
  if (message) return message.length > 120 ? `${message.slice(0, 117)}…` : message;
  return row.phone || '';
}

function serializeWebsiteEnquiryNotification(row) {
  return {
    id: String(row._id),
    type: row.type || 'general',
    typeLabel: ENQUIRY_TYPE_LABELS[row.type] || 'General',
    name: row.name || '',
    phone: row.phone || '',
    summary: summarizeEnquiry(row),
    createdAt: row.createdAt || null,
    href: '/settings?section=website&tab=enquiries',
  };
}

/**
 * Recent new website enquiries for the in-app notification center.
 *
 * @param {object} params
 * @param {import('mongoose').Types.ObjectId|string} params.branchId
 * @param {object} params.businessModels
 * @param {number} [params.limit]
 */
async function listNewWebsiteEnquiriesForNotifications({ branchId, businessModels, limit = 15 }) {
  const { WebsiteEnquiry } = businessModels;
  if (!WebsiteEnquiry) return [];

  const cap = Math.min(Math.max(Number(limit) || 15, 1), 50);
  const rows = await WebsiteEnquiry.find({ branchId, status: 'new' })
    .sort({ createdAt: -1 })
    .limit(cap)
    .lean();

  return rows.map(serializeWebsiteEnquiryNotification);
}

module.exports = {
  listNewWebsiteEnquiriesForNotifications,
  serializeWebsiteEnquiryNotification,
};
