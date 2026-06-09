/**
 * Thin wrapper around `WhatsAppAuditLog` that swallows persistence errors so
 * audit failures never break a real request.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');

async function getModel() {
  const mainConnection = await databaseManager.getMainConnection();
  return mainConnection.model(
    'WhatsAppAuditLog',
    require('../models/WhatsAppAuditLog').schema
  );
}

async function logEvent({ businessId, actorType, actorId, event, summary, metadata }) {
  if (!businessId || !event || !actorType) {
    logger.warn('[whatsapp-audit] missing required fields, skipping log');
    return null;
  }
  try {
    const Model = await getModel();
    return await Model.create({
      businessId,
      actorType,
      actorId: actorId || null,
      event,
      summary: summary || null,
      metadata: metadata || null,
      createdAt: new Date(),
    });
  } catch (err) {
    logger.warn('[whatsapp-audit] failed to persist event:', err?.message || err);
    return null;
  }
}

module.exports = { logEvent };
