/**
 * Fire-and-forget helpers to persist SMS and Email send attempts.
 *
 * Logs are written on the MAIN connection so all tenants share a single
 * collection (mirrors WhatsAppMessageLog). Callers should never await these
 * for correctness — they return promises only for tests / explicit flushing.
 */

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');

function toObjectId(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value._id) return value._id;
  return value;
}

async function getMainModel(modelName, schemaPath) {
  const mainConnection = await databaseManager.getMainConnection();
  return mainConnection.model(modelName, require(schemaPath).schema);
}

/**
 * Insert an SMS send attempt record. `result` is the provider response object;
 * when `result.success` is truthy the entry is flagged `sent`, otherwise `failed`.
 */
async function logSmsMessage({
  businessId,
  recipientPhone,
  messageType,
  result,
  relatedEntityId,
  relatedEntityType,
}) {
  try {
    if (!businessId || !recipientPhone || !messageType) return null;
    const SmsMessageLog = await getMainModel('SmsMessageLog', '../models/SmsMessageLog');
    return SmsMessageLog.create({
      businessId: toObjectId(businessId),
      recipientPhone: String(recipientPhone),
      messageType,
      status: result?.success ? 'sent' : 'failed',
      providerResponse: result?.data || null,
      relatedEntityId: toObjectId(relatedEntityId) || null,
      relatedEntityType: relatedEntityType || null,
      error: result?.error ? String(result.error).slice(0, 500) : null,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.warn('[channel-logs] Failed to persist SMS log:', err?.message || err);
    return null;
  }
}

/**
 * Insert an Email send attempt record. Same semantics as logSmsMessage.
 */
async function logEmailMessage({
  businessId,
  recipientEmail,
  messageType,
  result,
  subject,
  provider,
  relatedEntityId,
  relatedEntityType,
}) {
  try {
    if (!businessId || !recipientEmail || !messageType) return null;
    const EmailMessageLog = await getMainModel('EmailMessageLog', '../models/EmailMessageLog');
    return EmailMessageLog.create({
      businessId: toObjectId(businessId),
      recipientEmail: String(recipientEmail),
      messageType,
      status: result?.success ? 'sent' : 'failed',
      subject: subject || null,
      provider: provider || null,
      providerResponse: result?.data || null,
      relatedEntityId: toObjectId(relatedEntityId) || null,
      relatedEntityType: relatedEntityType || null,
      error: result?.error ? String(result.error).slice(0, 500) : null,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.warn('[channel-logs] Failed to persist Email log:', err?.message || err);
    return null;
  }
}

module.exports = {
  logSmsMessage,
  logEmailMessage,
};
