const {
  resolveCommunicationConsentForCreate,
  resolveCommunicationConsentForUpdate,
  syncWhatsappConsentFromPromotional,
  WALK_IN_CONSENT,
} = require('../../lib/client-communication-consent');

describe('client-communication-consent', () => {
  it('defaults all channels on for new clients', () => {
    const consent = resolveCommunicationConsentForCreate({});
    expect(consent.promotionalWhatsappEnabled).toBe(true);
    expect(consent.transactionalWhatsappEnabled).toBe(true);
    expect(consent.transactionalSmsEnabled).toBe(true);
  });

  it('walk-in clients have all channels off', () => {
    const consent = resolveCommunicationConsentForCreate({}, { isWalkIn: true });
    expect(consent).toEqual(WALK_IN_CONSENT);
  });

  it('preserves existing values on partial update', () => {
    const consent = resolveCommunicationConsentForUpdate(
      { transactionalSmsEnabled: false },
      {
        promotionalWhatsappEnabled: true,
        transactionalWhatsappEnabled: false,
        transactionalSmsEnabled: true,
      }
    );
    expect(consent.promotionalWhatsappEnabled).toBe(true);
    expect(consent.transactionalWhatsappEnabled).toBe(false);
    expect(consent.transactionalSmsEnabled).toBe(false);
  });

  it('syncs whatsappConsent.optedIn from promotional flag', () => {
    const result = syncWhatsappConsentFromPromotional(null, true, { actorType: 'staff' });
    expect(result.next.optedIn).toBe(true);
    expect(result.changed).toBe(true);
  });
});
