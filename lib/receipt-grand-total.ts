import type { Receipt } from "@/lib/data"

/**
 * Amount due on the receipt (rounded bill + tip). Quick Sale sets `receipt.total` to
 * `calculatedTotal + tip`, where `calculatedTotal` includes membership / package lines.
 * `receipt.subtotal` is only services + products, so totals must not use `subtotal` alone.
 */
export function getReceiptGrandTotal(receipt: Receipt & { total?: number }): number {
  const direct = receipt.total
  if (typeof direct === "number" && !Number.isNaN(direct)) {
    return Math.round(direct)
  }
  const base = receipt.subtotalExcludingTax ?? receipt.subtotal
  return Math.round(base - (receipt.discount || 0) + (receipt.tip || 0))
}
