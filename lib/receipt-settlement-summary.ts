import type { Receipt } from "@/lib/data"
import { getReceiptGrandTotal } from "@/lib/receipt-grand-total"
import { getReceiptRefundLines } from "@/lib/receipt-refunds"

const EPS = 0.005

/** Display summary for TOTAL / Amount Received / Adjusted / Wallet / Outstanding / Total Paid (Bill). */
export type ReceiptSettlementSummary = {
  billTotal: number
  /** Sum of invoice payment allocations (toward this bill). */
  paidTowardBill: number
  /** Bill amount settled after product-return refunds (wallet refunds keep payment lines unchanged). */
  effectivePaidTowardBill: number
  /** Tender: paid toward bill plus any change credited to wallet. */
  amountReceived: number
  walletCredit: number
  outstanding: number
  refundLines: ReturnType<typeof getReceiptRefundLines>
  showRefundsSection: boolean
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
  const refundLines = getReceiptRefundLines(receipt)
  const walletRefundTotal = refundLines
    .filter((line) => String(line.mode || "").toLowerCase() === "wallet")
    .reduce((sum, line) => sum + line.amount, 0)
  const paidFromStatus = Number(receipt.paymentStatus?.paidAmount)
  const effectivePaidTowardBill =
    Number.isFinite(paidFromStatus) && paidFromStatus >= 0
      ? paidFromStatus
      : Math.max(0, paidTowardBill - walletRefundTotal)
  const outstanding = Math.max(0, billTotal - effectivePaidTowardBill)
  const showWalletCreditLine = walletCredit > EPS
  const showOutstandingLine = outstanding > EPS
  const showRefundsSection = refundLines.length > 0
  const showReceivedAndAdjusted = showWalletCreditLine || showOutstandingLine || showRefundsSection
  return {
    billTotal,
    paidTowardBill,
    effectivePaidTowardBill,
    amountReceived,
    walletCredit,
    outstanding,
    refundLines,
    showRefundsSection,
    showReceivedAndAdjusted,
    showWalletCreditLine,
    showOutstandingLine,
  }
}
