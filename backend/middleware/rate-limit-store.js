/**
 * Rate limit store: prefer Redis (horizontal scaling); circuit breaker + memory fallback on errors.
 * Never throws from the store interface — failures degrade to MemoryStore per request or until cooldown.
 */

const { MemoryStore } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { logger } = require('../utils/logger');
const metrics = require('./rate-limit-metrics');
const { emitRateLimitAlert } = require('./rate-limit-alerts');

function commandTimeoutMs() {
  const v = process.env.RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS;
  if (v === undefined || v === '') return 4000;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 4000;
}

function circuitFailureThreshold() {
  const v = process.env.RATE_LIMIT_REDIS_CIRCUIT_FAILURE_THRESHOLD;
  if (v === undefined || v === '') return 5;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function circuitCooldownMs() {
  const v = process.env.RATE_LIMIT_REDIS_CIRCUIT_COOLDOWN_MS;
  if (v === undefined || v === '') return 60000;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 60000;
}

/**
 * Wrap MemoryStore to count evaluations per tier when Redis is not configured (same behavior, metrics only).
 */
class MetricsMemoryStore {
  constructor(inner, metricsTier) {
    this.inner = inner;
    this.metricsTier = metricsTier;
  }

  init(options) {
    return this.inner.init(options);
  }

  increment(key) {
    metrics.incrEvaluations(this.metricsTier);
    return this.inner.increment(key);
  }

  decrement(key) {
    return this.inner.decrement(key);
  }

  get(key) {
    return this.inner.get(key);
  }

  resetKey(key) {
    return this.inner.resetKey(key);
  }

  resetAll() {
    return this.inner.resetAll();
  }

  shutdown() {
    return this.inner.shutdown?.();
  }
}

/**
 * @param {string} prefix Redis key prefix segment (e.g. global, auth, export, ai)
 * @param {string} label Log label for this tier
 */
function createRateLimitStore(prefix, label) {
  const memoryStore = new MemoryStore();
  const metricsTier = metrics.normalizeTier(label);
  const url = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL;

  if (!url) {
    logger.warn('[rate-limit][%s] no REDIS_URL / RATE_LIMIT_REDIS_URL — using in-memory store (not shared across instances)', label);
    return new MetricsMemoryStore(memoryStore, metricsTier);
  }

  let client;
  try {
    const Redis = require('ioredis');
    const cmdMs = commandTimeoutMs();
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      commandTimeout: cmdMs,
      retryStrategy(times) {
        if (times > 8) return null;
        return Math.min(times * 200, 3000);
      },
    });
    client.on('error', (err) => {
      logger.warn('[rate-limit][%s] redis connection error: %s', label, err.message);
    });
  } catch (e) {
    logger.error('[rate-limit][%s] failed to create Redis client; using memory store: %s', label, e.message);
    return new MetricsMemoryStore(memoryStore, metricsTier);
  }

  let redisStore;
  try {
    redisStore = new RedisStore({
      sendCommand: (command, ...args) => client.call(command, ...args),
      prefix: `rl:${prefix}:`,
    });
  } catch (e) {
    logger.error('[rate-limit][%s] RedisStore init failed; using memory: %s', label, e.message);
    try {
      client.disconnect();
    } catch (_) {}
    return new MetricsMemoryStore(memoryStore, metricsTier);
  }

  logger.info('[rate-limit][%s] using Redis-backed store (prefix rl:%s:)', label, prefix);

  return new FallbackStore(memoryStore, redisStore, client, label, metricsTier);
}

/**
 * Circuit: closed → (failures ≥ threshold) → open → (after cooldown) half_open → success → closed | failure → open
 * memoryPermanent: init failed — Redis disabled for process lifetime.
 */
class FallbackStore {
  constructor(memoryStore, redisStore, redisClient, label, metricsTier) {
    this.memory = memoryStore;
    this.redis = redisStore;
    this.client = redisClient;
    this.label = label;
    this.metricsTier = metricsTier;
    /** @type {'closed' | 'open' | 'half_open'} */
    this.circuit = 'closed';
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
    this.memoryPermanent = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
    try {
      this.redis?.init?.(options);
    } catch (e) {
      logger.error('[rate-limit][%s] redis init(options) failed; permanent memory fallback: %s', this.label, e.message);
      this.disableRedisPermanently();
    }
  }

  disableRedisPermanently() {
    if (this.memoryPermanent) return;
    this.memoryPermanent = true;
    this.circuit = 'closed';
    try {
      this.client?.disconnect();
    } catch (_) {}
    this.client = null;
    this.redis = null;
    logger.error('[rate-limit][%s] Redis disabled — using in-memory store only for this process', this.label);
  }

  /**
   * Health for /health: redis path usable and circuit not forcing memory.
   */
  getRateLimitHealth() {
    if (this.memoryPermanent || !this.client) {
      return { backend: 'memory', redis: 'degraded', circuit: 'disabled' };
    }
    const now = Date.now();
    if (this.circuit === 'open' && now < this.circuitOpenUntil) {
      return { backend: 'memory', redis: 'degraded', circuit: 'open' };
    }
    if (this.circuit === 'half_open') {
      return { backend: 'redis', redis: 'degraded', circuit: 'half_open' };
    }
    return { backend: 'redis', redis: 'connected', circuit: 'closed' };
  }

  async _run(name, fnMem, fnRedis) {
    if (this.memoryPermanent || !this.redis || !this.client) {
      metrics.incrEvaluations(this.metricsTier);
      return fnMem();
    }

    const now = Date.now();
    const threshold = circuitFailureThreshold();
    const cooldown = circuitCooldownMs();

    if (this.circuit === 'open') {
      if (now < this.circuitOpenUntil) {
        metrics.incrEvaluations(this.metricsTier);
        metrics.incrRedisFallbackUse(this.metricsTier);
        return fnMem();
      }
      this.circuit = 'half_open';
      logger.info('[rate-limit][%s] circuit half-open — probing Redis (%s)', this.label, name);
    }

    const ms = commandTimeoutMs();
    metrics.incrEvaluations(this.metricsTier);
    try {
      const result = await Promise.race([
        fnRedis(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
        }),
      ]);
      this.consecutiveFailures = 0;
      if (this.circuit === 'half_open') {
        logger.info('[rate-limit][%s] circuit closed — Redis recovered after cooldown', this.label);
      }
      this.circuit = 'closed';
      return result;
    } catch (e) {
      metrics.incrRedisFallbackUse(this.metricsTier);
      if (this.circuit === 'half_open') {
        this.circuit = 'open';
        this.circuitOpenUntil = now + cooldown;
        this.consecutiveFailures = 0;
        logger.warn(
          '[rate-limit][%s] circuit re-open — probe failed (%s); memory for %sms',
          this.label,
          e.message,
          cooldown
        );
        emitRateLimitAlert('circuit_open', {
          tier: this.metricsTier,
          cooldownMs: cooldown,
          reason: 'probe_failed',
        });
        return fnMem();
      }
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= threshold) {
        this.circuit = 'open';
        this.circuitOpenUntil = now + cooldown;
        this.consecutiveFailures = 0;
        logger.warn(
          '[rate-limit][%s] circuit open — Redis failures reached threshold=%s; memory only for %sms (retry after cooldown)',
          this.label,
          threshold,
          cooldown
        );
        emitRateLimitAlert('circuit_open', {
          tier: this.metricsTier,
          cooldownMs: cooldown,
          reason: 'failure_threshold',
          threshold,
        });
      } else {
        logger.warn('[rate-limit][%s] redis %s transient failure: %s', this.label, name, e.message);
      }
      return fnMem();
    }
  }

  get(key) {
    return this._run(
      'get',
      () => this.memory.get(key),
      () => this.redis.get(key)
    );
  }

  increment(key) {
    return this._run(
      'increment',
      () => this.memory.increment(key),
      () => this.redis.increment(key)
    );
  }

  decrement(key) {
    return this._run(
      'decrement',
      () => this.memory.decrement(key),
      () => this.redis.decrement(key)
    );
  }

  resetKey(key) {
    return this._run(
      'resetKey',
      () => this.memory.resetKey(key),
      () => this.redis.resetKey(key)
    );
  }

  resetAll() {
    return this.memory.resetAll();
  }

  shutdown() {
    try {
      this.memory.shutdown();
    } catch (_) {}
    try {
      this.client?.disconnect();
    } catch (_) {}
  }
}

module.exports = { createRateLimitStore };
