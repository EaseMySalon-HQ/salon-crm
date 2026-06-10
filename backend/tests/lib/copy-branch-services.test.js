const mongoose = require('mongoose');
const {
  serviceDocToPayload,
  buildTargetKeyMap,
  remapBundleItems,
  mergeServiceOverrides,
} = require('../../lib/copy-branch-services');

describe('copy-branch-services helpers', () => {
  it('builds service payload with target branchId', () => {
    const payload = serviceDocToPayload(
      { name: 'Haircut', category: 'Hair', duration: 30, price: 500, isActive: true },
      '507f1f77bcf86cd799439011'
    );
    expect(payload.name).toBe('Haircut');
    expect(String(payload.branchId)).toBe('507f1f77bcf86cd799439011');
  });

  it('indexes target services by catalog key', () => {
    const map = buildTargetKeyMap([
      { _id: 'aaa', name: 'Haircut', sku: '' },
      { _id: 'bbb', name: 'Color', sku: 'COL-1' },
    ]);
    expect(map.get('haircut')).toBe('aaa');
    expect(map.get('col-1')).toBe('bbb');
  });

  it('remaps bundle item service ids', () => {
    const idMap = new Map([
      ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
      ['507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014'],
    ]);
    const out = remapBundleItems(
      [
        { serviceId: '507f1f77bcf86cd799439011', sortOrder: 0 },
        { serviceId: '507f1f77bcf86cd799439013', sortOrder: 1 },
      ],
      idMap
    );
    expect(out.ok).toBe(true);
    expect(out.items).toHaveLength(2);
    expect(String(out.items[0].serviceId)).toBe('507f1f77bcf86cd799439012');
  });

  it('fails bundle remap when a child service is missing', () => {
    const idMap = new Map([['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']]);
    const out = remapBundleItems(
      [
        { serviceId: '507f1f77bcf86cd799439011' },
        { serviceId: '507f1f77bcf86cd799439099' },
      ],
      idMap
    );
    expect(out.ok).toBe(false);
  });

  it('merges override maps with source winning on conflicts', () => {
    const merged = mergeServiceOverrides(
      { haircut: { price: 400 }, spa: { price: 1000 } },
      { haircut: { price: 499 }, facial: { price: 800 } }
    );
    expect(merged.haircut.price).toBe(499);
    expect(merged.spa.price).toBe(1000);
    expect(merged.facial.price).toBe(800);
  });
});
