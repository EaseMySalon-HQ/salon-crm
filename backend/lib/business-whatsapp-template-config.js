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
  applyApprovedTemplateToBusinessNotificationSlot,
};
