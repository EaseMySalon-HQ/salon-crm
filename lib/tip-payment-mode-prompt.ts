import type { TipPaymentBucket } from "@/lib/tip-payment-allocation"

const PAY_EPS = 0.01

export function getCheckoutPaymentAmountByMode(
  mode: TipPaymentBucket,
  cash: number,
  card: number,
  online: number
): number {
  if (mode === "cash") return Math.max(0, cash)
  if (mode === "card") return Math.max(0, card)
  return Math.max(0, online)
}

export function getActiveCheckoutPaymentModes(
  cash: number,
  card: number,
  online: number
): TipPaymentBucket[] {
  const modes: TipPaymentBucket[] = []
  if (cash >= PAY_EPS) modes.push("cash")
  if (card >= PAY_EPS) modes.push("card")
  if (online >= PAY_EPS) modes.push("online")
  return modes
}

/** Modes used for this bill whose tender amount can cover the full tip. */
export function getTipEligiblePaymentModes(
  tipAmount: number,
  cash: number,
  card: number,
  online: number
): TipPaymentBucket[] {
  if (tipAmount <= PAY_EPS) return []
  return getActiveCheckoutPaymentModes(cash, card, online).filter(
    (mode) =>
      getCheckoutPaymentAmountByMode(mode, cash, card, online) + 1e-6 >= tipAmount
  )
}

export function needsTipPaymentModeSelection(
  tipAmount: number,
  cash: number,
  card: number,
  online: number
): boolean {
  if (tipAmount <= PAY_EPS) return false
  return getActiveCheckoutPaymentModes(cash, card, online).length >= 2
}

export function isTipPaymentModeValidForCheckout(
  mode: TipPaymentBucket | null | undefined,
  tipAmount: number,
  cash: number,
  card: number,
  online: number
): boolean {
  if (!mode) return false
  return getTipEligiblePaymentModes(tipAmount, cash, card, online).includes(mode)
}

export function getTipPaymentModeBlockReason(
  tipAmount: number,
  cash: number,
  card: number,
  online: number
): string | null {
  if (!needsTipPaymentModeSelection(tipAmount, cash, card, online)) return null
  const eligible = getTipEligiblePaymentModes(tipAmount, cash, card, online)
  if (eligible.length > 0) return null
  return `No payment mode has at least ₹${tipAmount.toFixed(2)} to assign the tip. Increase the cash, card, or online amount on at least one mode.`
}

export function resolveAutoTipPaymentMode(
  tipAmount: number,
  cash: number,
  card: number,
  online: number
): TipPaymentBucket | null {
  if (tipAmount <= PAY_EPS) return null
  const active = getActiveCheckoutPaymentModes(cash, card, online)
  return active.length === 1 ? active[0]! : null
}

export const TIP_PAYMENT_MODE_LABELS: Record<TipPaymentBucket, string> = {
  cash: "Cash",
  card: "Card",
  online: "Online",
}

export function normalizeStoredTipPaymentMode(raw: unknown): TipPaymentBucket | null {
  const m = String(raw || "").toLowerCase()
  if (m.includes("card")) return "card"
  if (m.includes("online") || m.includes("upi")) return "online"
  if (m.includes("cash")) return "cash"
  return null
}
