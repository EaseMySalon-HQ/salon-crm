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
