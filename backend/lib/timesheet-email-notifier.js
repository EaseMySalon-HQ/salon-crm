'use strict';

const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { isPlatformEmailDisabled } = require('../lib/business-email-policy');
const {
  datesInRangeIST,
  previousTimesheetMonthRange,
  loadTimesheetContext,
  buildStaffTimesheetAttachments,
} = require('./staff-timesheet-builder');

const { staffEmailPreferenceFindQuery } = require('./admin-email-preferences');

const EMAIL_DELAY_MS = 600;

/**
 * Staff who should receive their own timesheet report.
 */
async function resolveTimesheetStaffRecipients(businessModels, branchId) {
  const { Staff } = businessModels;
  return Staff.find({
    ...staffEmailPreferenceFindQuery('timesheetReport', { branchId }),
    isActive: { $ne: false },
  })
    .select('name role email workSchedule shiftId payrollOverrides')
    .lean();
}

async function sendMonthlyTimesheetReportsForBusiness(business, mainConnection, { monthKey } = {}) {
  if (isPlatformEmailDisabled(business)) {
    logger.debug(`[timesheet-email] Skipping ${business.name} — platform email disabled`);
    return { skipped: true, reason: 'platform_email_disabled' };
  }

  const businessDb = await databaseManager.getConnection(business._id, mainConnection);
  const businessModels = modelFactory.createBusinessModels(businessDb);

  const recipients = await resolveTimesheetStaffRecipients(businessModels, business._id);
  if (!recipients.length) {
    logger.info(
      `[timesheet-email] No staff recipients for ${business.name} — enable Timesheet report in staff email preferences`
    );
    return { skipped: true, reason: 'no_recipients' };
  }

  const period = previousTimesheetMonthRange();
  const periodDates = datesInRangeIST(period.startYmd, period.endYmd);
  if (!periodDates.length) {
    return { skipped: true, reason: 'invalid_period' };
  }

  const context = await loadTimesheetContext(
    businessModels,
    business._id,
    period.startYmd,
    period.endYmd
  );
  const businessName = context.businessName || business.name || 'EaseMySalon';
  const periodLabel = period.periodLabel;

  if (!emailService.initialized) {
    await emailService.initialize();
  }

  logger.info(
    `[timesheet-email] Sending timesheets for ${business.name} (${periodLabel}) to ${recipients.length} staff (Excel + PDF)`
  );

  let sentCount = 0;
  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
    const staff = recipients[i];
    try {
      const { summary, attachments } = await buildStaffTimesheetAttachments(
        staff,
        context,
        periodDates,
        periodLabel
      );

      await emailService.sendStaffTimesheetReport({
        to: staff.email,
        businessName,
        staffName: staff.name,
        periodLabel,
        daysWithCheckIn: summary.daysWithCheckIn,
        totalHours: summary.totalHoursLabel,
        rowCount: summary.rowCount,
        attachments,
      });
      sentCount += 1;
      logger.debug(`[timesheet-email] Sent to ${staff.email} (${staff.name})`);
    } catch (err) {
      logger.error(`[timesheet-email] Failed for ${staff.name} (${staff.email}):`, err);
    }
  }

  return {
    sent: true,
    month: monthKey || period.monthKey,
    recipientCount: recipients.length,
    emailsSent: sentCount,
  };
}

async function sendMonthlyTimesheetReports() {
  try {
    logger.info('[timesheet-email] Starting monthly timesheet report email job');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const businesses = await Business.find({ status: 'active' });
    const { monthKey, periodLabel } = previousTimesheetMonthRange();
    logger.info(`[timesheet-email] Processing ${businesses.length} businesses for ${periodLabel} (${monthKey})`);

    for (const business of businesses) {
      try {
        await sendMonthlyTimesheetReportsForBusiness(business, mainConnection, { monthKey });
        await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
      } catch (err) {
        logger.error(`[timesheet-email] Error for business ${business.name}:`, err);
      }
    }

    logger.info('[timesheet-email] Monthly timesheet report email job completed');
  } catch (err) {
    logger.error('[timesheet-email] Monthly timesheet report email job failed:', err);
  }
}

module.exports = {
  sendMonthlyTimesheetReports,
  sendMonthlyTimesheetReportsForBusiness,
  resolveTimesheetStaffRecipients,
};
