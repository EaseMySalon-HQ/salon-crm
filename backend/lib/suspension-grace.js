/**
 * Billing suspension + plan renewal warnings.
 * Suspended tenants are blocked immediately (no post-suspension grace).
 * Active tenants see renewal warnings from 7 IST calendar days before renewal.
 */

const RENEWAL_WARNING_DAYS = 7;

const IST_ZONE = 'Asia/Kolkata';

const istCalendarDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getNextBillingFromPlan(plan) {
  if (!plan) return null;
  return plan.renewalDate || plan.trialEndsAt || null;
}

/** Whole IST calendar days from today until renewal date (0 = renewal is today). */
function daysUntilRenewalInIST(nextBillingDate) {
  if (!nextBillingDate) return null;
  const billDay = istCalendarDayFormatter.format(new Date(nextBillingDate));
  const today = istCalendarDayFormatter.format(new Date());
  const billMs = Date.parse(`${billDay}T12:00:00Z`);
  const todayMs = Date.parse(`${today}T12:00:00Z`);
  if (Number.isNaN(billMs) || Number.isNaN(todayMs)) return null;
  return Math.round((billMs - todayMs) / (24 * 60 * 60 * 1000));
}

function getPlanRenewalWarning(business) {
  if (!business || business.status !== 'active') {
    return { planRenewalWarningDaysLeft: null, planRenewalExpiringToday: false };
  }
  const daysLeft = daysUntilRenewalInIST(getNextBillingFromPlan(business.plan));
  if (daysLeft == null || daysLeft < 1 || daysLeft > RENEWAL_WARNING_DAYS) {
    return { planRenewalWarningDaysLeft: null, planRenewalExpiringToday: false };
  }
  if (daysLeft === 1) {
    return { planRenewalWarningDaysLeft: null, planRenewalExpiringToday: true };
  }
  return { planRenewalWarningDaysLeft: daysLeft, planRenewalExpiringToday: false };
}

/** True when tenant APIs and app shell should block. */
function isAccessBlockedBySuspension(business) {
  return business?.status === 'suspended';
}

function buildSuspensionMeta(business) {
  const rawNext = getNextBillingFromPlan(business?.plan);
  const warning = getPlanRenewalWarning(business);

  return {
    businessSuspended: isAccessBlockedBySuspension(business),
    planRenewalWarningDaysLeft: warning.planRenewalWarningDaysLeft,
    planRenewalExpiringToday: warning.planRenewalExpiringToday,
    nextBillingDate: rawNext != null ? new Date(rawNext).toISOString() : null,
    suspensionSupportEmail: process.env.SUSPENSION_SUPPORT_EMAIL || 'support@easemysalon.in',
    suspensionSupportPhone: process.env.SUSPENSION_SUPPORT_PHONE || undefined,
  };
}

/** Fields to $set when admin or jobs change business.status */
function statusUpdateFields(status) {
  const update = { status, updatedAt: new Date() };
  if (status === 'suspended') {
    update.suspendedAt = new Date();
  } else if (status === 'active' || status === 'inactive') {
    update.suspendedAt = null;
  }
  return update;
}

module.exports = {
  RENEWAL_WARNING_DAYS,
  daysUntilRenewalInIST,
  getPlanRenewalWarning,
  isAccessBlockedBySuspension,
  buildSuspensionMeta,
  statusUpdateFields,
};
