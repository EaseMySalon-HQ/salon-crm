import {
  addCalendarDaysIST,
  getFirstDayOfMonthIST,
  getTodayIST,
  toDateStringIST,
} from "@/lib/date-utils"

export type TimesheetPeriod =
  | "today"
  | "this_week"
  | "current_month"
  | "last_month"
  | "last_3_months"
  | "custom"

export const TIMESHEET_PERIOD_LABELS: Record<TimesheetPeriod, string> = {
  today: "Today",
  this_week: "This Week",
  current_month: "Current Month",
  last_month: "Last Month",
  last_3_months: "Last 3 Months",
  custom: "Custom Date",
}

/** Dropdown order (Object.keys order is not guaranteed for all consumers). */
export const TIMESHEET_PERIOD_ORDER: TimesheetPeriod[] = [
  "today",
  "this_week",
  "current_month",
  "last_month",
  "last_3_months",
  "custom",
]

/** Shift to first day of another month (IST calendar). */
function firstDayOfMonthOffset(ymd: string, monthDelta: number): string {
  const first = getFirstDayOfMonthIST(ymd)
  const d = new Date(`${first}T12:00:00+05:30`)
  d.setMonth(d.getMonth() + monthDelta)
  return getFirstDayOfMonthIST(toDateStringIST(d))
}

/** Last calendar day of the month containing `ymd`. */
function lastDayOfMonthIST(ymd: string): string {
  const first = getFirstDayOfMonthIST(ymd)
  const nextFirst = firstDayOfMonthOffset(first, 1)
  return addCalendarDaysIST(nextFirst, -1)
}

/** Current calendar week (Sun–Sat) in IST. */
function thisWeekRangeIST(today: string): { startYmd: string; endYmd: string } {
  const dow = new Date(`${today}T12:00:00+05:30`).getDay()
  const startYmd = addCalendarDaysIST(today, -dow)
  const endYmd = addCalendarDaysIST(startYmd, 6)
  return { startYmd, endYmd }
}

export function computeTimesheetPeriodRange(
  period: TimesheetPeriod,
  customFrom?: string,
  customTo?: string
): { startYmd: string; endYmd: string; label: string } {
  const today = getTodayIST()

  switch (period) {
    case "today":
      return { startYmd: today, endYmd: today, label: TIMESHEET_PERIOD_LABELS.today }
    case "this_week": {
      const { startYmd, endYmd } = thisWeekRangeIST(today)
      return {
        startYmd,
        endYmd,
        label: `${TIMESHEET_PERIOD_LABELS.this_week} (${startYmd} – ${endYmd})`,
      }
    }
    case "current_month": {
      const startYmd = getFirstDayOfMonthIST(today)
      const endYmd = lastDayOfMonthIST(today)
      return {
        startYmd,
        endYmd,
        label: `${TIMESHEET_PERIOD_LABELS.current_month} (${startYmd} – ${endYmd})`,
      }
    }
    case "last_month": {
      const lastMonthRef = addCalendarDaysIST(getFirstDayOfMonthIST(today), -1)
      const startYmd = getFirstDayOfMonthIST(lastMonthRef)
      const endYmd = lastDayOfMonthIST(lastMonthRef)
      return {
        startYmd,
        endYmd,
        label: `${TIMESHEET_PERIOD_LABELS.last_month} (${startYmd} – ${endYmd})`,
      }
    }
    case "last_3_months": {
      const startYmd = firstDayOfMonthOffset(getFirstDayOfMonthIST(today), -2)
      return {
        startYmd,
        endYmd: today,
        label: `${TIMESHEET_PERIOD_LABELS.last_3_months} (${startYmd} – ${today})`,
      }
    }
    case "custom": {
      const from = customFrom?.trim() || today
      const to = customTo?.trim() || from
      const startYmd = from <= to ? from : to
      const endYmd = from <= to ? to : from
      return {
        startYmd,
        endYmd,
        label: startYmd === endYmd ? startYmd : `${startYmd} – ${endYmd}`,
      }
    }
    default:
      return { startYmd: today, endYmd: today, label: TIMESHEET_PERIOD_LABELS.today }
  }
}

/** Inclusive list of Date objects (noon IST) for each day in range. */
export function datesInRange(startYmd: string, endYmd: string): Date[] {
  const out: Date[] = []
  if (!startYmd || !endYmd || startYmd > endYmd) return out
  let cur = startYmd
  while (cur <= endYmd) {
    out.push(new Date(`${cur}T12:00:00+05:30`))
    cur = addCalendarDaysIST(cur, 1)
  }
  return out
}

export function ymdFromDate(d: Date): string {
  return toDateStringIST(d)
}
