#!/usr/bin/env node
/**
 * BullMQ worker for legacy MSG91 marketing campaigns.
 * Run as a separate process in production:
 *   npm run worker:legacy-campaigns
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { startLegacyCampaignWorker } = require('../lib/legacy-campaign-queue');
const { logger } = require('../utils/logger');

const worker = startLegacyCampaignWorker();
if (!worker) {
  logger.error('[legacy-campaign-worker] REDIS_URL is required');
  process.exit(1);
}

async function shutdown(signal) {
  logger.info('[legacy-campaign-worker] %s — closing', signal);
  try {
    await worker.close();
  } catch (_) {}
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
