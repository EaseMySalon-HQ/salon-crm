'use strict';

const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { isPlatformEmailDisabled } = require('./business-email-policy');
const { buildMonthlySummaryData } = require('./monthly-summary-data');
const { buildMonthlySummaryChartUrls } = require('./monthly-summary-charts');
const { renderMonthlySummaryEmail } = require('./monthly-summary-email');
const { getPreviousMonthRangeIST } = require('../utils/date-utils');
const { getAllActiveBranchesForOwner } = require('./get-all-branches');
const {
  resolveReportRecipients,
  resolveAdminRecipientsForBusiness,
} = require('./report-email-recipients');

const EMAIL_DELAY_MS = 600;

function appBaseUrl() {
  return (process.env.APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

async function buildRollupSummary(mainConnection, ownerId, monthKey) {
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const branches = await getAllActiveBranchesForOwner(mainConnection, ownerId);
  if (branches.length < 2) return null;

  const branchLines = [];
  let totalRevenue = 0;
  let totalBills = 0;

  for (const b of branches) {
    const business = await Business.findById(b.id).lean();
    if (!business) continue;
    const businessDb = await databaseManager.getConnection(business._id, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const data = await buildMonthlySummaryData(businessModels, business._id, {
      monthKey,
      branchName: business.name,
    });
    totalRevenue += data.monthTotalRevenue;
    totalBills += data.monthTotalBills;
    branchLines.push(`${business.name}: ${data.monthTotalRevenue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} (${data.monthTotalBills} bills)`);
  }

  const period = getPreviousMonthRangeIST(new Date(`${monthKey}-15`));
  return {
    branchName: 'All branches',
    monthKey,
    monthName: period.monthName,
    year: period.year,
    monthTotalRevenue: totalRevenue,
    monthTotalBills: totalBills,
    monthTotalAppointments: 0,
    previousMonthTotalRevenue: 0,
    branchLines,
    isRollup: true,
  };
}

/**
 * Send monthly summary for one business.
 */
async function sendMonthlySummaryForBusiness(business, mainConnection, options = {}) {
  if (isPlatformEmailDisabled(business)) {
    return { sent: 0, skipped: true, reason: 'platform_email_disabled' };
  }

  const settings = business.settings?.emailNotificationSettings || {};
  if (!settings?.monthlySummary?.enabled) {
    return { sent: 0, skipped: true, reason: 'disabled' };
  }

  const period = getPreviousMonthRangeIST(options.referenceDate || new Date());
  const monthKey = options.monthKey || period.monthKey;

  const businessDb = await databaseManager.getConnection(business._id, mainConnection);
  const businessModels = modelFactory.createBusinessModels(businessDb);

  const goal =
    settings.monthlySummary?.revenueGoal > 0
      ? settings.monthlySummary.revenueGoal
      : business.settings?.revenueTarget?.monthly;

  const summaryData = await buildMonthlySummaryData(businessModels, business._id, {
    monthKey,
    branchName: business.name || '',
    forceRefresh: options.forceRefresh,
    monthlyRevenueGoal: goal > 0 ? goal : undefined,
    revenueTargetMonthly: business.settings?.revenueTarget?.monthly,
  });

  const charts = buildMonthlySummaryChartUrls(summaryData);
  const baseUrl = appBaseUrl();
  const logoUrl = baseUrl ? `${baseUrl}/images/logo-no-background.png` : '';
  const dashboardUrl = baseUrl ? `${baseUrl}/dashboard` : '#';
  const settingsUrl = baseUrl ? `${baseUrl}/settings?section=notifications` : '#';
  const reportUrl = baseUrl ? `${baseUrl}/reports?month=${monthKey}` : dashboardUrl;

  const recipients = await resolveReportRecipients({
    business,
    businessModels,
    mainConnection,
    prefKey: 'monthlySummary',
    recipientStaffIds: settings?.monthlySummary?.recipientStaffIds || [],
  });
  const adminRecipients = await resolveAdminRecipientsForBusiness(business, mainConnection);

  if (recipients.length === 0) {
    return { sent: 0, skipped: false, reason: 'no_recipients' };
  }

  if (!emailService.initialized) await emailService.initialize();

  let sentCount = 0;
  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
    const recipient = recipients[i];
    try {
      const ownerName = recipient.name || 'there';
      const { html, text } = renderMonthlySummaryEmail(summaryData, charts, {
        ownerName,
        logoUrl,
        dashboardUrl,
        settingsUrl,
        reportUrl,
      });
      await emailService.sendEmail({
        to: recipient.email,
        subject: `Monthly Summary — ${summaryData.monthName} ${summaryData.year} · ${business.name}`,
        html,
        text,
      });
      sentCount += 1;
    } catch (err) {
      logger.error(`[monthly-summary] Failed for ${recipient.email}:`, err);
    }
  }

  let rollupSent = 0;
  if (business.owner && options.includeRollup !== false) {
    const rollup = await buildRollupSummary(mainConnection, business.owner, monthKey);
    if (rollup) {
      const rollupCharts = buildMonthlySummaryChartUrls(rollup);
      for (const admin of adminRecipients) {
        try {
          const { html, text } = renderMonthlySummaryEmail(rollup, rollupCharts, {
            ownerName: admin.name || admin.email,
            logoUrl,
            dashboardUrl,
            settingsUrl,
            reportUrl,
            isRollup: true,
            branchLines: rollup.branchLines,
          });
          await emailService.sendEmail({
            to: admin.email,
            subject: `Monthly Rollup — ${rollup.monthName} ${rollup.year} (all branches)`,
            html,
            text,
          });
          rollupSent += 1;
          await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
        } catch (err) {
          logger.error(`[monthly-summary] Rollup failed for ${admin.email}:`, err);
        }
      }
    }
  }

  return {
    sent: sentCount,
    rollupSent,
    skipped: false,
    monthKey,
    recipientCount: recipients.length,
  };
}

module.exports = {
  sendMonthlySummaryForBusiness,
  EMAIL_DELAY_MS,
};
