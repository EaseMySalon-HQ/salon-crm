import { billChangeCreditedToWalletCashAddition } from "@/lib/bill-change-wallet-cash"

const EPS = 0.005

export type SaleAdjustmentSummary = {
  walletCredit: number
  hasAdjustment: boolean
  /** e.g. "Wallet +₹500.00" */
  displayLabel: string | null
  tooltip: string | null
}

/** Non-revenue tender adjustments on a sale (e.g. bill change credited to prepaid wallet). */
export function getSaleAdjustmentSummary(sale: {
  billChangeCreditedToWallet?: unknown
} | null | undefined): SaleAdjustmentSummary {
  const walletCredit = billChangeCreditedToWalletCashAddition(sale)
  if (walletCredit <= EPS) {
    return {
      walletCredit: 0,
      hasAdjustment: false,
      displayLabel: null,
      tooltip: null,
    }
  }
  const formatted = walletCredit.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return {
    walletCredit,
    hasAdjustment: true,
    displayLabel: `Wallet +₹${formatted}`,
    tooltip: `₹${formatted} change credited to the customer's prepaid wallet (not counted in bill total).`,
  }
}
