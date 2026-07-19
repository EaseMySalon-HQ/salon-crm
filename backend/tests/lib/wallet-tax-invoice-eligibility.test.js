'use strict';

const { isWalletTaxInvoiceEligible } = require('../../lib/wallet-tax-invoice-eligibility');

describe('wallet-tax-invoice-eligibility', () => {
  test('paid gateway recharges are invoice-eligible', () => {
    expect(
      isWalletTaxInvoiceEligible({
        type: 'credit',
        provider: 'razorpay',
        providerPaymentId: 'pay_123',
      }),
    ).toBe(true);
  });

  test('platform admin promo credits are not invoice-eligible', () => {
    expect(
      isWalletTaxInvoiceEligible({
        type: 'credit',
        provider: 'system',
        taxInvoiceEligible: false,
      }),
    ).toBe(false);

    expect(
      isWalletTaxInvoiceEligible({
        type: 'credit',
        provider: 'system',
      }),
    ).toBe(false);
  });

  test('admin paid credits with taxInvoiceEligible true are invoice-eligible', () => {
    expect(
      isWalletTaxInvoiceEligible({
        type: 'credit',
        provider: 'manual',
        taxInvoiceEligible: true,
      }),
    ).toBe(true);
  });

  test('wallet-funded plan payments remain invoice-eligible', () => {
    expect(
      isWalletTaxInvoiceEligible({
        type: 'credit',
        provider: 'system',
        providerPaymentId: '507f1f77bcf86cd799439011',
      }),
    ).toBe(true);
  });

  test('debits are never invoice-eligible', () => {
    expect(
      isWalletTaxInvoiceEligible({
        type: 'debit',
        provider: 'razorpay',
        providerPaymentId: 'pay_123',
      }),
    ).toBe(false);
  });
});
