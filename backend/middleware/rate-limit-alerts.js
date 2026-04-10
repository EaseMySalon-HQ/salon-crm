/**
 * Lightweight alerting for rate-limit operations: stderr JSON line + optional hook.
 * Does not block the request path; hooks must not throw (wrapped).
 */

const os = require('os');

let alertHook = null;

function registerRateLimitAlertHook(fn) {
  alertHook = typeof fn === 'function' ? fn : null;
}

function instanceIdentifier() {
  const id = process.env.INSTANCE_ID;
  if (id && String(id).trim()) return String(id).trim();
  try {
    return os.hostname();
  } catch {
    return 'unknown';
  }
}

/**
 * @param {string} event
 * @returns {'critical' | 'warning' | 'info'}
 */
function severityForEvent(event) {
  if (event === 'circuit_open') return 'critical';
  if (event === 'redis_fallback_spike') return 'warning';
  return 'info';
}

/**
 * @param {string} event e.g. circuit_open | redis_fallback_spike
 * @param {Record<string, unknown>} payload — no secrets; tier + counts only
 */
function emitRateLimitAlert(event, payload = {}) {
  const instanceId = instanceIdentifier();
  const severity = severityForEvent(event);
  const context = {
    service: 'rate-limit',
    ...(payload.tier != null && { tier: payload.tier }),
    ...(payload.reason != null && { reason: payload.reason }),
    ...(payload.countInWindow != null && { countInWindow: payload.countInWindow }),
    ...(payload.windowMs != null && { windowMs: payload.windowMs }),
    ...(payload.threshold != null && { threshold: payload.threshold }),
    ...(payload.cooldownMs != null && { cooldownMs: payload.cooldownMs }),
  };

  const line = {
    event,
    severity,
    instanceId,
    ts: new Date().toISOString(),
    ...payload,
    context,
  };

  try {
    console.error('[rate-limit-alert]', JSON.stringify(line));
  } catch (_) {}
  try {
    alertHook?.(event, line);
  } catch (_) {}
}

module.exports = {
  registerRateLimitAlertHook,
  emitRateLimitAlert,
  instanceIdentifier,
};
