/**
 * Gupshup Partner Portal webhook endpoint.
 *
 * Mounted at /api/webhooks/whatsapp/gupshup (CSRF-skipped via the /api/webhooks
 * prefix). Gupshup authenticates via a shared-secret header we set on the
 * subscription (`meta.headers.Authorization`) plus a source-IP allowlist — not
 * an HMAC over the raw body — so we parse JSON normally.
 *
 * Handles:
 *   - Legacy envelope: { type, payload }
 *   - v3 passthrough (Meta Cloud shape): { object: "whatsapp_business_account", entry[] }
 *
 * Respond 2xx with an empty body within 10s; process asynchronously.
 */

'use strict';

const express = require('express');
const router = express.Router();

const databaseManager = require('../config/database-manager');
const gupshupConfig = require('../lib/gupshup-config');
const { logger } = require('../utils/logger');

const STATUS_PRIORITY = { queued: 1, sent: 2, delivered: 3, read: 4, failed: 99, deleted: 99 };
const TERMINAL = new Set(['failed', 'deleted']);
const STOP_WORDS = /^\s*(STOP|UNSUBSCRIBE|OPTOUT|OPT-OUT|OPT OUT)\b/i;
const CSW_CLOSED_ERROR = 131047;

// Gupshup / Meta event status -> our WhatsAppMessage.status enum.
const STATUS_MAP = {
  enqueued: 'sent',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  deleted: 'deleted',
};

async function getModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Account: main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema),
    Message: main.model('WhatsAppMessage', require('../models/WhatsAppMessage').schema),
    Conversation: main.model(
      'WhatsAppConversation',
      require('../models/WhatsAppConversation').schema
    ),
    Campaign: main.model('WhatsAppCampaign', require('../models/WhatsAppCampaign').schema),
    Business: main.model('Business', require('../models/Business').schema),
    WalletTransaction: main.model('WalletTransaction', require('../models/WalletTransaction').schema),
  };
}

/** Parse the allowlisted Gupshup inbound IPs from env (CSV). */
function allowedIps() {
  return String(process.env.GUPSHUP_WEBHOOK_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Best-effort source IP behind a proxy (Railway sets x-forwarded-for). */
function sourceIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.ip || req.socket?.remoteAddress || '';
}

/**
 * Verify the request is genuinely from Gupshup: shared-secret header must match
 * (when configured) AND source IP must be allowlisted (when configured). Both
 * checks are skipped only when their respective env is unset (dev convenience).
 */
function verifyAuth(req) {
  const secret = process.env.GUPSHUP_WEBHOOK_SECRET;
  if (secret) {
    const auth = String(req.headers['authorization'] || '');
    const expected = `Bearer ${secret}`;
    if (auth !== expected) return { ok: false, reason: 'bad secret header' };
  }
  const ips = allowedIps();
  if (ips.length) {
    const ip = sourceIp(req).replace(/^::ffff:/, '');
    if (!ips.includes(ip)) return { ok: false, reason: `ip not allowlisted (${ip})` };
  }
  return { ok: true };
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
      provider: 'gupshup',
      description: `Refund (${reason}) WhatsApp ${msg.category || 'message'}`,
      relatedEntityId: msg._id,
      relatedEntityType: 'WhatsAppMessage',
      freeWindow: msg.freeWindow,
      priceListVersion: msg.priceListVersion || null,
      timestamp: new Date(),
    });
    return true;
  } catch (err) {
    logger.warn('[gupshup-webhook] refund failed:', err?.message || err);
    return false;
  }
}

/** Find outbound message by gs_id, wamid, or legacy provider id. */
async function findMessageByProviderIds(ids) {
  const { Message } = await getModels();
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return null;
  return Message.findOne({
    $or: unique.flatMap((id) => [
      { providerMessageId: id },
      { metaMessageId: id },
    ]),
  });
}

async function closeCswForRecipient({ businessId, recipientPhone }) {
  if (!businessId || !recipientPhone) return;
  const { Conversation } = await getModels();
  await Conversation.updateOne(
    { businessId, recipientPhone },
    { $set: { cswOpenAt: null, cswExpiresAt: null } }
  );
}

function normalizeStatusEvent(evt) {
  const rawStatus = String(evt.type || evt.eventType || evt.status || '').toLowerCase();
  const wamid = evt.id || evt.messageId || null;
  const gsId = evt.gsId || evt.gs_id || null;
  const providerMessageId = wamid || gsId || evt.messageId || null;
  const errors = Array.isArray(evt.errors) ? evt.errors : [];
  const nestedError = evt.payload || evt.error || errors[0] || {};
  return {
    rawStatus,
    newStatus: STATUS_MAP[rawStatus] || null,
    providerMessageId,
    wamid,
    gsId,
    errors,
    nestedError,
    evt,
  };
}

async function applyStatusEvent(evt) {
  const { Message, Campaign } = await getModels();
  const norm = normalizeStatusEvent(evt);
  const { rawStatus, newStatus, wamid, gsId, nestedError, errors } = norm;
  if (!newStatus) return;

  const lookupIds = [wamid, gsId, norm.providerMessageId].filter(Boolean);
  const msg = await findMessageByProviderIds(lookupIds);
  if (!msg) {
    logger.warn(`[gupshup-webhook] status for unknown message ${lookupIds.join('/')} (${rawStatus})`);
    return;
  }

  // Link gs_id → wamid when Gupshup sends both (common on enqueued → sent).
  if (wamid && gsId && msg.providerMessageId === gsId) {
    msg.providerMessageId = wamid;
    msg.metaMessageId = wamid;
  } else if (wamid && !msg.metaMessageId) {
    msg.metaMessageId = wamid;
    if (!msg.providerMessageId || msg.providerMessageId === gsId) {
      msg.providerMessageId = wamid;
    }
  }

  const currentP = STATUS_PRIORITY[msg.status] || 0;
  const newP = STATUS_PRIORITY[newStatus] || 0;

  msg.statusEvents.push({ status: newStatus, at: new Date(), raw: evt });

  if (TERMINAL.has(msg.status) || newP <= currentP) {
    await msg.save();
    return;
  }

  msg.status = newStatus;
  if (newStatus === 'failed') {
    const details = nestedError;
    msg.failureCode = String(details.code || details.reason || 'FAILED');
    msg.failureReason = String(details.reason || details.message || details.title || 'Send failed').slice(0, 500);
    await refundDebitForMessage({ msg, reason: 'failed' });

    const errorCode = Number(details.code || errors[0]?.code);
    if (errorCode === CSW_CLOSED_ERROR) {
      await closeCswForRecipient({ businessId: msg.businessId, recipientPhone: msg.recipientPhone });
    }
  }
  await msg.save();

  if (msg.campaignId && (newStatus === 'delivered' || newStatus === 'read' || newStatus === 'failed')) {
    try {
      await Campaign.updateOne(
        { _id: msg.campaignId },
        { $inc: { [`counts.${newStatus}`]: 1 } }
      );
    } catch (err) {
      logger.warn('[gupshup-webhook] campaign counter update failed:', err?.message || err);
    }
  }
}

async function resolveBusinessIdForApp({ appId, appName, phoneNumberId }) {
  const { Account } = await getModels();
  const or = [];
  if (appId) or.push({ gupshupAppId: String(appId) });
  if (appName) or.push({ gupshupAppName: String(appName) });
  if (phoneNumberId) or.push({ gupshupPhoneNumberId: String(phoneNumberId) });
  if (!or.length) return null;
  const acc = await Account.findOne({ provider: 'gupshup', $or: or }).select('businessId').lean();
  return acc?.businessId || null;
}

/**
 * For the shared platform app, inbound has no owning WhatsAppAccount. Attribute
 * it to the business that most recently messaged this phone (best effort).
 */
async function resolveBusinessIdByRecentOutbound(recipientPhone) {
  const { Message } = await getModels();
  const recent = await Message.findOne({ recipientPhone, direction: 'outbound' })
    .sort({ timestamp: -1 })
    .select('businessId')
    .lean();
  return recent?.businessId || null;
}

async function handleInbound(evt, ctx) {
  const { Message, Conversation } = await getModels();
  const sender = evt.sender || {};
  const recipientPhone = String(
    evt.source || evt.from || sender.phone || ctx.recipientPhone || ''
  ).replace(/\D/g, '');
  if (!recipientPhone) return;

  let businessId = await resolveBusinessIdForApp(ctx);
  if (businessId) {
    const account = await gupshupConfig.loadAccount(businessId);
    if (!gupshupConfig.isBusinessAppUsable(account)) {
      logger.debug('[gupshup-webhook] inbound for disconnected tenant app; skipping inbox');
      return;
    }
  } else {
    const platformCfg = await gupshupConfig.loadPlatformConfig();
    const isPlatformApp =
      ctx.appId &&
      platformCfg.appId &&
      String(ctx.appId) === String(platformCfg.appId);
    if (!isPlatformApp) {
      logger.warn('[gupshup-webhook] inbound app not mapped to a tenant; skipping inbox');
      return;
    }
    businessId = await resolveBusinessIdByRecentOutbound(recipientPhone);
    if (!businessId) {
      logger.warn('[gupshup-webhook] inbound could not be attributed to a business; skipping');
      return;
    }
    const account = await gupshupConfig.loadAccount(businessId);
    if (gupshupConfig.isBusinessAppUsable(account)) {
      logger.debug(
        '[gupshup-webhook] skipping platform-app inbound for tenant with own connected app'
      );
      return;
    }
  }

  const text =
    evt.payload?.text ||
    evt.text?.body ||
    (typeof evt.text === 'string' ? evt.text : null) ||
    null;
  const preview = text || `[${evt.type || 'message'}]`;
  const now = new Date();

  const conv = await Conversation.findOneAndUpdate(
    { businessId, recipientPhone },
    {
      $set: {
        lastInboundAt: now,
        cswOpenAt: now,
        cswExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        lastInboundPreview: String(preview).slice(0, 200),
      },
      $inc: { unreadCount: 1 },
      $setOnInsert: { businessId, recipientPhone },
    },
    { new: true, upsert: true }
  );

  await Message.create({
    businessId,
    provider: 'gupshup',
    direction: 'inbound',
    recipientPhone,
    providerMessageId: evt.id || null,
    metaMessageId: evt.id || null,
    category: 'service',
    intent: 'inbound',
    conversationId: conv?._id || null,
    freeWindow: true,
    status: 'delivered',
    inboundText: text || preview,
    statusEvents: [{ status: 'delivered', at: now, raw: evt }],
    timestamp: now,
  });

  // STOP / UNSUBSCRIBE → opt the client out of marketing (best effort).
  if (text && STOP_WORDS.test(text)) {
    try {
      await markClientOptOut(businessId, recipientPhone);
    } catch (err) {
      logger.warn('[gupshup-webhook] opt-out update failed:', err?.message || err);
    }
  }
}

/** Best-effort opt-out on the tenant Client record. */
async function markClientOptOut(businessId, recipientPhone) {
  const main = await databaseManager.getMainConnection();
  const tenantConn = await databaseManager.getConnection(businessId, main);
  const Client = tenantConn.model('Client', require('../models/Client').schema);
  const cleaned = String(recipientPhone || '').replace(/\D/g, '').slice(-10);
  const client = await Client.findOne({ phone: { $regex: cleaned + '$' } });
  if (!client) return;
  client.whatsappConsent = {
    ...(client.whatsappConsent || {}),
    optedIn: false,
    source: 'inbound_message',
    optedOutAt: new Date(),
    optOutReason: 'STOP',
  };
  client.promotionalWhatsappEnabled = false;
  await client.save();
}

/** Process v3 Meta-shaped passthrough webhook (subscription version=3). */
async function handleV3Payload(body) {
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return false;

  for (const entry of body.entry) {
    const wabaId = entry.id || null;
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const metadata = value.metadata || {};
      const ctx = {
        appId: value.appId || body.appId || null,
        appName: body.app || value.app || null,
        phoneNumberId: metadata.phone_number_id || null,
        wabaId,
      };

      for (const st of value.statuses || []) {
        await applyStatusEvent(st);
      }

      for (const msg of value.messages || []) {
        await handleInbound(msg, {
          ...ctx,
          recipientPhone: msg.from,
        });
      }
    }
  }
  return true;
}

/** Normalize legacy Gupshup envelope into a flat event we can dispatch. */
async function handleLegacyPayload(body) {
  if (!body || typeof body !== 'object') return;
  const type = String(body.type || '').toLowerCase();
  const appName = body.app || null;
  const payload = body.payload || {};
  const ctx = { appId: payload.appId || body.appId || null, appName };

  if (type === 'message-event' || type === 'message-status') {
    await applyStatusEvent(payload);
  } else if (type === 'message') {
    await handleInbound(payload, ctx);
  } else if (type === 'user-event') {
    logger.debug('[gupshup-webhook] user-event:', payload?.type || 'unknown');
  } else {
    logger.debug(`[gupshup-webhook] unhandled legacy type "${type}"`);
  }
}

async function handlePayload(body) {
  try {
    const handledV3 = await handleV3Payload(body);
    if (!handledV3) {
      await handleLegacyPayload(body);
    }
  } catch (err) {
    logger.error('[gupshup-webhook] processing error:', err?.message || err);
  }
}

// GET is used by some ops tooling for a reachability check.
router.get('/', (req, res) => res.status(200).send('ok'));

router.post('/', express.json({ limit: '2mb' }), (req, res) => {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    logger.warn(`[gupshup-webhook] rejected: ${auth.reason}`);
    return res.sendStatus(401);
  }
  // Ack immediately, then process asynchronously (Gupshup requires <10s).
  res.sendStatus(200);
  const body = req.body;
  setImmediate(() => {
    handlePayload(body).catch((err) =>
      logger.error('[gupshup-webhook] async handler failed:', err?.message || err)
    );
  });
});

module.exports = router;
