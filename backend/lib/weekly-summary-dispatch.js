'use strict';

const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { isPlatformEmailDisabled } = require('./business-email-policy');
const { buildWeeklySummaryData } = require('./weekly-summary-data');
const { buildWeeklySummaryChartUrls } = require('./weekly-summary-charts');
const { renderWeeklySummaryEmail } = require('./weekly-summary-email');
const { resolveReportRecipients } = require('./report-email-recipients');
const { getStartOfDayIST, toDateStringIST } = require('../utils/date-utils');

const EMAIL_DELAY_MS = 600;

function appBaseUrl() {
  return (process.env.APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

/**
 * Send weekly summary emails for one business / branch.
 *
 * @param {object} business
 * @param {object} mainConnection
 * @param {{ referenceDate?: Date|string, forceSend?: boolean }} [options]
 */
async function sendWeeklySummaryForBusiness(business, mainConnection, options = {}) {
  if (isPlatformEmailDisabled(business)) {
    return { sent: 0, skipped: true, reason: 'platform_email_disabled' };
  }

  const settings = business.settings?.emailNotificationSettings || {};
  if (!settings?.weeklySummary?.enabled) {
    return { sent: 0, skipped: true, reason: 'disabled' };
  }

  if (!options.forceSend) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const shortToFull = { Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday' };
    const refYmd = toDateStringIST(options.referenceDate || new Date());
    const refStart = getStartOfDayIST(refYmd);
    const dowShort = refStart.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
    const todayName = shortToFull[dowShort] || dayNames[refStart.getDay()];
    const configuredDay = settings.weeklySummary.day || 'monday';
    if (configuredDay !== todayName) {
      return { sent: 0, skipped: true, reason: 'wrong_day' };
    }
  }

  const branchId = business._id;
  const businessDb = await databaseManager.getConnection(business._id, mainConnection);
  const businessModels = modelFactory.createBusinessModels(businessDb);

  const weeklyGoal =
    settings.weeklySummary?.revenueGoal != null && settings.weeklySummary.revenueGoal > 0
      ? settings.weeklySummary.revenueGoal
      : undefined;

  const summaryData = await buildWeeklySummaryData(businessModels, branchId, {
    branchName: business.name || '',
    referenceDate: options.referenceDate,
    weekStartDate: options.weekStartDate,
    weekEndDate: options.weekEndDate,
    weeklyRevenueGoal: weeklyGoal,
    forceRefresh: options.forceRefresh,
  });

  const charts = buildWeeklySummaryChartUrls(summaryData);
  const baseUrl = appBaseUrl();
  const logoUrl = baseUrl ? `${baseUrl}/images/logo-no-background.png` : '';
  const dashboardUrl = baseUrl ? `${baseUrl}/dashboard` : '#';

  const recipients = await resolveReportRecipients({
    business,
    businessModels,
    mainConnection,
    prefKey: 'weeklySummary',
    recipientStaffIds: settings?.weeklySummary?.recipientStaffIds || [],
  });

  if (recipients.length === 0) {
    logger.warn(`[weekly-summary] No recipients for ${business.name}`);
    return { sent: 0, skipped: false, reason: 'no_recipients' };
  }

  if (!emailService.initialized) {
    await emailService.initialize();
  }

  let sentCount = 0;
  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
    const recipient = recipients[i];
    try {
      const ownerName = recipient.name || (recipient.role === 'admin' ? 'Owner' : 'there');
      const { html, text } = renderWeeklySummaryEmail(summaryData, charts, {
        ownerName,
        logoUrl,
        dashboardUrl,
      });

      await emailService.sendEmail({
        to: recipient.email,
        subject: `Weekly Summary — ${summaryData.weekRangeFormatted}`,
        html,
        text,
      });
      sentCount += 1;
      logger.debug(`[weekly-summary] Sent to ${recipient.email}`);
    } catch (err) {
      logger.error(`[weekly-summary] Failed for ${recipient.email}:`, err);
    }
  }

  return {
    sent: sentCount,
    skipped: false,
    weekStartDate: summaryData.weekStartDate,
    weekEndDate: summaryData.weekEndDate,
    recipientCount: recipients.length,
  };
}

module.exports = {
  sendWeeklySummaryForBusiness,
  EMAIL_DELAY_MS,
};
