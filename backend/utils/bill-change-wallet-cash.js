'use strict';

/**
 * Cash physically received on checkout but credited to prepaid wallet (bill change → wallet).
 * It is stored on the sale as `billChangeCreditedToWallet` and intentionally omitted from
 * recorded cash payment lines (those reflect bill settlement only). Cash register / drawer
 * totals must add this amount so expected cash matches the till.
 *
 * Revenue (`grossTotal` / line items) is unchanged — wallet credit is liability until redeemed.
 */
function billChangeCreditedToWalletCashAddition(sale) {
  const n = Number(sale && sale.billChangeCreditedToWallet);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

module.exports = { billChangeCreditedToWalletCashAddition };
