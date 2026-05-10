import type { Receipt } from "@/lib/data"
import { getReceiptGrandTotal } from "@/lib/receipt-grand-total"

const EPS = 0.005

/** Display summary for TOTAL / Amount Received / Adjusted / Wallet / Outstanding / Total Paid (Bill). */
export type ReceiptSettlementSummary = {
  billTotal: number
  /** Sum of invoice payment allocations (toward this bill). */
  paidTowardBill: number
  /** Tender: paid toward bill plus any change credited to wallet. */
  amountReceived: number
  walletCredit: number
  outstanding: number
  /** Amount Received + Adjusted only when wallet credit or dues apply. */
  showReceivedAndAdjusted: boolean
  showWalletCreditLine: boolean
  showOutstandingLine: boolean
}

export function getReceiptSettlementSummary(receipt: Receipt): ReceiptSettlementSummary {
  const billTotal = getReceiptGrandTotal(receipt)
  const paidTowardBill = (receipt.payments || []).reduce((s, p) => s + (p?.amount || 0), 0)
  const walletCredit = Math.max(0, receipt.billChangeCreditedToWallet ?? 0)
  const amountReceived = paidTowardBill + walletCredit
  const outstanding = Math.max(0, billTotal - paidTowardBill)
  const showWalletCreditLine = walletCredit > EPS
  const showOutstandingLine = outstanding > EPS
  const showReceivedAndAdjusted = showWalletCreditLine || showOutstandingLine
  return {
    billTotal,
    paidTowardBill,
    amountReceived,
    walletCredit,
    outstanding,
    showReceivedAndAdjusted,
    showWalletCreditLine,
    showOutstandingLine,
  }
}
