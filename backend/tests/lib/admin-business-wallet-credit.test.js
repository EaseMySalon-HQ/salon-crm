'use strict';

const {
  creditBusinessWalletFromAdmin,
  parseCreditAmountPaise,
  MIN_ADMIN_WALLET_CREDIT_RUPEES,
  MAX_ADMIN_WALLET_CREDIT_RUPEES,
} = require('../../lib/admin-business-wallet-credit');

describe('admin-business-wallet-credit', () => {
  test('parseCreditAmountPaise accepts rupees within range', () => {
    expect(parseCreditAmountPaise(100)).toBe(10000);
    expect(parseCreditAmountPaise(MIN_ADMIN_WALLET_CREDIT_RUPEES)).toBe(100);
    expect(parseCreditAmountPaise(MAX_ADMIN_WALLET_CREDIT_RUPEES)).toBe(5000000);
  });

  test('parseCreditAmountPaise rejects invalid amounts', () => {
    expect(() => parseCreditAmountPaise(0)).toThrow(/between/i);
    expect(() => parseCreditAmountPaise(50001)).toThrow(/between/i);
    expect(() => parseCreditAmountPaise('abc')).toThrow(/between/i);
  });

  test('creditBusinessWalletFromAdmin increments balance and logs transaction', async () => {
    const businessId = '507f1f77bcf86cd799439011';
    const walletState = { balancePaise: 1000 };
    const Business = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: businessId,
            name: 'Demo Salon',
            status: 'active',
            wallet: walletState,
          }),
        }),
      }),
      findByIdAndUpdate: jest.fn().mockImplementation((_id, update) => {
        walletState.balancePaise += update.$inc['wallet.balancePaise'];
        return {
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue({ wallet: walletState }),
          }),
        };
      }),
    };

    const WalletTransaction = {
      create: jest.fn().mockResolvedValue({ _id: 'txn123' }),
    };

    const result = await creditBusinessWalletFromAdmin({
      Business,
      WalletTransaction,
      businessId,
      amountRupees: 250,
      note: 'Welcome bonus',
      admin: { firstName: 'Admin', lastName: 'User', email: 'admin@test.com' },
    });

    expect(result.amountRupees).toBe(250);
    expect(result.newBalancePaise).toBe(26000);
    expect(WalletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        type: 'credit',
        amountPaise: 25000,
        provider: 'system',
        taxInvoiceEligible: false,
        balanceAfterPaise: 26000,
        description: 'Trial account Credit',
      }),
    );
  });
});
