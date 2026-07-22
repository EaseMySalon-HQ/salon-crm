'use strict';

/**
 * Per-business transactional WhatsApp template slots (connected Gupshup app).
 * Mirrors AdminSettings.notifications.whatsapp for salons with their own WABA.
 */

const databaseManager = require('../config/database-manager');
const gupshupConfig = require('./gupshup-config');
const { buildVariableMappingForSlot } = require('./platform-template-variable-mapping');

async function getBusinessModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('Business', require('../models/Business').schema);
}

/**
 * Load mapped template IDs + variable maps for a business.
 * Returns null when the business has no configured slots.
 */
async function loadBusinessWhatsAppTemplateConfig(businessId) {
  if (!businessId) return null;
  const Business = await getBusinessModel();
  const biz = await Business.findById(businessId)
    .select('settings.whatsappNotificationSettings.templates settings.whatsappNotificationSettings.templateVariables')
    .lean();
  const ws = biz?.settings?.whatsappNotificationSettings;
  if (!ws) return null;
  const templates = ws.templates && typeof ws.templates === 'object' ? ws.templates : {};
  const hasAny = Object.values(templates).some((id) => id && String(id).trim());
  if (!hasAny) return null;
  return {
    templates,
    templateVariables:
      ws.templateVariables && typeof ws.templateVariables === 'object' ? ws.templateVariables : {},
  };
}

/**
 * Whether transactional sends for this business should use per-business template
 * slots (connected own app) instead of global AdminSettings.
 */
async function shouldUseBusinessTemplateConfig(businessId) {
  if (!businessId) return false;
  const account = await gupshupConfig.loadAccount(businessId);
  if (!gupshupConfig.isBusinessAppUsable(account)) return false;
  const cfg = await loadBusinessWhatsAppTemplateConfig(businessId);
  return Boolean(cfg);
}

/**
 * Write approved template id + auto variable mapping onto the business document.
 */
/**
 * Whether linking a Gupshup app should clear tenant template provider state.
 * True when the app id or sender number changes, or when migrating off legacy Meta.
 *
 * @param {object|null|undefined} previousAccount
 * @param {string|{ appId?: string, sourceNumber?: string }} newAppIdOrOpts
 */
function shouldResetBusinessWhatsAppTemplatesOnAppLink(previousAccount, newAppIdOrOpts) {
  const opts =
    typeof newAppIdOrOpts === 'object' && newAppIdOrOpts !== null
      ? newAppIdOrOpts
      : { appId: newAppIdOrOpts };
  const prevAppId = String(previousAccount?.gupshupAppId || '').trim();
  const nextAppId = String(opts.appId || '').trim();
  const prevSource = String(previousAccount?.sourceNumber || previousAccount?.phoneE164 || '')
    .replace(/\D/g, '');
  const nextSource = String(opts.sourceNumber || '').replace(/\D/g, '');
  if (prevAppId && nextAppId && prevAppId !== nextAppId) return true;
  if (prevSource && nextSource && prevSource !== nextSource) return true;
  if (previousAccount?.provider === 'meta') return true;
  return false;
}

/**
 * Clear Gupshup/Meta template ids, slot mappings, and notification config for a
 * business after a new WABA app is linked. Keeps local draft content/components.
 */
async function resetBusinessWhatsAppTemplatesForNewApp(businessId) {
  if (!businessId) return { templatesReset: 0, notificationSlotsCleared: false };

  const main = await databaseManager.getMainConnection();
  const Template = main.model('WhatsAppTemplate', require('../models/WhatsAppTemplate').schema);
  const Business = await getBusinessModel();

  const templateResult = await Template.updateMany(
    { businessId },
    {
      $set: {
        status: 'draft',
        gupshupTemplateId: null,
        metaTemplateId: null,
        slotKey: null,
        rejectionReason: null,
        qualityScore: null,
        previousCategory: null,
        detectedCorrectCategory: null,
        submittedAt: null,
        approvedAt: null,
        lastSyncedAt: null,
        detectedCorrectCategoryAt: null,
        lastComponentsUpdateAt: null,
      },
    }
  );

  const biz = await Business.findById(businessId);
  let notificationSlotsCleared = false;
  if (biz) {
    biz.settings = biz.settings || {};
    biz.settings.whatsappNotificationSettings = biz.settings.whatsappNotificationSettings || {};
    const ws = biz.settings.whatsappNotificationSettings;
    const hadSlots =
      (ws.templates && Object.keys(ws.templates).length > 0) ||
      (ws.templateVariables && Object.keys(ws.templateVariables).length > 0);
    ws.templates = {};
    ws.templateVariables = {};
    if (hadSlots) {
      biz.markModified('settings.whatsappNotificationSettings');
      await biz.save();
      notificationSlotsCleared = true;
    }
  }

  return {
    templatesReset: templateResult.modifiedCount || 0,
    notificationSlotsCleared,
  };
}

async function applyApprovedTemplateToBusinessNotificationSlot(businessId, slotKey, tpl) {
  if (!businessId || !slotKey || !tpl || tpl.status !== 'approved' || !tpl.gupshupTemplateId) {
    return {
      applied: false,
      reason: 'Template must be approved with a Gupshup ID to link notification settings',
    };
  }

  const Business = await getBusinessModel();
  const biz = await Business.findById(businessId);
  if (!biz) {
    return { applied: false, reason: 'Business not found' };
  }

  biz.settings = biz.settings || {};
  biz.settings.whatsappNotificationSettings = biz.settings.whatsappNotificationSettings || {};
  const ws = biz.settings.whatsappNotificationSettings;
  ws.templates = ws.templates && typeof ws.templates === 'object' ? { ...ws.templates } : {};
  ws.templateVariables =
    ws.templateVariables && typeof ws.templateVariables === 'object' ? { ...ws.templateVariables } : {};

  ws.templates[slotKey] = String(tpl.gupshupTemplateId).trim();
  ws.templateVariables[slotKey] = buildVariableMappingForSlot(slotKey, tpl.components);
  biz.markModified('settings.whatsappNotificationSettings');
  await biz.save();

  return {
    applied: true,
    slotKey,
    templateId: ws.templates[slotKey],
    variableMapping: ws.templateVariables[slotKey],
  };
}

module.exports = {
  loadBusinessWhatsAppTemplateConfig,
  shouldUseBusinessTemplateConfig,
  shouldResetBusinessWhatsAppTemplatesOnAppLink,
  resetBusinessWhatsAppTemplatesForNewApp,
  applyApprovedTemplateToBusinessNotificationSlot,
};
