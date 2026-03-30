"use client"

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo, Fragment, useRef } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { addDays, format, subDays } from "date-fns"
import { ChevronDown, Clock, Square, Pencil, CalendarPlus, PencilIcon, CalendarClock, XCircle, Eye, Trash2, List, Calendar, AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppointmentsAPI, StaffDirectoryAPI, BlockTimeAPI, SalesAPI } from "@/lib/api"
import { BlockTimeModal, getBlockReasonIcon } from "@/components/appointments/block-time-modal"
import { useToast } from "@/hooks/use-toast"

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
  additionalServices?: Array<{ _id: string; name: string; price?: number; duration?: number }>
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
  bookingGroupId?: string | null
}

function getServiceDisplayNames(apt: { serviceId?: { name?: string; _id?: unknown }; additionalServices?: Array<{ name?: string }>; bookingGroupId?: string | null }): string[] {
  const svc = apt?.serviceId
  const primary = (typeof svc === "object" && svc?.name) || "Service"
  // Include additionalServices (e.g. services added via edit for same staff) on all cards
  const additional = (apt?.additionalServices || []).map((s) => s?.name).filter(Boolean) as string[]
  return [primary, ...additional]
}

/** Total duration for multi-service appointments: primary + sum of additional services.
 * Uses apt.duration when set (e.g. from resize) so user overrides take precedence over service defaults. */
function getTotalDuration(apt: { duration?: number; serviceId?: { duration?: number }; additionalServices?: Array<{ duration?: number }> }): number {
  if (apt?.duration != null && apt.duration > 0) return apt.duration
  const primary = apt?.serviceId?.duration ?? 60
  const additional = (apt?.additionalServices || []).reduce((sum, s) => sum + (s.duration ?? 0), 0)
  return primary + additional
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

const SLOT_MINUTES = 15
const slotHeight_COMPACT = 40
const slotHeight_COMFORTABLE = 76
const SLOTS_PER_HOUR = 4
const DEFAULT_START_HOUR = 9
const DEFAULT_END_HOUR = 21

/** Snap to 15-min grid so slot rows always land on :00, :15, :30, :45 — otherwise labels that rely on minute-of-hour % 30 vanish (e.g. range starting at 4:16). */
function alignMinutesDownToSlotGrid(totalMinutes: number): number {
  return Math.floor(totalMinutes / SLOT_MINUTES) * SLOT_MINUTES
}

function alignMinutesUpToSlotGrid(totalMinutes: number): number {
  return Math.ceil(totalMinutes / SLOT_MINUTES) * SLOT_MINUTES
}

function parseHHMMToMinutes(time?: string | null): number | null {
  if (!time) return null
  const parts = time.split(":")
  const h = parseInt(parts[0] || "0", 10)
  const m = parseInt(parts[1] || "0", 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function parseTimeToMinutes(time: string): number {
  if (!time || typeof time !== "string") return 0
  const str = String(time).trim()
  // Handle ISO date strings (e.g. "2025-02-19T20:30:00.000Z") - extract time part
  const isoMatch = str.match(/T(\d{1,2}):(\d{2})/)
  if (isoMatch) {
    const h = parseInt(isoMatch[1], 10)
    const m = parseInt(isoMatch[2], 10)
    return (h >= 0 && h < 24 && m >= 0 && m < 60) ? h * 60 + m : 0
  }
  const cleaned = str.replace(/\s*(am|pm)/i, "").trim()
  const parts = cleaned.split(":")
  const h = parseInt(parts[0] || "0", 10)
  const m = parseInt(parts[1] || "0", 10)
  if (h < 0 || h > 23 || m < 0 || m > 59) return 0
  const isPm = /pm/i.test(str) && h < 12
  const hour = isPm ? h + 12 : /am/i.test(str) && h === 12 ? 0 : h
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
      return "bg-amber-50/90 border-amber-200/80 hover:bg-amber-100/90"
    case "confirmed":
      return "bg-blue-50/90 border-blue-200/80 hover:bg-blue-100/90"
    case "arrived":
      return "bg-blue-50/90 border-blue-200/80 hover:bg-blue-100/90"
    case "service_started":
      return "bg-violet-50/90 border-violet-200/80 hover:bg-violet-100/90"
    case "completed":
      return "bg-emerald-50/90 border-emerald-200/80 hover:bg-emerald-100/90"
    case "cancelled":
      return "bg-red-50/90 border-red-200/80 hover:bg-red-100/90"
    default:
      return "bg-slate-50/90 border-slate-200/80 hover:bg-slate-100/90"
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
  onOpenAppointmentForm?: (params?: { date?: string; time?: string; staffId?: string; appointmentId?: string }) => void
  view?: "list" | "calendar"
  onSwitchView?: (v: "list" | "calendar") => void
}

export const AppointmentsCalendarGrid = forwardRef<
  { showCancelledModal: () => void; showUpcomingModal: () => void },
  AppointmentsCalendarGridProps
>(({ initialAppointmentId, onSwitchToList, onOpenAppointmentForm, view = "calendar", onSwitchView }, ref) => {
  const router = useRouter()
  const { toast } = useToast()
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [listFetchError, setListFetchError] = useState(false)
  const [calendarRetryKey, setCalendarRetryKey] = useState(0)
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
  const [showDeleteInvoiceConfirm, setShowDeleteInvoiceConfirm] = useState(false)
  const [deleteInvoiceReason, setDeleteInvoiceReason] = useState("")
  const [deletingInvoice, setDeletingInvoice] = useState(false)
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
  const [dragStartRect, setDragStartRect] = useState<DOMRect | null>(null)
  const [dragHoverSlot, setDragHoverSlot] = useState<{ colIndex: number; slotMinutes: number } | null>(null)
  const blocksContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const userHasScrolledRef = useRef(false)
  const isProgrammaticScrollRef = useRef(false)
  const justDraggedRef = useRef(false)
  const dragHoverSlotRef = useRef<{ colIndex: number; slotMinutes: number } | null>(null)
  const [showTimeChangeConfirm, setShowTimeChangeConfirm] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [scrollToNowRequested, setScrollToNowRequested] = useState(false)
  const [density, setDensityState] = useState<"compact" | "comfortable">(() => {
    if (typeof window === "undefined") return "comfortable"
    try {
      const stored = localStorage.getItem("appointmentViewMode") as "compact" | "comfortable" | null
      if (stored === "compact" || stored === "comfortable") return stored
    } catch {
      /* ignore */
    }
    return "comfortable"
  })
  const setDensity = useCallback((value: "compact" | "comfortable") => {
    setDensityState(value)
    try {
      localStorage.setItem("appointmentViewMode", value)
    } catch {
      /* ignore */
    }
  }, [])
  const [showWalkInCards, setShowWalkInCardsState] = useState(() => {
    if (typeof window === "undefined") return true
    try {
      const stored = localStorage.getItem("appointmentShowWalkInCards")
      if (stored === "false") return false
      if (stored === "true") return true
    } catch {
      /* ignore */
    }
    return true
  })
  const setShowWalkInCards = useCallback((value: boolean) => {
    setShowWalkInCardsState(value)
    try {
      localStorage.setItem("appointmentShowWalkInCards", String(value))
    } catch {
      /* ignore */
    }
  }, [])
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
  const [draggingBlock, setDraggingBlock] = useState<{
    id: string
    startTimeMinutes: number
    endTimeMinutes: number
    mode: "resize-top" | "resize-bottom"
    startY: number
  } | null>(null)
  const [blockResizeOffsetY, setBlockResizeOffsetY] = useState(0)
  const [updatingBlockForId, setUpdatingBlockForId] = useState<string | null>(null)
  const [slotActionDialog, setSlotActionDialog] = useState<{
    date: string
    time: string
    staffId: string | null
    staffName?: string
    clientX: number
    clientY: number
  } | null>(null)
  const [blockTimeModalOpen, setBlockTimeModalOpen] = useState(false)
  const [blockTimeModalData, setBlockTimeModalData] = useState<{
    date: string
    time: string
    staffId: string | null
    staffName?: string
  } | null>(null)
  const [blockTimesRefreshKey, setBlockTimesRefreshKey] = useState(0)
  const [blockContextMenu, setBlockContextMenu] = useState<{
    block: BlockTime
    clientX: number
    clientY: number
  } | null>(null)

  // Update current time every minute for the red "now" line
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Reset "user has scrolled" when date changes so we auto-scroll again when returning to today
  useEffect(() => {
    userHasScrolledRef.current = false
  }, [selectedDate])

  useEffect(() => {
    if (!selectedAppointment?._id) {
      setLinkedSale(null)
      return
    }
    let cancelled = false
    const a = selectedAppointment as any
    const idsToTry: string[] = a.bookingGroupId
      ? appointments
          .filter((apt) => (apt as Appointment).bookingGroupId === a.bookingGroupId)
          .map((apt) => apt._id)
      : [selectedAppointment._id]

    const fetchLinkedSale = async () => {
      for (const id of idsToTry) {
        if (cancelled) return
        try {
          const res = await SalesAPI.getByAppointmentId(id)
          if (res?.success && res?.data) {
            if (!cancelled) setLinkedSale(res.data)
            return
          }
        } catch {
          /* try next */
        }
      }
      if (!cancelled) setLinkedSale(null)
    }
    fetchLinkedSale()
    return () => {
      cancelled = true
    }
  }, [selectedAppointment?._id, (selectedAppointment as any)?.bookingGroupId, appointments])

  useImperativeHandle(ref, () => ({
    showCancelledModal: () => setShowCancelledModal(true),
    showUpcomingModal: () => setShowUpcomingModal(true),
  }))

  useEffect(() => {
    setPendingAppointmentId(initialAppointmentId ?? null)
  }, [initialAppointmentId])

  const fetchAppointments = useCallback(async () => {
    setListFetchError(false)
    try {
      setLoading(true)
      const [staffRes, aptRes] = await Promise.all([
        StaffDirectoryAPI.getAll(),
        AppointmentsAPI.getAll({ limit: 200 }),
      ])
      if (staffRes?.success && Array.isArray(staffRes.data)) {
        setStaffList(staffRes.data)
      } else {
        setStaffList([])
      }
      if (aptRes?.success && aptRes?.data) {
        setAppointments(aptRes.data)
      } else {
        setAppointments([])
      }
    } catch (e: any) {
      console.error(e)
      const st = e?.response?.status
      if (st !== 401 && st !== 403) setListFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [calendarRetryKey])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  useEffect(() => {
    const handler = () => fetchAppointments()
    window.addEventListener("appointments-refresh", handler)
    return () => window.removeEventListener("appointments-refresh", handler)
  }, [fetchAppointments])

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
  }, [selectedDate, staffFilter, blockTimesRefreshKey])

  useEffect(() => {
    let cancelled = false
    if (!selectedDate) return
    const load = async () => {
      try {
        const sales = await SalesAPI.getAllMergePages({
          dateFrom: selectedDate,
          dateTo: selectedDate,
          batchSize: 400,
        })
        if (cancelled) return
        if (Array.isArray(sales)) {
          const dateNorm = selectedDate?.slice(0, 10) || ""
          let walkIns = sales.filter((s: any) => {
            if (!s.items?.some((i: any) => i.type === "service")) return false
            if (s.appointmentId) return false // Sale from appointment – appointment card shows it, no walk-in card
            const saleDate = s.date ? format(new Date(s.date), "yyyy-MM-dd") : ""
            return !dateNorm || saleDate === dateNorm
          })
          if (staffFilter) {
            walkIns = walkIns.filter((s: any) => {
              const firstItem = (s.items || []).find((i: any) => i.type === "service")
              const raw = firstItem?.staffId || firstItem?.staffContributions?.[0]?.staffId || s.staffId
              const sid = typeof raw === "object" && raw?._id ? raw._id : String(raw || "")
              return sid === staffFilter
            })
          }
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

  const slotHeight = density === "comfortable" ? slotHeight_COMFORTABLE : slotHeight_COMPACT

  const effectiveWalkInSales = showWalkInCards ? walkInSales : []

  const { extendedStartMinutes, extendedEndMinutes, totalSlots: totalSlotsWithSales } = useMemo(() => {
    let extStart = startMinutes
    let extEnd = endMinutes
    effectiveWalkInSales.forEach((sale) => {
      // Prefer sale.time; fallback to extracting time from sale.date (ISO string) when time is missing/invalid
      let timeStr = sale.time
      if (!timeStr || parseTimeToMinutes(timeStr) > 24 * 60) {
        const d = sale.date ? new Date(sale.date) : new Date()
        if (!Number.isNaN(d.getTime())) {
          timeStr = format(d, "HH:mm")
        }
      }
      const checkoutEndM = parseTimeToMinutes(timeStr || "9:00")
      const startM = checkoutEndM - 30
      if (startM < extStart) extStart = startM
      if (checkoutEndM > extEnd) extEnd = checkoutEndM
    })
    // Bills/appointments outside staff hours must widen the grid (walk-in logic alone misses appointment-only sales)
    filteredAppointments.forEach((apt) => {
      const startM = parseTimeToMinutes(apt.time)
      const dur = getTotalDuration(apt as any)
      if (dur <= 0) return
      const endM = startM + dur
      if (startM < extStart) extStart = startM
      if (endM > extEnd) extEnd = endM
    })
    // Align to slot grid so row times hit :00 / :30 and time labels stay visible
    const alignedStart = alignMinutesDownToSlotGrid(extStart)
    let alignedEnd = alignMinutesUpToSlotGrid(extEnd)
    if (alignedEnd <= alignedStart) alignedEnd = alignedStart + SLOT_MINUTES
    const span = Math.max(alignedEnd - alignedStart, SLOT_MINUTES)
    const slots = Math.ceil(span / SLOT_MINUTES)
    return {
      extendedStartMinutes: alignedStart,
      extendedEndMinutes: alignedEnd,
      totalSlots: slots,
    }
  }, [startMinutes, endMinutes, effectiveWalkInSales, filteredAppointments])

  const timeSlots = useMemo(() => {
    const slots: { label: string; minutes: number; isHourStart: boolean; showTimeLabel: boolean }[] = []
    for (let minutes = extendedStartMinutes; minutes < extendedEndMinutes; minutes += SLOT_MINUTES) {
      const h = Math.floor(minutes / 60)
      const m = ((minutes % 60) + 60) % 60 // Handle negative minutes correctly
      const isHourStart = m === 0
      // Show label at :00, :30, and first/last slot (range is aligned to 15-min grid so :00/:30 repeat reliably)
      const showTimeLabel =
        m % 30 === 0 || minutes === extendedStartMinutes || minutes === extendedEndMinutes - SLOT_MINUTES
      const label = format(new Date(2000, 0, 1, h, m), "h:mma").toLowerCase()
      slots.push({ label, minutes, isHourStart, showTimeLabel })
    }
    return slots
  }, [extendedStartMinutes, extendedEndMinutes])

  // Auto-scroll to center the red "now" line when viewing today, until user manually scrolls
  useEffect(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd")
    if (selectedDate !== todayStr || userHasScrolledRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    const currentMinutes =
      currentTime.getHours() * 60 +
      currentTime.getMinutes() +
      currentTime.getSeconds() / 60
    if (currentMinutes < extendedStartMinutes || currentMinutes >= extendedEndMinutes) return
    // Defer scroll until after layout is complete (fixes staging/hydration timing)
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const doScroll = () => {
      if (cancelled) return false
      const container = scrollContainerRef.current
      if (!container) return false
      const containerHeight = container.clientHeight
      if (containerHeight === 0) return false // Layout not ready
      const topPx = 56 + ((currentMinutes - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
      const scrollTop = Math.max(0, topPx - containerHeight / 2)
      isProgrammaticScrollRef.current = true
      container.scrollTop = scrollTop
      return true
    }
    const tryScroll = () => {
      if (cancelled) return
      if (!doScroll()) {
        timeoutId = setTimeout(tryScroll, 150)
      }
    }
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(tryScroll)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [selectedDate, currentTime, extendedStartMinutes, extendedEndMinutes, slotHeight])

  // Scroll to red "now" line when TIME header is clicked
  useEffect(() => {
    if (!scrollToNowRequested) return
    const todayStr = format(new Date(), "yyyy-MM-dd")
    if (selectedDate !== todayStr) return
    const el = scrollContainerRef.current
    if (!el) return
    const now = new Date()
    const currentMinutes =
      now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
    if (currentMinutes < extendedStartMinutes || currentMinutes >= extendedEndMinutes) return
    const topPx = 56 + ((currentMinutes - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
    const containerHeight = el.clientHeight
    isProgrammaticScrollRef.current = true
    el.scrollTop = Math.max(0, topPx - containerHeight / 2)
    setScrollToNowRequested(false)
  }, [scrollToNowRequested, selectedDate, extendedStartMinutes, extendedEndMinutes, slotHeight])

  const handleTimeHeaderClick = () => {
    const todayStr = format(new Date(), "yyyy-MM-dd")
    if (selectedDate !== todayStr) setSelectedDate(todayStr)
    setScrollToNowRequested(true)
  }

  const blocksByColumn = useMemo(() => {
    const map: Record<string, Array<{ apt: Appointment; top: number; height: number }>> = {}
    columns.forEach((col) => {
      map[col._id] = []
    })
    filteredAppointments.forEach((apt) => {
      const staffId = getPrimaryStaffId(apt)
      if (!staffId || !map[staffId]) return
      const startM = parseTimeToMinutes(apt.time)
      const duration = getTotalDuration(apt as any)
      const top = ((startM - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
      const height = Math.max(slotHeight * 0.6, (duration / SLOT_MINUTES) * slotHeight)
      map[staffId].push({ apt, top, height })
    })
    columns.forEach((col) => {
      (map[col._id] || []).sort((a, b) => a.top - b.top)
    })
    return map
  }, [columns, filteredAppointments, extendedStartMinutes, slotHeight])

  // Section 8: Overlap handling - stack overlapping appointments side-by-side with consistent ordering
  const blocksByColumnWithLayout = useMemo(() => {
    const result: Record<string, Array<{ apt: Appointment; top: number; height: number; left: number; width: number }>> = {}
    columns.forEach((col) => {
      const blocks = (blocksByColumn[col._id] || []).slice().sort((a, b) => a.top - b.top)
      const assigned: Array<{ apt: Appointment; top: number; height: number; left: number; width: number }> = []
      for (let i = 0; i < blocks.length; i++) {
        const { apt, top, height } = blocks[i]
        const end = top + height
        const overlapping = blocks
          .filter((b, j) => {
            const bEnd = b.top + b.height
            return top < bEnd - 2 && end > b.top + 2
          })
          .sort((a, b) => a.top - b.top)
        const groupSize = overlapping.length
        const width = groupSize > 1 ? 100 / groupSize : 100
        const colIdx = overlapping.findIndex((b) => b.apt._id === apt._id)
        const left = colIdx >= 0 ? colIdx * (100 / groupSize) : 0
        assigned.push({ apt, top, height, left, width })
      }
      result[col._id] = assigned
    })
    return result
  }, [columns, blocksByColumn])

  const WALK_IN_SALE_DURATION = 30

  const salesByColumn = useMemo(() => {
    const map: Record<string, Array<{ sale: any; serviceItem: any; itemKey: string; top: number; height: number; startM: number; endM: number }>> = {}
    columns.forEach((col) => {
      map[col._id] = []
    })
    effectiveWalkInSales.forEach((sale) => {
      const serviceItems = (sale.items || []).filter((i: any) => i.type === "service")
      if (serviceItems.length === 0) return
      let timeStr = sale.time
      if (!timeStr || parseTimeToMinutes(timeStr) > 24 * 60) {
        const d = sale.date ? new Date(sale.date) : new Date()
        if (!Number.isNaN(d.getTime())) timeStr = format(d, "HH:mm")
      }
      const checkoutEndM = parseTimeToMinutes(timeStr || "9:00")
      const duration = WALK_IN_SALE_DURATION
      const endM = checkoutEndM
      const startM = endM - duration
      const top = ((startM - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
      const height = Math.max(slotHeight * 0.6, (duration / SLOT_MINUTES) * slotHeight)
      serviceItems.forEach((serviceItem: any, idx: number) => {
        const rawStaffId =
          serviceItem?.staffId ||
          serviceItem?.staffContributions?.[0]?.staffId ||
          sale.staffId
        const staffId = typeof rawStaffId === "object" && rawStaffId?._id ? rawStaffId._id : String(rawStaffId || "")
        if (!staffId || !map[staffId]) return
        const itemKey = `${sale._id}-${serviceItem?.name || idx}-${staffId}`
        map[staffId].push({ sale, serviceItem, itemKey, top, height, startM, endM })
      })
    })
    columns.forEach((col) => {
      (map[col._id] || []).sort((a, b) => a.top - b.top)
    })
    return map
  }, [columns, effectiveWalkInSales, extendedStartMinutes, slotHeight])

  const salesByColumnWithLayout = useMemo(() => {
    const result: Record<string, Array<{ sale: any; serviceItem: any; top: number; height: number; startM: number; endM: number; left: number; width: number }>> = {}
    columns.forEach((col) => {
      const blocks = (salesByColumn[col._id] || []).slice().sort((a, b) => a.top - b.top)
      const assigned: Array<{ sale: any; serviceItem: any; top: number; height: number; startM: number; endM: number; left: number; width: number }> = []
      for (let i = 0; i < blocks.length; i++) {
        const { sale, serviceItem, itemKey, top, height, startM, endM } = blocks[i]
        const end = top + height
        const overlapping = blocks
          .filter((b) => {
            const bEnd = b.top + b.height
            return top < bEnd - 2 && end > b.top + 2
          })
          .sort((a, b) => a.top - b.top)
        const groupSize = overlapping.length
        const width = groupSize > 1 ? 100 / groupSize : 100
        const colIdx = overlapping.findIndex((b) => b.itemKey === itemKey)
        const left = colIdx >= 0 ? colIdx * (100 / groupSize) : 0
        assigned.push({ sale, serviceItem, top, height, startM, endM, left, width })
      }
      result[col._id] = assigned
    })
    return result
  }, [columns, salesByColumn])

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
      if (startM >= extendedEndMinutes || endM <= extendedStartMinutes) return
      const top = ((Math.max(startM, extendedStartMinutes) - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
      const clipStart = Math.max(startM, extendedStartMinutes)
      const clipEnd = Math.min(endM, extendedEndMinutes)
      const durationMins = clipEnd - clipStart
      const height = (durationMins / SLOT_MINUTES) * slotHeight
      map[staffId].push({ block, top, height })
    })
    columns.forEach((col) => {
      (map[col._id] || []).sort((a, b) => a.top - b.top)
    })
    return map
  }, [columns, blockTimes, selectedDate, extendedStartMinutes, extendedEndMinutes, slotHeight])

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

  const aptToCancel = appointmentToCancel ? appointments.find((a) => a._id === appointmentToCancel) : null
  const hasMultipleInGroup = aptToCancel?.bookingGroupId
    ? appointments.filter((a) => (a as Appointment).bookingGroupId === aptToCancel.bookingGroupId).length > 1
    : false
  const groupIdsToCancel = hasMultipleInGroup && aptToCancel?.bookingGroupId
    ? appointments
        .filter((a) => (a as Appointment).bookingGroupId === aptToCancel.bookingGroupId)
        .map((a) => a._id)
    : []

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

  const confirmCancelAllAppointments = async () => {
    if (!appointmentToCancel || groupIdsToCancel.length === 0) return
    setCancelling(true)
    try {
      let allSuccess = true
      for (const id of groupIdsToCancel) {
        const res = await AppointmentsAPI.update(id, { status: "cancelled" })
        if (!res?.success) allSuccess = false
      }
      if (allSuccess) {
        const idsSet = new Set(groupIdsToCancel)
        const list = appointments.map((a) =>
          idsSet.has(a._id) ? { ...a, status: "cancelled" as const } : a
        )
        setAppointments(list)
        setShowDetails(false)
        setShowCancelConfirm(false)
        setAppointmentToCancel(null)
        alert("All appointments cancelled successfully")
      } else {
        alert("Failed to cancel some appointments. Please try again.")
      }
    } catch (e) {
      console.error(e)
      alert("Failed to cancel appointments. Please try again.")
    } finally {
      setCancelling(false)
    }
  }

  const handleDeleteInvoiceClick = () => {
    setShowDeleteInvoiceConfirm(true)
  }

  const confirmDeleteInvoice = async () => {
    if (!linkedSale?._id || !selectedAppointment?._id || !deleteInvoiceReason.trim()) return
    setDeletingInvoice(true)
    try {
      const saleRes = await SalesAPI.delete(linkedSale._id, deleteInvoiceReason.trim())
      if (!saleRes?.success) {
        alert("Failed to delete invoice. Please try again.")
        return
      }
      const a = selectedAppointment as any
      const idsToDelete = a.bookingGroupId
        ? appointments.filter((apt) => (apt as Appointment).bookingGroupId === a.bookingGroupId).map((apt) => apt._id)
        : [selectedAppointment._id]
      let allAptDeleted = true
      for (const id of idsToDelete) {
        const aptRes = await AppointmentsAPI.delete(id)
        if (!aptRes?.success) allAptDeleted = false
      }
      if (allAptDeleted) {
        const idsSet = new Set(idsToDelete)
        setAppointments((prev) => prev.filter((apt) => !idsSet.has(apt._id)))
      }
      setLinkedSale(null)
      setShowDetails(false)
      setShowDeleteInvoiceConfirm(false)
      setDeleteInvoiceReason("")
      window.dispatchEvent(new CustomEvent("appointments-refresh"))
      alert(allAptDeleted ? "Invoice and appointment(s) deleted successfully" : "Invoice deleted. Failed to delete some appointment(s).")
    } catch (e) {
      console.error(e)
      alert("Failed to delete invoice. Please try again.")
    } finally {
      setDeletingInvoice(false)
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
        if (newStatus === 'arrived') {
          const groupId = selectedAppointment.bookingGroupId
          if (groupId) {
            const updatedList = list.map((a) =>
              a.bookingGroupId === groupId ? { ...a, status: newStatus } : a
            )
            setAppointments(updatedList)
          } else {
            setAppointments(list)
          }
        } else {
          setAppointments(list)
        }
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
    const cardEl = (e.target as HTMLElement).closest("[data-appointment-card]") as HTMLElement
    if (cardEl) setDragStartRect(cardEl.getBoundingClientRect())
    setDragOffsetY(0)
    setDragOffsetX(0)
    const sourceStaffId = getPrimaryStaffId(apt) ?? ""
    setDraggingApt({
      id: apt._id,
      startX: e.clientX,
      startY: e.clientY,
      startTimeMinutes: parseTimeToMinutes(apt.time),
      duration: getTotalDuration(apt as any),
      mode: "move",
      sourceStaffId,
    })
  }

  const handleResizeStart = (e: React.MouseEvent, apt: Appointment, mode: "resize-top" | "resize-bottom") => {
    if (apt.status === "cancelled" || apt.status === "completed") return
    e.preventDefault()
    e.stopPropagation()
    const cardEl = (e.target as HTMLElement).closest("[data-appointment-card]") as HTMLElement
    if (cardEl) setDragStartRect(cardEl.getBoundingClientRect())
    setDragOffsetY(0)
    setDragOffsetX(0)
    const sourceStaffId = getPrimaryStaffId(apt) ?? ""
    setDraggingApt({
      id: apt._id,
      startX: e.clientX,
      startY: e.clientY,
      startTimeMinutes: parseTimeToMinutes(apt.time),
      duration: getTotalDuration(apt as any),
      mode,
      sourceStaffId,
    })
  }

  const handleBlockResizeStart = (e: React.MouseEvent, block: BlockTime, mode: "resize-top" | "resize-bottom") => {
    e.preventDefault()
    e.stopPropagation()
    setBlockResizeOffsetY(0)
    const startM = parseTimeToMinutes(block.startTime)
    const endM = parseTimeToMinutes(block.endTime)
    setDraggingBlock({
      id: block._id,
      startTimeMinutes: startM,
      endTimeMinutes: endM,
      mode,
      startY: e.clientY,
    })
  }

  useEffect(() => {
    if (!draggingApt) return
    dragHoverSlotRef.current = null
    const isValidDropTarget = (colIndex: number, slotMinutes: number, duration: number): boolean => {
      const col = columns[colIndex]
      if (!col) return false
      const windowForStaff = staffWindowsById[col._id]
      for (let m = slotMinutes; m < slotMinutes + duration; m += SLOT_MINUTES) {
        const inWindow = !windowForStaff || (windowForStaff.enabled && m >= windowForStaff.start && m < windowForStaff.end)
        const blocked = (blockTimesByColumn[col._id] || []).some(({ block }) => {
          const startM = parseTimeToMinutes(block.startTime)
          const endM = parseTimeToMinutes(block.endTime)
          return m < endM && m + SLOT_MINUTES > startM
        })
        if (!inWindow || blocked) return false
      }
      return true
    }

    const onMouseMove = (e: MouseEvent) => {
      if (showTimeChangeConfirm) return
      justDraggedRef.current = true
      setDragOffsetY(e.clientY - draggingApt.startY)
      if (draggingApt.mode === "move" || draggingApt.mode === "resize-top") {
        setDragOffsetX(e.clientX - draggingApt.startX)
        const el = blocksContainerRef.current
        if (el && columns.length > 0) {
          const rect = el.getBoundingClientRect()
          const relX = e.clientX - rect.left
          const relY = e.clientY - rect.top
          const colIndex = Math.floor(relX / (rect.width / columns.length))
          const slotIndex = Math.floor(relY / slotHeight)
          const slotMinutes = extendedStartMinutes + slotIndex * SLOT_MINUTES
          const inBounds = colIndex >= 0 && colIndex < columns.length && slotMinutes >= extendedStartMinutes && slotMinutes < extendedEndMinutes
          const valid = inBounds && isValidDropTarget(colIndex, slotMinutes, draggingApt.duration ?? 60)
          if (valid) {
            const slot = { colIndex, slotMinutes }
            setDragHoverSlot(slot)
            dragHoverSlotRef.current = slot
          } else {
            setDragHoverSlot(null)
            dragHoverSlotRef.current = null
          }
        }
      }
    }
    const onMouseUp = async (e: MouseEvent) => {
      const current = draggingApt
      if (!current) return
      const deltaY = e.clientY - current.startY
      const slotDelta = Math.round(deltaY / slotHeight)
      const minutesDelta = slotDelta * SLOT_MINUTES
      const hoverSlot = dragHoverSlotRef.current

      const applyDrop = async (payload: { mode: "staff" | "move" | "resize-top" | "resize-bottom"; newStaffId?: string; newTime?: string; newDuration?: number }) => {
        setUpdatingTimeForId(current.id)
        try {
          let res: { success?: boolean } | null = null
          if (payload.mode === "staff" && payload.newStaffId) {
            const updatePayload: { staffId: string; staffAssignments: any[]; time?: string } = {
              staffId: payload.newStaffId,
              staffAssignments: [{ staffId: payload.newStaffId, percentage: 100, role: "primary" }],
            }
            if (payload.newTime) updatePayload.time = payload.newTime
            res = await AppointmentsAPI.update(current.id, updatePayload)
            if (res?.success) {
              const newStaff = columns.find((c) => c._id === payload.newStaffId)
              setAppointments((prev) =>
                prev.map((a) => {
                  if (a._id !== current.id) return a
                  const aAny = a as any
                  return { ...a, staffId: newStaff ? { _id: newStaff._id, name: newStaff.name, role: newStaff.role } : aAny.staffId, staffAssignments: [{ staffId: { _id: payload.newStaffId!, name: newStaff?.name ?? "Staff" }, role: "primary" }], ...(payload.newTime && { time: payload.newTime }) }
                })
              )
            }
          } else if ((payload.mode === "move" || payload.mode === "resize-top") && payload.newTime) {
            res = await AppointmentsAPI.update(current.id, { time: payload.newTime })
            if (res?.success) {
              setAppointments((prev) => prev.map((a) => (a._id === current.id ? { ...a, time: payload.newTime! } : a)))
            }
          } else if (payload.mode === "resize-bottom" && payload.newDuration != null) {
            res = await AppointmentsAPI.update(current.id, { duration: payload.newDuration })
            if (res?.success) {
              setAppointments((prev) => prev.map((a) => (a._id === current.id ? { ...a, duration: payload.newDuration! } : a)))
            }
          }
          if (!res?.success) alert("Failed to update appointment.")
        } catch (err) {
          console.error(err)
          alert("Failed to update appointment.")
        } finally {
          setUpdatingTimeForId(null)
          setDraggingApt(null)
          setDragOffsetY(0)
          setDragOffsetX(0)
          setDragStartRect(null)
          setDragHoverSlot(null)
          dragHoverSlotRef.current = null
          setTimeout(() => { justDraggedRef.current = false }, 0)
        }
      }

      if (current.mode === "move") {
        if (!hoverSlot) {
          setDraggingApt(null)
          setDragOffsetY(0)
          setDragOffsetX(0)
          setDragStartRect(null)
          setDragHoverSlot(null)
          dragHoverSlotRef.current = null
          setTimeout(() => { justDraggedRef.current = false }, 0)
          return
        }
        if (!isValidDropTarget(hoverSlot.colIndex, hoverSlot.slotMinutes, current.duration ?? 60)) {
          setDraggingApt(null)
          setDragOffsetY(0)
          setDragOffsetX(0)
          setDragStartRect(null)
          setDragHoverSlot(null)
          dragHoverSlotRef.current = null
          setTimeout(() => { justDraggedRef.current = false }, 0)
          return
        }
        const targetStaffId = columns[hoverSlot.colIndex]?._id ?? null
        const newTime = slotMinutesToTimeString(hoverSlot.slotMinutes)
        const endMinutesBound = endMinutes - current.duration
        const newMinutes = Math.max(startMinutes, Math.min(endMinutesBound, hoverSlot.slotMinutes))
        const clamped = Math.floor(newMinutes / SLOT_MINUTES) * SLOT_MINUTES
        const clampedTime = slotMinutesToTimeString(clamped)
        const isStaffChange = columns.length > 1 && targetStaffId && targetStaffId !== current.sourceStaffId
        if (clamped === current.startTimeMinutes && !isStaffChange) {
          setDraggingApt(null)
          setDragOffsetY(0)
          setDragOffsetX(0)
          setDragStartRect(null)
          setDragHoverSlot(null)
          dragHoverSlotRef.current = null
          setTimeout(() => { justDraggedRef.current = false }, 0)
          return
        }
        if (isStaffChange) {
          await applyDrop({ mode: "staff", newStaffId: targetStaffId!, newTime: clampedTime })
        } else {
          await applyDrop({ mode: "move", newTime: clampedTime })
        }
      } else if (current.mode === "resize-top") {
        if (!hoverSlot) {
          setDraggingApt(null)
          setDragOffsetY(0)
          setDragOffsetX(0)
          setDragStartRect(null)
          setDragHoverSlot(null)
          dragHoverSlotRef.current = null
          setTimeout(() => { justDraggedRef.current = false }, 0)
          return
        }
        if (!isValidDropTarget(hoverSlot.colIndex, hoverSlot.slotMinutes, current.duration ?? 60)) {
          setDraggingApt(null)
          setDragOffsetY(0)
          setDragOffsetX(0)
          setDragStartRect(null)
          setDragHoverSlot(null)
          dragHoverSlotRef.current = null
          setTimeout(() => { justDraggedRef.current = false }, 0)
          return
        }
        const targetStaffId = columns[hoverSlot.colIndex]?._id ?? null
        const endMinutesBound = endMinutes - current.duration
        const newMinutes = Math.max(startMinutes, Math.min(endMinutesBound, hoverSlot.slotMinutes))
        const clamped = Math.floor(newMinutes / SLOT_MINUTES) * SLOT_MINUTES
        const clampedTime = slotMinutesToTimeString(clamped)
        const isStaffChange = columns.length > 1 && targetStaffId && targetStaffId !== current.sourceStaffId
        if (clamped === current.startTimeMinutes && !isStaffChange) {
          setDraggingApt(null)
          setDragOffsetY(0)
          setDragOffsetX(0)
          setDragStartRect(null)
          setDragHoverSlot(null)
          dragHoverSlotRef.current = null
          setTimeout(() => { justDraggedRef.current = false }, 0)
          return
        }
        if (isStaffChange) {
          await applyDrop({ mode: "staff", newStaffId: targetStaffId!, newTime: clampedTime })
        } else {
          await applyDrop({ mode: "resize-top", newTime: clampedTime })
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
          setDragStartRect(null)
          setDragHoverSlot(null)
          dragHoverSlotRef.current = null
          setTimeout(() => { justDraggedRef.current = false }, 0)
          return
        }
        await applyDrop({ mode: "resize-bottom", newDuration })
      }
    }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [draggingApt, startMinutes, endMinutes, extendedStartMinutes, extendedEndMinutes, showTimeChangeConfirm, columns, slotHeight, staffWindowsById, blockTimesByColumn, selectedDate])

  useEffect(() => {
    if (!draggingBlock) return
    const onMouseMove = (e: MouseEvent) => {
      setBlockResizeOffsetY(e.clientY - draggingBlock.startY)
    }
    const onMouseUp = async (e: MouseEvent) => {
      const current = draggingBlock
      if (!current) return
      const deltaY = e.clientY - current.startY
      const slotDelta = Math.round(deltaY / slotHeight)
      const minutesDelta = slotDelta * SLOT_MINUTES
      const minDuration = SLOT_MINUTES
      let newStartM = current.startTimeMinutes
      let newEndM = current.endTimeMinutes
      if (current.mode === "resize-top") {
        newStartM = current.startTimeMinutes + minutesDelta
        newStartM = Math.max(startMinutes, Math.min(current.endTimeMinutes - minDuration, newStartM))
        newStartM = Math.floor(newStartM / SLOT_MINUTES) * SLOT_MINUTES
      } else {
        newEndM = current.endTimeMinutes + minutesDelta
        newEndM = Math.max(current.startTimeMinutes + minDuration, Math.min(endMinutes, newEndM))
        newEndM = Math.floor(newEndM / SLOT_MINUTES) * SLOT_MINUTES
      }
      const noChange =
        (current.mode === "resize-top" && newStartM === current.startTimeMinutes) ||
        (current.mode === "resize-bottom" && newEndM === current.endTimeMinutes)
      if (noChange) {
        setDraggingBlock(null)
        setBlockResizeOffsetY(0)
        return
      }
      setUpdatingBlockForId(current.id)
      try {
        const res = await BlockTimeAPI.update(current.id, {
          startTime: current.mode === "resize-top" ? slotMinutesToTimeString(newStartM) : undefined,
          endTime: current.mode === "resize-bottom" ? slotMinutesToTimeString(newEndM) : undefined,
        })
        if (res?.success) {
          setBlockTimes((prev) =>
            prev.map((b) => {
              if (b._id !== current.id) return b
              return {
                ...b,
                startTime: current.mode === "resize-top" ? slotMinutesToTimeString(newStartM) : b.startTime,
                endTime: current.mode === "resize-bottom" ? slotMinutesToTimeString(newEndM) : b.endTime,
              }
            })
          )
        } else {
          const r = res as { error?: string; errorDetail?: string }
          toast({
            title: "Cannot Update Block Time",
            description: r?.error || r?.errorDetail || "Failed to update block time.",
            variant: "destructive",
          })
        }
      } catch (err: any) {
        const data = err?.response?.data || err?.responseData
        const errMsg = data?.error || data?.errorDetail || data?.message || err?.message || "Failed to update block time."
        toast({
          title: "Cannot Update Block Time",
          description: typeof errMsg === "string" ? errMsg : "Failed to update block time.",
          variant: "destructive",
        })
      } finally {
        setUpdatingBlockForId(null)
        setDraggingBlock(null)
        setBlockResizeOffsetY(0)
      }
    }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [draggingBlock, startMinutes, endMinutes, slotHeight])

  const handleDeleteBlockTime = useCallback(async (block: BlockTime) => {
    if (!confirm("Delete this blocked time?")) return
    setUpdatingBlockForId(block._id)
    try {
      const res = await BlockTimeAPI.delete(block._id)
      if (res?.success) {
        setBlockTimes((prev) => prev.filter((b) => b._id !== block._id))
      } else {
        alert("Failed to delete. Please try again.")
      }
    } catch (e) {
      console.error(e)
      alert("Failed to delete. Please try again.")
    } finally {
      setUpdatingBlockForId(null)
    }
  }, [])

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
      setDragStartRect(null)
      setDragHoverSlot(null)
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
    setDragStartRect(null)
    setDragHoverSlot(null)
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

  if (listFetchError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 max-w-lg mx-auto my-8">
        <div className="flex gap-3 text-amber-900 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>Could not load staff or appointments. Check your connection and try again.</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-amber-300"
          onClick={() => setCalendarRetryKey((k) => k + 1)}
        >
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5 calendar-fade-transition w-full">
      {/* Section 5: Top Control Bar - Premium hierarchy */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Staff filter, Date selector, Density toggle */}
        <div className="flex items-center gap-3">
          <Select
            value={staffFilter ?? "all"}
            onValueChange={(v) => setStaffFilter(v === "all" ? null : v)}
          >
            <SelectTrigger className="w-[160px] rounded-xl border-slate-200 bg-white/80 h-9">
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
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 h-9">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm font-medium text-slate-700 bg-transparent border-0 focus:outline-none focus:ring-0 min-w-[120px]"
            />
          </div>
          <div className="flex h-9 items-center gap-1 rounded-xl overflow-hidden border border-slate-200 bg-white/80 p-0.5">
            {dayChips.map((day) => {
              const dStr = format(day, "yyyy-MM-dd")
              const isToday = dStr === format(new Date(), "yyyy-MM-dd")
              const isSelected = dStr === selectedDate
              return (
                <button
                  key={dStr}
                  type="button"
                  onClick={() => setSelectedDate(dStr)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                    isSelected
                      ? "bg-violet-600 text-white shadow-sm"
                      : isToday
                      ? "bg-violet-50 text-violet-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {format(day, "d")} {isToday ? "Today" : format(day, "EEE")}
                </button>
              )
            })}
          </div>
          {/* Density toggle */}
          <div className="flex gap-1 rounded-xl overflow-hidden border border-slate-200 bg-white/80 p-0.5">
            <button
              type="button"
              onClick={() => setDensity("compact")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                density === "compact"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Compact
            </button>
            <button
              type="button"
              onClick={() => setDensity("comfortable")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                density === "comfortable"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Comfortable
            </button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 text-sm">
            <Checkbox
              checked={showWalkInCards}
              onCheckedChange={(checked) => setShowWalkInCards(checked === true)}
              className="border-slate-300 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600"
            />
            <span>Show Walk-in</span>
          </label>
        </div>
        <div className="flex-1" />
        {/* List/Calendar toggle - just before Color Code */}
        {onSwitchView && (
          <div className="flex gap-1 rounded-xl overflow-hidden border border-slate-200 bg-white/80 p-0.5">
            <button
              type="button"
              onClick={() => onSwitchView("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                view === "list"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <List className="h-3.5 w-3.5 shrink-0" />
              List
            </button>
            <button
              type="button"
              onClick={() => onSwitchView("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                view === "calendar"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              Calendar
            </button>
          </div>
        )}
        {/* Color Code - right side, above table */}
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
                className="fixed inset-0 z-[100]"
                aria-hidden
                onClick={() => setShowColorLegend(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-[101] rounded-xl border border-slate-200 bg-white p-3 shadow-lg min-w-[180px]">
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

      {/* Section 1: Grid with soft gray bg, alternating hour shading. Section 6: key triggers fade on date change */}
      <div key={selectedDate} className="rounded-2xl overflow-hidden border border-slate-200/80 bg-slate-50/50 shadow-sm">
        <div
          ref={scrollContainerRef}
          className="overflow-auto max-h-[calc(100vh-320px)] min-h-[400px] bg-white/50"
          onScroll={() => {
            if (!isProgrammaticScrollRef.current) userHasScrolledRef.current = true
            isProgrammaticScrollRef.current = false
          }}
        >
          <div
            className="grid w-full min-w-[600px] relative calendar-fade-transition"
            style={{
              gridTemplateColumns: `88px repeat(${Math.max(1, columns.length)}, minmax(140px, 1fr))`,
              gridTemplateRows: `56px repeat(${totalSlotsWithSales}, ${slotHeight}px)`,
            }}
          >
            {/* Time column header - click to scroll to current time */}
            <button
              type="button"
              onClick={handleTimeHeaderClick}
              className="sticky top-0 z-20 border-b border-r border-slate-200/80 bg-slate-50 px-3 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-left w-full hover:bg-slate-100/80 transition-colors cursor-pointer"
              title="Scroll to current time"
            >
              Time
            </button>
            {/* Section 4: Staff column headers with avatars */}
            {columns.length === 0 ? (
              <div className="sticky top-0 z-20 border-b border-r border-slate-200/80 bg-slate-50 px-4 py-3 font-medium text-slate-400 text-center">
                No staff
              </div>
            ) : (
              columns.map((col) => {
                const initials = (col.name || "?")
                  .split(/\s+/)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)
                return (
                  <div
                    key={col._id}
                    className="sticky top-0 z-20 border-b border-r border-slate-200/80 bg-white/95 backdrop-blur-sm px-4 py-3 last:border-r-0 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] flex flex-col items-center justify-center gap-1.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-xs shrink-0">
                        {initials}
                      </div>
                      <span className="font-semibold text-slate-700 text-sm truncate max-w-[100px]">
                        {col.name}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
            {timeSlots.map((slot) => {
              const isHourBoundary = (slot.minutes + SLOT_MINUTES) % 60 === 0
              const rowBorderClass = isHourBoundary
                ? "border-b border-slate-200/70"
                : "border-b border-slate-100/60"
              const isAlternateHour = isHourBoundary && (slot.minutes / 60) % 2 === 1
              const rowBgClass = isAlternateHour ? "bg-slate-50/40" : "bg-white"
              const now = new Date()
              const todayStr = format(now, "yyyy-MM-dd")
              const isToday = selectedDate === todayStr
              const currentMinutes = now.getHours() * 60 + now.getMinutes()
              const isCurrentHourRow = isToday && isHourBoundary && Math.floor(currentMinutes / 60) === slot.minutes / 60
              return (
                <Fragment key={`row-${slot.minutes}`}>
                  <div
                    className={`border-r border-slate-200/80 px-3 py-1.5 text-xs text-slate-500 flex items-center text-left tabular-nums font-medium ${rowBorderClass} ${rowBgClass} ${isCurrentHourRow ? "bg-amber-50/30" : ""}`}
                    style={{ height: slotHeight }}
                  >
                    {slot.showTimeLabel ? slot.label : ""}
                  </div>
                  {columns.length === 0 ? (
                    <button
                      key={`empty-${slot.minutes}`}
                      type="button"
                      onClick={(e) => {
                        setSlotActionDialog({
                          date: selectedDate,
                          time: slotMinutesToTimeString(slot.minutes),
                          staffId: null,
                          clientX: e.clientX,
                          clientY: e.clientY,
                        })
                      }}
                      className={`w-full border-r border-slate-200/80 last:border-r-0 text-left ${rowBorderClass} transition-colors duration-150 hover:bg-violet-100/90 hover:ring-1 hover:ring-violet-200/60 hover:ring-inset cursor-pointer ${rowBgClass} ${isCurrentHourRow ? "!bg-amber-50/20" : ""}`}
                      style={{ height: slotHeight, minHeight: slotHeight }}
                      title="New appointment"
                    />
                  ) : (
                    columns.map((col, colIndex) => {
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
                      const duration = draggingApt?.duration ?? 60
                      const isInDragHighlight =
                        draggingApt &&
                        (draggingApt.mode === "move" || draggingApt.mode === "resize-top") &&
                        dragHoverSlot &&
                        colIndex === dragHoverSlot.colIndex &&
                        slot.minutes >= dragHoverSlot.slotMinutes &&
                        slot.minutes < dragHoverSlot.slotMinutes + duration
                      const isDragHighlightValid =
                        isInDragHighlight &&
                        (() => {
                          for (let m = dragHoverSlot!.slotMinutes; m < dragHoverSlot!.slotMinutes + duration; m += SLOT_MINUTES) {
                            const w = !windowForStaff || (windowForStaff.enabled && m >= windowForStaff.start && m < windowForStaff.end)
                            const blocked = (blockTimesByColumn[col._id] || []).some(({ block }) => {
                              const startM = parseTimeToMinutes(block.startTime)
                              const endM = parseTimeToMinutes(block.endTime)
                              return m < endM && m + SLOT_MINUTES > startM
                            })
                            if (!w || blocked) return false
                          }
                          return true
                        })()
                      return (
                      <button
                        key={`${col._id}-${slot.minutes}`}
                        type="button"
                        onClick={(e) => {
                          if (!inWindow) return
                          setSlotActionDialog({
                            date: selectedDate,
                            time: slotMinutesToTimeString(slot.minutes),
                            staffId: col._id,
                            staffName: col.name,
                            clientX: e.clientX,
                            clientY: e.clientY,
                          })
                        }}
                        className={`w-full border-r border-slate-200/80 last:border-r-0 ${rowBorderClass} transition-colors duration-150 ${
                          isDragHighlightValid
                            ? "!bg-violet-100 ring-1 ring-violet-300 ring-inset"
                            : isInDragHighlight && !isDragHighlightValid
                            ? "!bg-red-50/80 ring-1 ring-red-200 ring-inset"
                            : inWindow
                            ? "hover:bg-violet-100/90 hover:ring-1 hover:ring-violet-200/60 hover:ring-inset cursor-pointer"
                            : "calendar-outside-hours cursor-not-allowed"
                        } ${!isInDragHighlight && inWindow ? rowBgClass : ""} ${!isInDragHighlight && inWindow && isCurrentHourRow ? "!bg-amber-50/20" : ""}`}
                        style={{ height: slotHeight, minHeight: slotHeight }}
                        title={inWindow ? `New appointment with ${col.name}` : "Unavailable (blocked or outside working hours)"}
                      />
                      );
                    })
                  )}
                </Fragment>
              )
            })}
            {/* Drag overlay - shows available/invalid slots on top when dragging */}
            {draggingApt && (draggingApt.mode === "move" || draggingApt.mode === "resize-top") && dragHoverSlot && columns.length > 0 && (() => {
              const duration = draggingApt.duration ?? 60
              const col = columns[dragHoverSlot.colIndex]
              if (!col) return null
              const windowForStaff = staffWindowsById[col._id]
              let isValid = true
              for (let m = dragHoverSlot.slotMinutes; m < dragHoverSlot.slotMinutes + duration; m += SLOT_MINUTES) {
                const w = !windowForStaff || (windowForStaff.enabled && m >= windowForStaff.start && m < windowForStaff.end)
                const blocked = (blockTimesByColumn[col._id] || []).some(({ block }) => {
                  const startM = parseTimeToMinutes(block.startTime)
                  const endM = parseTimeToMinutes(block.endTime)
                  return m < endM && m + SLOT_MINUTES > startM
                })
                if (!w || blocked) { isValid = false; break }
              }
              const slotCount = Math.ceil(duration / SLOT_MINUTES)
              const topPx = ((dragHoverSlot.slotMinutes - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
              const heightPx = slotCount * slotHeight
              const colWidth = 100 / columns.length
              const leftPct = dragHoverSlot.colIndex * colWidth
              const widthPct = colWidth
              return (
                <div
                  className="absolute top-[56px] left-[88px] right-0 bottom-0 min-w-[520px] pointer-events-none z-[100]"
                  style={{ height: totalSlotsWithSales * slotHeight }}
                >
                  <div
                    className={`absolute border-2 transition-all duration-150 ${
                      isValid ? "bg-violet-200/60 border-violet-400" : "bg-red-200/50 border-red-300"
                    }`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      top: topPx,
                      height: heightPx,
                    }}
                  />
                </div>
              )
            })()}

            {columns.length > 0 && (
              <div
                ref={blocksContainerRef}
                className="absolute top-[56px] left-[88px] right-0 bottom-0 min-w-[520px] z-[5] pointer-events-none"
                style={{ height: totalSlotsWithSales * slotHeight }}
                onClick={(e) => {
                  if (justDraggedRef.current) return
                  const target = e.target as HTMLElement
                  if (target.closest("[data-appointment-card]") || target.closest("[data-sale-card]") || target.closest("[data-block-time]")) return
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const relY = e.clientY - rect.top
                  const slotIndex = Math.floor(relY / slotHeight)
                  const slotMinutes = extendedStartMinutes + slotIndex * SLOT_MINUTES
                  if (slotMinutes < extendedStartMinutes || slotMinutes >= extendedEndMinutes) return
                  const colIndex = Math.floor((e.clientX - rect.left) / (rect.width / columns.length))
                  const col = columns[colIndex]
                  if (!col) return
                  const windowForStaff = staffWindowsById[col._id]
                  const inWorkWindow = !windowForStaff || (windowForStaff.enabled && slotMinutes >= windowForStaff.start && slotMinutes < windowForStaff.end)
                  const isBlocked = (blockTimesByColumn[col._id] || []).some(({ block }) => {
                    const startM = parseTimeToMinutes(block.startTime)
                    const endM = parseTimeToMinutes(block.endTime)
                    return slotMinutes < endM && slotMinutes + SLOT_MINUTES > startM
                  })
                  if (!inWorkWindow || isBlocked) return
                  if (onOpenAppointmentForm) {
                    onOpenAppointmentForm({ date: selectedDate, time: slotMinutesToTimeString(slotMinutes), staffId: col._id })
                  } else {
                    const params = new URLSearchParams({ date: selectedDate, time: slotMinutesToTimeString(slotMinutes), staffId: col._id })
                    router.push(`/appointments/new?form=1&${params.toString()}`)
                  }
                }}
              >
              {columns.map((col, colIndex) => {
                return (
                <div
                  key={`blocks-${col._id}`}
                  className="absolute top-0 bottom-0 w-full"
                  style={{
                    left: `${colIndex * (100 / columns.length)}%`,
                    width: `${100 / columns.length}%`,
                  }}
                >
                  {(blocksByColumnWithLayout[col._id] || []).map(({ apt, top, height, left, width }) => {
                    const a = apt as any
                    const serviceNames = getServiceDisplayNames(a)
                    const clientName = a?.clientId?.name || "Client"
                    const isDragging = draggingApt?.id === apt._id
                    const isUpdating = updatingTimeForId === apt._id
                    const canDrag = apt.status !== "cancelled" && apt.status !== "completed"
                    const baseHeight = Math.max(slotHeight * 0.6, height)
                    const resizeBottomHeight =
                      isDragging && draggingApt?.mode === "resize-bottom"
                        ? Math.max(slotHeight * 0.6, baseHeight + dragOffsetY)
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
                    const minBlockHeight = Math.max(72, resizeBottomHeight)
                    const accentColorMap: Record<string, string> = {
                      scheduled: "bg-amber-500",
                      arrived: "bg-blue-500",
                      confirmed: "bg-emerald-500",
                      service_started: "bg-violet-500",
                      completed: "bg-emerald-500",
                      cancelled: "bg-red-500",
                    }
                    const statusDotColorMap: Record<string, string> = {
                      confirmed: "bg-emerald-500",
                      scheduled: "bg-amber-400",
                      arrived: "bg-blue-500",
                      service_started: "bg-violet-500",
                      completed: "bg-emerald-500",
                      cancelled: "bg-red-500",
                    }
                    const accentColor = accentColorMap[apt.status] || "bg-slate-500"
                    const statusDotColor = statusDotColorMap[apt.status] || "bg-slate-400"
                    const endTimeStr = slotMinutesToTimeString(parseTimeToMinutes(apt.time) + getTotalDuration(apt as any))
                    const timeRangeStr = `${formatAppointmentTime(apt.time)} – ${formatAppointmentTime(endTimeStr)}`
                    return (
                      <div
                        data-appointment-card
                        key={apt._id}
                        className={`group absolute overflow-hidden text-left z-10 pointer-events-auto flex flex-col select-none animate-appointment-card-enter ${
                          isDragging
                            ? "ring-2 ring-violet-400/80 transition-none opacity-40"
                            : "transition-all duration-[180ms] ease-out hover:-translate-y-0.5"
                        } ${isUpdating ? "opacity-70" : ""}`}
                        style={{
                          top: top,
                          left: `${left}%`,
                          width: `${width}%`,
                          height: Math.max(minBlockHeight, resizeBottomHeight),
                          transform: (draggingApt?.mode === "move" || draggingApt?.mode === "resize-top") ? undefined : (transformParts.length > 0 ? transformParts.join(" ") : undefined),
                          boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.12)" : "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                        onMouseEnter={(e) => {
                          if (!isDragging) e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)"
                        }}
                        onMouseLeave={(e) => {
                          if (!isDragging) e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)"
                        }}
                      >
                        {/* 4px vertical accent strip - full height, rounded */}
                        <div
                          className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor} shrink-0`}
                          aria-hidden
                        />
                        {/* Drag handle - top */}
                        <div
                          className={`absolute top-0 left-0 right-0 z-20 h-3 flex flex-col items-center justify-center ${canDrag ? "!cursor-grab active:!cursor-grabbing hover:bg-black/[0.06]" : ""}`}
                          aria-hidden
                          onMouseDown={(e) => {
                            if (canDrag) handleResizeStart(e, apt, "resize-top")
                          }}
                          title={canDrag ? "Drag to change start time or reassign staff" : undefined}
                        >
                          {canDrag && (
                            <div className="pointer-events-none w-6 h-0.5 rounded-full bg-slate-400/50" aria-hidden />
                          )}
                        </div>
                        {/* Main card body */}
                        <div
                          className={`flex-1 pl-[14px] pr-3 pt-6 pb-4 min-h-0 overflow-hidden border ${getStatusCardFill(apt.status)} ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
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
                          title={canDrag ? "Drag to move • Click for details" : "Click to view details"}
                        >
                          {/* Status dot - 6-8px top-left */}
                          <div
                            className={`absolute top-2.5 left-[10px] h-[7px] w-[7px] rounded-full ${statusDotColor} shrink-0 ring-2 ring-white`}
                            aria-hidden
                          />
                          {/* Line 1: Customer name - 14-15px, semibold */}
                          <div className="font-semibold text-slate-800 text-[14px] truncate leading-tight pr-16">
                            {clientName}
                          </div>
                          {/* Line 2: Service name(s) - multi-staff: single service; same-staff multi: bullet list */}
                          {serviceNames.length === 1 ? (
                            <div className="text-slate-600 text-[13px] font-medium mt-1 truncate">{serviceNames[0]}</div>
                          ) : (
                            <ul className="text-slate-600 text-[13px] font-medium mt-1 list-disc list-inside space-y-0.5">
                              {serviceNames.map((name, i) => (
                                <li key={i} className="truncate">{name}</li>
                              ))}
                            </ul>
                          )}
                          {/* Line 3: Time range - 12-13px, muted, with clock icon */}
                          <div className="flex items-center gap-1.5 mt-2 text-slate-500 text-[12px] tabular-nums">
                            <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            <span>{timeRangeStr}</span>
                          </div>
                          {/* Line 4: Metadata - duration pill, secondary */}
                          <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-500 bg-slate-100/80">
                              {getTotalDuration(apt as any)} min
                            </span>
                          </div>
                          {apt.notes && (
                            <div className="text-slate-400 text-[11px] truncate mt-1.5 italic border-t border-slate-100 pt-1.5">
                              {apt.notes}
                            </div>
                          )}
                          {/* Hover quick actions - Edit & Reschedule open edit form, Cancel asks confirmation */}
                          {apt.status !== "completed" && (
                            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onOpenAppointmentForm
                                    ? onOpenAppointmentForm({ appointmentId: apt._id })
                                    : router.push(`/appointments/new?edit=${apt._id}`)
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                                title="Edit"
                              >
                                <PencilIcon className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onOpenAppointmentForm
                                    ? onOpenAppointmentForm({ appointmentId: apt._id })
                                    : router.push(`/appointments/new?edit=${apt._id}`)
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                                title="Reschedule"
                              >
                                <CalendarClock className="h-3.5 w-3.5" />
                              </button>
                              {apt.status !== "cancelled" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleCancelClick(apt._id)
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                                  title="Cancel"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Resize handle - bottom */}
                        <div
                          className={`absolute bottom-0 left-0 right-0 z-20 h-4 flex items-center justify-center bg-slate-100/80 ${canDrag ? "hover:bg-slate-200/80 cursor-n-resize active:bg-slate-300/80" : ""}`}
                          aria-hidden
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            if (canDrag) handleResizeStart(e, apt, "resize-bottom")
                          }}
                          title={canDrag ? "Drag to extend or shorten duration" : undefined}
                        >
                          {canDrag && (
                            <div className="pointer-events-none w-8 h-1 rounded-full bg-slate-400/60" aria-hidden />
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {(salesByColumnWithLayout[col._id] || []).map(({ sale, serviceItem, top, height, startM, endM, left, width }) => {
                    const serviceName = serviceItem?.name || "Service"
                    return (
                      <div
                        data-sale-card
                        key={`${sale._id}-${serviceName}-${col._id}-${startM}`}
                        className="group absolute overflow-hidden text-left flex flex-col z-10 pointer-events-auto cursor-pointer animate-appointment-card-enter transition-all duration-[180ms] ease-out hover:-translate-y-0.5"
                        style={{
                          top,
                          left: `${left}%`,
                          width: `${width}%`,
                          height: Math.max(slotHeight * 0.6, height),
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)" }}
                        onClick={() => router.push(`/billing/${sale.billNo}?mode=edit`)}
                        title={`Bill #${sale.billNo} • Click to view`}
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-400 shrink-0" aria-hidden />
                        <div className="pl-[14px] pr-3 pt-4 pb-3 flex-1 min-h-0 overflow-hidden bg-white border border-slate-200/60">
                          <div className="font-semibold text-slate-800 text-[14px] truncate leading-tight">
                            {sale.customerName}
                          </div>
                          <div className="text-slate-600 text-[13px] font-medium truncate mt-1">
                            {serviceName}
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 text-slate-500 text-[12px] tabular-nums">
                            <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            {formatAppointmentTime(slotMinutesToTimeString(startM))} – {formatAppointmentTime(slotMinutesToTimeString(endM))}
                          </div>
                          <span className="inline-block mt-2 px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-600 bg-slate-100/80">
                            Bill #{sale.billNo}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {(blockTimesByColumn[col._id] || []).map(({ block, top, height }) => {
                    const BlockReasonIcon = getBlockReasonIcon(block.title)
                    const isResizing = draggingBlock?.id === block._id
                    const isResizeTop = isResizing && draggingBlock?.mode === "resize-top"
                    const isResizeBottom = isResizing && draggingBlock?.mode === "resize-bottom"
                    const displayHeight =
                      isResizeBottom
                        ? Math.max(slotHeight * 0.6, height + blockResizeOffsetY)
                        : isResizeTop
                        ? Math.max(slotHeight * 0.6, height - blockResizeOffsetY)
                        : Math.max(slotHeight * 0.6, height)
                    const displayTop = isResizeTop ? top + blockResizeOffsetY : top
                    const isUpdating = updatingBlockForId === block._id
                    return (
                      <div
                        data-block-time
                        key={block._id}
                        className={`absolute left-0 right-0 shadow-sm border overflow-hidden text-left bg-red-50 border-red-200 flex flex-col z-10 pointer-events-auto transition-opacity ${isResizing ? "ring-2 ring-red-400/80 opacity-90" : ""} ${isUpdating ? "opacity-70" : ""}`}
                        style={{
                          top: displayTop,
                          height: displayHeight,
                        }}
                        title={`${block.title} – Click for options`}
                      >
                        {/* Top resize handle */}
                        <div
                          className="absolute top-0 left-0 right-0 z-20 h-2.5 flex flex-col items-center justify-center cursor-n-resize hover:bg-red-200/40 active:bg-red-200/60"
                          aria-hidden
                          onMouseDown={(e) => handleBlockResizeStart(e, block, "resize-top")}
                          title="Drag to change start time"
                        >
                          <div className="pointer-events-none w-5 h-0.5 rounded-full bg-red-400/60" aria-hidden />
                        </div>
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 shrink-0" aria-hidden />
                        <button
                          type="button"
                          className="flex items-stretch flex-1 min-w-0 pt-6 pb-2 cursor-pointer hover:bg-red-100/50 transition-colors text-left border-0 bg-transparent w-full"
                          onClick={(e) => {
                            e.stopPropagation()
                            setBlockContextMenu({ block, clientX: e.clientX, clientY: e.clientY })
                          }}
                        >
                          <div className="pl-4 pr-2 pt-0 text-xs overflow-hidden text-left flex-1 min-w-0">
                            <div className="font-medium text-red-800 truncate">{block.title}</div>
                            <div className="text-red-600 text-[10px] tabular-nums mt-0.5">
                              {format(new Date(2000, 0, 1, Math.floor(parseTimeToMinutes(block.startTime) / 60), parseTimeToMinutes(block.startTime) % 60), "h:mma").toLowerCase()}
                              – {format(new Date(2000, 0, 1, Math.floor(parseTimeToMinutes(block.endTime) / 60), parseTimeToMinutes(block.endTime) % 60), "h:mma").toLowerCase()}
                            </div>
                          </div>
                          <div className="flex items-center justify-center pr-3 shrink-0">
                            <BlockReasonIcon className="h-8 w-8 text-red-400/80" />
                          </div>
                        </button>
                        {/* Bottom resize handle */}
                        <div
                          className="absolute bottom-0 left-0 right-0 z-20 h-2.5 flex flex-col items-center justify-center cursor-s-resize hover:bg-red-200/40 active:bg-red-200/60"
                          aria-hidden
                          onMouseDown={(e) => handleBlockResizeStart(e, block, "resize-bottom")}
                          title="Drag to change duration"
                        >
                          <div className="w-5 h-0.5 rounded-full bg-red-400/60" aria-hidden />
                        </div>
                      </div>
                    )
                  })}
                </div>
              );
              })}
              </div>
            )}
            {/* Section 3: Current time indicator - glowing dot, Now label, pulse */}
            {(() => {
              const todayStr = format(new Date(), "yyyy-MM-dd")
              const isTodayView = selectedDate === todayStr
              const currentMinutes =
                currentTime.getHours() * 60 +
                currentTime.getMinutes() +
                currentTime.getSeconds() / 60
              const showLine =
                isTodayView &&
                currentMinutes >= extendedStartMinutes &&
                currentMinutes < extendedEndMinutes
              if (!showLine) return null
              const topPx =
                56 +
                ((currentMinutes - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
              return (
                <div
                  className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                  style={{ top: topPx }}
                  aria-hidden
                >
                  <div className="flex-shrink-0 w-[88px] flex items-center justify-end pr-2">
                    <span className="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-semibold tabular-nums">
                      {format(currentTime, "h:mm a")}
                    </span>
                  </div>
                  <div className="flex-1 h-0.5 bg-red-500/90 min-w-0 shadow-[0_0_6px_rgba(239,68,68,0.3)]" />
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Drag preview - follows cursor when dragging, rendered in portal to avoid overflow clipping */}
      {draggingApt && dragStartRect && typeof document !== "undefined" && (draggingApt.mode === "move" || draggingApt.mode === "resize-top") && (() => {
        const apt = appointments.find((a) => a._id === draggingApt.id)
        if (!apt) return null
        const a = apt as any
        const serviceNames = getServiceDisplayNames(a)
        const clientName = a?.clientId?.name || "Client"
        const accentColorMap: Record<string, string> = {
          scheduled: "bg-amber-500", arrived: "bg-blue-500", confirmed: "bg-emerald-500",
          service_started: "bg-violet-500", completed: "bg-slate-400", cancelled: "bg-red-500",
        }
        const accentColor = accentColorMap[apt.status] || "bg-slate-500"
        const endTimeStr = slotMinutesToTimeString(parseTimeToMinutes(apt.time) + getTotalDuration(a))
        const timeRangeStr = `${formatAppointmentTime(apt.time)} – ${formatAppointmentTime(endTimeStr)}`
        return createPortal(
          <div
            className="fixed z-[9999] overflow-hidden shadow-xl border border-slate-200/80 bg-white pointer-events-none cursor-grabbing"
            style={{
              left: dragStartRect.left + dragOffsetX,
              top: dragStartRect.top + dragOffsetY,
              width: dragStartRect.width,
              height: dragStartRect.height,
            }}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor}`} />
            <div className="pl-[14px] pr-3 pt-6 pb-3 h-full flex flex-col justify-center">
              <div className="font-semibold text-slate-800 text-[14px] truncate">{clientName}</div>
              {serviceNames.length === 1 ? (
                <div className="text-slate-600 text-[13px] font-medium mt-1 truncate">{serviceNames[0]}</div>
              ) : (
                <ul className="text-slate-600 text-[13px] font-medium mt-1 list-disc list-inside space-y-0.5">
                  {serviceNames.map((name, i) => <li key={i} className="truncate">{name}</li>)}
                </ul>
              )}
              <div className="flex items-center gap-1.5 mt-2 text-slate-500 text-[12px]">
                <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span>{timeRangeStr}</span>
              </div>
              <span className="inline-flex mt-2 px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-500 bg-slate-100/80 w-fit">
                {getTotalDuration(a)} min
              </span>
            </div>
          </div>,
          document.body
        )
      })()}

      <BlockTimeModal
        open={blockTimeModalOpen}
        onOpenChange={setBlockTimeModalOpen}
        initialDate={blockTimeModalData?.date ?? ""}
        initialTime={blockTimeModalData?.time ?? ""}
        initialStaffId={blockTimeModalData?.staffId ?? null}
        initialStaffName={blockTimeModalData?.staffName}
        staffOptions={staffWithScheduling}
        onSuccess={() => setBlockTimesRefreshKey((k) => k + 1)}
      />

      {blockContextMenu &&
        createPortal(
          <div
            className="fixed inset-0 z-50"
            onClick={() => setBlockContextMenu(null)}
            aria-hidden
          >
            <div className="absolute inset-0 bg-transparent" />
            <div
              className="absolute z-10 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              style={{
                left: blockContextMenu.clientX,
                top: blockContextMenu.clientY + 8,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                onClick={() => {
                  handleDeleteBlockTime(blockContextMenu.block)
                  setBlockContextMenu(null)
                }}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                Delete Blocked Time
              </button>
            </div>
          </div>,
          document.body
        )}

      {slotActionDialog &&
        createPortal(
          <div
            className="fixed inset-0 z-50"
            onClick={() => setSlotActionDialog(null)}
            aria-hidden
          >
            <div className="absolute inset-0 bg-black/10" />
            <div
              className="absolute z-10 min-w-[320px] rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xl"
              style={{
                left: slotActionDialog.clientX,
                top: slotActionDialog.clientY,
                transform: slotActionDialog.clientY >= 240
                  ? "translate(8px, -100%) translateY(-8px)"
                  : "translate(8px, 8px)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-center text-lg font-semibold pb-2 whitespace-nowrap">What would you like to add at {slotActionDialog.time}?</h3>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="justify-start gap-3 h-12 text-left"
                  onClick={() => {
                    if (onOpenAppointmentForm) {
                      onOpenAppointmentForm({
                        date: slotActionDialog.date,
                        time: slotActionDialog.time,
                        staffId: slotActionDialog.staffId ?? undefined,
                      })
                    } else {
                      const params = new URLSearchParams({
                        date: slotActionDialog.date,
                        time: slotActionDialog.time,
                      })
                      if (slotActionDialog.staffId) params.set("staffId", slotActionDialog.staffId)
                      router.push(`/appointments/new?${params.toString()}`)
                    }
                    setSlotActionDialog(null)
                  }}
                >
                  <CalendarPlus className="h-5 w-5 shrink-0 text-emerald-600" />
                  New Appointment
                </Button>
                <Button
                  variant="outline"
                  className="justify-start gap-3 h-12 text-left"
                  onClick={() => {
                    setBlockTimeModalData({
                      date: slotActionDialog.date,
                      time: slotActionDialog.time,
                      staffId: slotActionDialog.staffId,
                      staffName: slotActionDialog.staffName,
                    })
                    setSlotActionDialog(null)
                    setBlockTimeModalOpen(true)
                  }}
                >
                  <CalendarClock className="h-5 w-5 shrink-0 text-amber-600" />
                  Block Time
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

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
                const serviceNames = getServiceDisplayNames(a)
                const clientName = a?.clientId?.name || "Client"
                const staffName = getPrimaryStaffName(selectedAppointment)
                const duration = getTotalDuration(a)
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
                        {serviceNames.length === 1 ? (
                          <div className="font-medium">{serviceNames[0]}</div>
                        ) : (
                          <ul className="font-medium list-disc list-inside space-y-0.5">
                            {serviceNames.map((name, i) => <li key={i}>{name}</li>)}
                          </ul>
                        )}
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
                        <div className="text-muted-foreground text-xs">Total Duration</div>
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
                {selectedAppointment?.status === "completed" ? (
                  <>
                    <div className="flex items-center gap-2 shrink-0">
                      {linkedSale?._id && (
                        <Button
                          variant="destructive"
                          onClick={handleDeleteInvoiceClick}
                          disabled={deletingInvoice}
                          className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                        >
                          {deletingInvoice ? "Deleting..." : "Delete Invoice"}
                        </Button>
                      )}
                      {linkedSale && (linkedSale.billNo || linkedSale.receiptNumber) && (
                        <Button
                          variant="outline"
                          asChild
                          className="shrink-0"
                        >
                          <Link
                            href={`/receipt/${linkedSale.billNo || linkedSale.receiptNumber}?returnTo=appointments`}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Invoice
                          </Link>
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
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
                        onClick={() => {
                          if (selectedAppointment) {
                            setShowDetails(false)
                            onOpenAppointmentForm
                              ? onOpenAppointmentForm({ appointmentId: selectedAppointment._id })
                              : router.push(`/appointments/new?edit=${selectedAppointment._id}`)
                          }
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        onClick={() => {
                          if (!selectedAppointment) return
                          const a = selectedAppointment as any
                          const staffId = a.staffId?._id || a.staffId
                          const staffName = a.staffId?.name || ""
                          let services: Array<{ serviceId: string; staffId: string; staffName: string; price: number }> = []
                          if (a.bookingGroupId) {
                            const groupApts = appointments.filter(
                              (apt) =>
                                (apt as Appointment).bookingGroupId === a.bookingGroupId &&
                                (apt as any).status !== "cancelled"
                            )
                            for (const apt of groupApts) {
                              const svc = (apt as any).serviceId
                              const sid = (apt as any).staffId?._id || (apt as any).staffId
                              const sname = (apt as any).staffId?.name || ""
                              services.push({
                                serviceId: svc?._id || svc,
                                staffId: sid || "",
                                staffName: sname,
                                price: (apt as any).price ?? (typeof svc === "object" && svc?.price) ?? 0,
                              })
                            }
                          } else if (a.additionalServices && a.additionalServices.length > 0) {
                            const primary = a.serviceId
                            services.push({
                              serviceId: primary?._id || primary,
                              staffId: staffId || "",
                              staffName,
                              price: (typeof primary === "object" && primary?.price) ?? a.price ?? 0,
                            })
                            for (const s of a.additionalServices) {
                              services.push({
                                serviceId: s._id || s,
                                staffId: staffId || "",
                                staffName,
                                price: s.price ?? 0,
                              })
                            }
                          } else {
                            services = [{
                              serviceId: a.serviceId?._id || a.serviceId,
                              staffId: staffId || "",
                              staffName,
                              price: a.price ?? (typeof a.serviceId === "object" && a.serviceId?.price) ?? 0,
                            }]
                          }
                          const appointmentData = {
                            appointmentId: a._id,
                            clientId: a.clientId?._id || a.clientId,
                            clientName: a.clientId?.name || "",
                            date: a.date,
                            time: a.time,
                            services: services.length > 0 ? services : undefined,
                            serviceId: services.length === 1 ? services[0].serviceId : undefined,
                            serviceName: a.serviceId?.name || "",
                            servicePrice: a.price || 0,
                            serviceDuration: a.duration || 0,
                            staffId: staffId || "",
                            staffName,
                          }
                          setShowDetails(false)
                          router.push(`/quick-sale?appointment=${btoa(JSON.stringify(appointmentData))}`)
                        }}
                      >
                        Raise Sale
                      </Button>
                    </div>
                  </>
                )}
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
                  const serviceNames = getServiceDisplayNames(a)
                  const clientName = a?.clientId?.name || "Client"
                  const clientInitial = clientName?.charAt?.(0) || "?"
                  const staffName = a?.staffId?.name || "Unassigned Staff"
                  const price = a?.price ?? 0
                  const duration = getTotalDuration(a)
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
                          {serviceNames.length === 1 ? (
                            <div className="font-semibold text-slate-800 text-lg">{serviceNames[0]}</div>
                          ) : (
                            <ul className="font-semibold text-slate-800 text-lg list-disc list-inside space-y-0.5">
                              {serviceNames.map((name, i) => <li key={i}>{name}</li>)}
                            </ul>
                          )}
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
                  const serviceNames = getServiceDisplayNames(a)
                  const clientName = a?.clientId?.name || "Client"
                  const clientInitial = clientName?.charAt?.(0) || "?"
                  const staffName = a?.staffId?.name || "Unassigned Staff"
                  const price = a?.price ?? 0
                  const duration = getTotalDuration(a)
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
                          {serviceNames.length === 1 ? (
                            <div className="font-semibold text-slate-800 text-lg line-through opacity-75">{serviceNames[0]}</div>
                          ) : (
                            <ul className="font-semibold text-slate-800 text-lg line-through opacity-75 list-disc list-inside space-y-0.5">
                              {serviceNames.map((name, i) => <li key={i}>{name}</li>)}
                            </ul>
                          )}
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
          <div className="flex gap-3 justify-end flex-nowrap">
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
                "Cancel"
              )}
            </Button>
            {hasMultipleInGroup && (
              <Button
                variant="destructive"
                onClick={confirmCancelAllAppointments}
                disabled={cancelling}
                className="bg-red-700 hover:bg-red-800 text-white"
              >
                Cancel All
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteInvoiceConfirm} onOpenChange={(open) => {
          setShowDeleteInvoiceConfirm(open)
          if (!open) setDeleteInvoiceReason("")
        }}>
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
            <DialogTitle className="text-xl font-bold text-slate-900">Delete Invoice</DialogTitle>
            <DialogDescription className="text-slate-600 mt-2">
              This will delete the invoice and the appointment. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="delete-invoice-reason" className="block text-sm font-medium text-slate-700 mb-1.5">
                Reason for deletion <span className="text-red-500">*</span>
              </label>
              <textarea
                id="delete-invoice-reason"
                value={deleteInvoiceReason}
                onChange={(e) => setDeleteInvoiceReason(e.target.value)}
                placeholder="Enter reason for deleting this invoice..."
                className="w-full min-h-[80px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 resize-none"
                disabled={deletingInvoice}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => { setShowDeleteInvoiceConfirm(false); setDeleteInvoiceReason("") }}
              disabled={deletingInvoice}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Keep Invoice
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteInvoice}
              disabled={deletingInvoice || !deleteInvoiceReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingInvoice ? (
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
                  Deleting...
                </>
              ) : (
                "Yes, Delete Invoice"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})

AppointmentsCalendarGrid.displayName = "AppointmentsCalendarGrid"
