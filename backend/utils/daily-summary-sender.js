'use strict';

const databaseManager = require('../config/database-manager');
const { logger } = require('./logger');
const { toDateStringIST } = require('../utils/date-utils');
const { sendDailySummaryForBusiness } = require('../lib/daily-summary-dispatch');

/**
 * Send daily summary email for a specific date (used when cash registry is verified).
 * Only sends if daily summary is enabled and mode is 'afterClosing'.
 *
 * @param {string} businessId - Business ID (from main DB)
 * @param {string} branchId - Branch ID for querying business data (usually same as businessId)
 * @param {Date} targetDate - The date to send summary for
 * @returns {Promise<{ sent: number, skipped: boolean, error?: string }>}
 */
async function sendDailySummaryForDate(businessId, branchId, targetDate) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);

    const business = await Business.findById(businessId);
    if (!business) {
      return { sent: 0, skipped: true, error: 'Business not found' };
    }

    const dateYmd = toDateStringIST(targetDate);
    const result = await sendDailySummaryForBusiness(business, mainConnection, {
      targetDate: dateYmd,
      skipModeCheck: true,
    });

    if (result.skipped) {
      return { sent: 0, skipped: true, reason: result.reason };
    }

    logger.debug(`📧 Daily summary sent to ${result.sent} recipients for ${business.name} (date: ${dateYmd})`);
    return { sent: result.sent || 0, skipped: false };
  } catch (error) {
    logger.error('Error sending daily summary for date:', error);
    return { sent: 0, skipped: false, error: error.message };
  }
}

module.exports = { sendDailySummaryForDate };
