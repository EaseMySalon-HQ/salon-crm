"use client"

import type { Receipt } from "@/lib/data"
import {
  getReceiptTotalsDisplayRows,
  resolveReceiptTotalsBreakdown,
  type ReceiptTotalsMeta,
} from "@/lib/receipt-totals-breakdown"

type ReceiptTotalsSectionProps = {
  receipt: Receipt & ReceiptTotalsMeta
  formatAmount: (amount: number) => string
  /** Detailed GST bifurcation (CGST/SGST by rate) rendered after the Tax row. */
  taxBreakdown?: React.ReactNode
}

export function ReceiptTotalsSection({
  receipt,
  formatAmount,
  taxBreakdown,
}: ReceiptTotalsSectionProps) {
  const breakdown = resolveReceiptTotalsBreakdown(receipt)
  const rows = getReceiptTotalsDisplayRows(breakdown)

  return (
    <div className="space-y-1 mb-4">
      {rows.map((row) => {
        if (row.key === "grand-total") return null
        if (row.key === "tip" && (receipt.tipLines?.length ?? 0) > 1) return null

        if (row.key === "tax") {
          if (breakdown.taxAmount <= 0.015) return null
          return (
            <div key={row.key}>
              <div className="flex justify-between font-semibold">
                <span>{row.label}:</span>
                <span>{formatAmount(row.amount)}</span>
              </div>
              {taxBreakdown}
            </div>
          )
        }

        const isDiscount = row.amount < -0.015
        const display = isDiscount
          ? `-${formatAmount(Math.abs(row.amount))}`
          : formatAmount(row.amount)

        const toneClass =
          row.tone === "discount"
            ? "text-emerald-700"
            : row.tone === "emphasis"
              ? "font-semibold text-foreground"
              : undefined

        return (
          <div key={row.key} className={`flex justify-between ${row.indent ? "ml-2 text-xs" : ""}`}>
            <span className={toneClass ? `${toneClass}` : undefined}>{row.label}:</span>
            <span className={`tabular-nums ${toneClass ?? ""}`}>{display}</span>
          </div>
        )
      })}
    </div>
  )
}

export function ReceiptGrandTotalRow({
  receipt,
  formatAmount,
  amount,
}: {
  receipt: Receipt & ReceiptTotalsMeta
  formatAmount: (amount: number) => string
  /** Override grand total (e.g. settlement bill total). */
  amount?: number
}) {
  const breakdown = resolveReceiptTotalsBreakdown(receipt)
  const total = amount ?? breakdown.grandTotal
  return (
    <div className="flex justify-between font-bold text-lg border-t-2 border-black pt-2 mt-2">
      <span>TOTAL:</span>
      <span className="tabular-nums">{formatAmount(total)}</span>
    </div>
  )
}
