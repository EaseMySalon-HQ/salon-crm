'use strict';

const { applyLeadTrialPlan, invalidatePlanCache } = require('./apply-initial-business-plan');

function adminDisplayName(admin) {
  if (!admin) return 'Admin';
  return (
    admin.name ||
    [admin.firstName, admin.lastName].filter(Boolean).join(' ').trim() ||
    admin.email ||
    'Admin'
  );
}

const LINKED_LEAD_STATUSES = new Set(['trial', 'converted']);

/**
 * Mark a platform lead as trial (linked to a tenant) and optionally start a 7-day Pro trial on the business.
 * Idempotent when already linked to the same business.
 */
async function linkPlatformLeadToBusiness(
  { PlatformLead, PlatformLeadActivity, Business },
  { leadId, businessId, admin, applyBusinessTrial = true }
) {
  if (!leadId || !businessId) {
    const err = new Error('leadId and businessId are required');
    err.code = 'VALIDATION';
    throw err;
  }

  const lead = await PlatformLead.findById(leadId);
  if (!lead) {
    const err = new Error('Lead not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const business = await Business.findById(businessId);
  if (!business) {
    const err = new Error('Business not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (
    LINKED_LEAD_STATUSES.has(lead.status) &&
    lead.convertedToBusinessId &&
    String(lead.convertedToBusinessId) === String(businessId)
  ) {
    return lead;
  }

  if (LINKED_LEAD_STATUSES.has(lead.status)) {
    const err = new Error('Lead is already linked to a business');
    err.code = 'ALREADY_CONVERTED';
    throw err;
  }

  if (applyBusinessTrial) {
    applyLeadTrialPlan(business, 'pro');
    await business.save();
    invalidatePlanCache(business._id);
  }

  const oldStatus = lead.status;
  lead.status = 'trial';
  lead.convertedToBusinessId = business._id;
  lead.convertedAt = new Date();
  await lead.save();

  const performedBy = admin?._id || null;
  const performedByName = adminDisplayName(admin);
  const businessLabel = business.name || business.businessName || business._id;

  await PlatformLeadActivity.insertMany([
    {
      leadId: lead._id,
      activityType: 'status_changed',
      performedBy,
      performedByName,
      previousValue: oldStatus,
      newValue: 'trial',
      field: 'status',
      description: `Status changed from ${oldStatus} to trial`,
    },
    {
      leadId: lead._id,
      activityType: 'trial_started',
      performedBy,
      performedByName,
      newValue: business._id,
      field: 'convertedToBusinessId',
      description: `Linked to business ${businessLabel} with 7-day Pro trial`,
      details: { businessName: business.name || business.businessName },
    },
  ]);

  return lead;
}

module.exports = { linkPlatformLeadToBusiness, adminDisplayName };
