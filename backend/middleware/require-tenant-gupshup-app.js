/**
 * Gates WhatsApp Inbox routes on a connected tenant Gupshup app.
 * Inbox conversations must use the business's own app — not the shared platform number.
 */

'use strict';

const gupshupConfig = require('../lib/gupshup-config');
const { logger } = require('../utils/logger');

async function requireTenantGupshupApp(req, res, next) {
  try {
    const businessId = req.user?.branchId;
    if (!businessId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (req._tenantGupshupAppChecked === true) return next();

    const account = await gupshupConfig.loadAccount(businessId);
    req._tenantGupshupAppChecked = true;
    req._tenantGupshupAppConnected = gupshupConfig.isBusinessAppUsable(account);

    if (!req._tenantGupshupAppConnected) {
      return res.status(403).json({
        success: false,
        code: 'WHATSAPP_APP_NOT_CONNECTED',
        error: gupshupConfig.TENANT_APP_REQUIRED_MSG,
      });
    }

    return next();
  } catch (err) {
    logger.error('[require-tenant-gupshup-app] gate check failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'WhatsApp app gate check failed' });
  }
}

module.exports = requireTenantGupshupApp;
module.exports.requireTenantGupshupApp = requireTenantGupshupApp;
