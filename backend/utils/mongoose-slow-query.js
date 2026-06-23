/**
 * Registers MongoDB driver monitoring to log slow commands (> SLOW_QUERY_MS).
 * Requires `monitorCommands: true` on mongoose.connect / createConnection.
 * Attach to every mongoose connection (default + createConnection) so business DBs are covered.
 */

'use strict';

const { logger } = require('./logger');

const SLOW_MS = Math.max(0, Number(process.env.SLOW_QUERY_MS || 300));
const MAX_FILTER_LEN = 200;

/** Commands that are usually noise for app-level slow-query logs */
const IGNORE_COMMANDS = new Set([
  'hello',
  'ismaster',
  'isMaster',
  'ping',
  'saslStart',
  'saslContinue',
  'endSessions',
  'getLastError',
  'getnonce',
  'buildInfo',
  'connectionStatus',
]);

/** Fields whose values should never appear in logs */
const REDACT_KEYS = new Set([
  'phone', 'email', 'name', 'password', 'token',
  'customerPhone', 'customerName', 'customerEmail',
  'recipientPhone', 'recipientEmail',
  'contactNumber', 'address', 'street',
  'gstin', 'pan', 'cardNumber', 'upiId', 'bankAccount',
  'staffName', 'billNo',
]);

function redactValues(obj, depth) {
  if (!obj || typeof obj !== 'object' || depth > 4) return '[deep]';
  if (obj instanceof RegExp) return '[regex]';
  const out = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    if (REDACT_KEYS.has(key) || key === '$regex' || key === '$text') {
      out[key] = '[redacted]';
    } else {
      out[key] = typeof obj[key] === 'object' ? redactValues(obj[key], depth + 1) : obj[key];
    }
  }
  return out;
}

function truncateJson(obj, maxLen) {
  if (!obj || typeof obj !== 'object') return undefined;
  try {
    const redacted = redactValues(obj, 0);
    const s = JSON.stringify(redacted);
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  } catch {
    return undefined;
  }
}

/**
 * Extract collection name + diagnostic fields from the driver command event.
 * The driver puts the collection as the value of the command key
 * (e.g. `{ find: 'appointments', filter: {...} }`).
 */
function extractCommandDetail(event) {
  const cmd = event.command;
  if (!cmd || typeof cmd !== 'object') return {};

  const cmdName = event.commandName;
  const collection = typeof cmd[cmdName] === 'string' ? cmd[cmdName] : undefined;
  const filter = truncateJson(cmd.filter || cmd.query, MAX_FILTER_LEN);
  const sort = truncateJson(cmd.sort, MAX_FILTER_LEN);
  const pipeline = cmd.pipeline
    ? truncateJson(
        cmd.pipeline.slice(0, 3).map((stage) => Object.keys(stage)[0]),
        MAX_FILTER_LEN,
      )
    : undefined;

  return { collection, filter, sort, pipeline };
}

const attachedClients = new WeakSet();

function isBenignIndexSyncFailure(commandName, failure) {
  if (commandName !== 'createIndexes') return false;
  const msg = String(failure || '').toLowerCase();
  return (
    msg.includes('already exists') ||
    msg.includes('same name as the requested index') ||
    msg.includes('index options are equivalent')
  );
}

/**
 * @param {import('mongoose').Connection} connection
 */
function registerSlowQueryMonitoring(connection) {
  if (!connection || typeof connection.getClient !== 'function') return;

  const attach = () => {
    let client;
    try {
      client = connection.getClient();
    } catch {
      return;
    }
    if (!client || typeof client.on !== 'function' || attachedClients.has(client)) return;
    attachedClients.add(client);

    client.on('commandSucceeded', (event) => {
      if (SLOW_MS <= 0) return;
      const ms = event.duration;
      if (typeof ms !== 'number' || ms < SLOW_MS) return;

      const name = event.commandName;
      if (!name || IGNORE_COMMANDS.has(name)) return;

      const detail = extractCommandDetail(event);
      logger.warn('Slow MongoDB command', {
        ms,
        commandName: name,
        database: event.databaseName,
        collection: detail.collection,
        filter: detail.filter,
        sort: detail.sort,
        pipeline: detail.pipeline,
      });
    });

    client.on('commandFailed', (event) => {
      const name = event.commandName;
      if (!name || IGNORE_COMMANDS.has(name)) return;
      if (isBenignIndexSyncFailure(name, event.failure)) return;

      const detail = extractCommandDetail(event);
      logger.warn('Failed MongoDB command', {
        ms: event.duration,
        commandName: name,
        database: event.databaseName,
        collection: detail.collection,
        failure: String(event.failure || '').slice(0, 200),
      });
    });
  };

  if (connection.readyState === 1) {
    attach();
  } else {
    connection.once('open', attach);
  }
}

module.exports = { registerSlowQueryMonitoring };
