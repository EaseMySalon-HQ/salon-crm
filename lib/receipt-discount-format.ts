/** Format line discount % for receipts (max 2 decimal places). */
export function formatReceiptDiscountPercent(discount: number | undefined | null): string {
  const n = Number(discount)
  if (!Number.isFinite(n) || n <= 0) return "-"
  return `${parseFloat(n.toFixed(2))}%`
}
