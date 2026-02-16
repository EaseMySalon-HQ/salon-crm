"use client"

import { useState, useEffect, forwardRef, useImperativeHandle, useMemo, Fragment, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { addDays, format, subDays } from "date-fns"
import { ChevronDown, Clock, Square, Pencil } from "lucide-react"

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
import { AppointmentsAPI, StaffDirectoryAPI, BlockTimeAPI, SalesAPI } from "@/lib/api"

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
  createdBy?: string
  leadSource?: string
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

function getPrimaryStaffName(apt: Appointment): string {
  const a = apt as any
  if (a.staffId?.name) return a.staffId.name
  if (a.staffAssignments?.length) {
    const primary = a.staffAssignments.find((s: any) => s.role === "primary")
    const first = a.staffAssignments[0]
    const assignment = primary || first
    const staff = assignment?.staffId
    return staff?.name ?? (typeof staff === "string" ? staff : "Unassigned Staff")
  }
  return "Unassigned Staff"
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
  const [walkInSales, setWalkInSales] = useState<any[]>([])
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(
    initialAppointmentId ?? null
  )
  const [linkedSale, setLinkedSale] = useState<any | null>(null)
  const [draggingApt, setDraggingApt] = useState<{
    id: string
    startX: number
    startY: number
    startTimeMinutes: number
    duration: number
    mode: "move" | "resize-top" | "resize-bottom"
    sourceStaffId: string
  } | null>(null)
  const [updatingTimeForId, setUpdatingTimeForId] = useState<string | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const [dragOffsetX, setDragOffsetX] = useState(0)
  const blocksContainerRef = useRef<HTMLDivElement | null>(null)
  const justDraggedRef = useRef(false)
  const [showTimeChangeConfirm, setShowTimeChangeConfirm] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [pendingTimeChange, setPendingTimeChange] = useState<{
    id: string
    mode: "move" | "resize-top" | "resize-bottom" | "staff"
    oldTime?: string
    newTime?: string
    oldDuration?: number
    newDuration?: number
    oldStaffId?: string
    newStaffId?: string
    oldStaffName?: string
    newStaffName?: string
  } | null>(null)

  // Update current time every minute for the red "now" line
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!selectedAppointment?._id) {
      setLinkedSale(null)
      return
    }
    let cancelled = false
    SalesAPI.getByAppointmentId(selectedAppointment._id)
      .then((res) => {
        if (!cancelled && res?.success) setLinkedSale(res.data ?? null)
      })
      .catch(() => {
        if (!cancelled) setLinkedSale(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedAppointment?._id])

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

  useEffect(() => {
    let cancelled = false
    if (!selectedDate) return
    const load = async () => {
      try {
        const res = await SalesAPI.getAll({
          dateFrom: selectedDate,
          dateTo: selectedDate,
        })
        if (cancelled) return
        if (res?.success && Array.isArray(res?.data)) {
          const sales = res.data
          const walkIns = sales.filter(
            (s: any) =>
              !s.appointmentId &&
              s.items?.some((i: any) => i.type === "service")
          )
          setWalkInSales(walkIns)
        } else {
          setWalkInSales([])
        }
      } catch (e) {
        if (!cancelled) setWalkInSales([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedDate])

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

  const WALK_IN_SALE_DURATION = 30

  const salesByColumn = useMemo(() => {
    const map: Record<string, Array<{ sale: any; serviceItem: any; top: number; height: number; startM: number; endM: number }>> = {}
    columns.forEach((col) => {
      map[col._id] = []
    })
    walkInSales.forEach((sale) => {
      const serviceItems = (sale.items || []).filter((i: any) => i.type === "service")
      if (serviceItems.length === 0) return
      const checkoutEndM = parseTimeToMinutes(sale.time || "9:00")
      const duration = WALK_IN_SALE_DURATION
      const slotDuration = Math.ceil(duration / SLOT_MINUTES) * SLOT_MINUTES
      const staffOffsets: Record<string, number> = {}
      serviceItems.forEach((item: any) => {
        const staffId =
          item.staffId ||
          item.staffContributions?.[0]?.staffId ||
          sale.staffId
        if (!staffId || !map[staffId]) return
        const endM = checkoutEndM
        const startM = endM - slotDuration
        if (startM < startMinutes || endM > endMinutes) return
        const baseTop = ((startM - startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT
        const offset = (staffOffsets[staffId] || 0) * 8
        staffOffsets[staffId] = (staffOffsets[staffId] || 0) + 1
        const top = baseTop + offset
        const height = Math.max(SLOT_HEIGHT * 0.6, (duration / SLOT_MINUTES) * SLOT_HEIGHT)
        map[staffId].push({ sale, serviceItem: item, top, height, startM, endM })
      })
    })
    columns.forEach((col) => {
      (map[col._id] || []).sort((a, b) => a.top - b.top)
    })
    return map
  }, [columns, walkInSales, startMinutes, endMinutes])

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

  const handleTimeDragStart = (e: React.MouseEvent, apt: Appointment) => {
    if (apt.status === "cancelled" || apt.status === "completed") return
    e.preventDefault()
    e.stopPropagation()
    setDragOffsetY(0)
    setDragOffsetX(0)
    const sourceStaffId = getPrimaryStaffId(apt) ?? ""
    setDraggingApt({
      id: apt._id,
      startX: e.clientX,
      startY: e.clientY,
      startTimeMinutes: parseTimeToMinutes(apt.time),
      duration: apt.duration ?? 60,
      mode: "move",
      sourceStaffId,
    })
  }

  const handleResizeStart = (e: React.MouseEvent, apt: Appointment, mode: "resize-top" | "resize-bottom") => {
    if (apt.status === "cancelled" || apt.status === "completed") return
    e.preventDefault()
    e.stopPropagation()
    setDragOffsetY(0)
    setDragOffsetX(0)
    const sourceStaffId = getPrimaryStaffId(apt) ?? ""
    setDraggingApt({
      id: apt._id,
      startX: e.clientX,
      startY: e.clientY,
      startTimeMinutes: parseTimeToMinutes(apt.time),
      duration: apt.duration ?? 60,
      mode,
      sourceStaffId,
    })
  }

  useEffect(() => {
    if (!draggingApt) return
    const onMouseMove = (e: MouseEvent) => {
      if (showTimeChangeConfirm) return
      justDraggedRef.current = true
      setDragOffsetY(e.clientY - draggingApt.startY)
      if (draggingApt.mode === "move" || draggingApt.mode === "resize-top") {
        setDragOffsetX(e.clientX - draggingApt.startX)
      }
    }
    const onMouseUp = async (e: MouseEvent) => {
      if (showTimeChangeConfirm) return
      const current = draggingApt
      if (!current) return
      const deltaY = e.clientY - current.startY
      const slotDelta = Math.round(deltaY / SLOT_HEIGHT)
      const minutesDelta = slotDelta * SLOT_MINUTES

      const getTargetColumnIndex = (): number | null => {
        const el = blocksContainerRef.current
        if (!el || columns.length === 0) return null
        const rect = el.getBoundingClientRect()
        const clientX = e.clientX
        if (clientX < rect.left || clientX > rect.right) return null
        const colWidth = rect.width / columns.length
        const index = Math.floor((clientX - rect.left) / colWidth)
        return index >= 0 && index < columns.length ? index : null
      }

      if (current.mode === "move") {
        const targetColIndex = getTargetColumnIndex()
        const targetStaffId = targetColIndex != null && columns[targetColIndex] ? columns[targetColIndex]._id : null
        const isStaffChange = columns.length > 1 && targetStaffId && targetStaffId !== current.sourceStaffId

        if (isStaffChange) {
          let newMinutes = current.startTimeMinutes + minutesDelta
          const endMinutesBound = endMinutes - current.duration
          newMinutes = Math.max(startMinutes, Math.min(endMinutesBound, newMinutes))
          newMinutes = Math.floor(newMinutes / SLOT_MINUTES) * SLOT_MINUTES
          const newTime = slotMinutesToTimeString(newMinutes)
          const oldTime = slotMinutesToTimeString(current.startTimeMinutes)
          const oldStaff = columns.find((c) => c._id === current.sourceStaffId)
          const newStaff = columns.find((c) => c._id === targetStaffId)
          setPendingTimeChange({
            id: current.id,
            mode: "staff",
            oldStaffId: current.sourceStaffId,
            newStaffId: targetStaffId,
            oldStaffName: oldStaff?.name ?? "Unknown",
            newStaffName: newStaff?.name ?? "Unknown",
            oldTime,
            newTime,
          })
          setShowTimeChangeConfirm(true)
        } else {
          let newMinutes = current.startTimeMinutes + minutesDelta
          const endMinutesBound = endMinutes - current.duration
          newMinutes = Math.max(startMinutes, Math.min(endMinutesBound, newMinutes))
          newMinutes = Math.floor(newMinutes / SLOT_MINUTES) * SLOT_MINUTES
          if (newMinutes === current.startTimeMinutes) {
            setDraggingApt(null)
            setDragOffsetY(0)
            setDragOffsetX(0)
            return
          }
          const newTime = slotMinutesToTimeString(newMinutes)
          const oldTime = slotMinutesToTimeString(current.startTimeMinutes)
          setPendingTimeChange({ id: current.id, mode: "move", oldTime, newTime })
          setShowTimeChangeConfirm(true)
        }
      } else if (current.mode === "resize-top") {
        const targetColIndex = getTargetColumnIndex()
        const targetStaffId = targetColIndex != null && columns[targetColIndex] ? columns[targetColIndex]._id : null
        const isStaffChange = columns.length > 1 && targetStaffId && targetStaffId !== current.sourceStaffId

        if (isStaffChange) {
          let newStartMinutes = current.startTimeMinutes + minutesDelta
          const endMinutesBound = endMinutes - current.duration
          newStartMinutes = Math.max(startMinutes, Math.min(endMinutesBound, newStartMinutes))
          newStartMinutes = Math.floor(newStartMinutes / SLOT_MINUTES) * SLOT_MINUTES
          const newTime = slotMinutesToTimeString(newStartMinutes)
          const oldTime = slotMinutesToTimeString(current.startTimeMinutes)
          const oldStaff = columns.find((c) => c._id === current.sourceStaffId)
          const newStaff = columns.find((c) => c._id === targetStaffId)
          setPendingTimeChange({
            id: current.id,
            mode: "staff",
            oldStaffId: current.sourceStaffId,
            newStaffId: targetStaffId,
            oldStaffName: oldStaff?.name ?? "Unknown",
            newStaffName: newStaff?.name ?? "Unknown",
            oldTime,
            newTime,
          })
          setShowTimeChangeConfirm(true)
        } else {
          let newStartMinutes = current.startTimeMinutes + minutesDelta
          const endMinutesBound = endMinutes - current.duration
          newStartMinutes = Math.max(startMinutes, Math.min(endMinutesBound, newStartMinutes))
          newStartMinutes = Math.floor(newStartMinutes / SLOT_MINUTES) * SLOT_MINUTES
          if (newStartMinutes === current.startTimeMinutes) {
            setDraggingApt(null)
            setDragOffsetY(0)
            setDragOffsetX(0)
            return
          }
          const newTime = slotMinutesToTimeString(newStartMinutes)
          const oldTime = slotMinutesToTimeString(current.startTimeMinutes)
          setPendingTimeChange({ id: current.id, mode: "resize-top", oldTime, newTime })
          setShowTimeChangeConfirm(true)
        }
      } else if (current.mode === "resize-bottom") {
        const minDuration = SLOT_MINUTES
        const maxEndMinutes = endMinutes - current.startTimeMinutes
        let newDuration = current.duration + minutesDelta
        newDuration = Math.max(minDuration, Math.min(maxEndMinutes, newDuration))
        newDuration = Math.floor(newDuration / SLOT_MINUTES) * SLOT_MINUTES
        if (newDuration === current.duration) {
          setDraggingApt(null)
          setDragOffsetY(0)
          setDragOffsetX(0)
          return
        }
        const oldTime = slotMinutesToTimeString(current.startTimeMinutes)
        setPendingTimeChange({
          id: current.id,
          mode: "resize-bottom",
          oldTime,
          oldDuration: current.duration,
          newDuration,
        })
        setShowTimeChangeConfirm(true)
      }
    }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [draggingApt, startMinutes, endMinutes, showTimeChangeConfirm, columns])

  const confirmTimeChange = async () => {
    const pending = pendingTimeChange
    if (!pending) return
    setUpdatingTimeForId(pending.id)
    try {
      let res: { success?: boolean; error?: string } | null = null
      if (pending.mode === "staff") {
        if (!pending.newStaffId) return
        const updatePayload: { staffId: string; staffAssignments: any[]; time?: string } = {
          staffId: pending.newStaffId,
          staffAssignments: [{ staffId: pending.newStaffId, percentage: 100, role: "primary" }],
        }
        if (pending.newTime) updatePayload.time = pending.newTime
        res = await AppointmentsAPI.update(pending.id, updatePayload)
        if (res?.success) {
          const newStaff = columns.find((c) => c._id === pending.newStaffId)
          setAppointments((prev) =>
            prev.map((a) => {
              if (a._id !== pending.id) return a
              const aAny = a as any
              const updated: any = {
                ...a,
                staffId: newStaff ? { _id: newStaff._id, name: newStaff.name, role: newStaff.role } : aAny.staffId,
                staffAssignments: [{ staffId: { _id: pending.newStaffId!, name: newStaff?.name ?? "Staff" }, role: "primary" }],
              }
              if (pending.newTime) updated.time = pending.newTime
              return updated
            })
          )
        } else {
          alert("Failed to reassign staff.")
          return
        }
      } else if (pending.mode === "move" || pending.mode === "resize-top") {
        if (!pending.newTime) return
        res = await AppointmentsAPI.update(pending.id, { time: pending.newTime })
        if (res?.success) {
          setAppointments((prev) =>
            prev.map((a) =>
              a._id === pending.id ? { ...a, time: pending.newTime! } : a
            )
          )
        } else {
          alert("Failed to update appointment time.")
          return
        }
      } else if (pending.mode === "resize-bottom") {
        if (pending.newDuration == null) return
        res = await AppointmentsAPI.update(pending.id, { duration: pending.newDuration })
        if (res?.success) {
          setAppointments((prev) =>
            prev.map((a) =>
              a._id === pending.id ? { ...a, duration: pending.newDuration! } : a
            )
          )
        } else {
          alert("Failed to update appointment duration.")
          return
        }
      }
      setDraggingApt(null)
      setDragOffsetY(0)
      setDragOffsetX(0)
      setPendingTimeChange(null)
      setShowTimeChangeConfirm(false)
    } catch (err) {
      console.error(err)
      alert("Failed to update appointment.")
    } finally {
      setUpdatingTimeForId(null)
    }
  }

  const cancelTimeChange = () => {
    setDraggingApt(null)
    setDragOffsetY(0)
    setDragOffsetX(0)
    setPendingTimeChange(null)
    setShowTimeChangeConfirm(false)
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

      <div className="border border-slate-200 rounded-xl overflow-clip bg-white">
        <div className="overflow-auto max-h-[calc(100vh-320px)] min-h-[400px]">
          <div
            className="grid min-w-[600px] relative"
            style={{
              gridTemplateColumns: `80px repeat(${Math.max(1, columns.length)}, minmax(120px, 1fr))`,
              gridTemplateRows: `44px repeat(${totalSlots}, ${SLOT_HEIGHT}px)`,
            }}
          >
            <div className="sticky top-0 z-20 border-b border-r border-slate-200 bg-white p-2.5 font-medium text-slate-600 text-xs uppercase tracking-wide text-left shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]">
              Time
            </div>
            {columns.length === 0 ? (
              <div className="sticky top-0 z-20 border-b border-r border-slate-200 bg-white p-2.5 font-semibold text-slate-500 text-center shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]">
                No staff
              </div>
            ) : (
              columns.map((col) => (
                <div
                  key={col._id}
                  className="sticky top-0 z-20 border-b border-r border-slate-200 bg-white p-2.5 font-semibold text-slate-700 text-center last:border-r-0 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]"
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
              const now = new Date()
              const todayStr = format(now, "yyyy-MM-dd")
              const isToday = selectedDate === todayStr
              const isPastDate = selectedDate < todayStr
              const currentMinutes = now.getHours() * 60 + now.getMinutes()
              const isPastSlot = isPastDate || (isToday && slot.minutes < currentMinutes)
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
                        if (isPastSlot) return
                        const params = new URLSearchParams({
                          date: selectedDate,
                          time: slotMinutesToTimeString(slot.minutes),
                        })
                        router.push(`/appointments/new?${params.toString()}`)
                      }}
                      className={`w-full border-r border-slate-200 text-left ${rowBorderClass} transition-colors ${
                        isPastSlot
                          ? "bg-slate-50 text-slate-300 cursor-not-allowed"
                          : "hover:bg-indigo-50/80 cursor-pointer"
                      }`}
                      style={{ height: SLOT_HEIGHT, minHeight: SLOT_HEIGHT }}
                      title={isPastSlot ? "Past slot – unavailable" : "New appointment"}
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
                      const inWindow = inWorkWindow && !isBlockedByTime && !isPastSlot
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
                        title={inWindow ? `New appointment with ${col.name}` : isPastSlot ? "Past slot – unavailable" : "Unavailable (blocked or outside working hours)"}
                      />
                      );
                    })
                  )}
                </Fragment>
              )
            })}
            {columns.length > 0 && (
              <div
                ref={blocksContainerRef}
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
                    const isDragging = draggingApt?.id === apt._id
                    const isUpdating = updatingTimeForId === apt._id
                    const canDrag = apt.status !== "cancelled" && apt.status !== "completed"
                    const baseHeight = Math.max(SLOT_HEIGHT * 0.6, height - 4)
                    const resizeBottomHeight =
                      isDragging && draggingApt?.mode === "resize-bottom"
                        ? Math.max(SLOT_HEIGHT * 0.6, baseHeight + dragOffsetY)
                        : baseHeight
                    const showTranslate =
                      isDragging &&
                      (draggingApt?.mode === "move" || draggingApt?.mode === "resize-top")
                    const transformParts: string[] = []
                    if (showTranslate) {
                      if ((draggingApt?.mode === "move" || draggingApt?.mode === "resize-top") && dragOffsetX !== 0) {
                        transformParts.push(`translateX(${dragOffsetX}px)`)
                      }
                      transformParts.push(`translateY(${dragOffsetY}px)`)
                    }
                    return (
                      <div
                        key={apt._id}
                        className={`absolute left-1 right-1 rounded-lg shadow-sm border overflow-hidden text-left ${cardFill} hover:ring-2 hover:ring-indigo-400 z-10 pointer-events-auto flex flex-col select-none ${
                          isDragging ? "ring-2 ring-indigo-500 shadow-lg transition-none" : "transition-all"
                        } ${isUpdating ? "opacity-70" : ""}`}
                        style={{
                          top: top + 2,
                          height: resizeBottomHeight,
                          transform: transformParts.length > 0 ? transformParts.join(" ") : undefined,
                        }}
                      >
                        <div
                          className={`absolute top-0 left-0 right-0 z-20 h-[16px] rounded-t-lg flex flex-col items-center justify-center gap-0.5 ${darkStrip} ${canDrag ? "!cursor-grab active:!cursor-grabbing hover:opacity-90" : ""}`}
                          aria-hidden
                          onMouseDown={(e) => {
                            if (canDrag) handleResizeStart(e, apt, "resize-top")
                          }}
                          title={canDrag ? "Drag to change start time or reassign staff" : undefined}
                        >
                          {canDrag && (
                            <>
                              <div className="pointer-events-none w-8 h-0.5 rounded-full bg-white/50" aria-hidden />
                              <div className="pointer-events-none w-8 h-0.5 rounded-full bg-white/50" aria-hidden />
                            </>
                          )}
                        </div>
                        <div
                          className={`pt-4 px-1.5 pb-1.5 text-xs overflow-hidden text-left flex-1 min-w-0 ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                          onMouseDown={(e) => {
                            if (canDrag) handleTimeDragStart(e, apt)
                          }}
                          onClick={() => {
                            if (justDraggedRef.current) {
                              justDraggedRef.current = false
                              return
                            }
                            setSelectedAppointment(apt)
                            setShowDetails(true)
                          }}
                          title={canDrag ? "Drag to move time or reassign staff • Click to view details" : "Click to view details"}
                        >
                          <div className="font-bold text-slate-800 truncate">
                            {clientName}
                          </div>
                          <div className="text-slate-600 text-[11px] truncate">
                            ({serviceName} – {apt.duration ?? 60} min)
                          </div>
                          <div className="text-slate-500 text-[10px] tabular-nums truncate">
                            {formatAppointmentTime(apt.time)} – {formatAppointmentTime(slotMinutesToTimeString(parseTimeToMinutes(apt.time) + (apt.duration ?? 60)))}
                          </div>
                          {apt.notes && (
                            <div className="text-slate-500 text-[10px] truncate mt-0.5 italic">
                              {apt.notes}
                            </div>
                          )}
                        </div>
                        <div
                          className={`h-[16px] min-h-[16px] shrink-0 rounded-b-lg flex items-center justify-center bg-slate-200/50 ${canDrag ? "hover:bg-slate-300/50 cursor-n-resize" : ""}`}
                          aria-hidden
                          onMouseDown={(e) => {
                            if (canDrag) handleResizeStart(e, apt, "resize-bottom")
                          }}
                          title={canDrag ? "Drag to change duration" : undefined}
                        >
                          {canDrag && (
                            <div className="w-8 h-0.5 rounded-full bg-slate-500/60" aria-hidden />
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {(salesByColumn[col._id] || []).map(({ sale, serviceItem, top, height, startM, endM }) => {
                    return (
                      <div
                        key={`${sale._id}-${serviceItem?.name || ""}-${startM}`}
                        className="absolute left-1 right-1 rounded-lg shadow-sm border overflow-hidden text-left bg-teal-50 border-teal-300 flex flex-col z-10 pointer-events-auto cursor-pointer hover:ring-2 hover:ring-teal-400 transition-all"
                        style={{
                          top: top + 2,
                          height: Math.max(SLOT_HEIGHT * 0.6, height - 4),
                        }}
                        onClick={() => router.push(`/billing/${sale.billNo}?mode=edit`)}
                        title={`Bill #${sale.billNo} • Click to view`}
                      >
                        <div className="h-1.5 shrink-0 rounded-t-lg bg-teal-500" aria-hidden />
                        <div className="pt-3 px-1.5 pb-1.5 text-xs overflow-hidden text-left flex-1 min-w-0">
                          <div className="font-bold text-slate-800 truncate">
                            {sale.customerName}
                          </div>
                          <div className="text-slate-600 text-[11px] truncate">
                            ({serviceItem?.name || "Service"})
                          </div>
                          <div className="text-slate-500 text-[10px] tabular-nums truncate">
                            {formatAppointmentTime(slotMinutesToTimeString(startM))} – {formatAppointmentTime(slotMinutesToTimeString(endM))}
                          </div>
                          <div className="text-teal-700 text-[10px] font-medium truncate mt-0.5">
                            Bill #{sale.billNo}
                          </div>
                        </div>
                      </div>
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
            {/* Current time indicator - red line across calendar (only when viewing today) */}
            {(() => {
              const todayStr = format(new Date(), "yyyy-MM-dd")
              const isTodayView = selectedDate === todayStr
              const currentMinutes =
                currentTime.getHours() * 60 +
                currentTime.getMinutes() +
                currentTime.getSeconds() / 60
              const showLine =
                isTodayView &&
                currentMinutes >= startMinutes &&
                currentMinutes < endMinutes
              if (!showLine) return null
              const topPx =
                44 +
                ((currentMinutes - startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT
              return (
                <div
                  className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                  style={{ top: topPx }}
                  aria-hidden
                >
                  <div className="flex-shrink-0 w-[80px] flex items-center justify-end pr-1">
                    <span className="bg-red-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded tabular-nums">
                      {format(currentTime, "h:mm a")}
                    </span>
                  </div>
                  <div className="flex-1 h-0.5 bg-red-600 min-w-0" />
                </div>
              )
            })()}
          </div>
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
            <div className="space-y-4 text-sm">
              {(() => {
                const a = selectedAppointment as any
                const serviceName = a?.serviceId?.name || "Service"
                const clientName = a?.clientId?.name || "Client"
                const staffName = getPrimaryStaffName(selectedAppointment)
                const duration = a?.duration ?? 0
                const price = a?.price ?? 0
                const timeFrom = a?.time || ""
                const timeTo = timeFrom ? slotMinutesToTimeString(parseTimeToMinutes(timeFrom) + duration) : ""
                const paymentStatus = linkedSale?.paymentStatus
                  ? (linkedSale.paymentStatus.remainingAmount <= 0 ? "Paid" : linkedSale.paymentStatus.paidAmount > 0 ? "Partial" : "Unpaid")
                  : "—"
                const createdDate = a?.createdAt ? format(new Date(a.createdAt), "dd MMM yyyy, h:mm a") : "—"
                const createdBy = a?.createdBy || "—"
                const leadSource = a?.leadSource || "—"
                const bookingNote = a?.notes || "—"
                return (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xl font-semibold text-slate-900">{clientName}</div>
                      {selectedAppointment &&
                      (selectedAppointment.status === "scheduled" ||
                        selectedAppointment.status === "confirmed" ||
                        selectedAppointment.status === "arrived") ? (
                        selectedAppointment.status === "scheduled" ||
                        selectedAppointment.status === "confirmed" ? (
                          <Button
                            onClick={() => handleMarkStatus("arrived")}
                            disabled={updatingStatus}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                          >
                            {updatingStatus ? "Updating..." : "Mark as Arrived"}
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleMarkStatus("service_started")}
                            disabled={updatingStatus}
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                          >
                            {updatingStatus ? "Updating..." : "Service Started"}
                          </Button>
                        )
                      ) : (
                        <span className="shrink-0" aria-hidden />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <div className="text-muted-foreground text-xs">Service Name</div>
                        <div className="font-medium">{serviceName}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Service Price</div>
                        <div>₹{price}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Time (From – To)</div>
                        <div>{timeFrom && timeTo ? `${timeFrom} – ${timeTo}` : timeFrom || "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Service Duration</div>
                        <div>{duration} min</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Stylist Name</div>
                        <div>{staffName}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Payment Status</div>
                        <div>{paymentStatus}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Lead Source</div>
                        <div>{leadSource}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Created Date</div>
                        <div>{createdDate}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Created By</div>
                        <div>{createdBy}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs mb-1">Booking Note</div>
                      <div className="text-slate-700">{bookingNote}</div>
                    </div>
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
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    asChild
                  >
                    <Link
                      href={selectedAppointment ? `/appointments/new?edit=${selectedAppointment._id}` : "#"}
                      onClick={() => setShowDetails(false)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Link>
                  </Button>
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
                  >
                    Raise Sale
                  </Button>
                </div>
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

      <Dialog open={showTimeChangeConfirm} onOpenChange={(open) => !open && cancelTimeChange()}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl max-w-md">
          <DialogHeader className="text-center pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
              <Clock className="h-6 w-6 text-indigo-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">
              {pendingTimeChange?.mode === "staff" ? "Confirm Staff Change" : "Confirm Time Change"}
            </DialogTitle>
            <DialogDescription className="text-slate-600 mt-2">
              {pendingTimeChange?.mode === "staff" ? (
                <>
                  Reassign appointment from <strong>{pendingTimeChange.oldStaffName}</strong> to{" "}
                  <strong>{pendingTimeChange.newStaffName}</strong>
                  {pendingTimeChange.newTime && pendingTimeChange.oldTime !== pendingTimeChange.newTime ? (
                    <> and change time from <strong>{formatAppointmentTime(pendingTimeChange.oldTime ?? "")}</strong> to{" "}
                    <strong>{formatAppointmentTime(pendingTimeChange.newTime)}</strong></>
                  ) : null}
                  ?
                </>
              ) : pendingTimeChange?.mode === "resize-bottom" ? (
                <>
                  Change duration from <strong>{pendingTimeChange.oldDuration} min</strong> to{" "}
                  <strong>{pendingTimeChange.newDuration} min</strong>?
                </>
              ) : (
                <>
                  Change appointment time from <strong>{formatAppointmentTime(pendingTimeChange?.oldTime ?? "")}</strong> to{" "}
                  <strong>{formatAppointmentTime(pendingTimeChange?.newTime ?? "")}</strong>?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={cancelTimeChange}
              disabled={!!updatingTimeForId}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmTimeChange}
              disabled={!!updatingTimeForId}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {updatingTimeForId ? (
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
                  Saving...
                </>
              ) : (
                "Confirm Change"
              )}
            </Button>
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
