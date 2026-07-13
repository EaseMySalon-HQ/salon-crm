'use strict';

const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { hasFeature } = require('../lib/entitlements');

/**
 * Resolve tenant for public mini-site by vanity slug, slug alias, or Business.code.
 */
async function setupPublicSiteBySlug(req, res, next) {
  try {
    const raw = req.params.slug || req.params.slugOrCode || '';
    const normalized = String(raw).trim().toLowerCase();
    if (!normalized) {
      return res.status(404).json({ success: false, error: 'Salon page not found.' });
    }

    const { Business } = req.mainModels || {};
    if (!Business) {
      return res.status(500).json({ success: false, error: 'Server configuration error.' });
    }

    let business = await Business.findOne({
      status: 'active',
      $or: [{ slug: normalized }, { slugAliases: normalized }],
    }).lean();

    if (!business) {
      business = await Business.findOne({
        code: normalized.toUpperCase(),
        status: 'active',
      }).lean();
    }

    if (!business) {
      return res.status(404).json({ success: false, error: 'Salon page not found.' });
    }

    if (business.settings?.website?.enabled !== true) {
      return res.status(404).json({
        success: false,
        error: 'This salon website is not available.',
      });
    }

    if (!hasFeature(business, 'mini_website')) {
      return res.status(404).json({
        success: false,
        error: 'This salon website is not available.',
      });
    }

    const mainConnection = req.mainConnection || (await databaseManager.getMainConnection());
    const businessConnection = await databaseManager.getConnection(business.code, mainConnection);
    const businessModels = modelFactory.getCachedBusinessModels(businessConnection);

    req.businessDoc = business;
    req.branchId = business._id;
    req.businessModels = businessModels;
    req.businessConnection = businessConnection;
    req.siteSlug = (business.slug || String(business.code).toLowerCase()).toLowerCase();
    next();
  } catch (error) {
    logger.error('setupPublicSiteBySlug error:', error);
    res.status(500).json({ success: false, error: 'Failed to load salon page.' });
  }
}

module.exports = { setupPublicSiteBySlug };
