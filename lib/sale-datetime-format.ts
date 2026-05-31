/** Sale.time is typically "HH:mm" (24h). Also accepts "h:mm AM/PM". Returns "hh:mm AM/PM". */
export function formatBillTimeStringTo12h(timeRaw: string | undefined | null): string | null {
  if (timeRaw == null || !String(timeRaw).trim()) return null
  const trimmed = String(timeRaw).trim()

  const twelveHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\b/i)
  if (twelveHourMatch) {
    const min = twelveHourMatch[2].padStart(2, "0")
    const ap = twelveHourMatch[3].toUpperCase()
    let h12 = parseInt(twelveHourMatch[1], 10) % 12
    if (h12 === 0) h12 = 12
    return `${String(h12).padStart(2, "0")}:${min} ${ap}`
  }

  const m = trimmed.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = m[2].padStart(2, "0")
  const ampm = h >= 12 ? "PM" : "AM"
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  return `${String(h12).padStart(2, "0")}:${min} ${ampm}`
}

/** Time from full ISO datetime, displayed in IST as "hh:mm AM/PM". */
export function formatInstantToTime12hIST(isoDate: Date): string {
  const s = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(isoDate)
  const match = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
  if (!match) return s
  const min = match[2].padStart(2, "0")
  const ap = match[3].toUpperCase()
  let h12 = parseInt(match[1], 10) % 12
  if (h12 === 0) h12 = 12
  return `${String(h12).padStart(2, "0")}:${min} ${ap}`
}

/**
 * Bill time for lists and receipts: prefer `sale.time` (checkout clock time),
 * not the time component of calendar `sale.date` (often midnight UTC → wrong IST).
 */
export function formatSaleTimeForDisplay(sale: {
  date: string | Date
  time?: string | null
}): string {
  const fromField = formatBillTimeStringTo12h(sale.time)
  if (fromField) return fromField
  const d = new Date(sale.date)
  if (Number.isNaN(d.getTime())) return ""
  return formatInstantToTime12hIST(d)
}
