'use strict';

/**
 * Notify salon staff when a visitor submits a product purchase request on the mini-website.
 */

const emailService = require('../services/email-service');
const { logger } = require('../utils/logger');

function escapeHtml(str) {
  if (str == null || str === '') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function settingsUrl() {
  const base = (
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
  return `${base}/settings?section=website&tab=enquiries`;
}

/**
 * @param {object} opts
 * @param {object} opts.businessDoc
 * @param {object} [opts.businessModels]
 * @param {string} opts.customerName
 * @param {string} opts.customerPhone
 * @param {string} [opts.customerEmail]
 * @param {'delivery'|'pickup'} [opts.fulfillmentType]
 * @param {string} [opts.deliveryAddress]
 * @param {string} [opts.preferredPickupSlot]
 * @param {Array<{ productName: string, quantity: number }>} opts.items
 * @param {string} [opts.message]
 */
async function notifyWebsiteProductRequest({
  businessDoc,
  businessModels,
  customerName,
  customerPhone,
  customerEmail,
  fulfillmentType,
  deliveryAddress,
  preferredPickupSlot,
  items,
  message,
}) {
  try {
    let toEmail =
      businessDoc?.contact?.email ||
      businessDoc?.email ||
      '';
    if (!toEmail && businessModels?.BusinessSettings) {
      const settings = await businessModels.BusinessSettings.findOne()
        .select('email')
        .lean();
      toEmail = settings?.email || '';
    }
    if (!toEmail) {
      logger.debug('[website-product-request] No business email configured; skipping notify');
      return;
    }

    await emailService.initialize();
    if (!emailService.enabled) {
      logger.debug('[website-product-request] Email service disabled; skipping notify');
      return;
    }

    const salonName = businessDoc?.name || 'Your salon';
    const lines = (items || [])
      .map(
        (item) =>
          `• ${escapeHtml(item.productName || 'Product')}${item.quantity > 1 ? ` × ${item.quantity}` : ''}`
      )
      .join('<br>');

    const fulfillmentLabel =
      fulfillmentType === 'delivery' ? 'Delivery' : fulfillmentType === 'pickup' ? 'Pickup' : '';

    const html = `
      <p><strong>${escapeHtml(customerName)}</strong> requested products from your website.</p>
      ${fulfillmentLabel ? `<p><strong>Fulfillment:</strong> ${escapeHtml(fulfillmentLabel)}</p>` : ''}
      <p><strong>Phone:</strong> ${escapeHtml(customerPhone)}</p>
      ${customerEmail ? `<p><strong>Email:</strong> ${escapeHtml(customerEmail)}</p>` : ''}
      ${deliveryAddress ? `<p><strong>Delivery address:</strong><br>${escapeHtml(deliveryAddress).replace(/\n/g, '<br>')}</p>` : ''}
      ${preferredPickupSlot ? `<p><strong>Preferred pickup slot:</strong> ${escapeHtml(preferredPickupSlot)}</p>` : ''}
      <p><strong>Requested products:</strong><br>${lines || '—'}</p>
      ${message ? `<p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
      <p style="margin-top:16px"><a href="${settingsUrl()}">View enquiries in Settings</a></p>
    `;

    await emailService.sendEmail({
      to: toEmail,
      subject: `Product request from ${customerName} · ${salonName}`,
      html,
      text: [
        `${customerName} requested products from your website.`,
        fulfillmentLabel ? `Fulfillment: ${fulfillmentLabel}` : '',
        `Phone: ${customerPhone}`,
        customerEmail ? `Email: ${customerEmail}` : '',
        deliveryAddress ? `Delivery address: ${deliveryAddress}` : '',
        preferredPickupSlot ? `Preferred pickup slot: ${preferredPickupSlot}` : '',
        '',
        'Products:',
        ...(items || []).map(
          (i) => `- ${i.productName || 'Product'}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`
        ),
        message ? `\nMessage:\n${message}` : '',
        `\nView enquiries: ${settingsUrl()}`,
      ]
        .filter((line) => line !== undefined && line !== '')
        .join('\n'),
    });
  } catch (err) {
    logger.warn('[website-product-request] notify failed:', err?.message || err);
  }
}

module.exports = { notifyWebsiteProductRequest };
