/**
 * Link a Gupshup WABA app to a business (shared by admin + tenant connect routes).
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { encrypt } = require('./crypto');
const gupshupAuth = require('./gupshup-auth');
const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const { resolveGupshupWebhookUrl } = require('./public-backend-url');
const {
  resetBusinessWhatsAppTemplatesForNewApp,
  shouldResetBusinessWhatsAppTemplatesOnAppLink,
} = require('./business-whatsapp-template-config');
const { logger } = require('../utils/logger');

async function getAccountModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema);
}

async function getAdminSettingsModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('AdminSettings', require('../models/AdminSettings').schema);
}

async function resolveWebhookUrl() {
  const AdminSettings = await getAdminSettingsModel();
  const settings = await AdminSettings.getSettings();
  const adminWebhookUrl = settings?.notifications?.whatsapp?.gupshupWebhookUrl || '';
  return resolveGupshupWebhookUrl({ adminWebhookUrl });
}

/**
 * @param {object} args
 * @param {string|object} args.businessId
 * @param {string} args.appId
 * @param {string} [args.appName]
 * @param {string} args.sourceNumber
 */
async function linkGupshupApp({ businessId, appId, appName, sourceNumber }) {
  const health = await gupshupWhatsApp.getWabaHealth({ appId });
  if (!health.success) {
    return {
      success: false,
      error: 'Gupshup app validation failed (health check)',
      details: health.error,
    };
  }

  let appToken;
  try {
    appToken = await gupshupAuth.getAppToken(appId, { forceRefresh: true });
  } catch (err) {
    return { success: false, error: 'Could not obtain app access token', details: err?.message };
  }

  const Account = await getAccountModel();
  const previousAccount = await Account.findOne({ businessId }).lean();
  const shouldResetTemplates = shouldResetBusinessWhatsAppTemplatesOnAppLink(previousAccount, {
    appId,
    sourceNumber,
  });

  const wabaInfo = await gupshupWhatsApp.getWabaInfo({ appId });
  const wabaFields = {};
  if (wabaInfo.success && wabaInfo.data) {
    const w = wabaInfo.data;
    if (w.wabaId) wabaFields.wabaId = String(w.wabaId);
    if (w.phoneId) wabaFields.phoneNumberId = String(w.phoneId);
    if (w.verifiedName) wabaFields.displayName = String(w.verifiedName);
  }

  const account = await Account.findOneAndUpdate(
    { businessId },
    {
      $set: {
        provider: 'gupshup',
        gupshupAppId: String(appId),
        gupshupAppName: appName ? String(appName) : null,
        sourceNumber: String(sourceNumber).replace(/\D/g, ''),
        phoneE164: String(sourceNumber).replace(/\D/g, ''),
        appTokenCipher: encrypt(appToken),
        status: 'connected',
        mode: 'live',
        connectedAt: new Date(),
        disconnectedAt: null,
        lastErrorMessage: null,
        ...wabaFields,
      },
      $setOnInsert: { businessId },
    },
    { upsert: true, new: true }
  );

  let subscription = { ok: false, skipped: true };
  const webhook = await resolveWebhookUrl();
  if (webhook.url) {
    const sub = await gupshupWhatsApp.setSubscription({
      appId,
      url: webhook.url,
      modes: 'ALL',
      tag: `salon-crm-${String(businessId)}`,
      secret: process.env.GUPSHUP_WEBHOOK_SECRET || null,
    });
    subscription = sub.success ? { ok: true, url: webhook.url } : { ok: false, error: sub.error };
  } else {
    subscription = { ok: false, skipped: true, reason: 'No webhook URL resolved' };
  }

  if (!subscription.ok) {
    logger.warn('[gupshup-link] app linked but subscription failed:', subscription);
  }

  let templatesReset = null;
  if (shouldResetTemplates) {
    try {
      templatesReset = await resetBusinessWhatsAppTemplatesForNewApp(businessId);
      logger.info(
        '[gupshup-link] reset WhatsApp templates after app link business=%s templates=%s',
        String(businessId),
        templatesReset.templatesReset
      );
    } catch (err) {
      logger.warn('[gupshup-link] template reset failed:', err?.message || err);
    }
  }

  return {
    success: true,
    account,
    subscription,
    templatesReset,
  };
}

async function unlinkGupshupApp(businessId) {
  const Account = await getAccountModel();
  const previousAccount = await Account.findOne({ businessId }).lean();
  await Account.updateOne(
    { businessId, provider: 'gupshup' },
    {
      $set: {
        status: 'disconnected',
        disconnectedAt: new Date(),
        appTokenCipher: null,
      },
    }
  );

  let templatesReset = null;
  if (previousAccount?.gupshupAppId || previousAccount?.provider === 'gupshup') {
    try {
      templatesReset = await resetBusinessWhatsAppTemplatesForNewApp(businessId);
      logger.info(
        '[gupshup-link] reset WhatsApp templates after unlink business=%s templates=%s',
        String(businessId),
        templatesReset.templatesReset
      );
    } catch (err) {
      logger.warn('[gupshup-link] template reset on unlink failed:', err?.message || err);
    }
  }

  return { success: true, templatesReset };
}

module.exports = { linkGupshupApp, unlinkGupshupApp, resolveWebhookUrl };
