'use strict';

const { getBullConnection } = require('./redis');
const { logger } = require('../utils/logger');

const QUEUE_NAME = 'legacy-msg91-campaigns';
let legacyQueue = null;
let legacyWorker = null;

function isQueueEnabled() {
  return Boolean(getBullConnection());
}

function getLegacyCampaignQueue() {
  if (legacyQueue) return legacyQueue;
  const connection = getBullConnection();
  if (!connection) return null;
  const { Queue } = require('bullmq');
  legacyQueue = new Queue(QUEUE_NAME, { connection });
  return legacyQueue;
}

async function enqueueLegacyCampaignRun({ campaignId, businessId }) {
  const queue = getLegacyCampaignQueue();
  if (!queue) return false;
  try {
    await queue.add(
      'run-legacy-campaign',
      {
        campaignId: String(campaignId),
        businessId: String(businessId),
      },
      {
        jobId: `legacy-campaign-${campaignId}`,
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 1,
      }
    );
    return true;
  } catch (err) {
    logger.error('[legacy-campaign-queue] enqueue failed: %s', err.message);
    return false;
  }
}

function startLegacyCampaignWorker() {
  if (legacyWorker) return legacyWorker;
  const connection = getBullConnection();
  if (!connection) return null;

  const { Worker } = require('bullmq');
  const { executeQueuedLegacyCampaign } = require('./legacy-campaign-runner');

  legacyWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await executeQueuedLegacyCampaign(job.data);
    },
    {
      connection,
      concurrency: parseInt(process.env.LEGACY_CAMPAIGN_WORKER_CONCURRENCY, 10) || 1,
      limiter: {
        max: parseInt(process.env.LEGACY_CAMPAIGN_RATE_MAX, 10) || 20,
        duration: 1000,
      },
    }
  );

  legacyWorker.on('failed', (job, err) => {
    logger.error('[legacy-campaign-queue] job %s failed: %s', job?.id, err?.message || err);
  });

  legacyWorker.on('completed', (job) => {
    logger.info('[legacy-campaign-queue] job %s completed', job.id);
  });

  logger.info(
    '[legacy-campaign-queue] worker started (concurrency %s)',
    legacyWorker.opts.concurrency
  );
  return legacyWorker;
}

async function closeLegacyCampaignQueue() {
  try {
    if (legacyWorker) await legacyWorker.close();
  } catch (_) {}
  try {
    if (legacyQueue) await legacyQueue.close();
  } catch (_) {}
  legacyWorker = null;
  legacyQueue = null;
}

module.exports = {
  isQueueEnabled,
  getLegacyCampaignQueue,
  enqueueLegacyCampaignRun,
  startLegacyCampaignWorker,
  closeLegacyCampaignQueue,
};
