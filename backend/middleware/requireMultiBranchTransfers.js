/**
 * Gate for /api/inventory/transfers — multi-branch org with multi_location plan.
 * Attaches req.transferContext { ownerId, branchList, currentBranchId, isOrgOwner }.
 * Run after authenticateToken + setupMainDatabase.
 */

const { getAllActiveBranchesForOwner, getBusinessModel } = require('../lib/get-all-branches');
const { branchHasMultiLocation } = require('../lib/multi-location-access');
const { normalizeBranchId } = require('../lib/transfer-request-permissions');
const { logger } = require('../utils/logger');

async function requireMultiBranchTransfers(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (!req.mainConnection) {
      return res.status(500).json({ success: false, error: 'Main database not initialized' });
    }
    if (!req.user.branchId) {
      return res.status(400).json({ success: false, error: 'Business ID not found in user data' });
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

    const Business = getBusinessModel(req.mainConnection);
    const current = await Business.findById(req.user.branchId).select('owner').lean();
    if (!current?.owner) {
      return res.status(404).json({ success: false, error: 'Branch not found' });
    }

    const ownerId = current.owner;
    const branchList = await getAllActiveBranchesForOwner(req.mainConnection, ownerId);
    if (branchList.length < 2) {
      return res.status(403).json({
        success: false,
        error: 'Transfer requests require 2 or more active branches',
      });
    }

    req.transferContext = {
      ownerId,
      branchList,
      currentBranchId: normalizeBranchId(req.user.branchId),
      isOrgOwner: req.user.isOwner === true,
    };
    next();
  } catch (error) {
    logger.error('requireMultiBranchTransfers error:', error);
    return res.status(500).json({ success: false, error: 'Failed to resolve branch context' });
  }
}

module.exports = { requireMultiBranchTransfers };
