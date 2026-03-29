/** Final package price when pricing by discount from sum of included services. */
export function computePackagePriceFromDiscount(
  serviceSum: number,
  discountAmount: number,
  discountType: "FLAT" | "PERCENT"
): number {
  const d = Number(discountAmount) || 0
  if (serviceSum <= 0) return 0
  if (discountType === "PERCENT") {
    const pct = Math.min(100, Math.max(0, d))
    return Math.round(serviceSum * (1 - pct / 100) * 100) / 100
  }
  return Math.max(0, serviceSum - d)
}
