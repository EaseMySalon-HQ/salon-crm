'use strict';

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { ensureWalkInClient } = require('../lib/ensure-walk-in-client');

/**
 * Resolve tenant context from :code URL param for unauthenticated public booking.
 * Requires setupMainDatabase to run first (req.mainModels).
 */
async function setupPublicBusinessByCode(req, res, next) {
  try {
    const rawCode = req.params.code || req.params.businessCode || '';
    const normalizedCode = String(rawCode).trim().toUpperCase();
    if (!normalizedCode) {
      return res.status(404).json({ success: false, error: 'Booking page not found.' });
    }

    const { Business } = req.mainModels || {};
    if (!Business) {
      return res.status(500).json({ success: false, error: 'Server configuration error.' });
    }

    const business = await Business.findOne({
      code: normalizedCode,
      status: 'active',
    }).lean();

    if (!business) {
      return res.status(404).json({ success: false, error: 'Booking page not found.' });
    }

    if (business.settings?.appointmentSettings?.allowOnlineBooking !== true) {
      return res.status(404).json({
        success: false,
        error: 'Online booking is not available for this salon.',
      });
    }

    const { hasFeature } = require('../lib/entitlements');
    if (!hasFeature(business, 'online_booking')) {
      return res.status(404).json({
        success: false,
        error: 'Online booking is not available for this salon.',
      });
    }

    const mainConnection = req.mainConnection || (await databaseManager.getMainConnection());
    const businessConnection = await databaseManager.getConnection(business.code, mainConnection);
    const businessModels = modelFactory.getCachedBusinessModels(businessConnection);

    if (!businessConnection.ensureWalkInClientPromise) {
      businessConnection.ensureWalkInClientPromise = (async () => {
        try {
          await ensureWalkInClient(businessModels, business._id);
        } catch (e) {
          logger.warn('ensureWalkInClient failed (public booking):', e.message);
        }
      })();
    }
    await businessConnection.ensureWalkInClientPromise;

    req.businessDoc = business;
    req.branchId = business._id;
    req.businessModels = businessModels;
    req.businessConnection = businessConnection;
    req.params.code = normalizedCode;
    next();
  } catch (error) {
    logger.error('setupPublicBusinessByCode error:', error);
    res.status(500).json({ success: false, error: 'Failed to load booking page.' });
  }
}

module.exports = { setupPublicBusinessByCode };
