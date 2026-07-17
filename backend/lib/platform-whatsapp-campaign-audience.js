'use strict';

const { normalizePlatformLeadPhone } = require('./send-platform-lead-welcome-whatsapp');

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

function resolveLeadField(recipient, field) {
  switch (field) {
    case 'firstName':
      return recipient.firstName || recipient.name?.split(/\s+/)[0] || 'there';
    case 'lastName':
      return recipient.lastName || '';
    case 'name':
      return recipient.name || recipient.firstName || 'there';
    case 'salonName':
      return recipient.salonName || '';
    case 'city':
      return recipient.city || '';
    case 'phone':
      return recipient.phone || '';
    case 'email':
      return recipient.email || '';
    case 'source':
      return recipient.source || '';
    case 'status':
      return recipient.status || '';
    default:
      return recipient.name || recipient.firstName || '';
  }
}

function buildTemplateParams(template, variableMapping, recipient) {
  const bodyText = template?.components?.body?.text || '';
  const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
  const maxIndex = matches.reduce((max, token) => {
    const n = parseInt(token.replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  if (!maxIndex) return [];

  const params = [];
  for (let i = 1; i <= maxIndex; i += 1) {
    const key = `body_${i}`;
    const map = variableMapping?.[key];
    if (map && typeof map === 'object' && map.source === 'literal') {
      params.push(String(map.value ?? ''));
    } else if (typeof map === 'string') {
      params.push(resolveLeadField(recipient, map));
    } else if (map && typeof map === 'object' && map.field) {
      params.push(resolveLeadField(recipient, map.field));
    } else {
      params.push(resolveLeadField(recipient, 'firstName'));
    }
  }
  return params;
}

module.exports = {
  buildPlatformLeadAudienceQuery,
  resolvePlatformLeadAudience,
  buildTemplateParams,
  resolveLeadField,
};
