'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkoutCardOnlineAmount, checkoutCashAmount } = require('../../lib/cash-registry-payment-ledger');

describe('cash-registry-payment-ledger', () => {
  it('counts only due online once when addPayment duplicated into payments', () => {
    const sale = {
      payments: [
        { mode: 'Cash', amount: 4000 },
        { mode: 'Online', amount: 500 },
      ],
      paymentHistory: [{ method: 'Online', amount: 500, date: new Date() }],
      paymentStatus: { paidAmount: 4500 },
    };
    assert.equal(checkoutCardOnlineAmount(sale), 0);
    assert.equal(checkoutCashAmount(sale), 4000);
  });

  it('counts checkout online when no paymentHistory', () => {
    const sale = {
      payments: [{ mode: 'Online', amount: 500 }],
      paymentHistory: [],
    };
    assert.equal(checkoutCardOnlineAmount(sale), 500);
  });

  it('counts checkout cash 4000 + due online 500 scenario for register total', () => {
    const sale = {
      payments: [{ mode: 'Cash', amount: 4000 }],
      paymentHistory: [{ method: 'Online', amount: 500, date: new Date() }],
      paymentStatus: { paidAmount: 4500 },
    };
    assert.equal(checkoutCardOnlineAmount(sale), 0);
    assert.equal(checkoutCashAmount(sale), 4000);
    const dueOnline = sale.paymentHistory[0].amount;
    assert.equal(checkoutCardOnlineAmount(sale) + dueOnline, 500);
  });
});
