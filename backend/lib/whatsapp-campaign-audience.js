'use strict';

const mongoose = require('mongoose');
const { mergeClientSegmentRules, deriveClientSegmentFromRules } = require('./client-segment-rules');

const MS_DAY = 86_400_000;
const CANCELLED_SALE_STATUSES = ['cancelled', 'Cancelled'];

/**
 * Build the Mongo filter for opted-in WhatsApp campaign clients (excludes custom phone list).
 * @param {object} campaign
 * @param {object} [opts]
 * @param {object} [opts.segmentRules]
 */
function buildAudienceClientQuery(campaign, { segmentRules } = {}) {
  const af = campaign.audienceFilters || {};
  const filter = {
    promotionalWhatsappEnabled: { $ne: false },
    'whatsappConsent.waMarketingOptOut': { $ne: true },
    phone: { $exists: true, $nin: [null, ''] },
    isWalkIn: { $ne: true },
  };

  if (af.totalSpentMin != null && af.totalSpentMin !== '') {
    filter.totalSpent = { ...(filter.totalSpent || {}), $gte: Number(af.totalSpentMin) };
  }
  if (af.totalSpentMax != null && af.totalSpentMax !== '') {
    filter.totalSpent = { ...(filter.totalSpent || {}), $lte: Number(af.totalSpentMax) };
  }
  if (af.totalVisitsMin != null && af.totalVisitsMin !== '') {
    filter.totalVisits = { ...(filter.totalVisits || {}), $gte: Number(af.totalVisitsMin) };
  }
  if (af.totalVisitsMax != null && af.totalVisitsMax !== '') {
    filter.totalVisits = { ...(filter.totalVisits || {}), $lte: Number(af.totalVisitsMax) };
  }

  const genders = normalizeGenders(af);
  if (genders.length === 1) {
    filter.gender = genders[0];
  } else if (genders.length > 1) {
    filter.gender = { $in: genders };
  }

  if (af.status === 'active' || af.status === 'inactive') {
    filter.status = af.status;
  }

  if (af.birthdayThisMonth) {
    const month = new Date().getUTCMonth() + 1;
    filter.dob = { $exists: true, $ne: null };
    filter.$expr = {
      $eq: [{ $month: '$dob' }, month],
    };
  }

  const lastVisitRange = resolveLastVisitRange(af);
  if (lastVisitRange === 'never') {
    filter.$or = [{ lastVisit: null }, { lastVisit: { $exists: false } }];
  } else if (lastVisitRange) {
    filter.lastVisit = lastVisitRange;
  }

  return { filter, af, segmentRules: mergeClientSegmentRules(segmentRules) };
}

function normalizeGenders(af) {
  const fromList = Array.isArray(af.genders)
    ? af.genders.map((g) => String(g || '').toLowerCase()).filter(Boolean)
    : [];
  if (fromList.length) return [...new Set(fromList)];
  if (af.gender) return [String(af.gender).toLowerCase()];
  return [];
}

function resolveLastVisitRange(af) {
  if (af.lastVisitFrom || af.lastVisitTo) {
    const range = {};
    if (af.lastVisitFrom) range.$gte = new Date(af.lastVisitFrom);
    if (af.lastVisitTo) range.$lte = new Date(af.lastVisitTo);
    return range;
  }

  const preset = String(af.lastVisit || '').trim();
  if (!preset || preset === 'any') return null;
  const now = Date.now();
  switch (preset) {
    case 'under_30':
      return { $gte: new Date(now - 30 * MS_DAY) };
    case '30_90':
      return { $gte: new Date(now - 90 * MS_DAY), $lt: new Date(now - 30 * MS_DAY) };
    case '90_180':
      return { $gte: new Date(now - 180 * MS_DAY), $lt: new Date(now - 90 * MS_DAY) };
    case 'over_180':
      return { $lt: new Date(now - 180 * MS_DAY) };
    case 'never':
      return 'never';
    default:
      return null;
  }
}

function phoneVariants(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return [];
  const variants = new Set([digits]);
  if (digits.length === 12 && digits.startsWith('91')) variants.add(digits.slice(2));
  if (digits.length === 11 && digits.startsWith('0')) {
    variants.add(digits.slice(1));
    variants.add(`91${digits.slice(1)}`);
  }
  if (digits.length === 10) variants.add(`91${digits}`);
  return Array.from(variants);
}

function applyCustomPhoneList(filter, phoneList) {
  const variants = new Set();
  for (const raw of phoneList) {
    for (const v of phoneVariants(raw)) variants.add(v);
  }
  filter.phone = { $in: Array.from(variants) };
}

function matchesSegmentFilters(client, segments, rules) {
  if (!Array.isArray(segments) || segments.length === 0) return true;
  const seg = deriveClientSegmentFromRules(
    client.totalVisits,
    client.totalSpent,
    client.lastVisit,
    rules
  );
  return segments.includes(seg);
}

async function phonesWithOutstandingDues(Sale) {
  const rows = await Sale.aggregate([
    {
      $match: {
        status: { $nin: CANCELLED_SALE_STATUSES },
        'paymentStatus.remainingAmount': { $gt: 0 },
        customerPhone: { $exists: true, $nin: [null, ''] },
      },
    },
    { $group: { _id: '$customerPhone' } },
  ]).option({ allowDiskUse: true });

  const set = new Set();
  for (const row of rows) {
    for (const v of phoneVariants(row._id)) set.add(v);
  }
  return set;
}

function clientPhoneMatchesDueSet(client, duePhones) {
  for (const v of phoneVariants(client.phone)) {
    if (duePhones.has(v)) return true;
  }
  return false;
}

function normalizeObjectIds(ids) {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => String(id || '').trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

/**
 * Phones that appear on at least one non-cancelled sale containing any selected service/product.
 * @returns {Promise<Set<string>|null>} null when no purchase filters are set
 */
async function phonesWithPurchaseHistory(Sale, { serviceIds = [], productIds = [] } = {}) {
  const serviceOids = normalizeObjectIds(serviceIds);
  const productOids = normalizeObjectIds(productIds);
  if (!serviceOids.length && !productOids.length) return null;

  const orConditions = [];
  if (serviceOids.length) {
    orConditions.push({ type: 'service', serviceId: { $in: serviceOids } });
  }
  if (productOids.length) {
    orConditions.push({ type: 'product', productId: { $in: productOids } });
  }

  const rows = await Sale.aggregate([
    {
      $match: {
        status: { $nin: CANCELLED_SALE_STATUSES },
        customerPhone: { $exists: true, $nin: [null, ''] },
        items: { $elemMatch: { $or: orConditions } },
      },
    },
    { $group: { _id: '$customerPhone' } },
  ]).option({ allowDiskUse: true });

  const set = new Set();
  for (const row of rows) {
    for (const v of phoneVariants(row._id)) set.add(v);
  }
  return set;
}

function hasPurchaseFilters(af) {
  const serviceIds = Array.isArray(af?.serviceIds) ? af.serviceIds : [];
  const productIds = Array.isArray(af?.productIds) ? af.productIds : [];
  return serviceIds.length > 0 || productIds.length > 0;
}

module.exports = {
  buildAudienceClientQuery,
  applyCustomPhoneList,
  matchesSegmentFilters,
  phonesWithOutstandingDues,
  phonesWithPurchaseHistory,
  hasPurchaseFilters,
  clientPhoneMatchesDueSet,
  phoneVariants,
  resolveLastVisitRange,
  normalizeObjectIds,
};
