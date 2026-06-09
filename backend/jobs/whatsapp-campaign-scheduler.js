/**
 * WhatsApp campaign scheduler.
 *
 * Polls every minute for campaigns whose `status === 'scheduled'` and
 * `scheduledAt <= now`, then triggers the same gates + runner that the
 * manual /:id/send route uses. Campaigns that fail their pre-flight gates
 * (WABA disconnected, template not approved, etc.) are flipped to
 * `failed` with a reason captured in the audit log so the operator can
 * see why their schedule didn't fire.
 *
 * Set WHATSAPP_CAMPAIGN_SCHEDULER_DISABLED=1 to skip running on boot
 * (useful in tests / replicas).
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');

const POLL_INTERVAL_MS = parseInt(process.env.WHATSAPP_CAMPAIGN_POLL_MS, 10) || 60 * 1000;

let intervalHandle = null;
let runningPromise = null;

async function getMainModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Campaign: main.model('WhatsAppCampaign', require('../models/WhatsAppCampaign').schema),
  };
}

/**
 * Process one poll tick. Picks all scheduled campaigns whose `scheduledAt`
 * has passed, atomically flips them to `queued`, then dispatches each one
 * to the campaign runner. We do NOT call the HTTP route to avoid auth /
 * tenant-db middleware coupling — instead we replay the same gate logic
 * inline.
 */
async function tick() {
  if (runningPromise) return runningPromise;
  runningPromise = (async () => {
    const { Campaign } = await getMainModels();
    const now = new Date();

    /**
     * Single-pass claim: atomically set status=queued for all due campaigns
     * so concurrent ticks (e.g. multi-instance backends) don't double-fire.
     */
    const due = await Campaign.find({ status: 'scheduled', scheduledAt: { $lte: now } })
      .select('_id businessId name')
      .lean();
    if (due.length === 0) return;

    logger.info(`[whatsapp-campaign-scheduler] picking up ${due.length} due campaign(s)`);

    for (const c of due) {
      const claimed = await Campaign.findOneAndUpdate(
        { _id: c._id, status: 'scheduled' },
        { $set: { status: 'queued' } },
        { new: true }
      );
      if (!claimed) continue; // someone else got it
      runScheduledCampaign(claimed).catch((err) =>
        logger.error(
          `[whatsapp-campaign-scheduler] runScheduledCampaign failed for ${c._id}:`,
          err?.message || err
        )
      );
    }
  })().finally(() => {
    runningPromise = null;
  });
  return runningPromise;
}

async function runScheduledCampaign(claimedCampaign) {
  // Lazy require to avoid a circular dep with routes/whatsapp-campaigns.js
  const {
    runCampaignFromScheduler,
  } = require('../routes/whatsapp-campaigns');
  await runCampaignFromScheduler({ campaignId: claimedCampaign._id });
}

function start({ intervalMs = POLL_INTERVAL_MS } = {}) {
  if (process.env.WHATSAPP_CAMPAIGN_SCHEDULER_DISABLED === '1') {
    logger.info('[whatsapp-campaign-scheduler] disabled via env');
    return null;
  }
  if (intervalHandle) return intervalHandle;
  // Run once 30s after boot so any near-due campaigns aren't delayed by a
  // full poll interval, then keep the heartbeat going.
  setTimeout(() => {
    tick().catch((err) => logger.error('[whatsapp-campaign-scheduler] initial tick failed:', err));
  }, 30 * 1000);
  intervalHandle = setInterval(() => {
    tick().catch((err) => logger.error('[whatsapp-campaign-scheduler] tick failed:', err));
  }, intervalMs);
  logger.info(`[whatsapp-campaign-scheduler] started (every ${Math.round(intervalMs / 1000)}s)`);
  return intervalHandle;
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { start, stop, tick };
