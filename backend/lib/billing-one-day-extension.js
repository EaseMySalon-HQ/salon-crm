'use strict';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * One 1-day billing grace per suspension cycle (extension must predate current suspendedAt).
 */
function canUseOneDayBillingExtension(business) {
  if (!business || business.status !== 'suspended') return false;

  const usedAt = business.plan?.lastOneDayGraceExtensionAt;
  const suspendedAt = business.suspendedAt;
  if (!usedAt) return true;
  if (!suspendedAt) return false;

  return new Date(usedAt).getTime() < new Date(suspendedAt).getTime();
}

function computeExtendedRenewalDate(business) {
  const now = new Date();
  const current = business.plan?.renewalDate ? new Date(business.plan.renewalDate) : null;
  const base =
    current && !Number.isNaN(current.getTime()) && current.getTime() > now.getTime()
      ? current
      : now;
  return new Date(base.getTime() + MS_PER_DAY);
}

async function applyOneDayBillingExtension(BusinessModel, businessId) {
  const business = await BusinessModel.findById(businessId);
  if (!business) {
    return { ok: false, error: 'BUSINESS_NOT_FOUND', message: 'Business not found.' };
  }

  if (!canUseOneDayBillingExtension(business)) {
    return {
      ok: false,
      error: 'EXTENSION_NOT_AVAILABLE',
      message: 'A 1-day extension is not available for this account.',
    };
  }

  if (!business.plan) business.plan = {};
  business.plan.renewalDate = computeExtendedRenewalDate(business);
  business.plan.lastOneDayGraceExtensionAt = new Date();
  business.status = 'active';
  business.suspendedAt = null;
  business.updatedAt = new Date();
  await business.save();

  return {
    ok: true,
    renewalDate: business.plan.renewalDate,
  };
}

module.exports = {
  canUseOneDayBillingExtension,
  computeExtendedRenewalDate,
  applyOneDayBillingExtension,
};
