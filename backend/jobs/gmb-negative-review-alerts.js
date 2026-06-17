/**
 * WhatsApp alerts for new negative GMB reviews.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { sendGmbNegativeReviewAlert } = require('../lib/send-gmb-whatsapp');
const { logger } = require('../utils/logger');

async function runNegativeReviewAlerts() {
  const main = await databaseManager.getMainConnection();
  const GmbAccount = main.model('GmbAccount', require('../models/GmbAccount').schema);
  const Business = main.model('Business', require('../models/Business').schema);

  const accounts = await GmbAccount.find({
    status: 'connected',
    negativeAlertEnabled: true,
  });

  let sent = 0;

  for (const account of accounts) {
    try {
      const business = await Business.findById(account.businessId).lean();
      if (!business) continue;

      const dbName = business.dbName || business.databaseName;
      const conn = await databaseManager.getConnection(business._id, dbName);
      const models = modelFactory.getCachedBusinessModels(conn);
      const { GmbReview } = models;

      const threshold = account.negativeAlertThreshold || 2;
      const reviews = await GmbReview.find({
        locationId: account.locationId,
        starRating: { $lte: threshold },
        alertSent: { $ne: true },
        replyText: null,
      }).limit(10);

      for (const review of reviews) {
        const ok = await sendGmbNegativeReviewAlert({
          business,
          account,
          review,
          models,
        });
        if (ok) {
          review.alertSent = true;
          await review.save();
          sent += 1;
        }
      }

      const escalationHours = account.negativeAlertEscalationHours || 4;
      if (escalationHours > 0) {
        const cutoff = new Date(Date.now() - escalationHours * 60 * 60 * 1000);
        const stale = await GmbReview.find({
          locationId: account.locationId,
          starRating: { $lte: threshold },
          alertSent: true,
          alertEscalatedAt: null,
          replyText: null,
          createTime: { $lte: cutoff },
        }).limit(5);

        for (const review of stale) {
          await sendGmbNegativeReviewAlert({
            business,
            account,
            review,
            models,
            escalation: true,
          });
          review.alertEscalatedAt = new Date();
          await review.save();
        }
      }
    } catch (err) {
      logger.error('[gmb-negative-alerts] account failed:', account._id, err?.message);
    }
  }

  return { sent };
}

function start() {
  return runNegativeReviewAlerts;
}

module.exports = { runNegativeReviewAlerts, start };
