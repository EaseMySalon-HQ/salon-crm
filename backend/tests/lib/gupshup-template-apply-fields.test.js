'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildGupshupApplyFields,
  buildUrlButtonPayload,
  hasDynamicUrlPlaceholders,
  normalizeGupshupTemplateRecord,
} = require('../../lib/gupshup-template-apply-fields');

describe('gupshup-template-apply-fields', () => {
  it('detects dynamic URL placeholders', () => {
    assert.equal(hasDynamicUrlPlaceholders('https://example.com/{{1}}'), true);
    assert.equal(hasDynamicUrlPlaceholders('https://example.com/static'), false);
  });

  it('includes example array on dynamic URL buttons for Gupshup submit', () => {
    const payload = buildUrlButtonPayload({
      type: 'URL',
      text: 'View Bill',
      url: 'https://www.easemysalon.in/receipt/public/{{1}}',
      urlExample: 'https://www.easemysalon.in/receipt/public/INV-000001/abc123',
    });
    assert.deepEqual(payload.example, [
      'https://www.easemysalon.in/receipt/public/INV-000001/abc123',
    ]);
  });

  it('buildGupshupApplyFields serializes button examples in buttons JSON', () => {
    const fields = buildGupshupApplyFields({
      name: 'ems_receipt',
      language: 'en_US',
      category: 'UTILITY',
      components: {
        body: {
          text: 'Hi {{1}}, bill from {{2}}',
          examples: [['Priya', 'Glow Salon']],
        },
        buttons: [
          {
            type: 'URL',
            text: 'View Bill',
            url: 'https://www.easemysalon.in/receipt/public/{{1}}',
            urlExample: 'https://www.easemysalon.in/receipt/public/INV-000001/abc123',
          },
        ],
      },
    });
    const buttons = JSON.parse(fields.buttons);
    assert.equal(buttons[0].example[0], 'https://www.easemysalon.in/receipt/public/INV-000001/abc123');
  });

  it('normalizeGupshupTemplateRecord unwraps success envelope from GET template', () => {
    const normalized = normalizeGupshupTemplateRecord({
      status: 'success',
      template: {
        id: 'tpl-123',
        elementName: 'ems_receipt',
        status: 'APPROVED',
      },
    });
    assert.equal(normalized.status, 'APPROVED');
    assert.equal(normalized.id, 'tpl-123');
    assert.equal(normalized.elementName, 'ems_receipt');
  });

  it('normalizeGupshupTemplateRecord keeps flat list item shape', () => {
    const normalized = normalizeGupshupTemplateRecord({
      id: 'tpl-456',
      elementName: 'ems_receipt',
      status: 'PENDING',
    });
    assert.equal(normalized.status, 'PENDING');
    assert.equal(normalized.id, 'tpl-456');
  });
});
