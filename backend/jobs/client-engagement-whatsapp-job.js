'use strict';

/**
 * Daily at 12:00 PM IST:
 *   - Client dues reminders (every 7 days per client with outstanding balance)
 *   - Birthday wishes (once per calendar year on the client's birthday)
 */

const cron = require('node-cron');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const {
  isAdminClientDuesReminderNotificationsEnabled,
  isAdminClientBirthdayReminderNotificationsEnabled,
} = require('../lib/whatsapp-admin-gates');
const { getWhatsAppSettingsWithDefaults } = require('../lib/whatsapp-settings-defaults');
const { canDeductWhatsApp } = require('../lib/wallet-deduction');
const { aggregateDuesByPhone } = require('../lib/client-dues-aggregator');
const {
  sendClientDuesReminderWhatsApp,
  sendClientBirthdayReminderWhatsApp,
} = require('../lib/send-client-engagement-whatsapp');

const DUES_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function istMonthDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  }).formatToParts(date);
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { month: pick('month'), day: pick('day'), year: pick('year') };
}

async function wasDuesReminderSentRecently(WhatsAppMessageLog, businessId, phone, since) {
  const row = await WhatsAppMessageLog.findOne({
    businessId,
    recipientPhone: phone,
    messageType: 'client_dues_reminder',
    status: 'sent',
    timestamp: { $gte: since },
  })
    .select('_id')
    .lean();
  return Boolean(row);
}

async function wasBirthdaySentThisYear(WhatsAppMessageLog, businessId, phone, yearStart) {
  const row = await WhatsAppMessageLog.findOne({
    businessId,
    recipientPhone: phone,
    messageType: 'client_birthday_reminder',
    status: 'sent',
    timestamp: { $gte: yearStart },
  })
    .select('_id')
    .lean();
  return Boolean(row);
}

async function runClientDuesReminders(adminWa, WhatsAppMessageLog) {
  if (!isAdminClientDuesReminderNotificationsEnabled(adminWa)) {
    logger.debug('[ClientEngagementWA] Admin dues reminders disabled');
    return 0;
  }

  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const businesses = await Business.find({ status: 'active' }).lean();
  const since = new Date(Date.now() - DUES_INTERVAL_MS);
  let sent = 0;

  for (const business of businesses) {
    try {
      if (!canDeductWhatsApp(business, 'client_dues_reminder')) continue;

      const ws = getWhatsAppSettingsWithDefaults(business.settings?.whatsappNotificationSettings);
      if (!ws.enabled || ws.clientDuesReminderNotifications?.enabled === false) continue;

      const businessDb = await databaseManager.getConnection(business._id, mainConnection);
      const { Sale, Client } = modelFactory.createBusinessModels(businessDb);
      const duesByPhone = await aggregateDuesByPhone(Sale, business._id);
      if (!duesByPhone.size) continue;

      const phones = [...duesByPhone.keys()];
      const clients = await Client.find({
        phone: { $in: phones },
        isWalkIn: { $ne: true },
      })
        .select('name phone')
        .lean();

      for (const client of clients) {
        const dues = duesByPhone.get(client.phone);
        if (!(dues > 0)) continue;
        if (await wasDuesReminderSentRecently(WhatsAppMessageLog, business._id, client.phone, since)) {
          continue;
        }
        const result = await sendClientDuesReminderWhatsApp({
          branchId: business._id,
          client,
          duesAmount: dues,
          salonName: business.name,
        });
        if (result?.success) sent += 1;
      }
    } catch (err) {
      logger.error(`[ClientEngagementWA] Dues error for ${business.name}:`, err?.message || err);
    }
  }

  return sent;
}

async function runClientBirthdayWishes(adminWa, WhatsAppMessageLog) {
  if (!isAdminClientBirthdayReminderNotificationsEnabled(adminWa)) {
    logger.debug('[ClientEngagementWA] Admin birthday wishes disabled');
    return 0;
  }

  const { month, day, year } = istMonthDay();
  const yearStart = new Date(Date.UTC(year, 0, 1));

  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const businesses = await Business.find({ status: 'active' }).lean();
  let sent = 0;

  for (const business of businesses) {
    try {
      if (!canDeductWhatsApp(business, 'client_birthday_reminder')) continue;

      const ws = getWhatsAppSettingsWithDefaults(business.settings?.whatsappNotificationSettings);
      if (!ws.enabled || ws.clientBirthdayReminderNotifications?.enabled === false) continue;

      const businessDb = await databaseManager.getConnection(business._id, mainConnection);
      const { Client } = modelFactory.createBusinessModels(businessDb);

      const birthdayClients = await Client.find({
        dob: { $exists: true, $ne: null },
        phone: { $exists: true, $nin: [null, ''] },
        isWalkIn: { $ne: true },
        $expr: {
          $and: [{ $eq: [{ $month: '$dob' }, month] }, { $eq: [{ $dayOfMonth: '$dob' }, day] }],
        },
      })
        .select('name phone dob')
        .lean();

      for (const client of birthdayClients) {
        if (await wasBirthdaySentThisYear(WhatsAppMessageLog, business._id, client.phone, yearStart)) {
          continue;
        }
        const result = await sendClientBirthdayReminderWhatsApp({
          branchId: business._id,
          client,
          salonName: business.name,
        });
        if (result?.success) sent += 1;
      }
    } catch (err) {
      logger.error(`[ClientEngagementWA] Birthday error for ${business.name}:`, err?.message || err);
    }
  }

  return sent;
}

async function runClientEngagementWhatsAppJob() {
  let whatsappService;
  try {
    whatsappService = require('../services/whatsapp-service');
    await whatsappService.initialize();
    if (!whatsappService.enabled) {
      logger.debug('[ClientEngagementWA] WhatsApp service disabled — skipping');
      return;
    }
  } catch (err) {
    logger.error('[ClientEngagementWA] WhatsApp init failed:', err?.message || err);
    return;
  }

  const mainConnection = await databaseManager.getMainConnection();
  const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
  const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);
  const adminSettings = await AdminSettings.getSettings();
  const adminWa = adminSettings?.notifications?.whatsapp;

  if (adminWa?.enabled !== true) {
    logger.debug('[ClientEngagementWA] Admin WhatsApp disabled');
    return;
  }

  if (whatsappService.isQuietHours(adminWa?.quietHours)) {
    logger.debug('[ClientEngagementWA] Quiet hours active — skipping');
    return;
  }

  const duesSent = await runClientDuesReminders(adminWa, WhatsAppMessageLog);
  const birthdaySent = await runClientBirthdayWishes(adminWa, WhatsAppMessageLog);
  logger.info(`[ClientEngagementWA] Done — dues: ${duesSent}, birthdays: ${birthdaySent}`);
}

function setupClientEngagementWhatsAppJob() {
  cron.schedule(
    '0 12 * * *',
    async () => {
      try {
        await runClientEngagementWhatsAppJob();
      } catch (err) {
        logger.error('[ClientEngagementWA] Unhandled cron error:', err?.message || err);
      }
    },
    { scheduled: true, timezone: 'Asia/Kolkata' }
  );
  logger.info('[ClientEngagementWA] Scheduled — daily 12:00 PM IST (dues every 7d, birthday on DOB)');
}

module.exports = {
  setupClientEngagementWhatsAppJob,
  runClientEngagementWhatsAppJob,
};
