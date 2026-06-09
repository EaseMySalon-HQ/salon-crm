'use strict';

const { getBullConnection } = require('./redis');
const { logger } = require('../utils/logger');

const QUEUE_NAME = 'whatsapp-campaigns';
let campaignQueue = null;
let campaignWorker = null;

function isQueueEnabled() {
  return Boolean(getBullConnection());
}

function getCampaignQueue() {
  if (campaignQueue) return campaignQueue;
  const connection = getBullConnection();
  if (!connection) return null;
  const { Queue } = require('bullmq');
  campaignQueue = new Queue(QUEUE_NAME, { connection });
  return campaignQueue;
}

async function enqueueCampaignRun({ campaignId, actorId }) {
  const queue = getCampaignQueue();
  if (!queue) return false;
  try {
    await queue.add(
      'run-campaign',
      {
        campaignId: String(campaignId),
        actorId: actorId ? String(actorId) : null,
      },
      {
        jobId: `campaign-run-${campaignId}`,
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 1,
      }
    );
    return true;
  } catch (err) {
    logger.error('[whatsapp-campaign-queue] enqueue failed: %s', err.message);
    return false;
  }
}

function startCampaignWorker() {
  if (campaignWorker) return campaignWorker;
  const connection = getBullConnection();
  if (!connection) return null;

  const { Worker } = require('bullmq');
  const { executeQueuedCampaign } = require('./whatsapp-campaign-runner');

  campaignWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await executeQueuedCampaign(job.data);
    },
    {
      connection,
      concurrency: parseInt(process.env.WHATSAPP_CAMPAIGN_WORKER_CONCURRENCY, 10) || 2,
      limiter: {
        max: parseInt(process.env.WHATSAPP_CAMPAIGN_RATE_MAX, 10) || 30,
        duration: 1000,
      },
    }
  );

  campaignWorker.on('failed', (job, err) => {
    logger.error('[whatsapp-campaign-queue] job %s failed: %s', job?.id, err?.message || err);
  });

  campaignWorker.on('completed', (job) => {
    logger.info('[whatsapp-campaign-queue] job %s completed', job.id);
  });

  logger.info('[whatsapp-campaign-queue] worker started (concurrency %s)', campaignWorker.opts.concurrency);
  return campaignWorker;
}

async function closeCampaignQueue() {
  try {
    if (campaignWorker) await campaignWorker.close();
  } catch (_) {}
  try {
    if (campaignQueue) await campaignQueue.close();
  } catch (_) {}
  campaignWorker = null;
  campaignQueue = null;
}

module.exports = {
  isQueueEnabled,
  getCampaignQueue,
  enqueueCampaignRun,
  startCampaignWorker,
  closeCampaignQueue,
};
