'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyPromoToGstBreakdown,
  computeDiscountPaise,
} = require('../../lib/plan-promo');

test('applyPromoToGstBreakdown discounts base and recalculates GST', () => {
  const breakdown = {
    basePaise: 100000,
    gstPaise: 18000,
    totalPaise: 118000,
    gstRate: 0.18,
  };
  const promoResult = {
    ok: true,
    promo: {
      code: 'SAVE10',
      discountPaise: 10000,
      finalPaise: 90000,
      discountRupees: 100,
      finalRupees: 900,
    },
  };
  const { breakdown: next, promo } = applyPromoToGstBreakdown(breakdown, promoResult);
  assert.equal(promo.code, 'SAVE10');
  assert.equal(next.basePaise, 90000);
  assert.equal(next.gstPaise, 16200);
  assert.equal(next.totalPaise, 106200);
});

test('computeDiscountPaise caps fixed discount at base', () => {
  const { discountPaise, finalPaise } = computeDiscountPaise({
    discountType: 'fixed',
    discountValue: 9999,
    basePaise: 50000,
  });
  assert.equal(discountPaise, 50000);
  assert.equal(finalPaise, 0);
});
