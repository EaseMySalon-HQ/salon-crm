/**
 * Weekly GMB insights sync + health snapshots + ad trigger detection.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const gmbService = require('../services/google-business-service');
const { computeComponentsForBranch } = require('../lib/gmb-health-score');
const { logger } = require('../utils/logger');

async function runGmbInsightsSync() {
  const main = await databaseManager.getMainConnection();
  const GmbAccount = main.model('GmbAccount', require('../models/GmbAccount').schema);
  const Business = main.model('Business', require('../models/Business').schema);

  const accounts = await GmbAccount.find({ status: 'connected' });
  let synced = 0;

  for (const account of accounts) {
    try {
      const business = await Business.findById(account.businessId).lean();
      if (!business) continue;

      const dbName = business.dbName || business.databaseName;
      const conn = await databaseManager.getConnection(business._id, dbName);
      const models = modelFactory.getCachedBusinessModels(conn);
      const { GmbHealthSnapshot, GmbAdTrigger } = models;

      const end = new Date();
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      const insights = await gmbService.fetchInsights(account, start.toISOString(), end.toISOString());

      const health = await computeComponentsForBranch(models, account, {});
      await GmbHealthSnapshot.create({
        locationId: account.locationId,
        score: health.score,
        components: health.components,
        snapshotDate: new Date(),
      });

      const prev = await GmbHealthSnapshot.findOne({
        locationId: account.locationId,
        snapshotDate: { $lt: start },
      })
        .sort({ snapshotDate: -1 })
        .lean();

      if (prev && prev.score > 0) {
        const dropPct = ((prev.score - health.score) / prev.score) * 100;
        if (dropPct > 20) {
          await GmbAdTrigger.create({
            signalType: 'profile_views_drop',
            signalData: { previousScore: prev.score, currentScore: health.score, insights },
            suggestion: `Your GMB health score dropped ${Math.round(dropPct)}% — consider posting an offer or refreshing photos.`,
            suggestedBudgetInr: 500,
            suggestedChannel: 'google_ads',
          });
        }
      }

      synced += 1;
    } catch (err) {
      logger.error('[gmb-insights-sync] account failed:', account._id, err?.message);
    }
  }

  return { synced };
}

function start() {
  return runGmbInsightsSync;
}

module.exports = { runGmbInsightsSync, start };
