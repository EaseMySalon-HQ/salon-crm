/**
 * package-expiry-job.js
 *
 * Daily cron job that:
 *  1. Marks ACTIVE ClientPackages as EXPIRED when expiry_date has passed
 *  2. Sends expiry reminder notifications at T-7, T-3, T-1 days
 *  3. Sends EXPIRED notification on the day of expiry
 *
 * Uses node-cron (already installed). Does NOT use Bull.js.
 * Iterates all tenant databases via databaseManager.
 */

const cron = require('node-cron');
const { logger } = require('../utils/logger');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { sendPackageNotification } = require('./package-notification-service');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return a Date range representing "exactly N days from now" (midnight to midnight UTC).
 */
function dayRangeFromNow(days) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setDate(start.getDate() + days);

  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

// ── Core job logic (exported for manual testing) ─────────────────────────────

async function runExpiryJob() {
  logger.info('[PackageExpiryJob] Starting daily package expiry run...');

  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const businesses = await Business.find({ status: 'active' }).select('_id name').lean();

  let totalExpired = 0;
  let totalNotified = 0;
  let errors = 0;

  for (const business of businesses) {
    try {
      const businessConn = await databaseManager.getConnection(business._id, mainConnection);
      const models = modelFactory.getCachedBusinessModels(businessConn);
      const {
        ClientPackage,
        Client,
        PackageNotification
      } = models;

      const now = new Date();
      const branchId = business._id;
      const salonName = business.name || 'EaseMySalon';

      // ── 1. Mark expired packages ─────────────────────────────────────────
      const expiredResult = await ClientPackage.updateMany(
        {
          branchId,
          status: 'ACTIVE',
          expiry_date: { $ne: null, $lte: now }
        },
        { $set: { status: 'EXPIRED' } }
      );
      totalExpired += expiredResult.modifiedCount || 0;

      // Send EXPIRED notification for newly expired packages
      if (expiredResult.modifiedCount > 0) {
        const justExpired = await ClientPackage.find({
          branchId,
          status: 'EXPIRED',
          expiry_date: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), $lte: now }
        }).populate('package_id', 'name').lean();

        for (const cp of justExpired) {
          const client = await Client.findById(cp.client_id).select('name phone email').lean();
          if (client) {
            await sendPackageNotification(client, cp, 'EXPIRED', salonName, PackageNotification);
            totalNotified++;
          }
        }
      }

      // ── 2. Expiry reminders: T-7, T-3, T-1 ─────────────────────────────
      const reminderDays = [
        { days: 7, type: 'EXPIRY_7D' },
        { days: 3, type: 'EXPIRY_3D' },
        { days: 1, type: 'EXPIRY_1D' }
      ];

      for (const { days, type } of reminderDays) {
        const { start, end } = dayRangeFromNow(days);

        const expiring = await ClientPackage.find({
          branchId,
          status: 'ACTIVE',
          expiry_date: { $gte: start, $lte: end }
        }).populate('package_id', 'name').lean();

        for (const cp of expiring) {
          // Prevent duplicate notifications: skip if already sent today for same type+channel
          const alreadySent = await PackageNotification.findOne({
            client_package_id: cp._id,
            type,
            status: 'SENT',
            sent_at: { $gte: new Date(now.setUTCHours(0, 0, 0, 0)) }
          }).lean();

          if (alreadySent) continue;

          const client = await Client.findById(cp.client_id).select('name phone email').lean();
          if (client) {
            await sendPackageNotification(client, cp, type, salonName, PackageNotification);
            totalNotified++;
          }
        }
      }
    } catch (err) {
      logger.error(`[PackageExpiryJob] Error processing business ${business._id}:`, err.message);
      errors++;
    }
  }

  logger.info(
    `[PackageExpiryJob] Done. Expired: ${totalExpired}, Notified: ${totalNotified}, Errors: ${errors}`
  );
}

// ── Schedule: daily at midnight UTC ──────────────────────────────────────────

function startExpiryJob() {
  cron.schedule('0 0 * * *', async () => {
    try {
      await runExpiryJob();
    } catch (err) {
      logger.error('[PackageExpiryJob] Unhandled error in cron run:', err);
    }
  });
  logger.info('[PackageExpiryJob] Scheduled — runs daily at midnight UTC');
}

module.exports = { startExpiryJob, runExpiryJob };
