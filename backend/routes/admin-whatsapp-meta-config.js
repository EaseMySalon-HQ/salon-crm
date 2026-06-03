/**
 * Platform-admin routes for the WhatsApp / Meta Cloud API config singleton.
 *
 * Mounted at /api/admin/whatsapp-meta-config. All endpoints require an
 * authenticated platform admin with `settings.update` permission.
 *
 * Secrets are never echoed back. The GET endpoint only returns booleans
 * (`appSecretSet`, `verifyTokenSet`) plus the non-sensitive fields.
 */

'use strict';

const express = require('express');
const axios = require('axios');
const router = express.Router();

const { authenticateAdmin, checkAdminPermission } = require('../middleware/admin-auth');
const { setupMainDatabase } = require('../middleware/business-db');
const { logger } = require('../utils/logger');

const {
  getMetaConfig,
  getMetaConfigPublic,
  setMetaConfig,
} = require('../lib/whatsapp-meta-config');

router.use(authenticateAdmin, setupMainDatabase);

router.get(
  '/',
  checkAdminPermission('settings', 'view'),
  async (req, res) => {
    try {
      const data = await getMetaConfigPublic();
      return res.json({ success: true, data });
    } catch (err) {
      logger.error('[admin-whatsapp-meta-config] GET failed:', err);
      return res
        .status(500)
        .json({ success: false, error: 'Failed to load Meta configuration' });
    }
  }
);

router.put(
  '/',
  checkAdminPermission('settings', 'update'),
  async (req, res) => {
    try {
      const body = req.body || {};
      const allowed = ['appId', 'configId', 'webhookCallbackUrl', 'appSecret', 'verifyToken'];
      const update = {};
      for (const k of allowed) {
        if (k in body) update[k] = body[k];
      }
      await setMetaConfig(update, {
        actorId: req.admin?._id || null,
        actorEmail: req.admin?.email || null,
      });
      const data = await getMetaConfigPublic();
      return res.json({ success: true, data });
    } catch (err) {
      logger.error('[admin-whatsapp-meta-config] PUT failed:', err);
      return res
        .status(500)
        .json({ success: false, error: 'Failed to save Meta configuration' });
    }
  }
);

/**
 * Sanity-check the saved App ID + App Secret against Meta. Hits
 * `/{graphVersion}/<APP_ID>?access_token=<APP_ID>|<APP_SECRET>` which simply
 * returns the public app metadata when both are correct.
 */
router.post(
  '/verify',
  checkAdminPermission('settings', 'update'),
  async (req, res) => {
    try {
      const cfg = await getMetaConfig({ skipCache: true });
      if (!cfg.appId || !cfg.appSecret) {
        return res.status(400).json({
          success: false,
          error: 'Both App ID and App Secret must be saved before verifying.',
        });
      }
      const url = `https://graph.facebook.com/${cfg.graphVersion}/${cfg.appId}`;
      const appAccessToken = `${cfg.appId}|${cfg.appSecret}`;
      const { data } = await axios.get(url, {
        params: { access_token: appAccessToken, fields: 'id,name,namespace' },
        timeout: 10000,
      });
      return res.json({
        success: true,
        data: {
          ok: true,
          app: { id: data?.id || null, name: data?.name || null, namespace: data?.namespace || null },
        },
      });
    } catch (err) {
      const meta = err?.response?.data?.error;
      return res.status(400).json({
        success: false,
        error: meta?.message || err?.message || 'Verification failed',
        details: meta || null,
      });
    }
  }
);

module.exports = router;
