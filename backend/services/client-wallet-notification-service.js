/**
 * Expiry reminders for client prepaid wallets (30 / 15 / 7 days before expiryDate).
 * SMS: plain text. WhatsApp: MSG91 template `clientWalletExpiryReminder` (see send-client-wallet-expiry-whatsapp.js).
 */

const { logger } = require('../utils/logger');
const smsService = require('./sms-service');
const { sendClientWalletExpiryReminderWhatsApp } = require('../lib/send-client-wallet-expiry-whatsapp');

const THRESHOLDS = [30, 15, 7];

/** UTC midnight window for "exactly `days` days from now" (same as package-expiry-job). */
function dayRangeFromNow(days) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setDate(start.getDate() + days);
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function messageFor(daysLeft, clientName, planName, salonName, expiryStr) {
  return `Hi ${clientName}, your prepaid wallet (${planName}) at ${salonName} expires in ${daysLeft} days (${expiryStr}). Use your balance before it lapses.`;
}

/**
 * @param {object} client — { name, phone }
 * @param {object} wallet — ClientWallet lean doc with planSnapshot
 * @param {number} daysLeft — 30 | 15 | 7
 * @param {string} salonName
 */
async function sendClientWalletExpiryReminder(client, wallet, daysLeft, salonName, branchId) {
  const clientName = client.name || 'Valued client';
  const planName = wallet.planSnapshot?.planName || 'your wallet';
  const expiryStr = wallet.expiryDate
    ? new Date(wallet.expiryDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
  const text = messageFor(daysLeft, clientName, planName, salonName, expiryStr);

  if (client.phone) {
    try {
      await smsService.initialize();
      if (smsService.enabled) {
        await smsService.sendTestSms({ to: client.phone, message: text });
      }
    } catch (e) {
      logger.error('[ClientWalletNotify] SMS failed:', e.message);
    }
  }
  if (client.phone && branchId) {
    try {
      await sendClientWalletExpiryReminderWhatsApp(branchId, client, wallet, daysLeft, salonName);
    } catch (e) {
      logger.error('[ClientWalletNotify] WhatsApp failed:', e.message);
    }
  }
}

/**
 * For one tenant DB: wallets expiring in exactly `daysLeft` calendar days (UTC window),
 * where `notifiedDays` does not yet include `daysLeft`.
 */
async function processRemindersForBranch(branchId, models, salonName, cwSettings) {
  if (cwSettings && cwSettings.expiryAlertsEnabled === false) return 0;

  const { ClientWallet, Client } = models;

  let sent = 0;
  for (const daysLeft of THRESHOLDS) {
    const { start, end } = dayRangeFromNow(daysLeft);
    const wallets = await ClientWallet.find({
      branchId,
      status: 'active',
      remainingBalance: { $gt: 0 },
      expiryDate: { $gte: start, $lte: end },
      notifiedDays: { $nin: [daysLeft] },
    })
      .lean()
      .limit(500);

    for (const w of wallets) {
      const client = await Client.findById(w.clientId).select('name phone').lean();
      if (!client?.phone) {
        await ClientWallet.updateOne({ _id: w._id }, { $addToSet: { notifiedDays: daysLeft } });
        continue;
      }
      try {
        await sendClientWalletExpiryReminder(client, w, daysLeft, salonName, branchId);
        await ClientWallet.updateOne({ _id: w._id }, { $addToSet: { notifiedDays: daysLeft } });
        sent += 1;
      } catch (e) {
        logger.error('[ClientWalletNotify] send failed', e.message);
      }
    }
  }
  return sent;
}

module.exports = {
  sendClientWalletExpiryReminder,
  processRemindersForBranch,
  THRESHOLDS,
};
