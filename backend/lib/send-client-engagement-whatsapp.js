'use strict';

/**
 * WhatsApp sends for client dues reminders and birthday wishes (utility templates).
 */

const { logger } = require('../utils/logger');
const databaseManager = require('../config/database-manager');
const {
  isAdminClientDuesReminderNotificationsEnabled,
  isAdminClientBirthdayReminderNotificationsEnabled,
} = require('./whatsapp-admin-gates');
const { getWhatsAppSettingsWithDefaults } = require('./whatsapp-settings-defaults');
const { canUseAddon } = require('./entitlements');
const { canDeductWhatsApp, deductWhatsApp } = require('./wallet-deduction');
const { formatDuesAmount } = require('./client-dues-aggregator');

async function sendClientDuesReminderWhatsApp({ branchId, client, duesAmount, salonName }) {
  if (!branchId || !client?.phone || !(Number(duesAmount) > 0)) return { skipped: true };

  const whatsappService = require('../services/whatsapp-service');
  await whatsappService.initialize();
  if (!whatsappService.enabled) return { skipped: true };

  const mainConnection = await databaseManager.getMainConnection();
  const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

  const adminSettings = await AdminSettings.getSettings();
  const wa = adminSettings?.notifications?.whatsapp;
  if (wa?.enabled !== true) return { skipped: true };
  if (!isAdminClientDuesReminderNotificationsEnabled(wa)) return { skipped: true };

  const business = await Business.findById(branchId).lean();
  if (!business) return { skipped: true };

  const whatsappSettings = getWhatsAppSettingsWithDefaults(business?.settings?.whatsappNotificationSettings);
  if (whatsappSettings.enabled !== true) return { skipped: true };
  if (whatsappSettings.clientDuesReminderNotifications?.enabled === false) return { skipped: true };

  if (whatsappService.isQuietHours(wa?.quietHours)) {
    logger.debug('[dues-reminder-whatsapp] Skipped (quiet hours)');
    return { skipped: true };
  }

  const freshBusiness = await Business.findById(business._id).lean();
  const useAddon = canUseAddon(freshBusiness, 'whatsapp');
  const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, 'client_dues_reminder');
  if (!useAddon && !useWallet) {
    logger.info('[dues-reminder-whatsapp] Skipped (quota / business wallet)');
    return { skipped: true };
  }

  const data = {
    clientName: client.name || 'Customer',
    businessName: salonName || business.name || 'Salon',
    duesAmountFormatted: formatDuesAmount(duesAmount),
  };

  const result = await whatsappService.sendClientDuesReminder({
    to: client.phone,
    businessId: business._id,
    ...data,
  });

  await WhatsAppMessageLog.create({
    businessId: business._id,
    recipientPhone: client.phone,
    messageType: 'client_dues_reminder',
    status: result.success ? 'sent' : 'failed',
    msg91Response: result.data || null,
    relatedEntityId: client._id,
    relatedEntityType: 'Client',
    error: result.error || null,
    timestamp: new Date(),
  });

  if (result.success) {
    try {
      if (useWallet) {
        await deductWhatsApp(business._id, 'client_dues_reminder', {
          description: 'WhatsApp client dues reminder',
          relatedEntity: { id: client._id, type: 'Client' },
        });
      } else {
        await Business.updateOne({ _id: business._id }, { $inc: { 'plan.addons.whatsapp.used': 1 } });
      }
    } catch (err) {
      logger.error('[dues-reminder-whatsapp] quota error:', err?.message || err);
    }
  }

  return result;
}

async function sendClientBirthdayReminderWhatsApp({ branchId, client, salonName }) {
  if (!branchId || !client?.phone) return { skipped: true };

  const whatsappService = require('../services/whatsapp-service');
  await whatsappService.initialize();
  if (!whatsappService.enabled) return { skipped: true };

  const mainConnection = await databaseManager.getMainConnection();
  const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

  const adminSettings = await AdminSettings.getSettings();
  const wa = adminSettings?.notifications?.whatsapp;
  if (wa?.enabled !== true) return { skipped: true };
  if (!isAdminClientBirthdayReminderNotificationsEnabled(wa)) return { skipped: true };

  const business = await Business.findById(branchId).lean();
  if (!business) return { skipped: true };

  const whatsappSettings = getWhatsAppSettingsWithDefaults(business?.settings?.whatsappNotificationSettings);
  if (whatsappSettings.enabled !== true) return { skipped: true };
  if (whatsappSettings.clientBirthdayReminderNotifications?.enabled === false) return { skipped: true };

  if (whatsappService.isQuietHours(wa?.quietHours)) {
    logger.debug('[birthday-whatsapp] Skipped (quiet hours)');
    return { skipped: true };
  }

  const freshBusiness = await Business.findById(business._id).lean();
  const useAddon = canUseAddon(freshBusiness, 'whatsapp');
  const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, 'client_birthday_reminder');
  if (!useAddon && !useWallet) {
    logger.info('[birthday-whatsapp] Skipped (quota / business wallet)');
    return { skipped: true };
  }

  const businessName = salonName || business.name || 'Salon';
  const data = {
    clientName: client.name || 'Customer',
    businessName,
  };

  const result = await whatsappService.sendClientBirthdayReminder({
    to: client.phone,
    businessId: business._id,
    ...data,
  });

  await WhatsAppMessageLog.create({
    businessId: business._id,
    recipientPhone: client.phone,
    messageType: 'client_birthday_reminder',
    status: result.success ? 'sent' : 'failed',
    msg91Response: result.data || null,
    relatedEntityId: client._id,
    relatedEntityType: 'Client',
    error: result.error || null,
    timestamp: new Date(),
  });

  if (result.success) {
    try {
      if (useWallet) {
        await deductWhatsApp(business._id, 'client_birthday_reminder', {
          description: 'WhatsApp birthday wish',
          relatedEntity: { id: client._id, type: 'Client' },
        });
      } else {
        await Business.updateOne({ _id: business._id }, { $inc: { 'plan.addons.whatsapp.used': 1 } });
      }
    } catch (err) {
      logger.error('[birthday-whatsapp] quota error:', err?.message || err);
    }
  }

  return result;
}

module.exports = {
  sendClientDuesReminderWhatsApp,
  sendClientBirthdayReminderWhatsApp,
};
