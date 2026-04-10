/**
 * In-process per-tier + aggregate counters (no external deps).
 * Safe for multi-instance: each Node process has its own totals.
 */

const { emitRateLimitAlert } = require('./rate-limit-alerts');

const TIERS = ['global', 'auth', 'report', 'ai'];

/** @type {Record<string, { evaluations: number; blocked429: number; redisFallbackUses: number }>} */
const tierData = {};
for (const t of TIERS) {
  tierData[t] = { evaluations: 0, blocked429: 0, redisFallbackUses: 0 };
}

let aggregateEvaluations = 0;
let aggregateBlocked429 = 0;
let aggregateRedisFallbackUses = 0;

/** Optional pluggable sink: (event, payload) => void */
let sink = null;

/** Rolling-window spike detection per tier */
const spikeWindows = new Map();

function envInt(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultValue;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function registerMetricsSink(fn) {
  sink = typeof fn === 'function' ? fn : null;
}

function emit(event, payload) {
  try {
    sink?.(event, payload);
  } catch (_) {}
}

/** Map store label (export) → metrics tier key (report). */
function normalizeTier(tierOrLabel) {
  if (tierOrLabel === 'export') return 'report';
  if (TIERS.includes(tierOrLabel)) return tierOrLabel;
  return 'global';
}

function ensureTier(tier) {
  const t = normalizeTier(tier);
  if (!TIERS.includes(t)) return 'global';
  return t;
}

function incrEvaluations(tier, n = 1) {
  const t = ensureTier(tier);
  tierData[t].evaluations += n;
  aggregateEvaluations += n;
  emit('evaluations', { n, tier: t });
}

function incrBlocked429(tier, n = 1) {
  const t = ensureTier(tier);
  tierData[t].blocked429 += n;
  aggregateBlocked429 += n;
  emit('blocked429', { n, tier: t });
}

function checkRedisFallbackSpike(tier, delta = 1) {
  const windowMs = envInt('RATE_LIMIT_ALERT_FALLBACK_SPIKE_WINDOW_MS', 60000);
  const threshold = envInt('RATE_LIMIT_ALERT_FALLBACK_SPIKE_THRESHOLD', 100);
  if (threshold <= 0) return;

  const now = Date.now();
  let w = spikeWindows.get(tier);
  if (!w || now - w.windowStart >= windowMs) {
    w = { windowStart: now, count: 0, alerted: false };
    spikeWindows.set(tier, w);
  }
  w.count += delta;
  if (w.count >= threshold && !w.alerted) {
    w.alerted = true;
    emitRateLimitAlert('redis_fallback_spike', {
      tier,
      countInWindow: w.count,
      windowMs,
      threshold,
    });
  }
}

function incrRedisFallbackUse(tier, n = 1) {
  const t = ensureTier(tier);
  tierData[t].redisFallbackUses += n;
  aggregateRedisFallbackUses += n;
  emit('redisFallback', { n, tier: t });
  checkRedisFallbackSpike(t, n);
}

/** Ratio of Redis fallback operations to evaluations (null if no evaluations yet). */
function deriveFallbackRate(evaluations, redisFallbackUses) {
  if (evaluations == null || evaluations <= 0) return null;
  return redisFallbackUses / evaluations;
}

function enrichWithDerived(row) {
  const fr = deriveFallbackRate(row.evaluations, row.redisFallbackUses);
  return { ...row, fallbackRate: fr };
}

function getSnapshot() {
  const tiers = {};
  for (const t of TIERS) {
    tiers[t] = enrichWithDerived({ ...tierData[t] });
  }
  return {
    totals: enrichWithDerived({
      evaluations: aggregateEvaluations,
      blocked429: aggregateBlocked429,
      redisFallbackUses: aggregateRedisFallbackUses,
    }),
    tiers,
  };
}

function resetForTests() {
  for (const t of TIERS) {
    tierData[t] = { evaluations: 0, blocked429: 0, redisFallbackUses: 0 };
  }
  aggregateEvaluations = 0;
  aggregateBlocked429 = 0;
  aggregateRedisFallbackUses = 0;
  spikeWindows.clear();
}

module.exports = {
  TIERS,
  normalizeTier,
  registerMetricsSink,
  incrEvaluations,
  incrBlocked429,
  incrRedisFallbackUse,
  getSnapshot,
  deriveFallbackRate,
  resetForTests,
};
