/**
 * Meta Cloud API webhook endpoint.
 *
 * Mounted at /api/webhooks/whatsapp/meta. Uses `express.raw` so the HMAC
 * signature can be verified against the raw body before any JSON parsing.
 *
 * Handles:
 *   - GET  : Meta hub challenge / verify-token handshake.
 *   - POST : message statuses, inbound messages, account/template events.
 *
 * Status updates apply a monotonic priority rule
 * (queued < sent < delivered < read < failed) so out-of-order webhooks never
 * downgrade a terminal state. Inbound messages open the CSW (and the FEP
 * window when the inbound is a CTWA referral). Inbound bodies that match
 * STOP / UNSUBSCRIBE auto opt-out the client.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const { resolveCostPaise } = require('../config/whatsapp-pricing');
const { logEvent } = require('../lib/whatsapp-audit');
const { getMetaConfig } = require('../lib/whatsapp-meta-config');

const STATUS_PRIORITY = { queued: 1, sent: 2, delivered: 3, read: 4, failed: 99 };
const TERMINAL = new Set(['failed']);
const STOP_WORDS = /^\s*(STOP|UNSUBSCRIBE|OPTOUT|OPT-OUT|OPT OUT)\b/i;

/**
 * Extract a single best-effort string from any of the inbound message types
 * documented in the Graph API v23.0 webhook spec (text / button / interactive
 * replies / image / document / audio / video / location / contacts / order /
 * reaction / unsupported / system). Used for STOP detection and inbox preview.
 */
function extractInboundSurface(inbound) {
  if (!inbound) return { text: null, preview: null };
  // Plain text body
  if (inbound.type === 'text' || inbound.text?.body) {
    const body = inbound.text?.body || '';
    return { text: body, preview: body };
  }
  // Quick reply tap on a template button — Meta sends both `text` and `payload`
  if (inbound.type === 'button' || inbound.button) {
    const text = inbound.button?.text || inbound.button?.payload || '';
    return { text, preview: text };
  }
  // Interactive list / button replies
  if (inbound.type === 'interactive' || inbound.interactive) {
    const i = inbound.interactive || {};
    const t =
      i.list_reply?.title ||
      i.button_reply?.title ||
      i.list_reply?.description ||
      '';
    return { text: t, preview: t };
  }
  // Reactions
  if (inbound.type === 'reaction' || inbound.reaction) {
    const emoji = inbound.reaction?.emoji || '';
    return { text: null, preview: emoji ? `Reaction: ${emoji}` : 'Reaction' };
  }
  // Media types — caption (when present) is the most useful preview
  if (inbound.image) return { text: null, preview: inbound.image.caption || '[Image]' };
  if (inbound.document) return { text: null, preview: inbound.document.caption || `[Document${inbound.document.filename ? `: ${inbound.document.filename}` : ''}]` };
  if (inbound.video) return { text: null, preview: inbound.video.caption || '[Video]' };
  if (inbound.audio) return { text: null, preview: '[Audio]' };
  if (inbound.sticker) return { text: null, preview: '[Sticker]' };
  if (inbound.location) {
    const name = inbound.location.name || inbound.location.address || 'Location';
    return { text: null, preview: `[Location] ${name}` };
  }
  if (inbound.contacts && inbound.contacts.length) {
    const first = inbound.contacts[0]?.name?.formatted_name || 'Contact';
    return { text: null, preview: `[Contact] ${first}` };
  }
  if (inbound.order) {
    const items = (inbound.order.product_items || []).length;
    return { text: null, preview: `[Order] ${items} item(s)` };
  }
  if (inbound.system) {
    return { text: null, preview: inbound.system.body || '[System message]' };
  }
  if (inbound.type === 'unsupported' || inbound.errors?.length) {
    return { text: null, preview: '[Unsupported message]' };
  }
  return { text: null, preview: null };
}

async function getModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Account: main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema),
    Message: main.model('WhatsAppMessage', require('../models/WhatsAppMessage').schema),
    Conversation: main.model(
      'WhatsAppConversation',
      require('../models/WhatsAppConversation').schema
    ),
    Template: main.model('WhatsAppTemplate', require('../models/WhatsAppTemplate').schema),
    Campaign: main.model('WhatsAppCampaign', require('../models/WhatsAppCampaign').schema),
    Business: main.model('Business', require('../models/Business').schema),
    WalletTransaction: main.model(
      'WalletTransaction',
      require('../models/WalletTransaction').schema
    ),
  };
}

function verifySignature(rawBuffer, headerSig, appSecret) {
  if (!headerSig || !appSecret) return false;
  const expected = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBuffer)
    .digest('hex')}`;
  try {
    const a = Buffer.from(headerSig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

router.get('/', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const cfg = await getMetaConfig();
    if (mode === 'subscribe' && token && cfg.verifyToken && token === cfg.verifyToken) {
      return res.status(200).send(String(challenge || ''));
    }
    return res.sendStatus(403);
  } catch (err) {
    logger.error('[whatsapp-webhook] verify failed:', err?.message || err);
    return res.sendStatus(500);
  }
});

router.post(
  '/',
  express.raw({ type: 'application/json', limit: '2mb' }),
  async (req, res) => {
    const sig = req.header('x-hub-signature-256');
    const cfg = await getMetaConfig();
    const appSecret = cfg.appSecret;
    if (!appSecret) {
      logger.error('[whatsapp-webhook] App Secret not configured; rejecting');
      return res.sendStatus(500);
    }
    if (!verifySignature(req.body, sig, appSecret)) {
      logger.warn('[whatsapp-webhook] signature mismatch');
      return res.sendStatus(401);
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.sendStatus(400);
    }

    // Always ack quickly so Meta doesn't retry; process async.
    res.sendStatus(200);

    setImmediate(() => {
      handlePayload(payload).catch((err) =>
        logger.error('[whatsapp-webhook] handler error:', err?.message || err)
      );
    });
  }
);

async function findAccountByPhoneNumberId(phoneNumberId) {
  const { Account } = await getModels();
  return Account.findOne({ phoneNumberId }).lean();
}

async function refundDebitForMessage({ msg, reason }) {
  const { Business, WalletTransaction } = await getModels();
  if (!msg?.costPaise || msg.costPaise <= 0) return false;
  try {
    const debitWasRecorded = await WalletTransaction.findOne({
      relatedEntityId: msg._id,
      type: 'debit',
    }).lean();
    if (!debitWasRecorded) return false;
    await Business.updateOne(
      { _id: msg.businessId },
      { $inc: { 'wallet.balancePaise': msg.costPaise } }
    );
    await WalletTransaction.create({
      businessId: msg.businessId,
      type: 'credit',
      amountPaise: msg.costPaise,
      channel: 'whatsapp',
      messageCategory: msg.category,
      provider: 'meta',
      description: `Refund (${reason}) WhatsApp ${msg.category || 'message'}`,
      relatedEntityId: msg._id,
      relatedEntityType: 'WhatsAppMessage',
      freeWindow: msg.freeWindow,
      priceListVersion: msg.priceListVersion || null,
      timestamp: new Date(),
    });
    return true;
  } catch (err) {
    logger.warn('[whatsapp-webhook] refund failed:', err?.message || err);
    return false;
  }
}

async function applyStatusEvent({ statusUpdate, account }) {
  const { Message, Conversation } = await getModels();
  const metaMessageId = statusUpdate.id;
  const newStatus = statusUpdate.status; // sent | delivered | read | failed
  if (!metaMessageId || !newStatus) return;

  const msg = await Message.findOne({ metaMessageId });
  if (!msg) {
    logger.warn(`[whatsapp-webhook] status for unknown message ${metaMessageId}`);
    return;
  }

  // Capture Meta-reported telemetry on every status event (the spec guarantees
  // these on `delivered` and on the conversation-opening status; we accept them
  // whenever they appear). These are the source of truth for billing/CSW.
  const conv = statusUpdate.conversation || null;
  const pricing = statusUpdate.pricing || null;
  if (conv) {
    if (conv.id) msg.metaConversationId = String(conv.id);
    if (conv.expiration_timestamp) {
      msg.metaConversationExpiresAt = new Date(Number(conv.expiration_timestamp) * 1000);
    }
    if (conv.origin?.type) msg.metaConversationOrigin = String(conv.origin.type);

    /**
     * Refresh the local Customer Service Window from Meta — but ONLY when
     * the conversation is service-category (or the recipient just messaged
     * the business). Other Meta "conversations" (marketing, utility,
     * authentication, referral_conversion) ALSO carry an
     * `expiration_timestamp`, but those are NOT the 24h CSW that permits
     * free-form text replies. Conflating them caused 131047 ("Re-engagement
     * message") errors at send-time even though our DB happily said CSW
     * was open.
     *
     * Per Graph API v23.0, the relevant signals are:
     *   - conversation.origin.type === 'service'   → user-initiated service window
     *   - pricing.category        === 'service'    → ditto, mirrored on pricing
     *   - conversation.origin.type === 'user_initiated' (legacy v15 spelling)
     * Only those three should refresh `cswExpiresAt`. Everything else stays
     * recorded on the message row (`metaConversation*` fields) but doesn't
     * touch the CSW.
     */
    const originType = String(conv.origin?.type || '').toLowerCase();
    const pricingCat = String(pricing?.category || '').toLowerCase();
    const isServiceWindow =
      originType === 'service' ||
      originType === 'user_initiated' ||
      pricingCat === 'service';

    if (
      isServiceWindow &&
      msg.businessId &&
      msg.recipientPhone &&
      conv.expiration_timestamp
    ) {
      try {
        await Conversation.findOneAndUpdate(
          { businessId: msg.businessId, recipientPhone: msg.recipientPhone },
          {
            $set: {
              cswExpiresAt: new Date(Number(conv.expiration_timestamp) * 1000),
              lastBusinessTemplateCategory: pricing?.category || null,
            },
            $setOnInsert: {
              businessId: msg.businessId,
              recipientPhone: msg.recipientPhone,
              cswOpenAt: new Date(),
            },
          },
          { upsert: true, new: false }
        );
      } catch (err) {
        logger.warn('[whatsapp-webhook] conversation refresh failed:', err?.message || err);
      }
    } else if (msg.businessId && msg.recipientPhone) {
      // Still keep `lastBusinessTemplateCategory` accurate even if we don't
      // touch the CSW — useful for analytics ("which message types are
      // hitting this customer most?").
      try {
        await Conversation.updateOne(
          { businessId: msg.businessId, recipientPhone: msg.recipientPhone },
          { $set: { lastBusinessTemplateCategory: pricing?.category || null } }
        );
      } catch (err) {
        // non-fatal
      }
    }
  }
  if (pricing) {
    if (typeof pricing.billable === 'boolean') msg.metaPricingBillable = pricing.billable;
    if (pricing.pricing_model) msg.metaPricingModel = String(pricing.pricing_model);
    if (pricing.category) msg.metaPricingCategory = String(pricing.category);
  }

  const currentP = STATUS_PRIORITY[msg.status] || 0;
  const newP = STATUS_PRIORITY[newStatus] || 0;

  msg.statusEvents.push({
    status: newStatus,
    at: new Date((statusUpdate.timestamp || Date.now()) * (statusUpdate.timestamp ? 1000 : 1)),
    raw: statusUpdate,
  });

  if (TERMINAL.has(msg.status)) {
    await msg.save();
    return;
  }
  if (newP <= currentP) {
    await msg.save();
    return;
  }

  msg.status = newStatus;
  if (newStatus === 'failed') {
    const rawCode = String(statusUpdate.errors?.[0]?.code || 'UNKNOWN');
    const rawTitle = String(
      statusUpdate.errors?.[0]?.title ||
        statusUpdate.errors?.[0]?.message ||
        ''
    );
    msg.failureCode = rawCode;
    /**
     * Replace Meta's terse `errors[0].title` (e.g. "Re-engagement message")
     * with a sentence the inbox operator can act on. Falls back to the raw
     * title for codes we don't recognize so we never lose information.
     */
    const friendlyByCode = {
      131047: 'Customer Service Window expired (>24h since last inbound). Use an approved template instead.',
      131026: 'Recipient is not a WhatsApp user — verify the phone number.',
      131030: 'Recipient is not on the Meta test number\'s allowed list. Add them in Meta Dashboard → WhatsApp → API Setup.',
      131005: 'Access denied — token lacks WhatsApp messaging permission. Reconnect WhatsApp.',
      131051: 'Unsupported message type for this recipient.',
      190: 'Access token expired or invalid. Reconnect WhatsApp via Settings → WhatsApp Integration.',
    };
    msg.failureReason = friendlyByCode[Number(rawCode)] || rawTitle || 'Send failed';

    /**
     * 131047 = "Re-engagement message" → Meta is telling us the CSW
     * actually expired. If our local row still believes CSW is open
     * (because of stale data from a non-service conversation refresh),
     * trust Meta's verdict and close it locally so the inbox UI flips to
     * template-only mode immediately. This prevents a repeated dead-end
     * where the operator keeps trying free-form replies and watching
     * them fail asynchronously.
     */
    if (Number(rawCode) === 131047 && msg.businessId && msg.recipientPhone) {
      try {
        await Conversation.updateOne(
          { businessId: msg.businessId, recipientPhone: msg.recipientPhone },
          { $set: { cswExpiresAt: new Date(Date.now() - 1000) } }
        );
      } catch (err) {
        // best-effort
      }
    }
  }

  // Finalize cost on delivered. Meta is the source of truth via `pricing.billable`:
  //  - billable === false → refund any debit we recorded at send time and mark free.
  //  - billable === true  → trust local rate-table for the amount (Meta does not
  //                          send the price; only the model + category + flag).
  if (newStatus === 'delivered' && account?.mode === 'live') {
    if (pricing && pricing.billable === false) {
      msg.freeWindow = true;
      const refunded = await refundDebitForMessage({ msg, reason: 'free conversation' });
      if (refunded) msg.costPaise = 0;
    } else if (msg.category && msg.category !== 'service') {
      const cost = resolveCostPaise({
        category: msg.category,
        countryCode: msg.countryCode || 'IN',
        freeWindow: false,
      });
      msg.costPaise = cost;
      // Wallet debit happens at send-time; the row above only patches the message.
    }
  }

  if (newStatus === 'failed') {
    await refundDebitForMessage({ msg, reason: 'failed' });
  }
  await msg.save();

  // Roll the per-message status up to the parent campaign's counters so the
  // UI can show real `delivered / read / failed` totals without an
  // aggregation query. We only $inc the counter that the status TRANSITIONED
  // into (priority guard above guarantees we never double-count). `sent` is
  // already counted at runCampaign send-time, so it's not bumped here.
  if (msg.campaignId && (newStatus === 'delivered' || newStatus === 'read' || newStatus === 'failed')) {
    try {
      const { Campaign } = await getModels();
      const counterField = `counts.${newStatus}`;
      await Campaign.updateOne(
        { _id: msg.campaignId },
        { $inc: { [counterField]: 1 } }
      );
    } catch (err) {
      logger.warn('[whatsapp-webhook] campaign counter update failed:', err?.message || err);
    }
  }
}

async function ensureConversation({ businessId, recipientPhone, clientId, openCSW, openFEP, preview }) {
  const { Conversation } = await getModels();
  const now = new Date();
  const set = { lastInboundAt: now };
  if (openCSW) {
    set.cswOpenAt = now;
    set.cswExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
  if (openFEP) {
    set.fepOpenAt = now;
    set.fepExpiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  }
  if (preview) set.lastInboundPreview = String(preview).slice(0, 200);
  return Conversation.findOneAndUpdate(
    { businessId, recipientPhone },
    {
      $set: set,
      $inc: { unreadCount: 1 },
      $setOnInsert: { businessId, recipientPhone, clientId: clientId || null },
    },
    { new: true, upsert: true }
  );
}

async function handleInboundMessage({ inbound, account }) {
  const { Message } = await getModels();
  const businessId = account.businessId;
  const recipientPhone = inbound.from;
  const { text, preview } = extractInboundSurface(inbound);

  // System messages (e.g. user_changed_number) carry no `contacts` payload.
  // We still want to record them and keep CSW open, but we shouldn't try to
  // count an unread for a system event.
  const isSystem = inbound.type === 'system' || Boolean(inbound.system);
  const isCTWA = inbound?.referral?.source_type === 'ad';
  const conv = await ensureConversation({
    businessId,
    recipientPhone,
    openCSW: !isSystem,
    openFEP: isCTWA && !isSystem,
    preview: preview,
  });

  // Best-effort client lookup across tenant DB (cheap fallback: just store the phone).
  const clientId = await resolveClientIdForBusiness(businessId, recipientPhone);

  await Message.create({
    businessId,
    provider: 'meta',
    direction: 'inbound',
    recipientPhone,
    clientId: clientId || null,
    metaMessageId: inbound.id,
    category: 'service',
    intent: 'inbound',
    conversationId: conv?._id || null,
    freeWindow: true,
    status: 'delivered',
    inboundText: text || preview,
    payload: inbound,
    timestamp: new Date(((inbound.timestamp || 0) * 1000) || Date.now()),
  }).catch((err) => {
    if (err?.code !== 11000) logger.warn('[whatsapp-webhook] inbound persist failed:', err?.message);
  });

  // STOP / UNSUBSCRIBE → opt-out. Cover all surfaces Meta may deliver:
  //   - free-text body
  //   - Quick Reply tap on a template button (button.text / button.payload)
  //   - Interactive list / button reply titles
  const optOutSurfaces = [
    inbound.text?.body,
    inbound.button?.text,
    inbound.button?.payload,
    inbound.interactive?.button_reply?.title,
    inbound.interactive?.list_reply?.title,
  ].filter(Boolean);
  const matchedStop = optOutSurfaces.find((s) => STOP_WORDS.test(String(s)));
  if (matchedStop) {
    await applyOptOut({
      businessId,
      recipientPhone,
      source: 'inbound_message',
      payload: { text: matchedStop, type: inbound.type },
    });
  }

  if (clientId) {
    await updateClientLastInbound(businessId, clientId);
  }
}

async function resolveClientIdForBusiness(businessId, phone) {
  try {
    const main = await databaseManager.getMainConnection();
    const tenantConn = await databaseManager.getConnection(businessId, main);
    const Client = tenantConn.model('Client', require('../models/Client').schema);
    const cleaned = String(phone || '').replace(/\D/g, '').slice(-10);
    const candidate = await Client.findOne({
      phone: { $regex: cleaned + '$' },
    })
      .select('_id')
      .lean();
    return candidate?._id || null;
  } catch (err) {
    logger.warn('[whatsapp-webhook] client lookup failed:', err?.message || err);
    return null;
  }
}

async function updateClientLastInbound(businessId, clientId) {
  try {
    const main = await databaseManager.getMainConnection();
    const tenantConn = await databaseManager.getConnection(businessId, main);
    const Client = tenantConn.model('Client', require('../models/Client').schema);
    await Client.updateOne(
      { _id: clientId },
      { $set: { 'whatsappConsent.lastInboundAt': new Date() } }
    );
  } catch (err) {
    logger.warn('[whatsapp-webhook] last inbound update failed:', err?.message || err);
  }
}

async function applyOptOut({ businessId, recipientPhone, source, payload }) {
  try {
    const main = await databaseManager.getMainConnection();
    const tenantConn = await databaseManager.getConnection(businessId, main);
    const Client = tenantConn.model('Client', require('../models/Client').schema);
    const ClientConsentEvent = tenantConn.model(
      'ClientConsentEvent',
      require('../models/ClientConsentEvent').schema
    );
    const cleaned = String(recipientPhone || '').replace(/\D/g, '').slice(-10);
    const client = await Client.findOne({ phone: { $regex: cleaned + '$' } });
    if (!client) return;
    const previouslyOptedIn = Boolean(client.whatsappConsent?.optedIn);
    client.whatsappConsent = {
      ...(client.whatsappConsent || {}),
      optedIn: false,
      source: source || 'inbound_message',
      optedOutAt: new Date(),
      optOutReason: 'STOP',
    };
    client.promotionalWhatsappEnabled = false;
    await client.save();
    if (previouslyOptedIn) {
      await ClientConsentEvent.create({
        clientId: client._id,
        branchId: client.branchId,
        channel: 'whatsapp',
        event: 'opt_out',
        source: source || 'inbound_message',
        actorType: 'webhook',
        actorId: null,
        reason: 'STOP / UNSUBSCRIBE inbound',
        payload,
        createdAt: new Date(),
      });
      await logEvent({
        businessId,
        actorType: 'webhook',
        actorId: null,
        event: 'client_optout',
        summary: 'Client opted out via STOP / UNSUBSCRIBE',
        metadata: { clientId: String(client._id), recipientPhone, payload },
      });
    }
  } catch (err) {
    logger.warn('[whatsapp-webhook] opt-out apply failed:', err?.message || err);
  }
}

async function applyTemplateUpdate({ businessId, change }) {
  if (!change) return;
  try {
    const { Template } = await getModels();
    const update = {};
    /**
     * Map every Meta event Meta documents on the
     * `message_template_status_update` field. Anything we don't know about
     * is logged but does not change status (defensive against new states).
     */
    const event = String(change.event || change.message_template_status || '').toUpperCase();
    switch (event) {
      case 'APPROVED':
        update.status = 'approved';
        update.approvedAt = new Date();
        update.rejectionReason = null;
        break;
      case 'REJECTED':
        update.status = 'rejected';
        update.rejectionReason = change.reason || change.rejection_reason || null;
        break;
      case 'DISABLED':
        update.status = 'disabled';
        break;
      case 'PAUSED':
        update.status = 'paused';
        break;
      case 'IN_APPEAL':
      case 'PENDING_DELETION':
        update.status = 'in_appeal';
        break;
      case 'FLAGGED':
        update.status = 'flagged';
        break;
      case 'PENDING':
      case 'SUBMITTED':
        update.status = 'pending';
        break;
      default:
        // Unknown event — bail without touching state. The audit row written
        // by the dispatcher still preserves the raw payload for forensics.
        logger.warn(`[whatsapp-webhook] unknown template event "${event}"`);
        return;
    }
    update.lastSyncedAt = new Date();

    const filter = {
      businessId,
      $or: [
        { metaTemplateId: String(change.message_template_id || change.id || '') },
        { name: change.message_template_name, language: change.message_template_language },
      ],
    };
    const updated = await Template.findOneAndUpdate(filter, { $set: update }, { new: true });
    if (!updated) {
      logger.warn(
        `[whatsapp-webhook] template event "${event}" had no matching local row (name=${change.message_template_name}, id=${change.message_template_id})`
      );
      return;
    }
    if (update.status === 'approved') {
      await logEvent({
        businessId,
        actorType: 'webhook',
        event: 'template_approved',
        summary: `Template ${updated.name} approved`,
        metadata: { templateId: String(updated._id), metaTemplateId: updated.metaTemplateId },
      });
    } else if (update.status === 'rejected') {
      await logEvent({
        businessId,
        actorType: 'webhook',
        event: 'template_rejected',
        summary: `Template ${updated.name} rejected`,
        metadata: { templateId: String(updated._id), reason: updated.rejectionReason },
      });
    } else if (update.status === 'paused') {
      await logEvent({
        businessId,
        actorType: 'webhook',
        event: 'template_paused',
        summary: `Template ${updated.name} paused`,
        metadata: { templateId: String(updated._id) },
      });
    } else if (update.status === 'disabled') {
      await logEvent({
        businessId,
        actorType: 'webhook',
        event: 'template_disabled',
        summary: `Template ${updated.name} disabled`,
        metadata: { templateId: String(updated._id) },
      });
    }
  } catch (err) {
    logger.warn('[whatsapp-webhook] template update failed:', err?.message || err);
  }
}

/* ------------------------------------------------------------------------ *
 * Dispatcher: every field Meta documents is routed through here.           *
 *                                                                          *
 * Resolution rules:                                                        *
 *  - `messages` resolves the account by `phone_number_id` (multiple        *
 *    numbers per WABA possible).                                           *
 *  - All other entry-level webhooks resolve by `entry.id` (== WABA id).    *
 *  - Unknown fields land in `handleUnhandledField` so nothing is silently  *
 *    dropped — operators always have a forensic record.                    *
 *                                                                          *
 * Each handler is responsible for:                                         *
 *  - Updating persistent state where appropriate.                          *
 *  - Recording one audit log entry per change.                             *
 *  - Returning quickly; webhooks are processed inside `setImmediate`.      *
 * ------------------------------------------------------------------------ */

async function resolveAccountByWabaId(wabaId) {
  if (!wabaId) return null;
  const { Account } = await getModels();
  return Account.findOne({ wabaId }).lean();
}

async function touchAccountHeartbeat(account, field) {
  if (!account?._id) return;
  try {
    const { Account } = await getModels();
    await Account.updateOne(
      { _id: account._id },
      {
        $set: {
          lastWebhookEventAt: new Date(),
          lastWebhookField: String(field || '').slice(0, 64),
        },
      }
    );
  } catch (err) {
    logger.warn('[whatsapp-webhook] heartbeat failed:', err?.message || err);
  }
}

/* --- messages (statuses + inbound) ---------------------------------------- */

async function handleMessagesField({ value }) {
  const phoneNumberId = value?.metadata?.phone_number_id;
  const account = await findAccountByPhoneNumberId(phoneNumberId);
  if (!account) {
    logger.warn(`[whatsapp-webhook] no account for phone_number_id=${phoneNumberId}`);
    return null;
  }
  for (const status of value.statuses || []) {
    await applyStatusEvent({ statusUpdate: status, account });
  }
  for (const inbound of value.messages || []) {
    await handleInboundMessage({ inbound, account });
  }
  return account;
}

/* --- account / business / payment / security ----------------------------- */

async function handleAccountUpdate({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  const { Account } = await getModels();
  const set = {};
  if (value.business_verification_status) {
    set.businessVerificationStatus = String(value.business_verification_status);
  }
  if (value.decision_state) set.decisionState = String(value.decision_state);
  if (value.display_name) set.displayName = String(value.display_name);
  if (value.event === 'ACCOUNT_RESTRICTION') {
    set.restrictedAt = new Date();
    set.restrictionType = String(value.restriction_type || 'unknown');
  }
  if (value.event === 'ACCOUNT_VIOLATION' || value.event === 'BAN') {
    set.bannedAt = new Date();
  }
  if (Object.keys(set).length) {
    await Account.updateOne({ _id: account._id }, { $set: set });
  }
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'account_update',
    summary: value.event ? `Account event: ${value.event}` : 'Account update',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleAccountReviewUpdate({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  const { Account } = await getModels();
  const status = value.decision || value.status || value.event || null;
  if (status) {
    await Account.updateOne(
      { _id: account._id },
      { $set: { accountReviewStatus: String(status) } }
    );
  }
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'account_review_update',
    summary: status ? `Account review: ${status}` : 'Account review update',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleAccountSettingsUpdate({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'account_settings_update',
    summary: 'Account settings updated',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleAccountAlerts({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'account_alert',
    summary:
      value.entity_type && value.alert_severity
        ? `Alert (${value.alert_severity}) on ${value.entity_type}`
        : 'Account alert',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleBusinessCapabilityUpdate({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  const { Account } = await getModels();
  const set = {};
  if (value.max_phone_numbers_per_business != null) {
    set['capabilities.maxPhoneNumbersPerBusiness'] = Number(value.max_phone_numbers_per_business);
  }
  if (value.max_phone_numbers_per_waba != null) {
    set['capabilities.maxPhoneNumbersPerWaba'] = Number(value.max_phone_numbers_per_waba);
  }
  if (value.max_daily_conversation_per_phone != null) {
    set['capabilities.maxDailyConversationPerPhone'] = Number(value.max_daily_conversation_per_phone);
  }
  if (Object.keys(set).length) {
    await Account.updateOne({ _id: account._id }, { $set: set });
  }
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'business_capability_update',
    summary: 'Business capabilities changed',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleBusinessStatusUpdate({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  const { Account } = await getModels();
  const set = {};
  if (value.business_verification_status) {
    set.businessVerificationStatus = String(value.business_verification_status);
  }
  if (value.event === 'RESTRICTION') {
    set.restrictedAt = new Date();
    set.restrictionType = String(value.restriction_type || 'unknown');
  }
  if (value.event === 'BAN') set.bannedAt = new Date();
  if (Object.keys(set).length) {
    await Account.updateOne({ _id: account._id }, { $set: set });
  }
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'business_status_update',
    summary: value.event ? `Business status: ${value.event}` : 'Business status update',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handlePaymentConfigurationUpdate({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  const { Account } = await getModels();
  const set = {};
  if (value.payment_status) set.paymentStatus = String(value.payment_status);
  if (value.reason) set.paymentReason = String(value.reason);
  if (Object.keys(set).length) {
    await Account.updateOne({ _id: account._id }, { $set: set });
  }
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'payment_configuration_update',
    summary: value.payment_status ? `Payment: ${value.payment_status}` : 'Payment update',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleSecurityEvent({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  const { Account } = await getModels();
  // Cap securityEvents array to most recent 50 so the document doesn't grow
  // unbounded — full history lives in the audit log.
  await Account.updateOne(
    { _id: account._id },
    {
      $push: {
        securityEvents: {
          $each: [
            {
              event: String(value.event || 'security_event'),
              requester: String(value.requester || ''),
              at: new Date(),
            },
          ],
          $slice: -50,
        },
      },
    }
  );
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'security_event',
    summary: value.event ? `Security: ${value.event}` : 'Security event',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

/* --- phone numbers ------------------------------------------------------- */

async function handlePhoneNumberQualityUpdate({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  const { Account } = await getModels();

  /**
   * If a WABA has multiple numbers, prefer matching by `display_phone_number`.
   * Stored numbers may have spaces/dashes (e.g. "+1 555-655-2954") so we
   * normalize both sides to digits and match on the trailing N digits.
   * If nothing matches, fall back to updating the resolved-by-wabaId account
   * so we never lose the event.
   */
  let filter = { _id: account._id };
  if (value.display_phone_number) {
    const digits = String(value.display_phone_number).replace(/\D/g, '');
    if (digits) {
      const candidate = await Account.findOne({
        wabaId: entry.id,
        $expr: {
          $regexMatch: {
            input: { $regexFindAll: { input: { $ifNull: ['$phoneE164', ''] }, regex: /\d/ } },
            regex: `${digits}$`,
          },
        },
      })
        .select('_id')
        .lean();
      // The aggregation regex above is awkward in find(); fall back to
      // doing a tolerant regex on the raw string with non-digit chars
      // optional between digits.
      const tolerantRegex = digits.split('').join('\\D*') + '$';
      const fallbackCandidate =
        candidate ||
        (await Account.findOne({
          wabaId: entry.id,
          phoneE164: { $regex: tolerantRegex },
        })
          .select('_id')
          .lean());
      if (fallbackCandidate) filter = { _id: fallbackCandidate._id };
    }
  }

  await Account.updateOne(filter, {
    $set: {
      qualityRating: value.event || value.current_quality || value.new_quality_rating || account.qualityRating,
      messagingLimitTier: value.current_limit || value.new_messaging_limit_tier || account.messagingLimitTier,
      phoneThroughputLevel: value.current_throughput || account.phoneThroughputLevel,
      lastSyncAt: new Date(),
    },
  });
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'phone_quality_update',
    summary: 'Phone number quality update',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handlePhoneNumberNameUpdate({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  const { Account } = await getModels();
  const set = { lastSyncAt: new Date() };
  if (value.display_name) set.displayName = String(value.display_name);
  if (value.decision) set.phoneNameStatus = String(value.decision);
  if (value.code_verification_status) {
    set.phoneCodeVerificationStatus = String(value.code_verification_status);
  }
  await Account.updateOne({ _id: account._id }, { $set: set });
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'phone_name_update',
    summary: 'Phone number name update',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

/* --- templates ----------------------------------------------------------- */

async function handleTemplateStatusUpdateField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await applyTemplateUpdate({ businessId: account.businessId, change: value });
  return account;
}

async function handleTemplateQualityUpdateField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  try {
    const { Template } = await getModels();
    const newScore = value.new_quality_score?.score || value.event || null;
    const tplFilter = {
      businessId: account.businessId,
      $or: [
        { metaTemplateId: String(value.message_template_id || value.id || '') },
        {
          name: value.message_template_name,
          language: value.message_template_language,
        },
      ],
    };
    if (newScore) {
      await Template.findOneAndUpdate(tplFilter, {
        $set: { qualityScore: String(newScore), lastSyncedAt: new Date() },
      });
    }
  } catch (err) {
    logger.warn('[whatsapp-webhook] template quality update failed:', err?.message || err);
  }
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'template_quality_change',
    summary: 'Template quality update',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleTemplateCategoryUpdateField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  try {
    const { Template } = await getModels();
    const tplFilter = {
      businessId: account.businessId,
      $or: [
        { metaTemplateId: String(value.message_template_id || value.id || '') },
        {
          name: value.message_template_name,
          language: value.message_template_language,
        },
      ],
    };
    const update = { $set: { lastSyncedAt: new Date() } };
    if (value.previous_category) {
      update.$set.previousCategory = String(value.previous_category).toUpperCase();
    }
    if (value.new_category) {
      update.$set.category = String(value.new_category).toUpperCase();
    }
    await Template.findOneAndUpdate(tplFilter, update);
  } catch (err) {
    logger.warn('[whatsapp-webhook] template category update failed:', err?.message || err);
  }
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'template_category_change',
    summary: 'Template category changed',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleTemplateCorrectCategoryDetectionField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  try {
    const { Template } = await getModels();
    const tplFilter = {
      businessId: account.businessId,
      $or: [
        { metaTemplateId: String(value.message_template_id || value.id || '') },
        {
          name: value.message_template_name,
          language: value.message_template_language,
        },
      ],
    };
    if (value.correct_category) {
      await Template.findOneAndUpdate(tplFilter, {
        $set: {
          detectedCorrectCategory: String(value.correct_category).toUpperCase(),
          detectedCorrectCategoryAt: new Date(),
        },
      });
    }
  } catch (err) {
    logger.warn('[whatsapp-webhook] correct category detection failed:', err?.message || err);
  }
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'template_category_change',
    summary: `Correct category detection: ${value.correct_category || 'n/a'}`,
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleTemplateComponentsUpdateField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  try {
    const { Template } = await getModels();
    const tplFilter = {
      businessId: account.businessId,
      $or: [
        { metaTemplateId: String(value.message_template_id || value.id || '') },
        {
          name: value.message_template_name,
          language: value.message_template_language,
        },
      ],
    };
    const update = { lastComponentsUpdateAt: new Date(), lastSyncedAt: new Date() };
    /**
     * If Meta included the full `components` array (newer payloads do), fold
     * them into our normalised shape so the local copy stays accurate. The
     * route-level adapter is duplicated here intentionally to keep this
     * webhook handler self-contained and avoid importing the route module.
     */
    if (Array.isArray(value.components) && value.components.length) {
      const adapted = { header: null, body: null, footer: null, buttons: [] };
      for (const c of value.components) {
        const t = String(c.type || '').toUpperCase();
        if (t === 'HEADER') {
          adapted.header = {
            format: c.format ? String(c.format).toUpperCase() : null,
            text: c.text || null,
            examples: c.example?.header_text || [],
          };
        } else if (t === 'BODY') {
          adapted.body = { text: c.text || null, examples: c.example?.body_text || [] };
        } else if (t === 'FOOTER') {
          adapted.footer = { text: c.text || null };
        } else if (t === 'BUTTONS' && Array.isArray(c.buttons)) {
          adapted.buttons = c.buttons.map((b) => {
            const bt = String(b.type || '').toUpperCase();
            if (bt === 'URL') return { type: 'URL', text: b.text || '', url: b.url || null };
            if (bt === 'PHONE_NUMBER')
              return { type: 'PHONE_NUMBER', text: b.text || '', phone: b.phone_number || null };
            return { type: 'QUICK_REPLY', text: b.text || '' };
          });
        }
      }
      update.components = adapted;
    }
    await Template.findOneAndUpdate(tplFilter, { $set: update });
  } catch (err) {
    logger.warn('[whatsapp-webhook] components update failed:', err?.message || err);
  }
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'template_components_change',
    summary: 'Template components updated',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

/* --- echoes / handover / standby / sync ---------------------------------- */

async function handleMessageEchoesField({ entry, value, fieldName }) {
  // Echoes report messages sent from another tool against the same WABA
  // (e.g. WhatsApp Manager web client). Persist as outbound external for
  // audit + to keep delivery counts honest.
  const phoneNumberId = value?.metadata?.phone_number_id;
  let account = await findAccountByPhoneNumberId(phoneNumberId);
  if (!account) account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: fieldName === 'smb_message_echoes' ? 'smb_message_echo' : 'message_echo',
    summary: 'Outbound echo received',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleSmbAppStateSyncField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'smb_app_state_sync',
    summary: 'SMB app state sync',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleMessagingHandoverField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'messaging_handover',
    summary:
      value.event === 'thread_takeover'
        ? 'Thread taken over by another app'
        : 'Messaging handover event',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleStandbyField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'standby_message',
    summary: 'Standby app received message (handover protocol)',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

/* --- user_preferences (Meta-level marketing opt-out) --------------------- */

async function handleUserPreferencesField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;

  const recipient = value.user_phone_number || value.contact?.wa_id || value.from || null;

  /**
   * Meta sends one of two relevant signals on this field:
   *   - "stop"   → user tapped "Stop promotions" (or replied STOP). We must
   *               flag `waMarketingOptOut=true` and stop sending marketing.
   *   - "resume" → user tapped "Resume promotions" later. This is Meta's
   *               *only* legitimate path back into marketing audiences;
   *               clear `waMarketingOptOut` and re-arm `optedIn` so the
   *               client appears in campaigns again WITHOUT us bypassing
   *               compliance.
   * Be liberal in detection — Meta has shipped the field under several
   * shapes across Graph versions: `value.value`, `value.category`,
   * `value.preference`, etc.
   */
  const rawValue = String(value.value || value.preference || '').toLowerCase();
  const rawCategory = String(value.category || '').toLowerCase();
  const isStop =
    rawValue === 'stop' ||
    rawValue === 'opt_out' ||
    (rawCategory === 'marketing_messages' && rawValue === 'stop');
  const isResume =
    rawValue === 'resume' ||
    rawValue === 'opt_in' ||
    rawValue === 'start' ||
    (rawCategory === 'marketing_messages' && rawValue === 'resume');

  if (recipient && (isStop || isResume)) {
    try {
      const main = await databaseManager.getMainConnection();
      const tenantConn = await databaseManager.getConnection(account.businessId, main);
      const Client = tenantConn.model('Client', require('../models/Client').schema);
      const cleaned = String(recipient || '').replace(/\D/g, '').slice(-10);
      const client = await Client.findOne({ phone: { $regex: cleaned + '$' } });
      if (client) {
        const previous = client.whatsappConsent || {};
        if (isStop) {
          const wasOptedIn = Boolean(previous.optedIn);
          client.whatsappConsent = {
            ...previous,
            optedIn: false,
            source: 'user_preferences',
            optedOutAt: new Date(),
            optOutReason: 'WhatsApp-level marketing opt-out',
            waMarketingOptOut: true,
            waMarketingOptOutAt: new Date(),
          };
          await client.save();
          if (wasOptedIn) {
            const ClientConsentEvent = tenantConn.model(
              'ClientConsentEvent',
              require('../models/ClientConsentEvent').schema
            );
            await ClientConsentEvent.create({
              clientId: client._id,
              branchId: client.branchId,
              channel: 'whatsapp',
              event: 'opt_out',
              source: 'user_preferences',
              actorType: 'webhook',
              reason: 'WhatsApp-level user preference opt-out',
              payload: value,
              createdAt: new Date(),
            });
          }
        } else {
          const wasOptedOut = Boolean(previous.waMarketingOptOut) || previous.optedIn === false;
          client.whatsappConsent = {
            ...previous,
            optedIn: true,
            source: 'user_preferences',
            optedInAt: new Date(),
            optedOutAt: null,
            optOutReason: null,
            optInReason: 'WhatsApp-level marketing opt-in (Resume promotions)',
            waMarketingOptOut: false,
            waMarketingOptOutAt: null,
          };
          await client.save();
          if (wasOptedOut) {
            const ClientConsentEvent = tenantConn.model(
              'ClientConsentEvent',
              require('../models/ClientConsentEvent').schema
            );
            await ClientConsentEvent.create({
              clientId: client._id,
              branchId: client.branchId,
              channel: 'whatsapp',
              event: 'opt_in',
              source: 'user_preferences',
              actorType: 'webhook',
              reason: 'WhatsApp-level user preference resume',
              payload: value,
              createdAt: new Date(),
            });
          }
        }
      }
    } catch (err) {
      logger.warn('[whatsapp-webhook] user_preferences update failed:', err?.message || err);
    }
  }

  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'client_user_preference',
    summary: isStop
      ? 'WA-level marketing opt-out'
      : isResume
      ? 'WA-level marketing opt-in (resume)'
      : 'User preference update',
    metadata: { wabaId: entry.id, recipient, ...value },
  });
  return account;
}

/* --- conversational extensions (calls / flows / groups / history / etc.) - */

async function handleCallsField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'call_event',
    summary: value.event ? `Call: ${value.event}` : 'Call event',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleFlowsField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'flow_event',
    summary: value.event ? `Flow: ${value.event}` : 'Flow event',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleGroupField({ entry, value, fieldName }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'group_event',
    summary: `Group event: ${fieldName}`,
    metadata: { wabaId: entry.id, field: fieldName, ...value },
  });
  return account;
}

async function handleHistoryField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'history_event',
    summary: 'History event',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handlePartnerSolutionsField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'partner_solution_event',
    summary: 'Partner solution event',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleTrackingEventsField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'tracking_event',
    summary: value.event ? `Tracking: ${value.event}` : 'Tracking event',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

async function handleAutomaticEventsField({ entry, value }) {
  const account = await resolveAccountByWabaId(entry.id);
  if (!account) return null;
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'automatic_event',
    summary: value.event ? `Automatic: ${value.event}` : 'Automatic event',
    metadata: { wabaId: entry.id, ...value },
  });
  return account;
}

/* --- catch-all ----------------------------------------------------------- */

async function handleUnhandledField({ entry, value, fieldName }) {
  const account = await resolveAccountByWabaId(entry.id);
  // Account may legitimately be null (e.g. test payload from Meta with fake
  // wabaId) — still log a warning so the field doesn't disappear silently.
  if (!account) {
    logger.warn(`[whatsapp-webhook] unhandled field "${fieldName}" with no resolvable account`);
    return null;
  }
  logger.warn(`[whatsapp-webhook] unhandled field "${fieldName}" — recorded to audit log`);
  await logEvent({
    businessId: account.businessId,
    actorType: 'webhook',
    event: 'unhandled_webhook',
    summary: `Unhandled webhook field: ${fieldName}`,
    metadata: { wabaId: entry.id, field: fieldName, ...value },
  });
  return account;
}

/* --- dispatch ------------------------------------------------------------ */

const FIELD_HANDLERS = {
  // messages flow
  messages: handleMessagesField,

  // template lifecycle
  message_template_status_update: handleTemplateStatusUpdateField,
  message_template_quality_update: handleTemplateQualityUpdateField,
  message_template_components_update: handleTemplateComponentsUpdateField,
  template_category_update: handleTemplateCategoryUpdateField,
  template_correct_category_detection: handleTemplateCorrectCategoryDetectionField,

  // phone number state
  phone_number_quality_update: handlePhoneNumberQualityUpdate,
  phone_number_name_update: handlePhoneNumberNameUpdate,

  // account / business / payment / security
  account_update: handleAccountUpdate,
  account_review_update: handleAccountReviewUpdate,
  account_settings_update: handleAccountSettingsUpdate,
  account_alerts: handleAccountAlerts,
  business_capability_update: handleBusinessCapabilityUpdate,
  business_status_update: handleBusinessStatusUpdate,
  payment_configuration_update: handlePaymentConfigurationUpdate,
  security: handleSecurityEvent,

  // multi-device / handover
  message_echoes: handleMessageEchoesField,
  smb_message_echoes: handleMessageEchoesField,
  smb_app_state_sync: handleSmbAppStateSyncField,
  messaging_handovers: handleMessagingHandoverField,
  standby: handleStandbyField,

  // user-level preferences (Meta marketing opt-out)
  user_preferences: handleUserPreferencesField,

  // conversational extensions
  flows: handleFlowsField,
  calls: handleCallsField,
  group_lifecycle_update: handleGroupField,
  group_participants_update: handleGroupField,
  group_settings_update: handleGroupField,
  group_status_update: handleGroupField,
  history: handleHistoryField,
  partner_solutions: handlePartnerSolutionsField,
  tracking_events: handleTrackingEventsField,
  automatic_events: handleAutomaticEventsField,
};

async function handlePayload(payload) {
  if (!payload || payload.object !== 'whatsapp_business_account') return;
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const field = change.field;
      const value = change.value || {};
      const handler = FIELD_HANDLERS[field] || handleUnhandledField;
      try {
        const account = await handler({ entry, value, fieldName: field });
        if (account) await touchAccountHeartbeat(account, field);
      } catch (err) {
        logger.error(
          `[whatsapp-webhook] handler "${field}" failed:`,
          err?.message || err
        );
      }
    }
  }
}

module.exports = router;
