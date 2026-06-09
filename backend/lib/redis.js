/**
 * Shared Redis client for API caching and BullMQ (optional).
 * Fail-open: callers must handle null client when REDIS_URL is unset.
 */

const { logger } = require('../utils/logger');

let client = null;
let initAttempted = false;

function redisUrl() {
  return process.env.REDIS_URL || process.env.RATE_LIMIT_REDIS_URL || null;
}

/** Shared ioredis options (TLS for Railway rediss://, queue until connected). */
function buildIoredisOptions(url, overrides = {}) {
  const opts = {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    connectTimeout: 5000,
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS, 10) || 4000,
    retryStrategy(times) {
      if (times > 8) return null;
      return Math.min(times * 200, 3000);
    },
    ...overrides,
  };
  if (url) {
    try {
      if (new URL(url).protocol === 'rediss:') {
        opts.tls = {};
      }
    } catch (_) {}
  }
  return opts;
}

function getRedisClient() {
  if (client) return client;
  if (initAttempted) return null;
  initAttempted = true;

  const url = redisUrl();
  if (!url) {
    logger.warn('[redis] REDIS_URL not set — API cache and BullMQ disabled for this process');
    return null;
  }

  try {
    const Redis = require('ioredis');
    client = new Redis(url, buildIoredisOptions(url));
    client.on('error', (err) => {
      logger.warn('[redis] connection error: %s', err.message);
    });
    client.on('connect', () => {
      logger.info('[redis] connected (shared cache/queue client)');
    });
    return client;
  } catch (err) {
    logger.error('[redis] failed to create client: %s', err.message);
    client = null;
    return null;
  }
}

/** BullMQ connection options (host/port from URL or env). */
function getBullConnection() {
  const url = redisUrl();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
      password: parsed.password || process.env.REDIS_PASSWORD || undefined,
      username: parsed.username || undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  } catch {
    return {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    };
  }
}

async function pingRedis() {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

async function closeRedis() {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    try {
      client.disconnect();
    } catch (_) {}
  }
  client = null;
  initAttempted = false;
}

module.exports = {
  getRedisClient,
  getBullConnection,
  pingRedis,
  closeRedis,
  redisUrl,
  buildIoredisOptions,
};
