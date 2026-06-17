/**
 * Register all GMB cron jobs on server boot.
 */

'use strict';

const cron = require('node-cron');
const { logger } = require('../utils/logger');

function setupGmbJobs() {
  if (process.env.GMB_JOBS_DISABLED === '1') {
    logger.info('[gmb-jobs] disabled via GMB_JOBS_DISABLED');
    return;
  }

  try {
    const { runGmbReviewSync } = require('./gmb-review-sync');
    cron.schedule('*/30 * * * *', () => {
      runGmbReviewSync().catch((err) => logger.error('[gmb-review-sync]', err));
    });
    logger.debug('⏰ GMB review sync scheduled (every 30 min)');
  } catch (err) {
    logger.warn('⚠️  GMB review sync could not be scheduled:', err?.message);
  }

  try {
    const { processAutoReplies } = require('./gmb-auto-reply');
    cron.schedule('*/5 * * * *', () => {
      processAutoReplies().catch((err) => logger.error('[gmb-auto-reply]', err));
    });
    logger.debug('⏰ GMB auto-reply scheduled (every 5 min)');
  } catch (err) {
    logger.warn('⚠️  GMB auto-reply could not be scheduled:', err?.message);
  }

  try {
    const { runNegativeReviewAlerts } = require('./gmb-negative-review-alerts');
    cron.schedule('*/15 * * * *', () => {
      runNegativeReviewAlerts().catch((err) => logger.error('[gmb-negative-alerts]', err));
    });
    logger.debug('⏰ GMB negative review alerts scheduled (every 15 min)');
  } catch (err) {
    logger.warn('⚠️  GMB negative alerts could not be scheduled:', err?.message);
  }

  try {
    const { runGmbReviewRequests } = require('./gmb-review-request');
    cron.schedule('*/20 * * * *', () => {
      runGmbReviewRequests().catch((err) => logger.error('[gmb-review-request]', err));
    });
    logger.debug('⏰ GMB review requests scheduled (every 20 min)');
  } catch (err) {
    logger.warn('⚠️  GMB review requests could not be scheduled:', err?.message);
  }

  try {
    const { runGmbPostScheduler } = require('./gmb-post-scheduler');
    cron.schedule('0 9 * * *', () => {
      runGmbPostScheduler().catch((err) => logger.error('[gmb-post-scheduler]', err));
    }, { timezone: 'Asia/Kolkata' });
    logger.debug('⏰ GMB post scheduler scheduled (daily 9 AM IST)');
  } catch (err) {
    logger.warn('⚠️  GMB post scheduler could not be scheduled:', err?.message);
  }

  try {
    const { runGmbInsightsSync } = require('./gmb-insights-sync');
    cron.schedule('0 3 * * 1', () => {
      runGmbInsightsSync().catch((err) => logger.error('[gmb-insights-sync]', err));
    }, { timezone: 'Asia/Kolkata' });
    logger.debug('⏰ GMB insights sync scheduled (weekly Monday 3 AM IST)');
  } catch (err) {
    logger.warn('⚠️  GMB insights sync could not be scheduled:', err?.message);
  }
}

module.exports = { setupGmbJobs };
