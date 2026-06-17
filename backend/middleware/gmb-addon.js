/**
 * Gates GMB Booster premium features on plan.addons.googleBusiness.enabled.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { resolveTenantBusinessObjectId } = require('../lib/tenant-business-id');
const { logger } = require('../utils/logger');

async function requireGmbAddon(req, res, next) {
  try {
    const rawBranchId = req.user?.branchId;
    if (!rawBranchId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (req._gmbAddonChecked === true) return next();

    const main = req.mainConnection || (await databaseManager.getMainConnection());
    const resolved = await resolveTenantBusinessObjectId(rawBranchId, main);
    if (resolved.error || !resolved.businessObjectId) {
      return res.status(400).json({ success: false, error: resolved.error || 'Invalid business id' });
    }

    const Business = main.model('Business', require('../models/Business').schema);
    const business = await Business.findById(resolved.businessObjectId)
      .select('plan.addons.googleBusiness')
      .lean();

    const enabled = Boolean(business?.plan?.addons?.googleBusiness?.enabled);
    if (!enabled) {
      return res.status(403).json({
        success: false,
        code: 'ADDON_NOT_ENABLED',
        error: 'Google Business Profile Booster add-on is not enabled for your account.',
      });
    }

    req._gmbAddonChecked = true;
    req._tenantBusinessObjectId = resolved.businessObjectId;
    return next();
  } catch (err) {
    logger.error('[gmb-addon] check failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to verify GMB add-on' });
  }
}

module.exports = requireGmbAddon;
