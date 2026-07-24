/**
 * Intent registry for WhatsApp messaging. The router uses these descriptors to
 * decide provider, category, free-vs-paid window, and fallback channel.
 *
 * The category drives Meta's per-message billing model (effective Jul 1, 2025):
 *   - marketing       : always paid
 *   - authentication  : always paid (volume discounts)
 *   - utility         : free if delivered inside an open Customer Service Window;
 *                       otherwise paid at the utility rate
 *   - service         : free-form non-template; only allowed inside CSW; free
 */

'use strict';

const INTENTS = Object.freeze({
  APPOINTMENT_CONFIRMATION: 'appointment_confirmation',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  APPOINTMENT_RESCHEDULE: 'appointment_reschedule',
  APPOINTMENT_CANCELLATION: 'appointment_cancellation',
  INVOICE: 'invoice',
  PAYMENT_RECEIPT: 'payment_receipt',
  WALLET_UPDATE: 'wallet_update',
  WALLET_EXPIRY: 'wallet_expiry',
  PACKAGE_REMINDER: 'package_reminder',
  MARKETING_CAMPAIGN: 'marketing_campaign',
  OTP: 'otp',
  STAFF_ALERT: 'staff_alert',
  WELCOME: 'welcome',
});

/**
 * Provider policy (interpreted by whatsapp-router.js):
 *   gupshup_only — Gupshup Partner Portal (only supported WhatsApp provider)
 *   sms_first    — SMS provider first
 */
const DESCRIPTORS = Object.freeze({
  [INTENTS.APPOINTMENT_CONFIRMATION]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'sms',
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.APPOINTMENT_REMINDER]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'sms',
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.APPOINTMENT_RESCHEDULE]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'sms',
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.APPOINTMENT_CANCELLATION]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'sms',
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.INVOICE]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'sms',
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.PAYMENT_RECEIPT]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'sms',
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.WALLET_UPDATE]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'sms',
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.WALLET_EXPIRY]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'sms',
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.PACKAGE_REMINDER]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'sms',
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.MARKETING_CAMPAIGN]: {
    category: 'marketing',
    cswFreeIfOpen: false,
    fallbackChannel: null,
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.OTP]: {
    category: 'authentication',
    cswFreeIfOpen: false,
    fallbackChannel: 'sms',
    providerPolicy: 'sms_first',
  },
  [INTENTS.STAFF_ALERT]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'email',
    providerPolicy: 'gupshup_only',
  },
  [INTENTS.WELCOME]: {
    category: 'utility',
    cswFreeIfOpen: true,
    fallbackChannel: 'sms',
    providerPolicy: 'gupshup_only',
  },
});

function getDescriptor(intent) {
  return DESCRIPTORS[intent] || null;
}

function isValidIntent(intent) {
  return Object.prototype.hasOwnProperty.call(DESCRIPTORS, intent);
}

const INTENT_VALUES = Object.freeze(Object.values(INTENTS));

module.exports = {
  INTENTS,
  INTENT_VALUES,
  DESCRIPTORS,
  getDescriptor,
  isValidIntent,
};
