/**
 * Resolve AdminSettings.notifications.whatsapp.{appointmentNotifications,receiptNotifications}
 * for send gates. Schema defaults are true, but missing paths read as undefined. Admin UI may
 * save boolean or nested { enabled } (same pattern as business settings).
 */
function isAdminWhatsappPreferenceTrueByDefault(whatsapp, key) {
  if (!whatsapp || typeof whatsapp !== 'object') return true;
  const v = whatsapp[key];
  if (v === false) return false;
  if (v === true) return true;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v.enabled !== false;
  }
  return true;
}

function isAdminAppointmentNotificationsEnabled(whatsapp) {
  return isAdminWhatsappPreferenceTrueByDefault(whatsapp, 'appointmentNotifications');
}

function isAdminReceiptNotificationsEnabled(whatsapp) {
  return isAdminWhatsappPreferenceTrueByDefault(whatsapp, 'receiptNotifications');
}

module.exports = {
  isAdminAppointmentNotificationsEnabled,
  isAdminReceiptNotificationsEnabled,
};
