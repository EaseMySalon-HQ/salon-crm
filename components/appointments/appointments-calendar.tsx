"use client"

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useMemo, Fragment } from "react"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { addDays, format, subDays } from "date-fns"
import { Pencil, Eye, Heart, PlusCircle, Receipt } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ListSkeleton } from "@/components/loading"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppointmentsAPI, SalesAPI, StaffDirectoryAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import {
  appointmentsCalendarRangeKey,
  getAppointmentsCalendarRange,
  useAppointmentsCalendarRange,
} from "@/lib/queries/appointments"
import { invalidateAppointments } from "@/lib/queries/invalidate"
import { resolveCreatedByDisplay } from "@/lib/utils"
import {
  getServiceDisplayNames,
  getAppointmentTotalDurationList as getTotalDuration,
  getBookingGroupSiblings,
  collectSaleLinesFromAppointmentCard,
  buildRaiseSaleAppointmentPayload,
  isHiddenAppointment,
  collectPartialPaymentAppointmentIdsFromSales,
  getCalendarCardVisualStatus,
  getAppointmentCalendarOpenIntent,
  toMongoIdString,
  APPOINTMENT_CARD_CONTEXT_STATUS_OPTIONS,
  canChangeAppointmentStatusViaContextMenu,
  getAppointmentIdsForCardStatusUpdate,
  appointmentsOnSameVisitDate,
  type AppointmentCardContextStatus,
} from "@/lib/appointment-calendar-helpers"
import {
  RaiseSaleConfirmationModal,
  type RaiseSaleConfirmationResult,
} from "@/components/appointments/raise-sale-confirmation-modal"

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
  status:
    | "scheduled"
    | "confirmed"
    | "arrived"
    | "service_started"
    | "completed"
    | "cancelled"
    | "cancelled_at_billing"
    | "missed"
  notes?: string
  price: number
  createdAt: string
  createdBy?: string
  leadSource?: string
  bookingGroupId?: string | null
  prepaidAtBooking?: boolean
  /** Client preference: keep this stylist */
  staffLocked?: boolean
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

function slotMinutesToTimeString(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return format(new Date(2000, 0, 1, h, m), "h:mm a")
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

function getPrimaryStaffId(apt: Appointment): string | null {
  const a = apt as any
  if (a.staffId) {
    const raw = typeof a.staffId === "object" && a.staffId?._id != null ? a.staffId._id : a.staffId
    const sid = raw != null ? toMongoIdString(raw) : ""
    if (sid) return sid
  }
  if (a.staffAssignments?.length) {
    const primary = a.staffAssignments.find((s: any) => s.role === "primary")
    const first = a.staffAssignments[0]
    const assignment = primary || first
    const s = assignment?.staffId
    const raw = typeof s === "object" && s?._id != null ? s._id : s
    const sid = raw != null ? toMongoIdString(raw) : ""
    return sid || null
  }
  return null
}

interface StaffMember {
  _id: string
  name: string
  email?: string
  role?: string
  allowAppointmentScheduling?: boolean
}

interface AppointmentsCalendarProps {
  onShowCancelled?: () => void
  initialAppointmentId?: string
  onOpenAppointmentForm?: (params?: {
    date?: string
    time?: string
    staffId?: string
    appointmentId?: string
    openCheckoutDirectly?: boolean
  }) => void
  view?: "list" | "calendar"
  onSwitchView?: (v: "list" | "calendar") => void
}

export const AppointmentsCalendar = forwardRef<
  { showCancelledModal: () => void; showUpcomingModal: () => void },
  AppointmentsCalendarProps
>(({ onShowCancelled, initialAppointmentId, onOpenAppointmentForm, view = "list", onSwitchView }, ref) => {
  const { user, hasPermission } = useAuth()
  const canCreateAppointment = hasPermission("appointments", "create")
  const canQuickSale = hasPermission("sales", "create")
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [currentDate, setCurrentDate] = useState(new Date())
  const { data: appointments = [], isLoading: loading } =
    useAppointmentsCalendarRange(currentDate ?? new Date())
  const { dateFrom, dateTo } = useMemo(
    () => getAppointmentsCalendarRange(currentDate ?? new Date()),
    [currentDate],
  )
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const appointmentsQueryKey = useMemo(
    () => appointmentsCalendarRangeKey(branchKey, dateFrom, dateTo),
    [branchKey, dateFrom, dateTo],
  )
  const updateAppointmentsCache = useCallback(
    (updater: (prev: Appointment[]) => Appointment[]) => {
      queryClient.setQueryData(appointmentsQueryKey, (prev: Appointment[] | undefined) =>
        updater(prev || []),
      )
    },
    [queryClient, appointmentsQueryKey],
  )
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [staffFilter, setStaffFilter] = useState<string | null>(null)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(initialAppointmentId ?? null)

  useEffect(() => {
    setPendingAppointmentId(initialAppointmentId ?? null)
  }, [initialAppointmentId])
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [cancelling, setCancelling] = useState(false)
  const [showDeleteInvoiceConfirm, setShowDeleteInvoiceConfirm] = useState(false)
  const [deleteInvoiceReason, setDeleteInvoiceReason] = useState('')
  const [deletingInvoice, setDeletingInvoice] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [cardStatusMenuUpdatingId, setCardStatusMenuUpdatingId] = useState<string | null>(null)
  const [showCancelledModal, setShowCancelledModal] = useState(false)
  const [showUpcomingModal, setShowUpcomingModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [appointmentToCancel, setAppointmentToCancel] = useState<string | null>(null)
  // Per-service "Raise Sale" confirmation modal — opens only for multi-service bookings.
  const [showRaiseSaleModal, setShowRaiseSaleModal] = useState(false)
  const [raiseSaleAnchor, setRaiseSaleAnchor] = useState<Appointment | null>(null)
  const [raiseSaleSiblings, setRaiseSaleSiblings] = useState<Appointment[]>([])
  const [draggingAppointmentId, setDraggingAppointmentId] = useState<string | null>(null)
  const [hoveredBookingGroupId, setHoveredBookingGroupId] = useState<string | null>(null)
  const hoveredBookingGroupClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelClearBookingGroupHover = useCallback(() => {
    if (hoveredBookingGroupClearRef.current) {
      clearTimeout(hoveredBookingGroupClearRef.current)
      hoveredBookingGroupClearRef.current = null
    }
  }, [])
  const scheduleClearBookingGroupHover = useCallback(() => {
    if (hoveredBookingGroupClearRef.current) clearTimeout(hoveredBookingGroupClearRef.current)
    hoveredBookingGroupClearRef.current = setTimeout(() => {
      setHoveredBookingGroupId(null)
      hoveredBookingGroupClearRef.current = null
    }, 450)
  }, [])
  useEffect(() => {
    return () => {
      if (hoveredBookingGroupClearRef.current) clearTimeout(hoveredBookingGroupClearRef.current)
    }
  }, [])
  const [dropTargetColumn, setDropTargetColumn] = useState<string | null>(null)
  const [updatingFromDrop, setUpdatingFromDrop] = useState(false)
  const [justDropped, setJustDropped] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const date = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${date}`
  })
  const [linkedSale, setLinkedSale] = useState<any | null>(null)
  /** Same-day partial-payment sale linkage (list cards + open intent). */
  const [partialPaymentAppointmentIds, setPartialPaymentAppointmentIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!selectedAppointment?._id) {
      setLinkedSale(null)
      return
    }
    let cancelled = false
    const a = selectedAppointment as any
    const idsToTry: string[] = a.bookingGroupId
      ? appointments
          .filter((apt) => apt.bookingGroupId === a.bookingGroupId)
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

  const openAppointmentFromListCard = useCallback(
    (apt: Appointment) => {
      setSelectedAppointment(apt)
      const intent = getAppointmentCalendarOpenIntent(apt, partialPaymentAppointmentIds)
      if (intent.type === "edit_form") {
        if (onOpenAppointmentForm) {
          onOpenAppointmentForm({ appointmentId: intent.appointmentId })
        } else {
          setShowDetails(true)
        }
        return
      }
      setShowDetails(true)
    },
    [onOpenAppointmentForm, partialPaymentAppointmentIds]
  )

  useImperativeHandle(ref, () => ({
    showCancelledModal: () => setShowCancelledModal(true),
    showUpcomingModal: () => setShowUpcomingModal(true),
  }))

  const staffWithScheduling = useMemo(
    () => staffList.filter((s) => s.allowAppointmentScheduling !== false),
    [staffList]
  )

  // Multi-card booking groups: stable color per bookingGroupId so service cards belonging to one
  // logical booking are visually linked across the Kanban board.
  const groupAccents = useMemo(() => {
    const palette = [
      "ring-rose-300/70",
      "ring-amber-300/70",
      "ring-emerald-300/70",
      "ring-sky-300/70",
      "ring-violet-300/70",
      "ring-pink-300/70",
      "ring-teal-300/70",
      "ring-indigo-300/70",
    ]
    const counts = new Map<string, number>()
    appointments.forEach((apt) => {
      const gid = (apt as any).bookingGroupId
      if (!gid) return
      counts.set(gid, (counts.get(gid) || 0) + 1)
    })
    const colorByGroup = new Map<string, string>()
    let idx = 0
    counts.forEach((cnt, gid) => {
      if (cnt > 1) {
        colorByGroup.set(gid, palette[idx % palette.length])
        idx += 1
      }
    })
    return colorByGroup
  }, [appointments])

  const dayChips = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const arr: Date[] = []
    for (let i = -1; i <= 3; i++) {
      arr.push(addDays(today, i))
    }
    return arr
  }, [])

  const reloadPartialSalesForSelectedDay = useCallback(async () => {
    if (!selectedDate) return
    try {
      const sales = await SalesAPI.getAllMergePages({
        dateFrom: selectedDate,
        dateTo: selectedDate,
        batchSize: 400,
      })
      if (Array.isArray(sales)) {
        setPartialPaymentAppointmentIds(collectPartialPaymentAppointmentIdsFromSales(sales))
      } else {
        setPartialPaymentAppointmentIds(new Set())
      }
    } catch {
      setPartialPaymentAppointmentIds(new Set())
    }
  }, [selectedDate])

  useEffect(() => {
    void reloadPartialSalesForSelectedDay()
  }, [reloadPartialSalesForSelectedDay])

  // Fetch staff list for filter
  useEffect(() => {
    let cancelled = false
    StaffDirectoryAPI.getAll().then((res) => {
      if (!cancelled && res?.data?.length) setStaffList(res.data)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const handler = () => {
      invalidateAppointments(queryClient)
      void reloadPartialSalesForSelectedDay()
    }
    window.addEventListener("appointments-refresh", handler)
    return () => window.removeEventListener("appointments-refresh", handler)
  }, [queryClient, reloadPartialSalesForSelectedDay])

  const getAppointmentsForDate = (date: Date) => {
    const dateString = format(date, "yyyy-MM-dd")
    return appointments.filter((appointment) => {
      if (!appointment?.date) return false
      const normalized = appointment.date.length >= 10 ? appointment.date.slice(0, 10) : appointment.date
      return normalized === dateString
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-slate-500"
      case "confirmed":
        return "bg-cyan-500"
      case "arrived":
        return "bg-blue-500"
      case "partial_payment":
        return "bg-amber-500"
      case "service_started":
        return "bg-indigo-500"
      case "completed":
        return "bg-emerald-500"
      case "missed":
        return "bg-rose-600"
      case "cancelled":
        return "bg-red-500"
      case "cancelled_at_billing":
        return "bg-zinc-500"
      default:
        return "bg-slate-400"
    }
  }

  const getStatusCardFill = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-slate-100 border-slate-300 hover:bg-slate-200/80"
      case "confirmed":
        return "bg-cyan-100 border-cyan-300 hover:bg-cyan-200/80"
      case "arrived":
        return "bg-blue-100 border-blue-300 hover:bg-blue-200/80"
      case "partial_payment":
        return "bg-amber-100 border-amber-300 hover:bg-amber-200/80"
      case "service_started":
        return "bg-indigo-100 border-indigo-300 hover:bg-indigo-200/80"
      case "completed":
        return "bg-emerald-100 border-emerald-300 hover:bg-emerald-200/80"
      case "missed":
        return "bg-rose-100 border-rose-300 hover:bg-rose-200/80"
      case "cancelled":
        return "bg-red-100 border-red-300 hover:bg-red-200/80"
      case "cancelled_at_billing":
        return "bg-zinc-100 border-zinc-300 hover:bg-zinc-200/80"
      default:
        return "bg-slate-100 border-slate-300 hover:bg-slate-200/80"
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-slate-100 text-slate-800 border border-slate-300"
      case "confirmed":
        return "bg-cyan-100 text-cyan-900 border border-cyan-300"
      case "arrived":
        return "bg-blue-100 text-blue-900 border border-blue-300"
      case "partial_payment":
        return "bg-amber-100 text-amber-900 border border-amber-300"
      case "service_started":
        return "bg-indigo-100 text-indigo-900 border border-indigo-300"
      case "completed":
        return "bg-emerald-100 text-emerald-800 border border-emerald-300"
      case "missed":
        return "bg-rose-100 text-rose-900 border border-rose-300"
      case "cancelled":
        return "bg-red-100 text-red-800 border border-red-300"
      case "cancelled_at_billing":
        return "bg-zinc-100 text-zinc-800 border border-zinc-300"
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "scheduled":
        return "Scheduled"
      case "confirmed":
        return "Confirmed"
      case "arrived":
        return "Arrived"
      case "partial_payment":
        return "Partial payment"
      case "service_started":
        return "Service Started"
      case "completed":
        return "Completed"
      case "missed":
        return "No show"
      case "cancelled":
        return "Cancelled"
      case "cancelled_at_billing":
        return "Cancelled at billing"
      default:
        return status
    }
  }

  const toggleDayExpansion = (day: Date) => {
    const dayKey = day.toISOString().split('T')[0]
    setExpandedDays(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dayKey)) {
        newSet.delete(dayKey)
      } else {
        newSet.add(dayKey)
      }
      return newSet
    })
  }

  const matchesStaffFilter = (apt: Appointment) => {
    if (!staffFilter) return true
    return getPrimaryStaffId(apt) === staffFilter
  }

  const getSelectedDateAppointments = () => {
    return appointments
      .filter(apt => {
        const aptDate = new Date(apt.date)
        const year = aptDate.getFullYear()
        const month = String(aptDate.getMonth() + 1).padStart(2, '0')
        const date = String(aptDate.getDate()).padStart(2, '0')
        const aptDateString = `${year}-${month}-${date}`
        return aptDateString === selectedDate && !isHiddenAppointment(apt) && matchesStaffFilter(apt)
      })
      .sort((a, b) => {
        const timeA = a.time || '00:00'
        const timeB = b.time || '00:00'
        return timeA.localeCompare(timeB)
      })
  }

  useEffect(() => {
    if (!pendingAppointmentId || appointments.length === 0) return
    const match = appointments.find((apt) => apt._id === pendingAppointmentId)
    if (!match) return

    setSelectedAppointment(match)

    if (match.date) {
      const matchDate = new Date(match.date)
      const year = matchDate.getFullYear()
      const month = String(matchDate.getMonth() + 1).padStart(2, '0')
      const day = String(matchDate.getDate()).padStart(2, '0')
      setSelectedDate(`${year}-${month}-${day}`)
      setCurrentDate(matchDate)
    }

    const intent = getAppointmentCalendarOpenIntent(match, partialPaymentAppointmentIds)
    if (intent.type === "edit_form") {
      if (onOpenAppointmentForm) {
        onOpenAppointmentForm({ appointmentId: intent.appointmentId })
      } else {
        setShowDetails(true)
      }
    } else {
      setShowDetails(true)
    }

    setPendingAppointmentId(null)
  }, [pendingAppointmentId, appointments, onOpenAppointmentForm, partialPaymentAppointmentIds])

  const isAppointmentOnSelectedDate = (apt: Appointment) => {
    const aptNorm = apt.date?.length >= 10 ? apt.date.slice(0, 10) : apt.date
    return aptNorm === selectedDate
  }

  // First column: only scheduled (no arrived, service_started, completed, cancelled)
  const getSelectedDateAppointmentsForColumns = () => {
    return appointments
      .filter(apt => isAppointmentOnSelectedDate(apt) && apt.status === 'scheduled' && matchesStaffFilter(apt))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  const getConfirmedAppointments = () => {
    return appointments
      .filter(
        (apt) => isAppointmentOnSelectedDate(apt) && apt.status === "confirmed" && matchesStaffFilter(apt)
      )
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
  }

  const getArrivedAppointments = () => {
    return appointments
      .filter((apt) => isAppointmentOnSelectedDate(apt) && apt.status === "arrived" && matchesStaffFilter(apt))
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
  }

  const getMissedAppointments = () => {
    return appointments
      .filter((apt) => isAppointmentOnSelectedDate(apt) && apt.status === "missed" && matchesStaffFilter(apt))
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
  }

  const getServiceStartedAppointments = () => {
    return appointments
      .filter(apt => isAppointmentOnSelectedDate(apt) && apt.status === 'service_started' && matchesStaffFilter(apt))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  const getCompletedAppointments = () => {
    return appointments
      .filter(apt => isAppointmentOnSelectedDate(apt) && apt.status === 'completed' && matchesStaffFilter(apt))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  const getCancelledAppointmentsForDate = () => {
    return appointments
      .filter(apt => isAppointmentOnSelectedDate(apt) && apt.status === 'cancelled' && matchesStaffFilter(apt))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  const getUpcomingAppointments = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return appointments
      .filter(apt => {
        const aptDate = new Date(apt.date)
        aptDate.setHours(0, 0, 0, 0)
        return aptDate >= today && !isHiddenAppointment(apt) && matchesStaffFilter(apt)
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }

  const getCancelledAppointments = () => {
    return appointments
      .filter(apt => apt.status === 'cancelled')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  const selectedDateLabel = selectedDate ? format(new Date(selectedDate + 'T12:00:00'), 'EEE, MMM d, yyyy') : ''

  const handleCancelClick = (appointmentId: string) => {
    setAppointmentToCancel(appointmentId)
    setShowCancelConfirm(true)
  }

  const aptToCancel = appointmentToCancel ? appointments.find((a) => a._id === appointmentToCancel) : null
  const hasMultipleInGroup = aptToCancel?.bookingGroupId
    ? appointments.filter((a) => a.bookingGroupId === aptToCancel.bookingGroupId).length > 1
    : false
  const groupIdsToCancel = hasMultipleInGroup && aptToCancel?.bookingGroupId
    ? appointments
        .filter((a) => a.bookingGroupId === aptToCancel.bookingGroupId)
        .map((a) => a._id)
    : []

  const confirmCancelAppointment = async () => {
    if (!appointmentToCancel) return

    setCancelling(true)
    try {
      const response = await AppointmentsAPI.update(appointmentToCancel, { status: 'cancelled' })
      if (response.success) {
        invalidateAppointments(queryClient)
        setShowDetails(false)
        setShowCancelConfirm(false)
        setAppointmentToCancel(null)
        alert('Appointment cancelled successfully')
      } else {
        alert('Failed to cancel appointment. Please try again.')
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error)
      alert('Failed to cancel appointment. Please try again.')
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
        const res = await AppointmentsAPI.update(id, { status: 'cancelled' })
        if (!res?.success) allSuccess = false
      }
      if (allSuccess) {
        invalidateAppointments(queryClient)
        setShowDetails(false)
        setShowCancelConfirm(false)
        setAppointmentToCancel(null)
        alert('All appointments cancelled successfully')
      } else {
        alert('Failed to cancel some appointments. Please try again.')
      }
    } catch (error) {
      console.error('Error cancelling appointments:', error)
      alert('Failed to cancel appointments. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  const cancelCancelAppointment = () => {
    setShowCancelConfirm(false)
    setAppointmentToCancel(null)
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
        alert('Failed to delete invoice. Please try again.')
        return
      }
      // Linked appointment rows are deleted server-side with the invoice so the calendar stays in sync everywhere (Reports delete, calendar delete, …).
      setLinkedSale(null)
      setShowDetails(false)
      setShowDeleteInvoiceConfirm(false)
      setDeleteInvoiceReason('')
      invalidateAppointments(queryClient)
      alert(saleRes?.message || 'Invoice and appointment(s) deleted successfully.')
    } catch (e) {
      console.error(e)
      alert('Failed to delete invoice. Please try again.')
    } finally {
      setDeletingInvoice(false)
    }
  }

  const handleMarkStatus = async (newStatus: 'arrived' | 'service_started' | 'completed' | 'missed') => {
    if (!selectedAppointment) return
    setUpdatingStatus(true)
    try {
      const res = await AppointmentsAPI.update(selectedAppointment._id, { status: newStatus })
      if (res?.success) {
        const bgId = (selectedAppointment as any).bookingGroupId
        const syncGroup = newStatus === 'arrived' || newStatus === 'missed'
        const list = appointments.map((a: any) => {
          if (a._id === selectedAppointment._id) return { ...a, status: newStatus }
          if (syncGroup && bgId && a.bookingGroupId === bgId && appointmentsOnSameVisitDate(a, selectedAppointment)) {
            return { ...a, status: newStatus }
          }
          return a
        })
        updateAppointmentsCache(() => list)
        setSelectedAppointment({ ...selectedAppointment, status: newStatus })
      } else {
        alert('Failed to update status. Please try again.')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleAppointmentCardQuickStatus = async (
    appointment: Appointment,
    newStatus: AppointmentCardContextStatus,
  ) => {
    const ids = getAppointmentIdsForCardStatusUpdate(appointment, appointments, newStatus)
    if (ids.length === 0) return
    const idSet = new Set(ids.map((x) => toMongoIdString(x) || String(x)))
    setCardStatusMenuUpdatingId(appointment._id)
    try {
      const results = await Promise.all(ids.map((id) => AppointmentsAPI.update(id, { status: newStatus })))
      if (results.every((r) => r?.success)) {
        updateAppointmentsCache((prev) =>
          prev.map((a) =>
            idSet.has(toMongoIdString(a._id) || String(a._id)) ? { ...a, status: newStatus } : a,
          ),
        )
        setSelectedAppointment((prev) =>
          prev && idSet.has(toMongoIdString(prev._id) || String(prev._id))
            ? { ...prev, status: newStatus }
            : prev,
        )
        const label = APPOINTMENT_CARD_CONTEXT_STATUS_OPTIONS.find((o) => o.value === newStatus)?.label
        toast({
          title: "Status updated",
          description:
            ids.length > 1 && newStatus !== "service_started"
              ? `${label ?? newStatus} applied to ${ids.length} linked services`
              : label
                ? `Set to ${label}`
                : undefined,
        })
      } else {
        toast({ title: "Could not update status", variant: "destructive" })
      }
    } catch (e) {
      console.error(e)
      toast({ title: "Could not update status", variant: "destructive" })
    } finally {
      setCardStatusMenuUpdatingId(null)
    }
  }

  type ColumnStatusKey =
    | "scheduled"
    | "confirmed"
    | "arrived"
    | "service_started"
    | "completed"
    | "missed"
    | "cancelled"

  const handleCardDragStart = (e: React.DragEvent, appointment: Appointment) => {
    if (
      appointment.status === "completed" ||
      appointment.status === "missed" ||
      getCalendarCardVisualStatus(appointment, partialPaymentAppointmentIds) === "partial_payment"
    )
      return
    setDraggingAppointmentId(appointment._id)
    e.dataTransfer.setData('application/json', JSON.stringify({ id: appointment._id, status: appointment.status }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleCardDragEnd = () => {
    setDraggingAppointmentId(null)
    setDropTargetColumn(null)
  }

  const handleColumnDragOver = (e: React.DragEvent, statusKey: ColumnStatusKey) => {
    if (statusKey === 'completed') return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetColumn(statusKey)
  }

  const handleColumnDragLeave = () => {
    setDropTargetColumn(null)
  }

  const handleColumnDrop = async (e: React.DragEvent, targetStatusKey: ColumnStatusKey) => {
    e.preventDefault()
    setDropTargetColumn(null)
    if (targetStatusKey === 'completed') return
    let data: { id: string; status: string }
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json'))
    } catch {
      return
    }
    if (!data?.id) return
    setDraggingAppointmentId(null)

    if (targetStatusKey === 'cancelled') {
      setAppointmentToCancel(data.id)
      setShowCancelConfirm(true)
      return
    }

    setUpdatingFromDrop(true)
    setJustDropped(true)
    setTimeout(() => setJustDropped(false), 200)
    try {
      const res = await AppointmentsAPI.update(data.id, { status: targetStatusKey })
      if (res?.success) invalidateAppointments(queryClient)
      else alert('Failed to update status. Please try again.')
    } catch (err) {
      console.error(err)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdatingFromDrop(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Filter bar - staff, date, day chips; view options in settings */}
      <div className="flex flex-wrap items-center gap-4">
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
              onChange={(e) => {
                const v = e.target.value
                setSelectedDate(v)
                if (v) setCurrentDate(new Date(v + "T12:00:00"))
              }}
              className="text-sm font-medium text-slate-700 bg-transparent border-0 focus:outline-none focus:ring-0 min-w-[120px]"
            />
          </div>
          <div className="flex items-center gap-1 rounded-xl overflow-hidden border border-slate-200 bg-white/80 p-0.5">
            {dayChips.map((day) => {
              const dStr = format(day, "yyyy-MM-dd")
              const isToday = dStr === format(new Date(), "yyyy-MM-dd")
              const isSelected = dStr === selectedDate
              return (
                <button
                  key={dStr}
                  type="button"
                  onClick={() => {
                    setSelectedDate(dStr)
                    setCurrentDate(day)
                  }}
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
        </div>
        <div className="flex-1" />
        {canCreateAppointment && onOpenAppointmentForm ? (
          <Button
            type="button"
            onClick={() => onOpenAppointmentForm()}
            className="h-9 shrink-0 bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-4 font-semibold shadow-md shadow-violet-500/20 transition-all hover:shadow-lg"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            New Appointment
          </Button>
        ) : null}
        {canQuickSale && onOpenAppointmentForm ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onOpenAppointmentForm({
                date: selectedDate,
                openCheckoutDirectly: true,
              })
            }
            className="h-9 shrink-0 rounded-xl border-slate-200 bg-white/80 px-4 font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Receipt className="mr-2 h-4 w-4 text-violet-600" />
            Quick Sale
          </Button>
        ) : null}
        <AppointmentsViewSettingsPopover
          view={view}
          onSwitchView={onSwitchView}
          title="List settings"
          description="View and display options"
        />
      </div>

      {/* Appointments for selected date — columns by status */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-slate-700 mb-4">
          Appointments for {selectedDateLabel || 'selected date'}
        </h2>
        {loading ? (
          <ListSkeleton rows={8} showAvatar />
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
        {[
          {
            statusKey: 'scheduled' as ColumnStatusKey,
            title: 'Appointments',
            subtitle: selectedDateLabel || 'Select a date',
            list: getSelectedDateAppointmentsForColumns(),
            headerClass: 'bg-gradient-to-r from-slate-100 to-slate-200/80 border-b border-slate-300',
            titleClass: 'text-slate-800',
            subtitleClass: 'text-slate-600',
            cardClass: 'bg-slate-100/50 border-slate-300 hover:bg-slate-200/50',
            timeBadgeClass: 'text-slate-800 border-slate-400 bg-slate-100',
            avatarClass: 'border-slate-300 bg-slate-200 text-slate-800',
            metaClass: 'text-slate-600',
            emptyIcon: '📅',
            emptyTitle: 'No appointments',
            emptySub: `No appointments for this date.`,
          },
          {
            statusKey: 'confirmed' as ColumnStatusKey,
            title: 'Confirmed',
            subtitle: selectedDateLabel || 'Select a date',
            list: getConfirmedAppointments(),
            headerClass: 'bg-gradient-to-r from-cyan-100 to-cyan-50 border-b border-cyan-300',
            titleClass: 'text-cyan-900',
            subtitleClass: 'text-cyan-700',
            cardClass: 'bg-cyan-100/50 border-cyan-300 hover:bg-cyan-200/50',
            timeBadgeClass: 'text-cyan-900 border-cyan-400 bg-cyan-100',
            avatarClass: 'border-cyan-300 bg-cyan-200 text-cyan-900',
            metaClass: 'text-cyan-700',
            emptyIcon: '✓',
            emptyTitle: 'None confirmed',
            emptySub: 'No appointments in confirmed state.',
          },
          {
            statusKey: 'arrived' as ColumnStatusKey,
            title: 'Arrived',
            subtitle: selectedDateLabel || 'Select a date',
            list: getArrivedAppointments(),
            headerClass: 'bg-gradient-to-r from-blue-50 to-blue-100/80 border-b border-blue-300',
            titleClass: 'text-blue-900',
            subtitleClass: 'text-blue-800',
            cardClass: 'bg-blue-50/50 border-blue-300 hover:bg-blue-100/50',
            timeBadgeClass: 'text-blue-900 border-blue-400 bg-blue-50',
            avatarClass: 'border-blue-300 bg-blue-100 text-blue-900',
            metaClass: 'text-blue-800',
            emptyIcon: '👋',
            emptyTitle: 'No arrived',
            emptySub: 'No clients marked as arrived yet.',
          },
          {
            statusKey: 'service_started' as ColumnStatusKey,
            title: 'Service Started',
            subtitle: selectedDateLabel || 'Select a date',
            list: getServiceStartedAppointments(),
            headerClass: 'bg-gradient-to-r from-indigo-50 to-indigo-100/80 border-b border-indigo-300',
            titleClass: 'text-indigo-900',
            subtitleClass: 'text-indigo-800',
            cardClass: 'bg-indigo-50/50 border-indigo-300 hover:bg-indigo-100/50',
            timeBadgeClass: 'text-indigo-900 border-indigo-400 bg-indigo-50',
            avatarClass: 'border-indigo-300 bg-indigo-100 text-indigo-900',
            metaClass: 'text-indigo-800',
            emptyIcon: '✂️',
            emptyTitle: 'None in progress',
            emptySub: 'No services started yet.',
          },
          {
            statusKey: 'completed' as ColumnStatusKey,
            title: 'Completed',
            subtitle: selectedDateLabel || 'Select a date',
            list: getCompletedAppointments(),
            headerClass: 'bg-gradient-to-r from-emerald-50 to-emerald-100/80 border-b border-emerald-300',
            titleClass: 'text-emerald-900',
            subtitleClass: 'text-emerald-800',
            cardClass: 'bg-emerald-50/50 border-emerald-300 hover:bg-emerald-100/50',
            timeBadgeClass: 'text-emerald-900 border-emerald-400 bg-emerald-50',
            avatarClass: 'border-emerald-300 bg-emerald-100 text-emerald-900',
            metaClass: 'text-emerald-600',
            emptyIcon: '✅',
            emptyTitle: 'No completed',
            emptySub: 'No completed appointments.',
          },
          {
            statusKey: 'missed' as ColumnStatusKey,
            title: 'No show',
            subtitle: selectedDateLabel || 'Select a date',
            list: getMissedAppointments(),
            headerClass: 'bg-gradient-to-r from-fuchsia-50 to-rose-50 border-b border-rose-300',
            titleClass: 'text-rose-900',
            subtitleClass: 'text-rose-700',
            cardClass: 'bg-rose-100/50 border-rose-300 hover:bg-rose-200/50',
            timeBadgeClass: 'text-rose-900 border-rose-400 bg-rose-100',
            avatarClass: 'border-rose-300 bg-rose-200 text-rose-900',
            metaClass: 'text-rose-700',
            emptyIcon: '🚫',
            emptyTitle: 'No shows',
            emptySub: 'No no-show appointments for this date.',
          },
          {
            statusKey: 'cancelled' as ColumnStatusKey,
            title: 'Cancelled',
            subtitle: selectedDateLabel || 'Select a date',
            list: getCancelledAppointmentsForDate(),
            headerClass: 'bg-gradient-to-r from-red-50 to-red-100/80 border-b border-red-300',
            titleClass: 'text-red-900',
            subtitleClass: 'text-red-800',
            cardClass: 'bg-red-50/50 border-red-300 hover:bg-red-100/50',
            timeBadgeClass: 'text-red-900 border-red-400 bg-red-50',
            avatarClass: 'border-red-300 bg-red-100 text-red-900',
            metaClass: 'text-red-800',
            emptyIcon: '❌',
            emptyTitle: 'No cancelled',
            emptySub: 'No cancelled appointments.',
          },
        ].map((col) => (
          <Card key={col.statusKey} className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
            <CardHeader className={`${col.headerClass} p-3`}>
              <CardTitle className={`text-sm font-semibold ${col.titleClass}`}>{col.title}</CardTitle>
              <p className={`text-xs mt-0.5 ${col.subtitleClass}`}>{col.subtitle}</p>
            </CardHeader>
            <CardContent className="p-3">
              <div
                className={`space-y-2 max-h-[420px] overflow-y-auto min-h-[120px] rounded-lg transition-colors ${
                  dropTargetColumn === col.statusKey ? 'ring-2 ring-indigo-400 bg-indigo-50/50' : ''
                } ${updatingFromDrop ? 'pointer-events-none opacity-70' : ''}`}
                onDragOver={(e) => handleColumnDragOver(e, col.statusKey)}
                onDragLeave={handleColumnDragLeave}
                onDrop={(e) => handleColumnDrop(e, col.statusKey)}
              >
                {col.list.length > 0 ? (
                  col.list.map((appointment) => {
                    const anyAppt: any = appointment as any
                    const cardVisualStatus = getCalendarCardVisualStatus(appointment, partialPaymentAppointmentIds)
                    const serviceNames = getServiceDisplayNames(anyAppt)
                    const clientName = anyAppt?.clientId?.name || 'Client'
                    const clientInitial = clientName?.charAt?.(0) || '?'
                    const staffName = anyAppt?.staffId?.name || 'Unassigned Staff'
                    const price = anyAppt?.price ?? 0
                    const duration = getTotalDuration(anyAppt)
                    const isDraggable =
                      appointment.status !== "completed" &&
                      appointment.status !== "missed" &&
                      cardVisualStatus !== "partial_payment"
                    const isDragging = draggingAppointmentId === appointment._id
                    const groupAccentRing = anyAppt?.bookingGroupId ? groupAccents.get(anyAppt.bookingGroupId) : undefined
                    const bookingGroupIdStr = anyAppt?.bookingGroupId as string | undefined
                    const showLinkedHoverOutline = Boolean(
                      bookingGroupIdStr && hoveredBookingGroupId && bookingGroupIdStr === hoveredBookingGroupId
                    )
                    const showStatusContextMenu = canChangeAppointmentStatusViaContextMenu(appointment)
                    const statusMenuBusy = cardStatusMenuUpdatingId === appointment._id
                    const appointmentCard = (
                      <Card
                        draggable={isDraggable}
                        onDragStart={(e) => isDraggable && handleCardDragStart(e, appointment)}
                        onDragEnd={handleCardDragEnd}
                        onMouseEnter={() => {
                          if (draggingAppointmentId) return
                          cancelClearBookingGroupHover()
                          setHoveredBookingGroupId(bookingGroupIdStr ?? null)
                        }}
                        onMouseLeave={() => scheduleClearBookingGroupHover()}
                        className={`relative ${getStatusCardFill(cardVisualStatus)} border rounded-lg transition-colors duration-200 overflow-hidden flex flex-col ${
                          isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                        } ${anyAppt.staffLocked === true ? '!border-[3px] !border-amber-600' : ''} ${isDragging ? 'opacity-50' : ''} ${groupAccentRing ? `ring-2 ${groupAccentRing}` : ''}${
                          showLinkedHoverOutline && !isDragging ? ' ring-2 ring-violet-500 ring-offset-0' : ''
                        }`}
                        onClick={() => {
                          if (justDropped) return
                          openAppointmentFromListCard(appointment)
                        }}
                      >
                        {anyAppt.staffLocked === true && (
                          <div
                            className="pointer-events-none absolute top-2 right-2 z-10"
                            title="Client requested this stylist"
                            aria-label="Client requested this stylist"
                          >
                            <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-600 drop-shadow-sm" aria-hidden />
                          </div>
                        )}
                        <div className={`h-1.5 shrink-0 rounded-t-lg ${getStatusColor(cardVisualStatus)}`} aria-hidden />
                        <CardContent className="p-2.5 flex-1">
                          <div className="flex items-center justify-between mb-1.5 gap-1 flex-wrap">
                            <div className="flex items-center gap-1 min-w-0">
                              <Badge className={`text-[10px] font-semibold ${getStatusBadgeClass(cardVisualStatus)} border-0`}>
                                {getStatusText(cardVisualStatus)}
                              </Badge>
                              {(anyAppt as { prepaidAtBooking?: boolean }).prepaidAtBooking &&
                                appointment.status !== 'completed' &&
                                !isHiddenAppointment(appointment) && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] shrink-0 border-emerald-600 text-emerald-800 bg-emerald-50"
                                  >
                                    Paid
                                  </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {groupAccentRing && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-slate-300 text-slate-600 bg-white"
                                  title="Linked to a multi-service booking"
                                >
                                  Linked
                                </Badge>
                              )}
                              <Badge variant="outline" className={`text-[10px] ${col.timeBadgeClass}`}>
                                {appointment.time}
                              </Badge>
                            </div>
                          </div>
                          {serviceNames.length === 1 ? (
                            <div className="font-medium text-slate-800 text-sm truncate">{serviceNames[0]}</div>
                          ) : (
                            <ul className="font-medium text-slate-800 text-sm list-disc list-inside space-y-0.5">
                              {serviceNames.map((name, i) => <li key={i} className="truncate">{name}</li>)}
                            </ul>
                          )}
                          <div className="flex items-center mt-1">
                            <Avatar className={`h-5 w-5 mr-1.5 border ${col.avatarClass}`}>
                              <AvatarFallback className="text-[10px]">{clientInitial}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-slate-800 truncate">{clientName}</div>
                              <div className={`text-[10px] ${col.metaClass}`}>{staffName}</div>
                            </div>
                          </div>
                          <div className="flex justify-between text-[10px] mt-1">
                            <span className={`font-medium ${col.metaClass}`}>₹{price} • {duration}m</span>
                            <span className="text-slate-500">{format(new Date(appointment.date), 'MMM d')}</span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                    return showStatusContextMenu ? (
                      <ContextMenu key={appointment._id}>
                        <ContextMenuTrigger asChild>{appointmentCard}</ContextMenuTrigger>
                        <ContextMenuContent className="w-52">
                          <ContextMenuLabel>Change status</ContextMenuLabel>
                          <ContextMenuSeparator />
                          {APPOINTMENT_CARD_CONTEXT_STATUS_OPTIONS.map((opt) => (
                            <ContextMenuItem
                              key={opt.value}
                              disabled={statusMenuBusy || appointment.status === opt.value}
                              onSelect={() => {
                                void handleAppointmentCardQuickStatus(appointment, opt.value)
                              }}
                            >
                              {opt.label}
                            </ContextMenuItem>
                          ))}
                        </ContextMenuContent>
                      </ContextMenu>
                    ) : (
                      <Fragment key={appointment._id}>{appointmentCard}</Fragment>
                    )
                  })
                ) : (
                  <div className={`text-center py-6 rounded-lg border border-dashed ${col.cardClass} border-2`}>
                    <div className="text-2xl mb-2">{col.emptyIcon}</div>
                    <div className={`text-xs font-medium ${col.titleClass}`}>{col.emptyTitle}</div>
                    <div className={`text-[10px] mt-0.5 ${col.subtitleClass}`}>{col.emptySub}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        </div>
        )}
      </div>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl">
          <DialogHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-2xl p-6 -m-6 mb-6">
            <DialogTitle className="text-xl font-bold">Appointment Details</DialogTitle>
            <DialogDescription className="text-indigo-100 mt-2">
              {selectedAppointment ? `${getStatusText(selectedAppointment.status)} • ${selectedAppointment.time} • ${selectedAppointment.date}` : ''}
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-4 text-sm">
              {(() => {
                const a: any = selectedAppointment as any
                const serviceNames = getServiceDisplayNames(a)
                const clientName = a?.clientId?.name || 'Client'
                const staffName = getPrimaryStaffName(selectedAppointment)
                const duration = getTotalDuration(a)
                const price = a?.price ?? 0
                const timeFrom = a?.time || ''
                const timeTo = timeFrom ? slotMinutesToTimeString(parseTimeToMinutes(timeFrom) + duration) : ''
                const prepaid = !!(a as { prepaidAtBooking?: boolean }).prepaidAtBooking
                const paymentStatus = linkedSale?.paymentStatus
                  ? (linkedSale.paymentStatus.remainingAmount <= 0 ? 'Paid' : linkedSale.paymentStatus.paidAmount > 0 ? 'Partial' : 'Unpaid')
                  : prepaid
                    ? 'Paid'
                    : '—'
                const createdDate = a?.createdAt ? format(new Date(a.createdAt), 'dd MMM yyyy, h:mm a') : '—'
                const createdBy = a?.createdBy || '—'
                const leadSource = a?.leadSource || '—'
                const bookingNote = a?.notes || '—'
                return (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-xl font-semibold text-slate-900">{clientName}</div>
                      {selectedAppointment &&
                      (selectedAppointment.status === 'scheduled' ||
                        selectedAppointment.status === 'confirmed' ||
                        selectedAppointment.status === 'arrived') ? (
                        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                          {selectedAppointment.status === 'scheduled' ||
                          selectedAppointment.status === 'confirmed' ? (
                            <>
                              <Button
                                onClick={() => handleMarkStatus('arrived')}
                                disabled={updatingStatus}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                              >
                                {updatingStatus ? 'Updating...' : 'Mark as Arrived'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleMarkStatus('missed')}
                                disabled={updatingStatus}
                                size="sm"
                                className="shrink-0 border-rose-300 text-rose-800 hover:bg-rose-50"
                              >
                                {updatingStatus ? 'Updating...' : 'No show'}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                onClick={() => handleMarkStatus('service_started')}
                                disabled={updatingStatus}
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                              >
                                {updatingStatus ? 'Updating...' : 'Service Started'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleMarkStatus('missed')}
                                disabled={updatingStatus}
                                size="sm"
                                className="shrink-0 border-rose-300 text-rose-800 hover:bg-rose-50"
                              >
                                {updatingStatus ? 'Updating...' : 'No show'}
                              </Button>
                            </>
                          )}
                        </div>
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
                        <div>{timeFrom && timeTo ? `${timeFrom} – ${timeTo}` : timeFrom || '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Service Duration</div>
                        <div>{duration} min</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Stylist Name</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{staffName}</span>
                          {(a.staffLocked === true) && (
                            <Badge variant="outline" className="text-[11px] gap-1 border-amber-300 bg-amber-50 text-amber-900">
                              <Heart className="h-3 w-3 fill-rose-500 text-rose-600" />
                              Requested stylist
                            </Badge>
                          )}
                        </div>
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
                        <div>{resolveCreatedByDisplay(createdBy, { staffDirectory: staffList, currentUser: user })}</div>
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
                {selectedAppointment?.status === 'completed' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    {linkedSale?._id && (
                      <Button
                        variant="destructive"
                        onClick={handleDeleteInvoiceClick}
                        disabled={deletingInvoice}
                        className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                      >
                        {deletingInvoice ? 'Deleting...' : 'Delete Invoice'}
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
                ) : selectedAppointment?.status === 'missed' ? (
                  <div className="flex justify-end w-full">
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
                  </div>
                ) : (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (!selectedAppointment) return
                        const anySel: any = selectedAppointment as any
                        handleCancelClick(anySel._id)
                      }}
                      disabled={cancelling || isHiddenAppointment(selectedAppointment)}
                      className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                    >
                      {cancelling ? 'Cancelling...' : 'Cancel Appointment'}
                    </Button>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        disabled={
                          !selectedAppointment ||
                          getAppointmentCalendarOpenIntent(
                            selectedAppointment,
                            partialPaymentAppointmentIds
                          ).type === 'details'
                        }
                        onClick={() => {
                          if (!selectedAppointment) return
                          setShowDetails(false)
                          const intent = getAppointmentCalendarOpenIntent(
                            selectedAppointment,
                            partialPaymentAppointmentIds
                          )
                          if (intent.type === 'edit_form') {
                            if (onOpenAppointmentForm) {
                              onOpenAppointmentForm({ appointmentId: intent.appointmentId })
                            } else {
                              router.push(`/appointments/new?edit=${intent.appointmentId}`)
                            }
                          }
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      {(selectedAppointment as any)?.prepaidAtBooking ? (
                        <Button
                          onClick={() => handleMarkStatus('completed')}
                          disabled={updatingStatus}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {updatingStatus ? 'Updating...' : 'Mark Complete'}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => {
                            if (!selectedAppointment) return
                            const a = selectedAppointment as any
                            const siblings = getBookingGroupSiblings(appointments, a)
                            // Modal only opens for multi-doc booking groups (≥2 sibling docs).
                            // Single docs — including legacy bookings with `additionalServiceIds`
                            // — fall back to the existing direct-to-quick-sale flow because the
                            // backend doesn't yet support splitting an additional service off a
                            // single Appointment row.
                            if (siblings.length <= 1) {
                              const allServices = collectSaleLinesFromAppointmentCard(a)
                              const appointmentData = buildRaiseSaleAppointmentPayload(a, [a], allServices)
                              setShowDetails(false)
                              router.push(`/quick-sale?appointment=${btoa(JSON.stringify(appointmentData))}`)
                              return
                            }
                            setRaiseSaleAnchor(a)
                            setRaiseSaleSiblings(siblings as Appointment[])
                            setShowDetails(false)
                            setShowRaiseSaleModal(true)
                          }}
                        >
                          Raise Sale
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upcoming Appointments Modal */}
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
                  const anyAppt: any = appointment as any
                  const serviceNames = getServiceDisplayNames(anyAppt)
                  const clientName = anyAppt?.clientId?.name || 'Client'
                  const clientInitial = clientName?.charAt?.(0) || '?'
                  const staffName = anyAppt?.staffId?.name || 'Unassigned Staff'
                  const price = anyAppt?.price ?? 0
                  const duration = anyAppt?.duration ?? 0
                  const showStatusContextMenu = canChangeAppointmentStatusViaContextMenu(appointment)
                  const statusMenuBusy = cardStatusMenuUpdatingId === appointment._id
                  const upcomingCard = (
                    <Card
                      className={`relative bg-indigo-50/50 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl cursor-pointer ${
                        anyAppt.staffLocked === true
                          ? 'border-[3px] border-amber-600 ring-2 ring-amber-500/80'
                          : 'border border-indigo-200'
                      }`}
                      onClick={() => {
                        openAppointmentFromListCard(appointment)
                        setShowUpcomingModal(false)
                      }}
                    >
                      {(anyAppt.staffLocked === true) && (
                        <div
                          className="pointer-events-none absolute top-4 right-4 z-10"
                          title="Client requested this stylist"
                          aria-label="Client requested this stylist"
                        >
                          <Heart className="h-4 w-4 fill-rose-500 text-rose-600 drop-shadow-sm" aria-hidden />
                        </div>
                      )}
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge className={`text-xs font-semibold ${getStatusBadgeClass(appointment.status)} border-0`}>
                              {getStatusText(appointment.status)}
                            </Badge>
                            {anyAppt.prepaidAtBooking &&
                              appointment.status !== 'completed' &&
                              !isHiddenAppointment(appointment) && (
                                <Badge
                                  variant="outline"
                                  className="text-xs shrink-0 border-emerald-600 text-emerald-800 bg-emerald-50"
                                >
                                  Paid
                                </Badge>
                              )}
                          </div>
                          <Badge variant="outline" className="text-indigo-700 border-indigo-300 bg-indigo-50 shrink-0">
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
                              <AvatarFallback className="text-sm font-medium bg-indigo-100 text-indigo-700">{clientInitial}</AvatarFallback>
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
                            <div className="text-sm text-slate-500">{format(new Date(appointment.date), 'MMM dd, yyyy')}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                  return showStatusContextMenu ? (
                    <ContextMenu key={appointment._id}>
                      <ContextMenuTrigger asChild>{upcomingCard}</ContextMenuTrigger>
                      <ContextMenuContent className="w-52">
                        <ContextMenuLabel>Change status</ContextMenuLabel>
                        <ContextMenuSeparator />
                        {APPOINTMENT_CARD_CONTEXT_STATUS_OPTIONS.map((opt) => (
                          <ContextMenuItem
                            key={opt.value}
                            disabled={statusMenuBusy || appointment.status === opt.value}
                            onSelect={() => {
                              void handleAppointmentCardQuickStatus(appointment, opt.value)
                            }}
                          >
                            {opt.label}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuContent>
                    </ContextMenu>
                  ) : (
                    <Fragment key={appointment._id}>{upcomingCard}</Fragment>
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

      {/* Cancel Confirmation Modal */}
      <Dialog open={showCancelConfirm} onOpenChange={(open) => { setShowCancelConfirm(open); if (!open) setAppointmentToCancel(null) }}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl max-w-md">
          <DialogHeader className="text-center pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
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
              onClick={cancelCancelAppointment}
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
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Cancelling...
                </>
              ) : (
                'Cancel'
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

      {/* Delete Invoice Confirmation Modal */}
      <Dialog open={showDeleteInvoiceConfirm} onOpenChange={(open) => {
        setShowDeleteInvoiceConfirm(open)
        if (!open) setDeleteInvoiceReason('')
      }}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl max-w-md">
          <DialogHeader className="text-center pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
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
              onClick={() => { setShowDeleteInvoiceConfirm(false); setDeleteInvoiceReason('') }}
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
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Deleting...
                </>
              ) : (
                'Yes, Delete Invoice'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <RaiseSaleConfirmationModal
        open={showRaiseSaleModal}
        anchor={raiseSaleAnchor as any}
        siblings={raiseSaleSiblings as any}
        onClose={() => setShowRaiseSaleModal(false)}
        onConfirm={(result: RaiseSaleConfirmationResult) => {
          setShowRaiseSaleModal(false)
          if (result.skipBilling) {
            toast({ title: "Booking cancelled", description: "All services were marked cancelled at billing." })
            return
          }
          if (result.performed.length === 0 || !raiseSaleAnchor) return
          // Build the quick-sale payload from the post-shift performed siblings only.
          const performedAnchor = (result.performed.find((p: any) => p._id === raiseSaleAnchor._id) || result.performed[0]) as any
          const allServices = result.performed.flatMap((sib: any) => collectSaleLinesFromAppointmentCard(sib))
          const appointmentData = buildRaiseSaleAppointmentPayload(performedAnchor, result.performed, allServices)
          router.push(`/quick-sale?appointment=${btoa(JSON.stringify(appointmentData))}`)
        }}
      />
    </div>
  )
})

AppointmentsCalendar.displayName = 'AppointmentsCalendar'
