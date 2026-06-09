const {
  defaultWhatsappConsentForNewClient,
  resolveConsentForNewClient,
  normaliseConsentUpdate,
} = require('../../lib/client-consent');

describe('client-consent defaults', () => {
  it('defaultWhatsappConsentForNewClient opts in by default', () => {
    const consent = defaultWhatsappConsentForNewClient('import');
    expect(consent.optedIn).toBe(true);
    expect(consent.source).toBe('import');
    expect(consent.optedInAt).toBeInstanceOf(Date);
  });

  it('resolveConsentForNewClient uses default when omitted', () => {
    const resolved = resolveConsentForNewClient(undefined, 'staff');
    expect(resolved.optedIn).toBe(true);
    expect(resolved.source).toBe('staff');
  });

  it('resolveConsentForNewClient respects explicit opt-out', () => {
    const resolved = resolveConsentForNewClient({ optedIn: false, source: 'staff' }, 'staff');
    expect(resolved.optedIn).toBe(false);
  });

  it('normaliseConsentUpdate records opt-in for new clients with default consent', () => {
    const incoming = defaultWhatsappConsentForNewClient('system');
    const result = normaliseConsentUpdate({ existing: null, incoming, actor: { actorType: 'staff' } });
    expect(result.changed).toBe(true);
    expect(result.event).toBe('opt_in');
    expect(result.next.optedIn).toBe(true);
  });
});
