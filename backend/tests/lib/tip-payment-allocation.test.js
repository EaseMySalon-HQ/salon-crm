const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { allocateTipByPaymentModes } = require('../../lib/tip-payment-allocation');

describe('allocateTipByPaymentModes (backend)', () => {
  test('splits tip proportionally across payment modes', () => {
    const split = allocateTipByPaymentModes(
      {
        payments: [
          { mode: 'Cash', amount: 600 },
          { mode: 'Card', amount: 400 },
        ],
      },
      100
    );
    assert.equal(split.cash, 60);
    assert.equal(split.card, 40);
    assert.equal(split.online, 0);
  });

  test('uses explicit tipPaymentMode when set', () => {
    const split = allocateTipByPaymentModes(
      {
        tipPaymentMode: 'online',
        payments: [
          { mode: 'Cash', amount: 500 },
          { mode: 'Online', amount: 500 },
        ],
      },
      200
    );
    assert.equal(split.online, 200);
    assert.equal(split.cash, 0);
    assert.equal(split.card, 0);
  });
});
