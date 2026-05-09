export type ReceiptTipDisplayLine = { staffName?: string; amount: number }

/** Rows to show on receipts: split tips per staff, or one legacy row. */
export function receiptTipDisplayLines(receipt: {
  tip?: number
  tipStaffName?: string
  tipLines?: Array<{ staffName?: string; amount?: unknown; staffId?: unknown }> | null
}): ReceiptTipDisplayLine[] {
  const tip = Math.max(0, Number(receipt.tip) || 0)
  if (tip <= 0.005) return []
  const raw = receipt.tipLines
  if (Array.isArray(raw) && raw.length > 0) {
    const lines = raw
      .map((l) => ({
        staffName: l.staffName != null ? String(l.staffName).trim() : undefined,
        amount: Math.max(0, Number(l.amount) || 0),
      }))
      .filter((l) => l.amount > 0.005)
    if (lines.length > 0) return lines
  }
  const name = receipt.tipStaffName != null ? String(receipt.tipStaffName).trim() : undefined
  return [{ staffName: name || undefined, amount: tip }]
}
