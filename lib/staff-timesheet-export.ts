import { format } from "date-fns"
import { downloadTablePdf, downloadTableXlsx } from "@/lib/inventory-lists-export"
import { formatInIST } from "@/lib/date-utils"
import { ymdFromDate } from "@/lib/staff-timesheet-period"

export interface TimesheetExportStaff {
  _id: string
  name: string
  role?: string
  workSchedule?: Array<{
    day: number
    enabled?: boolean
    startTime?: string
    endTime?: string
  }>
}

export interface TimesheetExportAttendance {
  staffId: string
  date: string
  checkInAt: string
  checkOutAt: string | null
  dayStatus?: string
}

export interface TimesheetExportBlock {
  staffId: string
  title: string
  startDate: string
  startTime: string
  endTime: string
  recurringFrequency?: string
  endDate?: string | null
}

function formatTime(iso: string | null): string {
  if (!iso) return ""
  return formatInIST(iso, { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()
}

function durationLabel(checkIn: string, checkOut: string | null): string {
  if (!checkOut) return ""
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime()
  if (ms <= 0) return ""
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatScheduleForDay(
  schedule: TimesheetExportStaff["workSchedule"],
  dayIndex: number
): string {
  const dayRow = schedule?.find((r) => r.day === dayIndex)
  if (!dayRow || dayRow.enabled === false) return "Weekoff"
  const start = dayRow.startTime || "09:00"
  const end = dayRow.endTime || "21:00"
  const [sh, sm] = start.split(":").map((v) => parseInt(v || "0", 10))
  const [eh, em] = end.split(":").map((v) => parseInt(v || "0", 10))
  const startLabel = format(new Date(2000, 0, 1, sh || 0, sm || 0), "h:mma").toLowerCase()
  const endLabel = format(new Date(2000, 0, 1, eh || 0, em || 0), "h:mma").toLowerCase()
  return `${startLabel} – ${endLabel}`
}

function blockAppliesOnDate(block: TimesheetExportBlock, dateStr: string): boolean {
  const rec = block.recurringFrequency || "none"
  if (rec === "none") return block.startDate === dateStr
  const end = block.endDate
  if (!end || dateStr < block.startDate || dateStr > end) return false
  if (rec === "daily") return true
  if (rec === "weekly") {
    return (
      new Date(`${block.startDate}T12:00:00+05:30`).getDay() ===
      new Date(`${dateStr}T12:00:00+05:30`).getDay()
    )
  }
  if (rec === "monthly") {
    return (
      new Date(`${block.startDate}T12:00:00+05:30`).getDate() ===
      new Date(`${dateStr}T12:00:00+05:30`).getDate()
    )
  }
  return false
}

export function buildTimesheetExportRows(
  staffList: TimesheetExportStaff[],
  periodDates: Date[],
  attendance: TimesheetExportAttendance[],
  blocks: TimesheetExportBlock[]
): (string | number)[][] {
  const attendanceMap = new Map<string, TimesheetExportAttendance>()
  attendance.forEach((a) => attendanceMap.set(`${a.staffId}_${a.date}`, a))

  const rows: (string | number)[][] = []

  for (const s of staffList) {
    for (const d of periodDates) {
      const dateStr = ymdFromDate(d)
      const dayIndex = d.getDay()
      const att = attendanceMap.get(`${s._id}_${dateStr}`)
      const dayBlocks = blocks.filter(
        (b) => String(b.staffId) === s._id && blockAppliesOnDate(b, dateStr)
      )
      const blockSummary = dayBlocks
        .map((b) => `${b.title} (${b.startTime}–${b.endTime})`)
        .join("; ")

      rows.push([
        s.name,
        s.role || "",
        dateStr,
        format(d, "EEE"),
        formatScheduleForDay(s.workSchedule, dayIndex),
        att ? formatTime(att.checkInAt) : "",
        att ? formatTime(att.checkOutAt) : "",
        att ? durationLabel(att.checkInAt, att.checkOutAt) : "",
        att
          ? att.dayStatus
            ? att.dayStatus.replace(/_/g, " ")
            : att.checkOutAt
              ? "Completed"
              : "On duty"
          : "",
        blockSummary,
      ])
    }
  }

  return rows
}

const TIMESHEET_HEADERS = [
  "Staff",
  "Role",
  "Date",
  "Day",
  "Scheduled hours",
  "Check in",
  "Check out",
  "Duration",
  "Status",
  "Block times",
]

export function exportStaffTimesheetXlsx(
  staffList: TimesheetExportStaff[],
  periodDates: Date[],
  attendance: TimesheetExportAttendance[],
  blocks: TimesheetExportBlock[],
  periodLabel: string
) {
  const rows = buildTimesheetExportRows(staffList, periodDates, attendance, blocks)
  const filename = `staff-timesheet-${periodLabel.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 40)}`
  downloadTableXlsx(filename, "Timesheet", TIMESHEET_HEADERS, rows)
}

export function exportStaffTimesheetPdf(
  staffList: TimesheetExportStaff[],
  periodDates: Date[],
  attendance: TimesheetExportAttendance[],
  blocks: TimesheetExportBlock[],
  periodLabel: string
) {
  const rows = buildTimesheetExportRows(staffList, periodDates, attendance, blocks)
  const filename = `staff-timesheet-${periodLabel.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 40)}`
  downloadTablePdf("Staff Timesheet Report", periodLabel, filename, TIMESHEET_HEADERS, rows, true)
}
