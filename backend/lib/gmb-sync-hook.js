/**
 * Fire-and-forget GMB sync when tenant catalog or hours change.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const gmbService = require('../services/google-business-service');
const { resolveTenantBusinessObjectId } = require('../lib/tenant-business-id');
const { logger } = require('../utils/logger');

async function syncServicesIfEnabled(businessId, businessModels) {
  try {
    const main = await databaseManager.getMainConnection();
    const resolved = await resolveTenantBusinessObjectId(businessId, main);
    if (!resolved.businessObjectId) return;

    const GmbAccount = main.model('GmbAccount', require('../models/GmbAccount').schema);
    const account = await GmbAccount.findOne({
      businessId: resolved.businessObjectId,
      branchId: businessId,
      status: 'connected',
      servicesSyncEnabled: true,
    });
    if (!account?.locationId) return;

    const { Service } = businessModels;
    const services = await Service.find().lean();
    await gmbService.syncServicesToGmb(account, services);

    if (businessModels.GmbSyncLog) {
      await businessModels.GmbSyncLog.create({
        locationId: account.locationId,
        operation: 'services_sync',
        status: 'success',
        message: `Auto-synced ${services.length} services`,
      });
    }
  } catch (err) {
    logger.warn('[gmb-sync-hook] services sync failed:', err?.message || err);
  }
}

async function syncHoursIfEnabled(businessId, businessModels, regularHours) {
  try {
    const main = await databaseManager.getMainConnection();
    const resolved = await resolveTenantBusinessObjectId(businessId, main);
    if (!resolved.businessObjectId) return;

    const GmbAccount = main.model('GmbAccount', require('../models/GmbAccount').schema);
    const account = await GmbAccount.findOne({
      businessId: resolved.businessObjectId,
      branchId: businessId,
      status: 'connected',
      hoursSyncEnabled: true,
    });
    if (!account?.locationId || !regularHours) return;

    await gmbService.syncHoursToGmb(account, regularHours);
  } catch (err) {
    logger.warn('[gmb-sync-hook] hours sync failed:', err?.message || err);
  }
}

module.exports = { syncServicesIfEnabled, syncHoursIfEnabled };
