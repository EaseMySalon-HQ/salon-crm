"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { format, addDays, subDays, startOfWeek } from "date-fns"

import { ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, Clock, CalendarOff, RotateCcw, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { StaffDirectoryAPI, StaffAPI, BlockTimeAPI, AppointmentsAPI, StaffAttendanceAPI, AttendancePayrollSettingsAPI } from "@/lib/api"
import { formatInIST } from "@/lib/date-utils"
import { mergeAttendancePayrollSettings, type AttendancePayrollSettings } from "@/lib/attendance-payroll-settings"
import {
  computeTimesheetPeriodRange,
  datesInRange,
  type TimesheetPeriod,
} from "@/lib/staff-timesheet-period"
import {
  exportStaffTimesheetPdf,
  exportStaffTimesheetXlsx,
  type TimesheetExportAttendance,
  type TimesheetExportBlock,
} from "@/lib/staff-timesheet-export"
import { useToast } from "@/hooks/use-toast"
import {
  SETTINGS_INNER_CARD,
  SETTINGS_TABLE_HEAD_ROW,
  SETTINGS_TOOLBAR,
} from "@/lib/settings-panel-theme"

type TimesheetExportPeriod = TimesheetPeriod | "visible_week"

const EXPORT_PERIOD_LABELS: Record<TimesheetExportPeriod, string> = {
  visible_week: "Selected week",
  today: "Today",
  this_week: "This week (calendar)",
  current_month: "Current month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  custom: "Custom range",
}

const EXPORT_PERIOD_ORDER: TimesheetExportPeriod[] = [
  "visible_week",
  "current_month",
  "last_month",
  "last_3_months",
  "custom",
]

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

interface StaffWorkDay {
  day: number
  enabled?: boolean
  startTime?: string
  endTime?: string
}

interface StaffRow {
  _id: string
  name: string
  role?: string
  allowAppointmentScheduling?: boolean
  workSchedule?: StaffWorkDay[]
  isOwner?: boolean
}

interface BlockTimeEntry {
  _id: string
  staffId: { _id: string; name: string }
  title: string
  startDate: string
  startTime: string
  endTime: string
  recurringFrequency?: string
  endDate?: string | null
  description?: string
}

interface AttendanceEntry {
  id: string
  staffId: string
  date: string
  checkInAt: string
  checkOutAt: string | null
  status: "checked_in" | "completed"
  dayStatus?: "present" | "late" | "half_day" | "absent"
  lateMinutes?: number
}

function formatAttendanceTime(iso: string | null): string {
  if (!iso) return ""
  return formatInIST(iso, { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()
}

function formatAttendanceDuration(checkIn: string | null | undefined, checkOut: string | null | undefined): string {
  if (!checkIn || !checkOut) return "—"
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime()
  if (ms <= 0) return "—"
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatTimeRange(startTime: string, endTime: string): string {
  const [sh, sm] = startTime.split(":").map((v) => parseInt(v || "0", 10))
  const [eh, em] = endTime.split(":").map((v) => parseInt(v || "0", 10))
  const startLabel = format(new Date(2000, 0, 1, sh || 0, sm || 0), "h:mma")
  const endLabel = format(new Date(2000, 0, 1, eh || 0, em || 0), "h:mma")
  return `${startLabel.toLowerCase()} – ${endLabel.toLowerCase()}`
}

function blockAppliesOnDate(
  block: BlockTimeEntry,
  dateStr: string
): boolean {
  const rec = block.recurringFrequency || "none"
  if (rec === "none") return block.startDate === dateStr
  const end = block.endDate
  if (!end || dateStr < block.startDate || dateStr > end) return false
  if (rec === "daily") return true
  if (rec === "weekly") {
    return new Date(block.startDate + "T00:00:00").getDay() === new Date(dateStr + "T00:00:00").getDay()
  }
  if (rec === "monthly") {
    return new Date(block.startDate + "T00:00:00").getDate() === new Date(dateStr + "T00:00:00").getDate()
  }
  return false
}

function getDefaultWorkSchedule(existing?: StaffWorkDay[]): StaffWorkDay[] {
  const defaultRow = (day: number): StaffWorkDay => ({
    day,
    enabled: true,
    startTime: "09:00",
    endTime: "21:00",
  })
  if (!existing || !Array.isArray(existing) || existing.length === 0) {
    return DAY_NAMES.map((_, day) => defaultRow(day))
  }
  const byDay = new Map<number, StaffWorkDay>()
  for (const r of existing) {
    const d = typeof r.day === "number" ? r.day : parseInt(String(r.day), 10)
    if (d >= 0 && d <= 6) {
      byDay.set(d, {
        day: d,
        enabled: r.enabled !== false,
        startTime: typeof r.startTime === "string" ? r.startTime : "09:00",
        endTime: typeof r.endTime === "string" ? r.endTime : "21:00",
      })
    }
  }
  return DAY_NAMES.map((_, day) => byDay.get(day) ?? defaultRow(day))
}

function isStaffWeekOff(staff: StaffRow, dayOfWeek: number): boolean {
  const schedule = getDefaultWorkSchedule(staff.workSchedule)
  const dayRow = schedule.find((r) => r.day === dayOfWeek)
  return dayRow?.enabled === false
}

type EditModalState = { staff: StaffRow; dayIndex: number; dayDate: Date } | null

type AvailabilityType = "full" | "first-half" | "second-half" | "custom" | "off"

/** Parse time string (e.g. "9:00 AM", "1:00 PM", or "09:00") to minutes from midnight */
function parseTimeToMinutes(t: string): number {
  if (!t) return 0
  const cleaned = t.replace(/\s*(am|pm)/i, "").trim()
  const parts = cleaned.split(":")
  const h = parseInt(parts[0] || "0", 10)
  const m = parseInt(parts[1] || "0", 10)
  const isPm = /pm/i.test(t) && h < 12
  const hour = isPm ? h + 12 : /am/i.test(t) && h === 12 ? 0 : h
  return hour * 60 + m
}

function getFirstHalfHours(startTime: string, endTime: string): { start: string; end: string } {
  const startM = parseTimeToMinutes(startTime)
  const endM = parseTimeToMinutes(endTime)
  const midM = Math.floor((startM + endM) / 2)
  const midH = Math.floor(midM / 60)
  const midMin = midM % 60
  return {
    start: startTime,
    end: `${String(midH).padStart(2, "0")}:${String(midMin).padStart(2, "0")}`,
  }
}

function getSecondHalfHours(startTime: string, endTime: string): { start: string; end: string } {
  const startM = parseTimeToMinutes(startTime)
  const endM = parseTimeToMinutes(endTime)
  const midM = Math.floor((startM + endM) / 2)
  const midH = Math.floor(midM / 60)
  const midMin = midM % 60
  return {
    start: `${String(midH).padStart(2, "0")}:${String(midMin).padStart(2, "0")}`,
    end: endTime,
  }
}

function isAppointmentOutsideHours(apt: { time: string; duration?: number }, startTime: string, endTime: string): boolean {
  const aptStartM = parseTimeToMinutes(apt.time)
  const aptEndM = aptStartM + (apt.duration || 60)
  const rangeStartM = parseTimeToMinutes(startTime)
  const rangeEndM = parseTimeToMinutes(endTime)
  return aptStartM < rangeStartM || aptEndM > rangeEndM
}

export function StaffWorkingHoursContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [editModal, setEditModal] = useState<EditModalState>(null)
  const [modalAvailabilityType, setModalAvailabilityType] = useState<AvailabilityType>("full")
  const [modalStartTime, setModalStartTime] = useState("09:00")
  const [modalEndTime, setModalEndTime] = useState("21:00")
  const [conflictingAppointments, setConflictingAppointments] = useState<any[]>([])
  const [loadingAppointments, setLoadingAppointments] = useState(false)
  const [saving, setSaving] = useState(false)
  const [blockTimeModalOpen, setBlockTimeModalOpen] = useState(false)
  const [blockTitle, setBlockTitle] = useState("")
  const [blockStaffId, setBlockStaffId] = useState<string>("")
  const [blockStartDate, setBlockStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const [blockStartTime, setBlockStartTime] = useState("09:00")
  const [blockEndTime, setBlockEndTime] = useState("17:00")
  const [blockRecurring, setBlockRecurring] = useState<string>("none")
  const [blockEndDate, setBlockEndDate] = useState("")
  const [blockDescription, setBlockDescription] = useState("")
  const [creatingBlock, setCreatingBlock] = useState(false)
  const [blockTimes, setBlockTimes] = useState<BlockTimeEntry[]>([])
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceEntry[]>([])
  const [businessSettings, setBusinessSettings] = useState<AttendancePayrollSettings>(() =>
    mergeAttendancePayrollSettings(undefined)
  )
  const [selectedBlock, setSelectedBlock] = useState<BlockTimeEntry | null>(null)
  const [updatingBlock, setUpdatingBlock] = useState(false)
  const [returnToOnClose, setReturnToOnClose] = useState<string | null>(null)
  const [exportPeriod, setExportPeriod] = useState<TimesheetExportPeriod>("visible_week")
  const [exportCustomFrom, setExportCustomFrom] = useState("")
  const [exportCustomTo, setExportCustomTo] = useState("")
  const [exporting, setExporting] = useState(false)
  const [staffFilter, setStaffFilter] = useState<string>("all")

  const selectedDateObj = useMemo(
    () => (selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date()),
    [selectedDate]
  )
  const weekStart = useMemo(
    () => startOfWeek(selectedDateObj, { weekStartsOn: 0 }),
    [selectedDateObj]
  )
  const weekDates = useMemo(() => {
    const dates: Date[] = []
    for (let i = 0; i < 7; i++) dates.push(addDays(weekStart, i))
    return dates
  }, [weekStart])

  const todayStr = format(new Date(), "yyyy-MM-dd")
  const todayColumnIndex = weekDates.findIndex((d) => format(d, "yyyy-MM-dd") === todayStr)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await StaffDirectoryAPI.getAll()
        setStaff((res?.data as StaffRow[]) || [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    AttendancePayrollSettingsAPI.get()
      .then((res) => {
        if (res?.success) setBusinessSettings(mergeAttendancePayrollSettings(res.data))
      })
      .catch(() => {
        /* keep defaults */
      })
  }, [])

  const rows = useMemo(
    () =>
      [...staff].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [staff]
  )
  const filteredRows = useMemo(
    () => (staffFilter === "all" ? rows : rows.filter((s) => s._id === staffFilter)),
    [rows, staffFilter]
  )
  const staffOptionsForBlock = useMemo(() => rows.filter((s) => !s.isOwner), [rows])

  useEffect(() => {
    if (searchParams.get("addBlock") === "1") {
      setBlockTimeModalOpen(true)
      const returnTo = searchParams.get("returnTo")
      if (returnTo) setReturnToOnClose(returnTo)
      const date = searchParams.get("date")
      const time = searchParams.get("time")
      const staffId = searchParams.get("staffId")
      if (date) setBlockStartDate(date)
      if (time) {
        const mins = parseTimeToMinutes(time)
        const h = Math.floor(mins / 60)
        const m = mins % 60
        const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
        setBlockStartTime(timeStr)
        // Default end time: 30 min after start
        const endMins = mins + 30
        const eh = Math.floor(endMins / 60)
        const em = endMins % 60
        setBlockEndTime(`${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`)
      }
      if (staffId) setBlockStaffId(staffId)
      router.replace("/staff/working-hours", { scroll: false })
    }
  }, [searchParams, router])

  useEffect(() => {
    let cancelled = false
    const start = weekStart
    const end = weekDates[6]
    if (!start || !end) return
    const startStr = format(start, "yyyy-MM-dd")
    const endStr = format(end, "yyyy-MM-dd")
    BlockTimeAPI.getAll({ startDate: startStr, endDate: endStr })
      .then((res) => {
        if (cancelled) return
        if (res?.success && Array.isArray(res?.data)) setBlockTimes(res.data as BlockTimeEntry[])
        else setBlockTimes([])
      })
      .catch(() => {
        if (!cancelled) setBlockTimes([])
      })
    return () => {
      cancelled = true
    }
  }, [weekStart, weekDates])

  useEffect(() => {
    let cancelled = false
    const start = weekStart
    const end = weekDates[6]
    if (!start || !end) return
    const startStr = format(start, "yyyy-MM-dd")
    const endStr = format(end, "yyyy-MM-dd")
    StaffAttendanceAPI.list({ startDate: startStr, endDate: endStr })
      .then((res) => {
        if (cancelled) return
        if (res?.success && Array.isArray(res?.data)) {
          setAttendanceRecords(res.data as AttendanceEntry[])
        } else {
          setAttendanceRecords([])
        }
      })
      .catch(() => {
        if (!cancelled) setAttendanceRecords([])
      })
    return () => {
      cancelled = true
    }
  }, [weekStart, weekDates])

  const blocksByStaffAndDate = useMemo(() => {
    const map = new Map<string, BlockTimeEntry[]>()
    blockTimes.forEach((b) => {
      const staffId = typeof b.staffId === "object" && b.staffId?._id ? b.staffId._id : String(b.staffId)
      weekDates.forEach((d) => {
        const dateStr = format(d, "yyyy-MM-dd")
        if (!blockAppliesOnDate(b, dateStr)) return
        const key = `${staffId}_${dateStr}`
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(b)
      })
    })
    return map
  }, [blockTimes, weekDates])

  const attendanceByStaffAndDate = useMemo(() => {
    const map = new Map<string, AttendanceEntry>()
    attendanceRecords.forEach((a) => {
      map.set(`${a.staffId}_${a.date}`, a)
    })
    return map
  }, [attendanceRecords])

  const defaultHours = useMemo(() => {
    if (!editModal) return { start: "09:00", end: "21:00" }
    const schedule = getDefaultWorkSchedule(editModal.staff.workSchedule)
    const dayRow = schedule[editModal.dayIndex]
    return {
      start: dayRow.startTime || "09:00",
      end: dayRow.endTime || "21:00",
    }
  }, [editModal])

  const firstHalfHours = useMemo(
    () => getFirstHalfHours(defaultHours.start, defaultHours.end),
    [defaultHours]
  )
  const secondHalfHours = useMemo(
    () => getSecondHalfHours(defaultHours.start, defaultHours.end),
    [defaultHours]
  )

  useEffect(() => {
    if (!editModal) return
    const schedule = getDefaultWorkSchedule(editModal.staff.workSchedule)
    const dayRow = schedule[editModal.dayIndex]
    const defStart = dayRow.startTime || "09:00"
    const defEnd = dayRow.endTime || "21:00"
    const first = getFirstHalfHours(defStart, defEnd)
    const second = getSecondHalfHours(defStart, defEnd)

    if (dayRow.enabled === false) {
      setModalAvailabilityType("off")
      setModalStartTime(defStart)
      setModalEndTime(defEnd)
    } else if (dayRow.startTime === first.start && dayRow.endTime === first.end) {
      setModalAvailabilityType("first-half")
      setModalStartTime(first.start)
      setModalEndTime(first.end)
    } else if (dayRow.startTime === second.start && dayRow.endTime === second.end) {
      setModalAvailabilityType("second-half")
      setModalStartTime(second.start)
      setModalEndTime(second.end)
    } else if (dayRow.startTime === defStart && dayRow.endTime === defEnd) {
      setModalAvailabilityType("full")
      setModalStartTime(defStart)
      setModalEndTime(defEnd)
    } else {
      setModalAvailabilityType("custom")
      setModalStartTime(dayRow.startTime || defStart)
      setModalEndTime(dayRow.endTime || defEnd)
    }
    setConflictingAppointments([])
  }, [editModal])

  useEffect(() => {
    if (!editModal || modalAvailabilityType === "off") {
      setConflictingAppointments([])
      return
    }
    let cancelled = false
    setLoadingAppointments(true)
    const dateStr = format(editModal.dayDate, "yyyy-MM-dd")
    const getEffectiveHours = () => {
      switch (modalAvailabilityType) {
        case "full":
          return defaultHours
        case "first-half":
          return firstHalfHours
        case "second-half":
          return secondHalfHours
        case "custom":
          return { start: modalStartTime, end: modalEndTime }
        default:
          return defaultHours
      }
    }
    const hours = getEffectiveHours()
    AppointmentsAPI.getAll({ date: dateStr, limit: 100 })
      .then((res: any) => {
        if (cancelled) return
        const list = res?.data || []
        const staffId = editModal.staff._id
        const staffApts = list.filter((a: any) => {
          const sid = a.staffId?._id || a.staffId
          if (sid) return String(sid) === staffId
          const assignments = a.staffAssignments || []
          return assignments.some((s: any) => {
            const asid = s.staffId?._id || s.staffId
            return asid && String(asid) === staffId
          })
        })
        const outside = staffApts.filter((a: any) =>
          isAppointmentOutsideHours(a, hours.start, hours.end)
        )
        setConflictingAppointments(outside)
      })
      .catch(() => {
        if (!cancelled) setConflictingAppointments([])
      })
      .finally(() => {
        if (!cancelled) setLoadingAppointments(false)
      })
    return () => {
      cancelled = true
    }
  }, [editModal, modalAvailabilityType, modalStartTime, modalEndTime, defaultHours, firstHalfHours, secondHalfHours])

  const openEditModal = (s: StaffRow, dayIndex: number, dayDate: Date) => {
    if (s.isOwner) return
    setEditModal({ staff: s, dayIndex, dayDate })
  }

  const closeEditModal = () => {
    setEditModal(null)
  }

  const getEffectiveHoursForSave = () => {
    switch (modalAvailabilityType) {
      case "full":
        return defaultHours
      case "first-half":
        return firstHalfHours
      case "second-half":
        return secondHalfHours
      case "custom":
        return { start: modalStartTime, end: modalEndTime }
      case "off":
        return { start: defaultHours.start, end: defaultHours.end }
      default:
        return defaultHours
    }
  }

  const handleAvailabilityTypeChange = (value: AvailabilityType) => {
    setModalAvailabilityType(value)
    if (value === "full") {
      setModalStartTime(defaultHours.start)
      setModalEndTime(defaultHours.end)
    } else if (value === "first-half") {
      setModalStartTime(firstHalfHours.start)
      setModalEndTime(firstHalfHours.end)
    } else if (value === "second-half") {
      setModalStartTime(secondHalfHours.start)
      setModalEndTime(secondHalfHours.end)
    } else if (value === "off") {
      setModalStartTime(defaultHours.start)
      setModalEndTime(defaultHours.end)
    }
  }

  const handleUpdateWorkingHours = async () => {
    if (!editModal) return
    setSaving(true)
    try {
      const schedule = getDefaultWorkSchedule(editModal.staff.workSchedule)
      const hours = getEffectiveHoursForSave()
      const updated: StaffWorkDay = {
        day: editModal.dayIndex,
        enabled: modalAvailabilityType !== "off",
        startTime: hours.start,
        endTime: hours.end,
      }
      const newSchedule = schedule.map((row) =>
        row.day === editModal.dayIndex ? updated : row
      )
      const res = await StaffAPI.update(editModal.staff._id, { workSchedule: newSchedule })
      if (res?.success) {
        const list = staff.map((s) =>
          s._id === editModal.staff._id ? { ...s, workSchedule: newSchedule } : s
        )
        setStaff(list)
        closeEditModal()
      } else {
        alert("Failed to update working hours. Please try again.")
      }
    } catch (e) {
      console.error(e)
      alert("Failed to update working hours. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const hasOverride = useMemo(() => {
    if (!editModal) return false
    const schedule = getDefaultWorkSchedule(editModal.staff.workSchedule)
    const dayRow = schedule[editModal.dayIndex]
    const defStart = dayRow.startTime || "09:00"
    const defEnd = dayRow.endTime || "21:00"
    if (dayRow.enabled === false) return true
    const first = getFirstHalfHours(defStart, defEnd)
    const second = getSecondHalfHours(defStart, defEnd)
    if (dayRow.startTime === first.start && dayRow.endTime === first.end) return true
    if (dayRow.startTime === second.start && dayRow.endTime === second.end) return true
    if (dayRow.startTime !== defStart || dayRow.endTime !== defEnd) return true
    return false
  }, [editModal])

  const handleCancelConflictingAppointments = async () => {
    if (conflictingAppointments.length === 0) return
    if (!confirm(`Cancel ${conflictingAppointments.length} conflicting appointment(s)?`)) return
    setSaving(true)
    try {
      await Promise.all(
        conflictingAppointments.map((apt: any) =>
          AppointmentsAPI.update(apt._id, { status: "cancelled" })
        )
      )
      setConflictingAppointments([])
    } catch (e) {
      console.error(e)
      alert("Failed to cancel appointments.")
    } finally {
      setSaving(false)
    }
  }

  const handleReassignConflicting = () => {
    if (!editModal) return
    closeEditModal()
    router.push(
      `/appointments?view=calendar&date=${format(editModal.dayDate, "yyyy-MM-dd")}&staffId=${editModal.staff._id}`
    )
  }

  const handleRemoveOverride = async () => {
    if (!editModal) return
    setSaving(true)
    try {
      const schedule = getDefaultWorkSchedule(editModal.staff.workSchedule)
      const defStart = defaultHours.start
      const defEnd = defaultHours.end
      const updated: StaffWorkDay = {
        day: editModal.dayIndex,
        enabled: true,
        startTime: defStart,
        endTime: defEnd,
      }
      const newSchedule = schedule.map((row) =>
        row.day === editModal.dayIndex ? updated : row
      )
      const res = await StaffAPI.update(editModal.staff._id, { workSchedule: newSchedule })
      if (res?.success) {
        const list = staff.map((s) =>
          s._id === editModal.staff._id ? { ...s, workSchedule: newSchedule } : s
        )
        setStaff(list)
        closeEditModal()
      } else {
        alert("Failed to update. Please try again.")
      }
    } catch (e) {
      console.error(e)
      alert("Failed to update. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (blockTimeModalOpen && !selectedBlock) {
      setBlockStartDate(format(selectedDateObj, "yyyy-MM-dd"))
      const now = new Date()
      setBlockStartTime(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      )
      if (!blockStaffId && staffOptionsForBlock.length) setBlockStaffId(staffOptionsForBlock[0]._id)
    }
  }, [blockTimeModalOpen, selectedDateObj, staffOptionsForBlock, selectedBlock])

  useEffect(() => {
    if (selectedBlock) {
      setBlockTitle(selectedBlock.title)
      setBlockStaffId(typeof selectedBlock.staffId === "object" ? selectedBlock.staffId._id : String(selectedBlock.staffId))
      setBlockStartDate(selectedBlock.startDate)
      setBlockStartTime(selectedBlock.startTime)
      setBlockEndTime(selectedBlock.endTime)
      setBlockRecurring(selectedBlock.recurringFrequency || "none")
      setBlockEndDate(selectedBlock.endDate || "")
      setBlockDescription(selectedBlock.description || "")
    }
  }, [selectedBlock])

  const refetchBlockTimes = () => {
    BlockTimeAPI.getAll({
      startDate: format(weekStart, "yyyy-MM-dd"),
      endDate: format(weekDates[6], "yyyy-MM-dd"),
    }).then((r) => {
      if (r?.success && Array.isArray(r?.data)) setBlockTimes(r.data as BlockTimeEntry[])
    })
  }

  const handleUpdateBlockTime = async () => {
    if (!selectedBlock) return
    if (!blockTitle.trim()) {
      alert("Please enter a title.")
      return
    }
    if (["daily", "weekly", "monthly"].includes(blockRecurring) && !blockEndDate) {
      alert("Please set an end date for the selected repeat frequency.")
      return
    }
    if (["daily", "weekly", "monthly"].includes(blockRecurring) && blockEndDate < blockStartDate) {
      alert("End date must be on or after start date.")
      return
    }
    setUpdatingBlock(true)
    try {
      const res = await BlockTimeAPI.update(selectedBlock._id, {
        title: blockTitle.trim(),
        startDate: blockStartDate,
        startTime: blockStartTime,
        endTime: blockEndTime,
        recurringFrequency: blockRecurring,
        endDate: ["daily", "weekly", "monthly"].includes(blockRecurring) ? blockEndDate || null : null,
        description: blockDescription.slice(0, 200) || undefined,
      })
      if (res?.success) {
        setSelectedBlock(null)
        const extra = res as { warning?: string; overlappingAppointments?: unknown[] }
        if (Array.isArray(extra.overlappingAppointments) && extra.overlappingAppointments.length > 0) {
          toast({
            title: "Block updated",
            description:
              extra.warning ||
              "Existing appointments in this window are unchanged. The block stays visible on the calendar; bookings during this time are still allowed.",
          })
        }
        refetchBlockTimes()
      } else {
        toast({
          title: "Cannot Update Block Time",
          description: res?.error || res?.errorDetail || "Failed to update block time. Please try again.",
          variant: "destructive",
        })
      }
    } catch (e: any) {
      const data = e?.response?.data || e?.responseData
      const errMsg = data?.error || data?.errorDetail || data?.message || e?.message || "Failed to update block time. Please try again."
      toast({
        title: "Cannot Update Block Time",
        description: typeof errMsg === "string" ? errMsg : "Failed to update block time. Please try again.",
        variant: "destructive",
      })
    } finally {
      setUpdatingBlock(false)
    }
  }

  const handleDeleteBlockTime = async () => {
    if (!selectedBlock) return
    if (!confirm("Delete this block time?")) return
    setUpdatingBlock(true)
    try {
      const res = await BlockTimeAPI.delete(selectedBlock._id)
      if (res?.success) {
        setSelectedBlock(null)
        refetchBlockTimes()
      } else {
        alert("Failed to delete. Please try again.")
      }
    } catch (e) {
      console.error(e)
      alert("Failed to delete. Please try again.")
    } finally {
      setUpdatingBlock(false)
    }
  }

  const closeBlockTimeModal = () => {
    setBlockTimeModalOpen(false)
    setSelectedBlock(null)
    setBlockTitle("")
    setBlockStaffId("")
    setBlockEndDate("")
    setBlockDescription("")
    if (returnToOnClose) {
      router.push(returnToOnClose)
      setReturnToOnClose(null)
    }
  }

  const resolveExportRange = () => {
    if (exportPeriod === "visible_week") {
      const startYmd = format(weekDates[0], "yyyy-MM-dd")
      const endYmd = format(weekDates[6], "yyyy-MM-dd")
      return {
        startYmd,
        endYmd,
        label: `Week ${format(weekDates[0], "dd MMM")} – ${format(weekDates[6], "dd MMM yyyy")}`,
      }
    }
    return computeTimesheetPeriodRange(
      exportPeriod,
      exportCustomFrom,
      exportCustomTo
    )
  }

  const mapBlocksForExport = (entries: BlockTimeEntry[]): TimesheetExportBlock[] =>
    entries.map((b) => ({
      staffId:
        typeof b.staffId === "object" && b.staffId?._id
          ? String(b.staffId._id)
          : String(b.staffId),
      title: b.title,
      startDate: b.startDate,
      startTime: b.startTime,
      endTime: b.endTime,
      recurringFrequency: b.recurringFrequency,
      endDate: b.endDate,
    }))

  const handleExportTimesheet = async (kind: "xlsx" | "pdf") => {
    if (filteredRows.length === 0) {
      toast({ title: "No staff to export", variant: "destructive" })
      return
    }
    if (exportPeriod === "custom" && (!exportCustomFrom || !exportCustomTo)) {
      toast({ title: "Pick a custom date range", variant: "destructive" })
      return
    }

    setExporting(true)
    try {
      const range = resolveExportRange()
      const periodDates = datesInRange(range.startYmd, range.endYmd)
      if (periodDates.length === 0) {
        toast({ title: "Invalid date range", variant: "destructive" })
        return
      }

      const visibleStart = format(weekDates[0], "yyyy-MM-dd")
      const visibleEnd = format(weekDates[6], "yyyy-MM-dd")
      const useLoadedData =
        exportPeriod === "visible_week" &&
        range.startYmd === visibleStart &&
        range.endYmd === visibleEnd

      let attendance: TimesheetExportAttendance[] = []
      let blocks: TimesheetExportBlock[] = []

      if (useLoadedData) {
        attendance = attendanceRecords.map((a) => ({
          staffId: a.staffId,
          date: a.date,
          checkInAt: a.checkInAt,
          checkOutAt: a.checkOutAt,
          dayStatus: a.dayStatus,
        }))
        blocks = mapBlocksForExport(blockTimes)
      } else {
        const [attRes, blockRes] = await Promise.all([
          StaffAttendanceAPI.list({ startDate: range.startYmd, endDate: range.endYmd }),
          BlockTimeAPI.getAll({ startDate: range.startYmd, endDate: range.endYmd }),
        ])
        attendance =
          attRes?.success && Array.isArray(attRes.data)
            ? (attRes.data as AttendanceEntry[]).map((a) => ({
                staffId: a.staffId,
                date: a.date,
                checkInAt: a.checkInAt,
                checkOutAt: a.checkOutAt,
                dayStatus: a.dayStatus,
              }))
            : []
        blocks =
          blockRes?.success && Array.isArray(blockRes.data)
            ? mapBlocksForExport(blockRes.data as BlockTimeEntry[])
            : []
      }

      const staffList = filteredRows.map((s) => ({
        _id: s._id,
        name: s.name,
        role: s.role,
        workSchedule: s.workSchedule,
      }))

      if (kind === "xlsx") {
        exportStaffTimesheetXlsx(staffList, periodDates, attendance, blocks, range.label)
      } else {
        exportStaffTimesheetPdf(staffList, periodDates, attendance, blocks, range.label)
      }

      toast({ title: "Timesheet exported" })
    } catch (error) {
      console.error("Timesheet export failed:", error)
      toast({ title: "Export failed", variant: "destructive" })
    } finally {
      setExporting(false)
    }
  }

  const handleCreateBlockTime = async () => {
    if (!blockTitle.trim()) {
      alert("Please enter a title.")
      return
    }
    if (!blockStaffId) {
      alert("Please select staff.")
      return
    }
    if (["daily", "weekly", "monthly"].includes(blockRecurring) && !blockEndDate) {
      alert("Please set an end date for the selected repeat frequency.")
      return
    }
    if (["daily", "weekly", "monthly"].includes(blockRecurring) && blockEndDate < blockStartDate) {
      alert("End date must be on or after start date.")
      return
    }
    setCreatingBlock(true)
    try {
      const res = await BlockTimeAPI.create({
        staffId: blockStaffId,
        title: blockTitle.trim(),
        startDate: blockStartDate,
        startTime: blockStartTime,
        endTime: blockEndTime,
        recurringFrequency: blockRecurring,
        endDate: ["daily", "weekly", "monthly"].includes(blockRecurring) ? blockEndDate || undefined : undefined,
        description: blockDescription.slice(0, 200) || undefined,
      })
      if (res?.success) {
        const extra = res as { warning?: string; overlappingAppointments?: unknown[] }
        if (Array.isArray(extra.overlappingAppointments) && extra.overlappingAppointments.length > 0) {
          toast({
            title: "Time blocked",
            description:
              extra.warning ||
              "Existing appointments in this window are unchanged. The block stays visible on the calendar; bookings during this time are still allowed.",
          })
        }
        closeBlockTimeModal()
        refetchBlockTimes()
      } else {
        toast({
          title: "Cannot Block Time",
          description: res?.error || res?.errorDetail || "Failed to create block time. Please try again.",
          variant: "destructive",
        })
      }
    } catch (e: any) {
      const data = e?.response?.data || e?.responseData
      const errMsg = data?.error || data?.errorDetail || data?.message || e?.message || "Failed to create block time. Please try again."
      toast({
        title: "Cannot Block Time",
        description: typeof errMsg === "string" ? errMsg : "Failed to create block time. Please try again.",
        variant: "destructive",
      })
    } finally {
      setCreatingBlock(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
          {/* Toolbar: outside the table card */}
          <div className={SETTINGS_TOOLBAR}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card shadow-sm text-slate-700 dark:text-foreground gap-1.5 hover:bg-slate-50 dark:hover:bg-muted shrink-0 px-3 text-sm font-medium"
                  onClick={() => setBlockTimeModalOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add block time
                </Button>
                <div className="flex items-center gap-0.5 h-10 border border-slate-200 dark:border-border rounded-xl bg-white dark:bg-card shadow-sm px-1.5 w-full max-w-[220px] sm:w-[220px]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg shrink-0 text-slate-600 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-muted hover:text-slate-900 dark:hover:text-foreground"
                    onClick={() => setSelectedDate(format(subDays(selectedDateObj, 7), "yyyy-MM-dd"))}
                    aria-label="Previous week"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div
                    className="relative flex-1 min-w-0 h-8 flex items-center justify-center cursor-pointer rounded-md hover:bg-slate-50 dark:hover:bg-muted transition-colors text-sm font-medium text-slate-800 dark:text-foreground"
                    onClick={() => {
                      const el = dateInputRef.current
                      if (el) {
                        if (typeof el.showPicker === "function") el.showPicker()
                        else el.click()
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        dateInputRef.current?.showPicker?.()
                      }
                    }}
                    aria-label="Select date"
                  >
                    <span className="px-2 truncate">
                      {format(selectedDateObj, "dd MMM, yyyy")}
                    </span>
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                      aria-hidden
                      tabIndex={-1}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg shrink-0 text-slate-600 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-muted hover:text-slate-900 dark:hover:text-foreground"
                    onClick={() => setSelectedDate(format(addDays(selectedDateObj, 7), "yyyy-MM-dd"))}
                    aria-label="Next week"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2 sm:justify-end">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Staff</Label>
                  <Select value={staffFilter} onValueChange={setStaffFilter}>
                    <SelectTrigger className="w-[148px] bg-white dark:bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All staff</SelectItem>
                      {rows.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Export period</Label>
                  <Select
                    value={exportPeriod}
                    onValueChange={(v) => setExportPeriod(v as TimesheetExportPeriod)}
                  >
                    <SelectTrigger className="w-[168px] bg-white dark:bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPORT_PERIOD_ORDER.map((p) => (
                        <SelectItem key={p} value={p}>
                          {EXPORT_PERIOD_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {exportPeriod === "custom" ? (
                  <>
                    <Input
                      type="date"
                      value={exportCustomFrom}
                      onChange={(e) => setExportCustomFrom(e.target.value)}
                      className="w-[140px] bg-white dark:bg-card"
                    />
                    <Input
                      type="date"
                      value={exportCustomTo}
                      onChange={(e) => setExportCustomTo(e.target.value)}
                      className="w-[140px] bg-white dark:bg-card"
                    />
                  </>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={exporting || filteredRows.length === 0}>
                      {exporting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void handleExportTimesheet("xlsx")}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Excel (.xlsx)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleExportTimesheet("pdf")}>
                      <FileText className="h-4 w-4 mr-2" />
                      PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <div className={SETTINGS_INNER_CARD}>
            <Card className="border-0 rounded-2xl">
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                  </div>
                ) : filteredRows.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 dark:text-muted-foreground text-sm">No staff found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className={SETTINGS_TABLE_HEAD_ROW}>
                          <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-foreground w-56">Staff</th>
                          {weekDates.map((d, dayIndex) => {
                            const isToday = dayIndex === todayColumnIndex
                            return (
                              <th
                                key={d.toISOString()}
                                className={`text-center px-3 py-3 font-semibold whitespace-nowrap ${
                                  isToday
                                    ? "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 border-x border-indigo-200 dark:border-indigo-500/30"
                                    : "text-slate-700 dark:text-foreground"
                                }`}
                              >
                                <div className="flex flex-col items-center leading-tight gap-0.5">
                                  <span className={isToday ? "text-indigo-600 dark:text-indigo-300 font-medium" : "text-slate-500 dark:text-muted-foreground font-normal"}>
                                    {format(d, "dd MMM")}
                                  </span>
                                  <span>{format(d, "EEE")}{isToday ? " (Today)" : ""}</span>
                                </div>
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((s) => (
                            <tr
                              key={s._id}
                              className="border-b border-slate-100 dark:border-border last:border-b-0 hover:bg-slate-50/60 dark:hover:bg-muted/50"
                            >
                              <td className="px-4 py-3 align-top">
                                <div className="flex flex-col gap-1">
                                  <div className="font-medium text-slate-800 dark:text-foreground text-sm">{s.name}</div>
                                  {s.role ? (
                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-muted-foreground">
                                      <Badge
                                        variant={s.role === "admin" ? "default" : s.role === "manager" ? "secondary" : "outline"}
                                        className="text-[11px] px-2 py-0.5"
                                      >
                                        {s.role.charAt(0).toUpperCase() + s.role.slice(1)}
                                      </Badge>
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                              {weekDates.map((d, dayIndex) => {
                                const isToday = dayIndex === todayColumnIndex
                                const businessOpen = businessSettings.attendance.workingDays[dayIndex]
                                const dateStr = format(d, "yyyy-MM-dd")
                                const cellBlocks = blocksByStaffAndDate.get(`${s._id}_${dateStr}`) || []
                                const cellAttendance = attendanceByStaffAndDate.get(`${s._id}_${dateStr}`)
                                const isLate = cellAttendance?.dayStatus === "late"
                                const hasBlocks = cellBlocks.length > 0
                                const dayOfWeek = d.getDay()
                                const showWeekOff =
                                  isStaffWeekOff(s, dayOfWeek) && !cellAttendance
                                const showClosed =
                                  !businessOpen && !cellAttendance && !hasBlocks && !showWeekOff
                                return (
                                  <td
                                    key={`${s._id}-${d.toISOString()}`}
                                    className={`px-3 py-3 text-center align-top ${
                                      isToday ? "bg-indigo-50/80 border-x border-indigo-200" : ""
                                    }`}
                                  >
                                    <div className="flex flex-col items-stretch gap-1 min-h-[2.5rem] justify-center w-full min-w-[7.5rem]">
                                      {showClosed ? (
                                        <span className="text-[10px] text-slate-400 text-center">Closed</span>
                                      ) : showWeekOff ? (
                                        <span className="text-[10px] font-medium text-slate-500 text-center">Weekoff</span>
                                      ) : (
                                        <div className="flex flex-col gap-1 text-[10px] leading-snug">
                                          <div className="flex items-stretch gap-1">
                                            <div className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-md border border-slate-100 dark:border-border bg-slate-50/80 dark:bg-muted/50 px-2 py-1">
                                              <span className="text-slate-400 shrink-0">In</span>
                                              <span
                                                className={`font-medium tabular-nums truncate ${
                                                  isLate
                                                    ? "text-red-600"
                                                    : cellAttendance?.checkInAt
                                                      ? "text-slate-800"
                                                      : "text-slate-300"
                                                }`}
                                              >
                                                {cellAttendance?.checkInAt
                                                  ? formatAttendanceTime(cellAttendance.checkInAt)
                                                  : "—"}
                                              </span>
                                            </div>
                                            <div className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-md border border-slate-100 dark:border-border bg-slate-50/80 dark:bg-muted/50 px-2 py-1">
                                              <span className="text-slate-400 shrink-0">Out</span>
                                              <span
                                                className={`font-medium tabular-nums truncate ${
                                                  cellAttendance?.checkOutAt
                                                    ? "text-slate-800"
                                                    : cellAttendance?.checkInAt
                                                      ? "text-indigo-600"
                                                      : "text-slate-300"
                                                }`}
                                              >
                                                {cellAttendance?.checkOutAt
                                                  ? formatAttendanceTime(cellAttendance.checkOutAt)
                                                  : cellAttendance?.checkInAt
                                                    ? "On duty"
                                                    : "—"}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex items-center justify-between gap-2 rounded-md border border-slate-100 dark:border-border bg-slate-50/80 dark:bg-muted/50 px-2 py-1">
                                            <span className="text-slate-400 shrink-0">Duration</span>
                                            <span
                                              className={`font-medium tabular-nums ${
                                                cellAttendance?.checkOutAt ? "text-slate-800" : "text-slate-300"
                                              }`}
                                            >
                                              {formatAttendanceDuration(
                                                cellAttendance?.checkInAt,
                                                cellAttendance?.checkOutAt
                                              )}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                      {hasBlocks && (
                                        <div className="flex flex-col gap-0.5 w-full mt-0.5">
                                          {cellBlocks.map((block) => (
                                            <button
                                              key={block._id}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedBlock(block)
                                              }}
                                              className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 border border-red-200 truncate max-w-full w-full cursor-pointer hover:bg-red-200/80 transition-colors text-left"
                                              title={`${block.title} (${formatTimeRange(block.startTime, block.endTime)}) – Click to manage`}
                                            >
                                              {block.title} · {formatTimeRange(block.startTime, block.endTime)}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={!!editModal} onOpenChange={(open) => !open && closeEditModal()}>
          <DialogContent className="sm:max-w-lg rounded-2xl border-slate-200 shadow-xl">
            <DialogHeader className="space-y-1 pb-4">
              <DialogTitle className="text-xl font-semibold text-slate-900">
                Manage Availability
              </DialogTitle>
              <DialogDescription className="text-slate-500">
                {editModal && (
                  <span className="font-medium text-slate-600">
                    {editModal.staff.name} – {format(editModal.dayDate, "EEEE, dd MMM yyyy")}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            {editModal && (
              <div className="space-y-6 py-2">
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-slate-700">Availability Type</Label>
                  <RadioGroup
                    value={modalAvailabilityType}
                    onValueChange={(v) => handleAvailabilityTypeChange(v as AvailabilityType)}
                    className="grid gap-3"
                  >
                    <div className="flex items-center space-x-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50 transition-colors">
                      <RadioGroupItem value="full" id="avail-full" />
                      <Label htmlFor="avail-full" className="flex-1 cursor-pointer">
                        <span className="font-medium text-slate-800">Full Working Day</span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {format(new Date(2000, 0, 1, parseInt(defaultHours.start.split(":")[0], 10), parseInt(defaultHours.start.split(":")[1], 10)), "h:mma").toLowerCase()} – {format(new Date(2000, 0, 1, parseInt(defaultHours.end.split(":")[0], 10), parseInt(defaultHours.end.split(":")[1], 10)), "h:mma").toLowerCase()}
                        </span>
                      </Label>
                      <Clock className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="flex items-center space-x-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50 transition-colors">
                      <RadioGroupItem value="first-half" id="avail-first" />
                      <Label htmlFor="avail-first" className="flex-1 cursor-pointer">
                        <span className="font-medium text-slate-800">First Half Only</span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {format(new Date(2000, 0, 1, parseInt(firstHalfHours.start.split(":")[0], 10), parseInt(firstHalfHours.start.split(":")[1], 10)), "h:mma").toLowerCase()} – {format(new Date(2000, 0, 1, parseInt(firstHalfHours.end.split(":")[0], 10), parseInt(firstHalfHours.end.split(":")[1], 10)), "h:mma").toLowerCase()}
                        </span>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50 transition-colors">
                      <RadioGroupItem value="second-half" id="avail-second" />
                      <Label htmlFor="avail-second" className="flex-1 cursor-pointer">
                        <span className="font-medium text-slate-800">Second Half Only</span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {format(new Date(2000, 0, 1, parseInt(secondHalfHours.start.split(":")[0], 10), parseInt(secondHalfHours.start.split(":")[1], 10)), "h:mma").toLowerCase()} – {format(new Date(2000, 0, 1, parseInt(secondHalfHours.end.split(":")[0], 10), parseInt(secondHalfHours.end.split(":")[1], 10)), "h:mma").toLowerCase()}
                        </span>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50 transition-colors">
                      <RadioGroupItem value="custom" id="avail-custom" />
                      <Label htmlFor="avail-custom" className="flex-1 cursor-pointer font-medium text-slate-800">
                        Custom Hours
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:bg-slate-50 transition-colors">
                      <RadioGroupItem value="off" id="avail-off" />
                      <Label htmlFor="avail-off" className="flex-1 cursor-pointer">
                        <span className="font-medium text-slate-800">Full Day Off</span>
                        <span className="block text-xs text-slate-500 mt-0.5">Unavailable for appointments</span>
                      </Label>
                      <CalendarOff className="h-4 w-4 text-slate-400" />
                    </div>
                  </RadioGroup>
                </div>

                {modalAvailabilityType === "custom" && (
                  <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="space-y-2">
                      <Label htmlFor="modal-start" className="text-sm font-medium text-slate-700">Start Time</Label>
                      <input
                        id="modal-start"
                        type="time"
                        value={modalStartTime}
                        onChange={(e) => setModalStartTime(e.target.value)}
                        className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="modal-end" className="text-sm font-medium text-slate-700">End Time</Label>
                      <input
                        id="modal-end"
                        type="time"
                        value={modalEndTime}
                        onChange={(e) => setModalEndTime(e.target.value)}
                        className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                      />
                    </div>
                  </div>
                )}

                {conflictingAppointments.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-800">
                          {conflictingAppointments.length} appointment{conflictingAppointments.length !== 1 ? "s" : ""} fall outside selected hours
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Choose how to handle conflicting appointments before saving.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-amber-300 text-amber-800 hover:bg-amber-100"
                            onClick={handleReassignConflicting}
                          >
                            Reassign
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-amber-300 text-amber-800 hover:bg-amber-100"
                            onClick={handleCancelConflictingAppointments}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-amber-300 text-amber-800 hover:bg-amber-100"
                            onClick={() => setConflictingAppointments([])}
                          >
                            Keep Anyway
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="flex flex-row gap-2 sm:justify-between pt-6 border-t border-slate-200">
              <div className="flex gap-2">
                {hasOverride && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveOverride}
                    disabled={saving}
                    className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Remove Override
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeEditModal} disabled={saving} className="rounded-xl">
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleUpdateWorkingHours}
                  disabled={saving}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={blockTimeModalOpen || !!selectedBlock} onOpenChange={(open) => !open && closeBlockTimeModal()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{selectedBlock ? "Manage Block Time" : "Block Time"}</DialogTitle>
              <DialogDescription>
                {selectedBlock
                  ? "Edit or delete this blocked time. Blocked slots appear in red on the appointment calendar."
                  : "Add a time block (e.g. lunch break, personal time). Blocked slots will appear in red on the appointment calendar."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="block-title">Title</Label>
                <input
                  id="block-title"
                  type="text"
                  placeholder="Enter a title (e.g., Lunch Break, Personal Time)"
                  value={blockTitle}
                  onChange={(e) => setBlockTitle(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <Label>Staff</Label>
                {selectedBlock ? (
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-slate-600">
                    {typeof selectedBlock.staffId === "object" ? selectedBlock.staffId.name : blockStaffId}
                  </div>
                ) : (
                  <Select value={blockStaffId} onValueChange={setBlockStaffId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffOptionsForBlock.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="block-start-date">Start Date</Label>
                <input
                  id="block-start-date"
                  type="date"
                  value={blockStartDate}
                  onChange={(e) => setBlockStartDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="block-start-time">Start Time</Label>
                  <input
                    id="block-start-time"
                    type="time"
                    value={blockStartTime}
                    onChange={(e) => setBlockStartTime(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="block-end-time">End Time</Label>
                  <input
                    id="block-end-time"
                    type="time"
                    value={blockEndTime}
                    onChange={(e) => setBlockEndTime(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Recurring Frequency *</Label>
                <Select value={blockRecurring} onValueChange={setBlockRecurring}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Doesn&apos;t Repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {["daily", "weekly", "monthly"].includes(blockRecurring) && (
                <div className="space-y-2">
                  <Label htmlFor="block-end-date">End Date *</Label>
                  <input
                    id="block-end-date"
                    type="date"
                    value={blockEndDate}
                    onChange={(e) => setBlockEndDate(e.target.value)}
                    min={blockStartDate}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-slate-500">
                    {blockRecurring === "daily" && "Time will be blocked every day from start date until end date."}
                    {blockRecurring === "weekly" && "Time will be blocked on the same weekday each week until end date."}
                    {blockRecurring === "monthly" && "Time will be blocked on the same date each month until end date."}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="block-desc">Description</Label>
                <textarea
                  id="block-desc"
                  placeholder="Enter a description. Eg: Staff is on a lunch break"
                  value={blockDescription}
                  onChange={(e) => setBlockDescription(e.target.value)}
                  maxLength={200}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
                <div className="text-right text-xs text-slate-500">{blockDescription.length}/200</div>
              </div>
            </div>
            <DialogFooter className={selectedBlock ? "flex-row gap-2 sm:justify-between" : ""}>
              {selectedBlock ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteBlockTime}
                    disabled={updatingBlock}
                    className="mr-auto"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={closeBlockTimeModal} disabled={updatingBlock}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleUpdateBlockTime} disabled={updatingBlock}>
                      {updatingBlock ? "Updating…" : "Update"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={closeBlockTimeModal} disabled={creatingBlock}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleCreateBlockTime} disabled={creatingBlock}>
                    {creatingBlock ? "Creating…" : "Create"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  )
}

