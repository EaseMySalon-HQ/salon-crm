"use client"

import { useState, useEffect, forwardRef, useImperativeHandle, useMemo, Fragment } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { addDays, format, subDays } from "date-fns"
import { ChevronDown, Clock, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppointmentsAPI, StaffDirectoryAPI, BlockTimeAPI } from "@/lib/api"

interface Appointment {
  _id: string
  clientId: {
    _id: string
    name: string
    phone: string
    email?: string
  }
  serviceId: {
    _id: string
    name: string
    price: number
    duration: number
  }
  staffId: {
    _id: string
    name: string
    role?: string
  }
  staffAssignments?: Array<{ staffId: { _id: string; name: string }; role?: string }>
  date: string
  time: string
  duration: number
  status: "scheduled" | "confirmed" | "arrived" | "service_started" | "completed" | "cancelled"
  notes?: string
  price: number
  createdAt: string
}

interface StaffWorkDay {
  day: number
  enabled?: boolean
  startTime?: string
  endTime?: string
}

interface StaffMember {
  _id: string
  name: string
  role?: string
  workSchedule?: StaffWorkDay[]
  allowAppointmentScheduling?: boolean
}

interface BlockTime {
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

function blockAppliesOnDate(block: BlockTime, dateStr: string): boolean {
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

const SLOT_HEIGHT = 32
const SLOT_MINUTES = 15
const SLOTS_PER_HOUR = 4
const DEFAULT_START_HOUR = 9
const DEFAULT_END_HOUR = 21

function parseHHMMToMinutes(time?: string | null): number | null {
  if (!time) return null
  const parts = time.split(":")
  const h = parseInt(parts[0] || "0", 10)
  const m = parseInt(parts[1] || "0", 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function parseTimeToMinutes(time: string): number {
  if (!time) return 0
  const cleaned = time.replace(/\s*(am|pm)/i, "").trim()
  const parts = cleaned.split(":")
  const h = parseInt(parts[0] || "0", 10)
  const m = parseInt(parts[1] || "0", 10)
  const isPm = /pm/i.test(time) && h < 12
  const hour = isPm ? h + 12 : /am/i.test(time) && h === 12 ? 0 : h
  return hour * 60 + m
}

/** Format time for display so all timings align in a single column (e.g. "9:00AM", "11:30AM"). */
function formatAppointmentTime(time: string): string {
  if (!time) return ""
  const mins = parseTimeToMinutes(time)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return format(new Date(2000, 0, 1, h, m), "h:mma")
}

/** Format slot minutes for new-appointment URL (e.g. "9:00 AM", "9:15 AM") to match appointment form. */
function slotMinutesToTimeString(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return format(new Date(2000, 0, 1, h, m), "h:mm a")
}

function getPrimaryStaffId(apt: Appointment): string | null {
  const a = apt as any
  if (a.staffId?._id) return a.staffId._id
  if (typeof a.staffId === "string") return a.staffId
  if (a.staffAssignments?.length) {
    const primary = a.staffAssignments.find((s: any) => s.role === "primary")
    const first = a.staffAssignments[0]
    const assignment = primary || first
    return assignment?.staffId?._id ?? assignment?.staffId ?? null
  }
  return null
}

function getStatusColor(status: string): string {
  switch (status) {
    case "scheduled":
      return "bg-amber-500"
    case "arrived":
    case "confirmed":
      return "bg-blue-500"
    case "service_started":
      return "bg-purple-500"
    case "completed":
      return "bg-emerald-500"
    case "cancelled":
      return "bg-red-500"
    default:
      return "bg-gray-500"
  }
}

function getStatusCardFill(status: string): string {
  switch (status) {
    case "scheduled":
      return "bg-amber-100 border-amber-300 hover:bg-amber-200/80"
    case "arrived":
    case "confirmed":
      return "bg-blue-100 border-blue-300 hover:bg-blue-200/80"
    case "service_started":
      return "bg-purple-100 border-purple-300 hover:bg-purple-200/80"
    case "completed":
      return "bg-emerald-100 border-emerald-300 hover:bg-emerald-200/80"
    case "cancelled":
      return "bg-red-100 border-red-300 hover:bg-red-200/80"
    default:
      return "bg-slate-100 border-slate-300 hover:bg-slate-200/80"
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "scheduled":
      return "bg-amber-100 text-amber-700 border border-amber-200"
    case "arrived":
    case "confirmed":
      return "bg-blue-100 text-blue-700 border border-blue-200"
    case "service_started":
      return "bg-purple-100 text-purple-700 border border-purple-200"
    case "completed":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200"
    case "cancelled":
      return "bg-red-100 text-red-700 border border-red-200"
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200"
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case "scheduled":
      return "Scheduled"
    case "arrived":
    case "confirmed":
      return "Arrived"
    case "service_started":
      return "Service Started"
    case "completed":
      return "Completed"
    case "cancelled":
      return "Cancelled"
    default:
      return status
  }
}

interface AppointmentsCalendarGridProps {
  initialAppointmentId?: string
  onSwitchToList?: () => void
}

export const AppointmentsCalendarGrid = forwardRef<
  { showCancelledModal: () => void; showUpcomingModal: () => void },
  AppointmentsCalendarGridProps
>(({ initialAppointmentId, onSwitchToList }, ref) => {
  const router = useRouter()
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return format(d, "yyyy-MM-dd")
  })
  const [staffFilter, setStaffFilter] = useState<string | null>(null)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showCancelledModal, setShowCancelledModal] = useState(false)
  const [showUpcomingModal, setShowUpcomingModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [appointmentToCancel, setAppointmentToCancel] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showColorLegend, setShowColorLegend] = useState(false)
  const [blockTimes, setBlockTimes] = useState<BlockTime[]>([])
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(
    initialAppointmentId ?? null
  )

  useImperativeHandle(ref, () => ({
    showCancelledModal: () => setShowCancelledModal(true),
    showUpcomingModal: () => setShowUpcomingModal(true),
  }))

  useEffect(() => {
    setPendingAppointmentId(initialAppointmentId ?? null)
  }, [initialAppointmentId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [staffRes, aptRes] = await Promise.all([
          StaffDirectoryAPI.getAll(),
          AppointmentsAPI.getAll({ limit: 200 }),
        ])
        if (cancelled) return
        if (staffRes?.data?.length) setStaffList(staffRes.data)
        if (aptRes?.success && aptRes?.data) setAppointments(aptRes.data)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!pendingAppointmentId || appointments.length === 0) return
    const match = appointments.find((a) => a._id === pendingAppointmentId)
    if (!match) return
    setSelectedAppointment(match)
    setShowDetails(true)
    if (match.date) {
      const d = new Date(match.date)
      setSelectedDate(format(d, "yyyy-MM-dd"))
    }
    setPendingAppointmentId(null)
  }, [pendingAppointmentId, appointments])

  useEffect(() => {
    let cancelled = false
    if (!selectedDate) return
    const load = async () => {
      try {
        const res = await BlockTimeAPI.getAll({
          startDate: selectedDate,
          endDate: selectedDate,
          ...(staffFilter ? { staffId: staffFilter } : {}),
        })
        if (cancelled) return
        if (res?.success && Array.isArray(res?.data)) setBlockTimes(res.data)
        else setBlockTimes([])
      } catch (e) {
        if (!cancelled) setBlockTimes([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedDate, staffFilter])

  const dateNorm = (d: string) =>
    d && d.length >= 10 ? d.slice(0, 10) : d

  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      const norm = dateNorm(apt.date)
      if (norm !== selectedDate) return false
      if (apt.status === "cancelled") return false
      if (staffFilter) {
        const primaryId = getPrimaryStaffId(apt)
        return primaryId === staffFilter
      }
      return true
    })
  }, [appointments, selectedDate, staffFilter])

  // Only staff with appointment scheduling enabled appear in the calendar
  const staffWithScheduling = useMemo(
    () => staffList.filter((s) => s.allowAppointmentScheduling !== false),
    [staffList]
  )

  // Derive working hours window from staff work schedules for the selected date
  const selectedDayIndex = useMemo(() => {
    if (!selectedDate) return null
    const d = new Date(`${selectedDate}T00:00:00`)
    if (Number.isNaN(d.getTime())) return null
    return d.getDay() // 0 = Sunday, 6 = Saturday
  }, [selectedDate])

  const {
    startMinutes,
    endMinutes,
    staffWindowsById,
    totalSlots,
  } = useMemo(() => {
    const defaultStart = DEFAULT_START_HOUR * 60
    const defaultEnd = DEFAULT_END_HOUR * 60
    const windows: Record<
      string,
      {
        start: number
        end: number
        enabled: boolean
      }
    > = {}

    if (selectedDayIndex == null) {
      const span = Math.max(defaultEnd - defaultStart, SLOT_MINUTES)
      const slots = Math.ceil(span / SLOT_MINUTES)
      return {
        startMinutes: defaultStart,
        endMinutes: defaultEnd,
        staffWindowsById: windows,
        totalSlots: slots,
      }
    }

    let earliest: number | null = null
    let latest: number | null = null

    staffWithScheduling.forEach((staff) => {
      const schedule = (staff.workSchedule || []) as StaffWorkDay[]
      const dayRow = schedule.find((r) => r.day === selectedDayIndex)
      if (!dayRow) return

      // If the day is explicitly unchecked in Work Schedule, mark the staff as unavailable for this day
      if (dayRow.enabled === false) {
        windows[staff._id] = { start: defaultStart, end: defaultEnd, enabled: false }
        return
      }

      const sMin = parseHHMMToMinutes(dayRow.startTime) ?? defaultStart
      const eMin = parseHHMMToMinutes(dayRow.endTime) ?? defaultEnd
      if (eMin <= sMin) return

      windows[staff._id] = { start: sMin, end: eMin, enabled: true }
      if (earliest === null || sMin < earliest) earliest = sMin
      if (latest === null || eMin > latest) latest = eMin
    })

    const finalStart = earliest ?? defaultStart
    const finalEnd = latest ?? defaultEnd
    const span = Math.max(finalEnd - finalStart, SLOT_MINUTES)
    const slots = Math.ceil(span / SLOT_MINUTES)

    return {
      startMinutes: finalStart,
      endMinutes: finalEnd,
      staffWindowsById: windows,
      totalSlots: slots,
    }
  }, [staffWithScheduling, selectedDayIndex])

  const columns = useMemo(() => {
    if (staffFilter) {
      const s = staffWithScheduling.find((s) => s._id === staffFilter)
      return s ? [s] : []
    }
    return staffWithScheduling
  }, [staffWithScheduling, staffFilter])

  const timeSlots = useMemo(() => {
    const slots: { label: string; minutes: number; isHourStart: boolean }[] = []
    for (let minutes = startMinutes; minutes < endMinutes; minutes += SLOT_MINUTES) {
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      const isHourStart = m === 0
      const label = format(new Date(2000, 0, 1, h, m), "h:mma").toLowerCase()
      slots.push({ label, minutes, isHourStart })
    }
    return slots
  }, [startMinutes, endMinutes])

  const blocksByColumn = useMemo(() => {
    const map: Record<string, Array<{ apt: Appointment; top: number; height: number }>> = {}
    columns.forEach((col) => {
      map[col._id] = []
    })
    filteredAppointments.forEach((apt) => {
      const staffId = getPrimaryStaffId(apt)
      if (!staffId || !map[staffId]) return
      const startM = parseTimeToMinutes(apt.time)
      const duration = apt.duration ?? 60
      const top = ((startM - startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT
      const height = Math.max(SLOT_HEIGHT * 0.6, (duration / SLOT_MINUTES) * SLOT_HEIGHT)
      map[staffId].push({ apt, top, height })
    })
    columns.forEach((col) => {
      (map[col._id] || []).sort((a, b) => a.top - b.top)
    })
    return map
  }, [columns, filteredAppointments])

  const blockTimesByColumn = useMemo(() => {
    const map: Record<string, Array<{ block: BlockTime; top: number; height: number }>> = {}
    columns.forEach((col) => {
      map[col._id] = []
    })
    const dateNorm = selectedDate && selectedDate.length >= 10 ? selectedDate.slice(0, 10) : ""
    blockTimes.forEach((block) => {
      const staffId = typeof block.staffId === "object" && block.staffId?._id ? block.staffId._id : String(block.staffId)
      if (!dateNorm || !blockAppliesOnDate(block, dateNorm) || !map[staffId]) return
      const startM = parseTimeToMinutes(block.startTime)
      const endM = parseTimeToMinutes(block.endTime)
      if (endM <= startM) return
      if (startM >= endMinutes || endM <= startMinutes) return
      const top = ((Math.max(startM, startMinutes) - startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT
      const clipStart = Math.max(startM, startMinutes)
      const clipEnd = Math.min(endM, endMinutes)
      const durationMins = clipEnd - clipStart
      const height = (durationMins / SLOT_MINUTES) * SLOT_HEIGHT
      map[staffId].push({ block, top, height })
    })
    columns.forEach((col) => {
      (map[col._id] || []).sort((a, b) => a.top - b.top)
    })
    return map
  }, [columns, blockTimes, selectedDate, startMinutes, endMinutes])

  const dayChips = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const arr: Date[] = []
    for (let i = -1; i <= 3; i++) {
      arr.push(addDays(today, i))
    }
    return arr
  }, [])

  const getCancelledAppointments = () =>
    appointments
      .filter((a) => a.status === "cancelled")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50)

  const getUpcomingAppointments = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return appointments
      .filter((a) => {
        const aptDate = new Date(a.date)
        aptDate.setHours(0, 0, 0, 0)
        return aptDate >= today && a.status !== "cancelled"
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }

  const handleCancelClick = (id: string) => {
    setAppointmentToCancel(id)
    setShowCancelConfirm(true)
  }

  const confirmCancelAppointment = async () => {
    if (!appointmentToCancel) return
    setCancelling(true)
    try {
      const res = await AppointmentsAPI.update(appointmentToCancel, { status: "cancelled" })
      if (res?.success) {
        const list = appointments.map((a) =>
          a._id === appointmentToCancel ? { ...a, status: "cancelled" as const } : a
        )
        setAppointments(list)
        setShowDetails(false)
        setShowCancelConfirm(false)
        setAppointmentToCancel(null)
        alert("Appointment cancelled successfully")
      } else {
        alert("Failed to cancel appointment. Please try again.")
      }
    } catch (e) {
      console.error(e)
      alert("Failed to cancel appointment. Please try again.")
    } finally {
      setCancelling(false)
    }
  }

  const handleMarkStatus = async (newStatus: "arrived" | "service_started") => {
    if (!selectedAppointment) return
    setUpdatingStatus(true)
    try {
      const res = await AppointmentsAPI.update(selectedAppointment._id, { status: newStatus })
      if (res?.success) {
        const list = appointments.map((a) =>
          a._id === selectedAppointment._id ? { ...a, status: newStatus } : a
        )
        setAppointments(list)
        setSelectedAppointment({ ...selectedAppointment, status: newStatus })
        if (newStatus === "arrived") {
          // no alert; user may click "Service Started" next
        } else {
          // service_started
        }
      } else {
        alert("Failed to update status. Please try again.")
      }
    } catch (e) {
      console.error(e)
      alert("Failed to update status. Please try again.")
    } finally {
      setUpdatingStatus(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="sm" className="rounded-xl h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700">
          <Link href="/staff/working-hours?addBlock=1">
            <Clock className="h-4 w-4" />
            Block Time
          </Link>
        </Button>
        <Select
          value={staffFilter ?? "all"}
          onValueChange={(v) => setStaffFilter(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[160px] rounded-xl border-slate-200">
            <SelectValue placeholder="All Staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staffWithScheduling.map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 border border-slate-200 rounded-xl overflow-hidden bg-white">
          {dayChips.map((day) => {
            const dStr = format(day, "yyyy-MM-dd")
            const isToday = dStr === format(new Date(), "yyyy-MM-dd")
            const isSelected = dStr === selectedDate
            return (
              <button
                key={dStr}
                type="button"
                onClick={() => setSelectedDate(dStr)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  isSelected
                    ? "bg-indigo-600 text-white"
                    : isToday
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {format(day, "d")} {isToday ? "Today" : format(day, "EEE")}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-white">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm text-slate-700 bg-transparent border-0 focus:outline-none focus:ring-0"
          />
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-slate-200 gap-1.5"
            onClick={() => setShowColorLegend((v) => !v)}
          >
            <Square className="h-3.5 w-3.5 rounded bg-red-500" />
            Color Code
            <ChevronDown className="h-4 w-4" />
          </Button>
          {showColorLegend && (
            <>
              <div
                className="fixed inset-0 z-10"
                aria-hidden
                onClick={() => setShowColorLegend(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 rounded-xl border border-slate-200 bg-white p-3 shadow-lg min-w-[180px]">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Status
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-amber-500" />
                    Scheduled
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-blue-500" />
                    Arrived
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-purple-500" />
                    Service Started
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-emerald-500" />
                    Completed
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-red-500" />
                    Cancelled
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-red-500" />
                    Blocked time
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto relative">
          <div
            className="grid min-w-[600px]"
            style={{
              gridTemplateColumns: `80px repeat(${Math.max(1, columns.length)}, minmax(120px, 1fr))`,
              gridTemplateRows: `44px repeat(${totalSlots}, ${SLOT_HEIGHT}px)`,
            }}
          >
            <div className="border-b border-r border-slate-200 bg-white p-2.5 font-medium text-slate-600 text-xs uppercase tracking-wide text-left">
              Time
            </div>
            {columns.length === 0 ? (
              <div className="border-b border-r border-slate-200 bg-white p-2.5 font-semibold text-slate-500 text-center">
                No staff
              </div>
            ) : (
              columns.map((col) => (
                <div
                  key={col._id}
                  className="border-b border-r border-slate-200 bg-white p-2.5 font-semibold text-slate-700 text-center last:border-r-0"
                >
                  {col.name}
                </div>
              ))
            )}
            {timeSlots.map((slot) => {
              const isHourBoundary = (slot.minutes + SLOT_MINUTES) % 60 === 0
              const rowBorderClass = isHourBoundary
                ? "border-b border-slate-200"
                : "border-b border-slate-100 border-dotted"
              return (
                <Fragment key={`row-${slot.minutes}`}>
                  <div
                    className={`border-r border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 flex items-center text-left tabular-nums ${rowBorderClass}`}
                    style={{ height: SLOT_HEIGHT }}
                  >
                    {slot.isHourStart ? slot.label : ""}
                  </div>
                  {columns.length === 0 ? (
                    <button
                      key={`empty-${slot.minutes}`}
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams({
                          date: selectedDate,
                          time: slotMinutesToTimeString(slot.minutes),
                        })
                        router.push(`/appointments/new?${params.toString()}`)
                      }}
                      className={`w-full border-r border-slate-200 text-left ${rowBorderClass} hover:bg-indigo-50/80 transition-colors cursor-pointer`}
                      style={{ height: SLOT_HEIGHT, minHeight: SLOT_HEIGHT }}
                      title="New appointment"
                    />
                  ) : (
                    columns.map((col) => {
                      const windowForStaff = staffWindowsById[col._id]
                      const inWorkWindow =
                        !windowForStaff ||
                        (windowForStaff.enabled &&
                          slot.minutes >= windowForStaff.start &&
                          slot.minutes < windowForStaff.end)
                      const isBlockedByTime = (blockTimesByColumn[col._id] || []).some(
                        ({ block }) => {
                          const startM = parseTimeToMinutes(block.startTime)
                          const endM = parseTimeToMinutes(block.endTime)
                          return slot.minutes < endM && slot.minutes + SLOT_MINUTES > startM
                        }
                      )
                      const inWindow = inWorkWindow && !isBlockedByTime
                      return (
                      <button
                        key={`${col._id}-${slot.minutes}`}
                        type="button"
                        onClick={() => {
                          if (!inWindow) return
                          const params = new URLSearchParams({
                            date: selectedDate,
                            time: slotMinutesToTimeString(slot.minutes),
                            staffId: col._id,
                          })
                          router.push(`/appointments/new?${params.toString()}`)
                        }}
                        className={`w-full border-r border-slate-200 last:border-r-0 ${rowBorderClass} transition-colors ${
                          inWindow
                            ? "hover:bg-indigo-50/80 cursor-pointer bg-white"
                            : "bg-slate-50 text-slate-300 cursor-not-allowed"
                        }`}
                        style={{ height: SLOT_HEIGHT, minHeight: SLOT_HEIGHT }}
                        title={inWindow ? `New appointment with ${col.name}` : "Unavailable (blocked or outside working hours)"}
                      />
                      );
                    })
                  )}
                </Fragment>
              )
            })}
          </div>
          {columns.length > 0 && (
            <div
              className="absolute pointer-events-none top-[44px] left-[80px] right-0 bottom-0 min-w-[520px]"
              style={{ height: totalSlots * SLOT_HEIGHT }}
            >
              {columns.map((col, colIndex) => (
                <div
                  key={`blocks-${col._id}`}
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{
                    left: `calc(${colIndex * (100 / columns.length)}%)`,
                    width: `calc(${100 / columns.length}% - 2px)`,
                    marginLeft: colIndex === 0 ? 0 : 1,
                  }}
                >
                  {(blocksByColumn[col._id] || []).map(({ apt, top, height }) => {
                    const a = apt as any
                    const serviceName = a?.serviceId?.name || "Service"
                    const clientName = a?.clientId?.name || "Client"
                    const cardFill = getStatusCardFill(apt.status)
                    const darkStrip = getStatusColor(apt.status)
                    return (
                      <button
                        key={apt._id}
                        type="button"
                        onClick={() => {
                          setSelectedAppointment(apt)
                          setShowDetails(true)
                        }}
                        className={`absolute left-1 right-1 rounded-lg shadow-sm border overflow-hidden text-left ${cardFill} hover:ring-2 hover:ring-indigo-400 transition-all z-10 pointer-events-auto flex flex-col`}
                        style={{
                          top: top + 2,
                          height: Math.max(SLOT_HEIGHT * 0.6, height - 4),
                        }}
                      >
                        <div className={`h-1.5 shrink-0 rounded-t-lg ${darkStrip}`} aria-hidden />
                        <div className="p-1.5 text-xs overflow-hidden text-left flex-1 min-w-0">
                          <div className="font-medium text-slate-800 truncate">
                            {serviceName}
                          </div>
                          <div className="text-slate-600 truncate">{clientName}</div>
                          <div className="text-slate-500 text-[10px] tabular-nums">
                            {formatAppointmentTime(apt.time)}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  {(blockTimesByColumn[col._id] || []).map(({ block, top, height }) => (
                    <div
                      key={block._id}
                      className="absolute left-1 right-1 rounded-lg shadow-sm border overflow-hidden text-left bg-red-100 border-red-300 flex flex-col z-10 pointer-events-auto"
                      style={{
                        top: top + 2,
                        height: Math.max(SLOT_HEIGHT * 0.6, height - 4),
                      }}
                      title={block.title}
                    >
                      <div className="h-1.5 shrink-0 rounded-t-lg bg-red-500" aria-hidden />
                      <div className="p-1.5 text-xs overflow-hidden text-left flex-1 min-w-0">
                        <div className="font-medium text-red-800 truncate">
                          {block.title}
                        </div>
                        <div className="text-red-600 text-[10px] tabular-nums">
                          {format(new Date(2000, 0, 1, Math.floor(parseTimeToMinutes(block.startTime) / 60), parseTimeToMinutes(block.startTime) % 60), "h:mma").toLowerCase()}
                          – {format(new Date(2000, 0, 1, Math.floor(parseTimeToMinutes(block.endTime) / 60), parseTimeToMinutes(block.endTime) % 60), "h:mma").toLowerCase()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl">
          <DialogHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-2xl p-6 -m-6 mb-6">
            <DialogTitle className="text-xl font-bold">Appointment Details</DialogTitle>
            <DialogDescription className="text-indigo-100 mt-2">
              {selectedAppointment
                ? `${getStatusText(selectedAppointment.status)} • ${selectedAppointment.time} • ${selectedAppointment.date}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-3 text-sm">
              {(() => {
                const a = selectedAppointment as any
                const serviceName = a?.serviceId?.name || "Service"
                const clientName = a?.clientId?.name || "Client"
                const staffName = a?.staffId?.name || "Unassigned Staff"
                const staffRole = a?.staffId?.role
                const duration = a?.duration ?? 0
                const price = a?.price ?? 0
                return (
                  <>
                    <div className="font-medium">{serviceName}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-muted-foreground">Client</div>
                        <div>{clientName}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Staff</div>
                        <div>
                          {staffName}
                          {staffRole ? ` (${staffRole})` : ""}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Duration</div>
                        <div>{duration} min</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Price</div>
                        <div>₹{price}</div>
                      </div>
                    </div>
                    {a?.notes && (
                      <>
                        <Separator />
                        <div>
                          <div className="text-muted-foreground mb-1">Notes</div>
                          <div>{a.notes}</div>
                        </div>
                      </>
                    )}
                  </>
                )
              })()}
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                <Button
                  variant="destructive"
                  onClick={() => selectedAppointment && handleCancelClick(selectedAppointment._id)}
                  disabled={cancelling || selectedAppointment?.status === "cancelled"}
                  className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                >
                  {cancelling ? "Cancelling..." : "Cancel Appointment"}
                </Button>
                {/* Mark as Arrived / Service Started - show when status is scheduled, confirmed, or arrived */}
                {selectedAppointment &&
                (selectedAppointment.status === "scheduled" ||
                  selectedAppointment.status === "confirmed" ||
                  selectedAppointment.status === "arrived") ? (
                  selectedAppointment.status === "scheduled" ||
                  selectedAppointment.status === "confirmed" ? (
                    <Button
                      onClick={() => handleMarkStatus("arrived")}
                      disabled={updatingStatus}
                      className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                    >
                      {updatingStatus ? "Updating..." : "Mark as Arrived"}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleMarkStatus("service_started")}
                      disabled={updatingStatus}
                      className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                    >
                      {updatingStatus ? "Updating..." : "Service Started"}
                    </Button>
                  )
                ) : (
                  <span className="shrink-0" aria-hidden />
                )}
                <Button
                  onClick={() => {
                    if (!selectedAppointment) return
                    const a = selectedAppointment as any
                    const appointmentData = {
                      appointmentId: a._id,
                      clientId: a.clientId?._id || a.clientId,
                      clientName: a.clientId?.name || "",
                      serviceId: a.serviceId?._id || a.serviceId,
                      serviceName: a.serviceId?.name || "",
                      servicePrice: a.price || 0,
                      serviceDuration: a.duration || 0,
                      staffId: a.staffId?._id || a.staffId,
                      staffName: a.staffId?.name || "",
                    }
                    setShowDetails(false)
                    router.push(`/quick-sale?appointment=${btoa(JSON.stringify(appointmentData))}`)
                  }}
                  className="shrink-0"
                >
                  Raise Sale
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showUpcomingModal} onOpenChange={setShowUpcomingModal}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl max-w-6xl max-h-[80vh] overflow-hidden">
          <DialogHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-2xl p-6 -m-6 mb-6">
            <DialogTitle className="text-xl font-bold">Upcoming Appointments</DialogTitle>
            <DialogDescription className="text-indigo-100 mt-2">
              All future appointments (today onwards)
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {getUpcomingAppointments().length > 0 ? (
                getUpcomingAppointments().map((appointment) => {
                  const a = appointment as any
                  const serviceName = a?.serviceId?.name || "Service"
                  const clientName = a?.clientId?.name || "Client"
                  const clientInitial = clientName?.charAt?.(0) || "?"
                  const staffName = a?.staffId?.name || "Unassigned Staff"
                  const price = a?.price ?? 0
                  const duration = a?.duration ?? 0
                  return (
                    <Card
                      key={appointment._id}
                      className="bg-indigo-50/50 border-indigo-200 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl cursor-pointer"
                      onClick={() => {
                        setSelectedAppointment(appointment)
                        setShowDetails(true)
                        setShowUpcomingModal(false)
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <Badge className={`text-xs font-semibold ${getStatusBadgeClass(appointment.status)} border-0`}>
                            {getStatusText(appointment.status)}
                          </Badge>
                          <Badge variant="outline" className="text-indigo-700 border-indigo-300 bg-indigo-50">
                            {appointment.time}
                          </Badge>
                        </div>
                        <div className="space-y-3">
                          <div className="font-semibold text-slate-800 text-lg">{serviceName}</div>
                          <div className="flex items-center">
                            <Avatar className="h-8 w-8 mr-3 border border-indigo-200">
                              <AvatarFallback className="text-sm font-medium bg-indigo-100 text-indigo-700">
                                {clientInitial}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-slate-800">{clientName}</div>
                              <div className="text-sm text-indigo-600">{staffName}</div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-600 bg-indigo-100 rounded-lg px-3 py-1">
                              ₹{price} • {duration}min
                            </div>
                            <div className="text-sm text-slate-500">
                              {format(new Date(appointment.date), "MMM dd, yyyy")}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              ) : (
                <div className="col-span-full text-center py-12">
                  <div className="text-6xl mb-4">📅</div>
                  <div className="text-xl font-semibold text-slate-600 mb-2">No Upcoming Appointments</div>
                  <div className="text-slate-500">You don&apos;t have any future appointments scheduled.</div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelledModal} onOpenChange={setShowCancelledModal}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl max-w-6xl max-h-[80vh] overflow-hidden">
          <DialogHeader className="bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-t-2xl p-6 -m-6 mb-6">
            <DialogTitle className="text-xl font-bold">Cancelled Appointments</DialogTitle>
            <DialogDescription className="text-red-100 mt-2">
              View all cancelled appointments
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {getCancelledAppointments().length > 0 ? (
                getCancelledAppointments().map((appointment) => {
                  const a = appointment as any
                  const serviceName = a?.serviceId?.name || "Service"
                  const clientName = a?.clientId?.name || "Client"
                  const clientInitial = clientName?.charAt?.(0) || "?"
                  const staffName = a?.staffId?.name || "Unassigned Staff"
                  const price = a?.price ?? 0
                  const duration = a?.duration ?? 0
                  return (
                    <Card
                      key={appointment._id}
                      className="bg-gradient-to-br from-red-50 to-orange-50 border-red-200 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl cursor-pointer"
                      onClick={() => {
                        setSelectedAppointment(appointment)
                        setShowDetails(true)
                        setShowCancelledModal(false)
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <Badge className="bg-red-100 text-red-700 border-red-200 font-medium">
                            {appointment.time}
                          </Badge>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-red-500 shadow-sm" />
                            <span className="text-xs font-medium text-red-600">Cancelled</span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="font-semibold text-slate-800 text-lg line-through opacity-75">
                            {serviceName}
                          </div>
                          <div className="flex items-center">
                            <Avatar className="h-8 w-8 mr-3 border border-red-200">
                              <AvatarFallback className="text-sm font-medium bg-red-100 text-red-700">
                                {clientInitial}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-slate-800">{clientName}</div>
                              <div className="text-sm text-slate-500">{staffName}</div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-600 bg-red-100 rounded-lg px-3 py-1">
                              ₹{price} • {duration}min
                            </div>
                            <div className="text-sm text-slate-500">
                              {format(new Date(appointment.date), "MMM dd, yyyy")}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              ) : (
                <div className="col-span-full text-center py-12">
                  <div className="text-6xl mb-4">❌</div>
                  <div className="text-xl font-semibold text-slate-600 mb-2">
                    No Cancelled Appointments
                  </div>
                  <div className="text-slate-500">You don&apos;t have any cancelled appointments.</div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl max-w-md">
          <DialogHeader className="text-center pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">Cancel Appointment</DialogTitle>
            <DialogDescription className="text-slate-600 mt-2">
              Are you sure you want to cancel this appointment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowCancelConfirm(false)
                setAppointmentToCancel(null)
              }}
              disabled={cancelling}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancelAppointment}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelling ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Cancelling...
                </>
              ) : (
                "Yes, Cancel Appointment"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})

AppointmentsCalendarGrid.displayName = "AppointmentsCalendarGrid"
