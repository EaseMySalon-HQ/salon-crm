/**
 * Inbox endpoints — list conversations + read thread + reply + consent override.
 *
 * Mounted at /api/whatsapp/v2/inbox. All routes are gated by:
 *   1. authenticateToken     — staff-or-above session
 *   2. requireWabaAddon      — business must have the `waba` add-on enabled
 *
 * Why this file exists:
 *   The conversation row only stores `recipientPhone` + a `clientId` reference.
 *   For a useful inbox UI we need to JOIN that with the tenant `Client` doc
 *   so the operator sees the customer's NAME, opt-in state, and last
 *   marketing-opt-out timestamp inline. We do that join here instead of in
 *   the React layer because:
 *     - Tenant DB lookups would require a separate authenticated round-trip
 *     - We can apply search/filter on the joined fields (e.g. "show only
 *       opted-out clients") without fetching everything to the client
 */

'use strict';

const express = require('express');
const router = express.Router();

const { authenticateToken, requireStaff } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const requireWabaAddon = require('../middleware/waba-addon');
const { logger } = require('../utils/logger');
const databaseManager = require('../config/database-manager');
const { sendWhatsApp, normalizeRecipientPhone } = require('../lib/send-whatsapp');
const { INTENTS } = require('../lib/whatsapp-intents');
const { logEvent } = require('../lib/whatsapp-audit');
const {
  normaliseConsentUpdate,
  recordConsentEvent,
} = require('../lib/client-consent');
const {
  describeTemplatePlaceholders,
  buildComponentsFromVariables,
} = require('../lib/whatsapp-template-components');

async function getMainModels() {
  const main = await databaseManager.getMainConnection();
  return {
    main,
    Conversation: main.model(
      'WhatsAppConversation',
      require('../models/WhatsAppConversation').schema
    ),
    Message: main.model('WhatsAppMessage', require('../models/WhatsAppMessage').schema),
    Template: main.model(
      'WhatsAppTemplate',
      require('../models/WhatsAppTemplate').schema
    ),
  };
}

async function getTenantClientModel(businessId) {
  const main = await databaseManager.getMainConnection();
  const tenant = await databaseManager.getConnection(String(businessId), main);
  return tenant.model('Client', require('../models/Client').schema);
}

/**
 * Enrich a batch of conversations with the matching tenant Client docs in
 * ONE round trip. We try to match by `clientId` first (set when an outbound
 * message originated from a client record), then fall back to suffix-matching
 * the recipientPhone — this keeps inbound webhooks from unknown numbers from
 * silently disappearing.
 */
async function attachClientInfo(conversations, businessId) {
  if (conversations.length === 0) return conversations;
  let Client;
  try {
    Client = await getTenantClientModel(businessId);
  } catch (err) {
    logger.warn(`[whatsapp-inbox] tenant DB unavailable for ${businessId}: ${err?.message || err}`);
    return conversations.map((c) => ({ ...c, client: null }));
  }
  const clientIds = conversations.map((c) => c.clientId).filter(Boolean);
  /**
   * Phones are stored as 10-digit local in the CRM but conversations track
   * the canonical international form ("917091140602"). Strip the country
   * code suffix-search hack: take the last 10 digits and match against
   * Client.phone using a $regex anchor — this resolves both legacy and
   * normalized rows.
   */
  const phoneSuffixes = conversations.map((c) =>
    String(c.recipientPhone || '').replace(/\D/g, '').slice(-10)
  );
  const phoneOr = phoneSuffixes.length
    ? phoneSuffixes.map((suffix) => ({ phone: { $regex: suffix + '$' } }))
    : [];
  const filter = {
    $or: [
      ...(clientIds.length ? [{ _id: { $in: clientIds } }] : []),
      ...phoneOr,
    ],
  };
  if (filter.$or.length === 0) return conversations.map((c) => ({ ...c, client: null }));

  const clients = await Client.find(filter)
    .select('_id name phone email gender whatsappConsent')
    .lean();
  const byId = new Map(clients.map((c) => [String(c._id), c]));
  const bySuffix = new Map();
  for (const c of clients) {
    const suffix = String(c.phone || '').replace(/\D/g, '').slice(-10);
    if (suffix && !bySuffix.has(suffix)) bySuffix.set(suffix, c);
  }
  return conversations.map((c) => {
    const direct = c.clientId ? byId.get(String(c.clientId)) : null;
    const suffix = String(c.recipientPhone || '').replace(/\D/g, '').slice(-10);
    const fallback = direct || (suffix ? bySuffix.get(suffix) : null);
    if (!fallback) return { ...c, client: null };
    return {
      ...c,
      client: {
        _id: fallback._id,
        name: fallback.name,
        phone: fallback.phone,
        email: fallback.email,
        gender: fallback.gender,
        whatsappConsent: fallback.whatsappConsent || null,
      },
    };
  });
}

function decorateWindowFlags(conv) {
  const now = Date.now();
  return {
    ...conv,
    cswOpen: conv.cswExpiresAt ? new Date(conv.cswExpiresAt).getTime() > now : false,
    fepOpen: conv.fepExpiresAt ? new Date(conv.fepExpiresAt).getTime() > now : false,
    cswExpiresInMs: conv.cswExpiresAt
      ? Math.max(0, new Date(conv.cswExpiresAt).getTime() - now)
      : 0,
  };
}

/* ===================================================================== *
 * GET / — paginated, searchable, filtered conversation list
 * ===================================================================== */
router.get(
  '/',
  authenticateToken,
  requireStaff,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const { Conversation } = await getMainModels();
      const businessId = req.user.branchId;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const filterMode = String(req.query.filter || 'all');
      const q = String(req.query.q || '').trim();

      const dbFilter = { businessId };
      if (filterMode === 'unread') dbFilter.unreadCount = { $gt: 0 };
      if (filterMode === 'open') dbFilter.cswExpiresAt = { $gt: new Date() };
      if (filterMode === 'resolved') dbFilter.resolved = true;
      // `optedout` is a Client-level filter; we apply it AFTER the join.

      if (q) {
        // Phone search — accept any digit format; normalize to digit-only.
        const digits = q.replace(/\D/g, '');
        if (digits) {
          dbFilter.recipientPhone = { $regex: digits.slice(-10) + '$' };
        }
      }

      const docs = await Conversation.find(dbFilter)
        .sort({ lastInboundAt: -1, updatedAt: -1 })
        .limit(limit)
        .lean();

      let enriched = await attachClientInfo(docs, businessId);

      if (filterMode === 'optedout') {
        enriched = enriched.filter(
          (c) =>
            c.client?.whatsappConsent?.optedIn === false ||
            Boolean(c.client?.whatsappConsent?.waMarketingOptOut)
        );
      }

      // Name search runs after enrichment because the name lives on Client.
      let items = enriched.map(decorateWindowFlags);
      if (q && /[a-zA-Z]/.test(q)) {
        const ql = q.toLowerCase();
        items = items.filter(
          (c) =>
            (c.client?.name || '').toLowerCase().includes(ql) ||
            String(c.recipientPhone || '').includes(ql)
        );
      }

      res.json({ success: true, data: items });
    } catch (err) {
      logger.error('[whatsapp-inbox] list failed:', err);
      res.status(500).json({ success: false, error: 'Failed to load inbox' });
    }
  }
);

/* ===================================================================== *
 * GET /:conversationId — full thread + client context
 * ===================================================================== */
router.get(
  '/:conversationId',
  authenticateToken,
  requireStaff,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const { Conversation, Message } = await getMainModels();
      const businessId = req.user.branchId;
      const conv = await Conversation.findOne({
        _id: req.params.conversationId,
        businessId,
      }).lean();
      if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

      /**
       * Pull both the canonical-format and the legacy 10-digit suffix in case
       * older messages were persisted before phone normalization landed.
       * Without this fallback, threads created before the normalization fix
       * would appear empty in the inbox UI.
       */
      const suffix = String(conv.recipientPhone || '').replace(/\D/g, '').slice(-10);
      const messages = await Message.find({
        businessId,
        recipientPhone: { $regex: suffix + '$' },
      })
        .sort({ timestamp: -1 })
        .limit(200)
        .lean();

      if (conv.unreadCount && conv.unreadCount > 0) {
        await Conversation.updateOne({ _id: conv._id }, { $set: { unreadCount: 0 } });
      }

      const [enriched] = await attachClientInfo([conv], businessId);
      const decorated = decorateWindowFlags(enriched);

      res.json({
        success: true,
        data: {
          conversation: decorated,
          messages,
        },
      });
    } catch (err) {
      logger.error('[whatsapp-inbox] thread failed:', err);
      res.status(500).json({ success: false, error: 'Failed to load conversation' });
    }
  }
);

/* ===================================================================== *
 * POST /:conversationId/reply — text (CSW) or approved-template
 * ===================================================================== */
router.post(
  '/:conversationId/reply',
  authenticateToken,
  requireStaff,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      const { Conversation, Template } = await getMainModels();
      const conv = await Conversation.findOne({
        _id: req.params.conversationId,
        businessId,
      });
      if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

      const {
        mode = 'text',
        text,
        templateName,
        language = 'en_US',
        components: rawComponents,
        variables: rawVariables,
      } = req.body || {};
      const isService = mode === 'text';

      if (isService && !text?.trim()) {
        return res.status(400).json({ success: false, error: 'Reply text cannot be empty' });
      }
      if (!isService && !templateName) {
        return res
          .status(400)
          .json({ success: false, error: 'Template name is required for template replies' });
      }

      /**
       * Build the Meta `components` payload server-side when the caller
       * sent a flat `variables` map. The inbox composer collects values
       * keyed by placeholder index ("1", "2", "h1") — we look up the
       * template and translate that into Meta's positional `components`.
       *
       * Falls back to whatever the caller provided in `components` when
       * no `variables` map is sent — preserves backward compatibility for
       * any earlier client code that built the array itself.
       */
      let components = Array.isArray(rawComponents) ? rawComponents : [];
      if (!isService && rawVariables && typeof rawVariables === 'object') {
        const tpl = await Template.findOne({
          businessId,
          name: templateName,
          language,
        }).lean();
        if (!tpl) {
          return res.status(404).json({
            success: false,
            error: `Template "${templateName}" (${language}) not found for this business.`,
          });
        }
        if (tpl.status !== 'approved') {
          return res.status(400).json({
            success: false,
            error: `Template "${templateName}" is not approved (status: ${tpl.status}). Approved templates only.`,
          });
        }
        components = buildComponentsFromVariables(tpl, rawVariables);
      }

      const result = await sendWhatsApp({
        businessId,
        clientId: conv.clientId,
        intent: INTENTS.STAFF_ALERT,
        recipientPhone: conv.recipientPhone,
        isService,
        serviceText: text,
        templateName,
        language,
        components,
        actorId: req.user._id,
        actorType: 'user',
        bucketSeconds: 5,
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: typeof result.error === 'string' ? result.error : (result.error?.error?.message || 'Reply failed'),
        });
      }

      await logEvent({
        businessId,
        actorType: 'user',
        actorId: req.user._id,
        event: 'inbox_reply',
        summary: isService
          ? 'Inbox text reply (CSW)'
          : `Inbox template reply (${templateName})`,
        metadata: {
          conversationId: String(conv._id),
          messageId: String(result.message?._id || ''),
          mode,
          templateName: templateName || null,
        },
      });

      res.json({ success: true, data: { messageId: result.message?._id } });
    } catch (err) {
      logger.error('[whatsapp-inbox] reply failed:', err);
      res.status(500).json({ success: false, error: err?.message || 'Reply failed' });
    }
  }
);

/* ===================================================================== *
 * GET /templates/:name — placeholder schema for inbox composer
 *
 * The inbox composer needs to render an input field per `{{N}}` placeholder
 * the moment a template is selected. Rather than fetch the entire template
 * list and re-derive locally, we expose a focused endpoint that returns the
 * minimum surface the composer needs: header / body text, language, status,
 * and the list of placeholder descriptors (key, label, sample, index). The
 * UI can do `placeholders.body.length === 0` to skip rendering a variables
 * section entirely for plain templates.
 * ===================================================================== */
router.get(
  '/templates/:name',
  authenticateToken,
  requireStaff,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      const { Template } = await getMainModels();
      const language = String(req.query.language || 'en_US');
      const tpl = await Template.findOne({
        businessId,
        name: req.params.name,
        language,
      }).lean();
      if (!tpl) {
        return res
          .status(404)
          .json({ success: false, error: `Template "${req.params.name}" (${language}) not found.` });
      }
      const placeholders = describeTemplatePlaceholders(tpl);
      res.json({
        success: true,
        data: {
          name: tpl.name,
          language: tpl.language,
          status: tpl.status,
          category: tpl.category,
          components: tpl.components || {},
          placeholders,
        },
      });
    } catch (err) {
      logger.error('[whatsapp-inbox] template detail failed:', err);
      res.status(500).json({ success: false, error: 'Failed to load template' });
    }
  }
);

/* ===================================================================== *
 * POST /:conversationId/resolve — resolve/reopen toggle
 * ===================================================================== */
router.post(
  '/:conversationId/resolve',
  authenticateToken,
  requireStaff,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const { Conversation } = await getMainModels();
      const conv = await Conversation.findOneAndUpdate(
        { _id: req.params.conversationId, businessId: req.user.branchId },
        {
          $set: {
            resolved: Boolean(req.body?.resolved ?? true),
            assignedTo: req.body?.assignedTo || null,
          },
        },
        { new: true }
      );
      if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
      res.json({ success: true, data: conv });
    } catch (err) {
      logger.error('[whatsapp-inbox] resolve failed:', err);
      res.status(500).json({ success: false, error: 'Failed to update conversation' });
    }
  }
);

/* ===================================================================== *
 * POST /:conversationId/consent — manual opt-in / opt-out override
 *
 * Staff sometimes need to record verbal consent ("client said yes on the
 * phone, please mark them opted in") or honor a verbal opt-out. We force a
 * non-empty `reason` for compliance traceability and record both:
 *   - Tenant Client.whatsappConsent (the operating state)
 *   - Tenant ClientConsentEvent (the audit trail)
 * via the same helpers used by the client form, so the inbox path is just
 * another producer for the existing pipeline.
 * ===================================================================== */
router.post(
  '/:conversationId/consent',
  authenticateToken,
  requireStaff,
  setupMainDatabase,
  requireWabaAddon,
  async (req, res) => {
    try {
      const businessId = req.user.branchId;
      const { Conversation } = await getMainModels();
      const conv = await Conversation.findOne({
        _id: req.params.conversationId,
        businessId,
      }).lean();
      if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

      const { optedIn, reason } = req.body || {};
      if (typeof optedIn !== 'boolean') {
        return res
          .status(400)
          .json({ success: false, error: '`optedIn` (boolean) is required' });
      }
      if (!reason || !String(reason).trim()) {
        return res
          .status(400)
          .json({ success: false, error: 'A reason is required for any manual consent override' });
      }

      const main = await databaseManager.getMainConnection();
      const tenantConn = await databaseManager.getConnection(String(businessId), main);
      const Client = tenantConn.model('Client', require('../models/Client').schema);

      let client = conv.clientId
        ? await Client.findById(conv.clientId)
        : null;

      if (!client) {
        const suffix = String(conv.recipientPhone || '').replace(/\D/g, '').slice(-10);
        if (suffix) {
          client = await Client.findOne({ phone: { $regex: suffix + '$' } });
        }
      }

      if (!client) {
        return res.status(404).json({
          success: false,
          error:
            'No client record matches this conversation phone number. Add the contact to your CRM first, then retry.',
        });
      }

      const incoming = {
        optedIn,
        source: 'staff',
        ...(optedIn
          ? { optInReason: String(reason).trim() }
          : { optOutReason: String(reason).trim() }),
      };

      const { next, changed, event } = normaliseConsentUpdate({
        existing: client.whatsappConsent || null,
        incoming,
        actor: { type: 'user', id: req.user._id },
      });

      /**
       * `normaliseConsentUpdate` only manages `optedIn / optedInAt /
       * optedOutAt / *Reason`. The Meta-level marketing opt-out flag
       * (`waMarketingOptOut`, set when a recipient hits "Stop promotions"
       * inside WhatsApp) is a separate signal that compliance requires a
       * deliberate staff action to clear. We do that here:
       *   - Manual opt-in → clear `waMarketingOptOut` (verbal consent re-arms marketing).
       *   - Manual opt-out → set `waMarketingOptOut` so future campaigns also exclude them.
       * Without this, a "Mark opted in" override would leave the Stop flag
       * intact and the client would still be filtered out by the marketing
       * audience query in whatsapp-campaigns.js.
       */
      const marketingPatch = optedIn
        ? { waMarketingOptOut: false, waMarketingOptOutAt: null }
        : { waMarketingOptOut: true, waMarketingOptOutAt: new Date() };
      const finalConsent = { ...(next || {}), ...marketingPatch };

      const stateActuallyChanged =
        changed ||
        Boolean(client.whatsappConsent?.waMarketingOptOut) !==
          Boolean(finalConsent.waMarketingOptOut);

      if (!stateActuallyChanged) {
        return res.json({
          success: true,
          data: { client: { _id: client._id, whatsappConsent: client.whatsappConsent } },
          message: 'Consent already in the requested state',
        });
      }

      client.whatsappConsent = finalConsent;
      await client.save();

      await recordConsentEvent({
        tenantConnection: tenantConn,
        branchId: client.branchId,
        clientId: client._id,
        channel: 'whatsapp',
        event: event || (optedIn ? 'opt_in' : 'opt_out'),
        source: 'staff',
        actorType: 'user',
        actorId: req.user._id,
        reason: String(reason).trim(),
      });

      await logEvent({
        businessId,
        actorType: 'user',
        actorId: req.user._id,
        event: optedIn ? 'consent_optin' : 'consent_optout',
        summary: optedIn
          ? `Manual opt-in for ${conv.recipientPhone}`
          : `Manual opt-out for ${conv.recipientPhone}`,
        metadata: {
          conversationId: String(conv._id),
          clientId: String(client._id),
          reason: String(reason).trim(),
        },
      });

      res.json({
        success: true,
        data: { client: { _id: client._id, whatsappConsent: client.whatsappConsent } },
      });
    } catch (err) {
      logger.error('[whatsapp-inbox] consent override failed:', err);
      res.status(500).json({ success: false, error: 'Failed to update consent' });
    }
  }
);

module.exports = router;
