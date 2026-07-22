'use strict';

const { normalizePlatformLeadPhone } = require('./send-platform-lead-welcome-whatsapp');
const {
  buildPlatformCampaignSendPayload,
  resolveLeadField,
} = require('./platform-template-send-payload');

function buildPlatformLeadAudienceQuery(campaign) {
  const af = campaign.audienceFilters || {};
  const filter = {
    phone: { $exists: true, $nin: [null, ''] },
  };

  if (Array.isArray(af.statuses) && af.statuses.length) {
    filter.status = { $in: af.statuses.map(String) };
  }
  if (Array.isArray(af.sources) && af.sources.length) {
    filter.source = { $in: af.sources.map(String) };
  }
  if (Array.isArray(af.cities) && af.cities.length) {
    filter.city = { $in: af.cities.map(String) };
  }
  if (af.excludeMarketingOptOut === true) {
    filter.marketingOptOut = { $ne: true };
  }

  return { filter, af };
}

function applyCustomPhoneList(filter, phoneList) {
  const normalized = phoneList
    .map((p) => String(p || '').replace(/\D/g, '').slice(-10))
    .filter((p) => p.length === 10);
  if (!normalized.length) {
    filter._id = null;
    return;
  }
  filter.phone = { $in: normalized };
}

async function resolvePlatformLeadAudience({ campaign, PlatformLead }) {
  const { filter, af } = buildPlatformLeadAudienceQuery(campaign);

  if (campaign.audienceType === 'custom' && Array.isArray(af.phoneList) && af.phoneList.length) {
    applyCustomPhoneList(filter, af.phoneList);
  }

  const leads = await PlatformLead.find(filter)
    .select('_id firstName lastName name salonName city phone email source status marketingOptOut')
    .lean();

  return leads
    .map((lead) => ({
      platformLeadId: lead._id,
      phone: normalizePlatformLeadPhone(lead.phone),
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      name: lead.name || '',
      salonName: lead.salonName || '',
      city: lead.city || '',
      email: lead.email || '',
      source: lead.source || '',
      status: lead.status || '',
    }))
    .filter((r) => r.phone && r.phone.length >= 12);
}

function buildTemplateParams(template, variableMapping, recipient) {
  return buildPlatformCampaignSendPayload(template, variableMapping, recipient).params;
}

module.exports = {
  buildPlatformLeadAudienceQuery,
  resolvePlatformLeadAudience,
  buildTemplateParams,
  resolveLeadField,
};
