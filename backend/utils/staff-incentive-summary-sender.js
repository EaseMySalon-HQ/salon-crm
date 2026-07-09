/**
 * Monthly staff incentive summary email — sent on the 1st for the previous calendar month.
 */

const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { isPlatformEmailDisabled } = require('../lib/business-email-policy');
const { hasFeature } = require('../lib/entitlements');
const { buildStaffIncentiveSummaryForRange } = require('../lib/staff-incentive-monthly-data');

const { resolveReportRecipients } = require('../lib/report-email-recipients');

const EMAIL_DELAY_MS = 600;

/**
 * Resolve recipients: configured staffIncentiveSummary list (with preference) + owner/admin users.
 */
async function resolveStaffIncentiveRecipients(business, businessModels, mainConnection) {
  const emailSettings = business.settings?.emailNotificationSettings;
  return resolveReportRecipients({
    business,
    businessModels,
    mainConnection,
    prefKey: 'staffIncentiveSummary',
    recipientStaffIds: emailSettings?.staffIncentiveSummary?.recipientStaffIds || [],
  });
}

async function sendStaffIncentiveSummariesForBusiness(business, mainConnection) {
  if (isPlatformEmailDisabled(business)) {
    logger.debug(`Skipping staff incentive summary for ${business.name} — platform email disabled`);
    return { skipped: true, reason: 'platform_email_disabled' };
  }

  if (!hasFeature(business, 'incentive_management')) {
    logger.debug(`Skipping staff incentive summary for ${business.name} — plan lacks incentive_management`);
    return { skipped: true, reason: 'feature_not_entitled' };
  }

  const emailSettings = business.settings?.emailNotificationSettings;
  const recipientListConfigured = emailSettings?.staffIncentiveSummary?.recipientStaffIds?.length > 0;
  const enabled =
    emailSettings?.staffIncentiveSummary?.enabled !== false ||
    (emailSettings?.staffIncentiveSummary?.enabled === false && !recipientListConfigured);

  if (!enabled) {
    logger.debug(`Skipping staff incentive summary for ${business.name} — disabled in settings`);
    return { skipped: true, reason: 'disabled' };
  }

  const businessDb = await databaseManager.getConnection(business._id, mainConnection);
  const businessModels = modelFactory.createBusinessModels(businessDb);
  const summary = await buildStaffIncentiveSummaryForRange(businessModels, business._id);

  const recipients = await resolveStaffIncentiveRecipients(business, businessModels, mainConnection);
  if (recipients.length === 0) {
    logger.warn(
      `No recipients for staff incentive summary (${business.name}) — enable staffIncentiveSummary preference or ensure admin email exists`
    );
    return { skipped: true, reason: 'no_recipients' };
  }

  if (!emailService.initialized) {
    await emailService.initialize();
  }

  logger.info(
    `Sending staff incentive summary for ${business.name} (${summary.period.periodLabel}) to ${recipients.length} recipient(s)`
  );

  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
    const recipient = recipients[i];
    try {
      await emailService.sendStaffIncentiveSummary({
        to: recipient.email,
        businessName: business.name,
        periodLabel: summary.period.periodLabel,
        periodStart: summary.period.startYmd,
        periodEnd: summary.period.endYmd,
        summaryData: {
          rows: summary.rows,
          totals: summary.totals,
        },
      });
      logger.debug(`Staff incentive summary sent to ${recipient.email} for ${business.name}`);
    } catch (err) {
      logger.error(`Error sending staff incentive summary to ${recipient.email}:`, err);
    }
  }

  return { sent: true, recipientCount: recipients.length, staffRows: summary.rows.length };
}

async function sendStaffIncentiveSummaries() {
  try {
    logger.info('Starting monthly staff incentive summary email job');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const businesses = await Business.find({ status: 'active' });
    logger.info(`Found ${businesses.length} active businesses for staff incentive summary`);

    for (const business of businesses) {
      try {
        await sendStaffIncentiveSummariesForBusiness(business, mainConnection);
        await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
      } catch (err) {
        logger.error(`Error processing staff incentive summary for business ${business.name}:`, err);
      }
    }

    logger.info('Monthly staff incentive summary email job completed');
  } catch (err) {
    logger.error('Monthly staff incentive summary email job failed:', err);
  }
}

module.exports = {
  sendStaffIncentiveSummaries,
  sendStaffIncentiveSummariesForBusiness,
  resolveStaffIncentiveRecipients,
};
