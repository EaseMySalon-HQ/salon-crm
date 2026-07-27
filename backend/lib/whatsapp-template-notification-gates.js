'use strict';

const { getLegacyEnabledForSlot, syncLegacyFromTemplateNotifications, buildTemplateNotificationsFromSettings } =
  require('./whatsapp-template-notification-sync');

/**
 * Whether a tenant has this template notification enabled (master toggle + per-slot).
 * @param {object} settings — merged whatsappNotificationSettings (from getWhatsAppSettingsWithDefaults)
 * @param {string} slotKey
 */
function isTenantTemplateNotificationEnabled(settings, slotKey) {
  if (!settings || settings.enabled !== true) return false;
  const entry = settings.templateNotifications?.[slotKey];
  if (entry && typeof entry === 'object' && typeof entry.enabled === 'boolean') {
    return entry.enabled;
  }
  return getLegacyEnabledForSlot(settings, slotKey);
}

/** Whether receipt WhatsApp should send for the chosen template variant. */
function isTenantReceiptNotificationEnabled(settings, { includeFeedbackLink = false } = {}) {
  const slotKey = includeFeedbackLink ? 'receiptWithFeedback' : 'receipt';
  if (settings?.templateNotifications?.[slotKey] && typeof settings.templateNotifications[slotKey].enabled === 'boolean') {
    return isTenantTemplateNotificationEnabled(settings, slotKey);
  }
  if (settings?.receiptNotifications?.enabled === false) return false;
  if (includeFeedbackLink) {
    return settings?.receiptNotifications?.includeFeedbackLink === true;
  }
  return settings?.enabled === true;
}

/** Any appointment-related slot enabled (for grouped admin-style checks). */
function isAnyAppointmentTemplateEnabled(settings) {
  const slots = [
    'appointmentScheduling',
    'appointmentConfirmation',
    'appointmentReminder',
    'appointmentReschedule',
    'appointmentCancellation',
  ];
  return slots.some((slotKey) => isTenantTemplateNotificationEnabled(settings, slotKey));
}

module.exports = {
  isTenantTemplateNotificationEnabled,
  isTenantReceiptNotificationEnabled,
  isAnyAppointmentTemplateEnabled,
  getLegacyEnabledForSlot,
  syncLegacyFromTemplateNotifications,
  buildTemplateNotificationsFromSettings,
};
