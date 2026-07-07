'use strict';

const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { isPlatformEmailDisabled } = require('../lib/business-email-policy');
const { getPreviousMonthRangeIST } = require('../utils/date-utils');
const { generatePayslipPdfBuffer, fmtMoney, formatPayPeriodMonth } = require('./payslip-pdf');

const { staffEmailPreferenceFindQuery } = require('./admin-email-preferences');

const EMAIL_DELAY_MS = 600;

function previousPayrollMonthKey(referenceDate = new Date()) {
  const { startYmd } = getPreviousMonthRangeIST(referenceDate);
  return startYmd.slice(0, 7);
}

async function resolvePayrollEmailRecipients(business, businessModels, mainConnection) {
  const emailSettings = business.settings?.emailNotificationSettings;
  const recipientStaffIds = emailSettings?.payrollNotifications?.recipientStaffIds || [];
  const { Staff } = businessModels;
  let recipients = [];

  if (recipientStaffIds.length > 0) {
    recipients = await Staff.find(
      staffEmailPreferenceFindQuery('payrollSlip', { recipientStaffIds })
    ).lean();
  } else {
    recipients = await Staff.find(
      staffEmailPreferenceFindQuery('payrollSlip', { branchId: business._id })
    ).lean();
  }

  const User = mainConnection.model('User', require('../models/User').schema);
  const adminUsers = await User.find({
    branchId: business._id,
    role: 'admin',
    email: { $exists: true, $ne: '' },
  }).lean();

  for (const admin of adminUsers) {
    const alreadyInList = recipients.some((r) => r.email === admin.email);
    if (!alreadyInList) {
      recipients.push({
        _id: admin._id,
        name: admin.name || `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email,
        email: admin.email,
        role: 'admin',
      });
    }
  }

  return recipients;
}

function payrollRecordToRow(record, staffMeta = {}) {
  return {
    staffName: record.staffName || staffMeta.name || 'Staff',
    role: staffMeta.role || '',
    phone: staffMeta.phone || '',
    month: record.month,
    baseSalary: record.baseSalary || 0,
    incentive: record.incentive || 0,
    bonus: record.bonus || 0,
    overtimePay: record.overtimePay || 0,
    latePenalty: record.latePenalty || 0,
    deductions: record.deductions || 0,
    leaveDeduction: record.leaveDeduction || 0,
    unpaidLeaveDays: record.unpaidLeaveDays || 0,
    advanceRecovery: record.advanceRecovery || 0,
    manualDeductions: record.manualDeductions || 0,
    deductionNote: record.deductionNote || '',
    netPay: record.netPay || 0,
    status: record.status || 'draft',
    paidAt: record.paidAt || null,
    paymentMethod: record.paymentMethod || '',
    notes: record.notes || '',
  };
}

async function buildMonthlyPayrollEmailPayload({
  records,
  businessModels,
  payrollSettings,
  tenantSettings,
  businessName,
  periodLabel,
  payrollMonth,
}) {
  const { Staff } = businessModels;
  const staffIds = records.map((r) => r.staffId).filter(Boolean);
  const staffList = staffIds.length
    ? await Staff.find({ _id: { $in: staffIds } }).select('name role phone').lean()
    : [];
  const staffById = new Map(staffList.map((s) => [String(s._id), s]));

  const currency = tenantSettings?.currency || 'INR';
  const money = (n) => fmtMoney(n, currency);

  let totalBase = 0;
  let totalCommission = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  const emailRows = [];
  const attachments = [];

  for (const record of records) {
    const staffMeta = staffById.get(String(record.staffId)) || {};
    const row = payrollRecordToRow(record, staffMeta);

    totalBase += row.baseSalary;
    totalCommission += row.incentive;
    totalDeductions += row.deductions || 0;
    totalNet += row.netPay;

    emailRows.push({
      staffName: row.staffName,
      role: row.role,
      baseSalary: money(row.baseSalary),
      commission: money(row.incentive),
      deductions: money(-Math.abs(row.deductions || 0)),
      netPay: money(row.netPay),
    });

    if (payrollSettings.attachSalarySlip !== false) {
      const pdfBuffer = await generatePayslipPdfBuffer(row, tenantSettings || { name: businessName }, periodLabel);
      const safeName = String(row.staffName).replace(/[/\\?%*:|"<>]/g, '-');
      attachments.push({
        filename: `payslip-${safeName}-${payrollMonth}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });
    }
  }

  emailRows.sort((a, b) => String(a.staffName).localeCompare(String(b.staffName)));

  return {
    rows: emailRows,
    attachments,
    totals: {
      staffCount: emailRows.length,
      baseSalary: money(totalBase),
      commission: money(totalCommission),
      deductions: money(-Math.abs(totalDeductions)),
      netPay: money(totalNet),
    },
  };
}

/**
 * Send one consolidated salary slip email for all payroll records in the given month.
 */
async function sendMonthlyPayrollSlipsForBusiness(business, mainConnection, { month } = {}) {
  if (isPlatformEmailDisabled(business)) {
    logger.debug(`[payroll-email] Skipping ${business.name} — platform email disabled`);
    return { skipped: true, reason: 'platform_email_disabled' };
  }

  const { hasFeature } = require('./entitlements');
  if (!hasFeature(business, 'payroll')) {
    logger.debug(`[payroll-email] Skipping ${business.name} — plan lacks payroll`);
    return { skipped: true, reason: 'feature_not_entitled' };
  }

  const emailSettings = business.settings?.emailNotificationSettings || {};
  const payrollSettings = emailSettings.payrollNotifications || {};
  const recipientListConfigured = payrollSettings.recipientStaffIds?.length > 0;
  const enabled =
    payrollSettings.enabled !== false ||
    (payrollSettings.enabled === false && !recipientListConfigured);

  if (!enabled) {
    logger.debug(`[payroll-email] Skipping ${business.name} — disabled in settings`);
    return { skipped: true, reason: 'disabled' };
  }

  const payrollMonth = month || previousPayrollMonthKey();
  const businessDb = await databaseManager.getConnection(business._id, mainConnection);
  const businessModels = modelFactory.createBusinessModels(businessDb);
  const { PayrollRecord, BusinessSettings } = businessModels;

  const recipients = await resolvePayrollEmailRecipients(business, businessModels, mainConnection);
  if (!recipients.length) {
    logger.warn(
      `[payroll-email] No recipients for ${business.name} — enable Payroll slip in Email Notifications`
    );
    return { skipped: true, reason: 'no_recipients' };
  }

  const records = await PayrollRecord.find({ branchId: business._id, month: payrollMonth }).lean();
  if (!records.length) {
    logger.info(`[payroll-email] No payroll records for ${business.name} (${payrollMonth})`);
    return { skipped: true, reason: 'no_records', month: payrollMonth };
  }

  if (!emailService.initialized) {
    await emailService.initialize();
  }

  const tenantSettings = BusinessSettings
    ? await BusinessSettings.findOne().select('name address city state zipCode phone email gstNumber currency').lean()
    : null;
  const businessName = tenantSettings?.name || business.name || 'EaseMySalon';
  const periodLabel = formatPayPeriodMonth(payrollMonth);

  const { rows, attachments, totals } = await buildMonthlyPayrollEmailPayload({
    records,
    businessModels,
    payrollSettings,
    tenantSettings,
    businessName,
    periodLabel,
    payrollMonth,
  });

  logger.info(
    `[payroll-email] Sending consolidated payroll email for ${business.name} (${periodLabel}): ${rows.length} staff, ${attachments.length} attachment(s) to ${recipients.length} recipient(s)`
  );

  for (let i = 0; i < recipients.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
    const recipient = recipients[i];
    try {
      await emailService.sendStaffPayrollSummary({
        to: recipient.email,
        businessName,
        periodLabel,
        rows,
        totals,
        attachments,
      });
      logger.debug(`[payroll-email] Sent to ${recipient.email} for ${business.name}`);
    } catch (err) {
      logger.error(`[payroll-email] Failed to send to ${recipient.email}:`, err);
    }
  }

  return {
    sent: true,
    month: payrollMonth,
    recordCount: records.length,
    recipientCount: recipients.length,
    attachmentCount: attachments.length,
  };
}

/**
 * Monthly job — 1st of each month for the previous calendar month (e.g. July payroll on Aug 1).
 */
async function sendMonthlyPayrollSlips() {
  try {
    logger.info('[payroll-email] Starting monthly payroll slip email job');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const businesses = await Business.find({ status: 'active' });
    const payrollMonth = previousPayrollMonthKey();
    logger.info(`[payroll-email] Processing ${businesses.length} businesses for ${payrollMonth}`);

    for (const business of businesses) {
      try {
        await sendMonthlyPayrollSlipsForBusiness(business, mainConnection, { month: payrollMonth });
        await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
      } catch (err) {
        logger.error(`[payroll-email] Error for business ${business.name}:`, err);
      }
    }

    logger.info('[payroll-email] Monthly payroll slip email job completed');
  } catch (err) {
    logger.error('[payroll-email] Monthly payroll slip email job failed:', err);
  }
}

module.exports = {
  sendMonthlyPayrollSlips,
  sendMonthlyPayrollSlipsForBusiness,
  resolvePayrollEmailRecipients,
  previousPayrollMonthKey,
  buildMonthlyPayrollEmailPayload,
};
