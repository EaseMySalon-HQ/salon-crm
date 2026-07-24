/**
 * Platform-admin routes for Gupshup Partner Portal onboarding (admin-managed).
 *
 * Mounted at /api/admin/gupshup. All endpoints require an authenticated
 * platform admin. No salon-facing signup — an admin links an existing Gupshup
 * app (already created on the partner account) to a business here.
 *
 * Never echoes tokens/secrets. App access tokens are encrypted at rest on
 * WhatsAppAccount.appTokenCipher (backend/lib/crypto.js).
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateAdmin, checkAdminPermission } = require('../middleware/admin-auth');
const { setupMainDatabase } = require('../middleware/business-db');
const databaseManager = require('../config/database-manager');
const gupshupAuth = require('../lib/gupshup-auth');
const gupshupConfig = require('../lib/gupshup-config');
const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const { resolveGupshupWebhookUrl, normalizeGupshupWebhookUrl } = require('../lib/public-backend-url');
const { linkGupshupApp, unlinkGupshupApp } = require('../lib/gupshup-link-app');
const { reconcileAllSubscriptions } = require('../lib/gupshup-subscription-reconcile');
const {
  buildGupshupApplyFields,
  extractTemplateList,
  remoteElementName,
  remoteTemplateId,
  remoteTemplateStatus,
  normalizeGupshupTemplateRecord,
} = require('../lib/gupshup-template-apply-fields');
const {
  PLATFORM_TEMPLATE_CATALOG,
  NOTIFICATION_SLOT_KEYS,
  catalogByElementName,
  catalogEntryToApplyPayload,
} = require('../lib/gupshup-platform-template-catalog');
const {
  buildVariableMappingForSlot,
} = require('../lib/platform-template-variable-mapping');
const {
  whatsappTemplateBodySchema,
  whatsappTemplateHeaderMediaUploadSchema,
} = require('../validation/schemas');
const {
  parseHeaderMediaUploadInput,
  saveWhatsappTemplateHeaderMedia,
} = require('../lib/whatsapp-template-header-media');
const { buildGupshupMessageEnvelope } = require('../lib/platform-template-send-payload');
const { logger } = require('../utils/logger');

function firstZodMessage(error, fallback) {
  const list = (error && (error.issues || error.errors)) || [];
  return list[0]?.message || fallback;
}

router.use(authenticateAdmin, setupMainDatabase);

async function getAccountModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema);
}

async function getAdminSettingsModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('AdminSettings', require('../models/AdminSettings').schema);
}

/** Resolve webhook URL (env → admin DB override → computed base). */
async function resolveWebhook() {
  const AdminSettings = await getAdminSettingsModel();
  const settings = await AdminSettings.getSettings();
  const adminWebhookUrl = settings?.notifications?.whatsapp?.gupshupWebhookUrl || '';
  return resolveGupshupWebhookUrl({ adminWebhookUrl });
}

/** Redacted platform/provider config for the admin UI. */
router.get('/config', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const platform = await gupshupConfig.loadPlatformConfig();
    const AdminSettings = await getAdminSettingsModel();
    const settings = await AdminSettings.getSettings();
    const wa = settings?.notifications?.whatsapp || {};
    const webhook = await resolveWebhook();
    const partnerConfigured = await gupshupAuth.hasPartnerCredentialsAsync();
    const partnerSource = gupshupAuth.hasPartnerCredentials()
      ? 'env'
      : wa.gupshupPartnerEmail && wa.gupshupClientSecretCipher
        ? 'admin'
        : null;
    return res.json({
      success: true,
      data: {
        activeProvider: 'gupshup',
        partnerConfigured,
        partnerSource,
        gupshupPartnerEmail: wa.gupshupPartnerEmail || '',
        hasPartnerSecret: Boolean(wa.gupshupClientSecretCipher),
        platformAppId: platform.appId,
        platformAppName: platform.appName,
        platformSourceNumber: platform.source,
        platformSource: gupshupConfig.isPlatformConfigured()
          ? 'env'
          : wa.gupshupAppId && wa.gupshupSourceNumber
            ? 'admin'
            : null,
        gupshupAppId: wa.gupshupAppId || '',
        gupshupAppName: wa.gupshupAppName || '',
        gupshupSourceNumber: wa.gupshupSourceNumber || '',
        webhookUrl: webhook.url,
        webhookSource: webhook.source,
        gupshupWebhookUrl: wa.gupshupWebhookUrl || '',
      },
    });
  } catch (err) {
    logger.error('[admin-gupshup] config failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to load Gupshup config' });
  }
});

/** Register (or refresh) the Gupshup delivery webhook on the shared platform app. */
router.post(
  '/platform/register-webhook',
  checkAdminPermission('settings', 'update'),
  async (_req, res) => {
    try {
      const platform = await gupshupConfig.loadPlatformConfig();
      if (!platform.appId) {
        return res.status(400).json({
          success: false,
          error: 'Shared platform Gupshup app is not configured (App ID + sender number).',
        });
      }
      const webhook = await resolveWebhook();
      if (!webhook.url) {
        return res.status(400).json({ success: false, error: 'Could not resolve webhook URL' });
      }
      const sub = await gupshupWhatsApp.ensureSubscription({
        appId: platform.appId,
        url: webhook.url,
        modes: 'ALL',
        tag: `salon-crm-platform-${platform.appId}`,
        secret: process.env.GUPSHUP_WEBHOOK_SECRET || null,
      });
      if (!sub.success) {
        const errMsg =
          typeof sub.error === 'string'
            ? sub.error
            : sub.error?.message || sub.error?.error || JSON.stringify(sub.error || {});
        return res.status(sub.status === 429 ? 429 : 400).json({
          success: false,
          error:
            sub.status === 429
              ? 'Gupshup subscription rate limit — wait 60 seconds and try again'
              : 'Gupshup rejected webhook registration',
          details: sub.error,
          message: errMsg,
          webhookUrl: webhook.url,
        });
      }
      return res.json({
        success: true,
        data: {
          appId: platform.appId,
          webhookUrl: webhook.url,
          webhookSource: webhook.source,
          modes: 'ALL',
          alreadyRegistered: Boolean(sub.alreadyRegistered),
          updated: Boolean(sub.updated),
        },
      });
    } catch (err) {
      logger.error('[admin-gupshup] platform register-webhook failed:', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to register platform webhook' });
    }
  }
);

/** Check whether Gupshup already has the resolved webhook URL registered (read-only). */
router.get(
  '/platform/subscription-status',
  checkAdminPermission('settings', 'view'),
  async (_req, res) => {
    try {
      const platform = await gupshupConfig.loadPlatformConfig();
      const webhook = await resolveWebhook();
      if (!platform.appId) {
        return res.json({
          success: true,
          data: { configured: false, webhookUrl: webhook.url || null, registered: false },
        });
      }
      const listed = await gupshupWhatsApp.listSubscriptions({ appId: platform.appId });
      if (!listed.success) {
        const msg =
          listed.status === 429
            ? 'Gupshup rate limit — wait 60 seconds before checking again'
            : typeof listed.error === 'string'
              ? listed.error
              : listed.error?.message || 'Could not load subscriptions';
        return res.json({
          success: true,
          data: {
            configured: true,
            webhookUrl: webhook.url,
            registered: false,
            checkError: msg,
            subscriptions: [],
          },
        });
      }
      const match = gupshupWhatsApp.findActiveSubscriptionForUrl(listed.data, webhook.url);
      return res.json({
        success: true,
        data: {
          configured: true,
          webhookUrl: webhook.url,
          registered: Boolean(match),
          activeSubscription: match,
          subscriptions: (listed.data || []).map((s) => ({
            url: s.url,
            active: s.active !== false,
            tag: s.tag,
            version: s.version,
          })),
        },
      });
    } catch (err) {
      logger.error('[admin-gupshup] subscription-status failed:', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to check subscription status' });
    }
  }
);

/** Recent inbound webhook events (dev diagnostics — in-memory ring buffer). */
router.get('/webhook/recent', checkAdminPermission('settings', 'view'), async (_req, res) => {
  try {
    const getRecentWebhookEvents = require('../routes/gupshup-webhook').getRecentWebhookEvents;
    const main = await databaseManager.getMainConnection();
    const PlatformMessage = main.model(
      'PlatformWhatsAppMessage',
      require('../models/PlatformWhatsAppMessage').schema
    );
    const lastInbound = await PlatformMessage.findOne({ direction: 'inbound' })
      .sort({ timestamp: -1 })
      .select('recipientPhone inboundText timestamp status')
      .lean();
    return res.json({
      success: true,
      data: {
        events: typeof getRecentWebhookEvents === 'function' ? getRecentWebhookEvents() : [],
        lastPlatformInbound: lastInbound,
        hints: {
          secretConfigured: Boolean(process.env.GUPSHUP_WEBHOOK_SECRET),
          ipAllowlistConfigured: Boolean(process.env.GUPSHUP_WEBHOOK_IPS),
        },
      },
    });
  } catch (err) {
    logger.error('[admin-gupshup] webhook recent failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to load webhook diagnostics' });
  }
});

/** Save admin-managed partner creds, shared platform app + webhook URL override. */
router.put('/config', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const {
      gupshupWebhookUrl,
      gupshupAppId,
      gupshupAppName,
      gupshupSourceNumber,
      gupshupPartnerEmail,
      gupshupClientSecret,
    } = req.body || {};
    const AdminSettings = await getAdminSettingsModel();
    const settings = await AdminSettings.getSettings();
    settings.notifications = settings.notifications || {};
    settings.notifications.whatsapp = settings.notifications.whatsapp || {};
    const wa = settings.notifications.whatsapp;

    if (gupshupPartnerEmail != null) {
      wa.gupshupPartnerEmail = String(gupshupPartnerEmail).trim();
    }
    if (gupshupClientSecret != null && String(gupshupClientSecret).trim()) {
      try {
        wa.gupshupClientSecretCipher = gupshupAuth.encryptPartnerSecret(gupshupClientSecret);
      } catch (err) {
        logger.error('[admin-gupshup] secret encrypt failed:', err?.message || err);
        return res.status(400).json({
          success: false,
          error: 'Could not encrypt client secret — set WHATSAPP_TOKEN_ENC_KEY on the backend',
        });
      }
      gupshupAuth.invalidateCache();
    }

    const previousWebhookUrl = String(wa.gupshupWebhookUrl || '').trim();
    let webhookUrlChanged = false;
    if (gupshupWebhookUrl != null) {
      const trimmed = String(gupshupWebhookUrl).trim();
      const nextWebhookUrl = trimmed ? normalizeGupshupWebhookUrl(trimmed) : '';
      webhookUrlChanged = nextWebhookUrl !== previousWebhookUrl;
      wa.gupshupWebhookUrl = nextWebhookUrl;
    }
    if (gupshupAppId != null) {
      const nextAppId = String(gupshupAppId).trim();
      if (nextAppId !== String(wa.gupshupAppId || '').trim()) {
        wa.gupshupAppTokenCipher = '';
      }
      wa.gupshupAppId = nextAppId;
    }
    if (gupshupAppName != null) {
      wa.gupshupAppName = String(gupshupAppName).trim();
    }
    if (gupshupSourceNumber != null) {
      wa.gupshupSourceNumber = String(gupshupSourceNumber).replace(/\D/g, '');
    }
    await settings.save();

    const platform = await gupshupConfig.loadPlatformConfig();
    const partnerConfigured = await gupshupAuth.hasPartnerCredentialsAsync();
    if (platform.appId && platform.source && partnerConfigured) {
      gupshupConfig.resolvePlatformSender().catch((err) => {
        logger.warn('[admin-gupshup] platform token warm failed:', err?.message || err);
      });
    }
    const webhook = resolveGupshupWebhookUrl({ adminWebhookUrl: wa.gupshupWebhookUrl });

    // If the admin changed the webhook URL (typically a rotated Cloudflare
    // tunnel), push it out to every connected Gupshup app so their
    // subscription no longer points at a dead host. Non-blocking failure —
    // we still return the saved config; admins can retry from the UI.
    let subscriptionReconcile = null;
    if (webhookUrlChanged && partnerConfigured) {
      try {
        subscriptionReconcile = await reconcileAllSubscriptions({
          adminWebhookUrl: wa.gupshupWebhookUrl,
        });
      } catch (err) {
        logger.warn(
          '[admin-gupshup] subscription reconcile after config save failed:',
          err?.message || err
        );
        subscriptionReconcile = { error: err?.message || 'reconcile failed' };
      }
    }

    const partnerSource = gupshupAuth.hasPartnerCredentials()
      ? 'env'
      : wa.gupshupPartnerEmail && wa.gupshupClientSecretCipher
        ? 'admin'
        : null;
    return res.json({
      success: true,
      data: {
        partnerConfigured,
        partnerSource,
        gupshupPartnerEmail: wa.gupshupPartnerEmail,
        hasPartnerSecret: Boolean(wa.gupshupClientSecretCipher),
        platformAppId: platform.appId,
        platformAppName: platform.appName,
        platformSourceNumber: platform.source,
        platformSource: gupshupConfig.isPlatformConfigured()
          ? 'env'
          : wa.gupshupAppId && wa.gupshupSourceNumber
            ? 'admin'
            : null,
        gupshupAppId: wa.gupshupAppId,
        gupshupAppName: wa.gupshupAppName,
        gupshupSourceNumber: wa.gupshupSourceNumber,
        webhookUrl: webhook.url,
        webhookSource: webhook.source,
        gupshupWebhookUrl: wa.gupshupWebhookUrl,
        subscriptionReconcile,
      },
    });
  } catch (err) {
    logger.error('[admin-gupshup] config save failed:', err?.message || err);
    const message =
      err?.name === 'ValidationError'
        ? err.message
        : err?.message || 'Failed to save Gupshup config';
    return res.status(500).json({ success: false, error: message });
  }
});

/**
 * Force-refresh every connected app's Gupshup subscription so it points at
 * our currently-resolved public webhook URL. Idempotent and safe to call
 * whenever a tunnel URL rotates without changing the admin setting.
 */
router.post('/webhook/reconcile', checkAdminPermission('settings', 'update'), async (_req, res) => {
  try {
    const result = await reconcileAllSubscriptions();
    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[admin-gupshup] webhook reconcile failed:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to reconcile' });
  }
});

async function resolvePlatformAppId() {
  const platform = await gupshupConfig.loadPlatformConfig();
  if (!platform.appId) {
    throw new Error('Shared platform Gupshup app is not configured');
  }
  return platform.appId;
}

/** List templates on the shared platform Gupshup app (live from API). */
router.get('/templates', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const appId = await resolvePlatformAppId();
    const result = await gupshupWhatsApp.listTemplates({ appId });
    if (!result.success) {
      return res.status(400).json({ success: false, error: 'Could not list platform templates', details: result.error });
    }
    const remoteList = extractTemplateList(result.data);
    const catalog = catalogByElementName();
    const enriched = remoteList.map((remote) => {
      const elementName = remoteElementName(remote);
      const catalogEntry = catalog.get(elementName);
      return {
        id: remoteTemplateId(remote),
        elementName,
        status: remoteTemplateStatus(remote),
        category: remote.category || null,
        language: remote.language || remote.languageCode || null,
        slotKey: catalogEntry?.slotKey || null,
        rejectionReason: remote.rejectedReason || remote.rejectionReason || null,
      };
    });
    return res.json({
      success: true,
      data: {
        templates: enriched,
        catalog: PLATFORM_TEMPLATE_CATALOG.map((c) => ({
          slotKey: c.slotKey,
          elementName: c.elementName,
          category: c.category,
        })),
      },
    });
  } catch (err) {
    logger.error('[admin-gupshup] templates list failed:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to list platform templates' });
  }
});

/**
 * Submit the built-in transactional template catalog to Gupshup via
 * POST /partner/app/{appId}/templates. Skips elementNames already on the WABA.
 */
router.post('/templates/submit-catalog', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const appId = await resolvePlatformAppId();
    const listResult = await gupshupWhatsApp.listTemplates({ appId });
    const existingNames = new Set();
    if (listResult.success) {
      for (const remote of extractTemplateList(listResult.data)) {
        const name = remoteElementName(remote);
        if (name) existingNames.add(name);
      }
    }

    const submitted = [];
    const skipped = [];
    const failed = [];

    for (const entry of PLATFORM_TEMPLATE_CATALOG) {
      if (existingNames.has(entry.elementName)) {
        skipped.push({ elementName: entry.elementName, reason: 'already exists on WABA' });
        continue;
      }
      const payload = catalogEntryToApplyPayload(entry);
      const submission = await gupshupWhatsApp.applyTemplate({
        appId,
        fields: buildGupshupApplyFields(payload),
      });
      if (submission.success) {
        submitted.push({
          elementName: entry.elementName,
          slotKey: entry.slotKey,
          remoteId:
            submission.data?.template?.id ||
            submission.data?.id ||
            submission.data?.templateId ||
            null,
        });
      } else {
        failed.push({
          elementName: entry.elementName,
          slotKey: entry.slotKey,
          error: submission.error?.message || submission.error || 'submit failed',
        });
      }
    }

    return res.json({ success: true, data: { submitted, skipped, failed } });
  } catch (err) {
    logger.error('[admin-gupshup] submit-catalog failed:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to submit template catalog' });
  }
});

/**
 * Pull approved platform templates from Gupshup and wire template IDs +
 * default variable mappings into AdminSettings (notification slots).
 */
router.post('/templates/sync-slots', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const appId = await resolvePlatformAppId();
    const listResult = await gupshupWhatsApp.listTemplates({ appId });
    if (!listResult.success) {
      return res.status(400).json({ success: false, error: 'Could not list platform templates', details: listResult.error });
    }

    const AdminSettings = await getAdminSettingsModel();
    const settings = await AdminSettings.getSettings();
    settings.notifications = settings.notifications || {};
    settings.notifications.whatsapp = settings.notifications.whatsapp || {};
    const wa = settings.notifications.whatsapp;
    wa.templates = wa.templates || {};
    wa.templateVariables = wa.templateVariables || {};

    const linked = [];
    const pending = [];
    const unmatched = [];

    const PlatformTemplate = await getPlatformTemplateModel();
    const localTemplates = await PlatformTemplate.find({ slotKey: { $ne: null } }).lean();
    const slotByElementName = new Map();
    for (const entry of PLATFORM_TEMPLATE_CATALOG) {
      slotByElementName.set(entry.elementName, entry.slotKey);
    }
    for (const lt of localTemplates) {
      if (lt.slotKey) slotByElementName.set(lt.name, lt.slotKey);
    }

    for (const remote of extractTemplateList(listResult.data)) {
      const elementName = remoteElementName(remote);
      const slotKey = slotByElementName.get(elementName);
      if (!slotKey) continue;

      const status = remoteTemplateStatus(remote);
      const templateId = remoteTemplateId(remote);
      if (status === 'APPROVED' && templateId) {
        wa.templates[slotKey] = templateId;
        const components = componentsForElementName(elementName, localTemplates);
        wa.templateVariables[slotKey] = buildVariableMappingForSlot(slotKey, components);
        linked.push({ slotKey, elementName, templateId, status });
        await PlatformTemplate.updateOne(
          { name: elementName },
          {
            $set: {
              gupshupTemplateId: templateId,
              status: 'approved',
              lastSyncedAt: new Date(),
              approvedAt: new Date(),
            },
          }
        );
      } else {
        pending.push({ slotKey, elementName, templateId, status });
      }
    }

    for (const entry of PLATFORM_TEMPLATE_CATALOG) {
      const found = linked.some((l) => l.slotKey === entry.slotKey) || pending.some((p) => p.slotKey === entry.slotKey);
      if (!found) unmatched.push({ slotKey: entry.slotKey, elementName: entry.elementName });
    }

    await settings.save();

    return res.json({
      success: true,
      data: { linked, pending, unmatched },
    });
  } catch (err) {
    logger.error('[admin-gupshup] sync-slots failed:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to sync template slots' });
  }
});

async function getPlatformTemplateModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('PlatformWhatsAppTemplate', require('../models/PlatformWhatsAppTemplate').schema);
}

async function applyApprovedTemplateToNotificationSlot(slotKey, tpl) {
  if (!slotKey || !tpl || tpl.status !== 'approved' || !tpl.gupshupTemplateId) {
    return { applied: false, reason: 'Template must be approved with a Gupshup ID to link notification settings' };
  }

  const AdminSettings = await getAdminSettingsModel();
  const settings = await AdminSettings.getSettings();
  settings.notifications = settings.notifications || {};
  settings.notifications.whatsapp = settings.notifications.whatsapp || {};
  const wa = settings.notifications.whatsapp;
  wa.templates = wa.templates || {};
  wa.templateVariables = wa.templateVariables || {};

  wa.templates[slotKey] = String(tpl.gupshupTemplateId).trim();
  wa.templateVariables[slotKey] = buildVariableMappingForSlot(slotKey, tpl.components);
  await settings.save();

  return {
    applied: true,
    slotKey,
    templateId: wa.templates[slotKey],
    variableMapping: wa.templateVariables[slotKey],
  };
}

function componentsForElementName(elementName, localTemplates) {
  const localTpl = localTemplates.find((lt) => lt.name === elementName);
  if (localTpl?.components) return localTpl.components;
  const catalogEntry = catalogByElementName().get(elementName);
  if (!catalogEntry) return null;
  return catalogEntryToApplyPayload(catalogEntry).components;
}

function mapRemoteStatus(remoteStatus) {
  const s = String(remoteStatus || '').toUpperCase();
  switch (s) {
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
    case 'FAILED':
    case 'ERROR':
      return 'rejected';
    case 'PAUSED':
      return 'paused';
    case 'DEACTIVATED':
    case 'DISABLED':
      return 'disabled';
    case 'PENDING':
    case 'SUBMITTED':
      return 'pending';
    case 'IN_APPEAL':
      return 'in_appeal';
    case 'FLAGGED':
      return 'flagged';
    default:
      return 'pending';
  }
}

function sanitizeComponents(components) {
  if (!components || typeof components !== 'object') return {};

  let header = null;
  const h = components.header;
  if (h != null && typeof h === 'object') {
    const format = h.format ?? null;
    const text = h.text ?? null;
    const mediaSampleUrl = h.mediaSampleUrl ?? null;
    if (format || text || mediaSampleUrl) {
      header = { format, text, mediaSampleUrl };
    }
  }

  const b = components.body;
  const body =
    b && typeof b === 'object' && typeof b.text === 'string'
      ? {
          text: b.text,
          examples: Array.isArray(b.examples)
            ? b.examples.map((row) => (Array.isArray(row) ? row.map(String) : [String(row ?? '')]))
            : [],
        }
      : null;
  const footer =
    components.footer?.text != null ? { text: String(components.footer.text) } : null;
  const buttons = Array.isArray(components.buttons)
    ? components.buttons.map((btn) => ({
        type: btn.type,
        text: btn.text ?? '',
        url: btn.url ?? null,
        phone: btn.phone ?? null,
        urlExample: btn.urlExample ?? null,
      }))
    : [];
  return { header, body, footer, buttons };
}

/** Platform Template Manager — local drafts + Gupshup API submit/sync. */
router.get('/platform-templates/meta', checkAdminPermission('settings', 'view'), async (req, res) => {
  return res.json({
    success: true,
    data: {
      slotKeys: NOTIFICATION_SLOT_KEYS,
      catalog: PLATFORM_TEMPLATE_CATALOG.map((c) => ({
        slotKey: c.slotKey,
        elementName: c.elementName,
        category: c.category,
      })),
    },
  });
});

router.get('/platform-templates', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const Template = await getPlatformTemplateModel();
    const items = await Template.find().sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: items });
  } catch (err) {
    logger.error('[admin-gupshup] platform-templates list failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to load platform templates' });
  }
});

router.post(
  '/platform-templates/upload-header-media',
  checkAdminPermission('settings', 'update'),
  async (req, res) => {
    try {
      const parsed = whatsappTemplateHeaderMediaUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: firstZodMessage(parsed.error, 'Invalid payload'),
        });
      }

      const decoded = parseHeaderMediaUploadInput(parsed.data.media, {
        format: parsed.data.format,
        contentType: parsed.data.contentType,
      });
      if (decoded.error) {
        return res.status(400).json({ success: false, error: decoded.error });
      }

      const saved = saveWhatsappTemplateHeaderMedia({
        businessId: 'platform',
        buffer: decoded.buffer,
        ext: decoded.ext,
      });
      if (saved.error) {
        return res.status(400).json({ success: false, error: saved.error });
      }

      return res.json({ success: true, data: { url: saved.url } });
    } catch (err) {
      logger.error('[admin-gupshup] platform upload-header-media failed:', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to upload header media' });
    }
  }
);

router.post('/platform-templates', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const parsed = whatsappTemplateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues?.[0]?.message || 'Invalid payload' });
    }
    const { name, language = 'en_US', category, components = {}, publishedToTenantLibrary } = parsed.data;
    const slotKey = req.body?.slotKey ? String(req.body.slotKey).trim() : null;
    const Template = await getPlatformTemplateModel();
    const created = await Template.create({
      name,
      language,
      category: category.toUpperCase(),
      slotKey: slotKey || null,
      components: sanitizeComponents(components),
      status: 'draft',
      publishedToTenantLibrary:
        publishedToTenantLibrary === undefined ? true : publishedToTenantLibrary,
      createdBy: req.admin?._id || null,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, error: 'Template name already exists for this language' });
    }
    logger.error('[admin-gupshup] platform-template create failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

router.put('/platform-templates/:id', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const Template = await getPlatformTemplateModel();
    const tpl = await Template.findById(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (tpl.status !== 'draft' && tpl.status !== 'rejected') {
      return res.status(400).json({ success: false, error: `Cannot edit template in status "${tpl.status}"` });
    }
    const parsed = whatsappTemplateBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues?.[0]?.message || 'Invalid payload' });
    }
    const { name, language, category, components, publishedToTenantLibrary } = parsed.data;
    if (name != null) tpl.name = name;
    if (language != null) tpl.language = language;
    if (category != null) tpl.category = category.toUpperCase();
    if (components != null) tpl.components = sanitizeComponents(components);
    if (req.body?.slotKey !== undefined) {
      tpl.slotKey = req.body.slotKey ? String(req.body.slotKey).trim() : null;
    }
    if (publishedToTenantLibrary !== undefined) {
      tpl.publishedToTenantLibrary = publishedToTenantLibrary;
    }
    await tpl.save();
    return res.json({ success: true, data: tpl });
  } catch (err) {
    logger.error('[admin-gupshup] platform-template update failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to update template' });
  }
});

router.put('/platform-templates/:id/publish', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const Template = await getPlatformTemplateModel();
    const tpl = await Template.findById(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (tpl.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Only approved templates can be published to the tenant library catalog',
      });
    }
    tpl.publishedToTenantLibrary = Boolean(req.body?.publishedToTenantLibrary);
    await tpl.save();
    return res.json({ success: true, data: tpl });
  } catch (err) {
    logger.error('[admin-gupshup] platform-template publish failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to update library visibility' });
  }
});

router.put('/platform-templates/:id/map', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const raw = req.body?.slotKey;
    const slotKey =
      raw === null || raw === undefined || String(raw).trim() === ''
        ? null
        : String(raw).trim();
    if (slotKey && !NOTIFICATION_SLOT_KEYS.includes(slotKey)) {
      return res.status(400).json({ success: false, error: 'Invalid notification slot' });
    }

    const Template = await getPlatformTemplateModel();
    const tpl = await Template.findById(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });

    if (slotKey) {
      await Template.updateMany({ _id: { $ne: tpl._id }, slotKey }, { $set: { slotKey: null } });
    }
    tpl.slotKey = slotKey;
    await tpl.save();

    let notificationLink = null;
    if (slotKey) {
      notificationLink = await applyApprovedTemplateToNotificationSlot(slotKey, tpl.toObject ? tpl.toObject() : tpl);
    }

    return res.json({
      success: true,
      data: tpl,
      notificationLink,
    });
  } catch (err) {
    logger.error('[admin-gupshup] platform-template map failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to map template' });
  }
});

router.delete('/platform-templates/:id', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const Template = await getPlatformTemplateModel();
    const tpl = await Template.findById(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (tpl.status === 'approved' && req.query.force !== '1') {
      return res.status(400).json({
        success: false,
        error: 'Approved templates cannot be deleted locally. Pass ?force=1 to remove the local row only.',
      });
    }
    await tpl.deleteOne();
    return res.json({ success: true });
  } catch (err) {
    logger.error('[admin-gupshup] platform-template delete failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

router.post('/platform-templates/:id/submit', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const Template = await getPlatformTemplateModel();
    const tpl = await Template.findById(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (tpl.status !== 'draft' && tpl.status !== 'rejected') {
      return res.status(400).json({ success: false, error: `Cannot submit template in status "${tpl.status}"` });
    }
    const appId = await resolvePlatformAppId();
    const submission = await gupshupWhatsApp.applyTemplate({
      appId,
      fields: buildGupshupApplyFields(tpl),
    });
    if (!submission.success) {
      const errMsg =
        typeof submission.error === 'string'
          ? submission.error
          : submission.error?.message || 'Gupshup rejected the template submission';
      return res.status(400).json({ success: false, error: errMsg, details: submission.error });
    }
    const remoteId =
      submission.data?.template?.id ||
      submission.data?.id ||
      submission.data?.templateId ||
      null;
    if (remoteId) tpl.gupshupTemplateId = String(remoteId);
    tpl.status = 'pending';
    tpl.submittedAt = new Date();
    tpl.lastSyncedAt = new Date();
    tpl.rejectionReason = null;
    await tpl.save();
    return res.json({ success: true, data: tpl });
  } catch (err) {
    logger.error('[admin-gupshup] platform-template submit failed:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to submit template' });
  }
});

router.post('/platform-templates/:id/sync', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const Template = await getPlatformTemplateModel();
    const tpl = await Template.findById(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (!tpl.gupshupTemplateId) {
      return res.status(400).json({ success: false, error: 'Template has not been submitted to Gupshup yet' });
    }
    const appId = await resolvePlatformAppId();
    const result = await gupshupWhatsApp.getTemplate({ appId, templateId: tpl.gupshupTemplateId });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Sync failed' });
    }
    const remote = normalizeGupshupTemplateRecord(result.data);
    const mapped = mapRemoteStatus(remote.status || remote.templateStatus);
    if (mapped) {
      tpl.status = mapped;
      if (mapped === 'approved' && !tpl.approvedAt) tpl.approvedAt = new Date();
      if (mapped === 'rejected') {
        tpl.rejectionReason = remote.rejectedReason || remote.rejectionReason || tpl.rejectionReason;
      }
    }
    tpl.lastSyncedAt = new Date();
    await tpl.save();
    return res.json({ success: true, data: tpl });
  } catch (err) {
    logger.error('[admin-gupshup] platform-template sync failed:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to sync template' });
  }
});

function bodyPlaceholderCount(text) {
  if (!text || typeof text !== 'string') return 0;
  let max = 0;
  const re = /\{\{(\d+)\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function defaultTestParamsForTemplate(tpl) {
  const examples = tpl.components?.body?.examples?.[0];
  if (Array.isArray(examples) && examples.length) {
    return examples.map((v) => String(v ?? ''));
  }
  const count = bodyPlaceholderCount(tpl.components?.body?.text);
  if (!count) return [];
  return Array.from({ length: count }, (_, i) => `Sample ${i + 1}`);
}

router.post('/platform-templates/:id/test', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const { to, params } = req.body || {};
    const phone = String(to || '').replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      return res.status(400).json({ success: false, error: 'Valid recipient phone is required' });
    }

    const Template = await getPlatformTemplateModel();
    const tpl = await Template.findById(req.params.id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (tpl.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Only approved templates can be test-sent. Sync status from Gupshup first.',
      });
    }
    if (!tpl.gupshupTemplateId) {
      return res.status(400).json({
        success: false,
        error: 'Gupshup template ID missing. Submit and sync this template first.',
      });
    }

    const platformOk = await gupshupConfig.isPlatformConfiguredAsync();
    if (!platformOk) {
      return res.status(400).json({
        success: false,
        error: 'Gupshup platform app is not configured (Admin → Gupshup shared app).',
      });
    }

    const expectedCount = bodyPlaceholderCount(tpl.components?.body?.text);
    let sendParams = Array.isArray(params)
      ? params.map((p) => String(p ?? ''))
      : defaultTestParamsForTemplate(tpl);
    if (expectedCount > 0 && sendParams.length !== expectedCount) {
      return res.status(400).json({
        success: false,
        error: `Template expects ${expectedCount} variable(s); received ${sendParams.length}.`,
      });
    }
    if (expectedCount > 0 && sendParams.some((p) => !String(p).trim())) {
      return res.status(400).json({
        success: false,
        error: 'Provide a value for each template variable.',
      });
    }

    const messageEnvelope = buildGupshupMessageEnvelope(tpl);
    if (messageEnvelope === null) {
      return res.status(400).json({
        success: false,
        error: 'Template header media URL is missing. Upload or paste a public sample URL.',
      });
    }

    const result = await gupshupWhatsApp.sendTemplate({
      businessId: null,
      to: phone,
      templateId: tpl.gupshupTemplateId,
      params: sendParams,
      message: messageEnvelope,
    });
    if (!result.success) {
      const errMsg =
        typeof result.error === 'string'
          ? result.error
          : result.error?.message || result.error?.status || 'Gupshup send failed';
      return res.status(400).json({ success: false, error: errMsg, details: result.error });
    }
    return res.json({
      success: true,
      data: { messageId: result.messageId || null, to: phone, templateId: tpl.gupshupTemplateId },
    });
  } catch (err) {
    logger.error('[admin-gupshup] platform-template test failed:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Test send failed' });
  }
});

/** Import built-in catalog as local draft rows (does not submit to Gupshup). */
router.post('/platform-templates/import-catalog', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const Template = await getPlatformTemplateModel();
    const imported = [];
    const skipped = [];
    for (const entry of PLATFORM_TEMPLATE_CATALOG) {
      const exists = await Template.findOne({ name: entry.elementName, language: entry.language });
      if (exists) {
        skipped.push(entry.elementName);
        continue;
      }
      const payload = catalogEntryToApplyPayload(entry);
      const doc = await Template.create({
        name: entry.elementName,
        language: entry.language,
        category: entry.category,
        slotKey: entry.slotKey,
        components: payload.components,
        status: 'draft',
        createdBy: req.admin?._id || null,
      });
      imported.push(String(doc._id));
    }
    return res.json({ success: true, data: { imported: imported.length, skipped } });
  } catch (err) {
    logger.error('[admin-gupshup] import-catalog failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to import catalog' });
  }
});

/** Submit all draft/rejected platform templates to Gupshup. */
router.post('/platform-templates/submit-all', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const Template = await getPlatformTemplateModel();
    const appId = await resolvePlatformAppId();
    const drafts = await Template.find({ status: { $in: ['draft', 'rejected'] } });
    const submitted = [];
    const failed = [];
    for (const tpl of drafts) {
      const submission = await gupshupWhatsApp.applyTemplate({
        appId,
        fields: buildGupshupApplyFields(tpl),
      });
      if (submission.success) {
        const remoteId =
          submission.data?.template?.id ||
          submission.data?.id ||
          submission.data?.templateId ||
          null;
        if (remoteId) tpl.gupshupTemplateId = String(remoteId);
        tpl.status = 'pending';
        tpl.submittedAt = new Date();
        tpl.lastSyncedAt = new Date();
        tpl.rejectionReason = null;
        await tpl.save();
        submitted.push(tpl.name);
      } else {
        failed.push({ name: tpl.name, error: submission.error?.message || submission.error });
      }
    }
    return res.json({ success: true, data: { submitted, failed } });
  } catch (err) {
    logger.error('[admin-gupshup] submit-all failed:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to submit templates' });
  }
});

/** List apps on the partner account (for the admin picker). */
router.get('/apps', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const result = await gupshupWhatsApp.listPartnerApps();
    if (!result.success) {
      return res.status(400).json({ success: false, error: 'Could not list partner apps', details: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (err) {
    logger.error('[admin-gupshup] apps failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to list partner apps' });
  }
});

/**
 * Link an existing Gupshup app to a business. Validates the app via health,
 * fetches + encrypts the app token, stores it on WhatsAppAccount, and registers
 * the webhook subscription for this app.
 */
router.post('/link', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const { businessId, appId, appName, sourceNumber } = req.body || {};
    if (!businessId || !appId || !sourceNumber) {
      return res.status(400).json({
        success: false,
        error: 'businessId, appId and sourceNumber are required',
      });
    }

    const result = await linkGupshupApp({ businessId, appId, appName, sourceNumber });
    if (!result.success) {
      return res.status(400).json(result);
    }
    const account = result.account;

    return res.json({
      success: true,
      data: {
        businessId: String(businessId),
        appId: account.gupshupAppId,
        appName: account.gupshupAppName,
        sourceNumber: account.sourceNumber,
        status: account.status,
        subscription: result.subscription,
        templatesReset: result.templatesReset,
      },
    });
  } catch (err) {
    logger.error('[admin-gupshup] link failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to link Gupshup app' });
  }
});

/** Disconnect a business's Gupshup app. */
router.post('/unlink', checkAdminPermission('settings', 'update'), async (req, res) => {
  try {
    const { businessId } = req.body || {};
    if (!businessId) {
      return res.status(400).json({ success: false, error: 'businessId is required' });
    }
    await unlinkGupshupApp(businessId);
    return res.json({ success: true });
  } catch (err) {
    logger.error('[admin-gupshup] unlink failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to unlink Gupshup app' });
  }
});

/** Current Gupshup connection status for a business. */
router.get('/status/:businessId', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const Account = await getAccountModel();
    const account = await Account.findOne({ businessId: req.params.businessId })
      .select('provider gupshupAppId gupshupAppName sourceNumber status qualityRating messagingLimitTier connectedAt lastSyncAt lastErrorMessage')
      .lean();
    return res.json({ success: true, data: account || null });
  } catch (err) {
    logger.error('[admin-gupshup] status failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to load status' });
  }
});

/** Platform-wide Gupshup message tracking for admin dashboard. */
router.get('/messages/tracking', checkAdminPermission('settings', 'view'), async (req, res) => {
  try {
    const { aggregateAdminTracking, attachBusinessNames } = require('../lib/gupshup-message-analytics');
    const { dateFrom, dateTo } = req.query;
    const summary = await aggregateAdminTracking({ dateFrom, dateTo });
    summary.businessStats = await attachBusinessNames(summary.businessStats);
    return res.json({ success: true, data: summary });
  } catch (err) {
    logger.error('[admin-gupshup] messages/tracking failed:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Failed to fetch tracking data' });
  }
});

router.use('/inbox', require('./admin-gupshup-inbox'));
router.use('/campaigns', require('./admin-gupshup-campaigns'));

module.exports = router;
