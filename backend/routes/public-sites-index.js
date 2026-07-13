'use strict';

/**
 * Public list of enabled mini-site slugs for sitemap generation.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { setupMainDatabase } = require('../middleware/business-db');
const { hasFeature } = require('../lib/entitlements');
const { logger } = require('../utils/logger');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

router.get('/sitemap-entries', limiter, setupMainDatabase, async (req, res) => {
  try {
    const { Business } = req.mainModels;
    const businesses = await Business.find({
      status: 'active',
      'settings.website.enabled': true,
    })
      .select('code slug updatedAt plan settings.website.enabled')
      .lean();

    const entries = businesses
      .filter((b) => hasFeature(b, 'mini_website'))
      .map((b) => ({
        slug: (b.slug || String(b.code).toLowerCase()).toLowerCase(),
        lastModified: b.updatedAt || new Date(),
      }));

    res.json({ success: true, data: { entries } });
  } catch (error) {
    logger.error('[public-sites] sitemap-entries', error);
    res.status(500).json({ success: false, error: 'Failed to list sites' });
  }
});

module.exports = router;
