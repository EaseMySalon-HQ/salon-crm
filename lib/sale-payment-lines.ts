import { format } from "date-fns"

/** Raw sale-like shape from API or Quick Sale state */
export type SalePaymentSource = {
  date?: string | Date | null
  payments?: Array<{ mode?: string; type?: string; amount?: number } | null>
  paymentHistory?: Array<{
    date?: string | Date | null
    amount?: number
    method?: string
  } | null>
}

export type SalePaymentLine = {
  mode: string
  amount: number
  recordedAt: Date
}

function parseSaleDate(d: SalePaymentSource["date"]): Date {
  if (d == null) return new Date()
  const x = d instanceof Date ? d : new Date(d)
  return Number.isNaN(x.getTime()) ? new Date() : x
}

/** Normalize mode/type to a display label (Cash, Card, Online). */
export function normalizePaymentModeLabel(modeOrType: string | undefined | null): string {
  const raw = String(modeOrType ?? "Cash").trim()
  if (!raw) return "Cash"
  const lower = raw.toLowerCase()
  if (lower === "cash") return "Cash"
  if (lower === "card") return "Card"
  if (lower === "online") return "Online"
  if (lower === "wallet") return "Wallet"
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

export function modeStringToReceiptType(
  mode: string
): "cash" | "card" | "online" | "wallet" | "unknown" {
  const m = String(mode || "").toLowerCase()
  if (m === "cash") return "cash"
  if (m === "card") return "card"
  if (m === "online") return "online"
  if (m === "wallet") return "wallet"
  return "unknown"
}

/**
 * Maps `payments` + `paymentHistory` into one line per payment with the date it was recorded.
 * Checkout rows without history use `sale.date`; due collections use `paymentHistory[].date`.
 */
export function getSalePaymentLinesWithDates(sale: SalePaymentSource): SalePaymentLine[] {
  const saleDate = parseSaleDate(sale.date)
  const rawPayments = (sale.payments || []).filter(Boolean) as Array<{
    mode?: string
    type?: string
    amount?: number
  }>
  const payments = rawPayments.map((p) => ({
    mode: normalizePaymentModeLabel(p.mode ?? p.type),
    amount: Number(p.amount ?? 0),
  }))
  const history = (sale.paymentHistory || []).filter(Boolean) as Array<{
    date?: string | Date | null
    amount?: number
    method?: string
  }>

  if (payments.length === 0 && history.length === 0) return []

  if (payments.length === 0 && history.length > 0) {
    return history.map((ph) => ({
      mode: normalizePaymentModeLabel(ph.method),
      amount: Number(ph.amount ?? 0),
      recordedAt: ph.date ? parseSaleDate(ph.date) : saleDate,
    }))
  }

  if (history.length === 0) {
    return payments.map((p) => ({ ...p, recordedAt: saleDate }))
  }

  if (history.length > payments.length) {
    return history.map((ph, i) => ({
      mode: payments[i]?.mode ?? normalizePaymentModeLabel(ph.method),
      amount: Number(ph.amount ?? payments[i]?.amount ?? 0),
      recordedAt: ph.date ? parseSaleDate(ph.date) : saleDate,
    }))
  }

  const nCheckout = Math.max(0, payments.length - history.length)
  const lines: SalePaymentLine[] = []

  for (let i = 0; i < nCheckout; i++) {
    const p = payments[i]
    if (!p) break
    lines.push({ ...p, recordedAt: saleDate })
  }

  for (let j = 0; j < history.length; j++) {
    const ph = history[j]
    const pi = nCheckout + j
    const p = payments[pi]
    lines.push({
      mode: p?.mode ?? normalizePaymentModeLabel(ph.method),
      amount: Number(ph.amount ?? p?.amount ?? 0),
      recordedAt: ph.date ? parseSaleDate(ph.date) : saleDate,
    })
  }

  return lines
}

export function formatPaymentRecordedDateLabel(d: Date): string {
  return format(d, "dd MMM yyyy")
}

export function formatPaymentRecordedDateLabelFromIso(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return formatPaymentRecordedDateLabel(d)
}

/** Receipt / API payload: lowercase type + ISO recordedAt for each split. */
export function buildReceiptPaymentsFromSale(sale: SalePaymentSource): Array<{
  type: "cash" | "card" | "online" | "wallet" | "unknown"
  amount: number
  recordedAt: string
}> {
  return getSalePaymentLinesWithDates(sale).map((line) => ({
    type: modeStringToReceiptType(line.mode),
    amount: line.amount,
    recordedAt: line.recordedAt.toISOString(),
  }))
}
