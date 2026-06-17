import type { Receipt } from "@/lib/data"
import { formatPaymentRecordedDateLabelFromIso } from "@/lib/sale-payment-lines"

const EPS = 0.005

export type ReceiptRefundLine = {
  amount: number
  mode: string
  date?: string
  editReason?: string
  dateLabel?: string | null
}

export function mapSaleRefundHistoryForReceipt(raw: unknown): ReceiptRefundLine[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const lines = raw
    .map((entry: any) => {
      const amount = Math.max(0, Number(entry?.amount) || 0)
      const mode = String(entry?.mode || "").trim()
      if (amount <= EPS || !mode) return null
      const date =
        entry?.date != null
          ? typeof entry.date === "string"
            ? entry.date
            : new Date(entry.date).toISOString()
          : undefined
      return {
        amount,
        mode,
        date,
        editReason: entry?.editReason != null ? String(entry.editReason).trim() : undefined,
        dateLabel: formatPaymentRecordedDateLabelFromIso(date),
      } satisfies ReceiptRefundLine
    })
    .filter(Boolean) as ReceiptRefundLine[]
  return lines.length > 0 ? lines : undefined
}

export function getReceiptRefundLines(
  receipt: Pick<Receipt, "refundHistory" | "walletRefundCredited"> | null | undefined,
): ReceiptRefundLine[] {
  const fromHistory = receipt?.refundHistory
  if (Array.isArray(fromHistory) && fromHistory.length > 0) {
    return fromHistory.filter((line) => line.amount > EPS)
  }

  const walletTotal = Number(receipt?.walletRefundCredited)
  if (Number.isFinite(walletTotal) && walletTotal > EPS) {
    return [{ amount: walletTotal, mode: "Wallet", dateLabel: null }]
  }

  return []
}

export function formatReceiptRefundModeLabel(mode: string): string {
  const normalized = String(mode || "").trim().toLowerCase()
  if (normalized === "wallet") return "Wallet"
  if (normalized === "cash") return "Cash"
  return mode || "Refund"
}

/** HTML block for print / thermal receipts. */
export function buildReceiptRefundsSectionHtml(
  refunds: ReceiptRefundLine[],
  formatAmount: (amount: number) => string,
): string {
  if (!refunds.length) return ""
  const rows = refunds
    .map((refund) => {
      const mode = formatReceiptRefundModeLabel(refund.mode)
      const dateSuffix = refund.dateLabel ? ` (${refund.dateLabel})` : ""
      return `
            <div class="payment-line" style="color: #92400e; font-weight: 600;">
              <span>Refund (${mode})${dateSuffix}:</span>
              <span>${formatAmount(refund.amount)}</span>
            </div>`
    })
    .join("")
  return `
          <div class="payments" style="margin-top: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;">Refund(s):</div>
            ${rows}
          </div>`
}
