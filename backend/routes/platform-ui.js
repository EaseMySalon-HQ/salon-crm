'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const { formatNavBannerForClient } = require('../lib/nav-banner-config');

/** Public-ish platform UI config for authenticated tenant apps (top nav banner, etc.). */
router.get('/nav-banner', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const { AdminSettings } = req.mainModels;
    const settings = await AdminSettings.getSettings();
    return res.json({
      success: true,
      data: formatNavBannerForClient(settings.notifications),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to load nav banner settings',
    });
  }
});

module.exports = router;
