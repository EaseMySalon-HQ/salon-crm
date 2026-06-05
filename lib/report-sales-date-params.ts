import { getEndOfDayIST, getStartOfDayIST, getTodayIST, toDateStringIST } from "@/lib/date-utils"

export type ReportDatePeriod =
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "currentMonth"
  | "all"
  | "custom"

export function getReportDateRangeFromPeriod(period: ReportDatePeriod): { from?: Date; to?: Date } {
  const todayStr = getTodayIST()
  const today = new Date(getStartOfDayIST(todayStr))
  switch (period) {
    case "today":
      return { from: today, to: new Date(getEndOfDayIST(todayStr)) }
    case "yesterday": {
      const todayNoon = new Date(`${todayStr}T12:00:00+05:30`)
      const yesterdayNoon = new Date(todayNoon.getTime() - 24 * 60 * 60 * 1000)
      const yesterdayStr = toDateStringIST(yesterdayNoon)
      return {
        from: new Date(getStartOfDayIST(yesterdayStr)),
        to: new Date(getEndOfDayIST(yesterdayStr)),
      }
    }
    case "last7days": {
      const todayNoon = new Date(`${todayStr}T12:00:00+05:30`)
      const fromNoon = new Date(todayNoon.getTime() - 7 * 24 * 60 * 60 * 1000)
      const fromStr = toDateStringIST(fromNoon)
      return { from: new Date(getStartOfDayIST(fromStr)), to: new Date(getEndOfDayIST(todayStr)) }
    }
    case "last30days": {
      const todayNoon = new Date(`${todayStr}T12:00:00+05:30`)
      const fromNoon = new Date(todayNoon.getTime() - 30 * 24 * 60 * 60 * 1000)
      const fromStr = toDateStringIST(fromNoon)
      return { from: new Date(getStartOfDayIST(fromStr)), to: new Date(getEndOfDayIST(todayStr)) }
    }
    case "currentMonth": {
      const [y, m] = todayStr.split("-").map(Number)
      const firstStr = `${y}-${String(m).padStart(2, "0")}-01`
      const firstOfMonth = new Date(`${firstStr}T12:00:00+05:30`)
      const lastOfMonth = new Date(firstOfMonth)
      lastOfMonth.setUTCMonth(lastOfMonth.getUTCMonth() + 1)
      lastOfMonth.setUTCDate(0)
      const lastStr = toDateStringIST(lastOfMonth)
      return {
        from: new Date(getStartOfDayIST(firstStr)),
        to: new Date(getEndOfDayIST(lastStr)),
      }
    }
    default:
      return { from: undefined, to: undefined }
  }
}

/** Active calendar bounds for client-side guards (matches API window when possible). */
export function getReportActiveDateRange(
  period: ReportDatePeriod,
  dateRange: { from?: Date; to?: Date }
): { from?: Date; to?: Date } {
  if (period === "custom") {
    if (dateRange.from && dateRange.to) {
      const fromStr = toDateStringIST(dateRange.from)
      const toStr = toDateStringIST(dateRange.to)
      return {
        from: new Date(getStartOfDayIST(fromStr)),
        to: new Date(getEndOfDayIST(toStr)),
      }
    }
    return { from: undefined, to: undefined }
  }
  if (period === "all") return { from: undefined, to: undefined }
  return getReportDateRangeFromPeriod(period)
}

/** Query params for SalesAPI.getAll / getAllMergePages. `null` = custom range incomplete (skip fetch). */
export function resolveReportSalesApiDateParams(
  period: ReportDatePeriod,
  dateRange: { from?: Date; to?: Date }
): { dateFrom?: string; dateTo?: string } | null {
  if (period === "all") return {}
  if (period === "custom") {
    if (!dateRange.from || !dateRange.to) return null
    const fromStr = toDateStringIST(dateRange.from)
    const toStr = toDateStringIST(dateRange.to)
    return {
      dateFrom: getStartOfDayIST(fromStr),
      dateTo: getEndOfDayIST(toStr),
    }
  }
  const range = getReportDateRangeFromPeriod(period)
  if (!range.from || !range.to) return null
  return {
    dateFrom: getStartOfDayIST(toDateStringIST(range.from)),
    dateTo: getEndOfDayIST(toDateStringIST(range.to)),
  }
}
