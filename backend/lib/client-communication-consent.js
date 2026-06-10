/**
 * Client communication channel preferences (promotional / transactional WA + SMS).
 */

const { normaliseConsentUpdate } = require('./client-consent');

const DEFAULTS = {
  promotionalWhatsappEnabled: true,
  transactionalWhatsappEnabled: true,
  transactionalSmsEnabled: true,
};

const WALK_IN_CONSENT = {
  promotionalWhatsappEnabled: false,
  transactionalWhatsappEnabled: false,
  transactionalSmsEnabled: false,
};

function resolveCommunicationConsentForCreate(body = {}, { isWalkIn = false } = {}) {
  if (isWalkIn) return { ...WALK_IN_CONSENT };
  return {
    promotionalWhatsappEnabled: body.promotionalWhatsappEnabled !== false,
    transactionalWhatsappEnabled: body.transactionalWhatsappEnabled !== false,
    transactionalSmsEnabled: body.transactionalSmsEnabled !== false,
  };
}

function resolveCommunicationConsentForUpdate(body = {}, existing = {}) {
  if (existing.isWalkIn) return { ...WALK_IN_CONSENT };
  const base = {
    promotionalWhatsappEnabled:
      existing.promotionalWhatsappEnabled !== undefined
        ? existing.promotionalWhatsappEnabled !== false
        : DEFAULTS.promotionalWhatsappEnabled,
    transactionalWhatsappEnabled:
      existing.transactionalWhatsappEnabled !== undefined
        ? existing.transactionalWhatsappEnabled !== false
        : DEFAULTS.transactionalWhatsappEnabled,
    transactionalSmsEnabled:
      existing.transactionalSmsEnabled !== undefined
        ? existing.transactionalSmsEnabled !== false
        : DEFAULTS.transactionalSmsEnabled,
  };

  return {
    promotionalWhatsappEnabled:
      body.promotionalWhatsappEnabled !== undefined
        ? Boolean(body.promotionalWhatsappEnabled)
        : base.promotionalWhatsappEnabled,
    transactionalWhatsappEnabled:
      body.transactionalWhatsappEnabled !== undefined
        ? Boolean(body.transactionalWhatsappEnabled)
        : base.transactionalWhatsappEnabled,
    transactionalSmsEnabled:
      body.transactionalSmsEnabled !== undefined
        ? Boolean(body.transactionalSmsEnabled)
        : base.transactionalSmsEnabled,
  };
}

/** Keep whatsappConsent.optedIn in sync with promotional WhatsApp for campaigns/webhooks. */
function syncWhatsappConsentFromPromotional(existingWhatsapp, promotionalEnabled, actor) {
  return normaliseConsentUpdate({
    existing: existingWhatsapp || null,
    incoming: {
      optedIn: Boolean(promotionalEnabled),
      source: 'staff',
      optInReason: promotionalEnabled ? 'Communication preferences updated' : null,
      optOutReason: promotionalEnabled ? null : 'Communication preferences updated',
    },
    actor: actor || { actorType: 'staff' },
  });
}

module.exports = {
  DEFAULTS,
  WALK_IN_CONSENT,
  resolveCommunicationConsentForCreate,
  resolveCommunicationConsentForUpdate,
  syncWhatsappConsentFromPromotional,
};
