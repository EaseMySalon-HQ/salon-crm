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
 *   4. Call the provider (Meta first; MSG91 fallback for transactional).
 *   5. Update the message with provider response + `metaMessageId`.
 *   6. Debit wallet only when `freeWindow=false`, `category!='service'`,
 *      provider is Meta, and the account is in `live` mode. Test mode skips
 *      billing so demos don't drain balance.
 *
 * Idempotency: Meta enforces user-level dedupe but billing happens before
 * Meta sees duplicates, so we short-circuit ourselves to prevent double debit.
 */

'use strict';

const crypto = require('crypto');
const databaseManager = require('../config/database-manager');
const { route } = require('../services/whatsapp-router');
const metaWhatsApp = require('../services/meta-whatsapp-service');
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
    provider: 'meta',
    description: description || `WhatsApp ${category}`,
    relatedEntityId: messageId || null,
    relatedEntityType: 'WhatsAppMessage',
    balanceAfterPaise: newBalancePaise,
    timestamp: new Date(),
  });
  return { success: true, newBalancePaise };
}

/**
 * Send via Meta Cloud API path.
 */
async function sendViaMeta({
  account,
  businessId,
  recipientPhone,
  templateName,
  language,
  components,
  intent,
  isService,
  serviceText,
}) {
  if (account.mode === 'test' && account.testRecipientWhitelist?.length) {
    if (!account.testRecipientWhitelist.includes(recipientPhone)) {
      return {
        success: false,
        error: `Test mode: recipient ${recipientPhone} is not in whitelist`,
        code: 'TEST_MODE_BLOCKED',
      };
    }
  }
  if (isService) {
    return metaWhatsApp.sendText({
      businessId,
      to: recipientPhone,
      body: serviceText || '',
    });
  }
  return metaWhatsApp.sendTemplate({
    businessId,
    to: recipientPhone,
    templateName,
    language,
    components,
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
    payload: { templateName, language, components, variables, isService, serviceText },
    costPaise: routing.useFreeWindow || desc.category === 'service' ? 0 : expectedCost,
    priceListVersion: routing.priceListVersion,
    countryCode,
    relatedEntityId: related?.id || null,
    relatedEntityType: related?.type || null,
    timestamp: new Date(),
  });

  // Provider call.
  let providerResult = { success: false, error: 'Unsupported provider in send pipeline' };
  if (routing.provider === 'meta') {
    const account = await Account.findOne({ businessId });
    if (!account) {
      providerResult = { success: false, error: 'WABA not connected' };
    } else {
      providerResult = await sendViaMeta({
        account,
        businessId,
        recipientPhone: normalizedRecipient,
        templateName,
        language,
        components,
        intent,
        isService,
        serviceText,
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

    /**
     * If Meta returns OAuthException (code 190 with subcodes 463/467/460/...)
     * the access token is dead — every subsequent send in this campaign / job
     * will also fail. Flip the WABA account to `error` status and stamp a
     * human-readable message so the Settings card surfaces a "reconnect"
     * banner instead of leaving the salon in an opaque "connected but
     * everything fails" state. We only do this for Meta provider failures.
     */
    if (routing.provider === 'meta') {
      const meta = providerResult.error?.error || providerResult.error || {};
      /**
       * Meta tags lots of non-auth errors with type=OAuthException
       * (e.g. 131030 "recipient not in allowed list"), so we can't infer
       * "token dead" from the type alone. Only code 190 is a true auth
       * failure. Stay strict here so a sandbox/recipient-list error doesn't
       * wrongly flip the WABA account to "error" status.
       */
      /**
       * 131047 = "Re-engagement message" → Meta says the 24h CSW has
       * expired. Close our local CSW so the inbox UI immediately switches
       * to template-only mode instead of letting the operator keep trying
       * free-form text. (We also handle this in the async webhook, but
       * synchronous failures need the same fix.)
       */
      if (Number(meta.code) === 131047) {
        try {
          await Conversation.updateOne(
            { businessId, recipientPhone: normalizedRecipient },
            { $set: { cswExpiresAt: new Date(Date.now() - 1000) } }
          );
        } catch (cswErr) {
          // best-effort
        }
      }

      const isAuthError = Number(meta.code) === 190;
      if (isAuthError) {
        const subcode = meta.error_subcode || meta.subcode || null;
        const friendlyByCode = {
          463: 'Access token has expired. Reconnect via Settings → WhatsApp Integration.',
          467: 'Access token has been invalidated. Reconnect via Settings → WhatsApp Integration.',
          460: 'Password changed for the connected Meta user. Reconnect WhatsApp.',
          458: 'Connected user has been removed from the Meta app. Reconnect WhatsApp.',
        };
        const friendly =
          friendlyByCode[Number(subcode)] ||
          `Meta rejected the access token (subcode ${subcode || 'unknown'}). Reconnect WhatsApp.`;
        try {
          await Account.updateOne(
            { businessId },
            {
              $set: {
                status: 'error',
                lastErrorMessage: friendly,
              },
            }
          );
          logger.warn(
            `[send-whatsapp] WABA token rejected (code 190 subcode ${subcode}); flipped account ${businessId} to status=error`
          );
        } catch (acctErr) {
          logger.error(
            '[send-whatsapp] could not flip WABA status after auth failure:',
            acctErr?.message || acctErr
          );
        }
      }
    }

    return { success: false, deduped: false, message: messageDoc, error: providerResult.error };
  }

  const metaMsgId =
    providerResult.data?.messages?.[0]?.id ||
    providerResult.data?.messages?.[0]?.message_id ||
    null;
  messageDoc.status = 'sent';
  messageDoc.metaMessageId = metaMsgId;
  messageDoc.statusEvents.push({ status: 'sent', at: new Date(), raw: providerResult.data });
  await messageDoc.save();

  // Debit wallet (only Meta + live mode + not in free window + not service).
  if (
    routing.provider === 'meta' &&
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
