/** Business calendar for supplier bills — India Standard Time (Asia/Kolkata, UTC+5:30). */
export const PURCHASE_INVOICE_TIMEZONE = "Asia/Kolkata" as const

const istEnCaFormatter = /* @__PURE__ */ new Intl.DateTimeFormat("en-CA", {
  timeZone: PURCHASE_INVOICE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Today’s calendar date in IST for `<input type="date" />` (`YYYY-MM-DD`). */
export function istCalendarDateToday(reference: Date = new Date()): string {
  return istEnCaFormatter.format(reference)
}

/**
 * Stored `invoiceDate` (ISO from API) → `YYYY-MM-DD` in IST for `<input type="date" />`.
 */
export function purchaseInvoiceToIstDateInput(raw: unknown): string {
  if (raw == null || raw === "") return ""
  const dt = raw instanceof Date ? raw : new Date(raw as string)
  if (Number.isNaN(dt.getTime())) return ""
  return istEnCaFormatter.format(dt)
}

/**
 * Display invoice date in IST (`dd MMM yyyy` style — day zero-padded, short English month).
 */
export function formatPurchaseInvoiceIstDate(raw: unknown): string {
  if (raw == null || raw === "") return "—"
  const dt = raw instanceof Date ? raw : new Date(raw as string)
  if (Number.isNaN(dt.getTime())) return "—"
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: PURCHASE_INVOICE_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(dt)
}
