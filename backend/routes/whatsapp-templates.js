/**
 * WhatsApp templates (Meta Cloud API).
 * Mounted at /api/whatsapp/v2/templates.
 *
 * Endpoints:
 *  - GET    /                — paginated list with status/search filters
 *  - GET    /:id             — single template
 *  - GET    /from-meta       — live read from Meta (preview before import)
 *  - POST   /                — create draft
 *  - PUT    /:id             — edit draft / rejected
 *  - POST   /:id/submit      — submit draft to Meta for approval
 *  - POST   /:id/sync        — pull latest state from Meta into local row
 *  - POST   /sync-all        — bulk pull every template Meta has on this WABA
 *  - DELETE /:id             — delete (calls Meta's DELETE first when applicable)
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateToken, requireManager } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const requireWabaAddon = require('../middleware/waba-addon');
const { logger } = require('../utils/logger');

/**
 * Every endpoint in this router operates on Meta WABA templates and is
 * therefore gated on the `waba` add-on. The middleware order
 * (authenticateToken → setupMainDatabase → requireWabaAddon) is preserved
 * per-route so multitenant DB context is set up before the gate query runs.
 */

const databaseManager = require('../config/database-manager');
const metaWhatsApp = require('../services/meta-whatsapp-service');
const { logEvent } = require('../lib/whatsapp-audit');
const {
  whatsappTemplateBodySchema,
  whatsappTemplateUpdateBodySchema,
  whatsappTemplateListQuerySchema,
} = require('../validation/schemas');

const {
  resolveTenantBusinessObjectId,
  normalizeOptionalObjectId,
} = require('../lib/tenant-business-id');

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

/**
 * Map a remote Meta status (case-insensitive) to one of the local enum values.
 * Returns null if the remote value isn't a known status, so the caller can
 * leave the local status untouched (defensive against new Meta states).
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
  const mapped = mapMetaStatus(remote.status);
  if (mapped) {
    tpl.status = mapped;
    if (mapped === 'approved' && !tpl.approvedAt) tpl.approvedAt = new Date();
    if (mapped === 'rejected') {
      tpl.rejectionReason = remote.rejected_reason || tpl.rejectionReason || null;
    }
  }
  if (remote.id) tpl.metaTemplateId = String(remote.id);
  tpl.metaTemplateName = remote.name || tpl.metaTemplateName || tpl.name;
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
    const { status, search, limit = 50, skip = 0 } = parsed.data;
    const filter = { businessId };
    if (status) filter.status = status;
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

router.get('/from-meta', authenticateToken, setupMainDatabase, requireWabaAddon, async (req, res) => {
  try {
    const businessId = await tenantBusinessObjectId(req, res);
    if (!businessId) return;
    const result = await metaWhatsApp.listTemplates({ businessId, limit: 100 });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, data: result.data?.data || [] });
  } catch (err) {
    logger.error('[whatsapp-templates] from-meta failed:', err);
    res.status(500).json({ success: false, error: 'Failed to load Meta templates' });
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

    /**
     * If Meta has a copy (any status other than `draft`), call Meta DELETE
     * first. Pass `?force=1` to remove the local row even if Meta returns
     * an error — useful for reconciling rows where Meta has already deleted
     * the template.
     */
    if (tpl.metaTemplateId || tpl.status !== 'draft') {
      const remote = await metaWhatsApp.deleteTemplate({
        businessId,
        name: tpl.name,
        metaTemplateId: tpl.metaTemplateId,
      });
      if (!remote.success && req.query.force !== '1') {
        return res.status(400).json({
          success: false,
          error: 'Meta refused the delete. Pause the template instead, or pass ?force=1 to delete locally only.',
          details: remote.error,
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
      metadata: { templateId: String(tpl._id), metaTemplateId: tpl.metaTemplateId },
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

    const components = buildMetaComponents(tpl);
    const submission = await metaWhatsApp.submitTemplate({
      businessId,
      name: tpl.name,
      language: tpl.language,
      category: tpl.category,
      components,
    });
    if (!submission.success) {
      let errMsg;
      if (typeof submission.error === 'string') {
        errMsg = submission.error;
      } else if (submission.error?.error?.message) {
        errMsg = submission.error.error.message;
      } else {
        errMsg = 'Meta rejected the template submission';
      }
      return res.status(400).json({
        success: false,
        error: errMsg,
        code: submission.code,
        details: typeof submission.error === 'object' && submission.error !== null ? submission.error : undefined,
      });
    }
    tpl.metaTemplateId = submission.data?.id || null;
    tpl.metaTemplateName = tpl.name;
    tpl.status = 'pending';
    tpl.submittedAt = new Date();
    tpl.lastSyncedAt = new Date();
    tpl.rejectionReason = null;
    await tpl.save();

    await logEvent({
      businessId,
      actorType: 'user',
      actorId: req.user._id,
      event: 'template_submit',
      summary: `Submitted template ${tpl.name}/${tpl.language}`,
      metadata: { templateId: String(tpl._id), metaTemplateId: tpl.metaTemplateId },
    });

    res.json({ success: true, data: tpl });
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
    if (!tpl.metaTemplateId) {
      return res.status(400).json({ success: false, error: 'Template has not been submitted to Meta yet' });
    }
    const result = await metaWhatsApp.getTemplate({ businessId, metaTemplateId: tpl.metaTemplateId });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    applyRemoteToLocal(tpl, result.data || {});
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
    const result = await metaWhatsApp.listTemplates({ businessId, limit: 100 });
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    const remoteList = Array.isArray(result.data?.data) ? result.data.data : [];
    let imported = 0;
    let updated = 0;
    for (const remote of remoteList) {
      const filter = {
        businessId,
        $or: [
          { metaTemplateId: String(remote.id || '') },
          { name: remote.name, language: remote.language },
        ],
      };
      const existing = await Template.findOne(filter);
      if (existing) {
        applyRemoteToLocal(existing, remote);
        await existing.save();
        updated += 1;
      } else {
        // Import new template (Meta-managed or admin-created in Meta Manager).
        const adapted = adaptComponentsFromMeta(remote.components) || {};
        const created = new Template({
          businessId,
          name: remote.name,
          language: remote.language || 'en_US',
          category: String(remote.category || 'UTILITY').toUpperCase(),
          status: mapMetaStatus(remote.status) || 'pending',
          metaTemplateId: String(remote.id || ''),
          metaTemplateName: remote.name,
          components: adapted,
          submittedAt: new Date(),
          lastSyncedAt: new Date(),
          approvedAt: mapMetaStatus(remote.status) === 'approved' ? new Date() : null,
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
    res.status(500).json({ success: false, error: 'Failed to sync templates from Meta' });
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

/** Build the components array Meta expects from our normalised schema. */
function buildMetaComponents(tpl) {
  const out = [];
  const c = tpl.components || {};
  if (c.header && c.header.format) {
    const headerComp = { type: 'HEADER', format: c.header.format };
    if (c.header.format === 'TEXT' && c.header.text) headerComp.text = c.header.text;
    if (Array.isArray(c.header.examples) && c.header.examples.length > 0) {
      headerComp.example = { header_text: c.header.examples };
    }
    if (c.header.format !== 'TEXT' && c.header.mediaSampleUrl) {
      // Meta requires `header_url` examples for media headers (per template
      // submission spec). Pass the operator-provided sample URL.
      headerComp.example = headerComp.example || {};
      headerComp.example.header_url = [c.header.mediaSampleUrl];
    }
    out.push(headerComp);
  }
  if (c.body && c.body.text) {
    const bodyComp = { type: 'BODY', text: c.body.text };
    if (Array.isArray(c.body.examples) && c.body.examples.length > 0) {
      bodyComp.example = { body_text: c.body.examples };
    }
    out.push(bodyComp);
  }
  if (c.footer && c.footer.text) {
    out.push({ type: 'FOOTER', text: c.footer.text });
  }
  if (Array.isArray(c.buttons) && c.buttons.length > 0) {
    const buttons = c.buttons.map((b) => {
      if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
      if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone };
      return { type: 'QUICK_REPLY', text: b.text };
    });
    out.push({ type: 'BUTTONS', buttons });
  }
  return out;
}

module.exports = router;
