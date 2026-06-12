/**
 * Poll Google reviews every 30 minutes for connected tenants.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const gmbService = require('../services/google-business-service');
const { logger } = require('../utils/logger');

const BATCH_SIZE = Number(process.env.GMB_SYNC_BATCH_SIZE) || 50;

async function syncReviewsForAccount(account, business) {
  if (!account.locationId || account.status !== 'connected') return { synced: 0 };

  const dbName = business.dbName || business.databaseName;
  if (!dbName) return { synced: 0 };

  const conn = await databaseManager.getConnection(business._id, dbName);
  const models = modelFactory.getCachedBusinessModels(conn);
  const { GmbReview, GmbSyncLog } = models;

  const remoteReviews = await gmbService.fetchReviews(account);
  let synced = 0;

  for (const r of remoteReviews) {
    if (!r.reviewId) continue;
    const existing = await GmbReview.findOne({ reviewId: r.reviewId });
    if (existing) {
      existing.comment = r.comment;
      existing.starRating = r.starRating;
      if (r.replyText) {
        existing.replyText = r.replyText;
        existing.repliedAt = r.repliedAt;
      }
      await existing.save();
    } else {
      const delayMin = account.autoReplyDelay || 60;
      await GmbReview.create({
        locationId: account.locationId,
        reviewId: r.reviewId,
        reviewerName: r.reviewerName,
        starRating: r.starRating,
        comment: r.comment,
        createTime: r.createTime,
        replyText: r.replyText,
        repliedAt: r.repliedAt,
        googleUpdateTime: r.updateTime,
        autoReplyScheduledAt: account.autoReplyEnabled
          ? new Date(Date.now() + delayMin * 60_000)
          : null,
      });
      synced += 1;
    }
  }

  account.lastSyncAt = new Date();
  await account.save();

  await GmbSyncLog.create({
    locationId: account.locationId,
    operation: 'review_sync',
    status: 'success',
    message: `Synced ${remoteReviews.length} reviews (${synced} new)`,
  });

  return { synced, total: remoteReviews.length };
}

async function runGmbReviewSync() {
  const main = await databaseManager.getMainConnection();
  const GmbAccount = main.model('GmbAccount', require('../models/GmbAccount').schema);
  const Business = main.model('Business', require('../models/Business').schema);

  const accounts = await GmbAccount.find({ status: 'connected' }).limit(BATCH_SIZE);
  let processed = 0;
  let errors = 0;

  for (const account of accounts) {
    try {
      const business = await Business.findById(account.businessId).lean();
      if (!business || business.status === 'inactive') continue;
      await syncReviewsForAccount(account, business);
      processed += 1;
    } catch (err) {
      errors += 1;
      logger.error('[gmb-review-sync] account failed:', account._id, err?.message || err);
      account.lastErrorMessage = err?.message || 'Sync failed';
      await account.save().catch(() => {});
    }
  }

  logger.info(`[gmb-review-sync] done: ${processed} accounts, ${errors} errors`);
  return { processed, errors };
}

function start() {
  return runGmbReviewSync;
}

module.exports = { runGmbReviewSync, start };
