'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildVariableMappingForSlot } = require('../../lib/platform-template-variable-mapping');
const {
  shouldResetBusinessWhatsAppTemplatesOnAppLink,
} = require('../../lib/business-whatsapp-template-config');

describe('shouldResetBusinessWhatsAppTemplatesOnAppLink', () => {
  it('returns false for first Gupshup connect', () => {
    assert.equal(shouldResetBusinessWhatsAppTemplatesOnAppLink(null, 'app-b'), false);
    assert.equal(shouldResetBusinessWhatsAppTemplatesOnAppLink({}, 'app-b'), false);
  });

  it('returns false when reconnecting the same app', () => {
    assert.equal(
      shouldResetBusinessWhatsAppTemplatesOnAppLink(
        { provider: 'gupshup', gupshupAppId: 'app-a' },
        'app-a'
      ),
      false
    );
  });

  it('returns true when the linked app id changes', () => {
    assert.equal(
      shouldResetBusinessWhatsAppTemplatesOnAppLink(
        { provider: 'gupshup', gupshupAppId: 'app-a' },
        'app-b'
      ),
      true
    );
  });

  it('returns true when the linked sender number changes', () => {
    assert.equal(
      shouldResetBusinessWhatsAppTemplatesOnAppLink(
        { provider: 'gupshup', gupshupAppId: 'app-a', sourceNumber: '919111111111' },
        { appId: 'app-a', sourceNumber: '919222222222' }
      ),
      true
    );
  });

  it('returns true when migrating from legacy Meta provider', () => {
    assert.equal(
      shouldResetBusinessWhatsAppTemplatesOnAppLink({ provider: 'meta' }, 'app-b'),
      true
    );
  });
});

describe('business template map variable wiring', () => {
  it('maps receipt catalog body vars to CRM fields', () => {
    const components = {
      body: { text: 'Hi {{1}}, your bill from {{2}} is ready: {{3}}' },
    };
    const mapping = buildVariableMappingForSlot('receipt', components);
    assert.equal(mapping.body_1, 'clientName');
    assert.equal(mapping.body_2, 'businessName');
    assert.equal(mapping.body_3, 'receiptLink');
  });

  it('maps appointment confirmation vars including google maps button', () => {
    const components = {
      body: {
        text: 'Hi {{1}}, your {{2}} at {{6}} is confirmed on {{3}} at {{4}} with {{5}}. Call {{7}}.',
      },
      buttons: [{ type: 'URL', text: 'Directions', url: 'https://maps.app.goo.gl/{{1}}' }],
    };
    const mapping = buildVariableMappingForSlot('appointmentConfirmation', components);
    assert.equal(mapping.body_1, 'clientName');
    assert.equal(mapping.button_1, 'googleMapsUrl');
  });
});
