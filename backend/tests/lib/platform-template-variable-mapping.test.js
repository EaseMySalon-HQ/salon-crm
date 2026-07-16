'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  detectVariablesFromComponents,
  buildVariableMappingForSlot,
} = require('../../lib/platform-template-variable-mapping');

describe('platform-template-variable-mapping', () => {
  it('detects body and URL button variables from components', () => {
    const vars = detectVariablesFromComponents({
      body: { text: 'Hi {{1}}, bill from {{2}}' },
      buttons: [{ type: 'URL', text: 'View bill', url: 'https://example.com/{{1}}' }],
    });
    assert.deepEqual(vars, ['body_1', 'body_2', 'button_1']);
  });

  it('maps receipt slot body fields like WhatsApp admin settings', () => {
    const mapping = buildVariableMappingForSlot('receipt', {
      body: { text: 'Hi {{1}}, your bill from {{2}} is ready: {{3}}' },
    });
    assert.deepEqual(mapping, {
      body_1: 'clientName',
      body_2: 'businessName',
      body_3: 'receiptLink',
    });
  });

  it('maps receipt URL button to receiptLink', () => {
    const mapping = buildVariableMappingForSlot('receipt', {
      body: { text: 'Hi {{1}}, bill from {{2}}' },
      buttons: [{ type: 'URL', text: 'View bill', url: 'https://example.com/{{1}}' }],
    });
    assert.equal(mapping.body_1, 'clientName');
    assert.equal(mapping.body_2, 'businessName');
    assert.equal(mapping.button_1, 'receiptLink');
  });

  it('maps appointment confirmation buttons to googleMapsUrl', () => {
    const mapping = buildVariableMappingForSlot('appointmentConfirmation', {
      body: { text: 'Hi {{1}}, appt {{2}} on {{3}} at {{4}} with {{5}} at {{6}}. Call {{7}}.' },
      buttons: [{ type: 'URL', text: 'Directions', url: 'https://maps.example/{{1}}' }],
    });
    assert.equal(mapping.button_1, 'googleMapsUrl');
    assert.equal(mapping.body_1, 'clientName');
  });
});
