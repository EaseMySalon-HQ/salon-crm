/**
 * Convenience wrapper around the unified send pipeline that automatically
 * falls back to the legacy MSG91 path when the salon's Meta WABA isn't yet
 * connected.
 *
 *   sendWhatsAppWithFallback({
 *     businessId, clientId, intent, recipientPhone, templateName, language,
 *     components, related, msg91Fallback
 *   })
 *
 * `msg91Fallback` is an async callable that performs the legacy MSG91 send
 * and returns `{ success, response, error }`. The wrapper:
 *   1. Calls `sendWhatsApp` from the unified pipeline.
 *   2. If the pipeline returns `delegateToMsg91: true`, invokes msg91Fallback
 *      and updates the persisted message row with the legacy response.
 *   3. Returns `{ success, message, deduped, viaMeta }`.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { sendWhatsApp } = require('./send-whatsapp');
const { logger } = require('../utils/logger');

async function patchMessageWithMsg91Result(messageDoc, fallbackResult) {
  if (!messageDoc) return;
  try {
    const main = await databaseManager.getMainConnection();
    const Message = main.model('WhatsAppMessage', require('../models/WhatsAppMessage').schema);
    await Message.findByIdAndUpdate(messageDoc._id, {
      $set: {
        provider: 'msg91',
        status: fallbackResult.success ? 'sent' : 'failed',
        failureCode: fallbackResult.success ? null : 'MSG91_ERROR',
        failureReason: fallbackResult.success
          ? null
          : (fallbackResult.error && String(fallbackResult.error).slice(0, 1000)) || null,
        payload: { msg91: fallbackResult.response || null },
      },
      $push: {
        statusEvents: {
          status: fallbackResult.success ? 'sent' : 'failed',
          at: new Date(),
          raw: fallbackResult.response || fallbackResult.error || null,
        },
      },
    });
  } catch (err) {
    logger.warn('[send-whatsapp-fallback] could not patch message row:', err?.message || err);
  }
}

async function sendWhatsAppWithFallback(args) {
  const { msg91Fallback, ...sendArgs } = args;
  const result = await sendWhatsApp(sendArgs);

  if (result.delegateToMsg91 && typeof msg91Fallback === 'function') {
    let fallbackResult;
    try {
      fallbackResult = await msg91Fallback();
    } catch (err) {
      fallbackResult = { success: false, error: err?.message || String(err) };
    }
    await patchMessageWithMsg91Result(result.message, fallbackResult || { success: false });
    return {
      success: Boolean(fallbackResult?.success),
      deduped: false,
      viaMeta: false,
      message: result.message,
      legacyResponse: fallbackResult?.response || null,
    };
  }

  return {
    success: result.success,
    deduped: Boolean(result.deduped),
    viaMeta: result.success && result.message?.provider === 'meta',
    message: result.message,
    error: result.error || null,
  };
}

module.exports = { sendWhatsAppWithFallback };
