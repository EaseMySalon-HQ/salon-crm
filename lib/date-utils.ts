/**
 * Date utilities - All dates use IST (Asia/Kolkata, UTC+5:30)
 * Use these helpers wherever date parsing, ranges, or display is required.
 */

const IST_TIMEZONE = 'Asia/Kolkata'

/**
 * Get current date/time in IST
 */
export function nowIST(): Date {
  const str = new Date().toLocaleString('en-IN', { timeZone: IST_TIMEZONE })
  return new Date(str)
}

/**
 * Get today's date string (YYYY-MM-DD) in IST
 */
export function getTodayIST(): string {
  const d = new Date()
  const parts = d.toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/')
  const [dd, mm, yyyy] = parts.map((p) => p.trim().padStart(2, '0'))
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Format a date for display in IST
 */
export function formatInIST(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    ...options,
  })
}

/**
 * Format date as "dd MMM yyyy" in IST (e.g. "15 Feb 2025")
 */
export function formatDateIST(date: Date | string): string {
  return formatInIST(date, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Get YYYY-MM-DD string from a date in IST
 */
export function toDateStringIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const parts = d.toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/')
  const [dd, mm, yyyy] = parts.map((p) => p.trim().padStart(2, '0'))
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Create start of day (00:00:00) in IST for a given date string YYYY-MM-DD
 * Returns ISO string for API (midnight IST = previous day 18:30 UTC)
 */
export function getStartOfDayIST(dateStr: string): string {
  return `${dateStr}T00:00:00+05:30`
}

/**
 * Create end of day (23:59:59.999) in IST for a given date string YYYY-MM-DD
 */
export function getEndOfDayIST(dateStr: string): string {
  return `${dateStr}T23:59:59.999+05:30`
}

/** Add signed calendar days to a YYYY-MM-DD string (interpreted in IST). */
export function addCalendarDaysIST(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T12:00:00+05:30`)
  d.setDate(d.getDate() + deltaDays)
  return toDateStringIST(d)
}

/** Inclusive number of calendar days from `ymdFrom` through `ymdTo` (IST). */
export function daysInclusiveRange(ymdFrom: string, ymdTo: string): number {
  if (!ymdFrom || !ymdTo || ymdFrom > ymdTo) return 0
  const a = new Date(`${ymdFrom}T12:00:00+05:30`)
  const b = new Date(`${ymdTo}T12:00:00+05:30`)
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1
}

/** First calendar day of the month containing `ymd` (IST). */
export function getFirstDayOfMonthIST(ymd: string): string {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`
}
