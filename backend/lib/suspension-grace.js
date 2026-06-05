/**
 * Billing suspension grace: tenants keep full access for 3 calendar days after
 * status becomes `suspended`, then APIs and UI block until billing is cleared.
 */

const GRACE_DAYS = 3;
const GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;

function getSuspendedAt(business) {
  if (!business || business.status !== 'suspended') return null;
  if (business.suspendedAt) return new Date(business.suspendedAt);
  if (business.updatedAt) return new Date(business.updatedAt);
  return new Date();
}

function getGraceEndsAt(business) {
  const at = getSuspendedAt(business);
  if (!at) return null;
  return new Date(at.getTime() + GRACE_MS);
}

function isInSuspensionGrace(business) {
  if (!business || business.status !== 'suspended') return false;
  const ends = getGraceEndsAt(business);
  return Boolean(ends && Date.now() < ends.getTime());
}

/** True when tenant APIs and app shell should block (past grace or unknown suspendedAt). */
function isAccessBlockedBySuspension(business) {
  if (!business || business.status !== 'suspended') return false;
  return !isInSuspensionGrace(business);
}

function buildSuspensionMeta(business) {
  const plan = business?.plan;
  const rawNext = plan?.renewalDate || plan?.trialEndsAt;
  const graceEnds = getGraceEndsAt(business);
  const inGrace = isInSuspensionGrace(business);

  return {
    businessSuspended: isAccessBlockedBySuspension(business),
    suspensionGraceActive: inGrace,
    suspensionGraceEndsAt: graceEnds ? graceEnds.toISOString() : null,
    suspensionGraceDays: GRACE_DAYS,
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
  GRACE_DAYS,
  GRACE_MS,
  getSuspendedAt,
  getGraceEndsAt,
  isInSuspensionGrace,
  isAccessBlockedBySuspension,
  buildSuspensionMeta,
  statusUpdateFields,
};
