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
  paymentStatus?: {
    lastPaymentDate?: string | Date | null
  }
  loyaltyPointsRedeemed?: number
  loyaltyDiscountAmount?: number
}

/** Sale fields needed when inferring legacy receipt payments (pre–split-payment bills). */
export type SaleReceiptPaymentSource = SalePaymentSource & {
  status?: string
  invoiceDeleted?: boolean
  paymentStatus?: { paidAmount?: number; totalAmount?: number; remainingAmount?: number }
  grossTotal?: number
  paymentMode?: string
  tip?: number
}

export type ReceiptPaymentLine = {
  type: ReceiptPaymentType
  amount: number
  recordedAt: string
}

export type ReceiptPaymentType = "cash" | "card" | "online" | "wallet" | "reward" | "unknown"

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

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(Number(a) - Number(b)) < 0.01
}

function modesMatch(a: string, b: string): boolean {
  return normalizePaymentModeLabel(a).toLowerCase() === normalizePaymentModeLabel(b).toLowerCase()
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
  if (lower === "reward" || lower === "reward point" || lower === "reward points") return "Reward Point"
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

export function receiptPaymentTypeDisplayName(type: string | undefined | null): string {
  const t = String(type || "").toLowerCase()
  if (t === "cash") return "Cash"
  if (t === "card") return "Card"
  if (t === "online") return "Online"
  if (t === "wallet") return "Wallet"
  if (t === "reward") return "Reward Point"
  if (t === "unknown") return "Unknown"
  return normalizePaymentModeLabel(type)
}

export function modeStringToReceiptType(mode: string): ReceiptPaymentType {
  const m = String(mode || "").toLowerCase()
  if (m === "cash") return "cash"
  if (m === "card") return "card"
  if (m === "online") return "online"
  if (m === "wallet") return "wallet"
  if (m === "reward" || m === "reward point" || m === "reward points") return "reward"
  return "unknown"
}

export function buildSalePaymentModeFromCheckout(opts: {
  payments: Array<{ type?: string; mode?: string; amount?: number }>
  loyaltyPointsRedeemed?: number
  loyaltyDiscountAmount?: number
}): string {
  const modes: string[] = []
  for (const p of opts.payments) {
    if ((Number(p.amount) || 0) <= 0.005) continue
    const label = normalizePaymentModeLabel(p.mode ?? p.type)
    if (label && !modes.includes(label)) modes.push(label)
  }
  const disc = Number(opts.loyaltyDiscountAmount) || 0
  const pts = Math.floor(Number(opts.loyaltyPointsRedeemed) || 0)
  if (pts > 0 && disc > 0.005 && !modes.includes("Reward Point")) {
    modes.push("Reward Point")
  }
  if (modes.length === 0) {
    if (pts > 0 && disc > 0.005) return "Reward Point"
    return ""
  }
  return modes.join(", ")
}

/**
 * Maps `payments` + `paymentHistory` into one line per payment with the date it was recorded.
 * Checkout rows without a history match use `sale.date`; due collections use `paymentHistory[].date`
 * matched by amount + method (not array index alone).
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

  const usedHistory = new Set<number>()
  const matchHistoryDate = (payment: { mode: string; amount: number }): Date | null => {
    for (let i = 0; i < history.length; i++) {
      if (usedHistory.has(i)) continue
      const ph = history[i]
      const histAmount = Number(ph.amount ?? 0)
      const histMode = normalizePaymentModeLabel(ph.method)
      if (amountsMatch(histAmount, payment.amount) && modesMatch(histMode, payment.mode)) {
        usedHistory.add(i)
        return ph.date ? parseSaleDate(ph.date) : saleDate
      }
    }
    return null
  }

  const lastPaymentDateRaw = sale.paymentStatus?.lastPaymentDate
  const lastPaymentDate =
    lastPaymentDateRaw != null ? parseSaleDate(lastPaymentDateRaw) : null
  const saleHasLaterPayment =
    lastPaymentDate != null &&
    Math.abs(lastPaymentDate.getTime() - saleDate.getTime()) > 60_000

  return payments.map((p, idx) => {
    const fromHistory = matchHistoryDate(p)
    if (fromHistory) return { ...p, recordedAt: fromHistory }

    // Legacy rows: due collected but paymentHistory missing — use last payment timestamp.
    if (
      idx === payments.length - 1 &&
      payments.length > 1 &&
      history.length === 0 &&
      saleHasLaterPayment &&
      lastPaymentDate
    ) {
      return { ...p, recordedAt: lastPaymentDate }
    }

    return { ...p, recordedAt: saleDate }
  })
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
  type: ReceiptPaymentType
  amount: number
  recordedAt: string
}> {
  const saleDate = parseSaleDate(sale.date)
  const lines = getSalePaymentLinesWithDates(sale).map((line) => ({
    type: modeStringToReceiptType(line.mode),
    amount: line.amount,
    recordedAt: line.recordedAt.toISOString(),
  }))

  const loyaltyDisc = Math.max(0, Number(sale.loyaltyDiscountAmount) || 0)
  const loyaltyPts = Math.floor(Number(sale.loyaltyPointsRedeemed) || 0)
  if (loyaltyPts > 0 && loyaltyDisc > 0.005) {
    lines.push({
      type: "reward",
      amount: loyaltyDisc,
      recordedAt: saleDate.toISOString(),
    })
  }

  return lines
}

function legacyReceiptPaymentModeType(paymentMode?: string): ReceiptPaymentType {
  const first = String(paymentMode ?? "cash").split(",")[0]?.trim().toLowerCase() || "cash"
  return modeStringToReceiptType(normalizePaymentModeLabel(first))
}

function saleBillTotalAmount(sale: SaleReceiptPaymentSource): number {
  const fromPaymentStatus = sale.paymentStatus?.totalAmount
  if (typeof fromPaymentStatus === "number" && !Number.isNaN(fromPaymentStatus) && fromPaymentStatus > 0) {
    return fromPaymentStatus
  }
  const tip = Number(sale.tip) || 0
  return Math.max(0, Number(sale.grossTotal ?? 0) + tip)
}

function saleRecordedPaidAmount(sale: SaleReceiptPaymentSource): number {
  const paid = sale.paymentStatus?.paidAmount
  if (typeof paid === "number" && !Number.isNaN(paid)) return Math.max(0, paid)
  return 0
}

/**
 * Builds receipt payment lines from sale data. When `payments` / `paymentHistory` are empty,
 * only infers a legacy single payment for completed or partially paid bills — not unpaid bills.
 */
export function buildReceiptPaymentsWithLegacyFallback(
  sale: SaleReceiptPaymentSource
): ReceiptPaymentLine[] {
  const lines = buildReceiptPaymentsFromSale(sale)
  if (lines.length > 0) return lines

  if (sale.invoiceDeleted || String(sale.status || "").toLowerCase() === "cancelled") {
    return []
  }

  const status = String(sale.status || "").toLowerCase()
  const totalAmount = saleBillTotalAmount(sale)
  const paidAmount = saleRecordedPaidAmount(sale)
  const saleDate = parseSaleDate(sale.date)
  const modeType = legacyReceiptPaymentModeType(sale.paymentMode)

  if (status === "unpaid" || paidAmount < 0.005) {
    if (status !== "completed") return []
  }

  if (status === "completed" || paidAmount >= totalAmount - 0.005) {
    const amount = totalAmount > 0.005 ? totalAmount : Math.max(0, Number(sale.grossTotal ?? 0))
    if (amount < 0.005) return []
    return [{ type: modeType, amount, recordedAt: saleDate.toISOString() }]
  }

  if (paidAmount > 0.005) {
    return [{ type: modeType, amount: paidAmount, recordedAt: saleDate.toISOString() }]
  }

  return []
}
