/**
 * Unified WhatsApp send pipeline.
 *
 *   sendWhatsApp({ businessId, clientId, intent, templateName, language,
 *                  components, variables, recipientPhone, related,
 *                  bucketSeconds, dedupeKey, actor, campaignId, templateId })
 *
 * Responsibilities:
 *   1. Resolve provider, category, free window via the router.
 *   2. Compute a stable dedupeKey and short-circuit if a non-failed message
 *      already exists for that key.
 *   3. Persist `WhatsAppMessage` (status=queued).
 *   4. Call the provider (Gupshup primary; MSG91 fallback for transactional).
 *   5. Update the message with provider response + `providerMessageId`.
 *   6. Debit wallet only when `freeWindow=false`, `category!='service'`,
 *      provider is Gupshup, and the account is in `live` mode.
 *
 * Idempotency: short-circuit on dedupeKey before wallet debit / provider call.
 */

'use strict';

const crypto = require('crypto');
const databaseManager = require('../config/database-manager');
const { route } = require('../services/whatsapp-router');
const gupshupConfig = require('../lib/gupshup-config');
const gupshupWhatsApp = require('../services/gupshup-whatsapp-service');
const { buildGupshupParams } = require('./gupshup-template-params');
const { getDescriptor } = require('./whatsapp-intents');
const { resolveCostPaise } = require('../config/whatsapp-pricing');
const { logger } = require('../utils/logger');

/**
 * Normalize a phone number into the format Meta's Cloud API expects:
 * digits only, country-code prefixed, no leading "+".
 *
 * Why this matters: `Client.phone` is stored as the local 10-digit number
 * (e.g. "7091140602") because that's what staff type into the CRM. The
 * Meta Cloud API resolves recipients via international format though, so a
 * bare "7091140602" gets interpreted as a non-Indian number and triggers
 * `131030 - Recipient phone number not in allowed list` (or worse, sends
 * to the wrong country in production). We canonicalize once at the
 * pipeline boundary so downstream code (dedupeKey, conversation row,
 * Message.recipientPhone, Meta `to`) all agree on the same form.
 *
 * Rules (countryCode = 'IN' is the default):
 *   - "+91 70911-40602" / "917091140602" / "7091140602" / "07091140602"
 *     → all become "917091140602".
 *   - 12-digit numbers already prefixed with the matching country code are
 *     left as-is.
 *   - Numbers with an unrecognized prefix (different country or
 *     manually-pasted international format) are returned digits-only and
 *     left to Meta to validate.
 */
const COUNTRY_DIAL_CODES = {
  IN: '91',
  US: '1',
  GB: '44',
  AE: '971',
  SG: '65',
  AU: '61',
  CA: '1',
};

function normalizeRecipientPhone(rawPhone, countryCode = 'IN') {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  const dial = COUNTRY_DIAL_CODES[String(countryCode || 'IN').toUpperCase()] || '91';

  // Already starts with the country dial code and length is plausible.
  if (digits.startsWith(dial) && digits.length >= dial.length + 7) {
    return digits;
  }
  // Common Indian patterns: 10-digit local, or 11-digit "0" prefixed.
  if (dial === '91') {
    if (digits.length === 10) return '91' + digits;
    if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1);
  }
  // Single-digit country codes (US/CA): bare 10-digit gets prefixed.
  if ((dial === '1') && digits.length === 10) return '1' + digits;
  // Fallback — return what we have, let Meta validate.
  return digits;
}

async function getMainModels() {
  const main = await databaseManager.getMainConnection();
  return {
    Message: main.model('WhatsAppMessage', require('../models/WhatsAppMessage').schema),
    Account: main.model('WhatsAppAccount', require('../models/WhatsAppAccount').schema),
    Conversation: main.model(
      'WhatsAppConversation',
      require('../models/WhatsAppConversation').schema
    ),
    Template: main.model(
      'WhatsAppTemplate',
      require('../models/WhatsAppTemplate').schema
    ),
    Business: main.model('Business', require('../models/Business').schema),
    WalletTransaction: main.model(
      'WalletTransaction',
      require('../models/WalletTransaction').schema
    ),
  };
}

/**
 * Approval gate: if a template name is provided AND we have a local row for
 * `(businessId, name, language)`, require status='approved' before letting
 * the send go through. We intentionally let unknown template names pass
 * (Meta-managed pre-approved templates like `hello_world`, or templates that
 * exist on Meta but haven't been imported locally yet).
 *
 * Returns null on pass; an `{ blocked: true, reason }` object on block.
 */
async function gateTemplateApproval({ businessId, templateName, language, isService, allowUnapproved }) {
  if (isService) return null;
  if (!templateName) return null;
  if (allowUnapproved) return null;
  const { Template } = await getMainModels();
  const tpl = await Template.findOne({
    businessId,
    name: templateName,
    language: language || 'en_US',
  })
    .select('_id status')
    .lean();
  if (!tpl) return null; // unknown to local DB → assume Meta-managed
  if (tpl.status !== 'approved') {
    return {
      blocked: true,
      reason: `Template "${templateName}/${language}" is in status "${tpl.status}". Only approved templates can be sent.`,
      code: 'TEMPLATE_NOT_APPROVED',
      templateId: tpl._id,
    };
  }
  return null;
}

function bucketString(bucketSeconds = 60) {
  const ms = Math.max(1, bucketSeconds) * 1000;
  return String(Math.floor(Date.now() / ms));
}

/**
 * Build a stable hash so that the same logical send (same client + intent +
 * related entity within a 1-minute bucket, or same campaign recipient) won't
 * be processed twice on retry.
 */
function buildDedupeKey({
  businessId,
  clientId,
  recipientPhone,
  intent,
  templateId,
  related,
  campaignId,
  bucketSeconds,
  explicit,
}) {
  if (explicit) return explicit;
  const bucket = campaignId ? `c:${campaignId}` : `t:${bucketString(bucketSeconds)}`;
  const parts = [
    String(businessId || ''),
    String(clientId || ''),
    String(recipientPhone || ''),
    String(intent || ''),
    String(templateId || ''),
    related ? `${related.type || ''}:${related.id || ''}` : '',
    bucket,
  ].join('|');
  return crypto.createHash('sha1').update(parts).digest('hex');
}

async function debitWalletForMessage({
  businessId,
  costPaise,
  category,
  freeWindow,
  messageId,
  description,
  provider = 'gupshup',
}) {
  if (!costPaise || costPaise <= 0) return { success: true, skipped: true };
  const { Business, WalletTransaction } = await getMainModels();
  const updated = await Business.findOneAndUpdate(
    { _id: businessId, 'wallet.balancePaise': { $gte: costPaise } },
    { $inc: { 'wallet.balancePaise': -costPaise } },
    { new: true, lean: true }
  );
  if (!updated) {
    return { success: false, error: 'Insufficient wallet balance' };
  }
  const newBalancePaise = Number(updated?.wallet?.balancePaise || 0);
  await WalletTransaction.create({
    businessId,
    type: 'debit',
    amountPaise: costPaise,
    channel: 'whatsapp',
    messageCategory: category,
    provider,
    description: description || `WhatsApp ${category}`,
    relatedEntityId: messageId || null,
    relatedEntityType: 'WhatsAppMessage',
    balanceAfterPaise: newBalancePaise,
    timestamp: new Date(),
  });
  return { success: true, newBalancePaise };
}

/**
 * Resolve the Gupshup template id for an outbound template send. Prefer an
 * explicit id from the caller, then the WhatsAppTemplate row (by _id, then by
 * name+language). Returns null when nothing maps — the caller must fail the
 * send rather than deliver an unaddressed template.
 */
async function resolveGupshupTemplateId({ businessId, gupshupTemplateId, templateId, templateName, language }) {
  if (gupshupTemplateId) return gupshupTemplateId;
  const { Template } = await getMainModels();
  let tpl = null;
  if (templateId) {
    tpl = await Template.findById(templateId).select('gupshupTemplateId').lean();
  }
  if (!tpl?.gupshupTemplateId && templateName) {
    tpl = await Template.findOne({
      businessId,
      name: templateName,
      language: language || 'en_US',
    })
      .select('gupshupTemplateId')
      .lean();
  }
  return tpl?.gupshupTemplateId || null;
}

/**
 * Resolve display fields for the inbox bubble (name + body text) so outbound
 * template sends don't render as a blank "(message)" placeholder.
 */
async function resolveTemplateDisplay({
  businessId,
  gupshupTemplateId,
  templateId,
  templateName,
  language,
}) {
  const { Template } = await getMainModels();
  let tpl = null;
  if (templateId) {
    tpl = await Template.findById(templateId)
      .select('name gupshupTemplateId components.body.text')
      .lean();
  }
  if (!tpl && gupshupTemplateId) {
    tpl = await Template.findOne({ businessId, gupshupTemplateId: String(gupshupTemplateId) })
      .select('name gupshupTemplateId components.body.text')
      .lean();
  }
  if (!tpl && templateName) {
    tpl = await Template.findOne({
      businessId,
      name: templateName,
      language: language || 'en_US',
    })
      .select('name gupshupTemplateId components.body.text')
      .lean();
  }
  const bodyText = tpl?.components?.body?.text ? String(tpl.components.body.text) : null;
  return {
    name: tpl?.name || templateName || null,
    bodyPreview: bodyText,
    gupshupTemplateId: tpl?.gupshupTemplateId || gupshupTemplateId || null,
  };
}

/**
 * Send via the Gupshup Partner Portal. Session (free-form) messages use the v3
 * endpoint; templates use /template/msg with the resolved Gupshup template id
 * and ordered params. Sender (per-salon vs shared platform) is resolved inside
 * the Gupshup service.
 */
async function sendViaGupshup({
  businessId,
  recipientPhone,
  isService,
  serviceText,
  gupshupTemplateId,
  params,
  requireBusinessSender = false,
}) {
  if (isService) {
    return gupshupWhatsApp.sendText({
      businessId,
      to: recipientPhone,
      body: serviceText || '',
      requireBusinessSender,
    });
  }
  return gupshupWhatsApp.sendTemplate({
    businessId,
    to: recipientPhone,
    templateId: gupshupTemplateId,
    params: params || [],
    requireBusinessSender,
  });
}

/**
 * Main entry point. Returns an object describing the outcome:
 *   { success: bool, message: WhatsAppMessage doc, deduped: bool, error?: any }
 */
async function sendWhatsApp(args) {
  const {
    businessId,
    clientId = null,
    intent,
    recipientPhone,
    templateName = null,
    templateId = null,
    language = 'en_US',
    components = [],
    variables = null,
    /**
     * Gupshup-specific overrides (optional). When the active provider is
     * Gupshup, `gupshupTemplateId` addresses the approved template directly and
     * `params` supplies the ordered variable list. If omitted they are derived
     * from the WhatsAppTemplate row and `components` respectively.
     */
    gupshupTemplateId = null,
    params = null,
    related = null,
    campaignId = null,
    bucketSeconds = 60,
    dedupeKey: explicitDedupe = null,
    actorId = null,
    actorType = 'system',
    isService = false,
    serviceText = null,
    countryCode = 'IN',
    /**
     * Escape hatch for transactional flows that intentionally call Meta
     * with a Meta-managed template (e.g. the connection test sends
     * `hello_world`). Default off — every salon-built template must be
     * approved before it can be used.
     */
    allowUnapproved = false,
    /** When true, send only via the tenant's connected Gupshup app (no platform fallback). */
    requireTenantApp = false,
  } = args;

  if (!businessId || !intent || !recipientPhone) {
    throw new Error('sendWhatsApp: businessId, intent, recipientPhone are required');
  }
  const desc = getDescriptor(intent);
  if (!desc) throw new Error(`sendWhatsApp: invalid intent "${intent}"`);

  /**
   * Canonicalize recipient ONCE so dedupeKey, conversation row, persisted
   * Message.recipientPhone and Meta payload all agree. Without this, a
   * 10-digit local number ("7091140602") gets sent to Meta as-is, and Meta
   * resolves it to the wrong country → 131030. We can't reassign the
   * destructured `recipientPhone` (it's a const), so we shadow it with a
   * normalized alias and use that everywhere downstream.
   */
  const normalizedRecipient = normalizeRecipientPhone(recipientPhone, countryCode);
  if (!normalizedRecipient) {
    throw new Error(`sendWhatsApp: invalid recipientPhone "${recipientPhone}"`);
  }

  // Gate non-approved templates BEFORE any wallet debit / Meta call.
  const gate = await gateTemplateApproval({
    businessId,
    templateName,
    language,
    isService,
    allowUnapproved,
  });
  if (gate?.blocked) {
    return {
      success: false,
      deduped: false,
      message: null,
      error: gate.reason,
      code: gate.code,
    };
  }

  const { Message, Account, Conversation } = await getMainModels();

  if (requireTenantApp) {
    const account = await Account.findOne({ businessId }).lean();
    if (!gupshupConfig.isBusinessAppUsable(account)) {
      return {
        success: false,
        deduped: false,
        message: null,
        error: gupshupConfig.TENANT_APP_REQUIRED_MSG,
        code: 'WHATSAPP_APP_NOT_CONNECTED',
      };
    }
  }

  const dedupeKey = buildDedupeKey({
    businessId,
    clientId,
    recipientPhone: normalizedRecipient,
    intent,
    templateId,
    related,
    campaignId,
    bucketSeconds,
    explicit: explicitDedupe,
  });

  // Idempotency short-circuit — return existing row if it isn't a failure.
  const existing = await Message.findOne({ dedupeKey });
  if (existing && existing.status !== 'failed') {
    return { success: true, deduped: true, message: existing };
  }

  const routing = await route({ businessId, intent, recipientPhone: normalizedRecipient, countryCode });
  if (!routing.provider) {
    return {
      success: false,
      deduped: false,
      message: null,
      error: routing.reason || 'No provider available',
    };
  }

  if (requireTenantApp && routing.senderScope !== 'business') {
    return {
      success: false,
      deduped: false,
      message: null,
      error: gupshupConfig.TENANT_APP_REQUIRED_MSG,
      code: 'WHATSAPP_APP_NOT_CONNECTED',
    };
  }

  if (isService && !routing.useFreeWindow) {
    return {
      success: false,
      deduped: false,
      message: null,
      error: 'Service (free-form) message requires an open Customer Service Window',
    };
  }

  // Look up or create the conversation row so messages link to it.
  const conversation = await Conversation.findOneAndUpdate(
    { businessId, recipientPhone: normalizedRecipient },
    {
      $set: { lastOutboundAt: new Date(), lastBusinessTemplateCategory: desc.category },
      $setOnInsert: { businessId, recipientPhone: normalizedRecipient, clientId },
    },
    { new: true, upsert: true }
  );

  const expectedCost = resolveCostPaise({
    category: desc.category,
    countryCode,
    freeWindow: routing.useFreeWindow,
  });

  // Resolve Gupshup template id + inbox display text before persisting so the
  // conversation bubble shows the template body (not a blank "(message)").
  let resolvedTemplateId = null;
  let templateDisplay = { name: templateName, bodyPreview: null, gupshupTemplateId: null };
  if (!isService && (routing.provider === 'gupshup' || gupshupTemplateId || templateId || templateName)) {
    resolvedTemplateId = await resolveGupshupTemplateId({
      businessId,
      gupshupTemplateId,
      templateId,
      templateName,
      language,
    });
    templateDisplay = await resolveTemplateDisplay({
      businessId,
      gupshupTemplateId: resolvedTemplateId || gupshupTemplateId,
      templateId,
      templateName,
      language,
    });
  }

  const gsParams = !isService ? params || buildGupshupParams(components) : null;

  const messageDoc = await Message.create({
    businessId,
    provider: routing.provider,
    direction: 'outbound',
    recipientPhone: normalizedRecipient,
    clientId,
    templateId,
    campaignId,
    intent,
    category: desc.category,
    dedupeKey,
    conversationId: conversation?._id || null,
    freeWindow: routing.useFreeWindow,
    status: 'queued',
    statusEvents: [{ status: 'queued', at: new Date(), raw: null }],
    payload: {
      templateName: templateDisplay.name || templateName,
      language,
      components,
      variables,
      isService,
      serviceText,
      gupshupTemplateId: resolvedTemplateId || gupshupTemplateId || null,
      bodyPreview: isService ? serviceText || null : templateDisplay.bodyPreview,
      params: gsParams,
    },
    costPaise: routing.useFreeWindow || desc.category === 'service' ? 0 : expectedCost,
    priceListVersion: routing.priceListVersion,
    countryCode,
    relatedEntityId: related?.id || null,
    relatedEntityType: related?.type || null,
    timestamp: new Date(),
  });

  // Provider call.
  let providerResult = { success: false, error: 'Unsupported provider in send pipeline' };
  if (routing.provider === 'gupshup') {
    if (!isService && !resolvedTemplateId) {
      providerResult = {
        success: false,
        code: 'GUPSHUP_TEMPLATE_UNMAPPED',
        error: `No Gupshup template id mapped for "${templateName || templateId || 'unknown'}"`,
      };
    } else {
      providerResult = await sendViaGupshup({
        businessId,
        recipientPhone: normalizedRecipient,
        isService,
        serviceText,
        gupshupTemplateId: resolvedTemplateId,
        params: gsParams || [],
        requireBusinessSender: requireTenantApp,
      });
    }
  } else if (routing.provider === 'msg91') {
    // Legacy MSG91 path is handled by the existing whatsappService send-sites.
    // The unified pipeline only needs to record the attempt; callers fall back
    // to the legacy code path when they receive `provider === 'msg91'`.
    providerResult = { success: true, data: { provider: 'msg91', delegated: true } };
    messageDoc.status = 'sent';
    messageDoc.statusEvents.push({ status: 'sent', at: new Date(), raw: providerResult.data });
    await messageDoc.save();
    return { success: true, deduped: false, message: messageDoc, delegateToMsg91: true };
  } else if (routing.provider === 'sms') {
    providerResult = { success: true, data: { provider: 'sms', delegated: true } };
    messageDoc.status = 'sent';
    messageDoc.statusEvents.push({ status: 'sent', at: new Date(), raw: providerResult.data });
    await messageDoc.save();
    return { success: true, deduped: false, message: messageDoc, delegateToSms: true };
  }

  if (!providerResult.success) {
    messageDoc.status = 'failed';
    messageDoc.failureCode = providerResult.code || 'PROVIDER_ERROR';
    messageDoc.failureReason = JSON.stringify(providerResult.error || providerResult).slice(0, 1000);
    messageDoc.statusEvents.push({
      status: 'failed',
      at: new Date(),
      raw: providerResult.error || null,
    });
    await messageDoc.save();

    return { success: false, deduped: false, message: messageDoc, error: providerResult.error };
  }

  const providerMsgId =
    providerResult.messageId ||
    providerResult.data?.messages?.[0]?.id ||
    providerResult.data?.messages?.[0]?.message_id ||
    providerResult.data?.messageId ||
    null;
  messageDoc.status = 'sent';
  messageDoc.providerMessageId = providerMsgId;
  messageDoc.metaMessageId = providerMsgId;
  messageDoc.statusEvents.push({ status: 'sent', at: new Date(), raw: providerResult.data });
  await messageDoc.save();

  // Debit wallet (Gupshup + live mode + not in free window + not service).
  if (
    routing.provider === 'gupshup' &&
    routing.accountMode === 'live' &&
    !routing.useFreeWindow &&
    desc.category !== 'service' &&
    expectedCost > 0
  ) {
    const debit = await debitWalletForMessage({
      businessId,
      costPaise: expectedCost,
      category: desc.category,
      freeWindow: false,
      messageId: messageDoc._id,
      description: `WhatsApp ${desc.category} • ${intent}`,
      provider: routing.provider,
    });
    if (!debit.success) {
      logger.warn(
        `[send-whatsapp] wallet debit failed for ${messageDoc._id}: ${debit.error}`
      );
    }
  }

  return { success: true, deduped: false, message: messageDoc };
}

module.exports = {
  sendWhatsApp,
  buildDedupeKey,
  normalizeRecipientPhone,
};
