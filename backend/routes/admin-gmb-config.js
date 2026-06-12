/**
 * Admin routes for platform Google OAuth app configuration.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { authenticateAdmin, checkAdminPermission } = require('../middleware/admin-auth');
const { setupMainDatabase } = require('../middleware/business-db');
const { getGmbConfig, setGmbConfig } = require('../lib/google-business-config');
const { logger } = require('../utils/logger');

router.use(authenticateAdmin, setupMainDatabase);

router.get('/', checkAdminPermission('settings', 'view'), async (_req, res) => {
  try {
    const cfg = await getGmbConfig();
    return res.json({
      success: true,
      data: {
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        hasClientSecret: Boolean(cfg.clientSecret),
        source: cfg.source,
        updatedAt: cfg.updatedAt,
      },
    });
  } catch (err) {
    logger.error('[admin-gmb-config] GET failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to load GMB config' });
  }
});

router.put('/', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const { clientId, clientSecret, redirectUri } = req.body || {};
    await setGmbConfig({ clientId, clientSecret, redirectUri }, req.admin?.email || 'admin');
    const cfg = await getGmbConfig({ skipCache: true });
    return res.json({
      success: true,
      data: {
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        hasClientSecret: Boolean(cfg.clientSecret),
      },
    });
  } catch (err) {
    logger.error('[admin-gmb-config] PUT failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to save GMB config' });
  }
});

module.exports = router;
