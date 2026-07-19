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
const { normalizePlatformLeadPhone } = require('../lib/send-platform-lead-welcome-whatsapp');

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
    PlatformMessage: main.model(
      'PlatformWhatsAppMessage',
      require('../models/PlatformWhatsAppMessage').schema
    ),
    PlatformCampaign: main.model(
      'PlatformWhatsAppCampaign',
      require('../models/PlatformWhatsAppCampaign').schema
    ),
    PlatformConversation: main.model(
      'PlatformWhatsAppConversation',
      require('../models/PlatformWhatsAppConversation').schema
    ),
    Conversation: main.model(
      'WhatsAppConversation',
      require('../models/WhatsAppConversation').schema
    ),
    Campaign: main.model('WhatsAppCampaign', require('../models/WhatsAppCampaign').schema),
    Business: main.model('Business', require('../models/Business').schema),
    WalletTransaction: main.model('WalletTransaction', require('../models/WalletTransaction').schema),
    PlatformLead: main.model('PlatformLead', require('../models/PlatformLead').schema),
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

function isLoopbackOrTunnelProxy(ip) {
  const normalized = String(ip || '').replace(/^::ffff:/, '');
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.startsWith('127.') ||
    normalized === 'localhost'
  );
}

/** Recent webhook events for admin diagnostics (in-memory, dev-friendly). */
const recentWebhookEvents = [];
const MAX_RECENT_WEBHOOK_EVENTS = 50;

function pushWebhookEvent(entry) {
  recentWebhookEvents.unshift({ ...entry, at: new Date().toISOString() });
  if (recentWebhookEvents.length > MAX_RECENT_WEBHOOK_EVENTS) {
    recentWebhookEvents.length = MAX_RECENT_WEBHOOK_EVENTS;
  }
}

function summarizeWebhookBody(body) {
  if (!body || typeof body !== 'object') return { shape: 'empty' };
  if (body.object === 'whatsapp_business_account') {
    let messages = 0;
    let statuses = 0;
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        messages += (change.value?.messages || []).length;
        statuses += (change.value?.statuses || []).length;
      }
    }
    return { shape: 'v3', messages, statuses };
  }
  return {
    shape: 'legacy',
    type: body.type || null,
    app: body.app || null,
  };
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
    if (auth !== expected) {
      return {
        ok: false,
        reason: auth
          ? 'bad secret header'
          : 'missing Authorization header (required when GUPSHUP_WEBHOOK_SECRET is set)',
      };
    }
  }
  const ips = allowedIps();
  if (ips.length) {
    const ip = sourceIp(req).replace(/^::ffff:/, '');
    // Cloudflare tunnel / cloudflared forwards from loopback — not a Gupshup IP.
    if (!isLoopbackOrTunnelProxy(ip) && !ips.includes(ip)) {
      return { ok: false, reason: `ip not allowlisted (${ip})` };
    }
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
  const { Message, PlatformMessage } = await getModels();
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return null;
  const query = {
    $or: unique.flatMap((id) => [
      { providerMessageId: id },
      { metaMessageId: id },
    ]),
  };
  const tenantMsg = await Message.findOne(query);
  if (tenantMsg) return { scope: 'tenant', msg: tenantMsg };
  const platformMsg = await PlatformMessage.findOne(query);
  if (platformMsg) return { scope: 'platform', msg: platformMsg };
  return null;
}

/** Fallback when Gupshup sends wamid but we only stored gsId from template send. */
async function findPlatformMessageByRecipient(evt) {
  const { PlatformMessage } = await getModels();
  const rawPhone = evt.recipient_id || evt.destination || evt.to || evt.phone || null;
  const recipientPhone = normalizePlatformLeadPhone(rawPhone);
  if (!recipientPhone) return null;
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const msg = await PlatformMessage.findOne({
    recipientPhone,
    direction: 'outbound',
    status: { $in: ['queued', 'sent'] },
    timestamp: { $gte: since },
  })
    .sort({ timestamp: -1 })
    .limit(1);
  return msg || null;
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
  const { Message, Campaign, PlatformMessage } = await getModels();
  const norm = normalizeStatusEvent(evt);
  const { rawStatus, newStatus, wamid, gsId, nestedError, errors } = norm;
  if (!newStatus) return;

  const lookupIds = [wamid, gsId, norm.providerMessageId].filter(Boolean);
  let found = await findMessageByProviderIds(lookupIds);
  if (!found && (wamid || gsId)) {
    const platformMsg = await findPlatformMessageByRecipient(evt);
    if (platformMsg) found = { scope: 'platform', msg: platformMsg };
  }
  if (!found) {
    logger.warn(`[gupshup-webhook] status for unknown message ${lookupIds.join('/')} (${rawStatus})`);
    return;
  }

  const msg = found.msg;
  const isPlatform = found.scope === 'platform';

  if (!isPlatform) {
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
  } else {
    if (wamid && gsId && msg.providerMessageId === gsId) {
      msg.providerMessageId = wamid;
      msg.metaMessageId = wamid;
    } else if (wamid) {
      if (!msg.metaMessageId) msg.metaMessageId = wamid;
      if (!msg.providerMessageId || msg.providerMessageId === gsId) {
        msg.providerMessageId = wamid;
      }
    } else if (gsId && !msg.providerMessageId) {
      msg.providerMessageId = gsId;
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
    const failureReason = String(details.reason || details.message || details.title || 'Send failed').slice(0, 500);
    if (isPlatform) {
      msg.failureReason = failureReason;
    } else {
      msg.failureCode = String(details.code || details.reason || 'FAILED');
      msg.failureReason = failureReason;
      await refundDebitForMessage({ msg, reason: 'failed' });
      const errorCode = Number(details.code || errors[0]?.code);
      if (errorCode === CSW_CLOSED_ERROR) {
        await closeCswForRecipient({ businessId: msg.businessId, recipientPhone: msg.recipientPhone });
      }
    }
  }
  await msg.save();

  if (msg.campaignId) {
    try {
      if (isPlatform) {
        const { reconcileCampaignCounts } = require('../lib/platform-whatsapp-campaign-report');
        await reconcileCampaignCounts(msg.campaignId);
      } else if (newStatus === 'delivered' || newStatus === 'read' || newStatus === 'failed') {
        const { Campaign } = await getModels();
        await Campaign.updateOne(
          { _id: msg.campaignId },
          { $inc: { [`counts.${newStatus}`]: 1 } }
        );
      }
    } catch (err) {
      logger.warn('[gupshup-webhook] campaign counter update failed:', err?.message || err);
    }
  }
}

function normalizePhoneDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function phoneSuffixMatchFilter(normalized) {
  const suffix = String(normalized || '').slice(-10);
  if (suffix.length !== 10) return { recipientPhone: normalized };
  return {
    $or: [{ recipientPhone: normalized }, { recipientPhone: { $regex: `${suffix}$` } }],
  };
}

function extractInboundPhone(evt, ctx) {
  const candidates = [
    ctx?.recipientPhone,
    evt?.from,
    evt?.source,
    evt?.sender?.phone,
    typeof evt?.sender === 'string' ? evt.sender : null,
    evt?.payload?.source,
    evt?.payload?.sender?.phone,
    evt?.payload?.from,
  ];
  for (const raw of candidates) {
    const normalized = normalizePlatformLeadPhone(raw);
    if (normalized) return normalized;
  }
  return null;
}

/** Extract user text from Gupshup legacy or Meta v3 inbound shapes. */
function extractInboundText(evt) {
  if (!evt || typeof evt !== 'object') return null;
  const inner = evt.payload && typeof evt.payload === 'object' ? evt.payload : null;
  if (typeof inner?.text === 'string') return inner.text;
  if (typeof inner?.text?.body === 'string') return inner.text.body;
  if (typeof inner?.title === 'string') return inner.title;
  if (typeof inner?.postbackText === 'string') return inner.postbackText;
  if (typeof evt.payload?.text === 'string') return evt.payload.text;
  if (typeof evt.payload?.text?.body === 'string') return evt.payload.text.body;
  if (typeof evt.text?.body === 'string') return evt.text.body;
  if (typeof evt.text === 'string') return evt.text;
  if (typeof evt.interactive?.button_reply?.title === 'string') return evt.interactive.button_reply.title;
  if (typeof evt.interactive?.list_reply?.title === 'string') return evt.interactive.list_reply.title;
  if (inner?.type === 'button_reply' && typeof inner.payload?.title === 'string') {
    return inner.payload.title;
  }
  if (inner?.type === 'list_reply' && typeof inner.payload?.title === 'string') {
    return inner.payload.title;
  }
  if (typeof evt.type === 'string' && evt.type !== 'text') {
    return `[${evt.type}]`;
  }
  return null;
}

/** True when the webhook belongs to the shared platform Gupshup app (not a tenant app). */
async function isInboundForPlatformApp(ctx, platformCfg) {
  if (!platformCfg?.appId) return false;

  if (ctx.appId && String(ctx.appId) === String(platformCfg.appId)) return true;

  if (
    ctx.appName &&
    platformCfg.appName &&
    String(ctx.appName).toLowerCase() === String(platformCfg.appName).toLowerCase()
  ) {
    return true;
  }

  const platformSource = normalizePhoneDigits(platformCfg.source);
  const displayPhone = normalizePhoneDigits(ctx.displayPhoneNumber);
  if (platformSource && displayPhone) {
    if (displayPhone === platformSource) return true;
    const plat10 = platformSource.slice(-10);
    const disp10 = displayPhone.slice(-10);
    if (plat10.length === 10 && disp10 === plat10) return true;
  }

  return false;
}

/**
 * Route inbound to platform inbox when webhook metadata is ambiguous but we
 * already messaged this phone from the platform app (template/campaign/inbox).
 */
async function shouldRouteInboundToPlatform(recipientPhone, ctx, platformCfg) {
  if (await isInboundForPlatformApp(ctx, platformCfg)) return true;
  if (!platformCfg?.appId) return false;

  const normalized = normalizePlatformLeadPhone(recipientPhone);
  if (!normalized) return false;

  const { PlatformMessage, PlatformConversation } = await getModels();
  const phoneFilter = phoneSuffixMatchFilter(normalized);

  const conv = await PlatformConversation.findOne(phoneFilter).select('_id').lean();
  if (conv) return true;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const outbound = await PlatformMessage.findOne({
    direction: 'outbound',
    timestamp: { $gte: since },
    ...phoneFilter,
  })
    .select('_id')
    .lean();
  if (outbound) return true;

  const businessId = await resolveBusinessIdForApp(ctx);
  if (businessId) {
    const account = await gupshupConfig.loadAccount(businessId);
    if (
      account?.gupshupAppId &&
      String(account.gupshupAppId) === String(platformCfg.appId)
    ) {
      return true;
    }
  }

  return false;
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

async function handlePlatformInbound(evt, ctx) {
  const { recordPlatformInboundMessage } = require('../lib/platform-whatsapp-send');
  const { PlatformConversation, PlatformLead } = await getModels();
  const recipientPhone = extractInboundPhone(evt, ctx);
  if (!recipientPhone) {
    logger.warn('[gupshup-webhook] platform inbound missing sender phone', {
      appId: ctx.appId,
      appName: ctx.appName,
      type: evt?.type || null,
    });
    return;
  }

  const text = extractInboundText(evt);
  const preview = text || `[${evt.type || 'message'}]`;

  const conv = await recordPlatformInboundMessage({
    recipientPhone,
    text,
    providerMessageId: evt.id || null,
    raw: evt,
  });
  if (!conv) {
    logger.warn('[gupshup-webhook] platform inbound not stored for %s', recipientPhone);
    return;
  }

  logger.info('[gupshup-webhook] platform inbound from %s', recipientPhone);

  if (text && STOP_WORDS.test(text)) {
    await PlatformConversation.updateOne(
      { recipientPhone },
      { $set: { marketingOptOut: true } }
    );
    const suffix = recipientPhone.slice(-10);
    if (suffix) {
      await PlatformLead.updateMany(
        { phone: { $regex: `${suffix}$` } },
        { $set: { marketingOptOut: true } }
      );
    }
  }
}

async function handleInbound(evt, ctx) {
  const { Message, Conversation } = await getModels();
  const recipientPhone = extractInboundPhone(evt, ctx);
  if (!recipientPhone) {
    logger.warn('[gupshup-webhook] inbound missing sender phone', {
      appId: ctx.appId,
      appName: ctx.appName,
      type: evt?.type || null,
    });
    return;
  }

  const platformCfg = await gupshupConfig.loadPlatformConfig();
  if (await shouldRouteInboundToPlatform(recipientPhone, ctx, platformCfg)) {
    await handlePlatformInbound(evt, { ...ctx, recipientPhone });
    return;
  }

  const businessId = await resolveBusinessIdForApp(ctx);
  if (businessId) {
    const account = await gupshupConfig.loadAccount(businessId);
    if (!gupshupConfig.isBusinessAppUsable(account)) {
      logger.debug('[gupshup-webhook] inbound for disconnected tenant app; skipping inbox');
      return;
    }
    if (
      platformCfg.appId &&
      account.gupshupAppId &&
      String(account.gupshupAppId) === String(platformCfg.appId)
    ) {
      await handlePlatformInbound(evt, { ...ctx, recipientPhone });
      return;
    }
  } else {
    logger.warn(
      '[gupshup-webhook] inbound app not mapped to platform or tenant; skipping inbox',
      { appId: ctx.appId, appName: ctx.appName, displayPhone: ctx.displayPhoneNumber }
    );
    return;
  }

  const text = extractInboundText(evt);
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
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    return { inbound: 0, statuses: 0 };
  }

  let inbound = 0;
  let statuses = 0;

  for (const entry of body.entry) {
    const wabaId = entry.id || null;
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const metadata = value.metadata || {};
      const ctx = {
        appId: value.appId || body.appId || null,
        appName: body.app || value.app || null,
        phoneNumberId: metadata.phone_number_id || null,
        displayPhoneNumber: metadata.display_phone_number || null,
        wabaId,
      };

      for (const st of value.statuses || []) {
        statuses += 1;
        await applyStatusEvent(st);
      }

      for (const msg of value.messages || []) {
        inbound += 1;
        await handleInbound(msg, {
          ...ctx,
          recipientPhone: msg.from,
        });
      }
    }
  }
  return { inbound, statuses };
}

/** Normalize legacy Gupshup envelope into a flat event we can dispatch. */
async function handleLegacyPayload(body) {
  if (!body || typeof body !== 'object') return;
  const type = String(body.type || '').toLowerCase();
  const appName = body.app || null;
  const payload = body.payload || {};
  const ctx = {
    appId: payload.appId || body.appId || null,
    appName,
    displayPhoneNumber: payload.destination || payload.phone || null,
  };

  if (type === 'message-event' || type === 'message-status') {
    await applyStatusEvent(payload);
  } else if (type === 'message') {
    await handleInbound(payload, {
      ...ctx,
      recipientPhone: payload.source || payload.sender?.phone || payload.from || null,
    });
  } else if (type === 'user-event') {
    logger.debug('[gupshup-webhook] user-event:', payload?.type || 'unknown');
  } else {
    logger.debug(`[gupshup-webhook] unhandled legacy type "${type}"`);
  }
}

async function handlePayload(body) {
  try {
    const summary = summarizeWebhookBody(body);
    pushWebhookEvent({ phase: 'received', summary });

    let v3 = { inbound: 0, statuses: 0 };
    if (body?.object === 'whatsapp_business_account') {
      v3 = await handleV3Payload(body);
    }

    const legacyType = String(body?.type || '').toLowerCase();
    // Gupshup often sends legacy `{ type: "message" }` even with version=3 subscriptions.
    if (legacyType === 'message' || legacyType === 'message-event' || legacyType === 'message-status') {
      await handleLegacyPayload(body);
    } else if (v3.inbound === 0 && v3.statuses === 0 && !body?.object) {
      logger.warn('[gupshup-webhook] unrecognized payload shape:', summary);
      pushWebhookEvent({ phase: 'unrecognized', summary });
    }

    pushWebhookEvent({
      phase: 'processed',
      summary,
      v3Inbound: v3.inbound,
      v3Statuses: v3.statuses,
      legacyType: legacyType || null,
    });
  } catch (err) {
    pushWebhookEvent({ phase: 'error', error: err?.message || String(err) });
    logger.error('[gupshup-webhook] processing error:', err?.message || err);
  }
}

// GET is used by some ops tooling for a reachability check.
router.get('/', (req, res) => res.status(200).send('ok'));

router.post('/', express.json({ limit: '2mb' }), (req, res) => {
  const auth = verifyAuth(req);
  if (!auth.ok) {
    logger.warn(`[gupshup-webhook] rejected: ${auth.reason}`);
    pushWebhookEvent({ phase: 'rejected', reason: auth.reason, ip: sourceIp(req) });
    return res.sendStatus(401);
  }
  // Ack immediately, then process asynchronously (Gupshup requires <10s).
  res.sendStatus(200);
  const body = req.body;
  setImmediate(() => {
    handlePayload(body).catch((err) => {
      pushWebhookEvent({ phase: 'error', error: err?.message || String(err) });
      logger.error('[gupshup-webhook] async handler failed:', err?.message || err);
    });
  });
});

module.exports = router;
module.exports.getRecentWebhookEvents = () => recentWebhookEvents.slice();
