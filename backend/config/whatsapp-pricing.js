/**
 * WhatsApp message pricing (Meta Cloud API).
 *
 * Per-message billing replaced per-conversation on Jul 1, 2025. Service messages
 * inside an open Customer Service Window (24h) are free; utility templates inside
 * the CSW or 72h Free Entry Point window are also free. Marketing and
 * authentication are always paid.
 *
 * Numbers below are placeholders denominated in paise (1 INR = 100 paise) — they
 * should be kept in sync with Meta's published rate card via the daily refresh
 * job (`backend/jobs/whatsapp-pricing-refresh.js`). The `priceListVersion` is
 * stamped on every WhatsAppMessage for audit.
 */

'use strict';

const PRICE_LIST_VERSION = '2026-04-30';

/**
 * Tier rates by ISO country code → category in paise.
 *
 * These figures track Meta's India rate card as of late 2025. When live rate
 * data lands via the refresh job, that loader overwrites this map in place.
 */
const RATE_TABLE = {
  IN: {
    marketing: 88, // ~₹0.88 per delivered marketing message
    utility: 11, // ~₹0.11 per delivered utility message (when paid)
    authentication: 11,
    authentication_intl: 23,
    service: 0,
  },
  // Default fallback for any country not yet in the map.
  DEFAULT: {
    marketing: 250,
    utility: 30,
    authentication: 30,
    authentication_intl: 50,
    service: 0,
  },
};

function lookup(countryCode = 'IN') {
  const code = (countryCode || 'IN').toUpperCase();
  return RATE_TABLE[code] || RATE_TABLE.DEFAULT;
}

/**
 * Resolve cost in paise for a (category, country, freeWindow) tuple.
 *
 * - service is always 0 (only allowed inside CSW; otherwise pre-flight rejects).
 * - utility is 0 inside CSW/FEP, otherwise the country rate.
 * - marketing/authentication are always priced.
 */
function resolveCostPaise({
  category,
  countryCode = 'IN',
  freeWindow = false,
  isInternationalAuth = false,
}) {
  const rates = lookup(countryCode);
  if (category === 'service') return 0;
  if (category === 'utility') return freeWindow ? 0 : rates.utility;
  if (category === 'marketing') return rates.marketing;
  if (category === 'authentication') {
    return isInternationalAuth ? rates.authentication_intl : rates.authentication;
  }
  return 0;
}

module.exports = {
  PRICE_LIST_VERSION,
  RATE_TABLE,
  lookup,
  resolveCostPaise,
};
