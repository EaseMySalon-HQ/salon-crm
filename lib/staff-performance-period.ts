import type { DateRange } from "react-day-picker"

/** Same values as Staff Performance report period dropdown */
export type DatePeriod =
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "currentMonth"
  | "previousMonth"
  | "all"
  | "customRange"

const labels: Record<DatePeriod, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7days: "Last 7 days",
  last30days: "Last 30 days",
  currentMonth: "Current month",
  previousMonth: "Previous month",
  all: "All time",
  customRange: "Custom range",
}

export function getDatePeriodLabel(period: DatePeriod): string {
  return labels[period] ?? period
}

/**
 * Same bounds as Staff Performance `loadPerformanceData` — single source of truth for table + drawer.
 */
export function getPerformanceFilterBounds(
  datePeriod: DatePeriod,
  dateRange?: DateRange | undefined
): { startDate: Date; endDate: Date } {
  const now = new Date()
  let startDate: Date
  let endDate: Date = now

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (datePeriod) {
    case "today":
      startDate = new Date(today)
      endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      break
    case "yesterday": {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
      startDate = yesterday
      endDate = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
      break
    }
    case "last7days":
      startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      break
    case "last30days":
      startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      break
    case "currentMonth":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      break
    case "previousMonth":
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      endDate = new Date(now.getFullYear(), now.getMonth(), 0)
      break
    case "all":
      startDate = new Date(0)
      endDate = new Date()
      break
    case "customRange":
      if (dateRange?.from && dateRange?.to) {
        startDate = new Date(dateRange.from)
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(dateRange.to)
        endDate.setHours(23, 59, 59, 999)
      } else if (dateRange?.from) {
        startDate = new Date(dateRange.from)
        startDate.setHours(0, 0, 0, 0)
        endDate = new Date(dateRange.from)
        endDate.setHours(23, 59, 59, 999)
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      }
      break
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  }

  return { startDate, endDate }
}

export function getDateRangeForPeriod(
  datePeriod: DatePeriod,
  dateRange?: DateRange | undefined
): DateRange | undefined {
  const { startDate, endDate } = getPerformanceFilterBounds(datePeriod, dateRange)
  return { from: startDate, to: endDate }
}
