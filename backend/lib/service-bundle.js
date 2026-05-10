const mongoose = require('mongoose');

function childEffectiveUnit(s) {
  if (!s) return 0;
  const offer = s.offerPrice;
  const full = s.fullPrice;
  const p = s.price;
  if (offer != null && offer !== undefined && !Number.isNaN(Number(offer))) return Number(offer);
  if (full != null && full !== undefined && !Number.isNaN(Number(full))) return Number(full);
  return Number(p) || 0;
}

/**
 * @param {unknown} raw
 * @returns {{ serviceId: import('mongoose').Types.ObjectId; sortOrder: number }[] | null}
 */
function parseBundleItems(raw) {
  if (!Array.isArray(raw)) return null;
  const items = raw
    .map((row, idx) => {
      const sid = row && (row.serviceId || row._id);
      if (!sid) return null;
      const sortOrder = typeof row.sortOrder === 'number' ? row.sortOrder : idx;
      return { serviceId: String(sid), sortOrder };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (items.length === 0) return null;
  return items.map((x, i) => ({
    serviceId: new mongoose.Types.ObjectId(x.serviceId),
    sortOrder: i,
  }));
}

/**
 * @param {import('mongoose').Model} Service
 * @param {import('mongoose').Types.ObjectId} branchId
 * @param {object} opts
 */
async function resolveBundleForSave(Service, branchId, opts) {
  const {
    bundleItemsRaw,
    bundleScheduleType,
    bundlePricingType,
    bundlePercentOff,
    bundleRetailPriceRaw,
  } = opts;

  const schedule = bundleScheduleType === 'parallel' ? 'parallel' : 'sequence';
  const allowedPricing = new Set(['full_price', 'custom', 'percent_discount', 'free']);
  const pricing = allowedPricing.has(bundlePricingType) ? bundlePricingType : null;
  if (!pricing) {
    const err = new Error('Invalid bundle pricing type');
    err.statusCode = 400;
    throw err;
  }

  const bundleItems = parseBundleItems(bundleItemsRaw);
  if (!bundleItems || bundleItems.length < 2) {
    const err = new Error('Bundle must include at least two services');
    err.statusCode = 400;
    throw err;
  }

  const ids = bundleItems.map((b) => String(b.serviceId));
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length !== ids.length) {
    const err = new Error('Duplicate services in bundle');
    err.statusCode = 400;
    throw err;
  }

  const children = await Service.find({
    _id: { $in: bundleItems.map((b) => b.serviceId) },
    branchId,
    isActive: true,
  }).lean();

  if (children.length !== uniqueIds.length) {
    const err = new Error('One or more bundled services are missing or inactive');
    err.statusCode = 400;
    throw err;
  }

  for (const c of children) {
    if (c.serviceKind === 'bundle') {
      const err = new Error('Nested bundles are not allowed');
      err.statusCode = 400;
      throw err;
    }
  }

  const byId = new Map(children.map((c) => [String(c._id), c]));
  const ordered = bundleItems.map((bi) => byId.get(String(bi.serviceId)));

  const durations = ordered.map((c) => Number(c.duration) || 0);
  const duration =
    schedule === 'sequence'
      ? durations.reduce((a, b) => a + b, 0)
      : Math.max(0, ...durations);

  if (!Number.isFinite(duration) || duration < 1) {
    const err = new Error('Invalid bundle duration');
    err.statusCode = 400;
    throw err;
  }

  const unitPrices = ordered.map((c) => childEffectiveUnit(c));
  const sumPrice = unitPrices.reduce((a, b) => a + b, 0);

  let price;
  let fullPrice;
  let offerPrice;
  let bundlePercentStored;
  let bundleRetailStored;

  if (pricing === 'full_price') {
    fullPrice = sumPrice;
    offerPrice = undefined;
    price = sumPrice;
  } else if (pricing === 'custom') {
    const retail =
      bundleRetailPriceRaw != null ? Number(bundleRetailPriceRaw) : NaN;
    if (Number.isNaN(retail) || retail < 0) {
      const err = new Error('Custom bundle retail price is required');
      err.statusCode = 400;
      throw err;
    }
    fullPrice = sumPrice;
    offerPrice = retail;
    price = retail;
    bundleRetailStored = retail;
  } else if (pricing === 'percent_discount') {
    const pct = Number(bundlePercentOff);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      const err = new Error('Bundle percent off must be between 0 and 100');
      err.statusCode = 400;
      throw err;
    }
    const discounted = sumPrice * (1 - pct / 100);
    fullPrice = sumPrice;
    offerPrice = discounted;
    price = discounted;
    bundlePercentStored = pct;
  } else {
    fullPrice = sumPrice;
    offerPrice = 0;
    price = 0;
  }

  const taxApplicable = ordered.some((c) => !!c.taxApplicable);

  return {
    bundleItems,
    bundleScheduleType: schedule,
    bundlePricingType: pricing,
    bundlePercentOff: bundlePercentStored,
    bundleRetailPrice: bundleRetailStored,
    duration: Math.max(1, Math.round(duration)),
    price,
    fullPrice,
    offerPrice,
    taxApplicable,
  };
}

/**
 * @param {import('mongoose').Model} Service
 * @param {string} branchId
 * @param {string} serviceIdToDelete
 */
async function findBundleReferencingService(Service, branchId, serviceIdToDelete) {
  const oid =
    typeof serviceIdToDelete === 'string' && mongoose.Types.ObjectId.isValid(serviceIdToDelete)
      ? new mongoose.Types.ObjectId(serviceIdToDelete)
      : null;
  if (!oid) return null;
  return Service.findOne({
    branchId,
    serviceKind: 'bundle',
    'bundleItems.serviceId': oid,
  })
    .select('name')
    .lean();
}

module.exports = {
  parseBundleItems,
  resolveBundleForSave,
  findBundleReferencingService,
  childEffectiveUnit,
};
