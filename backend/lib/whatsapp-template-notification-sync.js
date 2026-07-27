'use strict';

/** Map slotKey → legacy appointmentNotifications field. */
const APPOINTMENT_SLOT_LEGACY_FIELDS = Object.freeze({
  appointmentScheduling: 'newAppointments',
  appointmentConfirmation: 'confirmations',
  appointmentReminder: 'reminders',
  appointmentReschedule: 'reschedule',
  appointmentCancellation: 'cancellations',
});

const SIMPLE_SLOT_LEGACY_KEYS = Object.freeze({
  clientWalletTransaction: 'clientWalletTransactionNotifications',
  clientWalletExpiryReminder: 'clientWalletExpiryReminderNotifications',
  clientDuesReminder: 'clientDuesReminderNotifications',
  clientBirthdayReminder: 'clientBirthdayReminderNotifications',
});

function getLegacyEnabledForSlot(settings, slotKey) {
  const appt = settings.appointmentNotifications || {};
  const receipt = settings.receiptNotifications || {};
  switch (slotKey) {
    case 'appointmentScheduling':
      return appt.enabled !== false && appt.newAppointments !== false;
    case 'appointmentConfirmation':
      return appt.enabled !== false && appt.confirmations !== false;
    case 'appointmentReminder':
      return appt.enabled !== false && appt.reminders !== false;
    case 'appointmentReschedule':
      return appt.enabled !== false && appt.reschedule !== false;
    case 'appointmentCancellation':
      return appt.enabled !== false && appt.cancellations !== false;
    case 'receipt':
      return receipt.enabled !== false;
    case 'receiptWithFeedback':
      return receipt.enabled !== false && receipt.includeFeedbackLink === true;
    case 'receiptCancellation':
      return receipt.enabled !== false;
    case 'clientWalletTransaction':
      return settings.clientWalletTransactionNotifications?.enabled !== false;
    case 'clientWalletExpiryReminder':
      return settings.clientWalletExpiryReminderNotifications?.enabled !== false;
    case 'clientDuesReminder':
      return settings.clientDuesReminderNotifications?.enabled !== false;
    case 'clientBirthdayReminder':
      return settings.clientBirthdayReminderNotifications?.enabled !== false;
    default:
      return true;
  }
}

function readTemplateNotificationEnabled(settings, slotKey) {
  const entry = settings.templateNotifications?.[slotKey];
  if (entry && typeof entry === 'object' && typeof entry.enabled === 'boolean') {
    return entry.enabled;
  }
  return getLegacyEnabledForSlot(settings, slotKey);
}

/**
 * Build templateNotifications map for published slots, preserving explicit saves.
 */
function buildTemplateNotificationsFromSettings(settings, publishedSlotKeys = []) {
  const existing = settings.templateNotifications && typeof settings.templateNotifications === 'object'
    ? { ...settings.templateNotifications }
    : {};

  for (const slotKey of publishedSlotKeys) {
    if (!existing[slotKey] || typeof existing[slotKey].enabled !== 'boolean') {
      existing[slotKey] = { enabled: getLegacyEnabledForSlot(settings, slotKey) };
    }
  }

  return existing;
}

/**
 * After templateNotifications change, keep legacy nested toggles in sync for send paths that still read them.
 */
function syncLegacyFromTemplateNotifications(settings) {
  if (!settings?.templateNotifications || typeof settings.templateNotifications !== 'object') {
    return settings;
  }

  const tn = settings.templateNotifications;
  const get = (slotKey) => {
    const v = tn[slotKey];
    if (v && typeof v.enabled === 'boolean') return v.enabled;
    return undefined;
  };

  const apptSlots = Object.keys(APPOINTMENT_SLOT_LEGACY_FIELDS);
  const anyApptExplicit = apptSlots.some((k) => get(k) !== undefined);
  if (anyApptExplicit) {
    settings.appointmentNotifications = {
      ...(settings.appointmentNotifications || {}),
      enabled: apptSlots.some((k) =>
        get(k) !== undefined ? get(k) : getLegacyEnabledForSlot(settings, k)
      ),
    };
    for (const [slotKey, field] of Object.entries(APPOINTMENT_SLOT_LEGACY_FIELDS)) {
      const v = get(slotKey);
      if (v !== undefined) {
        settings.appointmentNotifications[field] = v;
      }
    }
  }

  const receiptEnabled = get('receipt');
  const receiptFeedback = get('receiptWithFeedback');
  if (receiptEnabled !== undefined || receiptFeedback !== undefined) {
    const standardOn = receiptEnabled !== undefined ? receiptEnabled : getLegacyEnabledForSlot(settings, 'receipt');
    const feedbackOn =
      receiptFeedback !== undefined ? receiptFeedback : getLegacyEnabledForSlot(settings, 'receiptWithFeedback');
    settings.receiptNotifications = {
      ...(settings.receiptNotifications || {}),
      enabled: standardOn || feedbackOn,
    };
    if (receiptFeedback !== undefined) {
      settings.receiptNotifications.includeFeedbackLink = receiptFeedback;
    }
  }

  for (const [slotKey, legacyKey] of Object.entries(SIMPLE_SLOT_LEGACY_KEYS)) {
    const v = get(slotKey);
    if (v !== undefined) {
      settings[legacyKey] = { ...(settings[legacyKey] || {}), enabled: v };
    }
  }

  return settings;
}

/**
 * When legacy nested toggles change (old UI), mirror into templateNotifications for published slots.
 */
function syncTemplateNotificationsFromLegacy(settings, publishedSlotKeys = []) {
  if (!publishedSlotKeys.length) return settings.templateNotifications || {};
  const out = buildTemplateNotificationsFromSettings(settings, publishedSlotKeys);
  for (const slotKey of publishedSlotKeys) {
    out[slotKey] = { enabled: getLegacyEnabledForSlot(settings, slotKey) };
  }
  return out;
}

module.exports = {
  APPOINTMENT_SLOT_LEGACY_FIELDS,
  SIMPLE_SLOT_LEGACY_KEYS,
  getLegacyEnabledForSlot,
  readTemplateNotificationEnabled,
  buildTemplateNotificationsFromSettings,
  syncLegacyFromTemplateNotifications,
  syncTemplateNotificationsFromLegacy,
};
