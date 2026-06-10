/**
 * Helpers for normalising and auditing client WhatsApp / SMS consent changes.
 *
 * The Client document stores the current state in `whatsappConsent`. Every
 * change is also appended to the tenant `ClientConsentEvent` collection (and
 * mirrored to the main-DB `WhatsAppAuditLog` for cross-collection forensics).
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const auditMain = require('./whatsapp-audit');

/** Default consent for new real clients in the directory (not walk-ins). */
function defaultWhatsappConsentForNewClient(source = 'system') {
  return {
    optedIn: true,
    source,
    optedInAt: new Date(),
    optedOutAt: null,
    optInReason: null,
    optOutReason: null,
    waMarketingOptOut: false,
    waMarketingOptOutAt: null,
  };
}

/**
 * Resolve consent payload on create when the caller omitted whatsappConsent.
 */
function resolveConsentForNewClient(incoming, source = 'staff') {
  if (incoming === undefined || incoming === null) {
    return defaultWhatsappConsentForNewClient(source);
  }
  return incoming;
}

/**
 * Apply a consent payload to an in-memory client doc and return:
 *  - the normalised whatsappConsent object to persist
 *  - whether the optedIn flag changed
 *  - the resolved event ('opt_in' | 'opt_out' | null)
 */
function normaliseConsentUpdate({ existing, incoming, actor }) {
  if (!incoming || typeof incoming !== 'object') {
    return { next: existing || null, changed: false, event: null };
  }
  const previous = existing || {};
  const desiredOptedIn = Boolean(incoming.optedIn);
  const previousOptedIn = Boolean(previous.optedIn);

  const next = {
    ...previous,
    optedIn: desiredOptedIn,
    source: incoming.source || previous.source || (actor?.actorType === 'staff' ? 'staff' : 'manual'),
  };
  if (desiredOptedIn) {
    next.optedInAt = previousOptedIn ? previous.optedInAt || new Date() : new Date();
    if (incoming.optInReason !== undefined) next.optInReason = incoming.optInReason;
    next.optedOutAt = previousOptedIn ? previous.optedOutAt || null : null;
    if (!previousOptedIn) next.optOutReason = null;
  } else {
    next.optedOutAt = previousOptedIn ? new Date() : previous.optedOutAt || null;
    if (incoming.optOutReason !== undefined) next.optOutReason = incoming.optOutReason;
    if (!previousOptedIn) next.optedInAt = previous.optedInAt || null;
  }

  if (previousOptedIn === desiredOptedIn) {
    return { next, changed: false, event: null };
  }
  return {
    next,
    changed: true,
    event: desiredOptedIn ? 'opt_in' : 'opt_out',
  };
}

/**
 * Append a `ClientConsentEvent` row on the tenant DB and a sibling audit row
 * on the main-DB `WhatsAppAuditLog`. Best-effort — never throws.
 */
async function recordConsentEvent({
  tenantConnection,
  branchId,
  clientId,
  channel = 'whatsapp',
  event,
  source,
  actorType = 'staff',
  actorId = null,
  reason = null,
  payload = null,
}) {
  if (!event || !clientId || !branchId) return null;
  try {
    if (tenantConnection) {
      const ClientConsentEvent = tenantConnection.model(
        'ClientConsentEvent',
        require('../models/ClientConsentEvent').schema
      );
      await ClientConsentEvent.create({
        clientId,
        branchId,
        channel,
        event,
        source: source || 'manual',
        actorType,
        actorId,
        reason,
        payload,
        createdAt: new Date(),
      });
    }
  } catch (err) {
    logger.warn('[client-consent] tenant event write failed:', err?.message || err);
  }

  try {
    await auditMain.logEvent({
      businessId: branchId,
      actorType: actorType === 'staff' ? 'user' : actorType,
      actorId,
      event: event === 'opt_in' ? 'client_optin' : 'client_optout',
      summary: reason || (event === 'opt_in' ? 'Client opted in for WhatsApp' : 'Client opted out of WhatsApp'),
      metadata: { clientId: String(clientId), source, channel, payload },
    });
  } catch (err) {
    logger.warn('[client-consent] main audit write failed:', err?.message || err);
  }
  return true;
}

module.exports = {
  defaultWhatsappConsentForNewClient,
  resolveConsentForNewClient,
  normaliseConsentUpdate,
  recordConsentEvent,
};
