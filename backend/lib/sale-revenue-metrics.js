'use strict';

/**
 * Revenue metrics for sales — tips are NEVER included.
 *
 * Sale schema naming (checkout):
 *   - `grossTotal` — bill for services/products after discounts/loyalty (excludes tips) → use for Net Revenue
 *   - `netTotal`   — bill + tip (customer checkout total) → do NOT use for revenue
 *   - `tip`        — staff pass-through; track via `tipsCollected` / staff-tip report only
 *
 * Gross Revenue — top-line bill before loyalty (and restored line/cart/membership discounts when breakdown exists).
 * Net Revenue   — final bill (`grossTotal`) after discounts, loyalty, returns; excludes tips.
 */

function saleNetRevenue(sale) {
  const gross = Number(sale?.grossTotal);
  if (Number.isFinite(gross) && gross >= 0) return gross;
  const legacy = Number(sale?.totalAmount);
  if (Number.isFinite(legacy) && legacy >= 0) return legacy;
  return 0;
}

function saleGrossRevenue(sale) {
  const net = saleNetRevenue(sale);
  const b = sale?.receiptTotalsBreakdown;
  if (b && typeof b === 'object') {
    const deductions =
      (Number(b.lineDiscountAmount) || 0) +
      (Number(b.cartDiscountAmount) || 0) +
      (Number(b.membershipDiscountAmount) || 0) +
      (Number(b.loyaltyDiscountAmount) || 0);
    if (deductions > 0.005) {
      return net + deductions;
    }
    const beforeLoyalty = Number(b.totalInclTaxBeforeLoyalty);
    if (Number.isFinite(beforeLoyalty) && beforeLoyalty > net + 0.005) {
      return beforeLoyalty;
    }
  }
  const loyalty =
    Number(sale?.loyaltyDiscountAmount) ||
    Number(b?.loyaltyDiscountAmount) ||
    0;
  if (loyalty > 0.005) {
    return net + loyalty;
  }
  return net;
}

function sumNetRevenueFromSales(sales) {
  if (!Array.isArray(sales)) return 0;
  return sales.reduce((sum, s) => sum + saleNetRevenue(s), 0);
}

function sumGrossRevenueFromSales(sales) {
  if (!Array.isArray(sales)) return 0;
  return sales.reduce((sum, s) => sum + saleGrossRevenue(s), 0);
}

/** @deprecated Use saleNetRevenue — never sum Sale.netTotal for revenue (includes tips). */
function legacyNetTotalMustNotBeUsedForRevenue(sale) {
  return saleNetRevenue(sale);
}

module.exports = {
  saleGrossRevenue,
  saleNetRevenue,
  sumNetRevenueFromSales,
  sumGrossRevenueFromSales,
  legacyNetTotalMustNotBeUsedForRevenue,
};
