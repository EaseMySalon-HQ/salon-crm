'use strict';

const {
  buildGupshupApplyFields,
  buildUrlButtonPayload,
  hasDynamicUrlPlaceholders,
  normalizeGupshupTemplateRecord,
} = require('../../lib/gupshup-template-apply-fields');

describe('gupshup-template-apply-fields', () => {
  it('detects dynamic URL placeholders', () => {
    expect(hasDynamicUrlPlaceholders('https://example.com/{{1}}')).toBe(true);
    expect(hasDynamicUrlPlaceholders('https://example.com/static')).toBe(false);
  });

  it('includes example array on dynamic URL buttons for Gupshup submit', () => {
    const payload = buildUrlButtonPayload({
      type: 'URL',
      text: 'View Bill',
      url: 'https://www.easemysalon.in/receipt/public/{{1}}',
      urlExample: 'https://www.easemysalon.in/receipt/public/INV-000001/abc123',
    });
    expect(payload.example).toEqual([
      'https://www.easemysalon.in/receipt/public/INV-000001/abc123',
    ]);
  });

  it('synthesizes a URL-safe example when a dynamic URL button has none', () => {
    const payload = buildUrlButtonPayload({
      type: 'URL',
      text: 'View Bill',
      url: 'https://www.easemysalon.in/receipt/public/{{1}}',
    });
    expect(payload.example).toEqual([
      'https://www.easemysalon.in/receipt/public/sample',
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
    expect(buttons[0].example[0]).toBe('https://www.easemysalon.in/receipt/public/INV-000001/abc123');
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
    expect(normalized.status).toBe('APPROVED');
    expect(normalized.id).toBe('tpl-123');
    expect(normalized.elementName).toBe('ems_receipt');
  });

  it('normalizeGupshupTemplateRecord keeps flat list item shape', () => {
    const normalized = normalizeGupshupTemplateRecord({
      id: 'tpl-456',
      elementName: 'ems_receipt',
      status: 'PENDING',
    });
    expect(normalized.status).toBe('PENDING');
    expect(normalized.id).toBe('tpl-456');
  });
});
