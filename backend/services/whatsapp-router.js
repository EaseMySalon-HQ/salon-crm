/**
 * Intent-aware WhatsApp provider router.
 *
 * Decides per-(business, intent):
 *   - which provider to call (Meta vs MSG91 vs SMS-first)
 *   - which message category to bill at
 *   - whether the upcoming send falls in a free CSW/FEP window
 *   - the expected cost in paise (for pre-flight wallet checks)
 *
 * This is the single source of truth callers should use; nobody outside the
 * pipeline should branch on `account.status` directly.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { resolveCostPaise, PRICE_LIST_VERSION } = require('../config/whatsapp-pricing');
const { getDescriptor, isValidIntent } = require('../lib/whatsapp-intents');
const { logger } = require('../utils/logger');

async function getMainConnection() {
  return databaseManager.getMainConnection();
}

async function loadAccount(businessId) {
  const main = await getMainConnection();
  const Account = main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema);
  return Account.findOne({ businessId }).lean();
}

/**
 * Load the per-business addon flags that gate which provider this router is
 * allowed to return. The Meta path requires `waba` add-on; the legacy MSG91
 * path requires `whatsapp` add-on. We DO NOT fall through silently — if
 * neither flag is on, `route()` returns `provider: null` with a reason.
 */
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
 * @param {Object} args
 * @param {string|object} args.businessId
 * @param {string} args.intent
 * @param {string} [args.recipientPhone]
 * @param {string} [args.countryCode] defaults to 'IN'
 * @returns {Promise<{
 *   provider: 'meta'|'msg91'|'sms',
 *   category: string,
 *   useFreeWindow: boolean,
 *   costExpectedPaise: number,
 *   priceListVersion: string,
 *   accountMode: 'test'|'live'|'none',
 *   reason: string|null
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
  /**
   * Meta is selectable only when BOTH:
   *   1. The `waba` add-on is enabled for this business (commercial gate).
   *   2. The WABA itself is connected on the platform side.
   * If `waba` is OFF the salon hasn't paid for the new pipeline; we must
   * fall through to MSG91 (legacy `whatsapp` add-on) instead.
   */
  const isMetaConnected = Boolean(account && account.status === 'connected');
  const isMetaAllowed = wabaEnabled && isMetaConnected;
  const accountMode = account?.mode || 'none';

  const conversation = await loadConversation({ businessId, recipientPhone });
  const inFreeWindow = desc.cswFreeIfOpen ? isFreeWindowOpen(conversation) : false;

  let provider = null;
  let reason = null;
  switch (desc.providerPolicy) {
    case 'meta_only':
      if (isMetaAllowed) {
        provider = 'meta';
      } else if (!wabaEnabled) {
        provider = null;
        reason = 'WABA Integration add-on is not enabled for this business';
      } else {
        provider = null;
        reason = 'Meta WABA not connected';
      }
      break;
    case 'meta_then_msg91':
      if (isMetaAllowed) {
        provider = 'meta';
      } else if (whatsappEnabled) {
        provider = 'msg91';
        reason = wabaEnabled
          ? 'Falling back to MSG91 (WABA not connected)'
          : 'WABA add-on disabled — using legacy MSG91';
      } else if (wabaEnabled) {
        provider = null;
        reason = 'Meta WABA not connected and legacy WhatsApp (MSG91) add-on is disabled';
      } else {
        provider = null;
        reason = 'Neither WABA nor WhatsApp (MSG91) add-on is enabled';
      }
      break;
    case 'sms_first':
      provider = 'sms';
      break;
    default:
      if (isMetaAllowed) provider = 'meta';
      else if (whatsappEnabled) provider = 'msg91';
      else { provider = null; reason = 'No WhatsApp channel enabled'; }
  }

  const costExpectedPaise = resolveCostPaise({
    category: desc.category,
    countryCode: countryCode || 'IN',
    freeWindow: inFreeWindow,
  });

  return {
    provider,
    category: desc.category,
    useFreeWindow: inFreeWindow,
    costExpectedPaise,
    priceListVersion: PRICE_LIST_VERSION,
    accountMode,
    reason,
  };
}

/** Convenience helper used by older call sites — boolean only. */
async function isWabaConnected(businessId) {
  try {
    const account = await loadAccount(businessId);
    return Boolean(account && account.status === 'connected');
  } catch (err) {
    logger.warn('[whatsapp-router] isWabaConnected failed:', err?.message || err);
    return false;
  }
}

module.exports = {
  route,
  isWabaConnected,
  loadAccount,
  loadAddonFlags,
  loadConversation,
  isFreeWindowOpen,
};
