/**
 * Tenant Gupshup WhatsApp templates (Partner Portal).
 * Primary mount: /api/whatsapp/gupshup/templates
 * Legacy alias:  /api/whatsapp/v2/templates (Meta-era path; same router)
 *
 * Submit/sync call Gupshup Partner API POST/GET /partner/app/{appId}/templates
 * on the salon's connected app (not the shared platform WABA).
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateToken, requireManager } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const requireWabaAddon = require('../middleware/waba-addon');
const { logger } = require('../utils/logger');

/**
 * Every endpoint in this router operates on Gupshup WABA templates and is
 * therefore gated on the `waba` add-on.
 */

const {
  resolveTenantBusinessObjectId,
  normalizeOptionalObjectId,
} = require('../lib/tenant-business-id');
const databaseManager = require('../config/database-manager');
const gupshupConfig = require('../lib/gupshup-config');
const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const { logEvent } = require('../lib/whatsapp-audit');
const {
  whatsappTemplateBodySchema,
  whatsappTemplateUpdateBodySchema,
  whatsappTemplateListQuerySchema,
  whatsappTemplateLibraryQuerySchema,
  whatsappTemplateHeaderMediaUploadSchema,
} = require('../validation/schemas');
const {
  parseHeaderMediaUploadInput,
  saveWhatsappTemplateHeaderMedia,
} = require('../lib/whatsapp-template-header-media');

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
const { buildVariableMappingForSlot } = require('../lib/platform-template-variable-mapping');
const {
  applyApprovedTemplateToBusinessNotificationSlot,
} = require('../lib/business-whatsapp-template-config');
const {
  submitTemplateForGupshupApproval,
  gupshupSubmissionErrorMessage,
  isGupshupTemplateDuplicateError,
} = require('../lib/gupshup-template-submit');

/**
 * Zod v4 exposes `.issues` (v3 was `.errors`). Support both so bumping the
 * package never silently regresses to a cryptic "Cannot read properties of
 * undefined (reading '0')".
 */
function firstZodMessage(error, fallback) {
  const list = (error && (error.issues || error.errors)) || [];
  return list[0]?.message || fallback;
}

async function tenantBusinessObjectId(req, res) {
  if (req._tenantBusinessObjectId) {
    return req._tenantBusinessObjectId;
  }
  const r = await resolveTenantBusinessObjectId(req.user.branchId, req.mainConnection);
  if (r.error || !r.businessObjectId) {
    res.status(400).json({ success: false, error: r.error || 'Invalid business id' });
    return null;
  }
  return r.businessObjectId;
}

/**
 * Persist only Mongoose-declared nested fields so unknown keys cannot break
 * template writes; normalise body.examples to [[String]]
 */
function sanitizeComponentsForPersist(components) {
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

  let body = null;
  const b = components.body;
  if (b != null && typeof b === 'object' && typeof b.text === 'string') {
    /** @type {string[][]} */
    let examples = [];
    const ex = b.examples;
    if (Array.isArray(ex)) {
      examples = ex
        .map((row) => {
          if (Array.isArray(row)) return row.map((v) => String(v ?? ''));
          if (row == null || row === '') return [];
          return [String(row)];
        })
        .filter((row) => row.some((cell) => String(cell || '').trim() !== ''));
    }
    body = { text: b.text, examples };
  }

  let footer = null;
  const f = components.footer;
  if (f && typeof f === 'object' && f.text) {
    footer = { text: f.text };
  }

  const buttons = Array.isArray(components.buttons)
    ? components.buttons.map((btn) => ({
        type: btn.type,
        text: btn.text ?? '',
        url: btn.url ?? null,
        phone: btn.phone ?? null,
      }))
    : [];

  return { header, body, footer, buttons };
}

function mongoValidationErrorMessage(err) {
  if (!err || err.name !== 'ValidationError') return null;
  if (err.errors) {
    const parts = Object.values(err.errors).map((e) => e.message || String(e.path || ''));
    if (parts.length) return parts.join('; ');
  }
  return err.message || null;
}

async function getModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('WhatsAppTemplate', require('../models/WhatsAppTemplate').schema);
}

async function getPlatformTemplateModel() {
  const main = await databaseManager.getMainConnection();
  return main.model('PlatformWhatsAppTemplate', require('../models/PlatformWhatsAppTemplate').schema);
}

async function listApprovedPlatformLibraryTemplates(scope) {
  const PlatformTemplate = await getPlatformTemplateModel();
  const filter = { status: 'approved', publishedToTenantLibrary: { $ne: false } };
  if (scope === 'promotional') {
    filter.category = 'MARKETING';
  } else if (scope === 'transactional') {
    filter.category = 'UTILITY';
  }
  return PlatformTemplate.find(filter).sort({ slotKey: 1, name: 1 }).lean();
}

function scopeCategoryFilter(scope) {
  if (scope === 'promotional') return 'MARKETING';
  if (scope === 'transactional') return 'UTILITY';
  return null;
}

/** Platform catalog rows the tenant has explicitly added to their library. */
async function listTenantSelectedLibraryEntries(businessId, scope, { byName } = {}) {
  const PlatformTemplate = await getPlatformTemplateModel();
  const Template = await getModel();
  const category = scopeCategoryFilter(scope);

  const localQuery = { businessId, sourcePlatformTemplateId: { $ne: null } };
  if (category) localQuery.category = category;

  const locals = await Template.find(localQuery)
    .select('name language status slotKey gupshupTemplateId category submittedAt sourcePlatformTemplateId')
    .lean();
  if (!locals.length) return [];

  const platformIds = [...new Set(locals.map((l) => String(l.sourcePlatformTemplateId)).filter(Boolean))];
  const platformRows = await PlatformTemplate.find({
    _id: { $in: platformIds },
    status: 'approved',
    publishedToTenantLibrary: { $ne: false },
  }).lean();
  const platformById = new Map(platformRows.map((p) => [String(p._id), p]));

  const nameMap =
    byName ||
    new Map(locals.map((t) => [`${t.name}:${t.language}`, t]));

  const items = [];
  for (const local of locals) {
    const platformTpl = platformById.get(String(local.sourcePlatformTemplateId));
    if (!platformTpl) continue;
    items.push(platformLibraryItem(platformTpl, nameMap));
  }

  items.sort((a, b) => {
    const slotA = a.slotKey || '';
    const slotB = b.slotKey || '';
    if (slotA !== slotB) return slotA.localeCompare(slotB);
    return a.elementName.localeCompare(b.elementName);
  });
  return items;
}

function availableCatalogItem(platformTpl) {
  return {
    platformTemplateId: String(platformTpl._id),
    slotKey: platformTpl.slotKey || null,
    elementName: platformTpl.name,
    category: platformTpl.category,
    language: platformTpl.language,
    content: platformTpl.components?.body?.text || '',
    platformStatus: 'approved',
  };
}

const TENANT_APP_REQUIRED_MSG = gupshupConfig.TENANT_APP_REQUIRED_MSG;

async function resolveTenantGupshupApp(businessId) {
  const account = await gupshupConfig.loadAccount(businessId);
  if (!gupshupConfig.isBusinessAppUsable(account)) {
    return { connected: false, appId: null, sourceNumber: null, appName: null };
  }
  const sourceNumber = String(account.sourceNumber || account.phoneE164 || '').replace(/\D/g, '') || null;
  return {
    connected: true,
    appId: String(account.gupshupAppId),
    sourceNumber,
    appName: account.gupshupAppName || null,
  };
}

/** @deprecated use resolveTenantGupshupApp */
async function resolveTenantConnectedGupshupAppId(businessId) {
  const tenantApp = await resolveTenantGupshupApp(businessId);
  return { connected: tenantApp.connected, appId: tenantApp.appId };
}

/**
 * Tenant template APIs must target the salon's connected Gupshup app — never the
 * shared platform fallback used for transactional sends without a own WABA.
 */
async function requireTenantGupshupAppId(businessId) {
  const tenantApp = await resolveTenantGupshupApp(businessId);
  if (!tenantApp.connected || !tenantApp.appId) {
    return { ok: false, appId: null, sourceNumber: null, appName: null };
  }
  return {
    ok: true,
    appId: tenantApp.appId,
    sourceNumber: tenantApp.sourceNumber,
    appName: tenantApp.appName,
  };
}

function tenantAppRequiredResponse(res) {
  return res.status(400).json({
    success: false,
    error: TENANT_APP_REQUIRED_MSG,
    code: 'WHATSAPP_APP_NOT_CONNECTED',
  });
}

function gupshupApiErrorMessage(error) {
  if (typeof error === 'string') return error;
  if (error?.message) return String(error.message);
  return 'Gupshup API error';
}

function isInvalidGupshupTemplateIdError(error) {
  return /invalid template id/i.test(gupshupApiErrorMessage(error));
}

/**
 * Resolve a template on the tenant's connected Gupshup app. Falls back to
 * list+elementName when the stored id belongs to another app (e.g. platform WABA).
 */
async function resolveTenantTemplateRemote({ appId, templateId, elementName, language }) {
  if (templateId) {
    const byId = await gupshupWhatsApp.getTemplate({ appId, templateId });
    if (byId.success) return { success: true, data: byId.data };
    if (!isInvalidGupshupTemplateIdError(byId.error)) return byId;
  }

  if (!elementName) {
    return {
      success: false,
      error:
        'Stored Gupshup template id is not valid on your connected app. Submit this template on your number again.',
      code: 'GUPSHUP_TEMPLATE_ID_STALE',
    };
  }

  const list = await gupshupWhatsApp.listTemplates({ appId });
  if (!list.success) return list;

  const wantLang = String(language || '').replace('-', '_');
  const remote = extractTemplateList(list.data).find((raw) => {
    const normalized = normalizeGupshupTemplateRecord(raw);
    const name = remoteElementName(normalized);
    const lang = String(normalized.language || '').replace('-', '_');
    if (name !== elementName) return false;
    return !wantLang || !lang || lang === wantLang;
  });

  if (!remote) {
    return {
      success: false,
      error: `Template "${elementName}" is not on your connected WhatsApp app yet. Click Submit first.`,
      code: 'GUPSHUP_TEMPLATE_NOT_ON_TENANT_APP',
    };
  }

  return {
    success: true,
    data: remote,
    staleIdReplaced: Boolean(templateId),
  };
}

function statusAfterGupshupApply(submissionData) {
  const mapped = mapGupshupStatus(
    submissionData?.status ||
      submissionData?.template?.status ||
      submissionData?.template?.state ||
      submissionData?.state
  );
  if (mapped === 'approved') return 'approved';
  if (mapped === 'rejected') return 'rejected';
  return 'pending';
}

/**
 * Map a remote template status (case-insensitive) to one of the local enum values.
 * Returns null if the remote value isn't a known status.
 */
function mapMetaStatus(remoteStatus) {
  const s = String(remoteStatus || '').toLowerCase();
  switch (s) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'paused':
      return 'paused';
    case 'disabled':
      return 'disabled';
    case 'pending':
    case 'submitted':
      return 'pending';
    case 'in_appeal':
    case 'pending_deletion':
      return 'in_appeal';
    case 'flagged':
      return 'flagged';
    default:
      return null;
  }
}

function mapGupshupStatus(remoteStatus) {
  const s = String(remoteStatus || '').toUpperCase();
  switch (s) {
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
      return 'rejected';
    case 'PAUSED':
    case 'DEACTIVATED':
      return 'paused';
    case 'PENDING':
    case 'SUBMITTED':
      return 'pending';
    default:
      return mapMetaStatus(remoteStatus);
  }
}

/**
 * Fold Meta's components array (returned by GET /<template_id>) into our
 * normalised mongoose shape. Returns null if Meta sent nothing.
 */
function adaptComponentsFromMeta(metaComponents) {
  if (!Array.isArray(metaComponents) || metaComponents.length === 0) return null;
  const out = { header: null, body: null, footer: null, buttons: [] };
  for (const c of metaComponents) {
    const type = String(c.type || '').toUpperCase();
    if (type === 'HEADER') {
      out.header = {
        format: c.format ? String(c.format).toUpperCase() : null,
        text: c.text || null,
        examples: c.example?.header_text || [],
      };
    } else if (type === 'BODY') {
      out.body = {
        text: c.text || null,
        examples: c.example?.body_text || [],
      };
    } else if (type === 'FOOTER') {
      out.footer = { text: c.text || null };
    } else if (type === 'BUTTONS' && Array.isArray(c.buttons)) {
      out.buttons = c.buttons.map((b) => {
        const t = String(b.type || '').toUpperCase();
        if (t === 'URL') return { type: 'URL', text: b.text || '', url: b.url || null };
        if (t === 'PHONE_NUMBER')
          return { type: 'PHONE_NUMBER', text: b.text || '', phone: b.phone_number || null };
        return { type: 'QUICK_REPLY', text: b.text || '' };
      });
    }
  }
  return out;
}

/**
 * Apply remote Meta state onto a local Template doc. Mutates `tpl` in place
 * and returns it for chaining; caller is responsible for `.save()`.
 *
 * Used by both /:id/sync (single) and /sync-all (bulk).
 */
function applyRemoteToLocal(tpl, remote) {
  const normalized = normalizeGupshupTemplateRecord(remote);
  const mapped = mapGupshupStatus(normalized.status);
  if (mapped) {
    tpl.status = mapped;
    if (mapped === 'approved' && !tpl.approvedAt) tpl.approvedAt = new Date();
    if (mapped === 'rejected') {
      tpl.rejectionReason =
        normalized.rejectedReason || normalized.rejected_reason || tpl.rejectionReason || null;
    }
  }
  if (normalized.id) {
    tpl.metaTemplateId = String(normalized.id);
    tpl.gupshupTemplateId = String(normalized.id);
  }
  tpl.metaTemplateName =
    normalized.elementName || normalized.name || tpl.metaTemplateName || tpl.name;
  if (remote.quality_score) {
    tpl.qualityScore =
      typeof remote.quality_score === 'string'
        ? remote.quality_score
        : remote.quality_score.score || tpl.qualityScore;
  }
  // Meta auto-recategorizes templates (e.g. MARKETING → UTILITY); persist
  // the previous category so the UI can show the change.
  if (remote.previous_category && remote.previous_category !== tpl.category) {
    tpl.previousCategory = String(remote.previous_category).toUpperCase();
  }
  if (remote.category && String(remote.category).toUpperCase() !== tpl.category) {
    tpl.previousCategory = tpl.category;
    tpl.category = String(remote.category).toUpperCase();
  }
  // Persist Meta's components so local edits stay in sync if an admin
  // edits the template in WhatsApp Manager.
  const adapted = adaptComponentsFromMeta(remote.components);
  if (adapted) tpl.components = adapted;
  tpl.lastSyncedAt = new Date();
  return tpl;
}

function componentsForElementName(elementName, localTemplates, platformTemplates) {
  const localTpl = localTemplates.find((lt) => lt.name === elementName);
  if (localTpl?.components) return localTpl.components;
  const platformTpl = platformTemplates.find((pt) => pt.name === elementName);
  if (platformTpl?.components) return platformTpl.components;
  const catalogEntry = catalogByElementName().get(elementName);
  if (!catalogEntry) return null;
  return catalogEntryToApplyPayload(catalogEntry).components;
}

async function importPlatformTemplateToBusiness(businessId, platformTpl, createdBy) {
  const Template = await getModel();
  const exists = await Template.findOne({
    businessId,
    name: platformTpl.name,
    language: platformTpl.language,
  });
  if (exists) return { imported: false, reason: 'already_exists', template: exists };

  const doc = await Template.create({
    businessId,
    name: platformTpl.name,
    language: platformTpl.language,
    category: platformTpl.category,
    slotKey: platformTpl.slotKey || null,
    components: sanitizeComponentsForPersist(platformTpl.components),
    status: 'draft',
    sourcePlatformTemplateId: String(platformTpl._id),
    createdBy: normalizeOptionalObjectId(createdBy),
  });
  return { imported: true, template: doc };
}

/** Pull latest Gupshup approval state onto local tenant template rows. */
function findRemoteTemplateByNameLang(remoteList, elementName, language) {
  const wantLang = String(language || '').replace('-', '_');
  return (
    remoteList.find((raw) => {
      const normalized = normalizeGupshupTemplateRecord(raw);
      const name = remoteElementName(normalized);
      const lang = String(normalized.language || '').replace('-', '_');
      if (name !== elementName) return false;
      return !wantLang || !lang || lang === wantLang;
    }) || null
  );
}

async function refreshLocalTemplatesFromRemoteList(businessId, remoteList) {
  if (!remoteList?.length) return 0;
  const Template = await getModel();
  const locals = await Template.find({
    businessId,
    $or: [
      { gupshupTemplateId: { $ne: null } },
      { status: { $in: ['pending', 'in_appeal'] } },
      { submittedAt: { $ne: null } },
    ],
  });
  let updated = 0;
  for (const tpl of locals) {
    const remote = remoteList.find((r) => {
      const id = remoteTemplateId(r);
      const name = remoteElementName(r);
      const lang = String(r.language || r.languageCode || '').replace('-', '_');
      const tplLang = String(tpl.language || '').replace('-', '_');
      if (id && (String(tpl.gupshupTemplateId || '') === id || String(tpl.metaTemplateId || '') === id)) {
        return true;
      }
      if (!tpl.submittedAt && tpl.status !== 'pending' && tpl.status !== 'in_appeal') {
        return false;
      }
      return Boolean(name && name === tpl.name && (!lang || !tplLang || lang === tplLang));
    });
    if (!remote) continue;
    applyRemoteToLocal(tpl, remote);
    tpl.lastSyncedAt = new Date();
    await tpl.save();
    updated += 1;
  }
  return updated;
}

/**
 * Strip platform WABA template ids mistaken for tenant ids. Platform approval
 * must not display as tenant "Your number" approval until submitted locally.
 */
async function reconcileTenantLibraryTemplates(businessId, approvedPlatform, remoteList) {
  const Template = await getModel();
  const locals = await Template.find({
    businessId,
    sourcePlatformTemplateId: { $ne: null },
  });
  if (!locals.length) return 0;

  const platformByKey = new Map(
    approvedPlatform.map((p) => [`${p.name}:${p.language}`, p])
  );
  let fixed = 0;

  for (const tpl of locals) {
    const platformTpl = platformByKey.get(`${tpl.name}:${tpl.language}`);
    const platformId = platformTpl?.gupshupTemplateId
      ? String(platformTpl.gupshupTemplateId)
      : null;
    const rawRemote = findRemoteTemplateByNameLang(remoteList, tpl.name, tpl.language);
    const remote = rawRemote ? normalizeGupshupTemplateRecord(rawRemote) : null;
    const remoteId = remote?.id ? String(remote.id) : null;
    let dirty = false;

    if (platformId && String(tpl.gupshupTemplateId || '') === platformId) {
      tpl.gupshupTemplateId = remoteId;
      tpl.metaTemplateId = remoteId;
      dirty = true;
      if (!remoteId) {
        tpl.status = tpl.submittedAt ? 'pending' : 'draft';
        tpl.approvedAt = null;
        tpl.rejectionReason = null;
      }
    }

    if (tpl.status === 'approved' && !remoteId) {
      tpl.status = tpl.submittedAt ? 'pending' : 'draft';
      tpl.approvedAt = null;
      if (!tpl.submittedAt) {
        tpl.gupshupTemplateId = null;
        tpl.metaTemplateId = null;
      }
      dirty = true;
    } else if (remote && tpl.submittedAt) {
      applyRemoteToLocal(tpl, remote);
      dirty = true;
    }

    if (dirty) {
      tpl.lastSyncedAt = new Date();
      await tpl.save();
      fixed += 1;
    }
  }

  return fixed;
}

function isLibraryLinkedLocal(platformTpl, local) {
  if (!local?.sourcePlatformTemplateId) return false;
  return String(local.sourcePlatformTemplateId) === String(platformTpl._id);
}

function platformLibraryItem(platformTpl, localByName) {
  const key = `${platformTpl.name}:${platformTpl.language}`;
  const local = localByName.get(key);
  const linked = isLibraryLinkedLocal(platformTpl, local);
  return {
    platformTemplateId: String(platformTpl._id),
    slotKey: platformTpl.slotKey || null,
    elementName: platformTpl.name,
    category: platformTpl.category,
    language: platformTpl.language,
    content: platformTpl.components?.body?.text || '',
    platformStatus: 'approved',
    libraryLinked: linked,
    tenantSubmitted: linked ? Boolean(local.submittedAt) : false,
    localTemplateId: linked && local?._id ? String(local._id) : null,
    localStatus: linked ? local.status : null,
    mappedSlotKey: linked ? local.slotKey || null : null,
    localTemplate: linked
      ? {
          _id: String(local._id),
          name: local.name,
          status: local.status,
          slotKey: local.slotKey || null,
          gupshupTemplateId: local.gupshupTemplateId || null,
          category: local.category,
        }
      : null,
  };
}

/* ----------------------------------------------------------------------- */

router.get('/catalog', authenticateToken, setupMainDatabase, requireWabaAddon, handleTemplateCatalog);
/** @deprecated use GET /catalog */
router.get('/meta', authenticateToken, setupMainDatabase, requireWabaAddon, handleTemplateCatalog);

async function handleTemplateCatalog(req, res) {
  try {
    const approved = await listApprovedPlatformLibraryTemplates();
    return res.json({
      success: true,
      data: {
        slotKeys: NOTIFICATION_SLOT_KEYS,
        catalog: approved.map((t) => ({
          platformTemplateId: String(t._id),
          slotKey: t.slotKey,
          elementName: t.name,
          category: t.category,
          content: t.components?.body?.text || '',
          language: t.language,
        })),
      },
    });
  } catch (err) {
    logger.error('[whatsapp-templates] catalog failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load template metadata' });
  }
}

/** Templates the tenant has added to their library (not the full platform catalog). */
router.get('/library', authenticateToken, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const parsed = whatsappTemplateLibraryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: firstZodMessage(parsed.error, 'Invalid query') });
    }
    const { scope } = parsed.data;
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const Template = await getModel();
    const approvedPlatform = await listApprovedPlatformLibraryTemplates(scope);

    const appCtx = await requireTenantGupshupAppId(businessId);
    if (appCtx.ok) {
      const listResult = await gupshupWhatsApp.listTemplates({ appId: appCtx.appId });
      if (listResult.success) {
        const remoteList = extractTemplateList(listResult.data);
        await refreshLocalTemplatesFromRemoteList(businessId, remoteList);
        await reconcileTenantLibraryTemplates(businessId, approvedPlatform, remoteList);
      }
    }

    const existing = await Template.find({ businessId })
      .select(
        'name language status slotKey gupshupTemplateId category submittedAt sourcePlatformTemplateId'
      )
      .lean();
    const byName = new Map(existing.map((t) => [`${t.name}:${t.language}`, t]));

    const items = await listTenantSelectedLibraryEntries(businessId, scope, { byName });
    res.json({ success: true, data: items, scope });
  } catch (err) {
    logger.error('[whatsapp-templates] library failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load template library' });
  }
});

/** Published platform templates the tenant can add (not yet in their library). */
router.get('/library/available', authenticateToken, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const parsed = whatsappTemplateLibraryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: firstZodMessage(parsed.error, 'Invalid query') });
    }
    const { scope } = parsed.data;
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;

    const Template = await getModel();
    const approvedPlatform = await listApprovedPlatformLibraryTemplates(scope);
    const added = await Template.find({
      businessId,
      sourcePlatformTemplateId: { $ne: null },
    })
      .select('sourcePlatformTemplateId')
      .lean();
    const addedIds = new Set(added.map((r) => String(r.sourcePlatformTemplateId)));

    const items = approvedPlatform
      .filter((p) => !addedIds.has(String(p._id)))
      .map((p) => availableCatalogItem(p));

    res.json({ success: true, data: items, scope });
  } catch (err) {
    logger.error('[whatsapp-templates] library/available failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load available templates' });
  }
});

router.post('/library/import-batch', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const ids = Array.isArray(req.body?.platformTemplateIds)
      ? req.body.platformTemplateIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (!ids.length) {
      return res.status(400).json({ success: false, error: 'platformTemplateIds array is required' });
    }

    const PlatformTemplate = await getPlatformTemplateModel();
    const platformRows = await PlatformTemplate.find({
      _id: { $in: ids },
      status: 'approved',
      publishedToTenantLibrary: { $ne: false },
    }).lean();
    const byId = new Map(platformRows.map((p) => [String(p._id), p]));

    const imported = [];
    const skipped = [];
    for (const id of ids) {
      const platformTpl = byId.get(id);
      if (!platformTpl) {
        skipped.push({ id, reason: 'not_found_or_unpublished' });
        continue;
      }
      const result = await importPlatformTemplateToBusiness(
        businessId,
        platformTpl,
        req.user._id || req.user.id
      );
      if (result.imported) {
        imported.push(String(result.template._id));
      } else {
        skipped.push({ id, reason: result.reason || 'already_exists', name: platformTpl.name });
      }
    }

    res.json({
      success: true,
      data: { imported: imported.length, skipped, templateIds: imported },
    });
  } catch (err) {
    logger.error('[whatsapp-templates] library import-batch failed:', err);
    res.status(500).json({ success: false, error: 'Failed to add selected templates' });
  }
});

router.post('/library/:platformTemplateId/import', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const PlatformTemplate = await getPlatformTemplateModel();
    const platformTpl = await PlatformTemplate.findOne({
      _id: req.params.platformTemplateId,
      status: 'approved',
      publishedToTenantLibrary: { $ne: false },
    }).lean();
    if (!platformTpl) {
      return res.status(404).json({ success: false, error: 'Approved library template not found' });
    }
    const result = await importPlatformTemplateToBusiness(
      businessId,
      platformTpl,
      req.user._id || req.user.id
    );
    if (!result.imported) {
      return res.status(409).json({
        success: false,
        error: 'Template already added to your account',
        data: result.template,
      });
    }
    res.status(201).json({ success: true, data: result.template });
  } catch (err) {
    logger.error('[whatsapp-templates] library import failed:', err);
    res.status(500).json({ success: false, error: 'Failed to add template from library' });
  }
});

router.post('/import-catalog', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const scope = req.body?.scope || req.query?.scope;
    const scopeParsed = whatsappTemplateLibraryQuerySchema.safeParse({ scope });
    if (!scopeParsed.success) {
      return res.status(400).json({
        success: false,
        error: 'scope is required (promotional or transactional)',
      });
    }
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const approvedPlatform = await listApprovedPlatformLibraryTemplates(scopeParsed.data.scope);
    const imported = [];
    const skipped = [];
    for (const platformTpl of approvedPlatform) {
      const result = await importPlatformTemplateToBusiness(
        businessId,
        platformTpl,
        req.user._id || req.user.id
      );
      if (result.imported) {
        imported.push(String(result.template._id));
      } else {
        skipped.push(platformTpl.name);
      }
    }
    res.json({ success: true, data: { imported: imported.length, skipped, scope: scopeParsed.data.scope } });
  } catch (err) {
    logger.error('[whatsapp-templates] import-catalog failed:', err);
    res.status(500).json({ success: false, error: 'Failed to import template library' });
  }
});

router.post('/sync-slots', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const appCtx = await requireTenantGupshupAppId(businessId);
    if (!appCtx.ok) return tenantAppRequiredResponse(res);
    const listResult = await gupshupWhatsApp.listTemplates({ appId: appCtx.appId });
    if (!listResult.success) {
      return res.status(400).json({ success: false, error: 'Could not list Gupshup templates', details: listResult.error });
    }

    const Template = await getModel();
    const [localTemplates, approvedPlatform] = await Promise.all([
      Template.find({ businessId, slotKey: { $ne: null } }).lean(),
      listApprovedPlatformLibraryTemplates('transactional'),
    ]);
    const slotByElementName = new Map();
    for (const entry of approvedPlatform) {
      if (entry.slotKey) slotByElementName.set(entry.name, entry.slotKey);
    }
    for (const lt of localTemplates) {
      if (lt.slotKey) slotByElementName.set(lt.name, lt.slotKey);
    }

    const linked = [];
    const pending = [];
    const unmatched = [];

    for (const raw of extractTemplateList(listResult.data)) {
      const remote = normalizeGupshupTemplateRecord(raw);
      const elementName = remoteElementName(remote);
      const slotKey = slotByElementName.get(elementName);
      if (!slotKey) continue;

      const status = remoteTemplateStatus(remote);
      const templateId = remoteTemplateId(remote);
      if (status === 'APPROVED' && templateId) {
        const components = componentsForElementName(elementName, localTemplates, approvedPlatform);
        const link = await applyApprovedTemplateToBusinessNotificationSlot(businessId, slotKey, {
          status: 'approved',
          gupshupTemplateId: templateId,
          components,
        });
        if (link.applied) {
          linked.push({ slotKey, elementName, templateId, status });
        }
        await Template.updateOne(
          { businessId, name: elementName },
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

    for (const entry of approvedPlatform) {
      if (!entry.slotKey) continue;
      const found =
        linked.some((l) => l.slotKey === entry.slotKey) ||
        pending.some((p) => p.slotKey === entry.slotKey);
      if (!found) unmatched.push({ slotKey: entry.slotKey, elementName: entry.name });
    }

    res.json({ success: true, data: { linked, pending, unmatched } });
  } catch (err) {
    logger.error('[whatsapp-templates] sync-slots failed:', err);
    res.status(500).json({ success: false, error: 'Failed to sync notification slots' });
  }
});

/* ----------------------------------------------------------------------- */

router.get('/', authenticateToken, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const Template = await getModel();
    const parsed = whatsappTemplateListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: firstZodMessage(parsed.error, 'Invalid query') });
    }
    const { status, search, limit = 50, skip = 0, origin } = parsed.data;
    const filter = { businessId };
    if (status) filter.status = status;
    if (origin === 'own') {
      filter.$or = [
        { sourcePlatformTemplateId: { $exists: false } },
        { sourcePlatformTemplateId: null },
        { sourcePlatformTemplateId: '' },
      ];
    }
    if (search) {
      // Allow operators to search names with any printable chars; just escape
      // regex specials to avoid syntax errors.
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = { $regex: escaped, $options: 'i' };
    }
    const [items, total] = await Promise.all([
      Template.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Template.countDocuments(filter),
    ]);
    res.json({ success: true, data: items, total, limit, skip });
  } catch (err) {
    logger.error('[whatsapp-templates] list failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load templates' });
  }
});

router.get('/from-gupshup', authenticateToken, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const appCtx = await requireTenantGupshupAppId(businessId);
    if (!appCtx.ok) return tenantAppRequiredResponse(res);
    const result = await gupshupWhatsApp.listTemplates({ appId: appCtx.appId });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, data: extractTemplateList(result.data) });
  } catch (err) {
    logger.error('[whatsapp-templates] from-gupshup failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load Gupshup templates' });
  }
});

/** @deprecated alias for /from-gupshup */
router.get('/from-meta', authenticateToken, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const appCtx = await requireTenantGupshupAppId(businessId);
    if (!appCtx.ok) return tenantAppRequiredResponse(res);
    const result = await gupshupWhatsApp.listTemplates({ appId: appCtx.appId });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, data: extractTemplateList(result.data) });
  } catch (err) {
    logger.error('[whatsapp-templates] from-meta failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load Gupshup templates' });
  }
});

router.post('/', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const parsed = whatsappTemplateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error?.issues || parsed.error?.errors || [];
      logger.warn('[whatsapp-templates] create validation failed:', {
        issues: issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
      });
      return res.status(400).json({
        success: false,
        error: firstZodMessage(parsed.error, 'Invalid payload'),
        details: issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }
    const { name, language = 'en_US', category, components = {}, variables = {}, samples = {} } =
      parsed.data;

    const Template = await getModel();
    const created = await Template.create({
      businessId,
      name,
      language,
      category: category.toUpperCase(),
      components: sanitizeComponentsForPersist(components),
      variables,
      samples,
      status: 'draft',
      createdBy: normalizeOptionalObjectId(req.user._id || req.user.id),
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, error: 'Template name already exists for this language' });
    }
    const validationMsg = mongoValidationErrorMessage(err);
    if (validationMsg) {
      return res.status(400).json({ success: false, error: validationMsg });
    }
    logger.error('[whatsapp-templates] create failed:', err);
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

router.post(
  '/upload-header-media',
  authenticateToken,
  requireManager,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const businessId = await tenantBusinessObjectId(req, res);
      if (!businessId) return;

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
        businessId: String(businessId),
        buffer: decoded.buffer,
        ext: decoded.ext,
      });
      if (saved.error) {
        return res.status(400).json({ success: false, error: saved.error });
      }

      res.json({ success: true, data: { url: saved.url } });
    } catch (err) {
      logger.error('[whatsapp-templates] upload-header-media failed:', err);
      res.status(500).json({ success: false, error: 'Failed to upload header media' });
    }
  }
);

router.put('/:id', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const Template = await getModel();
    const tpl = await Template.findOne({ _id: req.params.id, businessId });
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (tpl.status !== 'draft' && tpl.status !== 'rejected') {
      return res.status(400).json({
        success: false,
        error: `Templates in status "${tpl.status}" cannot be edited; create a new version.`,
      });
    }
    const parsed = whatsappTemplateUpdateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error?.issues || parsed.error?.errors || [];
      logger.warn('[whatsapp-templates] update validation failed:', {
        issues: issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
      });
      return res.status(400).json({
        success: false,
        error: firstZodMessage(parsed.error, 'Invalid payload'),
        details: issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }
    const { name, language, category, components, variables, samples } = parsed.data;
    if (name !== undefined) tpl.name = name;
    if (language !== undefined) tpl.language = language;
    if (category !== undefined) tpl.category = category.toUpperCase();
    if (components !== undefined) {
      const prior =
        tpl.components && typeof tpl.components.toObject === 'function'
          ? tpl.components.toObject()
          : tpl.components && typeof tpl.components === 'object'
            ? { ...tpl.components }
            : {};
      tpl.components = sanitizeComponentsForPersist({ ...prior, ...components });
    }
    if (variables !== undefined) tpl.variables = variables;
    if (samples !== undefined) tpl.samples = samples;
    await tpl.save();
    res.json({ success: true, data: tpl });
  } catch (err) {
    const validationMsg = mongoValidationErrorMessage(err);
    if (validationMsg) {
      return res.status(400).json({ success: false, error: validationMsg });
    }
    logger.error('[whatsapp-templates] update failed:', err);
    res.status(500).json({ success: false, error: 'Failed to update template' });
  }
});

router.delete('/:id', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const Template = await getModel();
    const tpl = await Template.findOne({ _id: req.params.id, businessId });
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });

    if (tpl.gupshupTemplateId || tpl.metaTemplateId || tpl.status !== 'draft') {
      if (req.query.force !== '1') {
        return res.status(400).json({
          success: false,
          error: 'Approved or submitted templates cannot be deleted locally. Pause them in Gupshup, or pass ?force=1 to delete the local row only.',
        });
      }
    }

    await tpl.deleteOne();
    await logEvent({
      businessId,
      actorType: 'user',
      actorId: req.user._id,
      event: 'template_disabled',
      summary: `Deleted template ${tpl.name}/${tpl.language}`,
      metadata: { templateId: String(tpl._id), gupshupTemplateId: tpl.gupshupTemplateId },
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('[whatsapp-templates] delete failed:', err);
    res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

router.post('/:id/submit', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const Template = await getModel();
    const tpl = await Template.findOne({ _id: req.params.id, businessId });
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (tpl.status !== 'draft' && tpl.status !== 'rejected') {
      return res.status(400).json({ success: false, error: `Cannot submit a template in status "${tpl.status}"` });
    }

    const tenantApp = await resolveTenantGupshupApp(businessId);
    if (!tenantApp.connected || !tenantApp.appId) {
      tpl.status = 'rejected';
      tpl.rejectionReason = TENANT_APP_REQUIRED_MSG;
      tpl.submittedAt = null;
      tpl.lastSyncedAt = new Date();
      await tpl.save();

      await logEvent({
        businessId,
        actorType: 'user',
        actorId: req.user._id,
        event: 'template_submit',
        summary: `Template ${tpl.name}/${tpl.language} rejected — WhatsApp app not connected`,
        metadata: { templateId: String(tpl._id), reason: 'WHATSAPP_APP_NOT_CONNECTED' },
      });

      return res.status(400).json({
        success: false,
        error: TENANT_APP_REQUIRED_MSG,
        code: 'WHATSAPP_APP_NOT_CONNECTED',
        data: tpl,
      });
    }

    const {
      partnerApiPath,
      submission,
      remoteId,
      errorMessage: submitErrMsg,
    } = await submitTemplateForGupshupApproval({ appId: tenantApp.appId, templateDoc: tpl });
    logger.info(
      '[whatsapp-templates] Gupshup submit POST %s appId=%s sourceNumber=%s template=%s/%s',
      partnerApiPath,
      tenantApp.appId,
      tenantApp.sourceNumber || '(unknown)',
      tpl.name,
      tpl.language
    );
    const gupshupMeta = {
      appId: tenantApp.appId,
      sourceNumber: tenantApp.sourceNumber,
      appName: tenantApp.appName,
      partnerApi: `POST ${partnerApiPath}`,
    };
    if (!submission.success) {
      const errMsg = submitErrMsg || gupshupSubmissionErrorMessage(submission);

      // Name already registered on this WABA (common after app switch or a prior
      // submit) — link the existing remote row instead of failing outright.
      if (isGupshupTemplateDuplicateError(errMsg)) {
        const existing = await resolveTenantTemplateRemote({
          appId: tenantApp.appId,
          templateId: null,
          elementName: tpl.name,
          language: tpl.language,
        });
        if (existing.success) {
          applyRemoteToLocal(tpl, existing.data);
          tpl.submittedAt = tpl.submittedAt || new Date();
          tpl.rejectionReason = null;
          await tpl.save();

          await logEvent({
            businessId,
            actorType: 'user',
            actorId: req.user._id,
            event: 'template_submit',
            summary: `Linked existing Gupshup template ${tpl.name}/${tpl.language} (${tpl.status})`,
            metadata: {
              templateId: String(tpl._id),
              gupshupTemplateId: tpl.gupshupTemplateId,
              status: tpl.status,
              linkedExisting: true,
            },
          });

          return res.json({
            success: true,
            data: tpl,
            gupshup: gupshupMeta,
            linkedExisting: true,
            message:
              'Template already exists on your WhatsApp account — linked to the existing submission.',
          });
        }
      }

      tpl.status = 'rejected';
      tpl.rejectionReason = errMsg;
      tpl.submittedAt = new Date();
      tpl.lastSyncedAt = new Date();
      await tpl.save();

      await logEvent({
        businessId,
        actorType: 'user',
        actorId: req.user._id,
        event: 'template_submit',
        summary: `Template ${tpl.name}/${tpl.language} rejected by Gupshup`,
        metadata: { templateId: String(tpl._id), error: errMsg },
      });

      return res.status(400).json({
        success: false,
        error: errMsg,
        code: submission.code,
        details: typeof submission.error === 'object' && submission.error !== null ? submission.error : undefined,
        data: tpl,
        gupshup: gupshupMeta,
      });
    }

    tpl.gupshupTemplateId = remoteId ? String(remoteId) : tpl.gupshupTemplateId;
    tpl.metaTemplateId = tpl.gupshupTemplateId;
    const nextStatus = statusAfterGupshupApply(submission.data);
    tpl.status = nextStatus;
    tpl.submittedAt = new Date();
    tpl.lastSyncedAt = new Date();
    tpl.rejectionReason = nextStatus === 'rejected' ? gupshupSubmissionErrorMessage(submission) : null;
    if (nextStatus === 'approved' && !tpl.approvedAt) {
      tpl.approvedAt = new Date();
    }
    await tpl.save();

    await logEvent({
      businessId,
      actorType: 'user',
      actorId: req.user._id,
      event: 'template_submit',
      summary: `Submitted template ${tpl.name}/${tpl.language} (${nextStatus})`,
      metadata: { templateId: String(tpl._id), gupshupTemplateId: tpl.gupshupTemplateId, status: nextStatus },
    });

    res.json({ success: true, data: tpl, gupshup: gupshupMeta });
  } catch (err) {
    logger.error('[whatsapp-templates] submit failed:', err);
    res.status(500).json({ success: false, error: 'Failed to submit template' });
  }
});

router.post('/:id/sync', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const Template = await getModel();
    const tpl = await Template.findOne({ _id: req.params.id, businessId });
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (!tpl.gupshupTemplateId && !tpl.metaTemplateId) {
      return res.status(400).json({ success: false, error: 'Template has not been submitted to Gupshup yet' });
    }
    const appCtx = await requireTenantGupshupAppId(businessId);
    if (!appCtx.ok) return tenantAppRequiredResponse(res);
    const templateId = tpl.gupshupTemplateId || tpl.metaTemplateId;
    const result = await resolveTenantTemplateRemote({
      appId: appCtx.appId,
      templateId,
      elementName: tpl.name,
      language: tpl.language,
    });
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: gupshupApiErrorMessage(result.error),
        code: result.code,
      });
    }
    applyRemoteToLocal(tpl, result.data);
    if (result.staleIdReplaced) {
      logger.info(
        '[whatsapp-templates] sync replaced stale gupshupTemplateId for %s/%s',
        tpl.name,
        tpl.language
      );
    }
    tpl.lastSyncedAt = new Date();
    await tpl.save();
    res.json({ success: true, data: tpl });
  } catch (err) {
    logger.error('[whatsapp-templates] sync failed:', err);
    res.status(500).json({ success: false, error: 'Failed to sync template' });
  }
});

router.post('/sync-all', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const Template = await getModel();
    const appCtx = await requireTenantGupshupAppId(businessId);
    if (!appCtx.ok) return tenantAppRequiredResponse(res);
    const result = await gupshupWhatsApp.listTemplates({ appId: appCtx.appId });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    const remoteList = extractTemplateList(result.data);
    let imported = 0;
    let updated = 0;
    for (const remote of remoteList) {
      const filter = {
        businessId,
        $or: [
          { gupshupTemplateId: String(remote.id || remote.templateId || '') },
          { metaTemplateId: String(remote.id || remote.templateId || '') },
          { name: remote.elementName || remote.name, language: remote.language || remote.languageCode },
        ],
      };
      const existing = await Template.findOne(filter);
      if (existing) {
        applyRemoteToLocal(existing, remote);
        await existing.save();
        updated += 1;
      } else {
        const normalized = normalizeGupshupTemplateRecord(remote);
        // Import new template (Meta-managed or admin-created in Meta Manager).
        const adapted = adaptComponentsFromMeta(remote.components) || {};
        const created = new Template({
          businessId,
          name: normalized.elementName || normalized.name || remote.elementName || remote.name,
          language: normalized.language || remote.language || remote.languageCode || 'en_US',
          category: String(remote.category || 'UTILITY').toUpperCase(),
          status: mapGupshupStatus(normalized.status) || 'pending',
          gupshupTemplateId: String(normalized.id || remote.id || remote.templateId || ''),
          metaTemplateId: String(normalized.id || remote.id || remote.templateId || ''),
          metaTemplateName: normalized.elementName || normalized.name || remote.elementName || remote.name,
          components: adapted,
          submittedAt: new Date(),
          lastSyncedAt: new Date(),
          approvedAt: mapGupshupStatus(normalized.status) === 'approved' ? new Date() : null,
          previousCategory: remote.previous_category
            ? String(remote.previous_category).toUpperCase()
            : null,
        });
        await created.save();
        imported += 1;
      }
    }
    res.json({ success: true, imported, updated, total: remoteList.length });
  } catch (err) {
    logger.error('[whatsapp-templates] sync-all failed:', err);
    res.status(500).json({ success: false, error: 'Failed to sync templates from Gupshup' });
  }
});

router.put('/:id/map', authenticateToken, requireManager, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const raw = req.body?.slotKey;
    const slotKey =
      raw === null || raw === undefined || String(raw).trim() === ''
        ? null
        : String(raw).trim();
    if (slotKey && !NOTIFICATION_SLOT_KEYS.includes(slotKey)) {
      return res.status(400).json({ success: false, error: 'Invalid notification slot' });
    }

    const Template = await getModel();
    const tpl = await Template.findOne({ _id: req.params.id, businessId });
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });

    if (slotKey && tpl.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Template must be approved by Meta before it can be mapped to notifications',
      });
    }

    if (slotKey) {
      await Template.updateMany(
        { businessId, _id: { $ne: tpl._id }, slotKey },
        { $set: { slotKey: null } }
      );
    }
    tpl.slotKey = slotKey;
    await tpl.save();

    let notificationLink = null;
    if (slotKey) {
      notificationLink = await applyApprovedTemplateToBusinessNotificationSlot(
        businessId,
        slotKey,
        tpl.toObject ? tpl.toObject() : tpl
      );
    }

    res.json({ success: true, data: tpl, notificationLink });
  } catch (err) {
    logger.error('[whatsapp-templates] map failed:', err);
    res.status(500).json({ success: false, error: 'Failed to map template' });
  }
});

router.get('/:id', authenticateToken, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const Template = await getModel();
    const tpl = await Template.findOne({ _id: req.params.id, businessId }).lean();
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    res.json({ success: true, data: tpl });
  } catch (err) {
    logger.error('[whatsapp-templates] get failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load template' });
  }
});

module.exports = router;
