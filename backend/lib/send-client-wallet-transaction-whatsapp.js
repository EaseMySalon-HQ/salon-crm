/**
 * WhatsApp (MSG91 template) after client prepaid wallet ledger rows: credit, debit, adjustment, refund_credit.
 * Gates: platform WhatsApp + admin preference + salon toggle + quiet hours + template ID + client phone + quota/wallet.
 */

'use strict';

const { logger } = require('../utils/logger');
const databaseManager = require('../config/database-manager');
const { isAdminClientWalletTransactionNotificationsEnabled } = require('./whatsapp-admin-gates');
const { getWhatsAppSettingsWithDefaults } = require('./whatsapp-settings-defaults');
const { canUseAddon } = require('./entitlements');
const { canDeductWhatsApp, deductWhatsApp } = require('./wallet-deduction');

function formatRupees(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '₹0';
  const rounded = Math.round(x * 100) / 100;
  return `₹${rounded}`;
}

function transactionTypeLabel(type) {
  switch (String(type || '').toLowerCase()) {
    case 'credit':
      return 'Credit';
    case 'debit':
      return 'Debit';
    case 'adjustment':
      return 'Adjustment';
    case 'refund_credit':
      return 'Refund';
    default:
      return 'Update';
  }
}

/**
 * @param {import('mongoose').Types.ObjectId|string} branchId
 * @param {object} businessModels — tenant models (must include Client)
 * @param {object} wallet — ClientWallet doc or plain object
 * @param {object} transaction — ClientWalletTransaction doc or plain object
 */
async function sendClientWalletTransactionWhatsApp(branchId, businessModels, wallet, transaction) {
  const Client = businessModels.Client;
  if (!Client || !wallet?.clientId || !transaction) return;

  const clientId = wallet.clientId?._id || wallet.clientId;
  const client = await Client.findById(clientId).select('name phone').lean();
  if (!client?.phone) return;

  const whatsappService = require('../services/whatsapp-service');
  await whatsappService.initialize();
  if (!whatsappService.enabled) return;

  const mainConnection = await databaseManager.getMainConnection();
  const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

  const adminSettings = await AdminSettings.getSettings();
  const wa = adminSettings?.notifications?.whatsapp;
  const whatsappEnabled = wa?.enabled === true;
  const adminTxnEnabled = isAdminClientWalletTransactionNotificationsEnabled(wa);

  if (!whatsappEnabled || !adminTxnEnabled) {
    logger.debug('[wallet-tx-whatsapp] Skipped (admin/platform gates)');
    return;
  }

  const business = await Business.findById(branchId).lean();
  if (!business) return;

  const whatsappSettings = getWhatsAppSettingsWithDefaults(business?.settings?.whatsappNotificationSettings);
  if (whatsappSettings.enabled !== true) return;
  if (whatsappSettings.clientWalletTransactionNotifications?.enabled === false) return;

  const quietHours = wa?.quietHours;
  if (whatsappService.isQuietHours(quietHours)) {
    logger.debug('[wallet-tx-whatsapp] Skipped (quiet hours)');
    return;
  }

  const businessName = business.name || 'Salon';
  const planName = wallet.planSnapshot?.planName || 'Prepaid wallet';
  const txType = transaction.type;
  const amountNum = Number(transaction.amount);
  const balanceAfter = Number(transaction.balanceAfter);
  const description = String(transaction.description || '').slice(0, 400);

  const data = {
    clientName: client.name || 'Customer',
    businessName,
    planName,
    transactionType: txType,
    transactionTypeLabel: transactionTypeLabel(txType),
    amountFormatted: formatRupees(Math.abs(amountNum)),
    balanceAfterFormatted: formatRupees(balanceAfter),
    description,
  };

  const freshBusiness = await Business.findById(business._id).lean();
  const useAddon = canUseAddon(freshBusiness, 'whatsapp');
  const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, 'client_wallet_txn');
  if (!useAddon && !useWallet) {
    logger.info('[wallet-tx-whatsapp] Skipped (quota / business wallet)');
    return;
  }

  const result = await whatsappService.sendClientWalletTransaction({
    to: client.phone,
    ...data,
  });

  try {
    await WhatsAppMessageLog.create({
      businessId: business._id,
      recipientPhone: client.phone,
      messageType: 'client_wallet_transaction',
      status: result.success ? 'sent' : 'failed',
      msg91Response: result.data || null,
      relatedEntityId: transaction._id || null,
      relatedEntityType: 'ClientWalletTransaction',
      error: result.error || null,
      timestamp: new Date(),
    });
  } catch (logErr) {
    logger.error('[wallet-tx-whatsapp] Log failed', logErr.message);
  }

  if (result.success) {
    try {
      if (useWallet) {
        await deductWhatsApp(business._id, 'client_wallet_txn', {
          description: 'WhatsApp prepaid wallet transaction',
          relatedEntity: { id: transaction._id, type: 'ClientWalletTransaction' },
        });
      } else {
        await Business.updateOne({ _id: business._id }, { $inc: { 'plan.addons.whatsapp.used': 1 } });
      }
    } catch (qErr) {
      logger.error('[wallet-tx-whatsapp] Quota update failed', qErr.message);
    }
  } else {
    logger.warn('[wallet-tx-whatsapp] Send failed', result.error);
  }
}

module.exports = { sendClientWalletTransactionWhatsApp };
