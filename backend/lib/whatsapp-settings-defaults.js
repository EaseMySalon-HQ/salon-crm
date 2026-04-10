/**
 * Admin UI (and some legacy saves) stored receiptNotifications / appointmentNotifications /
 * systemAlerts as bare booleans. Business schema expects nested { enabled, ... }.
 */
function normalizeWhatsappNestedSection(raw, defaultsSection) {
  if (raw === true || raw === false) {
    return { ...defaultsSection, enabled: raw };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      ...defaultsSection,
      ...raw,
      enabled: Object.prototype.hasOwnProperty.call(raw, 'enabled')
        ? raw.enabled
        : defaultsSection.enabled
    };
  }
  return { ...defaultsSection };
}

/**
 * Merge Business.settings.whatsappNotificationSettings with defaults (same rules as GET email-notifications).
 */
function getWhatsAppSettingsWithDefaults(whatsappSettings) {
  const defaults = {
    enabled: false,
    receiptNotifications: {
      enabled: true,
      autoSendToClients: true,
      highValueThreshold: 0
    },
    appointmentNotifications: {
      enabled: false,
      newAppointments: false,
      confirmations: false,
      reminders: false,
      reschedule: false,
      cancellations: false
    },
    systemAlerts: {
      enabled: false,
      lowInventory: false,
      paymentFailures: false
    }
  };

  if (!whatsappSettings || typeof whatsappSettings !== 'object' || Array.isArray(whatsappSettings)) {
    return defaults;
  }

  const receiptNotifications = normalizeWhatsappNestedSection(
    whatsappSettings.receiptNotifications,
    defaults.receiptNotifications
  );
  const appointmentNotifications = normalizeWhatsappNestedSection(
    whatsappSettings.appointmentNotifications,
    defaults.appointmentNotifications
  );
  const systemAlerts = normalizeWhatsappNestedSection(
    whatsappSettings.systemAlerts,
    defaults.systemAlerts
  );

  const merged = {
    ...defaults,
    ...whatsappSettings,
    enabled: whatsappSettings.hasOwnProperty('enabled') ? whatsappSettings.enabled : defaults.enabled,
    receiptNotifications,
    appointmentNotifications,
    systemAlerts
  };

  if (merged.enabled === true) {
    const rawAppt = whatsappSettings.appointmentNotifications;
    const emptyApptObj =
      rawAppt &&
      typeof rawAppt === 'object' &&
      !Array.isArray(rawAppt) &&
      Object.keys(rawAppt).length === 0;

    if (rawAppt === undefined || emptyApptObj) {
      merged.appointmentNotifications = {
        ...merged.appointmentNotifications,
        enabled: true,
        confirmations: true,
        newAppointments: true,
        reminders: true,
        reschedule: true,
        cancellations: true
      };
    } else if (rawAppt && typeof rawAppt === 'object') {
      const hasEnabledKey = Object.prototype.hasOwnProperty.call(rawAppt, 'enabled');
      if (!hasEnabledKey && (rawAppt.confirmations === true || rawAppt.newAppointments === true)) {
        merged.appointmentNotifications = {
          ...merged.appointmentNotifications,
          enabled: true
        };
      }
    }
  }

  return merged;
}

module.exports = {
  normalizeWhatsappNestedSection,
  getWhatsAppSettingsWithDefaults
};
