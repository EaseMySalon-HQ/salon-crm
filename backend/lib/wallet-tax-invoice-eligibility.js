'use strict';

/**
 * Wallet tax invoices apply only to paid gateway recharges — not complimentary
 * platform admin credits (no consideration, no GST).
 */
function isWalletTaxInvoiceEligible(tx) {
  if (!tx || tx.type !== 'credit') return false;
  if (tx.taxInvoiceEligible === false) return false;
  if (tx.provider === 'system' && !tx.providerPaymentId && !tx.providerOrderId) {
    return false;
  }
  return true;
}

module.exports = { isWalletTaxInvoiceEligible };
