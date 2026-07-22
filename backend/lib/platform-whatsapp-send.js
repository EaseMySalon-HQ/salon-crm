'use strict';

const databaseManager = require('../config/database-manager');
const gupshupConfig = require('./gupshup-config');
const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const { normalizePlatformLeadPhone } = require('./send-platform-lead-welcome-whatsapp');
const {
  buildPlatformCampaignSendPayload,
  buildGupshupMessageEnvelope,
} = require('./platform-template-send-payload');

async function getPlatformWhatsAppModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Conversation: main.model(
      'PlatformWhatsAppConversation',
      require('../models/PlatformWhatsAppConversation').schema
    ),
    Message: main.model(
      'PlatformWhatsAppMessage',
      require('../models/PlatformWhatsAppMessage').schema
    ),
    PlatformLead: main.model('PlatformLead', require('../models/PlatformLead').schema),
  };
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

async function findLeadByPhoneSuffix(phone) {
  const { PlatformLead } = await getPlatformWhatsAppModels();
  const suffix = String(phone || '').replace(/\D/g, '').slice(-10);
  if (!suffix) return null;
  return PlatformLead.findOne({ phone: { $regex: `${suffix}$` } })
    .sort({ createdAt: -1 })
    .lean();
}

async function attachLeadInfo(conversations) {
  if (!conversations.length) return conversations;
  const { PlatformLead } = await getPlatformWhatsAppModels();
  const leadIds = conversations.map((c) => c.platformLeadId).filter(Boolean);
  const suffixes = conversations.map((c) =>
    String(c.recipientPhone || '').replace(/\D/g, '').slice(-10)
  );
  const or = [];
  if (leadIds.length) or.push({ _id: { $in: leadIds } });
  for (const suffix of [...new Set(suffixes.filter(Boolean))]) {
    or.push({ phone: { $regex: `${suffix}$` } });
  }
  if (!or.length) return conversations.map((c) => ({ ...c, lead: null }));

  const leads = await PlatformLead.find({ $or: or })
    .select('_id firstName lastName name salonName phone email source status marketingOptOut')
    .lean();
  const byId = new Map(leads.map((l) => [String(l._id), l]));
  const bySuffix = new Map();
  for (const lead of leads) {
    const suffix = String(lead.phone || '').replace(/\D/g, '').slice(-10);
    if (suffix && !bySuffix.has(suffix)) bySuffix.set(suffix, lead);
  }

  return conversations.map((c) => {
    const direct = c.platformLeadId ? byId.get(String(c.platformLeadId)) : null;
    const suffix = String(c.recipientPhone || '').replace(/\D/g, '').slice(-10);
    const lead = direct || (suffix ? bySuffix.get(suffix) : null);
    return { ...c, lead: lead || null };
  });
}

async function upsertConversationForOutbound({ recipientPhone, platformLeadId = null }) {
  const { Conversation } = await getPlatformWhatsAppModels();
  const now = new Date();
  const update = {
    $set: { lastOutboundAt: now },
    $setOnInsert: { recipientPhone },
  };
  if (platformLeadId) {
    update.$set.platformLeadId = platformLeadId;
  } else {
    update.$setOnInsert.platformLeadId = null;
  }
  return Conversation.findOneAndUpdate({ recipientPhone }, update, { new: true, upsert: true });
}

async function findPlatformConversationByPhone(recipientPhone) {
  const { Conversation } = await getPlatformWhatsAppModels();
  const normalized = normalizePlatformLeadPhone(recipientPhone);
  if (!normalized) return null;
  const suffix = normalized.slice(-10);
  const or = [{ recipientPhone: normalized }];
  if (suffix.length === 10) or.push({ recipientPhone: { $regex: `${suffix}$` } });
  return Conversation.findOne({ $or: or }).sort({ lastInboundAt: -1, updatedAt: -1 });
}

async function upsertConversationForInbound({ recipientPhone, preview }) {
  const { Conversation } = await getPlatformWhatsAppModels();
  const normalized = normalizePlatformLeadPhone(recipientPhone);
  if (!normalized) return null;
  const now = new Date();
  const lead = await findLeadByPhoneSuffix(normalized);
  const existing = await findPlatformConversationByPhone(normalized);

  const update = {
    $set: {
      lastInboundAt: now,
      cswOpenAt: now,
      cswExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      lastInboundPreview: String(preview || '').slice(0, 200),
    },
    $inc: { unreadCount: 1 },
  };

  if (existing) {
    update.$set.recipientPhone = normalized;
    if (lead?._id) update.$set.platformLeadId = lead._id;
    return Conversation.findOneAndUpdate({ _id: existing._id }, update, { new: true });
  }

  update.$setOnInsert = {
    recipientPhone: normalized,
    platformLeadId: lead?._id || null,
  };
  return Conversation.findOneAndUpdate({ recipientPhone: normalized }, update, {
    new: true,
    upsert: true,
  });
}

async function ensurePlatformSenderReady() {
  const configured = await gupshupConfig.isPlatformConfiguredAsync();
  if (!configured) {
    return {
      ok: false,
      configured: false,
      error: 'Platform WhatsApp app is not configured (Admin → Gupshup shared app).',
    };
  }
  try {
    await gupshupConfig.resolvePlatformSender();
    return { ok: true, configured: true };
  } catch (err) {
    const base = err?.message || 'Gupshup sender unavailable';
    const detail = err?.cause ? `${base} (${err.cause})` : base;
    return { ok: false, configured: true, error: detail };
  }
}

async function sendPlatformTemplateMessage({
  to,
  templateId,
  params = [],
  message = null,
  templateDoc = null,
  conversationId = null,
  campaignId = null,
  platformLeadId = null,
  platformTemplateId = null,
  category = 'marketing',
  intent = 'platform_outbound',
  createdBy = null,
}) {
  const ready = await ensurePlatformSenderReady();
  if (!ready.ok) return { success: false, error: ready.error };

  const recipientPhone = normalizePlatformLeadPhone(to);
  if (!recipientPhone) return { success: false, error: 'Invalid recipient phone' };

  const conv = await upsertConversationForOutbound({
    recipientPhone,
    platformLeadId,
  });

  const { Message } = await getPlatformWhatsAppModels();
  const now = new Date();
  const doc = await Message.create({
    direction: 'outbound',
    recipientPhone,
    conversationId: conversationId || conv._id,
    campaignId,
    platformLeadId,
    platformTemplateId,
    gupshupTemplateId: templateId,
    params,
    category,
    intent,
    provider: 'gupshup',
    status: 'queued',
    statusEvents: [{ status: 'queued', at: now }],
    createdBy,
    timestamp: now,
  });

  const envelope =
    message ||
    (templateDoc ? buildGupshupMessageEnvelope(templateDoc) : { type: 'text', text: '' });
  if (envelope === null) {
    return {
      success: false,
      error: 'Template header media URL is missing',
      code: 'GUPSHUP_HEADER_MEDIA_MISSING',
    };
  }

  const result = await gupshupWhatsApp.sendTemplate({
    businessId: null,
    to: recipientPhone,
    templateId,
    params: params.map((p) => String(p ?? '')),
    message: envelope,
  });

  if (!result.success) {
    const errMsg =
      typeof result.error === 'string'
        ? result.error
        : result.error?.message || result.error?.status || 'Send failed';
    doc.status = 'failed';
    doc.failureReason = String(errMsg).slice(0, 500);
    doc.statusEvents.push({ status: 'failed', at: new Date(), raw: result.error || null });
    await doc.save();
    return { success: false, error: errMsg, code: result.code, message: doc };
  }

  doc.status = 'sent';
  const gsId =
    result.data?.messageId ||
    result.data?.gsId ||
    result.data?.gs_id ||
    result.messageId ||
    null;
  const wamid = result.data?.messages?.[0]?.id || null;
  doc.providerMessageId = gsId || wamid || null;
  doc.metaMessageId = wamid || gsId || null;
  doc.statusEvents.push({ status: 'sent', at: new Date(), raw: result.data || null });
  await doc.save();
  return { success: true, message: doc, messageId: result.messageId };
}

async function sendPlatformTextMessage({
  to,
  text,
  conversationId = null,
  createdBy = null,
}) {
  const ready = await ensurePlatformSenderReady();
  if (!ready.ok) return { success: false, error: ready.error };

  const recipientPhone = normalizePlatformLeadPhone(to);
  if (!recipientPhone) return { success: false, error: 'Invalid recipient phone' };

  const { Conversation, Message } = await getPlatformWhatsAppModels();
  const convDoc =
    (conversationId && (await Conversation.findById(conversationId))) ||
    (await upsertConversationForOutbound({ recipientPhone }));
  if (!convDoc) return { success: false, error: 'Conversation not found' };

  const plain = convDoc.toObject ? convDoc.toObject() : convDoc;
  const decorated = decorateWindowFlags(plain);
  if (!decorated.cswOpen && !decorated.fepOpen) {
    return {
      success: false,
      error: 'Customer service window is closed. Send an approved template instead.',
      code: 'CSW_CLOSED',
    };
  }

  const now = new Date();
  const doc = await Message.create({
    direction: 'outbound',
    recipientPhone,
    conversationId: convDoc._id,
    platformLeadId: convDoc.platformLeadId || null,
    category: 'service',
    intent: 'platform_inbox_reply',
    outboundText: text,
    provider: 'gupshup',
    status: 'queued',
    statusEvents: [{ status: 'queued', at: now }],
    createdBy,
    timestamp: now,
  });

  const result = await gupshupWhatsApp.sendText({
    businessId: null,
    to: recipientPhone,
    body: text,
  });

  if (!result.success) {
    const errMsg =
      typeof result.error === 'string'
        ? result.error
        : result.error?.message || 'Send failed';
    doc.status = 'failed';
    doc.failureReason = String(errMsg).slice(0, 500);
    doc.statusEvents.push({ status: 'failed', at: new Date() });
    await doc.save();
    return { success: false, error: errMsg, code: result.code, message: doc };
  }

  await Conversation.updateOne(
    { _id: convDoc._id },
    { $set: { lastOutboundAt: now } }
  );
  doc.status = 'sent';
  doc.providerMessageId = result.messageId || null;
  doc.metaMessageId = result.messageId || null;
  doc.statusEvents.push({ status: 'sent', at: new Date() });
  await doc.save();
  return { success: true, message: doc, messageId: result.messageId };
}

async function recordPlatformInboundMessage({ recipientPhone, text, providerMessageId, raw }) {
  const normalized = normalizePlatformLeadPhone(recipientPhone);
  if (!normalized) return null;

  const preview = text || '[message]';
  const { Message } = await getPlatformWhatsAppModels();

  if (providerMessageId) {
    const existing = await Message.findOne({
      direction: 'inbound',
      providerMessageId: String(providerMessageId),
    }).lean();
    if (existing) {
      const { Conversation } = await getPlatformWhatsAppModels();
      return Conversation.findById(existing.conversationId);
    }
  }

  const conv = await upsertConversationForInbound({ recipientPhone: normalized, preview });
  const now = new Date();
  await Message.create({
    direction: 'inbound',
    recipientPhone: normalized,
    conversationId: conv._id,
    platformLeadId: conv.platformLeadId || null,
    category: 'service',
    intent: 'inbound',
    inboundText: text || preview,
    provider: 'gupshup',
    providerMessageId: providerMessageId || null,
    status: 'delivered',
    statusEvents: [{ status: 'delivered', at: now, raw: raw || null }],
    timestamp: now,
  });
  return conv;
}

module.exports = {
  getPlatformWhatsAppModels,
  decorateWindowFlags,
  attachLeadInfo,
  findLeadByPhoneSuffix,
  ensurePlatformSenderReady,
  sendPlatformTemplateMessage,
  sendPlatformTextMessage,
  recordPlatformInboundMessage,
};
