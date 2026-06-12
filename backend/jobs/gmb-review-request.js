/**
 * Send WhatsApp GMB review requests after completed appointments.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { sendGmbReviewRequest } = require('../lib/send-gmb-whatsapp');
const { logger } = require('../utils/logger');

async function runGmbReviewRequests() {
  const main = await databaseManager.getMainConnection();
  const GmbAccount = main.model('GmbAccount', require('../models/GmbAccount').schema);
  const Business = main.model('Business', require('../models/Business').schema);

  const accounts = await GmbAccount.find({
    status: 'connected',
    reviewRequestEnabled: true,
  });

  let sent = 0;

  for (const account of accounts) {
    try {
      const business = await Business.findById(account.businessId).lean();
      if (!business) continue;

      const addonEnabled = Boolean(business.plan?.addons?.googleBusiness?.enabled);
      if (!addonEnabled) continue;

      const dbName = business.dbName || business.databaseName;
      const conn = await databaseManager.getConnection(business._id, dbName);
      const models = modelFactory.getCachedBusinessModels(conn);
      const { Appointment, GmbReviewRequestLog } = models;

      const delayMs = (account.reviewRequestDelayMinutes || 120) * 60_000;
      const cutoff = new Date(Date.now() - delayMs);
      const cooldownDays = account.reviewRequestCooldownDays || 90;
      const cooldownStart = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);

      const appointments = await Appointment.find({
        status: 'completed',
        updatedAt: { $lte: cutoff },
        gmbReviewRequestSent: { $ne: true },
      })
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean();

      for (const appt of appointments) {
        const recentRequest = await GmbReviewRequestLog.findOne({
          clientId: appt.clientId,
          sentAt: { $gte: cooldownStart },
        }).lean();
        if (recentRequest) {
          await Appointment.updateOne({ _id: appt._id }, { $set: { gmbReviewRequestSent: true } });
          continue;
        }

        const ok = await sendGmbReviewRequest({ business, account, appointment: appt, models });
        if (ok) {
          await Appointment.updateOne({ _id: appt._id }, { $set: { gmbReviewRequestSent: true } });
          sent += 1;
        }
      }
    } catch (err) {
      logger.error('[gmb-review-request] account failed:', account._id, err?.message);
    }
  }

  return { sent };
}

function start() {
  return runGmbReviewRequests;
}

module.exports = { runGmbReviewRequests, start };
