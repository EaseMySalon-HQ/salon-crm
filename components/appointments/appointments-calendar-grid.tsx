"use client"

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo, Fragment, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { addDays, format, subDays } from "date-fns"
import {
  AlertCircle,
  Ban,
  Calendar,
  Clock,
  Eye,
  Heart,
  List,
  Loader2,
  Pencil,
  PlusCircle,
  Receipt,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { CalendarGridSkeleton } from "@/components/loading/calendar-grid-skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppointmentsAPI, StaffDirectoryAPI, BlockTimeAPI, SalesAPI, SettingsAPI, StaffAttendanceAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { resolveCreatedByDisplay } from "@/lib/utils"
import { formatAmountWithSymbol } from "@/lib/currency"
import { BlockTimeModal, getBlockReasonIcon } from "@/components/appointments/block-time-modal"
import { AppointmentsViewSettingsPopover } from "@/components/appointments/appointments-view-settings-popover"
import { useToast } from "@/hooks/use-toast"
import { ReceiptPreview } from "@/components/receipts/receipt-preview"
import { receiptPreviewReceiptFromSaleApi } from "@/lib/receipt-preview-from-sale-api"
import type { Receipt } from "@/lib/data"
import {
  getServiceDisplayNames,
  getAppointmentTotalDurationGrid as getTotalDuration,
  getAppointmentGridWindowMinutes,
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
  isOnlineBookingAppointment,
  ONLINE_BOOKING_PILL_CLASS,
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
    totalVisits?: number
    totalSpent?: number
    lastVisit?: string | Date | null
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
  /** Client requested this stylist — show lock on cards */
  staffLocked?: boolean
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
  email?: string
  role?: string
  avatar?: string
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

const SLOT_MINUTES = 5
const slotHeight_COMPACT = 14
const slotHeight_COMFORTABLE = 26
/** Sticky time/staff headers must stack above the appointment overlay (`z-20`) while scrolling. */
const CALENDAR_STICKY_HEADER_Z_CLASS = "z-40"
const CALENDAR_STAFF_HEADER_HEIGHT_PX = 80
const CALENDAR_APPOINTMENTS_OVERLAY_Z_CLASS = "z-20"
const CALENDAR_NOW_LINE_Z_CLASS = "z-[35]"
const SLOTS_PER_HOUR = 12
const DEFAULT_START_HOUR = 9
const DEFAULT_END_HOUR = 21

/** Snap to the calendar slot grid (5-min) so row indices stay aligned with click targets. */
function alignMinutesDownToSlotGrid(totalMinutes: number): number {
  return Math.floor(totalMinutes / SLOT_MINUTES) * SLOT_MINUTES
}

function alignMinutesUpToSlotGrid(totalMinutes: number): number {
  return Math.ceil(totalMinutes / SLOT_MINUTES) * SLOT_MINUTES
}

type CalendarStackSource =
  | { kind: "appointment"; apt: Appointment; top: number; height: number; sortKey: string }
  | {
      kind: "sale"
      sale: any
      serviceItem: any
      itemKey: string
      top: number
      height: number
      startM: number
      endM: number
      sortKey: string
    }
  | { kind: "block"; block: BlockTime; top: number; height: number; sortKey: string }

type CalendarStackLayoutItem =
  | { kind: "appointment"; apt: Appointment; top: number; height: number; left: number; width: number }
  | {
      kind: "sale"
      sale: any
      serviceItem: any
      itemKey: string
      top: number
      height: number
      startM: number
      endM: number
      left: number
      width: number
    }
  | { kind: "block"; block: BlockTime; top: number; height: number; left: number; width: number }

/** Appointments, walk-in sales, and block-time cards share one overlap stack per staff column. */
function layoutCalendarColumnStack(sources: CalendarStackSource[]): CalendarStackLayoutItem[] {
  const n = sources.length
  if (n === 0) return []

  const intervalsOverlap = (a: CalendarStackSource, b: CalendarStackSource) => {
    const aEnd = a.top + a.height
    const bEnd = b.top + b.height
    return a.top < bEnd && aEnd > b.top
  }

  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i])
    return parent[i]
  }
  const union = (i: number, j: number) => {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) parent[ri] = rj
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (intervalsOverlap(sources[i], sources[j])) union(i, j)
    }
  }

  const membersByRoot = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    const list = membersByRoot.get(r)
    if (list) list.push(i)
    else membersByRoot.set(r, [i])
  }

  /** Max simultaneous overlaps inside each connected overlap component (interval graph clique number). */
  const maxConcurrentByRoot = new Map<number, number>()
  for (const [root, idxs] of membersByRoot) {
    const events: { t: number; d: number }[] = []
    for (const i of idxs) {
      const s = sources[i]
      const end = s.top + s.height
      events.push({ t: s.top, d: 1 })
      events.push({ t: end, d: -1 })
    }
    events.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.d - b.d))
    let depth = 0
    let maxD = 0
    for (const e of events) {
      depth += e.d
      if (depth > maxD) maxD = depth
    }
    maxConcurrentByRoot.set(root, Math.max(1, maxD))
  }

  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => {
    const a = sources[i]
    const b = sources[j]
    if (Math.abs(a.top - b.top) > 0.01) return a.top - b.top
    return a.sortKey.localeCompare(b.sortKey)
  })

  type ActiveEntry = { idx: number; lane: number }
  const active: ActiveEntry[] = []
  const laneByIdx = new Array<number>(n)
  for (const i of order) {
    const item = sources[i]
    for (let k = active.length - 1; k >= 0; k--) {
      const o = sources[active[k].idx]
      if (o.top + o.height <= item.top) active.splice(k, 1)
    }
    const used = new Set(active.map((a) => a.lane))
    let lane = 0
    while (used.has(lane)) lane += 1
    active.push({ idx: i, lane })
    laneByIdx[i] = lane
  }

  return sources.map((item, i) => {
    const M = maxConcurrentByRoot.get(find(i)) ?? 1
    const lane = laneByIdx[i]
    const width = 100 / M
    const left = lane * width
    if (item.kind === "appointment") {
      return { kind: "appointment", apt: item.apt, top: item.top, height: item.height, left, width }
    }
    if (item.kind === "sale") {
      return {
        kind: "sale",
        sale: item.sale,
        serviceItem: item.serviceItem,
        itemKey: item.itemKey,
        top: item.top,
        height: item.height,
        startM: item.startM,
        endM: item.endM,
        left,
        width,
      }
    }
    return { kind: "block", block: item.block, top: item.top, height: item.height, left, width }
  })
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

/** Slot-aligned start for drag/resize — must match visual grid position (prefers startAt window over legacy `time`). */
function getAppointmentDragBaselineStartMinutes(apt: Appointment): number {
  const win = getAppointmentGridWindowMinutes(apt as any)
  const rawM = win != null ? win.startM : parseTimeToMinutes(typeof (apt as any).time === "string" ? (apt as any).time : "")
  return Math.floor(rawM / SLOT_MINUTES) * SLOT_MINUTES
}

/**
 * Fill (+ optional intra-row guides for coarse slot heights only). Each row is one `SLOT_MINUTES`
 * block; guides are omitted for 5‑minute rows so divisions come only from row borders.
 * Always use a solid bottom layer in `background-image` and `backgroundColor: transparent` so
 * Tailwind `background-color` utilities cannot suppress painting (WebKit/Blink quirk).
 */
function fiveMinuteGridGuidesStyle(baseFill: string, cellHeightPx: number): CSSProperties {
  if (SLOT_MINUTES <= 5) {
    return {
      backgroundColor: "transparent",
      backgroundImage: `linear-gradient(to bottom, ${baseFill}, ${baseFill})`,
    }
  }
  const h = cellHeightPx
  const t1 = h / 3
  const t2 = (2 * h) / 3
  const guides = [
    `linear-gradient(to bottom, transparent 0, transparent ${t1 - 0.5}px, rgb(203 213 225 / 0.22) ${t1 - 0.5}px, rgb(203 213 225 / 0.22) ${t1 + 0.5}px, transparent ${t1 + 0.5}px)`,
    `linear-gradient(to bottom, transparent 0, transparent ${t2 - 0.5}px, rgb(226 232 240 / 0.38) ${t2 - 0.5}px, rgb(226 232 240 / 0.38) ${t2 + 0.5}px, transparent ${t2 + 0.5}px)`,
  ]
  return {
    backgroundColor: "transparent",
    backgroundImage: [...guides, `linear-gradient(to bottom, ${baseFill}, ${baseFill})`].join(","),
  }
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

function formatTimeRangeFromSlotMinutes(startM: number, endM: number): string {
  const startStr = formatAppointmentTime(slotMinutesToTimeString(startM))
  const endStr = formatAppointmentTime(slotMinutesToTimeString(endM))
  return `${startStr} – ${endStr}`
}

/** Start time while dragging move / resize-top — matches drop clamping in mouseup handler. */
function previewStartMinutesForMoveOrResizeTopDrag(args: {
  baselineStartMinutes: number
  duration: number
  hoverSlot: { slotMinutes: number } | null
  dragOffsetY: number
  slotHeightPx: number
  calendarStartMinutes: number
  calendarEndMinutes: number
}): number {
  const d = args.duration
  const endBound = args.calendarEndMinutes - d
  let raw: number
  if (args.hoverSlot) {
    raw = Math.max(args.calendarStartMinutes, Math.min(endBound, args.hoverSlot.slotMinutes))
    raw = Math.floor(raw / SLOT_MINUTES) * SLOT_MINUTES
  } else {
    const slotDelta = Math.round(args.dragOffsetY / args.slotHeightPx)
    raw = args.baselineStartMinutes + slotDelta * SLOT_MINUTES
    raw = Math.max(args.calendarStartMinutes, Math.min(endBound, raw))
    raw = Math.floor(raw / SLOT_MINUTES) * SLOT_MINUTES
  }
  return raw
}

function previewDurationForResizeBottomDrag(args: {
  startTimeMinutes: number
  baselineDuration: number
  dragOffsetY: number
  slotHeightPx: number
  calendarEndMinutes: number
}): number {
  const maxSpan = args.calendarEndMinutes - args.startTimeMinutes
  let previewDur =
    args.baselineDuration + Math.round(args.dragOffsetY / args.slotHeightPx) * SLOT_MINUTES
  previewDur = Math.max(SLOT_MINUTES, Math.min(maxSpan, previewDur))
  return Math.floor(previewDur / SLOT_MINUTES) * SLOT_MINUTES
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

function formatDurationHuman(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "0 min"
  if (totalMinutes < 60) return `${Math.round(totalMinutes)} min`
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function getStatusColor(status: string): string {
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

function getStatusCardFill(status: string): string {
  switch (status) {
    case "scheduled":
      return "bg-slate-100/90 border-slate-300/80 hover:bg-slate-200/90"
    case "confirmed":
      return "bg-cyan-100/90 border-cyan-300/80 hover:bg-cyan-200/90"
    case "arrived":
      return "bg-blue-100/90 border-blue-300/80 hover:bg-blue-200/90"
    case "partial_payment":
      return "bg-amber-100/90 border-amber-300/80 hover:bg-amber-200/90"
    case "service_started":
      return "bg-indigo-100/90 border-indigo-300/80 hover:bg-indigo-200/90"
    case "completed":
      return "bg-emerald-100/90 border-emerald-300/80 hover:bg-emerald-200/90"
    case "missed":
      return "bg-rose-100/90 border-rose-300/80 hover:bg-rose-200/90"
    case "cancelled":
      return "bg-red-100/90 border-red-300/80 hover:bg-red-200/90"
    case "cancelled_at_billing":
      return "bg-zinc-100/90 border-zinc-300/80 hover:bg-zinc-200/90"
    default:
      return "bg-slate-100/90 border-slate-200/80 hover:bg-slate-200/90"
  }
}

function getStatusBadgeClass(status: string): string {
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

function getStatusText(status: string): string {
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

interface AppointmentsCalendarGridProps {
  initialAppointmentId?: string
  onSwitchToList?: () => void
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

export const AppointmentsCalendarGrid = forwardRef<
  { showCancelledModal: () => void; showUpcomingModal: () => void },
  AppointmentsCalendarGridProps
>(({ initialAppointmentId, onSwitchToList, onOpenAppointmentForm, view = "calendar", onSwitchView }, ref) => {
  const { user, hasPermission } = useAuth()
  const canCreateAppointment = hasPermission("appointments", "create")
  const canQuickSale = hasPermission("sales", "create")
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
  // Per-service "Raise Sale" confirmation modal — opens only for multi-service bookings.
  const [showRaiseSaleModal, setShowRaiseSaleModal] = useState(false)
  const [raiseSaleAnchor, setRaiseSaleAnchor] = useState<Appointment | null>(null)
  const [raiseSaleSiblings, setRaiseSaleSiblings] = useState<Appointment[]>([])
  const [showDeleteInvoiceConfirm, setShowDeleteInvoiceConfirm] = useState(false)
  const [deleteInvoiceReason, setDeleteInvoiceReason] = useState("")
  const [deletingInvoice, setDeletingInvoice] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [cardStatusMenuUpdatingId, setCardStatusMenuUpdatingId] = useState<string | null>(null)
  const [blockTimes, setBlockTimes] = useState<BlockTime[]>([])
  const [attendanceCheckedInStaffIds, setAttendanceCheckedInStaffIds] = useState<Set<string>>(() => new Set())
  const [walkInSales, setWalkInSales] = useState<any[]>([])
  /** Appointment ids with a linked sale that has partial payment (same calendar day as `selectedDate`). */
  const [partialPaymentAppointmentIds, setPartialPaymentAppointmentIds] = useState<Set<string>>(() => new Set())
  const [saleInvoicePreviewOpen, setSaleInvoicePreviewOpen] = useState(false)
  const [saleInvoicePreviewReceipt, setSaleInvoicePreviewReceipt] = useState<Receipt | null>(null)
  const [saleInvoicePreviewSettings, setSaleInvoicePreviewSettings] = useState<any>(null)
  const [saleInvoicePreviewLoading, setSaleInvoicePreviewLoading] = useState(false)
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
    /** Only time/duration may change — never reassign staff */
    staffLocked?: boolean
  } | null>(null)
  const [updatingTimeForId, setUpdatingTimeForId] = useState<string | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const [dragOffsetX, setDragOffsetX] = useState(0)
  const [dragStartRect, setDragStartRect] = useState<DOMRect | null>(null)
  /** Calendar grid: shrink inner card width on hover (pointer stays in full slot via wrapper). */
  const [hoverShrinkAptId, setHoverShrinkAptId] = useState<string | null>(null)
  /** All appointments with this bookingGroupId show a linked outline while hovering any sibling card in the calendar slot. */
  const [hoveredBookingGroupId, setHoveredBookingGroupId] = useState<string | null>(null)
  /** Client detail HoverCard: open only while pointer is over the appointment card (not the floating panel). */
  const [clientHoverDetailOpenForId, setClientHoverDetailOpenForId] = useState<string | null>(null)
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
  useEffect(() => {
    if (draggingApt) setClientHoverDetailOpenForId(null)
  }, [draggingApt])
  /** Instant slot hover hint (native `title` waits ~500ms+ in browsers). */
  const [slotHoverTip, setSlotHoverTip] = useState<{
    text: string
    clientX: number
    clientY: number
  } | null>(null)
  const showSlotHoverTip = useCallback((text: string, e: ReactMouseEvent) => {
    setSlotHoverTip({ text, clientX: e.clientX, clientY: e.clientY })
  }, [])
  const moveSlotHoverTip = useCallback((e: ReactMouseEvent) => {
    setSlotHoverTip((prev) => (prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null))
  }, [])
  const hideSlotHoverTip = useCallback(() => setSlotHoverTip(null), [])
  const openSaleInvoicePreview = useCallback(
    async (billNoRaw: string) => {
      const billNo = String(billNoRaw || "").trim()
      if (!billNo) {
        toast({
          title: "Missing bill number",
          description: "Cannot load this invoice.",
          variant: "destructive",
        })
        return
      }
      setSaleInvoicePreviewOpen(true)
      setSaleInvoicePreviewLoading(true)
      setSaleInvoicePreviewReceipt(null)
      setSaleInvoicePreviewSettings(null)
      try {
        const saleRes = await SalesAPI.getByBillNo(billNo)
        if (!saleRes.success || !saleRes.data) {
          toast({
            title: "Invoice not found",
            description: `No sale found for bill #${billNo}.`,
            variant: "destructive",
          })
          setSaleInvoicePreviewOpen(false)
          return
        }
        const settingsRes = await SettingsAPI.getBusinessSettings()
        const settings = settingsRes.success && settingsRes.data ? settingsRes.data : null
        setSaleInvoicePreviewReceipt(receiptPreviewReceiptFromSaleApi(saleRes.data))
        setSaleInvoicePreviewSettings(settings)
      } catch (e) {
        console.error(e)
        toast({ title: "Failed to load invoice", variant: "destructive" })
        setSaleInvoicePreviewOpen(false)
      } finally {
        setSaleInvoicePreviewLoading(false)
      }
    },
    [toast]
  )
  const [dragHoverSlot, setDragHoverSlot] = useState<{
    colIndex: number
    slotMinutes: number
    valid: boolean
  } | null>(null)
  const blocksContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const justDraggedRef = useRef(false)
  const dragHoverSlotRef = useRef<{ colIndex: number; slotMinutes: number; valid: boolean } | null>(null)
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

  useEffect(() => {
    if (slotActionDialog || draggingApt) setSlotHoverTip(null)
  }, [slotActionDialog, draggingApt])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onScroll = () => setSlotHoverTip(null)
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [])

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
      /**
       * Bounded date window around `selectedDate` — covers the "Upcoming" modal but skips
       * the old `sort by createdAt DESC` page which would miss future appointments and
       * fetch arbitrary recent rows. `view=calendar` drops embedded client analytics.
       */
      const anchor = selectedDate ? new Date(selectedDate + "T12:00:00") : new Date()
      const dateFrom = format(subDays(anchor, 7), "yyyy-MM-dd")
      const dateTo = format(addDays(anchor, 60), "yyyy-MM-dd")
      const [staffRes, aptRes] = await Promise.all([
        StaffDirectoryAPI.getAll(),
        AppointmentsAPI.getAll({ limit: 1000, dateFrom, dateTo, view: "calendar" }),
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
  }, [calendarRetryKey, selectedDate])

  const reloadDaySalesForCalendar = useCallback(async () => {
    if (!selectedDate) return
    try {
      const sales = await SalesAPI.getAllMergePages({
        dateFrom: selectedDate,
        dateTo: selectedDate,
        batchSize: 400,
      })
      if (Array.isArray(sales)) {
        setPartialPaymentAppointmentIds(collectPartialPaymentAppointmentIdsFromSales(sales))
        const dateNorm = selectedDate?.slice(0, 10) || ""
        let walkIns = sales.filter((s: any) => {
          if (!s.items?.some((i: any) => i.type === "service")) return false
          if (s.appointmentId) return false
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
        setPartialPaymentAppointmentIds(new Set())
      }
    } catch {
      setWalkInSales([])
      setPartialPaymentAppointmentIds(new Set())
    }
  }, [selectedDate, staffFilter])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  useEffect(() => {
    const handler = () => {
      void fetchAppointments()
      void reloadDaySalesForCalendar()
    }
    window.addEventListener("appointments-refresh", handler)
    return () => window.removeEventListener("appointments-refresh", handler)
  }, [fetchAppointments, reloadDaySalesForCalendar])

  const openAppointmentFromCalendarCard = useCallback(
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

  useEffect(() => {
    if (!pendingAppointmentId || appointments.length === 0) return
    const match = appointments.find((a) => a._id === pendingAppointmentId)
    if (!match) return
    setSelectedAppointment(match)
    if (match.date) {
      const d = new Date(match.date)
      setSelectedDate(format(d, "yyyy-MM-dd"))
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
    const loadAttendance = async () => {
      try {
        const res = await StaffAttendanceAPI.list({
          date: selectedDate,
          ...(staffFilter ? { staffId: staffFilter } : {}),
        })
        if (cancelled) return
        const checkedIn = new Set<string>()
        if (res?.success && Array.isArray(res.data)) {
          for (const row of res.data) {
            if (row.checkInAt && row.staffId) checkedIn.add(String(row.staffId))
          }
        }
        setAttendanceCheckedInStaffIds(checkedIn)
      } catch {
        if (!cancelled) setAttendanceCheckedInStaffIds(new Set())
      }
    }
    void loadAttendance()
    const onFocus = () => void loadAttendance()
    window.addEventListener("focus", onFocus)
    return () => {
      cancelled = true
      window.removeEventListener("focus", onFocus)
    }
  }, [selectedDate, staffFilter, blockTimesRefreshKey, calendarRetryKey])

  useEffect(() => {
    void reloadDaySalesForCalendar()
  }, [reloadDaySalesForCalendar])

  const dateNorm = (d: string) =>
    d && d.length >= 10 ? d.slice(0, 10) : d

  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      const norm = dateNorm(apt.date)
      if (norm !== selectedDate) return false
      if (isHiddenAppointment(apt)) return false
      // Services added inside the checkout dialog become Appointment docs with
      // leadSource: 'Walk-in' (created by markAppointmentCompleted on the
      // server). They are not real bookings — render them through the walk-in
      // sale card path below so they look distinct from scheduled appointments
      // and follow the "Show Walk-in" toggle.
      if (String(apt.leadSource || "").trim().toLowerCase() === "walk-in") return false
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
      // unless they have checked in (worked weekoff).
      if (dayRow.enabled === false && !attendanceCheckedInStaffIds.has(String(staff._id))) {
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
  }, [staffWithScheduling, selectedDayIndex, attendanceCheckedInStaffIds])

  const columns = useMemo(() => {
    if (staffFilter) {
      const s = staffWithScheduling.find((s) => s._id === staffFilter)
      return s ? [s] : []
    }
    return staffWithScheduling
  }, [staffWithScheduling, staffFilter])

  /** Same rules as calendar drag-drop: every slot row in the span must fall in the staff work window. */
  const isValidDropTargetForDrag = useCallback(
    (colIndex: number, slotMinutes: number, duration: number): boolean => {
      const col = columns[colIndex]
      if (!col) return false
      const windowForStaff = staffWindowsById[col._id]
      for (let m = slotMinutes; m < slotMinutes + duration; m += SLOT_MINUTES) {
        const inWindow =
          !windowForStaff ||
          (windowForStaff.enabled && m >= windowForStaff.start && m < windowForStaff.end)
        if (!inWindow) return false
      }
      return true
    },
    [columns, staffWindowsById]
  )

  /** Union of enabled work windows for visible columns — used so 5‑min guides span every open hour. */
  const visibleStaffWorkBand = useMemo(() => {
    if (!columns.length) {
      return { workStart: startMinutes, workEnd: endMinutes }
    }
    let earliest: number | null = null
    let latest: number | null = null
    for (const col of columns) {
      const w = staffWindowsById[col._id]
      if (!w?.enabled) continue
      if (earliest === null || w.start < earliest) earliest = w.start
      if (latest === null || w.end > latest) latest = w.end
    }
    if (earliest === null || latest === null) {
      return { workStart: startMinutes, workEnd: endMinutes }
    }
    return { workStart: earliest, workEnd: latest }
  }, [columns, staffWindowsById, startMinutes, endMinutes])

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
      const win = getAppointmentGridWindowMinutes(apt as any)
      const startM = win ? win.startM : parseTimeToMinutes(apt.time)
      const endM = win ? win.endM : startM + getTotalDuration(apt as any)
      if (endM <= startM) return
      if (startM < extStart) extStart = startM
      if (endM > extEnd) extEnd = endM
    })
    // Align to 5-min slot grid
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
      const showTimeLabel = m % 15 === 0
      const label = showTimeLabel
        ? format(new Date(2000, 0, 1, h, m), "h:mma").toLowerCase()
        : ""
      slots.push({ label, minutes, isHourStart, showTimeLabel })
    }
    return slots
  }, [extendedStartMinutes, extendedEndMinutes])

  // Auto-scroll to center the red "now" line whenever today's grid is shown or layout/data updates
  useEffect(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd")
    if (selectedDate !== todayStr || loading) return
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
      const topPx = CALENDAR_STAFF_HEADER_HEIGHT_PX + ((currentMinutes - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
      const scrollTop = Math.max(0, topPx - containerHeight / 2)
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
  }, [selectedDate, currentTime, extendedStartMinutes, extendedEndMinutes, slotHeight, loading])

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
    const topPx = CALENDAR_STAFF_HEADER_HEIGHT_PX + ((currentMinutes - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
    const containerHeight = el.clientHeight
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
      const win = getAppointmentGridWindowMinutes(apt as any)
      const startM = win ? win.startM : parseTimeToMinutes(apt.time)
      const endM = win ? win.endM : startM + getTotalDuration(apt as any)
      const top = ((startM - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
      const height = Math.max(slotHeight * 0.6, ((endM - startM) / SLOT_MINUTES) * slotHeight)
      map[staffId].push({ apt, top, height })
    })
    columns.forEach((col) => {
      (map[col._id] || []).sort((a, b) => a.top - b.top)
    })
    return map
  }, [columns, filteredAppointments, extendedStartMinutes, slotHeight])

  // Multi-card booking groups: stable color per bookingGroupId so service cards belonging to one
  // logical booking are visually linked across the calendar.
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
      const gid = (apt as Appointment).bookingGroupId
      if (!gid) return
      // Walk-in cards (created post-checkout) render via the sale stream and
      // shouldn't influence the booking group accent count.
      if (String(apt.leadSource || "").trim().toLowerCase() === "walk-in") return
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

  const WALK_IN_SALE_DURATION = 30

  /** Staff+service keys already covered by standalone walk-in sale cards (no appointmentId). */
  const standaloneWalkInSaleLineKeys = useMemo(() => {
    const keys = new Set<string>()
    const add = (staffId: string, serviceRef: unknown, serviceName: unknown) => {
      const sid = String(staffId || "").trim()
      if (!sid) return
      const name = serviceName != null ? String(serviceName).trim().toLowerCase() : ""
      if (name) keys.add(`${sid}:n:${name}`)
      const svcId =
        serviceRef != null && typeof serviceRef === "object" && (serviceRef as { _id?: unknown })._id != null
          ? String((serviceRef as { _id: unknown })._id)
          : serviceRef != null
            ? String(serviceRef).trim()
            : ""
      if (svcId) keys.add(`${sid}:id:${svcId}`)
    }
    for (const sale of effectiveWalkInSales) {
      for (const item of sale.items || []) {
        if (item?.type !== "service") continue
        const rawStaffId = item.staffId || item.staffContributions?.[0]?.staffId || sale.staffId
        const staffId =
          typeof rawStaffId === "object" && rawStaffId?._id ? String(rawStaffId._id) : String(rawStaffId || "")
        add(staffId, item.serviceId, item.name)
      }
    }
    return keys
  }, [effectiveWalkInSales])

  /**
   * Walk-in Appointment docs (services added during checkout) — rendered as
   * walk-in cards instead of scheduled-appointment cards, gated by the same
   * "Show Walk-in" toggle. Filtered out of `filteredAppointments` above.
   */
  const walkInAppointmentSales = useMemo(() => {
    if (!showWalkInCards) return [] as any[]
    return appointments
      .filter((apt) => {
        if (String(apt.leadSource || "").trim().toLowerCase() !== "walk-in") return false
        if (dateNorm(apt.date) !== selectedDate) return false
        if (isHiddenAppointment(apt)) return false
        if (staffFilter) {
          const primaryId = getPrimaryStaffId(apt)
          if (primaryId !== staffFilter) return false
        }
        if (standaloneWalkInSaleLineKeys.size > 0) {
          const staffId = getPrimaryStaffId(apt)
          const serviceName = apt.serviceId?.name
          const serviceId = apt.serviceId?._id ?? apt.serviceId
          const nameKey =
            serviceName != null ? `${staffId}:n:${String(serviceName).trim().toLowerCase()}` : ""
          const idKey = serviceId != null ? `${staffId}:id:${String(serviceId)}` : ""
          if (
            (nameKey && standaloneWalkInSaleLineKeys.has(nameKey)) ||
            (idKey && standaloneWalkInSaleLineKeys.has(idKey))
          ) {
            return false
          }
        }
        return true
      })
      .map((apt) => {
        const primaryStaffId = getPrimaryStaffId(apt)
        const serviceName = apt.serviceId?.name || "Service"
        return {
          // Synthetic sale-shaped object so it flows through the same walk-in
          // card render path as standalone walk-in sales below.
          _id: `walkin-apt-${apt._id}`,
          _walkInAppointmentId: apt._id,
          customerName: apt.clientId?.name || "Walk-in",
          billNo: null,
          date: apt.date,
          time: apt.time,
          items: [
            {
              type: "service",
              name: serviceName,
              staffId: primaryStaffId,
              price: apt.price,
            },
          ],
          __isWalkInAppointment: true as const,
          __walkInAppointmentDuration: Math.max(15, Number(apt.duration) || 60),
          __walkInAppointmentStartM: parseTimeToMinutes(apt.time),
        }
      })
  }, [appointments, showWalkInCards, selectedDate, staffFilter, standaloneWalkInSaleLineKeys])

  const combinedWalkInSales = useMemo(
    () => [...effectiveWalkInSales, ...walkInAppointmentSales],
    [effectiveWalkInSales, walkInAppointmentSales]
  )

  const salesByColumn = useMemo(() => {
    const map: Record<string, Array<{ sale: any; serviceItem: any; itemKey: string; top: number; height: number; startM: number; endM: number }>> = {}
    columns.forEach((col) => {
      map[col._id] = []
    })
    combinedWalkInSales.forEach((sale) => {
      const serviceItems = (sale.items || []).filter((i: any) => i.type === "service")
      if (serviceItems.length === 0) return
      const isWalkInApt = (sale as any).__isWalkInAppointment === true
      let startM: number
      let endM: number
      if (isWalkInApt) {
        startM = (sale as any).__walkInAppointmentStartM ?? parseTimeToMinutes(sale.time || "09:00")
        endM = startM + ((sale as any).__walkInAppointmentDuration || WALK_IN_SALE_DURATION)
      } else {
        let timeStr = sale.time
        if (!timeStr || parseTimeToMinutes(timeStr) > 24 * 60) {
          const d = sale.date ? new Date(sale.date) : new Date()
          if (!Number.isNaN(d.getTime())) timeStr = format(d, "HH:mm")
        }
        const checkoutEndM = parseTimeToMinutes(timeStr || "9:00")
        endM = checkoutEndM
        startM = endM - WALK_IN_SALE_DURATION
      }
      const duration = endM - startM
      const top = ((startM - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
      const height = Math.max(slotHeight * 0.6, (duration / SLOT_MINUTES) * slotHeight)
      serviceItems.forEach((serviceItem: any, idx: number) => {
        const rawStaffId =
          serviceItem?.staffId ||
          serviceItem?.staffContributions?.[0]?.staffId ||
          sale.staffId
        const staffId = typeof rawStaffId === "object" && rawStaffId?._id ? rawStaffId._id : String(rawStaffId || "")
        if (!staffId || !map[staffId]) return
        const svcId =
          serviceItem?.serviceId != null
            ? String(
                typeof serviceItem.serviceId === "object" && serviceItem.serviceId?._id
                  ? serviceItem.serviceId._id
                  : serviceItem.serviceId
              )
            : ""
        const itemKey = `${sale._id}-line-${idx}-${staffId}-${svcId || String(serviceItem?.name || "service").trim()}`
        map[staffId].push({ sale, serviceItem, itemKey, top, height, startM, endM })
      })
    })
    columns.forEach((col) => {
      (map[col._id] || []).sort((a, b) => a.top - b.top)
    })
    return map
  }, [columns, combinedWalkInSales, extendedStartMinutes, slotHeight])

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

  /** Single overlap stack: appointments + walk-in sales + block-time cards share lanes (no overlay). */
  const stackLayoutByColumn = useMemo(() => {
    const result: Record<string, CalendarStackLayoutItem[]> = {}
    columns.forEach((col) => {
      const sources: CalendarStackSource[] = []
      for (const row of blocksByColumn[col._id] || []) {
        sources.push({
          kind: "appointment",
          apt: row.apt,
          top: row.top,
          height: row.height,
          sortKey: `a-${row.apt._id}`,
        })
      }
      for (const row of salesByColumn[col._id] || []) {
        sources.push({
          kind: "sale",
          sale: row.sale,
          serviceItem: row.serviceItem,
          itemKey: row.itemKey,
          top: row.top,
          height: row.height,
          startM: row.startM,
          endM: row.endM,
          sortKey: `s-${row.itemKey}`,
        })
      }
      for (const row of blockTimesByColumn[col._id] || []) {
        sources.push({
          kind: "block",
          block: row.block,
          top: row.top,
          height: row.height,
          sortKey: `b-${row.block._id}`,
        })
      }
      result[col._id] = layoutCalendarColumnStack(sources)
    })
    return result
  }, [columns, blocksByColumn, salesByColumn, blockTimesByColumn])

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
        return aptDate >= today && !isHiddenAppointment(a)
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
      // Appointment cards are removed server-side with the bill; drop any local rows for this group immediately.
      const a = selectedAppointment as any
      const idsToHide = a.bookingGroupId
        ? appointments.filter((apt) => (apt as Appointment).bookingGroupId === a.bookingGroupId).map((apt) => apt._id)
        : [selectedAppointment._id]
      const idsSet = new Set(idsToHide)
      setAppointments((prev) => prev.filter((apt) => !idsSet.has(apt._id)))
      setLinkedSale(null)
      setShowDetails(false)
      setShowDeleteInvoiceConfirm(false)
      setDeleteInvoiceReason("")
      window.dispatchEvent(new CustomEvent("appointments-refresh"))
      alert(saleRes?.message || "Invoice and appointment(s) deleted successfully.")
    } catch (e) {
      console.error(e)
      alert("Failed to delete invoice. Please try again.")
    } finally {
      setDeletingInvoice(false)
    }
  }

  const handleMarkStatus = async (newStatus: "arrived" | "service_started" | "completed" | "missed") => {
    if (!selectedAppointment) return
    setUpdatingStatus(true)
    try {
      const res = await AppointmentsAPI.update(selectedAppointment._id, { status: newStatus })
      if (res?.success) {
        const bgId = (selectedAppointment as any).bookingGroupId
        const syncGroup = newStatus === "arrived" || newStatus === "missed"
        const list = appointments.map((a) => {
          if (a._id === selectedAppointment._id) return { ...a, status: newStatus }
          if (syncGroup && bgId && (a as any).bookingGroupId === bgId && appointmentsOnSameVisitDate(a, selectedAppointment)) {
            return { ...a, status: newStatus }
          }
          return a
        })
        setAppointments(list)
        setSelectedAppointment({ ...selectedAppointment, status: newStatus })
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

  const handleCalendarCardQuickStatus = async (
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
        setAppointments((prev) =>
          prev.map((a) =>
            idSet.has(toMongoIdString(a._id) || String(a._id)) ? { ...a, status: newStatus } : a,
          ),
        )
        setSelectedAppointment((cur) =>
          cur && idSet.has(toMongoIdString(cur._id) || String(cur._id))
            ? { ...cur, status: newStatus }
            : cur,
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

  const handleTimeDragStart = (e: React.MouseEvent, apt: Appointment) => {
    if (
      isHiddenAppointment(apt) ||
      apt.status === "completed" ||
      apt.status === "missed" ||
      getCalendarCardVisualStatus(apt, partialPaymentAppointmentIds) === "partial_payment"
    )
      return
    e.preventDefault()
    e.stopPropagation()
    setHoverShrinkAptId(null)
    const cardEl = (e.target as HTMLElement).closest("[data-appointment-card]") as HTMLElement
    if (cardEl) setDragStartRect(cardEl.getBoundingClientRect())
    setDragOffsetY(0)
    setDragOffsetX(0)
    const sourceStaffId = getPrimaryStaffId(apt) ?? ""
    setDraggingApt({
      id: apt._id,
      startX: e.clientX,
      startY: e.clientY,
      startTimeMinutes: getAppointmentDragBaselineStartMinutes(apt),
      duration: getTotalDuration(apt as any),
      mode: "move",
      sourceStaffId,
      staffLocked: (apt as any).staffLocked === true,
    })
  }

  const handleResizeStart = (e: React.MouseEvent, apt: Appointment, mode: "resize-top" | "resize-bottom") => {
    if (
      isHiddenAppointment(apt) ||
      apt.status === "completed" ||
      apt.status === "missed" ||
      getCalendarCardVisualStatus(apt, partialPaymentAppointmentIds) === "partial_payment"
    )
      return
    e.preventDefault()
    e.stopPropagation()
    setHoverShrinkAptId(null)
    const cardEl = (e.target as HTMLElement).closest("[data-appointment-card]") as HTMLElement
    if (cardEl) setDragStartRect(cardEl.getBoundingClientRect())
    setDragOffsetY(0)
    setDragOffsetX(0)
    const sourceStaffId = getPrimaryStaffId(apt) ?? ""
    setDraggingApt({
      id: apt._id,
      startX: e.clientX,
      startY: e.clientY,
      startTimeMinutes: getAppointmentDragBaselineStartMinutes(apt),
      duration: getTotalDuration(apt as any),
      mode,
      sourceStaffId,
      staffLocked: (apt as any).staffLocked === true,
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
    const drag = draggingApt
    const prevUserSelect = document.body.style.userSelect
    document.body.style.userSelect = "none"

    const isValidDropTarget = (colIndex: number, slotMinutes: number, duration: number): boolean => {
      const col = columns[colIndex]
      if (!col) return false
      const windowForStaff = staffWindowsById[col._id]
      for (let m = slotMinutes; m < slotMinutes + duration; m += SLOT_MINUTES) {
        const inWindow = !windowForStaff || (windowForStaff.enabled && m >= windowForStaff.start && m < windowForStaff.end)
        if (!inWindow) return false
      }
      return true
    }

    const resolveHoverSlot = (
      clientX: number,
      clientY: number
    ): { colIndex: number; slotMinutes: number; valid: boolean } | null => {
      if (drag.mode !== "move" && drag.mode !== "resize-top") return null
      const el = blocksContainerRef.current
      if (!el || columns.length === 0) return null
      const rect = el.getBoundingClientRect()
      /** Match portal drag preview: highlight column/time from card position, not raw cursor. */
      let relX: number
      let relY: number
      if (dragStartRect) {
        const offsetX = drag.staffLocked ? 0 : clientX - drag.startX
        const offsetY = clientY - drag.startY
        const ghostTop = dragStartRect.top + offsetY
        const ghostLeftRaw = dragStartRect.left + offsetX
        relY = ghostTop - rect.top
        relX = ghostLeftRaw + dragStartRect.width / 2 - rect.left
      } else {
        relX = clientX - rect.left
        relY = clientY - rect.top
      }
      const colW = rect.width / columns.length
      const colIndexRaw = Math.floor(relX / colW)
      const slotIndex = Math.floor(relY / slotHeight)
      const slotMinutes = extendedStartMinutes + slotIndex * SLOT_MINUTES
      const dur = drag.duration ?? 60
      const inBoundsVert = slotMinutes >= extendedStartMinutes && slotMinutes < extendedEndMinutes
      if (drag.staffLocked) {
        const sourceIx = columns.findIndex((c) => c._id === drag.sourceStaffId)
        if (sourceIx < 0 || !inBoundsVert) return null
        const valid = isValidDropTarget(sourceIx, slotMinutes, dur)
        return { colIndex: sourceIx, slotMinutes, valid }
      }
      if (colIndexRaw < 0 || colIndexRaw >= columns.length || !inBoundsVert) return null
      const valid = isValidDropTarget(colIndexRaw, slotMinutes, dur)
      return { colIndex: colIndexRaw, slotMinutes, valid }
    }

    const clearAppointmentDragUi = () => {
      setDraggingApt(null)
      setDragOffsetY(0)
      setDragOffsetX(0)
      setDragStartRect(null)
      setDragHoverSlot(null)
      dragHoverSlotRef.current = null
      setTimeout(() => {
        justDraggedRef.current = false
      }, 0)
    }

    let lastHoverKey = ""
    /** Clicks (press + release) must not commit a move/resize; only intentional drags beyond this distance. */
    const dragCommitThresholdPx = Math.max(10, Math.floor(slotHeight * 0.28))
    const onMouseMove = (e: MouseEvent) => {
      if (showTimeChangeConfirm) return
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) >= dragCommitThresholdPx
      if (moved) justDraggedRef.current = true
      setDragOffsetY(e.clientY - drag.startY)
      if (drag.mode === "move" || drag.mode === "resize-top") {
        if (drag.staffLocked) setDragOffsetX(0)
        else setDragOffsetX(e.clientX - drag.startX)
        const slot = resolveHoverSlot(e.clientX, e.clientY)
        dragHoverSlotRef.current = slot
        const key = slot ? `${slot.colIndex}:${slot.slotMinutes}:${slot.valid}` : ""
        if (key !== lastHoverKey) {
          lastHoverKey = key
          setDragHoverSlot(slot)
        }
      }
    }
    const onMouseUp = async (e: MouseEvent) => {
      const current = drag
      const pointerMoved = Math.hypot(e.clientX - current.startX, e.clientY - current.startY) >= dragCommitThresholdPx
      if (!pointerMoved) {
        justDraggedRef.current = false
        clearAppointmentDragUi()
        return
      }

      const deltaY = e.clientY - current.startY
      const slotDelta = Math.round(deltaY / slotHeight)
      const minutesDelta = slotDelta * SLOT_MINUTES

      let hoverSlot: { colIndex: number; slotMinutes: number; valid: boolean } | null = null
      if (current.mode === "move" || current.mode === "resize-top") {
        hoverSlot = resolveHoverSlot(e.clientX, e.clientY)
        dragHoverSlotRef.current = hoverSlot
        setDragHoverSlot(hoverSlot)
      } else {
        hoverSlot = dragHoverSlotRef.current
      }

      const applyDrop = async (payload: { mode: "staff" | "move" | "resize-top" | "resize-bottom"; newStaffId?: string; newTime?: string; newDuration?: number }) => {
        // React 18 batches functional updaters in event handlers, so reading any
        // closure side-effect right after `setAppointments(...)` returns reads it
        // BEFORE the updater runs. Capture the snapshot synchronously from the
        // closure here so the rollback path always has the pre-drop state to
        // restore from, regardless of how soon the API request resolves.
        const closureRow = appointments.find((a) => a._id === current.id) ?? null
        if (!closureRow) {
          clearAppointmentDragUi()
          return
        }

        const snapshot = JSON.parse(JSON.stringify(closureRow)) as Appointment
        const aAny = closureRow as any
        let next: Appointment
        if (payload.mode === "staff" && payload.newStaffId) {
          const newStaff = columns.find((c) => c._id === payload.newStaffId)
          next = {
            ...closureRow,
            staffId: newStaff
              ? { _id: newStaff._id, name: newStaff.name, role: newStaff.role }
              : aAny.staffId,
            staffAssignments: [
              { staffId: { _id: payload.newStaffId!, name: newStaff?.name ?? "Staff" }, role: "primary" },
            ],
            ...(payload.newTime ? { time: payload.newTime, startAt: undefined, endAt: undefined } : {}),
          } as Appointment
        } else if ((payload.mode === "move" || payload.mode === "resize-top") && payload.newTime) {
          next = {
            ...closureRow,
            time: payload.newTime,
            startAt: undefined,
            endAt: undefined,
          } as Appointment
        } else if (payload.mode === "resize-bottom" && payload.newDuration != null) {
          next = {
            ...closureRow,
            duration: payload.newDuration,
            startAt: undefined,
            endAt: undefined,
          } as Appointment
        } else {
          clearAppointmentDragUi()
          return
        }

        setAppointments((prev) => {
          const idx = prev.findIndex((a) => a._id === current.id)
          if (idx < 0) return prev
          return prev.map((x, i) => (i === idx ? next : x))
        })

        clearAppointmentDragUi()
        setUpdatingTimeForId(current.id)

        try {
          let res: { success?: boolean; error?: string; data?: any } | null = null
          if (payload.mode === "staff" && payload.newStaffId) {
            const updatePayload: { staffId: string; staffAssignments: any[]; time?: string; allowParallelBooking: boolean } = {
              staffId: payload.newStaffId,
              staffAssignments: [{ staffId: payload.newStaffId, percentage: 100, role: "primary" }],
              allowParallelBooking: true,
            }
            if (payload.newTime) updatePayload.time = payload.newTime
            res = (await AppointmentsAPI.update(current.id, updatePayload)) as {
              success?: boolean
              error?: string
              data?: any
            }
          } else if ((payload.mode === "move" || payload.mode === "resize-top") && payload.newTime) {
            res = (await AppointmentsAPI.update(current.id, {
              time: payload.newTime,
              allowParallelBooking: true,
            })) as {
              success?: boolean
              error?: string
              data?: any
            }
          } else if (payload.mode === "resize-bottom" && payload.newDuration != null) {
            res = (await AppointmentsAPI.update(current.id, {
              duration: payload.newDuration,
              allowParallelBooking: true,
            })) as {
              success?: boolean
              error?: string
              data?: any
            }
          }
          if (!res?.success) {
            setAppointments((prev) =>
              prev.map((x) => (x._id === current.id ? snapshot : x))
            )
            toast({
              title: "Couldn't move appointment",
              description: res?.error || "Please try a different slot.",
              variant: "destructive",
            })
          } else {
            const successDescription = (() => {
              if (payload.mode === "staff" && payload.newStaffId) {
                const target = columns.find((c) => c._id === payload.newStaffId)
                const staffName = target?.name || "selected staff"
                if (payload.newTime) {
                  return `Reassigned to ${staffName} at ${formatAppointmentTime(payload.newTime)}.`
                }
                return `Reassigned to ${staffName}.`
              }
              if ((payload.mode === "move" || payload.mode === "resize-top") && payload.newTime) {
                return `Start time updated to ${formatAppointmentTime(payload.newTime)}.`
              }
              if (payload.mode === "resize-bottom" && payload.newDuration != null) {
                return `Duration updated to ${payload.newDuration} min.`
              }
              return undefined
            })()
            toast({ title: "Appointment updated", description: successDescription })
            // Resync with the server so populated client/service/staff fields refresh after the optimistic merge.
            void fetchAppointments()
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("appointments-refresh"))
            }
          }
        } catch (err) {
          console.error(err)
          setAppointments((prev) =>
            prev.map((x) => (x._id === current.id ? snapshot : x))
          )
          toast({
            title: "Couldn't move appointment",
            description: "Network error. Please try again.",
            variant: "destructive",
          })
        } finally {
          setUpdatingTimeForId(null)
        }
      }

      if (current.mode === "move") {
        if (!hoverSlot || !hoverSlot.valid) {
          clearAppointmentDragUi()
          return
        }
        const targetStaffId = columns[hoverSlot.colIndex]?._id ?? null
        const endMinutesBound = endMinutes - current.duration
        const newMinutes = Math.max(startMinutes, Math.min(endMinutesBound, hoverSlot.slotMinutes))
        const clamped = Math.floor(newMinutes / SLOT_MINUTES) * SLOT_MINUTES
        if (!isValidDropTarget(hoverSlot.colIndex, clamped, current.duration ?? 60)) {
          clearAppointmentDragUi()
          return
        }
        const clampedTime = slotMinutesToTimeString(clamped)
        const isStaffChange = columns.length > 1 && targetStaffId && targetStaffId !== current.sourceStaffId
        if (clamped === current.startTimeMinutes && !isStaffChange) {
          clearAppointmentDragUi()
          return
        }
        if (isStaffChange && current.staffLocked) {
          await applyDrop({ mode: "move", newTime: clampedTime })
        } else if (isStaffChange) {
          await applyDrop({ mode: "staff", newStaffId: targetStaffId!, newTime: clampedTime })
        } else {
          await applyDrop({ mode: "move", newTime: clampedTime })
        }
      } else if (current.mode === "resize-top") {
        if (!hoverSlot || !hoverSlot.valid) {
          clearAppointmentDragUi()
          return
        }
        const targetStaffId = columns[hoverSlot.colIndex]?._id ?? null
        const endMinutesBound = endMinutes - current.duration
        const newMinutes = Math.max(startMinutes, Math.min(endMinutesBound, hoverSlot.slotMinutes))
        const clamped = Math.floor(newMinutes / SLOT_MINUTES) * SLOT_MINUTES
        if (!isValidDropTarget(hoverSlot.colIndex, clamped, current.duration ?? 60)) {
          clearAppointmentDragUi()
          return
        }
        const clampedTime = slotMinutesToTimeString(clamped)
        const isStaffChange = columns.length > 1 && targetStaffId && targetStaffId !== current.sourceStaffId
        if (clamped === current.startTimeMinutes && !isStaffChange) {
          clearAppointmentDragUi()
          return
        }
        if (isStaffChange && current.staffLocked) {
          await applyDrop({ mode: "resize-top", newTime: clampedTime })
        } else if (isStaffChange) {
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
          clearAppointmentDragUi()
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
  }, [
    draggingApt,
    dragStartRect,
    startMinutes,
    endMinutes,
    extendedStartMinutes,
    extendedEndMinutes,
    showTimeChangeConfirm,
    columns,
    slotHeight,
    staffWindowsById,
    blockTimesByColumn,
    selectedDate,
  ])

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
          const extra = res as { warning?: string; overlappingAppointments?: unknown[] }
          if (Array.isArray(extra.overlappingAppointments) && extra.overlappingAppointments.length > 0) {
            toast({
              title: "Block updated",
              description:
                extra.warning ||
                "Existing appointments in this window are unchanged. The block stays visible on the calendar; bookings during this time are still allowed.",
            })
          }
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
        const updatePayload: { staffId: string; staffAssignments: any[]; time?: string; allowParallelBooking: boolean } = {
          staffId: pending.newStaffId,
          staffAssignments: [{ staffId: pending.newStaffId, percentage: 100, role: "primary" }],
          allowParallelBooking: true,
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
        res = await AppointmentsAPI.update(pending.id, {
          time: pending.newTime,
          allowParallelBooking: true,
        })
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
        res = await AppointmentsAPI.update(pending.id, {
          duration: pending.newDuration,
          allowParallelBooking: true,
        })
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
    return <CalendarGridSkeleton />
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
    <div className="flex flex-col h-full min-h-0 space-y-5 calendar-fade-transition w-full">
      {/* Section 5: Top Control Bar - Premium hierarchy */}
      <div className="flex flex-wrap items-center gap-4 shrink-0">
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
          showDensity
          density={density}
          onDensityChange={setDensity}
          showWalkIn
          showWalkInCards={showWalkInCards}
          onShowWalkInCardsChange={setShowWalkInCards}
          title="Calendar settings"
          description="View, density, and display options"
        />
      </div>

      {/* Section 1: Grid with soft gray bg, alternating hour shading. Section 6: key triggers fade on date change */}
      <div key={selectedDate} className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden border border-slate-200/80 bg-slate-50/50 shadow-sm">
        <div
          ref={scrollContainerRef}
          className="overflow-auto flex-1 min-h-0 bg-white/50"
        >
          <div
            className="grid w-full min-w-[600px] relative calendar-fade-transition"
            style={{
              gridTemplateColumns: `88px repeat(${Math.max(1, columns.length)}, minmax(140px, 1fr))`,
              gridTemplateRows: `${CALENDAR_STAFF_HEADER_HEIGHT_PX}px repeat(${totalSlotsWithSales}, ${slotHeight}px)`,
            }}
          >
            {/* Time column header - click to scroll to current time */}
            <button
              type="button"
              onClick={handleTimeHeaderClick}
              className={`sticky top-0 ${CALENDAR_STICKY_HEADER_Z_CLASS} border-b border-r border-slate-200/80 bg-slate-50 px-3 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-left w-full hover:bg-slate-100/80 transition-colors cursor-default`}
              title="Scroll to current time"
            >
              Time
            </button>
            {/* Section 4: Staff column headers with avatars */}
            {columns.length === 0 ? (
              <div className={`sticky top-0 ${CALENDAR_STICKY_HEADER_Z_CLASS} border-b border-r border-slate-200/80 bg-slate-50 px-4 py-3 font-medium text-slate-400 text-center`}>
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
                    className={`sticky top-0 ${CALENDAR_STICKY_HEADER_Z_CLASS} border-b border-r border-slate-200/80 bg-white/95 backdrop-blur-sm px-3 py-2 last:border-r-0 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] flex items-center justify-center min-w-0`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 max-w-full">
                      <Avatar className="h-11 w-11 shrink-0 border-2 border-violet-100 shadow-sm">
                        <AvatarImage src={col.avatar || undefined} alt={col.name} />
                        <AvatarFallback className="bg-violet-100 text-violet-700 font-semibold text-sm">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className="font-semibold text-slate-700 text-sm truncate leading-tight min-w-0"
                        title={col.name}
                      >
                        {col.name}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
            {timeSlots.map((slot, slotIndex) => {
              const isHourStart = slot.minutes % 60 === 0
              const isQuarterHour = slot.minutes % 15 === 0 && !isHourStart
              const rowTopBorder = isHourStart
                ? "border-t-[1.5px] border-t-slate-400"
                : isQuarterHour
                  ? "border-t border-t-slate-300/80"
                  : "border-t border-t-slate-200/55"
              const isLastRow = slotIndex === timeSlots.length - 1
              const rowBottomBorder = isLastRow ? "border-b border-b-slate-300/70" : ""
              const rowBorderClass = [rowTopBorder, rowBottomBorder].filter(Boolean).join(" ")
              const slotInVisibleStaffWorkHours =
                slot.minutes >= visibleStaffWorkBand.workStart &&
                slot.minutes < visibleStaffWorkBand.workEnd
              const hourIndex = Math.floor(slot.minutes / 60)
              const isAlternateHour = hourIndex % 2 === 1
              const now = new Date()
              const todayStr = format(now, "yyyy-MM-dd")
              const isToday = selectedDate === todayStr
              const currentMinutes = now.getHours() * 60 + now.getMinutes()
              const isCurrentHourRow =
                isToday && hourIndex === Math.floor(currentMinutes / 60)

              let timeColFill = "rgb(255 255 255)"
              if (columns.length > 0 && !slotInVisibleStaffWorkHours) {
                timeColFill = "rgb(248 250 252)"
              } else if (isCurrentHourRow) {
                timeColFill = "rgba(255, 251, 235, 0.3)"
              } else if (isAlternateHour) {
                timeColFill = "rgba(248, 250, 252, 0.4)"
              }
              const timeColStyle: CSSProperties = {
                height: slotHeight,
                backgroundColor: timeColFill,
              }
              const emptySlotMenuOpen =
                !!slotActionDialog &&
                slotActionDialog.date === selectedDate &&
                parseTimeToMinutes(slotActionDialog.time) === slot.minutes &&
                slotActionDialog.staffId === null
              let emptyGridFill = timeColFill
              if (emptySlotMenuOpen) emptyGridFill = "rgba(245, 243, 255, 0.4)"
              const emptyGridGuideStyle = fiveMinuteGridGuidesStyle(emptyGridFill, slotHeight)
              return (
                <Fragment key={`row-${slot.minutes}`}>
                  <div
                    className="border-r border-slate-200/80 px-2 py-1 text-[11px] sm:text-xs text-slate-500 flex items-center text-left tabular-nums font-medium leading-tight"
                    style={timeColStyle}
                  >
                    {slot.label}
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
                      className={`w-full border-r border-slate-200/80 last:border-r-0 text-left ${rowBorderClass} transition-colors duration-150 bg-transparent hover:shadow-[inset_0_0_0_9999px_rgba(237,233,254,0.55)] hover:ring-1 hover:ring-violet-200/60 hover:ring-inset cursor-default ${
                        emptySlotMenuOpen ? "ring-2 ring-violet-500 ring-inset z-[1] relative" : ""
                      }`}
                      style={{ height: slotHeight, minHeight: slotHeight, ...emptyGridGuideStyle }}
                      onMouseEnter={(e) =>
                        showSlotHoverTip(`New appointment at ${slotMinutesToTimeString(slot.minutes)}`, e)
                      }
                      onMouseMove={moveSlotHoverTip}
                      onMouseLeave={hideSlotHoverTip}
                      aria-label={`New appointment at ${slotMinutesToTimeString(slot.minutes)}`}
                    />
                  ) : (
                    columns.map((col, colIndex) => {
                      const windowForStaff = staffWindowsById[col._id]
                      const inWindow =
                        !windowForStaff ||
                        (windowForStaff.enabled &&
                          slot.minutes >= windowForStaff.start &&
                          slot.minutes < windowForStaff.end)
                      let isInDragHighlight = false
                      let isDragHighlightValid = false
                      if (draggingApt) {
                        const d = draggingApt.duration ?? 60
                        if (draggingApt.mode === "move" || draggingApt.mode === "resize-top") {
                          if (dragHoverSlot) {
                            const endBound = endMinutes - d
                            const newM = Math.max(startMinutes, Math.min(endBound, dragHoverSlot.slotMinutes))
                            const clampedStart = Math.floor(newM / SLOT_MINUTES) * SLOT_MINUTES
                            if (
                              colIndex === dragHoverSlot.colIndex &&
                              slot.minutes >= clampedStart &&
                              slot.minutes < clampedStart + d
                            ) {
                              isInDragHighlight = true
                              isDragHighlightValid = dragHoverSlot.valid
                            }
                          }
                        } else if (draggingApt.mode === "resize-bottom") {
                          const sourceIx = columns.findIndex((c) => c._id === draggingApt.sourceStaffId)
                          if (sourceIx >= 0) {
                            const slotDelta = Math.round(dragOffsetY / slotHeight)
                            const minutesDelta = slotDelta * SLOT_MINUTES
                            const minDuration = SLOT_MINUTES
                            const maxEndMinutes = endMinutes - draggingApt.startTimeMinutes
                            let previewDuration = draggingApt.duration + minutesDelta
                            previewDuration = Math.max(minDuration, Math.min(maxEndMinutes, previewDuration))
                            previewDuration = Math.floor(previewDuration / SLOT_MINUTES) * SLOT_MINUTES
                            const startM = draggingApt.startTimeMinutes
                            if (
                              colIndex === sourceIx &&
                              slot.minutes >= startM &&
                              slot.minutes < startM + previewDuration
                            ) {
                              isInDragHighlight = true
                              isDragHighlightValid = isValidDropTargetForDrag(sourceIx, startM, previewDuration)
                            }
                          }
                        }
                      }
                      const slotMenuOpen =
                        slotActionDialog &&
                        slotActionDialog.date === selectedDate &&
                        parseTimeToMinutes(slotActionDialog.time) === slot.minutes &&
                        slotActionDialog.staffId === col._id
                      let staffFill = "rgb(255 255 255)"
                      if (isDragHighlightValid) {
                        staffFill = "rgba(91, 33, 182, 0.5)"
                      } else if (isInDragHighlight && !isDragHighlightValid) {
                        staffFill = "rgba(153, 27, 27, 0.48)"
                      } else if (!inWindow) {
                        staffFill = slotInVisibleStaffWorkHours ? "rgb(226 232 240)" : "rgb(248 250 252)"
                      } else if (slotMenuOpen) {
                        staffFill = "rgba(245, 243, 255, 0.5)"
                      } else if (isCurrentHourRow) {
                        staffFill = "rgba(255, 251, 235, 0.2)"
                      } else if (isAlternateHour) {
                        staffFill = "rgba(248, 250, 252, 0.4)"
                      }
                      const staffCellGuideStyle = fiveMinuteGridGuidesStyle(staffFill, slotHeight)
                      const staffSlotTip = inWindow
                        ? `New appointment with ${col.name} at ${slotMinutesToTimeString(slot.minutes)}`
                        : `Unavailable at ${slotMinutesToTimeString(slot.minutes)} (outside working hours)`
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
                        onMouseEnter={(e) => showSlotHoverTip(staffSlotTip, e)}
                        onMouseMove={moveSlotHoverTip}
                        onMouseLeave={hideSlotHoverTip}
                        className={`w-full border-r border-slate-200/80 last:border-r-0 ${rowBorderClass} ${
                          draggingApt && (draggingApt.mode === "move" || draggingApt.mode === "resize-top")
                            ? ""
                            : "transition-colors duration-150 hover:transition-colors"
                        } bg-transparent pointer-events-auto ${
                          isDragHighlightValid
                            ? "ring-2 ring-violet-700/80 ring-inset"
                            : isInDragHighlight && !isDragHighlightValid
                            ? "ring-2 ring-red-600/85 ring-inset"
                            : inWindow
                            ? "hover:shadow-[inset_0_0_0_9999px_rgba(237,233,254,0.55)] hover:ring-1 hover:ring-violet-200/60 hover:ring-inset cursor-default"
                            : "calendar-outside-hours cursor-not-allowed"
                        } ${
                          slotMenuOpen && !isInDragHighlight ? "ring-2 ring-violet-500 ring-inset z-[1] relative" : ""
                        }`}
                        style={{ height: slotHeight, minHeight: slotHeight, ...staffCellGuideStyle }}
                        aria-label={staffSlotTip}
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
                className={`absolute left-[88px] right-0 bottom-0 min-w-[520px] ${CALENDAR_APPOINTMENTS_OVERLAY_Z_CLASS} pointer-events-none`}
                style={{
                  top: CALENDAR_STAFF_HEADER_HEIGHT_PX,
                  height: totalSlotsWithSales * slotHeight,
                }}
              >
              {columns.map((col, colIndex) => {
                return (
                <div
                  key={`blocks-${col._id}`}
                  className="absolute top-0 bottom-0 w-full pointer-events-none"
                  style={{
                    left: `${colIndex * (100 / columns.length)}%`,
                    width: `${100 / columns.length}%`,
                  }}
                >
                  {(stackLayoutByColumn[col._id] || [])
                    .filter((e): e is Extract<CalendarStackLayoutItem, { kind: "appointment" }> => e.kind === "appointment")
                    .map(({ apt, top, height, left, width }) => {
                    const a = apt as any
                    const serviceNames = getServiceDisplayNames(a)
                    const clientName = a?.clientId?.name || "Client"
                    const isDragging = draggingApt?.id === apt._id
                    const isUpdating = updatingTimeForId === apt._id
                    const staffLockedCard = a.staffLocked === true
                    const cardVisualStatus = getCalendarCardVisualStatus(apt, partialPaymentAppointmentIds)
                    const canDrag =
                      !isHiddenAppointment(apt) &&
                      apt.status !== "completed" &&
                      apt.status !== "missed" &&
                      cardVisualStatus !== "partial_payment"
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
                    const gridWin = getAppointmentGridWindowMinutes(apt as any)
                    let timeRangeStr: string
                    let displayDurationMinutes = getTotalDuration(apt as any)
                    if (
                      isDragging &&
                      draggingApt &&
                      draggingApt.id === apt._id &&
                      (draggingApt.mode === "move" || draggingApt.mode === "resize-top")
                    ) {
                      const dur = draggingApt.duration ?? getTotalDuration(apt as any)
                      const previewStart = previewStartMinutesForMoveOrResizeTopDrag({
                        baselineStartMinutes: draggingApt.startTimeMinutes,
                        duration: dur,
                        hoverSlot: dragHoverSlot,
                        dragOffsetY,
                        slotHeightPx: slotHeight,
                        calendarStartMinutes: startMinutes,
                        calendarEndMinutes: endMinutes,
                      })
                      timeRangeStr = formatTimeRangeFromSlotMinutes(previewStart, previewStart + dur)
                      displayDurationMinutes = dur
                    } else if (isDragging && draggingApt && draggingApt.id === apt._id && draggingApt.mode === "resize-bottom") {
                      const previewDur = previewDurationForResizeBottomDrag({
                        startTimeMinutes: draggingApt.startTimeMinutes,
                        baselineDuration: draggingApt.duration,
                        dragOffsetY,
                        slotHeightPx: slotHeight,
                        calendarEndMinutes: endMinutes,
                      })
                      displayDurationMinutes = previewDur
                      const startM = draggingApt.startTimeMinutes
                      timeRangeStr = formatTimeRangeFromSlotMinutes(startM, startM + previewDur)
                    } else if (gridWin) {
                      timeRangeStr = `${format(new Date(2000, 0, 1, Math.floor(gridWin.startM / 60), Math.floor(gridWin.startM % 60), 0), "h:mma")} – ${format(
                        new Date(2000, 0, 1, Math.floor(gridWin.endM / 60), Math.floor(gridWin.endM % 60), 0),
                        "h:mma"
                      )}`.toLowerCase()
                    } else {
                      const endTimeStr = slotMinutesToTimeString(parseTimeToMinutes(apt.time) + getTotalDuration(apt as any))
                      timeRangeStr = `${formatAppointmentTime(apt.time)} – ${formatAppointmentTime(endTimeStr)}`
                    }
                    const groupAccentRing = (apt as Appointment).bookingGroupId
                      ? groupAccents.get((apt as Appointment).bookingGroupId as string)
                      : undefined
                    const clientEmail = (a?.clientId?.email || "").trim()
                    const clientPhone = (a?.clientId?.phone || "").trim()
                    const hoverServiceTitle =
                      serviceNames.length === 1
                        ? serviceNames[0]
                        : serviceNames.length > 1
                          ? serviceNames.join(", ")
                          : "Service"
                    const hoverPriceLabel = formatAmountWithSymbol(typeof apt.price === "number" ? apt.price : 0, {
                      enableCurrency: true,
                      currency: "INR",
                    })
                    const hoverDurationLabel = formatDurationHuman(getTotalDuration(apt as any))
                    const hoverStaffName = getPrimaryStaffName(apt)
                    const sharesColumnRightEdge = left + width >= 99.9
                    const fullHeight = resizeBottomHeight
                    const shrinkHover = hoverShrinkAptId === apt._id && !isDragging && sharesColumnRightEdge
                    const rawGroupId = (apt as Appointment).bookingGroupId
                    const bookingGroupIdStr =
                      rawGroupId != null && String(rawGroupId).trim() !== ""
                        ? String(rawGroupId)
                        : undefined
                    const showLinkedHoverOutline = Boolean(
                      bookingGroupIdStr && hoveredBookingGroupId && bookingGroupIdStr === hoveredBookingGroupId
                    )

                    const blockTop = top
                    const blockBottom = top + fullHeight
                    const maxSlotIndex = totalSlotsWithSales - 1
                    const firstSlotIndex = Math.max(0, Math.min(maxSlotIndex, Math.floor(blockTop / slotHeight)))
                    const lastSlotIndex = Math.max(0, Math.min(maxSlotIndex, Math.ceil(blockBottom / slotHeight) - 1))
                    const slotRowStrips: { relTop: number; height: number; slotM: number }[] = []
                    for (let si = firstSlotIndex; si <= lastSlotIndex; si++) {
                      const rowTopGlobal = si * slotHeight
                      const rowBottomGlobal = rowTopGlobal + slotHeight
                      const intersectTop = Math.max(blockTop, rowTopGlobal)
                      const intersectBottom = Math.min(blockBottom, rowBottomGlobal)
                      let h = intersectBottom - intersectTop
                      if (h <= 0) continue
                      let relTop = intersectTop - blockTop
                      const minStripH = Math.min(slotHeight, Math.max(6, slotHeight * 0.1))
                      if (h < minStripH) {
                        const grow = minStripH - h
                        relTop = Math.max(0, relTop - grow / 2)
                        h = Math.min(minStripH, fullHeight - relTop)
                      }
                      if (h <= 0) continue
                      slotRowStrips.push({
                        relTop,
                        height: Math.min(h, fullHeight - relTop),
                        slotM: extendedStartMinutes + si * SLOT_MINUTES,
                      })
                    }

                    const showStatusContextMenu = canChangeAppointmentStatusViaContextMenu(apt)
                    const statusMenuBusy = cardStatusMenuUpdatingId === apt._id

                    return (
                      <div
                        data-calendar-appt-slot
                        key={apt._id}
                        className={`absolute pointer-events-auto select-none rounded-md ${
                          showLinkedHoverOutline && !isDragging
                            ? "z-[15] shadow-[0_0_0_2px_rgb(124,58,237)]"
                            : "z-10"
                        }`}
                        style={{
                          top,
                          left: `${left}%`,
                          width: `${width}%`,
                          height: fullHeight,
                          transform: (draggingApt?.mode === "move" || draggingApt?.mode === "resize-top") ? undefined : (transformParts.length > 0 ? transformParts.join(" ") : undefined),
                        }}
                        onMouseEnter={() => {
                          if (!isDragging) {
                            cancelClearBookingGroupHover()
                            setHoverShrinkAptId(apt._id)
                            setHoveredBookingGroupId(bookingGroupIdStr ?? null)
                          }
                        }}
                        onMouseLeave={() => {
                          setHoverShrinkAptId((cur) => (cur === apt._id ? null : cur))
                          scheduleClearBookingGroupHover()
                        }}
                        onClick={(e) => {
                          if (justDraggedRef.current) return
                          if ((e.target as HTMLElement).closest("[data-appointment-card]")) {
                            e.stopPropagation()
                            return
                          }
                          if ((e.target as HTMLElement).closest("[data-appt-side-strip]")) {
                            return
                          }
                          e.stopPropagation()
                          openAppointmentFromCalendarCard(apt)
                        }}
                      >
                        <div
                          className={`relative z-10 flex h-full min-h-0 flex-col items-start min-w-0 overflow-hidden ${
                            shrinkHover ? "w-[90%]" : "w-full"
                          }`}
                        >
                        <HoverCard
                          open={clientHoverDetailOpenForId === apt._id}
                          onOpenChange={(nextOpen) => {
                            if (!nextOpen)
                              setClientHoverDetailOpenForId((cur) => (cur === apt._id ? null : cur))
                          }}
                          openDelay={50}
                          closeDelay={0}
                        >
                          {(() => {
                            const cardDiv = (
                        <div
                          data-appointment-card
                          className={`group relative flex h-full min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden rounded-md text-left animate-appointment-card-enter ${
                            isDragging && (draggingApt?.mode === "move" || draggingApt?.mode === "resize-top")
                              ? "transition-none opacity-0"
                              : isDragging
                                ? "transition-none opacity-90"
                              : staffLockedCard
                                ? `shadow-[0_0_0_3px_rgb(217,119,6)] duration-[180ms] ease-out ${groupAccentRing ? `ring-2 ${groupAccentRing}` : ""}`
                                : `duration-[180ms] ease-out ${groupAccentRing ? `ring-2 ${groupAccentRing}` : ""}`
                          } ${isUpdating ? "opacity-70" : ""}`}
                          style={{
                            minWidth: 0,
                            transition: isDragging ? "none" : "width 180ms ease-out, box-shadow 180ms ease-out",
                            boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.12)" : "0 4px 12px rgba(0,0,0,0.06)",
                          }}
                          onMouseEnter={(e) => {
                            if (!isDragging) {
                              e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)"
                              setClientHoverDetailOpenForId(apt._id)
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isDragging) e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)"
                            setClientHoverDetailOpenForId((cur) => (cur === apt._id ? null : cur))
                          }}
                          onClick={(e) => {
                            if (
                              isDragging &&
                              draggingApt?.id === apt._id &&
                              (draggingApt.mode === "move" || draggingApt.mode === "resize-top")
                            ) {
                              e.preventDefault()
                              e.stopPropagation()
                            }
                          }}
                        >
                        {/* Drag handle - top */}
                        <div
                          className={`absolute top-0 left-0 right-0 z-20 h-3 flex flex-col items-center justify-center ${canDrag ? "!cursor-grab active:!cursor-grabbing hover:bg-black/[0.06]" : ""}`}
                          aria-hidden
                          onMouseDown={(e) => {
                            if (canDrag) handleResizeStart(e, apt, "resize-top")
                          }}
                          title={
                            staffLockedCard
                              ? "Drag vertically to change start time (stylist stays fixed)"
                              : canDrag
                                ? "Drag to change start time or reassign staff"
                                : undefined
                          }
                        >
                          {canDrag && (
                            <div className="pointer-events-none w-6 h-0.5 rounded-full bg-slate-400/50" aria-hidden />
                          )}
                        </div>
                        {/* Main card body */}
                        <div
                          className={`relative flex-1 rounded-md pl-3 pr-3 pt-6 pb-4 min-h-0 overflow-hidden border ${getStatusCardFill(cardVisualStatus)} ${
                            staffLockedCard ? "!border-[3px] !border-amber-600" : ""
                          } ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                          onMouseDown={(e) => {
                            if (canDrag) handleTimeDragStart(e, apt)
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (justDraggedRef.current) {
                              justDraggedRef.current = false
                              return
                            }
                            openAppointmentFromCalendarCard(apt)
                          }}
                          title={
                            staffLockedCard
                              ? "Drag vertically to move time — staff stays on this column • Click for details"
                              : canDrag
                                ? "Drag to move • Click for details"
                                : "Click to view details"
                          }
                        >
                          {staffLockedCard && (
                            <div
                              className="pointer-events-none absolute top-2 right-2 z-[5]"
                              title="Client requested this stylist"
                              aria-label="Client requested this stylist"
                            >
                              <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-600 drop-shadow-sm" aria-hidden />
                            </div>
                          )}
                          <div className="flex min-w-0 items-center gap-1.5 text-slate-500 text-[12px] tabular-nums leading-tight">
                            <span className="truncate">
                              {timeRangeStr} · {displayDurationMinutes} min
                            </span>
                            {isOnlineBookingAppointment(a) && (
                              <span className={ONLINE_BOOKING_PILL_CLASS} title="Booked online">
                                Online
                              </span>
                            )}
                          </div>
                          <div
                            className={`font-semibold text-slate-800 text-[14px] truncate leading-tight mt-1 ${staffLockedCard ? "pr-7" : ""}`}
                          >
                            {clientName}
                          </div>
                          {serviceNames.length === 1 ? (
                            <div className="text-slate-600 text-[13px] font-medium mt-1 truncate">{serviceNames[0]}</div>
                          ) : (
                            <ul className="text-slate-600 text-[13px] font-medium mt-1 list-disc list-inside space-y-0.5">
                              {serviceNames.map((name, i) => (
                                <li key={i} className="truncate">{name}</li>
                              ))}
                            </ul>
                          )}
                          {(groupAccentRing ||
                            (a.prepaidAtBooking && apt.status !== "completed" && !isHiddenAppointment(apt))) && (
                            <div className="flex items-center gap-1 flex-wrap justify-end shrink-0 mt-2">
                              {groupAccentRing && (
                                <span
                                  className="text-[10px] font-semibold text-slate-600 bg-white px-1.5 py-0.5 rounded-md border border-slate-200"
                                  title="Linked to a multi-service booking"
                                >
                                  Linked
                                </span>
                              )}
                              {a.prepaidAtBooking && apt.status !== "completed" && !isHiddenAppointment(apt) && (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                  Paid
                                </span>
                              )}
                            </div>
                          )}
                          {apt.notes && (
                            <div className="mt-1.5 truncate border-t border-slate-100 pt-1.5 text-[11px] italic text-slate-400">
                              {apt.notes}
                            </div>
                          )}
                        </div>
                        {/* Resize handle - bottom (visible on card hover) */}
                        <div
                          className={`absolute bottom-0 left-0 right-0 z-20 h-4 flex items-center justify-center bg-slate-100/80 ${
                            canDrag
                              ? "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 hover:bg-slate-200/80 cursor-n-resize active:bg-slate-300/80"
                              : "pointer-events-none opacity-0"
                          }`}
                          aria-hidden
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            if (canDrag) handleResizeStart(e, apt, "resize-bottom")
                          }}
                          title={
                            staffLockedCard
                              ? "Drag to change duration"
                              : canDrag
                                ? "Drag to extend or shorten duration"
                                : undefined
                          }
                        >
                          {canDrag && (
                            <div className="pointer-events-none w-8 h-1 rounded-full bg-slate-400/60" aria-hidden />
                          )}
                        </div>
                        </div>
                            )
                            const withHoverTrigger = (
                              <HoverCardTrigger asChild>{cardDiv}</HoverCardTrigger>
                            )
                            if (!showStatusContextMenu) return withHoverTrigger
                            return (
                              <ContextMenu>
                                <ContextMenuTrigger asChild>{withHoverTrigger}</ContextMenuTrigger>
                                <ContextMenuContent className="w-52" onClick={(e) => e.stopPropagation()}>
                                  <ContextMenuLabel>Change status</ContextMenuLabel>
                                  <ContextMenuSeparator />
                                  {APPOINTMENT_CARD_CONTEXT_STATUS_OPTIONS.map((opt) => (
                                    <ContextMenuItem
                                      key={opt.value}
                                      disabled={statusMenuBusy || apt.status === opt.value}
                                      onSelect={() => {
                                        void handleCalendarCardQuickStatus(apt, opt.value)
                                      }}
                                    >
                                      {opt.label}
                                    </ContextMenuItem>
                                  ))}
                                </ContextMenuContent>
                              </ContextMenu>
                            )
                          })()}
                          <HoverCardContent
                            side={colIndex === 0 ? "right" : "left"}
                            align="start"
                            sideOffset={10}
                            className="w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200/90 bg-white p-0 text-slate-900 shadow-lg shadow-slate-200/40"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-violet-50/40 px-4 py-2.5">
                              <span className="text-sm font-semibold tabular-nums tracking-tight text-slate-800">{timeRangeStr}</span>
                              <span className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 shadow-sm">
                                {getStatusText(cardVisualStatus)}
                              </span>
                            </div>
                            <div className="space-y-4 bg-white p-4">
                              <div className="flex gap-3">
                                <Avatar className="h-11 w-11 shrink-0 border border-slate-200 bg-violet-100 text-violet-800">
                                  <AvatarFallback className="bg-violet-100 text-base font-semibold text-violet-800">
                                    {(clientName || "?").charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="truncate font-semibold leading-tight text-slate-900">{clientName}</div>
                                  {clientPhone ? (
                                    <div className="truncate text-xs text-slate-600 tabular-nums">
                                      <a
                                        href={`tel:${clientPhone.replace(/\s/g, "")}`}
                                        className="text-inherit hover:text-violet-700 underline-offset-2 hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {clientPhone}
                                      </a>
                                    </div>
                                  ) : null}
                                  {clientEmail ? (
                                    <div className="truncate text-xs text-slate-500">{clientEmail}</div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="line-clamp-2 text-sm font-medium leading-snug text-slate-800">{hoverServiceTitle}</span>
                                  <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700">{hoverPriceLabel}</span>
                                </div>
                                <div className="mt-1.5 text-xs text-slate-500">
                                  {hoverDurationLabel}
                                  <span className="text-slate-300"> • </span>
                                  {hoverStaffName}
                                </div>
                              </div>
                              {apt.notes?.trim() ? (
                                <div className="rounded-lg border border-slate-200/90 bg-amber-50/40 px-3 py-2">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    Note
                                  </div>
                                  <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                                    {apt.notes.trim()}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                        </div>
                        {shrinkHover &&
                          !isDragging &&
                          slotRowStrips.map(({ relTop, height, slotM }) => {
                            const windowForStaff = staffWindowsById[col._id]
                            const inWorkWindow =
                              !windowForStaff ||
                              (windowForStaff.enabled &&
                                slotM >= windowForStaff.start &&
                                slotM < windowForStaff.end)
                            const timeLabel = slotMinutesToTimeString(slotM)
                            const label = inWorkWindow
                              ? `New appointment with ${col.name} at ${timeLabel}`
                              : `Unavailable at ${timeLabel} (outside working hours)`
                            return (
                              <div
                                key={`${apt._id}-add-row-${slotM}`}
                                data-appt-side-strip
                                className="absolute z-[25] cursor-pointer border-l border-slate-200/50 rounded-sm transition-colors duration-150 hover:bg-violet-100/85 hover:shadow-[inset_0_0_0_9999px_rgba(237,233,254,0.45)] hover:ring-1 hover:ring-inset hover:ring-violet-200/60"
                                style={{ left: "90%", width: "10%", top: relTop, height }}
                                onMouseEnter={(e) => showSlotHoverTip(label, e)}
                                onMouseMove={moveSlotHoverTip}
                                onMouseLeave={hideSlotHoverTip}
                                aria-label={label}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (justDraggedRef.current) return
                                  if (!inWorkWindow) return
                                  setSlotActionDialog({
                                    date: selectedDate,
                                    time: slotMinutesToTimeString(slotM),
                                    staffId: col._id,
                                    staffName: col.name,
                                    clientX: e.clientX,
                                    clientY: e.clientY,
                                  })
                                }}
                              />
                            )
                          })}
                      </div>
                    )
                  })}
                  {(stackLayoutByColumn[col._id] || [])
                    .filter((e): e is Extract<CalendarStackLayoutItem, { kind: "sale" }> => e.kind === "sale")
                    .map(({ sale, serviceItem, itemKey, top, height, startM, endM, left, width }) => {
                    const serviceName = serviceItem?.name || "Service"
                    const isWalkInApt = (sale as any)?.__isWalkInAppointment === true
                    const billNo = sale?.billNo
                    return (
                      <div
                        data-sale-card
                        key={itemKey}
                        className={`group absolute overflow-hidden text-left flex flex-col z-10 pointer-events-auto animate-appointment-card-enter transition-all duration-[180ms] ease-out hover:-translate-y-0.5 ${billNo ? "cursor-pointer" : "cursor-default"}`}
                        style={{
                          top,
                          left: `${left}%`,
                          width: `${width}%`,
                          height: Math.max(slotHeight * 0.6, height),
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)" }}
                        onClick={billNo ? () => void openSaleInvoicePreview(billNo) : undefined}
                        title={
                          billNo
                            ? `Bill #${billNo} • Click to preview invoice`
                            : isWalkInApt
                            ? "Walk-in service added during checkout"
                            : "Walk-in service"
                        }
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
                            {billNo ? `Bill #${billNo}` : "Walk-in"}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {(stackLayoutByColumn[col._id] || [])
                    .filter((e): e is Extract<CalendarStackLayoutItem, { kind: "block" }> => e.kind === "block")
                    .map(({ block, top, height, left, width }) => {
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
                        className={`absolute shadow-sm border overflow-hidden text-left bg-red-50 border-red-200 flex flex-col z-10 pointer-events-auto transition-opacity ${isResizing ? "ring-2 ring-red-400/80 opacity-90" : ""} ${isUpdating ? "opacity-70" : ""}`}
                        style={{
                          top: displayTop,
                          height: displayHeight,
                          left: `${left}%`,
                          width: `${width}%`,
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
                          className="flex items-stretch flex-1 min-w-0 pt-6 pb-2 cursor-default hover:bg-red-100/50 transition-colors text-left border-0 bg-transparent w-full"
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
                CALENDAR_STAFF_HEADER_HEIGHT_PX +
                ((currentMinutes - extendedStartMinutes) / SLOT_MINUTES) * slotHeight
              return (
                <div
                  className={`absolute left-0 right-0 ${CALENDAR_NOW_LINE_Z_CLASS} pointer-events-none flex items-center`}
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

      {/* Drag preview — tracks card position; rendered in portal to avoid overflow clipping */}
      {draggingApt && dragStartRect && typeof document !== "undefined" && (draggingApt.mode === "move" || draggingApt.mode === "resize-top") && (() => {
        const apt = appointments.find((a) => a._id === draggingApt.id)
        if (!apt) return null
        const a = apt as any
        const serviceNames = getServiceDisplayNames(a)
        const clientName = a?.clientId?.name || "Client"
        const dur = draggingApt.duration ?? getTotalDuration(a)
        const previewStart = previewStartMinutesForMoveOrResizeTopDrag({
          baselineStartMinutes: draggingApt.startTimeMinutes,
          duration: dur,
          hoverSlot: dragHoverSlot,
          dragOffsetY,
          slotHeightPx: slotHeight,
          calendarStartMinutes: startMinutes,
          calendarEndMinutes: endMinutes,
        })
        const timeRangeStr = formatTimeRangeFromSlotMinutes(previewStart, previewStart + dur)
        const gridEl = blocksContainerRef.current
        const rawPreviewLeft =
          dragStartRect.left + (draggingApt.staffLocked === true ? 0 : dragOffsetX)
        let previewLeft = rawPreviewLeft
        if (gridEl && columns.length > 0) {
          const gridRect = gridEl.getBoundingClientRect()
          const colW = gridRect.width / columns.length
          let colIndex: number
          if (draggingApt.staffLocked === true) {
            colIndex = Math.max(0, columns.findIndex((c) => c._id === draggingApt.sourceStaffId))
          } else if (dragHoverSlot) {
            colIndex = dragHoverSlot.colIndex
          } else {
            const ghostCenterX = rawPreviewLeft + dragStartRect.width / 2
            const relXGhost = ghostCenterX - gridRect.left
            colIndex = Math.floor(relXGhost / colW)
            colIndex = Math.max(0, Math.min(columns.length - 1, colIndex))
          }
          const colLeft = gridRect.left + colIndex * colW
          const colRight = colLeft + colW
          const w = dragStartRect.width
          previewLeft = Math.min(Math.max(rawPreviewLeft, colLeft), Math.max(colLeft, colRight - w))
        }

        return createPortal(
          <div
            className={`fixed z-[9999] overflow-hidden rounded-md shadow-xl bg-white pointer-events-none cursor-grabbing ${
              a.staffLocked === true
                ? "border-[3px] border-amber-600 ring-2 ring-amber-500/90"
                : "border border-slate-200/80"
            }`}
            style={{
              left: previewLeft,
              top: dragStartRect.top + dragOffsetY,
              width: dragStartRect.width,
              height: dragStartRect.height,
            }}
          >
            <div className="relative pl-[14px] pr-3 pt-6 pb-3 h-full flex flex-col justify-center">
              {(a.staffLocked === true) && (
                <div
                  className="pointer-events-none absolute top-2 right-2"
                  title="Client requested this stylist"
                  aria-hidden
                >
                  <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-600 drop-shadow-sm" />
                </div>
              )}
              <div className="text-slate-500 text-[12px] tabular-nums truncate">
                {timeRangeStr} · {dur} min
              </div>
              <div className={`font-semibold text-slate-800 text-[14px] truncate mt-1 ${a.staffLocked === true ? "pr-7" : ""}`}>
                {clientName}
              </div>
              {serviceNames.length === 1 ? (
                <div className="text-slate-600 text-[13px] font-medium mt-1 truncate">{serviceNames[0]}</div>
              ) : (
                <ul className="text-slate-600 text-[13px] font-medium mt-1 list-disc list-inside space-y-0.5">
                  {serviceNames.map((name, i) => <li key={i} className="truncate">{name}</li>)}
                </ul>
              )}
            </div>
          </div>,
          document.body
        )
      })()}

      {slotHoverTip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[10000] max-w-[min(100vw-1.5rem,22rem)] rounded-md border border-slate-200 bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md leading-snug"
            style={{ left: slotHoverTip.clientX + 12, top: slotHoverTip.clientY + 12 }}
          >
            {slotHoverTip.text}
          </div>,
          document.body
        )}

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
            <div className="absolute inset-0 bg-slate-900/[0.04]" />
            <div
              className="absolute z-10 w-[min(100vw-1.5rem,22rem)] rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/80 overflow-hidden"
              style={{
                left: slotActionDialog.clientX,
                top: slotActionDialog.clientY,
                transform: slotActionDialog.clientY >= 260
                  ? "translate(8px, -100%) translateY(-8px)"
                  : "translate(8px, 8px)",
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Slot actions"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 bg-white">
                <span className="text-sm font-semibold text-slate-800 tabular-nums">
                  {formatAppointmentTime(slotActionDialog.time)}
                </span>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                  aria-label="Close"
                  onClick={() => setSlotActionDialog(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="py-1" aria-label="Add to calendar">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-violet-50/90 transition-colors"
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
                  <Calendar className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
                  Add appointment
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-violet-50/90 transition-colors"
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
                  <Ban className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  Add blocked time
                </button>
              </nav>
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
                const prepaid = !!a.prepaidAtBooking
                const paymentStatus = linkedSale?.paymentStatus
                  ? (linkedSale.paymentStatus.remainingAmount <= 0 ? "Paid" : linkedSale.paymentStatus.paidAmount > 0 ? "Partial" : "Unpaid")
                  : prepaid
                    ? "Paid"
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
                        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                          {selectedAppointment.status === "scheduled" ||
                          selectedAppointment.status === "confirmed" ? (
                            <>
                              <Button
                                onClick={() => handleMarkStatus("arrived")}
                                disabled={updatingStatus}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                              >
                                {updatingStatus ? "Updating..." : "Mark as Arrived"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleMarkStatus("missed")}
                                disabled={updatingStatus}
                                size="sm"
                                className="shrink-0 border-rose-300 text-rose-800 hover:bg-rose-50"
                              >
                                {updatingStatus ? "Updating..." : "No show"}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                onClick={() => handleMarkStatus("service_started")}
                                disabled={updatingStatus}
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                              >
                                {updatingStatus ? "Updating..." : "Service Started"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleMarkStatus("missed")}
                                disabled={updatingStatus}
                                size="sm"
                                className="shrink-0 border-rose-300 text-rose-800 hover:bg-rose-50"
                              >
                                {updatingStatus ? "Updating..." : "No show"}
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
                        <div>{timeFrom && timeTo ? `${timeFrom} – ${timeTo}` : timeFrom || "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Total Duration</div>
                        <div>{duration} min</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Stylist Name</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{staffName}</span>
                          {(a.staffLocked === true) && (
                            <Badge
                              variant="outline"
                              className="text-[11px] font-semibold gap-1 border-amber-300 bg-amber-50 text-amber-900"
                              title="Client requested this stylist"
                            >
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
                ) : selectedAppointment?.status === "missed" ? (
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
                      onClick={() => selectedAppointment && handleCancelClick(selectedAppointment._id)}
                      disabled={cancelling || selectedAppointment?.status === "cancelled"}
                      className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                    >
                      {cancelling ? "Cancelling..." : "Cancel Appointment"}
                    </Button>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        disabled={
                          !selectedAppointment ||
                          getAppointmentCalendarOpenIntent(
                            selectedAppointment,
                            partialPaymentAppointmentIds
                          ).type === "details"
                        }
                        onClick={() => {
                          if (!selectedAppointment) return
                          setShowDetails(false)
                          const intent = getAppointmentCalendarOpenIntent(
                            selectedAppointment,
                            partialPaymentAppointmentIds
                          )
                          if (intent.type === "edit_form") {
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
                          onClick={() => handleMarkStatus("completed")}
                          disabled={updatingStatus}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {updatingStatus ? "Updating..." : "Mark Complete"}
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
                        openAppointmentFromCalendarCard(appointment)
                        setShowUpcomingModal(false)
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge className={`text-xs font-semibold ${getStatusBadgeClass(appointment.status)} border-0`}>
                              {getStatusText(appointment.status)}
                            </Badge>
                            {a.prepaidAtBooking &&
                              appointment.status !== "completed" &&
                              appointment.status !== "cancelled" && (
                                <Badge
                                  variant="outline"
                                  className="text-xs shrink-0 border-emerald-600 text-emerald-800 bg-emerald-50"
                                >
                                  Paid
                                </Badge>
                              )}
                            {isOnlineBookingAppointment(a) && (
                              <Badge
                                variant="outline"
                                className="text-xs shrink-0 border-violet-300 text-violet-800 bg-violet-50"
                                title="Booked online"
                              >
                                Online
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

      <Dialog
        open={saleInvoicePreviewOpen}
        onOpenChange={(next) => {
          if (!next) {
            setSaleInvoicePreviewOpen(false)
            setSaleInvoicePreviewReceipt(null)
            setSaleInvoicePreviewSettings(null)
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>
              {saleInvoicePreviewReceipt
                ? `Invoice #${saleInvoicePreviewReceipt.receiptNumber}`
                : "Invoice preview"}
            </DialogTitle>
            <DialogDescription className="sr-only">Invoice preview for the selected bill</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
            {saleInvoicePreviewLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                Loading invoice…
              </div>
            ) : saleInvoicePreviewReceipt ? (
              <ReceiptPreview receipt={saleInvoicePreviewReceipt} businessSettings={saleInvoicePreviewSettings} />
            ) : null}
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
          const performedAnchor = (result.performed.find((p: any) => p._id === raiseSaleAnchor._id) || result.performed[0]) as any
          const allServices = result.performed.flatMap((sib: any) => collectSaleLinesFromAppointmentCard(sib))
          const appointmentData = buildRaiseSaleAppointmentPayload(performedAnchor, result.performed, allServices)
          router.push(`/quick-sale?appointment=${btoa(JSON.stringify(appointmentData))}`)
        }}
      />
    </div>
  )
})

AppointmentsCalendarGrid.displayName = "AppointmentsCalendarGrid"
