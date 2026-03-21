/**
 * Lightweight structured logger: JSON lines to stdout (no console.*).
 * High-traffic safe: work skipped when level disabled; rate-limit map pruned periodically.
 */

const rawLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info');
const LOG_LEVEL = String(rawLevel).toLowerCase();

const levels = { error: 0, warn: 1, info: 2, debug: 3 };

function shouldLog(level) {
  const threshold = levels[LOG_LEVEL] !== undefined ? levels[LOG_LEVEL] : levels.warn;
  return levels[level] !== undefined && levels[level] <= threshold;
}

/**
 * JSON.stringify with circular refs, BigInt, and Error handling.
 * Uses native stringify first (correct for shared references); WeakSet replacer only on failure.
 * @param {unknown} obj
 * @returns {string}
 */
function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    if (!(e instanceof TypeError)) {
      try {
        return JSON.stringify({ _: String(obj) });
      } catch {
        return '"[Unserializable]"';
      }
    }
  }
  const seen = new WeakSet();
  try {
    return JSON.stringify(obj, function replacer(_key, value) {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
      }
      return value;
    });
  } catch {
    return JSON.stringify({ _: '[Unserializable]' });
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && value.constructor === Object;
}

function serializeArg(arg) {
  if (arg instanceof Error) {
    return { type: 'Error', name: arg.name, message: arg.message, stack: arg.stack };
  }
  if (typeof arg === 'function') {
    return '[Function]';
  }
  if (typeof arg === 'symbol') {
    return String(arg);
  }
  if (arg === null || typeof arg !== 'object') {
    return arg;
  }
  try {
    return JSON.parse(safeStringify(arg));
  } catch {
    return { _: String(arg) };
  }
}

/**
 * Turn variadic logger args into { msg, data } for structured output.
 * @param {unknown[]} args
 * @returns {{ msg: string, data?: unknown }}
 */
function buildPayload(args) {
  if (args.length === 0) {
    return { msg: '' };
  }

  const first = args[0];
  const rest = args.slice(1);

  if (first instanceof Error) {
    const data = {
      error: { name: first.name, message: first.message, stack: first.stack },
    };
    if (rest.length) {
      data.extra = rest.map(serializeArg);
    }
    return { msg: first.message, data };
  }

  const msg =
    typeof first === 'string'
      ? first
      : typeof first === 'number' || typeof first === 'boolean'
        ? String(first)
        : safeStringify(first);

  if (rest.length === 0) {
    return { msg };
  }

  if (rest.length === 1) {
    const r = rest[0];
    if (r instanceof Error) {
      return { msg, data: { error: { name: r.name, message: r.message, stack: r.stack } } };
    }
    if (isPlainObject(r) || Array.isArray(r)) {
      return { msg, data: serializeArg(r) };
    }
    return { msg, data: { value: serializeArg(r) } };
  }

  return { msg, data: { args: rest.map(serializeArg) } };
}

/**
 * Normalize `data` for JSON output (handles circular refs).
 * @param {unknown} data
 * @returns {unknown}
 */
function normalizeDataField(data) {
  if (data === undefined) return undefined;
  return serializeArg(data);
}

function writeLog(level, msg, data) {
  const payload = {
    level,
    time: new Date().toISOString(),
    msg: typeof msg === 'string' ? msg : safeStringify(msg),
  };
  const normalized = normalizeDataField(data);
  if (normalized !== undefined) {
    payload.data = normalized;
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`, 'utf8');
}

const rateLimitMap = new Map();
const RATE_LIMIT_CLEANUP_MS = 60_000;
const RATE_LIMIT_MAX_AGE_MS = 60_000;

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of rateLimitMap) {
    if (now - ts > RATE_LIMIT_MAX_AGE_MS) {
      rateLimitMap.delete(key);
    }
  }
}, RATE_LIMIT_CLEANUP_MS);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

function rateLimitedLog(key, level, message, data, intervalMs = 5000) {
  if (!levels[level]) {
    return;
  }
  if (!shouldLog(level)) {
    return;
  }
  const now = Date.now();
  const last = rateLimitMap.get(key) || 0;
  if (now - last > intervalMs) {
    const { msg, data: d } = buildPayload([message, data]);
    writeLog(level, msg, d);
    rateLimitMap.set(key, now);
  }
}

function createLevelFn(level) {
  return (...args) => {
    if (!shouldLog(level)) return;
    const { msg, data } = buildPayload(args);
    writeLog(level, msg, data);
  };
}

const logger = {
  error: createLevelFn('error'),
  warn: createLevelFn('warn'),
  info: createLevelFn('info'),
  debug: createLevelFn('debug'),
  rateLimited: rateLimitedLog,
};

module.exports = {
  logger,
  shouldLog,
  safeStringify,
};
