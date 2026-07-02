/**
 * Nightly purge of tenant activity_logs older than the retention window.
 * Uses the native collection so deletes are not blocked by mongoose immutability hooks.
 */

const cron = require('node-cron');
const databaseManager = require('../config/database-manager');
const { tenantActivityLogRetentionCutoff } = require('../constants/tenant-log-retention');
const { logger } = require('../utils/logger');

async function runTenantActivityLogRetentionJob() {
  const cutoff = tenantActivityLogRetentionCutoff();
  const mainConnection = await databaseManager.getMainConnection();
  const result = await mainConnection.db.collection('activity_logs').deleteMany({
    createdAt: { $lt: cutoff },
  });

  if (result.deletedCount > 0) {
    logger.info('[TenantActivityLogRetention] Purged expired tenant activity logs', {
      deletedCount: result.deletedCount,
      cutoff: cutoff.toISOString(),
    });
  }
}

function startTenantActivityLogRetentionJob() {
  cron.schedule(
    '15 2 * * *',
    async () => {
      try {
        await runTenantActivityLogRetentionJob();
      } catch (err) {
        logger.error('[TenantActivityLogRetention] Unhandled:', err);
      }
    },
    { scheduled: true, timezone: 'UTC' }
  );
  logger.info('[TenantActivityLogRetention] Scheduled — daily 02:15 UTC');
}

module.exports = {
  startTenantActivityLogRetentionJob,
  runTenantActivityLogRetentionJob,
};
