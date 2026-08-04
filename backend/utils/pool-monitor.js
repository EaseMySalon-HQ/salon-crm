/**
 * Production-only MongoDB connection-pool monitor.
 *
 * Per-tenant Mongoose connections each own their own driver pool, so a single
 * exhausted tenant pool can stall requests while the process looks healthy. This
 * watches every open pool (main + tenant) and logs when requests are queued or a
 * pool is saturated, so pool-exhaustion incidents are visible before they show up
 * only as slow requests.
 *
 * Pool stats are derived from CMAP monitoring events (stable public driver API)
 * rather than driver internals, which change across versions.
 */

const { logger } = require('./logger');

const SAMPLE_INTERVAL_MS = parseInt(process.env.MONGO_POOL_MONITOR_MS, 10) || 30000;

/** Per pool-address counters, keyed by `${dbName}::${address}`. */
const poolStats = new Map();
/** Clients we have already wired CMAP listeners on. */
const instrumentedClients = new WeakSet();

let sampleTimer = null;
let getEntries = null;

function statKey(dbName, address) {
  return `${dbName}::${address}`;
}

function ensureStat(dbName, address) {
  const key = statKey(dbName, address);
  let stat = poolStats.get(key);
  if (!stat) {
    stat = { dbName, address, total: 0, checkedOut: 0, waiting: 0 };
    poolStats.set(key, stat);
  }
  return stat;
}

function clampNonNegative(value) {
  return value < 0 ? 0 : value;
}

function instrumentClient(dbName, client) {
  if (!client || instrumentedClients.has(client)) return;
  instrumentedClients.add(client);

  client.on('connectionCreated', (e) => {
    ensureStat(dbName, e.address).total += 1;
  });
  client.on('connectionClosed', (e) => {
    const stat = ensureStat(dbName, e.address);
    stat.total = clampNonNegative(stat.total - 1);
  });
  client.on('connectionCheckOutStarted', (e) => {
    ensureStat(dbName, e.address).waiting += 1;
  });
  client.on('connectionCheckedOut', (e) => {
    const stat = ensureStat(dbName, e.address);
    stat.waiting = clampNonNegative(stat.waiting - 1);
    stat.checkedOut += 1;
  });
  client.on('connectionCheckedIn', (e) => {
    const stat = ensureStat(dbName, e.address);
    stat.checkedOut = clampNonNegative(stat.checkedOut - 1);
  });
  client.on('connectionCheckOutFailed', (e) => {
    const stat = ensureStat(dbName, e.address);
    stat.waiting = clampNonNegative(stat.waiting - 1);
    logger.error('[db-pool] checkout failed', {
      db: dbName,
      address: e.address,
      reason: e.reason || null,
    });
  });
  client.on('connectionPoolCleared', (e) => {
    logger.warn('[db-pool] pool cleared', { db: dbName, address: e.address });
    // A cleared pool discards all connections; reset derived counters for its addresses.
    for (const [key, stat] of poolStats.entries()) {
      if (stat.dbName === dbName) poolStats.delete(key);
    }
  });
  client.on('connectionPoolClosed', (e) => {
    poolStats.delete(statKey(dbName, e.address));
  });
}

/** Attach listeners to any pool we have not seen yet. */
function instrumentOpenConnections() {
  if (typeof getEntries !== 'function') return;
  let entries;
  try {
    entries = getEntries();
  } catch {
    return;
  }
  for (const [dbName, connection] of entries) {
    let client;
    try {
      client = connection?.getClient?.();
    } catch {
      client = null;
    }
    if (client) instrumentClient(dbName, client);
  }
}

function samplePools() {
  instrumentOpenConnections();
  for (const stat of poolStats.values()) {
    if (stat.waiting > 0) {
      logger.warn('[db-pool] requests waiting', {
        db: stat.dbName,
        address: stat.address,
        waiting: stat.waiting,
        checkedOut: stat.checkedOut,
        available: clampNonNegative(stat.total - stat.checkedOut),
      });
    }
    // Genuine exhaustion: connections exist and every one is in use. An idle pool
    // that shrank to zero via maxIdleTimeMS reports available 0 too, so require an
    // active checkout to avoid false alarms.
    if (stat.checkedOut > 0 && stat.total - stat.checkedOut <= 0) {
      logger.error('[db-pool] pool exhausted', {
        db: stat.dbName,
        address: stat.address,
        checkedOut: stat.checkedOut,
        total: stat.total,
      });
    }
  }
}

/**
 * Start the pool monitor. Production only.
 * @param {() => Array<[string, import('mongoose').Connection]>} getConnectionEntries
 */
function startPoolMonitor(getConnectionEntries) {
  if (process.env.NODE_ENV !== 'production') return;
  if (sampleTimer) return;
  getEntries = getConnectionEntries;
  instrumentOpenConnections();
  sampleTimer = setInterval(samplePools, SAMPLE_INTERVAL_MS);
  if (typeof sampleTimer.unref === 'function') sampleTimer.unref();
  logger.info('[db-pool] monitor started', { intervalMs: SAMPLE_INTERVAL_MS });
}

function stopPoolMonitor() {
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
  poolStats.clear();
  getEntries = null;
}

module.exports = { startPoolMonitor, stopPoolMonitor };
