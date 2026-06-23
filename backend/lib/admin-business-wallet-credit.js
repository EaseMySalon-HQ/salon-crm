'use strict';

const MIN_ADMIN_WALLET_CREDIT_RUPEES = 1;
const MAX_ADMIN_WALLET_CREDIT_RUPEES = 50000;

function adminDisplayName(admin) {
  if (!admin) return 'Platform admin';
  if (admin.firstName || admin.lastName) {
    return `${admin.firstName || ''} ${admin.lastName || ''}`.trim();
  }
  return admin.name || admin.email || 'Platform admin';
}

function parseCreditAmountPaise(amountRupees) {
  const amount = Number(amountRupees);
  if (
    !Number.isFinite(amount)
    || amount < MIN_ADMIN_WALLET_CREDIT_RUPEES
    || amount > MAX_ADMIN_WALLET_CREDIT_RUPEES
  ) {
    const err = new Error(
      `Amount must be between ₹${MIN_ADMIN_WALLET_CREDIT_RUPEES} and ₹${MAX_ADMIN_WALLET_CREDIT_RUPEES}`,
    );
    err.status = 400;
    throw err;
  }
  return Math.round(amount * 100);
}

/**
 * Credit a tenant messaging wallet from the platform admin console.
 */
async function creditBusinessWalletFromAdmin({
  Business,
  WalletTransaction,
  businessId,
  amountRupees,
  note,
  admin,
}) {
  const amountPaise = parseCreditAmountPaise(amountRupees);
  const business = await Business.findById(businessId).select('wallet status name').lean();
  if (!business) {
    const err = new Error('Business not found');
    err.status = 404;
    throw err;
  }
  if (business.status === 'deleted') {
    const err = new Error('Cannot credit wallet for a deleted business');
    err.status = 400;
    throw err;
  }

  const updated = await Business.findByIdAndUpdate(
    businessId,
    {
      $inc: { 'wallet.balancePaise': amountPaise },
      $set: { updatedAt: new Date() },
    },
    { new: true },
  )
    .select('wallet')
    .lean();

  const newBalancePaise = Number(updated?.wallet?.balancePaise || 0);
  const noteTrim = note != null ? String(note).trim() : '';
  const adminLabel = adminDisplayName(admin);
  const description = noteTrim
    ? `Platform admin credit by ${adminLabel}: ${noteTrim}`
    : `Platform admin credit by ${adminLabel}`;

  const txn = await WalletTransaction.create({
    businessId,
    type: 'credit',
    amountPaise,
    provider: 'system',
    description,
    balanceAfterPaise: newBalancePaise,
    timestamp: new Date(),
  });

  return {
    transactionId: txn._id,
    amountPaise,
    amountRupees: amountPaise / 100,
    newBalancePaise,
    newBalanceRupees: newBalancePaise / 100,
    businessName: business.name,
  };
}

module.exports = {
  creditBusinessWalletFromAdmin,
  parseCreditAmountPaise,
  MIN_ADMIN_WALLET_CREDIT_RUPEES,
  MAX_ADMIN_WALLET_CREDIT_RUPEES,
};
