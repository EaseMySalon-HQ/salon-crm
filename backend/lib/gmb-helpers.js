/**
 * Shared GMB route helpers.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { resolveTenantBusinessObjectId } = require('../lib/tenant-business-id');

async function getMainModels() {
  const main = await databaseManager.getMainConnection();
  return {
    main,
    GmbAccount: main.model('GmbAccount', require('../models/GmbAccount').schema),
    Business: main.model('Business', require('../models/Business').schema),
  };
}

async function resolveBusinessContext(req) {
  const branchId = req.user?.branchId;
  if (!branchId) return { error: 'Business context missing' };

  const { main, GmbAccount, Business } = await getMainModels();
  const resolved = await resolveTenantBusinessObjectId(branchId, main);
  if (resolved.error || !resolved.businessObjectId) {
    return { error: resolved.error || 'Invalid business id' };
  }

  const businessModels = req.businessModels;
  const account = await GmbAccount.findOne({
    businessId: resolved.businessObjectId,
    branchId: branchId,
  });

  return {
    branchId,
    businessObjectId: resolved.businessObjectId,
    main,
    GmbAccount,
    Business,
    account,
    businessModels,
  };
}

function publicAccountView(account, locations = []) {
  if (!account || account.status === 'disconnected') {
    return {
      status: 'disconnected',
      connected: false,
      locationCount: 0,
      locations: [],
    };
  }
  return {
    status: account.status,
    connected: account.status === 'connected',
    accountId: account.accountId,
    accountName: account.accountName,
    locationId: account.locationId,
    locationName: account.locationName,
    locationCount: account.locationCount || locations.length,
    locations,
    connectedAt: account.connectedAt,
    lastSyncAt: account.lastSyncAt,
    autoReplyEnabled: account.autoReplyEnabled,
    autoReplyMode: account.autoReplyMode,
    autoReplyDelay: account.autoReplyDelay,
    replyTone: account.replyTone,
    replyLanguage: account.replyLanguage,
    reviewRequestEnabled: account.reviewRequestEnabled,
    reviewRequestDelayMinutes: account.reviewRequestDelayMinutes,
    reviewRequestCooldownDays: account.reviewRequestCooldownDays,
    negativeAlertEnabled: account.negativeAlertEnabled,
    negativeAlertThreshold: account.negativeAlertThreshold,
    postingEnabled: account.postingEnabled,
    postFrequency: account.postFrequency,
    postMode: account.postMode,
    servicesSyncEnabled: account.servicesSyncEnabled,
    hoursSyncEnabled: account.hoursSyncEnabled,
    lastErrorMessage: account.lastErrorMessage,
  };
}

async function logSync(businessModels, entry) {
  if (!businessModels?.GmbSyncLog) return;
  try {
    await businessModels.GmbSyncLog.create(entry);
  } catch {
    /* non-fatal */
  }
}

module.exports = {
  getMainModels,
  resolveBusinessContext,
  publicAccountView,
  logSync,
};
