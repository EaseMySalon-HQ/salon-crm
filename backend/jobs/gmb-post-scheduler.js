/**
 * Auto-schedule and publish GMB posts.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const gmbService = require('../services/google-business-service');
const { logger } = require('../utils/logger');

const FESTIVALS = [
  { month: 10, day: 20, name: 'Diwali' },
  { month: 3, day: 8, name: 'Holi' },
  { month: 1, day: 26, name: 'Republic Day' },
];

function shouldPostToday(frequency) {
  const dow = new Date().getDay();
  if (frequency === 'daily') return true;
  if (frequency === '3x') return [1, 3, 5].includes(dow);
  if (frequency === 'weekly') return dow === 1;
  return false;
}

async function runGmbPostScheduler() {
  const main = await databaseManager.getMainConnection();
  const GmbAccount = main.model('GmbAccount', require('../models/GmbAccount').schema);
  const Business = main.model('Business', require('../models/Business').schema);

  const accounts = await GmbAccount.find({
    status: 'connected',
    postingEnabled: true,
    postFrequency: { $ne: 'off' },
  });

  let published = 0;

  for (const account of accounts) {
    try {
      const business = await Business.findById(account.businessId).lean();
      if (!business?.plan?.addons?.googleBusiness?.enabled) continue;
      if (!shouldPostToday(account.postFrequency)) continue;

      const dbName = business.dbName || business.databaseName;
      const conn = await databaseManager.getConnection(business._id, dbName);
      const models = modelFactory.getCachedBusinessModels(conn);
      const { GmbPost, BusinessSettings } = models;
      const settings = await BusinessSettings.findOne().lean();

      const now = new Date();
      const festival = FESTIVALS.find((f) => f.month === now.getMonth() + 1 && Math.abs(f.day - now.getDate()) <= 3);
      let triggerType = 'weekly';
      let topic = 'Start your week with a fresh look! Book now.';
      if (festival && account.postTopics?.includes('festivals')) {
        triggerType = 'festival';
        topic = `${festival.name} Special — visit ${settings?.businessName || 'us'} for exclusive offers!`;
      }

      const post = await GmbPost.create({
        locationId: account.locationId,
        triggerType,
        topic,
        draftText: topic,
        status: account.postMode === 'auto' ? 'scheduled' : 'draft',
        scheduledAt: new Date(),
      });

      if (account.postMode === 'auto') {
        const result = await gmbService.publishLocalPost(account, {
          summary: post.draftText,
          ctaType: 'BOOK',
        });
        post.status = 'published';
        post.publishedAt = new Date();
        post.googlePostId = result.name || null;
        await post.save();
        published += 1;
      }
    } catch (err) {
      logger.error('[gmb-post-scheduler] account failed:', account._id, err?.message);
    }
  }

  return { published };
}

function start() {
  return runGmbPostScheduler;
}

module.exports = { runGmbPostScheduler, start };
