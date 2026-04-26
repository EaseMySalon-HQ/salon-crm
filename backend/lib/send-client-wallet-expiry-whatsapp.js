/**
 * MSG91 template WhatsApp for prepaid wallet expiry reminders (30 / 15 / 7 days).
 * SMS remains plain-text in client-wallet-notification-service.
 */

'use strict';

const { logger } = require('../utils/logger');
const databaseManager = require('../config/database-manager');
const { isAdminClientWalletExpiryReminderNotificationsEnabled } = require('./whatsapp-admin-gates');
const { getWhatsAppSettingsWithDefaults } = require('./whatsapp-settings-defaults');
const { canUseAddon } = require('./entitlements');
const { canDeductWhatsApp, deductWhatsApp } = require('./wallet-deduction');

function formatRupees(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '₹0';
  return `₹${Math.round(x * 100) / 100}`;
}

/**
 * @param {import('mongoose').Types.ObjectId|string} branchId
 * @param {object} client — { name, phone }
 * @param {object} wallet — ClientWallet lean doc
 * @param {number} daysLeft — 30 | 15 | 7
 * @param {string} salonName
 */
async function sendClientWalletExpiryReminderWhatsApp(branchId, client, wallet, daysLeft, salonName) {
  if (!client?.phone || !wallet) return;

  const whatsappService = require('../services/whatsapp-service');
  await whatsappService.initialize();
  if (!whatsappService.enabled) return;

  const mainConnection = await databaseManager.getMainConnection();
  const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

  const adminSettings = await AdminSettings.getSettings();
  const wa = adminSettings?.notifications?.whatsapp;
  if (wa?.enabled !== true) return;
  if (!isAdminClientWalletExpiryReminderNotificationsEnabled(wa)) return;

  const business = await Business.findById(branchId).lean();
  if (!business) return;

  const whatsappSettings = getWhatsAppSettingsWithDefaults(business?.settings?.whatsappNotificationSettings);
  if (whatsappSettings.enabled !== true) return;
  if (whatsappSettings.clientWalletExpiryReminderNotifications?.enabled === false) return;

  if (whatsappService.isQuietHours(wa?.quietHours)) {
    logger.debug('[wallet-expiry-whatsapp] Skipped (quiet hours)');
    return;
  }

  const planName = wallet.planSnapshot?.planName || 'Prepaid wallet';
  const expiryDateFormatted = wallet.expiryDate
    ? new Date(wallet.expiryDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
  const balanceFormatted = formatRupees(Number(wallet.remainingBalance));

  const data = {
    clientName: client.name || 'Customer',
    businessName: salonName || business.name || 'Salon',
    planName,
    daysLeft: String(daysLeft),
    expiryDateFormatted,
    balanceFormatted,
  };

  const freshBusiness = await Business.findById(business._id).lean();
  const useAddon = canUseAddon(freshBusiness, 'whatsapp');
  const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, 'client_wallet_expiry');
  if (!useAddon && !useWallet) {
    logger.info('[wallet-expiry-whatsapp] Skipped (quota / business wallet)');
    return;
  }

  const result = await whatsappService.sendClientWalletExpiryReminder({
    to: client.phone,
    ...data,
  });

  if (!result.success && result.error?.includes('not configured')) {
    logger.debug('[wallet-expiry-whatsapp] Template not configured, skipping');
    return;
  }

  try {
    await WhatsAppMessageLog.create({
      businessId: business._id,
      recipientPhone: client.phone,
      messageType: 'client_wallet_expiry',
      status: result.success ? 'sent' : 'failed',
      msg91Response: result.data || null,
      relatedEntityId: wallet._id || null,
      relatedEntityType: 'ClientWallet',
      error: result.error || null,
      timestamp: new Date(),
    });
  } catch (logErr) {
    logger.error('[wallet-expiry-whatsapp] Log failed', logErr.message);
  }

  if (result.success) {
    try {
      if (useWallet) {
        await deductWhatsApp(business._id, 'client_wallet_expiry', {
          description: 'WhatsApp prepaid wallet expiry reminder',
          relatedEntity: { id: wallet._id, type: 'ClientWallet' },
        });
      } else {
        await Business.updateOne({ _id: business._id }, { $inc: { 'plan.addons.whatsapp.used': 1 } });
      }
    } catch (qErr) {
      logger.error('[wallet-expiry-whatsapp] Quota update failed', qErr.message);
    }
  } else {
    logger.warn('[wallet-expiry-whatsapp] Send failed', result.error);
  }
}

module.exports = { sendClientWalletExpiryReminderWhatsApp };
