#!/usr/bin/env node
/**
 * BullMQ worker for Meta WhatsApp marketing campaigns.
 * Run as a separate process in production:
 *   node workers/whatsapp-campaign-worker.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { startCampaignWorker } = require('../lib/whatsapp-campaign-queue');
const { logger } = require('../utils/logger');

const worker = startCampaignWorker();
if (!worker) {
  logger.error('[whatsapp-campaign-worker] REDIS_URL is required');
  process.exit(1);
}

async function shutdown(signal) {
  logger.info('[whatsapp-campaign-worker] %s — closing', signal);
  try {
    await worker.close();
  } catch (_) {}
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
