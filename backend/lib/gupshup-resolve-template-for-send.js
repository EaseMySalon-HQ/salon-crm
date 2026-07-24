'use strict';

/**
 * Resolve a Gupshup template id for outbound sends on the tenant's connected app
 * or the shared platform WABA. Admin slots often store legacy MSG91 template
 * names (e.g. appointment_confirmation) — map those to Gupshup UUIDs via
 * listTemplates (not GET-by-id alone).
 */

const databaseManager = require('../config/database-manager');
const gupshupConfig = require('./gupshup-config');
const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const {
  extractTemplateList,
  remoteElementName,
  remoteTemplateId,
  remoteTemplateStatus,
  normalizeGupshupTemplateRecord,
} = require('./gupshup-template-apply-fields');

function isGupshupUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

function templateOwnedByApp(remote, appId) {
  if (!remote || !appId) return false;
  let metaAppId = null;
  try {
    metaAppId = JSON.parse(remote.containerMeta || '{}').appId;
  } catch {
    metaAppId = null;
  }
  const recordAppId = String(remote.appId || metaAppId || '').trim();
  return !recordAppId || recordAppId === String(appId).trim();
}

function findApprovedOnApp(list, { templateId, elementName, language }) {
  const wantLang = String(language || '').replace('-', '_');
  const approved = list.filter((raw) => {
    const normalized = normalizeGupshupTemplateRecord(raw);
    if (remoteTemplateStatus(normalized) !== 'APPROVED') return false;
    const name = remoteElementName(normalized);
    const lang = String(normalized.language || normalized.languageCode || '').replace('-', '_');
    if (templateId && remoteTemplateId(normalized) === String(templateId)) return true;
    if (elementName && name === elementName) {
      return !wantLang || !lang || lang === wantLang;
    }
    return false;
  });
  if (!approved.length) return null;
  if (templateId) {
    const byId = approved.find((raw) => remoteTemplateId(raw) === String(templateId));
    if (byId) return byId;
  }
  if (elementName) {
    const byName = approved.find((raw) => remoteElementName(raw) === elementName);
    if (byName) return byName;
  }
  return approved[0];
}

function findOnApp(list, { templateId, elementName, language }) {
  const wantLang = String(language || '').replace('-', '_');
  return (
    list.find((raw) => {
      const normalized = normalizeGupshupTemplateRecord(raw);
      const name = remoteElementName(normalized);
      const lang = String(normalized.language || normalized.languageCode || '').replace('-', '_');
      if (templateId && remoteTemplateId(normalized) === String(templateId)) return true;
      if (elementName && name === elementName) {
        return !wantLang || !lang || lang === wantLang;
      }
      return false;
    }) || null
  );
}

async function loadPlatformTemplateMeta({ templateId, slotKey }) {
  const main = await databaseManager.getMainConnection();
  const PlatformWhatsAppTemplate = main.model(
    'PlatformWhatsAppTemplate',
    require('../models/PlatformWhatsAppTemplate').schema
  );
  let doc = null;
  if (templateId && isGupshupUuid(templateId)) {
    doc = await PlatformWhatsAppTemplate.findOne({ gupshupTemplateId: String(templateId).trim() }).lean();
  }
  if (!doc && templateId && !isGupshupUuid(templateId)) {
    doc = await PlatformWhatsAppTemplate.findOne({ name: String(templateId).trim(), status: 'approved' }).lean();
  }
  if (!doc && slotKey) {
    doc = await PlatformWhatsAppTemplate.findOne({ slotKey, status: 'approved' }).lean();
  }
  return doc;
}

async function resolveSendAppId(businessId) {
  if (businessId) {
    try {
      const account = await gupshupConfig.loadAccount(businessId);
      if (gupshupConfig.isBusinessAppUsable(account)) {
        return { appId: String(account.gupshupAppId).trim(), scope: 'business' };
      }
    } catch {
      /* fall through to platform */
    }
  }
  if (await gupshupConfig.isPlatformConfiguredAsync()) {
    const cfg = await gupshupConfig.loadPlatformConfig();
    if (cfg.appId) {
      return { appId: String(cfg.appId).trim(), scope: 'platform' };
    }
  }
  return { appId: null, scope: null };
}

async function resolveOnGupshupApp(appId, { templateId, slotKey, elementName, language, scope }) {
  const platformTpl = await loadPlatformTemplateMeta({ templateId, slotKey });
  const rawTemplateId = String(templateId || '').trim();
  let resolvedElementName = elementName || platformTpl?.name || null;
  const resolvedLanguage = language || platformTpl?.language || 'en_US';

  if (rawTemplateId && !isGupshupUuid(rawTemplateId)) {
    resolvedElementName = resolvedElementName || rawTemplateId;
  }

  const listResult = await gupshupWhatsApp.listTemplates({ appId });
  if (!listResult.success) {
    return {
      success: false,
      error: listResult.error || 'Could not list WhatsApp templates',
      code: 'GUPSHUP_LIST_TEMPLATES',
    };
  }

  const remoteList = extractTemplateList(listResult.data);
  const approved = findApprovedOnApp(remoteList, {
    templateId: isGupshupUuid(rawTemplateId) ? rawTemplateId : null,
    elementName: resolvedElementName,
    language: resolvedLanguage,
  });

  if (approved) {
    const id = remoteTemplateId(approved);
    return {
      success: true,
      templateId: id,
      elementName: remoteElementName(approved),
      replacedStaleId: Boolean(rawTemplateId && id !== rawTemplateId),
    };
  }

  if (rawTemplateId) {
    const byIdOnApp = findOnApp(remoteList, {
      templateId: isGupshupUuid(rawTemplateId) ? rawTemplateId : null,
      elementName: resolvedElementName,
      language: resolvedLanguage,
    });
    if (byIdOnApp) {
      const status = remoteTemplateStatus(normalizeGupshupTemplateRecord(byIdOnApp));
      const name = remoteElementName(byIdOnApp);
      const where =
        scope === 'business'
          ? 'your connected number'
          : 'the platform WhatsApp number';
      return {
        success: false,
        error: `WhatsApp template "${name || slotKey || rawTemplateId}" is ${status || 'not approved'} on ${where}. Submit it under Settings → WhatsApp Templates and wait for approval.`,
        code: 'GUPSHUP_TEMPLATE_NOT_APPROVED',
      };
    }

    if (isGupshupUuid(rawTemplateId)) {
      const byId = await gupshupWhatsApp.getTemplate({ appId, templateId: rawTemplateId });
      if (byId.success) {
        const normalized = normalizeGupshupTemplateRecord(byId.data);
        if (!templateOwnedByApp(normalized, appId)) {
          const name = resolvedElementName || remoteElementName(normalized);
          return {
            success: false,
            error: name
              ? `Template "${name}" is not on ${scope === 'business' ? 'your connected WhatsApp number' : 'the platform sender'}. Submit it under Settings → WhatsApp Templates.`
              : 'This notification template is not on the sender WhatsApp number.',
            code: 'GUPSHUP_TEMPLATE_WRONG_APP',
          };
        }
      }
    }
  }

  if (resolvedElementName) {
    return {
      success: false,
      error: `WhatsApp template "${resolvedElementName}" is not approved. Open Settings → WhatsApp Templates and submit it (or run Sync notification slots).`,
      code: 'GUPSHUP_TEMPLATE_NOT_ON_TENANT_APP',
    };
  }

  return {
    success: false,
    error: slotKey
      ? `No approved WhatsApp template is configured for "${slotKey}". Map a template in Admin notifications.`
      : 'Gupshup template id not configured for this notification',
    code: 'GUPSHUP_TEMPLATE_MISSING',
  };
}

/**
 * @returns {Promise<{ success: true, templateId: string, elementName?: string, replacedStaleId?: boolean } | { success: false, error: string, code?: string }>}
 */
async function resolveGupshupTemplateForSend({ businessId, templateId, slotKey, elementName, language }) {
  const rawTemplateId = String(templateId || '').trim();
  const sendApp = await resolveSendAppId(businessId);

  if (!sendApp.appId) {
    return rawTemplateId
      ? { success: true, templateId: rawTemplateId }
      : { success: false, error: 'Template id is required', code: 'GUPSHUP_TEMPLATE_MISSING' };
  }

  return resolveOnGupshupApp(sendApp.appId, {
    templateId: rawTemplateId,
    slotKey,
    elementName,
    language,
    scope: sendApp.scope,
  });
}

module.exports = {
  resolveGupshupTemplateForSend,
  isGupshupUuid,
};
