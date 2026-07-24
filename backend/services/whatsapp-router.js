/**
 * Intent-aware WhatsApp provider router (Gupshup only).
 *
 * Sender resolution (in gupshup-config): connected salon app → else shared platform app.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { resolveCostPaise, PRICE_LIST_VERSION } = require('../config/whatsapp-pricing');
const { getDescriptor, isValidIntent } = require('../lib/whatsapp-intents');
const gupshupConfig = require('../lib/gupshup-config');
const { logger } = require('../utils/logger');

async function getMainConnection() {
  return databaseManager.getMainConnection();
}

async function loadAccount(businessId) {
  const main = await getMainConnection();
  const Account = main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema);
  return Account.findOne({ businessId }).lean();
}

async function loadAddonFlags(businessId) {
  const main = await getMainConnection();
  const Business = main.model('Business', require('../models/Business').schema);
  const business = await Business.findById(businessId).select('plan.addons').lean();
  const wabaEnabled = Boolean(business?.plan?.addons?.waba?.enabled);
  const whatsappEnabled = Boolean(business?.plan?.addons?.whatsapp?.enabled);
  return { wabaEnabled, whatsappEnabled };
}

async function loadConversation({ businessId, recipientPhone }) {
  if (!recipientPhone) return null;
  const main = await getMainConnection();
  const Conversation = main.model(
    'WhatsAppConversation',
    require('../models/WhatsAppConversation').schema
  );
  return Conversation.findOne({ businessId, recipientPhone }).lean();
}

function isFreeWindowOpen(conversation, now = new Date()) {
  if (!conversation) return false;
  const nowMs = now.getTime();
  const csw = conversation.cswExpiresAt && new Date(conversation.cswExpiresAt).getTime() > nowMs;
  const fep = conversation.fepExpiresAt && new Date(conversation.fepExpiresAt).getTime() > nowMs;
  return Boolean(csw || fep);
}

/**
 * @returns {Promise<{
 *   provider: 'gupshup'|'sms'|null,
 *   senderScope: 'business'|'platform'|null,
 *   ...
 * }>}
 */
async function route({ businessId, intent, recipientPhone, countryCode }) {
  if (!isValidIntent(intent)) {
    throw new Error(`whatsapp-router: invalid intent "${intent}"`);
  }
  const desc = getDescriptor(intent);
  const [account, addons] = await Promise.all([
    loadAccount(businessId),
    loadAddonFlags(businessId),
  ]);
  const { wabaEnabled, whatsappEnabled } = addons;

  const salonConnected = gupshupConfig.isBusinessAppUsable(account);
  const platformAvailable = await gupshupConfig.isPlatformConfiguredAsync();
  const gupshupAvailable = salonConnected || platformAvailable;
  const senderScope = salonConnected ? 'business' : platformAvailable ? 'platform' : null;

  const conversation = await loadConversation({ businessId, recipientPhone });
  const inFreeWindow = desc.cswFreeIfOpen ? isFreeWindowOpen(conversation) : false;

  let provider = null;
  let reason = null;
  let accountMode = salonConnected ? account.mode || 'live' : platformAvailable ? 'live' : 'none';

  switch (desc.providerPolicy) {
    case 'sms_first':
      provider = 'sms';
      break;
    case 'gupshup_only':
    default:
      if (!wabaEnabled && !whatsappEnabled) {
        reason = 'WhatsApp add-on is not enabled for this business';
      } else if (!gupshupAvailable) {
        reason = 'Gupshup not configured (connect your app or configure shared platform app)';
      } else {
        provider = 'gupshup';
        reason = salonConnected ? 'Gupshup salon app' : 'Gupshup shared platform';
      }
      break;
  }

  const costExpectedPaise = resolveCostPaise({
    category: desc.category,
    countryCode: countryCode || 'IN',
    freeWindow: inFreeWindow,
  });

  return {
    provider,
    senderScope,
    category: desc.category,
    useFreeWindow: inFreeWindow,
    costExpectedPaise,
    priceListVersion: PRICE_LIST_VERSION,
    accountMode,
    reason,
  };
}

/** True when the business has its own Gupshup app connected. */
async function isWabaConnected(businessId) {
  try {
    const account = await loadAccount(businessId);
    return gupshupConfig.isBusinessAppUsable(account);
  } catch (err) {
    logger.warn('[whatsapp-router] isWabaConnected failed:', err?.message || err);
    return false;
  }
}

/** Gupshup can send (own app or shared platform). */
async function isWhatsAppSendAvailable(businessId) {
  try {
    const account = await loadAccount(businessId);
    return gupshupConfig.isBusinessAppUsable(account) || (await gupshupConfig.isPlatformConfiguredAsync());
  } catch {
    return await gupshupConfig.isPlatformConfiguredAsync();
  }
}

module.exports = {
  route,
  isWabaConnected,
  isWhatsAppSendAvailable,
  loadAccount,
  loadAddonFlags,
  loadConversation,
  isFreeWindowOpen,
};
