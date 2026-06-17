import { billChangeCreditedToWalletCashAddition } from "@/lib/bill-change-wallet-cash"

const EPS = 0.005

function formatInr(amount: number): string {
  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export type SaleAdjustmentSummary = {
  walletCredit: number
  walletRefundCredit: number
  hasAdjustment: boolean
  /** e.g. "Wallet +₹500.00" or "Wallet refund +₹2,500.00" */
  displayLabel: string | null
  tooltip: string | null
}

function walletRefundCreditedAmount(sale: {
  walletRefundCredited?: unknown
  refundHistory?: Array<{ mode?: string; amount?: unknown }>
} | null | undefined): number {
  const fromField = Number(sale?.walletRefundCredited)
  if (Number.isFinite(fromField) && fromField > EPS) return fromField

  const history = sale?.refundHistory
  if (!Array.isArray(history)) return 0
  return history
    .filter((entry) => String(entry?.mode || "").toLowerCase() === "wallet")
    .reduce((sum, entry) => sum + Math.max(0, Number(entry?.amount) || 0), 0)
}

/** Non-revenue tender adjustments on a sale (bill change or product-return wallet refund). */
export function getSaleAdjustmentSummary(sale: {
  billChangeCreditedToWallet?: unknown
  walletRefundCredited?: unknown
  refundHistory?: Array<{ mode?: string; amount?: unknown }>
} | null | undefined): SaleAdjustmentSummary {
  const walletCredit = billChangeCreditedToWalletCashAddition(sale)
  const walletRefundCredit = walletRefundCreditedAmount(sale)

  if (walletCredit <= EPS && walletRefundCredit <= EPS) {
    return {
      walletCredit: 0,
      walletRefundCredit: 0,
      hasAdjustment: false,
      displayLabel: null,
      tooltip: null,
    }
  }

  const labelParts: string[] = []
  const tooltipParts: string[] = []

  if (walletCredit > EPS) {
    const formatted = formatInr(walletCredit)
    labelParts.push(`Wallet +₹${formatted}`)
    tooltipParts.push(
      `₹${formatted} change credited to the customer's prepaid wallet (not counted in bill total).`,
    )
  }

  if (walletRefundCredit > EPS) {
    const formatted = formatInr(walletRefundCredit)
    labelParts.push(`Wallet refund +₹${formatted}`)
    tooltipParts.push(
      `₹${formatted} product-return overpayment credited to prepaid wallet (not returned as cash).`,
    )
  }

  return {
    walletCredit,
    walletRefundCredit,
    hasAdjustment: true,
    displayLabel: labelParts.join(" · "),
    tooltip: tooltipParts.join(" "),
  }
}
