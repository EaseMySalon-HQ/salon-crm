'use strict';

const {
  whatsappTemplateImportBatchBodySchema,
} = require('../../validation/schemas');

describe('whatsappTemplateImportBatchBodySchema', () => {
  test('accepts ids without any rename', () => {
    const parsed = whatsappTemplateImportBatchBodySchema.safeParse({
      platformTemplateIds: ['plat-1', 'plat-2'],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.names).toBeUndefined();
  });

  test('accepts per-template renames keyed by platform id', () => {
    const parsed = whatsappTemplateImportBatchBodySchema.safeParse({
      platformTemplateIds: ['plat-1'],
      names: { 'plat-1': 'ems_receipt_v2' },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.names['plat-1']).toBe('ems_receipt_v2');
  });

  test('accepts per-template dynamic URL sample URLs on import', () => {
    const parsed = whatsappTemplateImportBatchBodySchema.safeParse({
      platformTemplateIds: ['plat-1'],
      urlExamples: {
        'plat-1': { '0': 'https://www.easemysalon.in/receipt/public/inv-1' },
      },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.urlExamples['plat-1']['0']).toContain('receipt/public');
  });

  test('rejects invalid sample URL on import', () => {
    const parsed = whatsappTemplateImportBatchBodySchema.safeParse({
      platformTemplateIds: ['plat-1'],
      urlExamples: { 'plat-1': { '0': 'not-a-url' } },
    });
    expect(parsed.success).toBe(false);
  });

  test('rejects names Meta would not accept as an elementName', () => {
    for (const bad of ['EMS_Receipt', 'ems receipt', 'ems-receipt', '']) {
      const parsed = whatsappTemplateImportBatchBodySchema.safeParse({
        platformTemplateIds: ['plat-1'],
        names: { 'plat-1': bad },
      });
      expect(parsed.success).toBe(false);
    }
  });

  test('requires at least one template id', () => {
    expect(
      whatsappTemplateImportBatchBodySchema.safeParse({ platformTemplateIds: [] }).success
    ).toBe(false);
  });

  test('rejects unknown fields', () => {
    const parsed = whatsappTemplateImportBatchBodySchema.safeParse({
      platformTemplateIds: ['plat-1'],
      somethingElse: true,
    });
    expect(parsed.success).toBe(false);
  });
});
