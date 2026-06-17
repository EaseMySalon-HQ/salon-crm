/**
 * Process scheduled AI auto-replies for GMB reviews.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const gmbService = require('../services/google-business-service');
const { generateReply } = require('../lib/gmb-reply-ai');
const { logger } = require('../utils/logger');

async function processAutoReplies() {
  const main = await databaseManager.getMainConnection();
  const GmbAccount = main.model('GmbAccount', require('../models/GmbAccount').schema);
  const Business = main.model('Business', require('../models/Business').schema);

  const accounts = await GmbAccount.find({
    status: 'connected',
    autoReplyEnabled: true,
  });

  let processed = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      const business = await Business.findById(account.businessId).lean();
      if (!business) continue;

      const dbName = business.dbName || business.databaseName;
      const conn = await databaseManager.getConnection(business._id, dbName);
      const models = modelFactory.getCachedBusinessModels(conn);
      const { GmbReview, BusinessSettings, GmbSyncLog } = models;

      const pending = await GmbReview.find({
        locationId: account.locationId,
        replyText: null,
        autoReplyProcessed: { $ne: true },
        $or: [
          { autoReplyScheduledAt: { $lte: new Date() } },
          { autoReplyScheduledAt: null, createTime: { $lte: new Date(Date.now() - account.autoReplyDelay * 60_000) } },
        ],
      }).limit(20);

      const settings = await BusinessSettings.findOne().lean();

      for (const review of pending) {
        if (review.replyText) {
          review.autoReplyProcessed = true;
          await review.save();
          continue;
        }

        const isNegative = review.starRating <= 2;
        const forceDraft = isNegative || account.autoReplyMode === 'draft' ||
          (account.draftModeUntil && new Date(account.draftModeUntil) > new Date());

        try {
          const draft = await generateReply({
            salonName: settings?.businessName || 'Our salon',
            city: settings?.city || '',
            reviewerName: review.reviewerName,
            starRating: review.starRating,
            reviewText: review.comment,
            tone: account.replyTone,
            language: account.replyLanguage,
          });

          if (forceDraft) {
            review.aiDraftText = draft;
            review.autoReplyProcessed = true;
            await review.save();
            continue;
          }

          await gmbService.postReviewReply(account, review.reviewId, draft);
          review.replyText = draft;
          review.replySource = 'ai_auto';
          review.repliedAt = new Date();
          review.autoReplyProcessed = true;
          await review.save();

          await GmbSyncLog.create({
            locationId: account.locationId,
            operation: 'auto_reply',
            status: 'success',
            message: `Auto-replied to ${review.reviewId}`,
          });
          processed += 1;
        } catch (err) {
          failed += 1;
          logger.warn('[gmb-auto-reply] review failed:', review.reviewId, err?.message);
          review.autoReplyScheduledAt = new Date(Date.now() + 30 * 60_000);
          await review.save();
        }
      }
    } catch (err) {
      logger.error('[gmb-auto-reply] account failed:', account._id, err?.message);
    }
  }

  if (failed > 0 && accounts.length > 0) {
    const failRate = failed / Math.max(1, processed + failed);
    if (failRate > 0.1) {
      logger.warn(`[gmb-auto-reply] high failure rate: ${Math.round(failRate * 100)}%`);
    }
  }

  return { processed, failed };
}

function start() {
  return processAutoReplies;
}

module.exports = { processAutoReplies, start };
