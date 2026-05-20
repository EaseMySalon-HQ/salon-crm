/** Parse `YYYY-MM-DD` as local calendar date (avoids UTC shift from `new Date("YYYY-MM-DD")`). */
export function parseLocalYmd(ymd: string | undefined | null): Date | undefined {
  if (!ymd) return undefined
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

/** Format a Date as `YYYY-MM-DD` in local time. */
export function toLocalYmd(date: Date | undefined | null): string {
  if (!date) return ""
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
