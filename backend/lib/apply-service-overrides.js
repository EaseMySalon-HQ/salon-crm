/**
 * Branch-level service overrides (Business.settings.serviceOverrides) for billing UIs.
 * Tenant Service documents in the branch DB are unchanged; overrides apply at read time.
 */

const databaseManager = require('../config/database-manager');
const { getBusinessModel } = require('./get-all-branches');
const { catalogKey } = require('./branch-management-helpers');

async function loadServiceOverridesForBranch(branchId) {
  if (!branchId) return {};
  const mainConnection = await databaseManager.getMainConnection();
  const Business = getBusinessModel(mainConnection);
  const biz = await Business.findById(branchId).select('settings.serviceOverrides').lean();
  return biz?.settings?.serviceOverrides || {};
}

function applyOverridesToServiceDoc(service, overrides) {
  if (!service || !overrides || typeof overrides !== 'object') {
    return typeof service?.toObject === 'function' ? service.toObject() : service;
  }

  const doc = typeof service.toObject === 'function' ? service.toObject() : { ...service };
  const key = catalogKey(doc.name, doc.sku);
  const ov = overrides[key];
  if (!ov) return doc;

  if (ov.price != null) {
    doc.price = ov.price;
    if (doc.offerPrice != null) doc.offerPrice = ov.price;
    if (doc.fullPrice != null) doc.fullPrice = ov.price;
    if (doc.bundleRetailPrice != null) doc.bundleRetailPrice = ov.price;
  }
  if (ov.durationMinutes != null) doc.duration = ov.durationMinutes;
  if (ov.enabled != null) doc.isActive = ov.enabled;
  if (ov.tier != null) doc.tier = ov.tier;
  doc.hasBranchOverride = true;
  return doc;
}

function applyOverridesToServiceDocs(services, overrides) {
  return (services || []).map((s) => applyOverridesToServiceDoc(s, overrides));
}

module.exports = {
  loadServiceOverridesForBranch,
  applyOverridesToServiceDoc,
  applyOverridesToServiceDocs,
};
