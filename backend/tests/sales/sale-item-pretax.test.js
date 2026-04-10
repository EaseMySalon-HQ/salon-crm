/**
 * Unit tests for lib/sale-item-pretax.js — line pre-tax totals used when creating sales
 * (Quick Sale / POS item mapping with staff contributions).
 */

const { getItemPreTaxTotal } = require('../../lib/sale-item-pretax');

describe('getItemPreTaxTotal', () => {
  it('returns 0 for null/invalid item', () => {
    expect(getItemPreTaxTotal(null)).toBe(0);
    expect(getItemPreTaxTotal(undefined)).toBe(0);
    expect(getItemPreTaxTotal('x')).toBe(0);
  });

  it('uses priceExcludingGST * quantity when set', () => {
    expect(
      getItemPreTaxTotal({ priceExcludingGST: 100, quantity: 2 })
    ).toBe(200);
  });

  it('subtracts taxAmount from total when both finite', () => {
    expect(
      getItemPreTaxTotal({ total: 118, taxAmount: 18, quantity: 1 })
    ).toBe(100);
  });

  it('uses taxRate to back out GST from total when taxAmount not used', () => {
    const pre = getItemPreTaxTotal({ total: 118, taxRate: 18, quantity: 1 });
    expect(Math.round(pre * 100) / 100).toBeCloseTo(100, 1);
  });

  it('returns line total when total is set (typical POS / Quick Sale lines)', () => {
    expect(getItemPreTaxTotal({ total: 180, price: 100, quantity: 2 })).toBe(180);
  });

  /**
   * When `total` is omitted it defaults to 0; the implementation returns that before
   * the price*qty fallback — use priceExcludingGST or explicit total in real payloads.
   */
  it('returns 0 when only price/qty are set without total or priceExcludingGST', () => {
    expect(getItemPreTaxTotal({ price: 100, quantity: 2, discount: 10 })).toBe(0);
  });
});
