/**
 * Copy service catalog + branch pricing overrides between tenant databases.
 */

const mongoose = require('mongoose');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { getBusinessModel } = require('./get-all-branches');
const { catalogKey } = require('./branch-management-helpers');

const SERVICE_SCALAR_FIELDS = [
  'name',
  'category',
  'duration',
  'price',
  'fullPrice',
  'offerPrice',
  'taxApplicable',
  'hsnSacCode',
  'description',
  'isActive',
  'isAutoConsumptionEnabled',
  'serviceKind',
  'bundleScheduleType',
  'bundlePricingType',
  'bundlePercentOff',
  'bundleRetailPrice',
];

function serviceDocToPayload(doc, targetBranchId) {
  const payload = { branchId: new mongoose.Types.ObjectId(String(targetBranchId)) };
  for (const field of SERVICE_SCALAR_FIELDS) {
    if (doc[field] !== undefined) payload[field] = doc[field];
  }
  return payload;
}

function buildTargetKeyMap(services) {
  const map = new Map();
  for (const s of services || []) {
    map.set(catalogKey(s.name, s.sku), String(s._id));
  }
  return map;
}

function remapBundleItems(bundleItems, idMap) {
  const mapped = [];
  for (const item of bundleItems || []) {
    const sourceId = String(item.serviceId);
    const targetId = idMap.get(sourceId);
    if (!targetId) return { ok: false, items: [] };
    mapped.push({
      serviceId: new mongoose.Types.ObjectId(targetId),
      sortOrder: item.sortOrder ?? 0,
    });
  }
  return { ok: true, items: mapped };
}

function mergeServiceOverrides(targetOverrides, sourceOverrides) {
  return {
    ...(targetOverrides && typeof targetOverrides === 'object' ? targetOverrides : {}),
    ...(sourceOverrides && typeof sourceOverrides === 'object' ? sourceOverrides : {}),
  };
}

async function getBranchModels(mainConnection, branch) {
  const conn = await databaseManager.getConnection(branch.code, mainConnection);
  return modelFactory.getCachedBusinessModels(conn);
}

/**
 * @param {{
 *   mainConnection: import('mongoose').Connection,
 *   sourceBranch: { id: string, code: string, name: string },
 *   targetBranch: { id: string, code: string, name: string },
 *   ownerId: import('mongoose').Types.ObjectId | string,
 *   includeCatalog?: boolean,
 *   includeOverrides?: boolean,
 *   onConflict?: 'skip' | 'update',
 * }} opts
 */
async function copyBranchServices({
  mainConnection,
  sourceBranch,
  targetBranch,
  ownerId,
  includeCatalog = true,
  includeOverrides = true,
  onConflict = 'skip',
}) {
  if (String(sourceBranch.id) === String(targetBranch.id)) {
    throw new Error('Source and destination branch must be different');
  }
  if (!includeCatalog && !includeOverrides) {
    throw new Error('Nothing to copy — enable catalog and/or overrides');
  }

  const summary = {
    created: 0,
    updated: 0,
    skipped: 0,
    overridesCopied: 0,
    warnings: [],
  };

  if (includeCatalog) {
    const sourceModels = await getBranchModels(mainConnection, sourceBranch);
    const targetModels = await getBranchModels(mainConnection, targetBranch);
    const { Service: SourceService } = sourceModels;
    const { Service: TargetService } = targetModels;

    const sourceServices = await SourceService.find({}).sort({ serviceKind: 1, name: 1 }).lean();
    const targetServices = await TargetService.find({}).lean();
    const targetByKey = buildTargetKeyMap(targetServices);
    const idMap = new Map();

    const simple = sourceServices.filter((s) => s.serviceKind !== 'bundle');
    const bundles = sourceServices.filter((s) => s.serviceKind === 'bundle');

    for (const src of simple) {
      const key = catalogKey(src.name, src.sku);
      const existingId = targetByKey.get(key);
      const payload = serviceDocToPayload(src, targetBranch.id);

      if (existingId) {
        idMap.set(String(src._id), existingId);
        if (onConflict === 'update') {
          await TargetService.updateOne({ _id: existingId }, { $set: payload });
          summary.updated += 1;
        } else {
          summary.skipped += 1;
        }
        continue;
      }

      const created = await TargetService.create(payload);
      const newId = String(created._id);
      idMap.set(String(src._id), newId);
      targetByKey.set(key, newId);
      summary.created += 1;
    }

    for (const src of bundles) {
      const key = catalogKey(src.name, src.sku);
      const existingId = targetByKey.get(key);
      const remapped = remapBundleItems(src.bundleItems, idMap);

      if (!remapped.ok) {
        summary.warnings.push({
          name: src.name,
          reason: 'Bundle references services that could not be mapped — copy simple services first or resolve duplicates',
        });
        summary.skipped += 1;
        continue;
      }

      const payload = serviceDocToPayload(src, targetBranch.id);
      payload.bundleItems = remapped.items;

      if (existingId) {
        idMap.set(String(src._id), existingId);
        if (onConflict === 'update') {
          await TargetService.updateOne({ _id: existingId }, { $set: payload });
          summary.updated += 1;
        } else {
          summary.skipped += 1;
        }
        continue;
      }

      const created = await TargetService.create(payload);
      const newId = String(created._id);
      idMap.set(String(src._id), newId);
      targetByKey.set(key, newId);
      summary.created += 1;
    }
  }

  if (includeOverrides) {
    const Business = getBusinessModel(mainConnection);
    const [sourceBiz, targetBiz] = await Promise.all([
      Business.findOne({ _id: sourceBranch.id, owner: ownerId }).select('settings.serviceOverrides'),
      Business.findOne({ _id: targetBranch.id, owner: ownerId }),
    ]);

    if (!sourceBiz) throw new Error('Source branch not found');
    if (!targetBiz) throw new Error('Destination branch not found');

    const sourceOverrides = sourceBiz.settings?.serviceOverrides || {};
    targetBiz.settings = targetBiz.settings || {};
    const merged = mergeServiceOverrides(targetBiz.settings.serviceOverrides, sourceOverrides);
    targetBiz.settings.serviceOverrides = merged;
    targetBiz.markModified('settings.serviceOverrides');
    targetBiz.updatedAt = new Date();
    await targetBiz.save();
    summary.overridesCopied = Object.keys(sourceOverrides).length;
  }

  return summary;
}

module.exports = {
  copyBranchServices,
  serviceDocToPayload,
  buildTargetKeyMap,
  remapBundleItems,
  mergeServiceOverrides,
  SERVICE_SCALAR_FIELDS,
};
