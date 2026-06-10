/**
 * Authorization gate for the multi-branch admin surface (/api/branch-management).
 *
 * Requires an authenticated owner whose account currently has 2+ active branches.
 * The branch list is resolved from the main DB on every request (never trusted
 * from a JWT claim), so deactivating a branch immediately changes what is fanned
 * out. Attaches `req.branchList` for downstream routes.
 *
 * Must run AFTER authenticateToken and setupMainDatabase (needs req.user and
 * req.mainConnection).
 */

const { getAllActiveBranchesForOwner } = require('../lib/get-all-branches');
const { branchHasMultiLocation } = require('../lib/multi-location-access');
const { logger } = require('../utils/logger');

async function requireMultiBranchAdmin(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Owners only — staff sessions never span multiple branches.
    if (req.user.authSubject !== 'user' || !req.user.isOwner) {
      return res.status(403).json({ success: false, error: 'Branch management is owner-only' });
    }

    if (!req.mainConnection) {
      return res.status(500).json({ success: false, error: 'Main database not initialized' });
    }

    const branchList = await getAllActiveBranchesForOwner(req.mainConnection, req.user._id);
    if (branchList.length < 2) {
      return res.status(403).json({
        success: false,
        error: 'Branch management requires 2 or more active branches',
      });
    }

    const hasMultiLocation = await branchHasMultiLocation(req.user.branchId);
    if (!hasMultiLocation) {
      return res.status(403).json({
        success: false,
        error: 'Multi-Location Support is not enabled on your plan',
        code: 'FEATURE_NOT_AVAILABLE',
        featureId: 'multi_location',
        upgradeRequired: true,
      });
    }

    req.branchList = branchList;
    next();
  } catch (error) {
    logger.error('requireMultiBranchAdmin error:', error);
    return res.status(500).json({ success: false, error: 'Failed to resolve branch list' });
  }
}

module.exports = { requireMultiBranchAdmin };
