'use strict';

const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { isPlatformEmailDisabled } = require('./business-email-policy');
const { buildDailySummaryData } = require('./daily-summary-data');
const { buildDailySummaryChartUrls } = require('./daily-summary-charts');
const { renderDailySummaryEmail } = require('./daily-summary-email');
const { getTodayIST, toDateStringIST } = require('../utils/date-utils');
const { staffEmailPreferenceFindQuery } = require('./admin-email-preferences');

const EMAIL_DELAY_MS = 600;

function appBaseUrl() {
  return (process.env.APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

function resolveRecipientsQuery(settings, branchId) {
  const recipientStaffIds = settings?.dailySummary?.recipientStaffIds || [];
  return staffEmailPreferenceFindQuery('dailySummary', { branchId, recipientStaffIds });
}

/**
 * Send daily summary emails for one business / branch for a given IST date.
 *
 * @param {object} business - Business document from main DB
 * @param {object} mainConnection
 * @param {{ targetDate?: Date|string, skipModeCheck?: boolean, forceSend?: boolean }} [options]
 */
async function sendDailySummaryForBusiness(business, mainConnection, options = {}) {
  if (isPlatformEmailDisabled(business)) {
    return { sent: 0, skipped: true, reason: 'platform_email_disabled' };
  }

  const settings = business.settings?.emailNotificationSettings || {};
  if (!settings?.dailySummary?.enabled) {
    return { sent: 0, skipped: true, reason: 'disabled' };
  }

  const mode = settings.dailySummary.mode || 'fixedTime';
  if (options.forceSend) {
    // Manual "send now" — always deliver when daily summary is enabled
  } else if (options.skipModeCheck) {
    // Cash-registry after-closing path — only when mode is afterClosing
    if (mode !== 'afterClosing') {
      return { sent: 0, skipped: true, reason: 'not_after_closing_mode' };
    }
  } else if (mode === 'afterClosing') {
    // Scheduled cron — afterClosing businesses send on registry verify, not at fixed time
    return { sent: 0, skipped: true, reason: 'after_closing_mode' };
  }

  const branchId = business._id;
  const targetDate =
    options.targetDate != null
      ? typeof options.targetDate === 'string'
        ? options.targetDate
        : toDateStringIST(options.targetDate)
      : getTodayIST();

  const businessDb = await databaseManager.getConnection(business._id, mainConnection);
  const businessModels = modelFactory.createBusinessModels(businessDb);
  const { Staff } = businessModels;

  const summaryData = await buildDailySummaryData(businessModels, branchId, targetDate, {
    branchName: business.name || '',
  });
  const charts = buildDailySummaryChartUrls(summaryData);

  const baseUrl = appBaseUrl();
  const logoUrl = baseUrl ? `${baseUrl}/images/logo-no-background.png` : '';
  const dashboardUrl = baseUrl ? `${baseUrl}/dashboard` : '#';
  const settingsUrl = baseUrl ? `${baseUrl}/settings?section=notifications` : '#';

  let recipients = await Staff.find(resolveRecipientsQuery(settings, branchId))
    .select('name email role')
    .lean();

  const User = mainConnection.model('User', require('../models/User').schema);
  const adminUsers = await User.find({
    branchId,
    role: 'admin',
    email: { $exists: true, $ne: '' },
  })
    .select('name firstName lastName email role')
    .lean();

  for (const admin of adminUsers) {
    if (!recipients.some((r) => r.email === admin.email)) {
      recipients.push({
        _id: admin._id,
        name: admin.name || `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email,
        email: admin.email,
        role: 'admin',
      });
    }
  }

  if (recipients.length === 0) {
    logger.warn(
      `[daily-summary] No recipients for ${business.name} — enable Daily Summary in staff Configure preferences`
    );
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
      const ownerName =
        recipient.name ||
        (recipient.role === 'admin' ? 'Owner' : 'there');
      const { html, text } = renderDailySummaryEmail(summaryData, charts, {
        ownerName,
        logoUrl,
        dashboardUrl,
        settingsUrl,
      });

      await emailService.sendEmail({
        to: recipient.email,
        subject: `Daily Summary — ${summaryData.dateFormatted}`,
        html,
        text,
      });
      sentCount += 1;
      logger.debug(`[daily-summary] Sent to ${recipient.email} (${ownerName})`);
    } catch (err) {
      logger.error(`[daily-summary] Failed for ${recipient.email}:`, err);
    }
  }

  return { sent: sentCount, skipped: false, date: targetDate, recipientCount: recipients.length };
}

module.exports = {
  sendDailySummaryForBusiness,
  EMAIL_DELAY_MS,
};
