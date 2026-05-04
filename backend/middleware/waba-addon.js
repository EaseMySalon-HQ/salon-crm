/**
 * Express middleware that gates the new Meta Cloud API ("WABA Integration")
 * module on the per-business `waba` add-on flag. Routes mounted with this
 * middleware return HTTP 403 unless `business.plan.addons.waba.enabled` is
 * true for the authenticated user's business.
 *
 * Usage:
 *   const requireWabaAddon = require('../middleware/waba-addon');
 *   router.use(requireWabaAddon);   // gate the entire router
 *   // or attach to specific endpoints only
 *
 * The middleware lazily fetches just `plan.addons.waba` from the main DB and
 * caches the lookup on `req` so multiple gated middlewares on the same
 * request don't trigger duplicate queries.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { resolveTenantBusinessObjectId } = require('../lib/tenant-business-id');
const { logger } = require('../utils/logger');

async function requireWabaAddon(req, res, next) {
  try {
    const rawBranchId = req.user?.branchId;
    if (!rawBranchId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (req._wabaAddonChecked === true) return next();

    const main = req.mainConnection || (await databaseManager.getMainConnection());
    const resolved = await resolveTenantBusinessObjectId(rawBranchId, main);
    if (resolved.error || !resolved.businessObjectId) {
      return res.status(400).json({ success: false, error: resolved.error || 'Invalid business id' });
    }
    req._tenantBusinessObjectId = resolved.businessObjectId;

    const Business = main.model('Business', require('../models/Business').schema);
    const business = await Business.findById(resolved.businessObjectId).select('plan.addons.waba').lean();

    const enabled = Boolean(business?.plan?.addons?.waba?.enabled);
    req._wabaAddonChecked = true;
    req._wabaAddonEnabled = enabled;

    if (!enabled) {
      return res.status(403).json({
        success: false,
        code: 'WABA_ADDON_DISABLED',
        error:
          'WABA Integration add-on is not enabled for this business. ' +
          'Ask your platform admin to enable the WABA add-on under Plan Management.',
      });
    }

    return next();
  } catch (err) {
    logger.error('[waba-addon] gate check failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Add-on gate check failed' });
  }
}

module.exports = requireWabaAddon;
module.exports.requireWabaAddon = requireWabaAddon;
