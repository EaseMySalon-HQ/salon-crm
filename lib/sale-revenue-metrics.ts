/**
 * Revenue metrics — tips are never included (mirrors backend/lib/sale-revenue-metrics.js).
 * Use `grossTotal` for net revenue; do not use Sale `netTotal` (bill + tip).
 */

export type SaleRevenueLike = {
  grossTotal?: number
  totalAmount?: number
  loyaltyDiscountAmount?: number
  receiptTotalsBreakdown?: {
    lineDiscountAmount?: number
    cartDiscountAmount?: number
    membershipDiscountAmount?: number
    loyaltyDiscountAmount?: number
    totalInclTaxBeforeLoyalty?: number
  } | null
}

export function saleNetRevenue(sale: SaleRevenueLike | null | undefined): number {
  const gross = Number(sale?.grossTotal)
  if (Number.isFinite(gross) && gross >= 0) return gross
  const legacy = Number(sale?.totalAmount)
  if (Number.isFinite(legacy) && legacy >= 0) return legacy
  return 0
}

export function saleGrossRevenue(sale: SaleRevenueLike | null | undefined): number {
  const net = saleNetRevenue(sale)
  const b = sale?.receiptTotalsBreakdown
  if (b && typeof b === "object") {
    const deductions =
      (Number(b.lineDiscountAmount) || 0) +
      (Number(b.cartDiscountAmount) || 0) +
      (Number(b.membershipDiscountAmount) || 0) +
      (Number(b.loyaltyDiscountAmount) || 0)
    if (deductions > 0.005) return net + deductions
    const beforeLoyalty = Number(b.totalInclTaxBeforeLoyalty)
    if (Number.isFinite(beforeLoyalty) && beforeLoyalty > net + 0.005) return beforeLoyalty
  }
  const loyalty = Number(sale?.loyaltyDiscountAmount) || Number(b?.loyaltyDiscountAmount) || 0
  if (loyalty > 0.005) return net + loyalty
  return net
}
