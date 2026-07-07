'use strict';

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const { getPreviousMonthRangeIST } = require('../utils/date-utils');
const { precomputeMonthlySummariesForBusiness } = require('./monthly-summary-data');

/**
 * Precompute monthly_summaries for all active businesses (run 1st of month ~12:01 AM IST).
 */
async function precomputeAllMonthlySummaries(referenceDate = new Date()) {
  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const businesses = await Business.find({ status: 'active' });
  const { monthKey } = getPreviousMonthRangeIST(referenceDate);

  logger.info(`[monthly-summary] Precomputing ${monthKey} for ${businesses.length} businesses`);

  let done = 0;
  for (const business of businesses) {
    try {
      await precomputeMonthlySummariesForBusiness(business, mainConnection, monthKey);
      done += 1;
    } catch (err) {
      logger.error(`[monthly-summary] Precompute failed for ${business.name}:`, err);
    }
  }

  logger.info(`[monthly-summary] Precompute complete: ${done}/${businesses.length}`);
  return { monthKey, computed: done, total: businesses.length };
}

module.exports = { precomputeAllMonthlySummaries };
