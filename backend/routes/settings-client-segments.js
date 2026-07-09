'use strict';

/**
 * Client segment threshold settings (per-tenant).
 *
 *   GET /api/settings/client-segments
 *   PUT /api/settings/client-segments
 */

const express = require('express');
const router = express.Router();

const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { requirePermission } = require('../middleware/permissions');
const {
  mergeClientSegmentRules,
  validateClientSegmentRules,
} = require('../lib/client-segment-rules');

router.get(
  '/client-segments',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('clients', 'view'),
  async (req, res) => {
    try {
      const { BusinessSettings } = req.businessModels;
      const doc = await BusinessSettings.findOne().select('clientSegmentRules').lean();
      const rules = mergeClientSegmentRules(doc?.clientSegmentRules);
      res.json({ success: true, data: rules });
    } catch (error) {
      logger.error('[settings/client-segments] GET', error);
      res.status(500).json({ success: false, error: 'Failed to load client segment rules' });
    }
  },
);

router.put(
  '/client-segments',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('clients', 'edit'),
  async (req, res) => {
    try {
      const { valid, error, rules } = validateClientSegmentRules(req.body);
      if (!valid) {
        return res.status(400).json({ success: false, error });
      }

      const { BusinessSettings } = req.businessModels;
      let doc = await BusinessSettings.findOne();
      if (!doc) doc = new BusinessSettings({ branchId: req.user.branchId });
      doc.clientSegmentRules = rules;
      doc.markModified('clientSegmentRules');
      await doc.save();

      res.json({ success: true, data: rules });
    } catch (error) {
      logger.error('[settings/client-segments] PUT', error);
      res.status(500).json({ success: false, error: 'Failed to save client segment rules' });
    }
  },
);

module.exports = router;
