'use strict';

const { logger } = require('../utils/logger');

const MARK_FIELD = 'settings._emailPolicyDefaultsV1';

/**
 * One-time migration: turn on all operational email toggles for every business
 * that has not yet been stamped. Does not change platformEmailDisabled.
 */
async function migrateBusinessEmailDefaultsV1(Business) {
  try {
    const filter = { [MARK_FIELD]: { $ne: true } };
    const update = {
      $set: {
        [MARK_FIELD]: true,
        'settings.emailNotificationSettings.enabled': true,
        'settings.emailNotificationSettings.dailySummary.enabled': true,
        'settings.emailNotificationSettings.dailySummary.mode': 'fixedTime',
        'settings.emailNotificationSettings.weeklySummary.enabled': true,
        'settings.emailNotificationSettings.appointmentNotifications.enabled': true,
        'settings.emailNotificationSettings.appointmentNotifications.newAppointments': true,
        'settings.emailNotificationSettings.appointmentNotifications.cancellations': true,
        'settings.emailNotificationSettings.receiptNotifications.enabled': true,
        'settings.emailNotificationSettings.receiptNotifications.sendToClients': true,
        'settings.emailNotificationSettings.exportNotifications.enabled': true,
        'settings.emailNotificationSettings.systemAlerts.enabled': true,
        'settings.emailNotificationSettings.systemAlerts.lowInventory': true,
        'settings.emailNotificationSettings.systemAlerts.paymentFailures': true,
        'settings.emailNotificationSettings.systemAlerts.systemErrors': true,
      },
    };
    const result = await Business.updateMany(filter, update);
    if (result.matchedCount > 0) {
      logger.info(
        `[migrate] emailPolicyDefaultsV1: matched ${result.matchedCount}, modified ${result.modifiedCount}`
      );
    }
  } catch (err) {
    logger.error('[migrate] emailPolicyDefaultsV1 failed:', err);
  }
}

module.exports = { migrateBusinessEmailDefaultsV1, MARK_FIELD };
