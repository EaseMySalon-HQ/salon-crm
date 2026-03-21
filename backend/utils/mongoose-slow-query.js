/**
 * Registers MongoDB driver monitoring to log slow commands (> SLOW_QUERY_MS).
 * Requires `monitorCommands: true` on mongoose.connect / createConnection.
 * Attach to every mongoose connection (default + createConnection) so business DBs are covered.
 */

const { logger } = require('./logger');

const SLOW_MS = Math.max(0, Number(process.env.SLOW_QUERY_MS || 300));

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

const attachedClients = new WeakSet();

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

      logger.warn('Slow MongoDB command', {
        ms,
        commandName: name,
        database: event.databaseName,
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
