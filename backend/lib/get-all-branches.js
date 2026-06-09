/**
 * Branch lookup helpers for the multi-branch admin surface.
 *
 * The owner's set of branches is derived from Business documents (owner + status)
 * — never from a JWT claim — mirroring /api/auth/my-branches in server.js so the
 * two stay consistent. Used by middleware/requireMultiBranch.js and the
 * /api/branch-management routes.
 */

const BusinessModule = require('../models/Business');

function getBusinessModel(mainConnection) {
  // require() caches the module, so the same schema instance is reused and
  // connection.model() returns the already-compiled model without throwing.
  return mainConnection.model('Business', BusinessModule.schema);
}

function mapBranch(b) {
  return {
    id: String(b._id),
    code: b.code,
    name: b.name,
    city: b.address?.city || '',
    logo: b.settings?.branding?.logo || '',
    status: b.status,
    createdAt: b.createdAt,
  };
}

const BRANCH_SELECT = '_id code name address settings.branding.logo status createdAt';

/**
 * Active branches owned by this owner (used to gate access and fan out queries).
 * @param {import('mongoose').Connection} mainConnection
 * @param {string|import('mongoose').Types.ObjectId} ownerId
 */
async function getAllActiveBranchesForOwner(mainConnection, ownerId) {
  const Business = getBusinessModel(mainConnection);
  const docs = await Business.find({ owner: ownerId, status: 'active' })
    .select(BRANCH_SELECT)
    .sort({ createdAt: 1 })
    .lean();
  return docs.map(mapBranch);
}

/**
 * All non-deleted branches owned by this owner (active + inactive + suspended).
 * Used by the settings page which shows deactivated branches greyed out.
 * @param {import('mongoose').Connection} mainConnection
 * @param {string|import('mongoose').Types.ObjectId} ownerId
 */
async function getAllBranchesForOwner(mainConnection, ownerId) {
  const Business = getBusinessModel(mainConnection);
  const docs = await Business.find({ owner: ownerId, status: { $ne: 'deleted' } })
    .select(BRANCH_SELECT)
    .sort({ createdAt: 1 })
    .lean();
  return docs.map(mapBranch);
}

module.exports = {
  getAllActiveBranchesForOwner,
  getAllBranchesForOwner,
  mapBranch,
  getBusinessModel,
};
