/**
 * Daily job: expire client wallets past effectiveExpiryDate; send 30/15/7-day reminders.
 */

const cron = require('node-cron');
const { logger } = require('../utils/logger');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { mergeClientWalletSettings } = require('../services/client-wallet-service');
const { processRemindersForBranch } = require('../services/client-wallet-notification-service');

async function runClientWalletExpiryJob() {
  logger.info('[ClientWalletExpiryJob] Starting daily run...');

  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const businesses = await Business.find({ status: 'active' }).select('_id name clientWalletSettings').lean();

  let expiredCount = 0;
  let reminders = 0;
  let errors = 0;

  const now = new Date();

  for (const business of businesses) {
    try {
      const businessConn = await databaseManager.getConnection(business._id, mainConnection);
      const models = modelFactory.getCachedBusinessModels(businessConn);
      const { ClientWallet } = models;
      const branchId = business._id;
      const salonName = business.name || 'EaseMySalon';
      const cwSettings = mergeClientWalletSettings(business.clientWalletSettings);

      const exp = await ClientWallet.updateMany(
        {
          branchId,
          status: 'active',
          effectiveExpiryDate: { $lt: now },
        },
        { $set: { status: 'expired' } }
      );
      expiredCount += exp.modifiedCount || 0;

      const r = await processRemindersForBranch(branchId, models, salonName, cwSettings);
      reminders += r;
    } catch (err) {
      errors += 1;
      logger.error(`[ClientWalletExpiryJob] business ${business._id}:`, err.message);
    }
  }

  logger.info(
    `[ClientWalletExpiryJob] Done. Expired: ${expiredCount}, reminder sends: ${reminders}, errors: ${errors}`
  );
}

function startClientWalletExpiryJob() {
  cron.schedule(
    '5 0 * * *',
    async () => {
      try {
        await runClientWalletExpiryJob();
      } catch (err) {
        logger.error('[ClientWalletExpiryJob] Unhandled:', err);
      }
    },
    { scheduled: true, timezone: 'UTC' }
  );
  logger.info('[ClientWalletExpiryJob] Scheduled — daily 00:05 UTC');
}

module.exports = { startClientWalletExpiryJob, runClientWalletExpiryJob };
