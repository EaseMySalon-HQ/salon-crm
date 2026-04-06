/**
 * Centralized graceful shutdown for SIGINT / SIGTERM.
 * Tasks must not block indefinitely — failures are logged and ignored.
 */

const mongoose = require('mongoose');
const { logger } = require('./logger');

/**
 * @param {import('http').Server} server
 * @param {Array<{ name: string, close: () => (void | Promise<void>) }>} [tasksBeforeExit] e.g. Redis disconnects
 */
function registerGracefulShutdown(server, tasksBeforeExit = []) {
  let exiting = false;

  async function shutdown(signal) {
    if (exiting) return;
    exiting = true;
    logger.info('[shutdown] received %s — stopping HTTP server', signal);

    server.close(async (closeErr) => {
      if (closeErr) {
        logger.warn('[shutdown] server.close: %s', closeErr.message);
      } else {
        logger.info('[shutdown] HTTP server closed');
      }

      for (const t of tasksBeforeExit) {
        try {
          await Promise.resolve(t.close());
          logger.info('[shutdown] %s closed', t.name);
        } catch (e) {
          logger.warn('[shutdown] %s close failed (ignored): %s', t.name, e.message);
        }
      }

      try {
        if (mongoose.connection.readyState !== 0) {
          await mongoose.connection.close();
          logger.info('[shutdown] mongoose disconnected');
        }
      } catch (e) {
        logger.warn('[shutdown] mongoose close failed (ignored): %s', e.message);
      }

      process.exit(closeErr ? 1 : 0);
    });

    const forceMs = Number(process.env.SHUTDOWN_FORCE_MS) || 10000;
    setTimeout(() => {
      logger.warn('[shutdown] forced exit after %sms', forceMs);
      process.exit(1);
    }, forceMs).unref();
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

module.exports = { registerGracefulShutdown };
