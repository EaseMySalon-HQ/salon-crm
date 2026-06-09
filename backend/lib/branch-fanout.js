/**
 * Fan-out helper for the multi-branch admin surface.
 *
 * Runs `queryFn` against every branch's tenant database in parallel and returns
 * one result row per branch. A failure in one branch never fails the whole
 * request — the failing branch comes back with `error` set so the UI can render a
 * partial-failure pill while the other branches still load.
 *
 * Tenant connections are resolved via the shared databaseManager (keyed by the
 * branch `code`, e.g. ease_my_salon_BIZ0001) and models are wired through the same
 * modelFactory cache used by middleware/business-db.js.
 */

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');

/**
 * @param {import('mongoose').Connection} mainConnection
 * @param {Array<{ id: string, code: string, name: string }>} branchList
 * @param {(ctx: { conn: import('mongoose').Connection, models: object, branch: object }) => Promise<any>} queryFn
 * @returns {Promise<Array<{ branchId: string, branchName: string, data: any, error: string|null }>>}
 */
async function fanOut(mainConnection, branchList, queryFn) {
  const results = await Promise.all(
    (branchList || []).map(async (branch) => {
      try {
        // Resolve the tenant DB by business code (preferred input to getConnection).
        const conn = await databaseManager.getConnection(branch.code, mainConnection);
        const models = modelFactory.getCachedBusinessModels(conn);
        const data = await queryFn({ conn, models, branch, mainConnection });
        return { branchId: branch.id, branchName: branch.name, data, error: null };
      } catch (err) {
        logger.error(`branch-fanout failed for ${branch.code}:`, err.message);
        return { branchId: branch.id, branchName: branch.name, data: null, error: err.message };
      }
    })
  );
  return results;
}

module.exports = { fanOut };
