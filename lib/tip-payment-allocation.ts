/**
 * Split tip amounts across Cash / Card / Online proportionally to how the bill was paid.
 */

export type TipPaymentBucket = "cash" | "card" | "online"

export type SalePaymentLike = {
  payments?: Array<{ mode?: string; type?: string; amount?: number }>
  paymentHistory?: Array<{ method?: string; amount?: number }>
  paymentMode?: string
  paymentStatus?: { paidAmount?: number }
  netTotal?: number
}

export function classifyPaymentModeLabel(mode: string): TipPaymentBucket | null {
  const m = (mode || "").toLowerCase()
  if (!m) return null
  if (m.includes("card")) return "card"
  if (m.includes("online") || m.includes("upi")) return "online"
  if (m.includes("cash")) return "cash"
  return null
}

/** Sum paid amounts per mode from checkout payments + due collections. */
export function getSalePaymentAmountsByMode(sale: SalePaymentLike): Record<TipPaymentBucket, number> {
  const amounts: Record<TipPaymentBucket, number> = { cash: 0, card: 0, online: 0 }

  const add = (mode: string, amt: number) => {
    const bucket = classifyPaymentModeLabel(mode)
    if (bucket && amt > 0.005) amounts[bucket] += amt
  }

  for (const p of sale.payments || []) {
    add(p.mode || p.type || "", Number(p.amount) || 0)
  }
  for (const ph of sale.paymentHistory || []) {
    add(ph.method || "", Number(ph.amount) || 0)
  }

  const total = amounts.cash + amounts.card + amounts.online
  if (total > 0.005) return amounts

  const paid =
    typeof sale.paymentStatus?.paidAmount === "number" && sale.paymentStatus.paidAmount > 0
      ? sale.paymentStatus.paidAmount
      : Number(sale.netTotal) || 0
  const bucket = classifyPaymentModeLabel(sale.paymentMode || "")
  if (bucket && paid > 0.005) amounts[bucket] = paid
  return amounts
}

export function allocateTipByPaymentModes(
  sale: SalePaymentLike,
  tipAmount: number
): Record<TipPaymentBucket, number> {
  const amounts = getSalePaymentAmountsByMode(sale)
  const total = amounts.cash + amounts.card + amounts.online
  if (tipAmount <= 0.005 || total <= 0.005) {
    return { cash: 0, card: 0, online: 0 }
  }
  return {
    cash: (tipAmount * amounts.cash) / total,
    card: (tipAmount * amounts.card) / total,
    online: (tipAmount * amounts.online) / total,
  }
}

export function getTipPaymentModeLabel(
  split: Record<TipPaymentBucket, number>
): "Cash" | "Card" | "Online" | "Mixed" {
  const active: TipPaymentBucket[] = (["cash", "card", "online"] as const).filter(
    (k) => split[k] > 0.005
  )
  if (active.length === 0) return "Mixed"
  if (active.length === 1) {
    if (active[0] === "cash") return "Cash"
    if (active[0] === "card") return "Card"
    return "Online"
  }
  return "Mixed"
}

export function formatTipModeBreakdown(split: Record<TipPaymentBucket, number>): string {
  const parts: string[] = []
  if (split.cash > 0.005) parts.push(`Cash ₹${split.cash.toFixed(2)}`)
  if (split.card > 0.005) parts.push(`Card ₹${split.card.toFixed(2)}`)
  if (split.online > 0.005) parts.push(`Online ₹${split.online.toFixed(2)}`)
  return parts.join(" · ")
}
