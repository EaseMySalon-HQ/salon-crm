"use client"

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  Check,
  Plus,
  Trash2,
  Search,
  User,
  Phone,
  X,
  CalendarDays,
  FileText,
  Loader2,
  Calendar as CalendarIcon,
  Heart,
  MoreVertical,
  CalendarPlus,
  FilePlus,
  History,
  Repeat,
  RefreshCw,
  CalendarClock,
  UserX,
  ShoppingCart,
  ChevronDown,
  BadgeCheck,
  MapPin,
  Play,
  CircleCheck,
  Ban,
  Banknote,
  Eye,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { format, isBefore, startOfDay } from "date-fns"
import { DayPicker } from "react-day-picker"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { clientStore, type Client } from "@/lib/client-store"
import { ClientsAPI, ServicesAPI, StaffAPI, AppointmentsAPI, UsersAPI, StaffDirectoryAPI, SalesAPI, SettingsAPI } from "@/lib/api"
import type { Receipt as InvoiceReceipt } from "@/lib/data"
import { isHiddenAppointment, getAppointmentStatusPillClass, getAppointmentEditAppearanceStatus } from "@/lib/appointment-calendar-helpers"
import { readServiceCheckoutDraftByRef } from "@/lib/service-checkout-draft-storage"
import { ServiceCheckoutDialog, type ServiceCheckoutLine, type EnsureAppointmentBookingResult } from "@/components/appointments/service-checkout-dialog"
import { PaymentCollectionModal } from "@/components/reports/payment-collection-modal"
import { ReceiptPreview } from "@/components/receipts/receipt-preview"
import { receiptPreviewReceiptFromSaleApi } from "@/lib/receipt-preview-from-sale-api"

/** Convert 24h time (e.g. "09:00") to 12h for API storage ("9:00 AM") for backward compatibility */
function formatTimeForApi(time: string): string {
  if (!time) return ""
  const minutes = parseTimeToMinutes(time)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return format(new Date(2000, 0, 1, h, m), "h:mm a")
}

/** Parse time string (e.g. "9:00 AM" or "09:00") to minutes from midnight */
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

/** Add minutes to a time string, return "9:30 AM" format */
/** Convert an absolute minutes-of-day value to a 24h "HH:mm" string. */
function minutesToTimeString(absMinutes: number): string {
  const total = ((absMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const baseM = parseTimeToMinutes(timeStr)
  const totalM = baseM + minutesToAdd
  const h = Math.floor(totalM / 60) % 24
  const m = totalM % 60
  return format(new Date(2000, 0, 1, h, m), "h:mm a")
}

/** Sequential service time: Service 0 = baseTime, Service 1 = baseTime + dur0, Service 2 = baseTime + dur0 + dur1, etc.
 * Use for both create and edit flows to ensure no overlapping. */
function getSequentialServiceStartTime(
  services: Array<{ duration?: number }>,
  baseTime: string,
  serviceIndex: number
): string {
  if (serviceIndex <= 0) return baseTime
  let cumulativeM = 0
  for (let i = 0; i < serviceIndex; i++) {
    cumulativeM += services[i]?.duration ?? 60
  }
  return addMinutesToTime(baseTime, cumulativeM)
}

/** Start minute for service index `targetIndex` (0-based), matching getServiceStartMinutes chaining. */
function computeChainedStartMinutes(
  services: Array<{ startTime?: string; duration?: number }>,
  baseTime: string,
  targetIndex: number
): number {
  if (!baseTime) return 0
  let cursorM = parseTimeToMinutes(baseTime)
  for (let i = 0; i < targetIndex; i++) {
    const prev = services[i]
    if (prev?.startTime) {
      cursorM = parseTimeToMinutes(prev.startTime) + (prev.duration || 0)
    } else {
      cursorM += prev?.duration ?? 60
    }
  }
  return cursorM
}

// Time slots for appointments (5-min intervals, 24-hour format)
const timeSlots = (() => {
  const slots: string[] = []
  for (let h = 0; h <= 23; h++) {
    for (let m = 0; m < 60; m += 5) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
    }
  }
  return slots
})()

type RecurrenceFrequency = "doesnt" | "repeat" | "daily" | "weekly" | "monthly" | "custom"

interface RecurrenceFormState {
  frequency: RecurrenceFrequency
  customInterval: number
  customUnit: "day" | "week" | "month"
  endType: "never" | "count" | "date"
  endAfterCount: number
  endOnDate: Date | null
}

function defaultRecurrenceForm(): RecurrenceFormState {
  return {
    frequency: "doesnt",
    customInterval: 1,
    customUnit: "week",
    endType: "never",
    endAfterCount: 10,
    endOnDate: null,
  }
}

function recurrenceFromApi(raw: any | null | undefined): RecurrenceFormState {
  const d = defaultRecurrenceForm()
  if (!raw || typeof raw !== "object") return d
  const f = raw.frequency
  if (f === "doesnt" || f === "repeat" || f === "daily" || f === "weekly" || f === "monthly" || f === "custom") {
    d.frequency = f
  }
  if (typeof raw.customInterval === "number" && raw.customInterval >= 1) d.customInterval = raw.customInterval
  const u = raw.customUnit
  if (u === "day" || u === "week" || u === "month") d.customUnit = u
  const e = raw.endType
  if (e === "never" || e === "count" || e === "date") d.endType = e
  if (typeof raw.endAfterCount === "number" && raw.endAfterCount >= 1) d.endAfterCount = raw.endAfterCount
  if (raw.endOnDate && typeof raw.endOnDate === "string") {
    const parts = raw.endOnDate.split("-").map(Number)
    if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
      d.endOnDate = new Date(parts[0], parts[1] - 1, parts[2])
    }
  }
  return d
}

function recurrenceToApiPayload(form: RecurrenceFormState): Record<string, unknown> {
  if (form.frequency === "doesnt") {
    return {
      frequency: "doesnt",
      customInterval: 1,
      customUnit: "week",
      endType: "never",
      endAfterCount: null,
      endOnDate: null,
    }
  }
  return {
    frequency: form.frequency,
    customInterval: form.frequency === "custom" ? form.customInterval : 1,
    customUnit: form.frequency === "custom" ? form.customUnit : "week",
    endType: form.endType,
    endAfterCount: form.endType === "count" ? form.endAfterCount : null,
    endOnDate: form.endType === "date" && form.endOnDate ? format(form.endOnDate, "yyyy-MM-dd") : null,
  }
}

const formSchema = z.object({
  date: z.date({
    required_error: "Please select a date.",
  }),
  time: z.string({
    required_error: "Please select a time.",
  }),
  leadSource: z.string().optional(),
  leadSourceDetail: z.string().optional(),
  notes: z.string().optional(),
})

interface SelectedService {
  id: string
  serviceId: string
  staffId: string
  name: string
  duration: number
  price: number
  /** Client requested this stylist; shown on calendar cards */
  staffLocked?: boolean
  /** Per-service start time in 24h "HH:mm". Only used in custom scheduling mode. */
  startTime?: string
}

/** Stable snapshot for detecting unsaved appointment edits (drawer + page). */
function serializeAppointmentEditState(
  values: {
    date?: Date
    time?: string
    notes?: string
    leadSource?: string
    leadSourceDetail?: string
  },
  services: SelectedService[]
): string {
  const dateStr = values.date ? format(values.date, "yyyy-MM-dd") : ""
  const svc = services.map((s) => ({
    id: s.id,
    serviceId: String(s.serviceId || ""),
    staffId: String(s.staffId || ""),
    duration: Number(s.duration) || 0,
    price: Number(s.price) || 0,
    staffLocked: !!s.staffLocked,
    startTime: s.startTime || "",
  }))
  const scheduling = services.some((s) => !!s.startTime) ? "custom" : "sequential"
  return JSON.stringify({
    date: dateStr,
    time: values.time || "",
    notes: (values.notes || "").trim(),
    leadSource: values.leadSource || "",
    leadSourceDetail: values.leadSourceDetail || "",
    scheduling,
    services: svc,
  })
}

type SchedulingMode = "sequential" | "custom"

type EditBaselineSnapshot = {
  values: {
    date?: Date
    time: string
    notes: string
    leadSource: string
    leadSourceDetail: string
  }
  services: SelectedService[]
}

function normalizedDrawerStatus(s: string | null): string {
  if (!s) return "scheduled"
  if (s === "cancelled_at_billing") return "cancelled"
  return s
}

function drawerStatusTriggerLabel(s: string | null): string {
  const key = normalizedDrawerStatus(s)
  switch (key) {
    case "scheduled":
      return "Scheduled"
    case "confirmed":
      return "Confirmed"
    case "arrived":
      return "Arrived"
    case "service_started":
      return "Started"
    case "completed":
      return "Completed"
    case "missed":
      return "No show"
    case "partial_payment":
      return "Partial payment"
    case "cancelled":
      return "Cancelled"
    default:
      return key.replace(/_/g, " ")
  }
}

type DrawerEditStatusDropdownProps = {
  appointmentStatus: string | null
  appearanceStatus: string
  hasLinkedInvoice: boolean
  terminal: boolean
  busy: boolean
  onApplyStatus: (next: string) => void | Promise<void>
  onRequestNoShow: () => void
  onRequestCancel: () => void
}

function DrawerEditStatusDropdown({
  appointmentStatus,
  appearanceStatus,
  hasLinkedInvoice,
  terminal,
  busy,
  onApplyStatus,
  onRequestNoShow,
  onRequestCancel,
}: DrawerEditStatusDropdownProps) {
  const current = normalizedDrawerStatus(appointmentStatus)
  const disabled = terminal || busy
  const row = (value: string, label: string, Icon: LucideIcon) => {
    const active = current === value
    return (
      <DropdownMenuItem
        key={value + label}
        disabled={disabled || active}
        className="gap-2 cursor-pointer"
        onSelect={() => {
          if (disabled || active) return
          void onApplyStatus(value)
        }}
      >
        <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        <span className="flex-1">{label}</span>
        {active ? <Check className="h-4 w-4 shrink-0 opacity-70" aria-hidden /> : null}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label="Change appointment status"
          className={cn(
            "shrink-0 h-9 rounded-full px-3.5 gap-1.5 text-sm font-medium border",
            getAppointmentStatusPillClass(appearanceStatus),
            disabled && "opacity-70"
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden /> : null}
          <span>{drawerStatusTriggerLabel(appearanceStatus)}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[min(18rem,calc(100vw-2rem))] z-[250] rounded-lg border-border p-1 shadow-lg">
        {row("scheduled", "Scheduled", CalendarDays)}
        {row("confirmed", "Confirmed", BadgeCheck)}
        {row("arrived", "Arrived", MapPin)}
        {row("service_started", "Started", Play)}
        {hasLinkedInvoice ? row("completed", "Completed", CircleCheck) : null}
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem
          disabled={disabled || current === "missed"}
          className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          onSelect={() => {
            if (disabled || current === "missed") return
            onRequestNoShow()
          }}
        >
          <UserX className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">No show</span>
          {current === "missed" ? <Check className="h-4 w-4 shrink-0 opacity-70" aria-hidden /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled || current === "cancelled"}
          className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          onSelect={() => {
            if (disabled || current === "cancelled") return
            onRequestCancel()
          }}
        >
          <Ban className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">Cancel appointment</span>
          {current === "cancelled" ? <Check className="h-4 w-4 shrink-0 opacity-70" aria-hidden /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface ServiceDropdownState {
  [key: string]: {
    search: string
    isOpen: boolean
  }
}

export interface AppointmentFormProps {
  /** Pre-fill date (YYYY-MM-DD), e.g. from calendar slot click */
  initialDate?: string
  /** Pre-fill time (e.g. "9:00 AM", "9:15 AM") */
  initialTime?: string
  /** Pre-fill staff for first service when added (staff id) */
  initialStaffId?: string
  /** Appointment ID for edit mode - loads appointment and locks client */
  appointmentId?: string
  /** Called when user selects or clears the client (for showing client details panel) */
  onClientSelect?: (client: Client | null) => void
  /** Called when form is successfully submitted (e.g. to close drawer) */
  onSuccess?: () => void
  /** Called when user cancels (e.g. to close drawer) */
  onCancel?: () => void
  /** Drawer: notify when Checkout Service overlay opens/closes (e.g. hide client details panel). */
  onServiceCheckoutOpenChange?: (open: boolean) => void
  /** When set (drawer), checkout overlay open state is owned by the parent. */
  serviceCheckoutOpen?: boolean
  /** Pre-select client when opening from a saved-checkout chip (new appointment draft). */
  initialClientIdForPrefill?: string
  /** Open drawer from calendar chip: load client then restore checkout from localStorage draft. */
  resumeServiceCheckoutDraft?: boolean
  /** Storage token from chip; required to load the correct draft when several exist. */
  resumeSavedDraftToken?: string
  /** "drawer" = compact layout for right-side drawer; "page" = full card layout for standalone page */
  variant?: "page" | "drawer"
  /** Drawer only: render a status control in the sheet header (right side). */
  onDrawerHeaderEndChange?: (node: ReactNode) => void
  /** Drawer edit: notify parent of raw appointment status for header chrome (full-bar tint). */
  onDrawerHeaderStatusToneChange?: (status: string | null) => void
  /** Drawer: number of service lines (for wider sheet when user adds more than one). */
  onDrawerSelectedServiceCountChange?: (count: number) => void
  /** Drawer edit: unsaved field/service changes (for blocking dismiss while editing). */
  onEditAppointmentDirtyChange?: (dirty: boolean) => void
}

export function AppointmentForm({
  initialDate,
  initialTime,
  initialStaffId,
  appointmentId: appointmentIdProp,
  onClientSelect,
  onSuccess,
  onCancel,
  onServiceCheckoutOpenChange,
  serviceCheckoutOpen: serviceCheckoutOpenProp,
  initialClientIdForPrefill,
  resumeServiceCheckoutDraft = false,
  resumeSavedDraftToken,
  variant = "page",
  onDrawerHeaderEndChange,
  onDrawerHeaderStatusToneChange,
  onDrawerSelectedServiceCountChange,
  onEditAppointmentDirtyChange,
}: AppointmentFormProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appointmentId = appointmentIdProp ?? searchParams?.get("edit") ?? undefined
  const isEditMode = !!appointmentId
  const prefillClientId = searchParams?.get("clientId") ?? initialClientIdForPrefill ?? undefined
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingAppointment, setLoadingAppointment] = useState(false)
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [existingBookingGroupId, setExistingBookingGroupId] = useState<string | null>(null)
  const [existingGroupAppointmentIds, setExistingGroupAppointmentIds] = useState<string[]>([])
  /**
   * Effective scheduling mode is derived: any service with an explicit startTime puts the
   * booking in "custom" mode. Otherwise services chain sequentially from the appointment time.
   */
  const schedulingMode = useMemo<SchedulingMode>(
    () => (selectedServices.some((s) => !!s.startTime) ? "custom" : "sequential"),
    [selectedServices]
  )

  useEffect(() => {
    if (variant !== "drawer" || !onDrawerSelectedServiceCountChange) return
    onDrawerSelectedServiceCountChange(selectedServices.length)
  }, [variant, selectedServices.length, onDrawerSelectedServiceCountChange])

  // Prefer URL params (from calendar slot) over props so time is correct on first paint
  const urlDate = searchParams?.get("date") ?? initialDate
  const urlTime = searchParams?.get("time") ?? initialTime
  const urlStaffId = searchParams?.get("staffId") ?? initialStaffId

  // Normalize time to match a form timeSlot exactly so the Select displays it.
  // Use parseTimeToMinutes so formats like "9:0 AM", "09:00 AM" from calendar all map correctly.
  const defaultTime = useMemo(() => {
    if (!urlTime) return ""
    const minutes = parseTimeToMinutes(urlTime)
    const slot = timeSlots.find((t) => parseTimeToMinutes(t) === minutes)
    return slot ?? (timeSlots.find((t) => t.toLowerCase() === urlTime.toLowerCase()) ?? urlTime)
  }, [urlTime])

  const defaultDate = useMemo(() => {
    if (urlDate) {
      const parts = urlDate.split("-").map(Number)
      if (parts.length >= 3) return new Date(parts[0], parts[1] - 1, parts[2])
    }
    return startOfDay(new Date())
  }, [urlDate])

  // Client search state
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Client | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [searchingClients, setSearchingClients] = useState(false)
  const clientSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Services and staff state
  const [services, setServices] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [appointmentsForDate, setAppointmentsForDate] = useState<any[]>([])
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(true)

  // Service dropdown search state
  const [serviceDropdowns, setServiceDropdowns] = useState<ServiceDropdownState>({})

  // New client dialog
  const [showNewClientDialog, setShowNewClientDialog] = useState(false)
  const [newClient, setNewClient] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  })

  // Date picker popover state
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  // Today's date for date picker (calculated once)
  const today = useMemo(() => startOfDay(new Date()), [])

  const [editedAppointmentStatus, setEditedAppointmentStatus] = useState<string | null>(null)
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)
  const [activityDetail, setActivityDetail] = useState<any>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [cancelApptDialogOpen, setCancelApptDialogOpen] = useState(false)
  const [noShowDialogOpen, setNoShowDialogOpen] = useState(false)
  const [statusActionLoading, setStatusActionLoading] = useState(false)
  const [linkedSaleForStatus, setLinkedSaleForStatus] = useState<unknown | null>(null)
  const [payRemainingSheetOpen, setPayRemainingSheetOpen] = useState(false)
  const [payRemainingSaleForCollection, setPayRemainingSaleForCollection] = useState<any>(null)
  const payRemainingSucceededRef = useRef(false)
  const [openingPayRemaining, setOpeningPayRemaining] = useState(false)
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false)
  const [invoicePreviewLoading, setInvoicePreviewLoading] = useState(false)
  const [invoicePreviewReceipt, setInvoicePreviewReceipt] = useState<InvoiceReceipt | null>(null)
  const [invoicePreviewSettings, setInvoicePreviewSettings] = useState<any>(null)

  const [addNoteDialogOpen, setAddNoteDialogOpen] = useState(false)
  const [serviceCheckoutOpenInternal, setServiceCheckoutOpenInternal] = useState(false)
  const serviceCheckoutControlled = serviceCheckoutOpenProp !== undefined
  const serviceCheckoutOpen = serviceCheckoutControlled
    ? Boolean(serviceCheckoutOpenProp)
    : serviceCheckoutOpenInternal

  const setServiceCheckoutOpen = useCallback(
    (next: boolean) => {
      if (!serviceCheckoutControlled) {
        setServiceCheckoutOpenInternal(next)
      }
      onServiceCheckoutOpenChange?.(next)
    },
    [serviceCheckoutControlled, onServiceCheckoutOpenChange]
  )

  const resumeCheckoutDraftRef = useRef(false)
  const consumeResumeDraftIntent = useCallback(() => {
    const v = resumeCheckoutDraftRef.current
    resumeCheckoutDraftRef.current = false
    return v
  }, [])

  const autoResumeCheckoutDraftRef = useRef(false)

  useEffect(() => {
    if (!resumeServiceCheckoutDraft) {
      autoResumeCheckoutDraftRef.current = false
      return
    }
    if (autoResumeCheckoutDraftRef.current) return
    if (loadingAppointment && isEditMode) return
    const cid = selectedCustomer?._id || selectedCustomer?.id
    if (!cid || !resumeSavedDraftToken) return
    const draft = readServiceCheckoutDraftByRef(resumeSavedDraftToken)
    if (!draft || String(draft.clientId) !== String(cid)) return
    autoResumeCheckoutDraftRef.current = true
    resumeCheckoutDraftRef.current = true
    setServiceCheckoutOpen(true)
  }, [
    resumeServiceCheckoutDraft,
    resumeSavedDraftToken,
    loadingAppointment,
    isEditMode,
    selectedCustomer,
    setServiceCheckoutOpen,
  ])

  const [noteDialogMode, setNoteDialogMode] = useState<"add" | "edit">("add")
  const [addNoteDraft, setAddNoteDraft] = useState("")
  const [addNoteSaving, setAddNoteSaving] = useState(false)
  const [repeatingDialogOpen, setRepeatingDialogOpen] = useState(false)
  const [recurrenceForm, setRecurrenceForm] = useState<RecurrenceFormState>(defaultRecurrenceForm)
  const [recurrenceSaving, setRecurrenceSaving] = useState(false)
  const [rebookDialogOpen, setRebookDialogOpen] = useState(false)
  const [rebookDate, setRebookDate] = useState<Date>(() => startOfDay(new Date()))
  const [rebookTime, setRebookTime] = useState("")
  const [rebookDatePickerOpen, setRebookDatePickerOpen] = useState(false)
  const [recurrenceEndDatePickerOpen, setRecurrenceEndDatePickerOpen] = useState(false)

  const [editBaselineSerialized, setEditBaselineSerialized] = useState<string | null>(null)
  const editBaselineSnapshotRef = useRef<EditBaselineSnapshot | null>(null)

  useEffect(() => {
    setEditBaselineSerialized(null)
    editBaselineSnapshotRef.current = null
  }, [appointmentId])

  const lastLoadedRecurrenceRef = useRef<Record<string, unknown> | null>(null)

  const scrollToFormSection = useCallback((elementId: string) => {
    if (typeof document === "undefined") return
    document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const appointmentIdsForGroupActions = useMemo(() => {
    if (!appointmentId) return []
    if (existingGroupAppointmentIds.length > 0) return existingGroupAppointmentIds.map(String)
    return [String(appointmentId)]
  }, [appointmentId, existingGroupAppointmentIds])

  const handleCheckoutCustomerChange = useCallback(
    async (client: Client) => {
      const prev = selectedCustomer
      setSelectedCustomer(client)
      setCustomerSearch(client.name)
      onClientSelect?.(client)
      if (!isEditMode || !appointmentId) {
        toast({
          title: "Client updated",
          description: `${client.name} will be used for this checkout and appointment.`,
        })
        return
      }
      try {
        const newClientId = client._id || client.id
        for (const id of appointmentIdsForGroupActions) {
          const res = await AppointmentsAPI.update(id, { clientId: newClientId })
          if (!res?.success) {
            const err =
              typeof (res as { error?: string })?.error === "string"
                ? (res as { error: string }).error
                : "Update failed"
            throw new Error(err)
          }
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("appointments-refresh"))
        }
        toast({
          title: "Client updated",
          description: "This booking is now linked to the selected client.",
        })
      } catch (e) {
        setSelectedCustomer(prev)
        setCustomerSearch(prev?.name ?? "")
        if (prev) onClientSelect?.(prev)
        else onClientSelect?.(null)
        toast({
          title: "Could not update client",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "destructive",
        })
        throw e
      }
    },
    [selectedCustomer, onClientSelect, isEditMode, appointmentId, appointmentIdsForGroupActions, toast]
  )

  const isTerminalAppointmentStatus = useMemo(() => {
    const s = editedAppointmentStatus || ""
    return s === "cancelled" || s === "cancelled_at_billing" || s === "completed" || s === "missed"
  }, [editedAppointmentStatus])

  const isCompletedAppointmentEditReadOnly = useMemo(
    () => isEditMode && editedAppointmentStatus === "completed",
    [isEditMode, editedAppointmentStatus]
  )

  const refreshLinkedSaleForStatus = useCallback(async () => {
    if (!appointmentId || !isEditMode) {
      setLinkedSaleForStatus(null)
      return
    }
    try {
      const res = await SalesAPI.getByAppointmentId(appointmentId)
      setLinkedSaleForStatus(res?.success && res?.data ? res.data : null)
    } catch {
      setLinkedSaleForStatus(null)
    }
  }, [appointmentId, isEditMode])

  const syncAppointmentStatusFromServer = useCallback(async () => {
    if (!appointmentId || !isEditMode) return
    try {
      const res = await AppointmentsAPI.getById(appointmentId)
      if (!res?.success || !res?.data) return
      const a = res.data as { status?: string }
      if (typeof a.status === "string") setEditedAppointmentStatus(a.status)
    } catch {
      /* ignore */
    }
  }, [appointmentId, isEditMode])

  useEffect(() => {
    void refreshLinkedSaleForStatus()
  }, [refreshLinkedSaleForStatus])

  useEffect(() => {
    const onRefresh = () => {
      void refreshLinkedSaleForStatus()
      void syncAppointmentStatusFromServer()
    }
    window.addEventListener("appointments-refresh", onRefresh)
    return () => window.removeEventListener("appointments-refresh", onRefresh)
  }, [refreshLinkedSaleForStatus, syncAppointmentStatusFromServer])

  const openLinkedInvoicePreview = useCallback(async () => {
    const link = linkedSaleForStatus as { billNo?: string; receiptNumber?: string; _id?: unknown } | null | undefined
    let billNo = String(link?.billNo ?? link?.receiptNumber ?? "").trim()
    if (!billNo && link?._id != null && String(link._id).trim() !== "") {
      try {
        const sid = await SalesAPI.getById(String(link._id))
        if (
          sid?.success &&
          sid?.data &&
          sid.data.billNo != null &&
          String(sid.data.billNo).trim() !== ""
        ) {
          billNo = String(sid.data.billNo).trim()
        }
      } catch {
        /* noop */
      }
    }
    if (!billNo) {
      toast({
        title: "No invoice",
        description: "No bill number is linked to this appointment yet.",
        variant: "destructive",
      })
      return
    }
    setInvoicePreviewOpen(true)
    setInvoicePreviewLoading(true)
    setInvoicePreviewReceipt(null)
    setInvoicePreviewSettings(null)
    try {
      const saleRes = await SalesAPI.getByBillNo(billNo)
      if (!saleRes.success || !saleRes.data) {
        toast({
          title: "Invoice not found",
          description: `No sale found for bill #${billNo}.`,
          variant: "destructive",
        })
        setInvoicePreviewOpen(false)
        return
      }
      const settingsRes = await SettingsAPI.getBusinessSettings()
      setInvoicePreviewReceipt(receiptPreviewReceiptFromSaleApi(saleRes.data))
      setInvoicePreviewSettings(settingsRes.success ? settingsRes.data : null)
    } catch (e) {
      console.error(e)
      toast({
        title: "Failed to load invoice",
        variant: "destructive",
      })
      setInvoicePreviewOpen(false)
    } finally {
      setInvoicePreviewLoading(false)
    }
  }, [linkedSaleForStatus, toast])

  const openPayRemainingFromLinkedSale = useCallback(async () => {
    const cid = selectedCustomer ? String(selectedCustomer._id || selectedCustomer.id || "").trim() : ""
    if (!cid) return
    const link = linkedSaleForStatus as { _id?: unknown } | null | undefined
    const sid =
      link != null && link._id != null && link._id !== "" ? String(link._id).trim() : ""
    if (!sid) {
      toast({
        title: "No invoice",
        description: "Could not find a linked bill to pay. Refresh the appointment or use Quick Sale.",
        variant: "destructive",
      })
      return
    }
    setOpeningPayRemaining(true)
    try {
      const res = await SalesAPI.getById(sid)
      if (!res?.success || !res?.data) {
        toast({
          title: "Invoice not found",
          description: "Could not load the bill for payment.",
          variant: "destructive",
        })
        return
      }
      const saleDoc = res.data as { paymentStatus?: { remainingAmount?: number } }
      const remaining = Number(saleDoc?.paymentStatus?.remainingAmount ?? 0) || 0
      if (remaining <= 0.02) {
        toast({
          title: "Nothing to collect",
          description: "This invoice has no remaining balance.",
        })
        await refreshLinkedSaleForStatus()
        return
      }
      payRemainingSucceededRef.current = false
      setPayRemainingSaleForCollection(res.data)
      setPayRemainingSheetOpen(true)
    } catch {
      toast({
        title: "Error",
        description: "Could not open payment. Please try again.",
        variant: "destructive",
      })
    } finally {
      setOpeningPayRemaining(false)
    }
  }, [linkedSaleForStatus, selectedCustomer, toast, refreshLinkedSaleForStatus])

  const handlePayRemainingCollected = useCallback(async () => {
    payRemainingSucceededRef.current = true
    const saleId = payRemainingSaleForCollection?._id as string | undefined
    await refreshLinkedSaleForStatus()
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("appointments-refresh"))
    }
    if (!saleId) return
    const res = await SalesAPI.getById(saleId)
    if (res?.success && res?.data) {
      setPayRemainingSaleForCollection(res.data)
    }
  }, [refreshLinkedSaleForStatus, payRemainingSaleForCollection])

  const closePayRemainingSheet = useCallback(() => {
    const succeeded = payRemainingSucceededRef.current
    payRemainingSucceededRef.current = false
    setPayRemainingSheetOpen(false)
    setPayRemainingSaleForCollection(null)
    if (succeeded && variant === "drawer") {
      onSuccess?.()
    }
  }, [variant, onSuccess])

  const editAppearanceStatus = useMemo(
    () => getAppointmentEditAppearanceStatus(editedAppointmentStatus, linkedSaleForStatus),
    [editedAppointmentStatus, linkedSaleForStatus]
  )
  const isPartialPaymentEditReadOnly = useMemo(
    () => isEditMode && editAppearanceStatus === "partial_payment",
    [isEditMode, editAppearanceStatus]
  )
  const isAppointmentFormReadOnly = useMemo(
    () => isCompletedAppointmentEditReadOnly || isPartialPaymentEditReadOnly,
    [isCompletedAppointmentEditReadOnly, isPartialPaymentEditReadOnly]
  )
  const hasLinkedInvoice = Boolean(linkedSaleForStatus)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: defaultDate,
      time: defaultTime,
      leadSource: "",
      leadSourceDetail: "",
      notes: "",
    },
  })

  const commitEditBaseline = useCallback(
    (
      values: {
        date?: Date
        time?: string
        notes?: string
        leadSource?: string
        leadSourceDetail?: string
      },
      services: SelectedService[]
    ) => {
      editBaselineSnapshotRef.current = {
        values: {
          date: values.date ? new Date(values.date.getTime()) : undefined,
          time: values.time || "",
          notes: values.notes || "",
          leadSource: values.leadSource || "",
          leadSourceDetail: values.leadSourceDetail || "",
        },
        services: services.map((s) => ({ ...s })),
      }
      setEditBaselineSerialized(serializeAppointmentEditState(values, services))
    },
    []
  )

  const revertEditAppointmentToBaseline = useCallback(() => {
    const snap = editBaselineSnapshotRef.current
    if (!snap) return
    form.reset({
      date: snap.values.date,
      time: snap.values.time,
      notes: snap.values.notes,
      leadSource: snap.values.leadSource,
      leadSourceDetail: snap.values.leadSourceDetail,
    })
    setSelectedServices(snap.services.map((s) => ({ ...s })))
  }, [form])

  // Sync URL params into form when they appear (e.g. client nav from calendar)
  useEffect(() => {
    if (urlDate || urlTime) {
      const date = urlDate
        ? (() => {
            const parts = urlDate.split("-").map(Number)
            return new Date(parts[0], parts[1] - 1, parts[2])
          })()
        : form.getValues("date")
      form.reset({
        ...form.getValues(),
        ...(date && { date }),
        ...(defaultTime && { time: defaultTime }),
      })
    }
  }, [urlDate, urlTime, defaultTime])

  const formDate = form.watch("date")
  const formTime = form.watch("time")
  const formNotes = form.watch("notes")
  const formLeadSource = form.watch("leadSource")
  const formLeadSourceDetail = form.watch("leadSourceDetail")

  const isEditAppointmentDirty = useMemo(() => {
    if (!isEditMode || editBaselineSerialized == null) return false
    const current = serializeAppointmentEditState(
      {
        date: formDate,
        time: formTime,
        notes: formNotes,
        leadSource: formLeadSource,
        leadSourceDetail: formLeadSourceDetail,
      },
      selectedServices
    )
    return current !== editBaselineSerialized
  }, [
    isEditMode,
    editBaselineSerialized,
    formDate,
    formTime,
    formNotes,
    formLeadSource,
    formLeadSourceDetail,
    selectedServices,
  ])

  useEffect(() => {
    onEditAppointmentDirtyChange?.(isEditAppointmentDirty)
  }, [isEditAppointmentDirty, onEditAppointmentDirtyChange])

  useEffect(() => {
    if (!isEditMode || !isEditAppointmentDirty) return
    if (serviceCheckoutOpen) setServiceCheckoutOpen(false)
  }, [isEditMode, isEditAppointmentDirty, serviceCheckoutOpen, setServiceCheckoutOpen])

  // Fetch appointments when date is set (for staff availability / overlap filtering)
  useEffect(() => {
    if (!formDate) {
      setAppointmentsForDate([])
      return
    }
    const dateStr = format(formDate, "yyyy-MM-dd")
    AppointmentsAPI.getAll({ date: dateStr, limit: 500 })
      .then((res) => {
        if (res?.success && Array.isArray(res?.data)) setAppointmentsForDate(res.data)
        else setAppointmentsForDate([])
      })
      .catch(() => setAppointmentsForDate([]))
  }, [formDate])

  // Total duration of selected services
  const totalDuration = useMemo(() => {
    const sum = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0)
    return Math.max(sum || 60, 5)
  }, [selectedServices])

  /**
   * Compute the start minutes for a given service row.
   * If the row has its own startTime, use it. Otherwise the row chains from the previous
   * service's effective end (whether the previous was sequential or custom).
   */
  const getServiceStartMinutes = useCallback((serviceIndex: number): number => {
    const own = selectedServices[serviceIndex]?.startTime
    if (own) return parseTimeToMinutes(own)
    let cursorM = formTime ? parseTimeToMinutes(formTime) : 0
    for (let i = 0; i < serviceIndex; i++) {
      const prev = selectedServices[i]
      if (prev?.startTime) {
        cursorM = parseTimeToMinutes(prev.startTime) + (prev.duration || 0)
      } else {
        cursorM += prev?.duration ?? 60
      }
    }
    return cursorM
  }, [selectedServices, formTime])

  const ensureAppointmentBookingBeforeCheckout = useCallback(
    async (ctx: {
      lines: ServiceCheckoutLine[]
      customer: Client
      appointmentDate: Date | undefined
      appointmentTime: string
      notes: string
    }): Promise<EnsureAppointmentBookingResult | null> => {
      if (isEditMode) return null
      if (!selectedCustomer) {
        toast({
          title: "Error",
          description: "Please select a client.",
          variant: "destructive",
        })
        return null
      }
      const values = form.getValues()
      const dateStr = ctx.appointmentDate
        ? format(ctx.appointmentDate, "yyyy-MM-dd")
        : values.date
          ? format(values.date, "yyyy-MM-dd")
          : ""
      if (!dateStr) {
        toast({
          title: "Error",
          description: "Please select a date.",
          variant: "destructive",
        })
        return null
      }
      const baseTimeStr = (ctx.appointmentTime || values.time || "").trim()
      if (!baseTimeStr) {
        toast({
          title: "Error",
          description: "Please select a time.",
          variant: "destructive",
        })
        return null
      }
      const leadSourceValue = values.leadSource
        ? values.leadSource === "Referral" || values.leadSource === "Other"
          ? `${values.leadSource}${values.leadSourceDetail ? `: ${values.leadSourceDetail}` : ""}`
          : values.leadSource
        : ""

      const parallelPayload = { allowParallelBooking: true as const }

      const minutesBeforeLineIndex = (targetIdx: number): number => {
        let c = parseTimeToMinutes(baseTimeStr)
        for (let i = 0; i < targetIdx; i++) {
          const L = ctx.lines[i]
          const q = Math.max(1, Math.floor(Number(L.quantity) || 1))
          const dur = L.duration || 60
          c += q * dur
        }
        return c
      }

      type ServiceRow = {
        serviceId: string
        staffId: string
        name: string
        duration: number
        price: number
        staffLocked: boolean
        startTime?: string
      }

      const servicesPayload: ServiceRow[] = []
      for (let lineIdx = 0; lineIdx < ctx.lines.length; lineIdx++) {
        const line = ctx.lines[lineIdx]
        const idxInSelected = selectedServices.findIndex((s) => s.id === line.id)
        const sel = idxInSelected >= 0 ? selectedServices[idxInSelected] : undefined
        const dur = line.duration || sel?.duration || 0
        if (dur < 1) {
          toast({
            title: "Error",
            description: "Each service needs a valid duration. Check the service catalog.",
            variant: "destructive",
          })
          return null
        }
        const displayName = sel?.name || line.name || "Service"
        const q = Math.max(1, Math.floor(Number(line.quantity) || 1))
        const baseCustomM =
          schedulingMode === "custom"
            ? idxInSelected >= 0
              ? getServiceStartMinutes(idxInSelected)
              : minutesBeforeLineIndex(lineIdx)
            : 0
        for (let copy = 0; copy < q; copy++) {
          const unitPrice = Number(line.price) || Number(sel?.price) || 0
          servicesPayload.push({
            serviceId: line.serviceId,
            staffId: line.staffId,
            name: displayName,
            duration: dur,
            price: unitPrice,
            staffLocked: !!sel?.staffLocked,
            ...(schedulingMode === "custom"
              ? {
                  startTime: formatTimeForApi(
                    minutesToTimeString(baseCustomM + copy * dur)
                  ),
                }
              : {}),
          })
        }
      }

      const invalid = servicesPayload.some((s) => !s.serviceId || !s.staffId)
      if (invalid) {
        toast({
          title: "Error",
          description: "Every service needs a staff member and a selected service.",
          variant: "destructive",
        })
        return null
      }

      const totalDuration = servicesPayload.reduce((sum, s) => sum + (s.duration || 0), 0)
      const totalRevenue = servicesPayload.reduce((sum, s) => sum + (Number(s.price) || 0), 0)

      try {
        const response = await AppointmentsAPI.create({
          clientId: selectedCustomer._id || selectedCustomer.id,
          clientName: selectedCustomer.name,
          date: dateStr,
          time: formatTimeForApi(baseTimeStr),
          leadSource: leadSourceValue,
          schedulingMode,
          services: servicesPayload,
          totalDuration,
          totalAmount: totalRevenue,
          notes: ctx.notes || values.notes || "",
          status: "scheduled",
          ...parallelPayload,
        })
        if (!response.success) {
          toast({
            title: /\balready booked\b/i.test(response.error || "")
              ? "Scheduling conflict"
              : "Error",
            description: response.error || "Failed to create appointments before checkout.",
            variant: "destructive",
          })
          return null
        }
        const data = response.data
        if (!Array.isArray(data) || data.length === 0) {
          toast({
            title: "Error",
            description: "No appointments returned from server.",
            variant: "destructive",
          })
          return null
        }
        const linkedAppointmentIds = data.map((a: { _id?: string }) => String(a._id))
        const appointmentId = linkedAppointmentIds[0]
        const bookingGroupId =
          data[0]?.bookingGroupId != null ? String(data[0].bookingGroupId) : null
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("appointments-refresh"))
        }
        return { appointmentId, linkedAppointmentIds, bookingGroupId }
      } catch (error: unknown) {
        const serverMsg =
          (error as { responseData?: { error?: string } })?.responseData?.error ||
          (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        toast({
          title: "Error",
          description: serverMsg || "Failed to create appointments before checkout.",
          variant: "destructive",
        })
        return null
      }
    },
    [
      form,
      getServiceStartMinutes,
      isEditMode,
      schedulingMode,
      selectedCustomer,
      selectedServices,
      toast,
    ]
  )

  /**
   * Get staff available for a specific service's time block only.
   * Sequential: Service 0 = formTime to formTime+dur0, Service 1 = formTime+dur0 to formTime+dur0+dur1, etc.
   * Custom: each service uses its own startTime.
   * Availability is checked per service time block - NOT against full appointment duration.
   * Excludes: current appointment when editing (so editing one service doesn't invalidate others).
   */
  const getAvailableStaffForService = useCallback((serviceIndex: number) => {
    if (!formDate) return staff
    if (schedulingMode === "sequential" && !formTime) return staff
    const dateStr = format(formDate, "yyyy-MM-dd")
    const dayIndex = formDate.getDay()

    const serviceStartM = getServiceStartMinutes(serviceIndex)
    const serviceDuration = selectedServices[serviceIndex]?.duration ?? 60
    const serviceEndM = serviceStartM + serviceDuration

    return staff.filter((member: any) => {
      const staffId = member._id || member.id
      if (!staffId) return false

      const schedule = member.workSchedule || []
      const dayRow = schedule.find((r: any) => r.day === dayIndex)
      if (dayRow && dayRow.enabled === false) return false
      const startStr = dayRow?.startTime ?? "09:00"
      const endStr = dayRow?.endTime ?? "21:00"
      const workStartM = parseTimeToMinutes(startStr)
      const workEndM = parseTimeToMinutes(endStr)
      if (serviceStartM < workStartM || serviceEndM > workEndM) return false

      // Only check conflicts for THIS service's time block; exclude all appointments we're editing (main + related)
      const idsBeingEdited = new Set<string>()
      if (appointmentId) idsBeingEdited.add(String(appointmentId))
      selectedServices.forEach((s) => {
        if (s.id.startsWith("related-")) idsBeingEdited.add(s.id.replace("related-", ""))
      })
      const hasOverlappingAppointment = appointmentsForDate.some((apt: any) => {
        if (isHiddenAppointment(apt)) return false
        const aptId = apt._id || apt.id
        if (aptId && idsBeingEdited.has(String(aptId))) return false
        const aptStaffId = apt.staffId?._id || apt.staffId?.id || apt.staffId
        const aptStaffIds = new Set<string>()
        if (aptStaffId) aptStaffIds.add(String(aptStaffId))
        for (const a of apt.staffAssignments || []) {
          const sid = a.staffId?._id || a.staffId?.id || a.staffId
          if (sid) aptStaffIds.add(String(sid))
        }
        if (!aptStaffIds.has(String(staffId))) return false
        const aptStartM = parseTimeToMinutes(apt.time || "0:00")
        const aptDuration = apt.duration ?? 60
        const aptEndM = aptStartM + aptDuration
        return serviceStartM < aptEndM && serviceEndM > aptStartM
      })
      return !hasOverlappingAppointment
    })
  }, [staff, formDate, formTime, selectedServices, appointmentsForDate, appointmentId, schedulingMode, getServiceStartMinutes])

  // Load services and staff on component mount
  useEffect(() => {
    fetchServices()
    fetchStaff()
  }, [])

  // New appointment: start with one empty service row; pre-fill staff from calendar URL when present.
  useEffect(() => {
    if (appointmentId) return
    setSelectedServices((prev) => {
      if (prev.length === 0) {
        return [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            serviceId: "",
            staffId: urlStaffId || "",
            name: "",
            duration: 0,
            price: 0,
            staffLocked: false,
          },
        ]
      }
      if (prev.length !== 1) return prev
      const row = prev[0]
      if (!row.serviceId && !row.staffId && urlStaffId) {
        return [{ ...row, staffId: urlStaffId }]
      }
      return prev
    })
  }, [appointmentId, urlStaffId])

  // Load appointment when in edit mode
  useEffect(() => {
    if (!appointmentId) return
    let cancelled = false
    setLoadingAppointment(true)
    AppointmentsAPI.getById(appointmentId)
      .then((res) => {
        if (cancelled || !res?.success || !res?.data) return
        const a = res.data as any
        const client = a.clientId
        if (client) {
          const clientData: Client = {
            _id: client._id,
            id: client._id,
            name: client.name || "",
            phone: client.phone || "",
            email: client.email,
            status: "active",
          }
          setSelectedCustomer(clientData)
          setCustomerSearch(clientData.name)
          onClientSelect?.(clientData)
        }
        const svc = a.serviceId
        const staffIdVal = a.staffId?._id || a.staffId || (a.staffAssignments?.[0]?.staffId?._id ?? a.staffAssignments?.[0]?.staffId)

        // Build selectedServices: multi-staff group OR primary+additional (same staff)
        let servicesToShow: Array<{
          id: string
          serviceId: string
          staffId: string
          name: string
          duration: number
          price: number
          staffLocked?: boolean
        }> = []
        const related = (res as any).relatedAppointments as any[] | undefined

        const nonCancelledRelated = (related ?? []).filter((r: any) => !isHiddenAppointment(r))
        // Detect custom scheduling mode from the loaded booking. When custom, each service
        // gets an explicit startTime below — that alone causes the derived schedulingMode to be "custom".
        const groupIsCustom =
          a.schedulingMode === "custom" ||
          nonCancelledRelated.some((r: any) => r.schedulingMode === "custom")

        const timeStringTo24h = (t: string): string => {
          const m = parseTimeToMinutes(t)
          const h = Math.floor(m / 60) % 24
          const min = m % 60
          return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
        }

        if (nonCancelledRelated.length > 0) {
          // Multi-staff: merge main + related, sort by time. Exclude cancelled (should not appear when editing).
          const allApts = [{ ...a, _id: a._id }, ...nonCancelledRelated.map((r: any) => ({ ...r, _id: r._id }))]
          const byTime = [...allApts].sort((x, y) => {
            const xm = parseTimeToMinutes(x.time || "")
            const ym = parseTimeToMinutes(y.time || "")
            return xm - ym
          })
          servicesToShow = byTime.map((apt: any, idx: number) => {
            const s = apt.serviceId
            const sid = apt.staffId?._id || apt.staffId || (apt.staffAssignments?.[0]?.staffId?._id ?? apt.staffAssignments?.[0]?.staffId)
            return {
              id: apt._id === appointmentId ? "edit-service" : `related-${apt._id}`,
              serviceId: s?._id || s,
              staffId: sid || "",
              name: (typeof s === "object" && s?.name) || "Service",
              duration: apt.duration ?? (typeof s === "object" && s?.duration) ?? 60,
              price: apt.price ?? (typeof s === "object" && s?.price) ?? 0,
              staffLocked: !!apt.staffLocked,
              ...(groupIsCustom ? { startTime: timeStringTo24h(apt.time || "") } : {}),
            }
          })
        } else if (a.additionalServices && a.additionalServices.length > 0) {
          // Same staff, multiple services: primary + additional
          // Use primary service's duration from catalog (a.duration is TOTAL when there are additional services)
          // Use primary price = total - sum(additional); a.price is the stored TOTAL for primary+additional
          const additionalPrices = (a.additionalServices as any[]).map((s: any) => s?.price ?? 0)
          const additionalTotal = additionalPrices.reduce((sum, p) => sum + p, 0)
          const primaryPrice = Math.max(0, (a.price ?? 0) - additionalTotal)
          const primary = {
            id: "edit-service",
            serviceId: svc?._id || svc,
            staffId: staffIdVal || "",
            name: (typeof svc === "object" && svc?.name) || "Service",
            duration: (typeof svc === "object" && svc?.duration) ?? a.duration ?? 60,
            price: primaryPrice || ((typeof svc === "object" && svc?.price) ?? 0),
            staffLocked: !!a.staffLocked,
          }
          const additional = (a.additionalServices as any[]).map((s: any, idx: number) => ({
            id: `additional-${idx}`,
            serviceId: s._id || s,
            staffId: staffIdVal || "",
            name: s?.name || "Service",
            duration: s?.duration ?? 60,
            price: s?.price ?? 0,
            staffLocked: !!a.staffLocked,
          }))
          servicesToShow = [primary, ...additional]
        } else {
          servicesToShow = [{
            id: "edit-service",
            serviceId: svc?._id || svc,
            staffId: staffIdVal || "",
            name: (typeof svc === "object" && svc?.name) || "Service",
            duration: a.duration ?? (typeof svc === "object" && svc?.duration) ?? 60,
            price: a.price ?? (typeof svc === "object" && svc?.price) ?? 0,
            staffLocked: !!a.staffLocked,
          }]
        }

        setSelectedServices(servicesToShow)
        setExistingBookingGroupId(a.bookingGroupId || null)
        lastLoadedRecurrenceRef.current =
          a.recurrence && typeof a.recurrence === "object" ? { ...a.recurrence } : null
        setEditedAppointmentStatus(typeof a.status === "string" ? a.status : "scheduled")
        setExistingGroupAppointmentIds(
          nonCancelledRelated.length > 0
            ? [String(a._id), ...nonCancelledRelated.map((r: any) => String(r._id))]
            : []
        )
        if (a.date) {
          const parts = a.date.split("-").map(Number)
          if (parts.length >= 3) {
            // Use earliest time when multiple appointments (first service start)
            let apiTime = a.time || ""
            if (nonCancelledRelated.length > 0) {
              const allApts = [a, ...nonCancelledRelated]
              const sorted = [...allApts].sort((x, y) => parseTimeToMinutes(x.time || "") - parseTimeToMinutes(y.time || ""))
              apiTime = sorted[0]?.time || apiTime
            }
            const minutes = parseTimeToMinutes(apiTime)
            const slot = apiTime ? timeSlots.find((t) => parseTimeToMinutes(t) === minutes) : ""
            form.reset({
              ...form.getValues(),
              date: new Date(parts[0], parts[1] - 1, parts[2]),
              time: slot ?? apiTime ?? "",
              notes: a.notes || "",
            })
          }
        }
        if (a.time) {
          let apiTime = a.time
          if (nonCancelledRelated.length > 0) {
            const allApts = [a, ...nonCancelledRelated]
            const sorted = [...allApts].sort((x, y) => parseTimeToMinutes(x.time || "") - parseTimeToMinutes(y.time || ""))
            apiTime = sorted[0]?.time || apiTime
          }
          const minutes = parseTimeToMinutes(apiTime)
          const match = timeSlots.find((t) => parseTimeToMinutes(t) === minutes)
          form.setValue("time", match ?? apiTime)
        }
        form.setValue("notes", a.notes || "")
        const ls = a.leadSource || ""
        if (ls.startsWith("Referral:")) {
          form.setValue("leadSource", "Referral")
          form.setValue("leadSourceDetail", ls.replace(/^Referral:\s*/, ""))
        } else if (ls.startsWith("Other:")) {
          form.setValue("leadSource", "Other")
          form.setValue("leadSourceDetail", ls.replace(/^Other:\s*/, ""))
        } else {
          form.setValue("leadSource", ls || "")
          form.setValue("leadSourceDetail", "")
        }
        queueMicrotask(() => {
          if (cancelled) return
          commitEditBaseline(form.getValues(), servicesToShow as SelectedService[])
        })
      })
      .catch(() => {
        if (!cancelled) toast({ title: "Error", description: "Failed to load appointment", variant: "destructive" })
      })
      .finally(() => {
        if (!cancelled) setLoadingAppointment(false)
      })
    return () => { cancelled = true }
  }, [appointmentId])

  // After creating a new client via dialog, refresh search results
  useEffect(() => {
    const unsubscribe = clientStore.subscribe(() => {
      if (customerSearch.trim() && !selectedCustomer) {
        clientStore.searchClients(customerSearch.trim())
          .then(results => setClients(results || []))
          .catch(() => {})
      }
    })
    return unsubscribe
  }, [customerSearch, selectedCustomer])

  // Hide client details panel when search box is empty (no number/name)
  useEffect(() => {
    if (!isEditMode && !customerSearch.trim() && selectedCustomer) {
      setSelectedCustomer(null)
      onClientSelect?.(null)
    }
  }, [isEditMode, customerSearch, selectedCustomer, onClientSelect])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.customer-search-container')) {
        setShowCustomerDropdown(false)
      }
      // Close service dropdowns when clicking outside
      if (!target.closest('.service-dropdown-container')) {
        setServiceDropdowns(prev => {
          const updated = { ...prev }
          Object.keys(updated).forEach(key => {
            updated[key] = { ...updated[key], isOpen: false }
          })
          return updated
        })
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchServices = async () => {
    try {
      setLoadingServices(true)
      const response = await ServicesAPI.getAll({ limit: 1000 }) // Fetch up to 1000 services
      if (response.success) {
        setServices(response.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch services:', error)
    } finally {
      setLoadingServices(false)
    }
  }

  const fetchStaff = async () => {
    try {
      setLoadingStaff(true)
      // Use StaffDirectory API to get business-specific staff (includes business owners and staff)
      const response = await StaffDirectoryAPI.getAll()
      if (response.success) {
        const staffMembers = (response.data || []).filter((user: any) => {
          const hasValidId = user._id || user.id
          const isEnabled = (user.role === 'staff' || user.role === 'manager' || user.role === 'admin') && user.isActive === true && user.allowAppointmentScheduling === true
          return hasValidId && isEnabled
        })
        setStaff(staffMembers)
      }
    } catch (error) {
      console.error('Failed to fetch staff:', error)
    } finally {
      setLoadingStaff(false)
    }
  }

  useEffect(() => {
    if (selectedCustomer) return
    const trimmed = customerSearch.trim()
    if (!trimmed) return
    if (trimmed.length < 2) {
      setClients([])
      return
    }
    if (clientSearchTimer.current) clearTimeout(clientSearchTimer.current)
    clientSearchTimer.current = setTimeout(async () => {
      setSearchingClients(true)
      try {
        const results = await clientStore.searchClients(trimmed)
        setClients(results || [])
      } catch {
        setClients([])
      } finally {
        setSearchingClients(false)
      }
    }, 300)
    return () => {
      if (clientSearchTimer.current) clearTimeout(clientSearchTimer.current)
    }
  }, [customerSearch, selectedCustomer])

  const filteredCustomers = clients

  // Handle customer selection
  const handleCustomerSelect = (customer: Client) => {
    setSelectedCustomer(customer)
    setCustomerSearch(customer.name)
    setShowCustomerDropdown(false)
    onClientSelect?.(customer)
  }

  // Handle customer search input
  const handleCustomerSearchChange = (value: string) => {
    // Check if the value contains only digits (phone number search)
    // If it's all digits, restrict to 10 digits
    if (value.length > 0 && /^\d+$/.test(value)) {
      // Only allow digits and limit to 10
      const phoneValue = value.replace(/\D/g, '').slice(0, 10)
      setCustomerSearch(phoneValue)
    } else if (value.length === 0) {
      // Allow empty string and clear selection
      setCustomerSearch(value)
      setSelectedCustomer(null)
      onClientSelect?.(null)
    } else {
      // Allow text for name/email search (contains letters or special chars)
      setCustomerSearch(value)
    }
    setShowCustomerDropdown(true)

    // If search doesn't match selected customer, clear selection
    const finalValue = value.length > 0 && /^\d+$/.test(value) 
      ? value.replace(/\D/g, '').slice(0, 10)
      : value
    if (selectedCustomer && !selectedCustomer.name.toLowerCase().includes(finalValue.toLowerCase())) {
      setSelectedCustomer(null)
      onClientSelect?.(null)
    }
  }

  // Handle creating new customer
  const handleCreateNewCustomer = () => {
    setNewClient({
      firstName: "",
      lastName: "",
      phone: customerSearch,
      email: "",
    })
    setShowNewClientDialog(true)
    setShowCustomerDropdown(false)
  }

  // Handle saving new customer
  const handleSaveNewCustomer = async () => {
    if (!newClient.firstName) {
      toast({
        title: "Missing Information",
        description: "Please provide a first name.",
        variant: "destructive",
      })
      return
    }

    // Validate phone number - must be exactly 10 digits
    const phoneNumber = newClient.phone || customerSearch
    if (!phoneNumber || !/^\d{10}$/.test(phoneNumber)) {
      toast({
        title: "Invalid Phone Number",
        description: "Phone number must be exactly 10 digits.",
        variant: "destructive",
      })
      return
    }

    try {
      const newClientData = {
        id: `new-${Date.now()}`,
        name: newClient.lastName ? `${newClient.firstName} ${newClient.lastName}` : newClient.firstName,
        phone: phoneNumber,
        email: newClient.email,
        status: "active" as const,
      }

      const success = await clientStore.addClient(newClientData)

      if (success) {
        const allClients = clientStore.getClients()
        const createdClient = allClients.find(c =>
          c.phone === phoneNumber && c._id && !String(c._id).startsWith('new-')
        )

        if (createdClient) {
          setSelectedCustomer(createdClient)
          setCustomerSearch(createdClient.name)
          onClientSelect?.(createdClient)
        }

        setNewClient({
          firstName: "",
          lastName: "",
          phone: "",
          email: "",
        })
        setShowNewClientDialog(false)

        toast({
          title: "Client Created",
          description: "New client has been successfully created.",
        })
      } else {
        toast({
          title: "Error",
          description: "Failed to create client. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error creating client:', error)
      toast({
        title: "Error",
        description: "Failed to create client. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Add a service: inherit staff from the previous row (or calendar URL for first row),
  // pre-fill chained start time for 2+ services when appointment time is set.
  const addService = () => {
    const baseTime = formTime || ""
    setSelectedServices((prev) => {
      const last = prev[prev.length - 1]
      const newIndex = prev.length
      const inheritStaffId = last?.staffId || urlStaffId || ""
      const inheritLocked = last ? !!last.staffLocked : false
      let startTime: string | undefined
      if (newIndex >= 1 && baseTime) {
        const chainM = computeChainedStartMinutes(prev, baseTime, newIndex)
        // Exact chain end (e.g. 7:00 + 20m → 7:20); do not round to 15m slots — that created gaps.
        startTime = minutesToTimeString(chainM)
      }
      const newService: SelectedService = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        serviceId: "",
        staffId: inheritStaffId,
        name: "",
        duration: 0,
        price: 0,
        staffLocked: inheritLocked,
        ...(startTime ? { startTime } : {}),
      }
      return [...prev, newService]
    })
  }

  // Remove a service from the appointment
  const removeService = (id: string) => {
    setSelectedServices(selectedServices.filter(service => service.id !== id))
  }

  // Update a service
  const updateService = (id: string, field: keyof SelectedService, value: any) => {
    setSelectedServices(selectedServices => 
      selectedServices.map(service => {
        if (service.id === id) {
          const updatedService = { ...service, [field]: value }
          
          // Auto-fill service details when service is selected
          if (field === "serviceId" && value) {
            const selectedService = services.find(s => s._id === value || s.id === value)
            if (selectedService) {
              updatedService.name = selectedService.name
              updatedService.duration = selectedService.duration
              updatedService.price = selectedService.price
            }
          }
          if (field === "staffId" && !value) {
            updatedService.staffLocked = false
          }
          
          return updatedService
        }
        return service
      })
    )
  }

  // Get or initialize dropdown state for a service
  const getDropdownState = (serviceId: string) => {
    return serviceDropdowns[serviceId] || { search: '', isOpen: false }
  }

  // Update dropdown state
  const updateDropdownState = (serviceId: string, updates: Partial<{ search: string, isOpen: boolean }>) => {
    setServiceDropdowns(prev => ({
      ...prev,
      [serviceId]: {
        ...getDropdownState(serviceId),
        ...updates
      }
    }))
  }

  // Filter services based on search
  const getFilteredServices = (serviceId: string) => {
    const search = getDropdownState(serviceId).search.toLowerCase()
    if (!search) return services
    return services.filter(s => 
      s.name.toLowerCase().includes(search) ||
      s.price.toString().includes(search)
    )
  }

  // Calculate total duration
  const calculateTotalDuration = () => {
    return selectedServices.reduce((total, service) => total + service.duration, 0)
  }

  // Calculate total amount
  const calculateTotalAmount = () => {
    return selectedServices.reduce((total, service) => total + service.price, 0)
  }

  const checkoutInitialLines = useMemo((): ServiceCheckoutLine[] => {
    return selectedServices
      .filter((s) => !!s.serviceId)
      .map((s) => ({
        id: s.id,
        serviceId: s.serviceId,
        staffId: s.staffId,
        name: s.name || "Service",
        duration: s.duration || 0,
        price: s.price || 0,
        quantity: 1,
        discountValue: 0,
        discountIsPercent: true,
      }))
  }, [selectedServices])

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (isAppointmentFormReadOnly) return

    if (!selectedCustomer) {
      toast({
        title: "Error",
        description: "Please select a client.",
        variant: "destructive",
      })
      return
    }

    if (selectedServices.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one service.",
        variant: "destructive",
      })
      return
    }

    const missingService = selectedServices.some(service => !service.serviceId)
    if (missingService) {
      toast({
        title: "Error",
        description: "Please select a service for all entries.",
        variant: "destructive",
      })
      return
    }

    // Validate that all services have staff assigned
    const unassignedServices = selectedServices.filter(service => !service.staffId)
    if (unassignedServices.length > 0) {
      toast({
        title: "Error",
        description: "Please assign staff to all services.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    /** Calendar allows overlapping bookings; staff may be marked (Not available) but still selectable. */
    const parallelPayload = { allowParallelBooking: true as const }

    try {
      const leadSourceValue = values.leadSource
        ? (values.leadSource === "Referral" || values.leadSource === "Other")
          ? `${values.leadSource}${values.leadSourceDetail ? `: ${values.leadSourceDetail}` : ""}`
          : values.leadSource
        : undefined

      if (isEditMode && appointmentId) {
        let appointmentIdDeleted = false
        const dateStr = format(values.date, "yyyy-MM-dd")
        const timeStr = formatTimeForApi(values.time)
        const hasAdditional = selectedServices.some((s) => s.id.startsWith("additional-"))
        const hasRelated = selectedServices.some((s) => s.id.startsWith("related-"))
        const newServices = selectedServices.filter((s) => !["edit-service"].includes(s.id) && !s.id.startsWith("related-") && !s.id.startsWith("additional-"))
        const primary = selectedServices.find((s) => s.id === "edit-service")
        const existingAdditional = selectedServices.filter((s) => s.id.startsWith("additional-"))

        if (hasAdditional) {
          // Legacy single-doc booking with additionalServiceIds: keep existing additionals on the same doc.
          // Newly added services (regardless of staff) flow to the trailing block to become new linked cards.
          // If primary (edit-service) was removed: promote first additional to primary
          const effectivePrimary = primary ?? (existingAdditional.length > 0 ? { ...existingAdditional[0], id: "edit-service" } : null)
          if (!effectivePrimary) {
            toast({ title: "Error", description: "Invalid edit state.", variant: "destructive" })
            return
          }
          const restAdditional = primary ? existingAdditional : existingAdditional.slice(1)
          const additionalIds = restAdditional.map((s) => s.serviceId)
          const legacyServices = [effectivePrimary, ...restAdditional]
          const totalDur = legacyServices.reduce((sum, s) => sum + (s.duration || 0), 0)
          const totalPrice = legacyServices.reduce((sum, s) => sum + (s.price || 0), 0)
          const updateRes = await AppointmentsAPI.update(appointmentId, {
            date: dateStr,
            time: timeStr,
            serviceId: effectivePrimary.serviceId,
            additionalServiceIds: additionalIds,
            staffId: effectivePrimary.staffId,
            staffAssignments: effectivePrimary.staffId ? [{ staffId: effectivePrimary.staffId, percentage: 100, role: "primary" }] : undefined,
            duration: totalDur,
            price: totalPrice,
            leadSource: leadSourceValue || "",
            notes: values.notes,
            staffLocked: selectedServices.some((s) => s.staffLocked),
            ...parallelPayload,
          })
          if (!updateRes?.success) {
            toast({ title: "Error", description: updateRes?.error || "Failed to update.", variant: "destructive" })
            return
          }
        } else if (hasRelated) {
          // Multi staff: delete removed appointments, update remaining with sequential or per-row custom times.
          const idsToUpdate = selectedServices
            .map((s) => (s.id === "edit-service" ? appointmentId : s.id.startsWith("related-") ? s.id.replace("related-", "") : null))
            .filter(Boolean)
            .map((id) => String(id)) as string[]
          let idsToDelete = existingGroupAppointmentIds.map((id) => String(id)).filter((id) => !idsToUpdate.includes(id))
          // When edit-service was removed, ensure appointmentId is deleted even if existingGroupAppointmentIds was stale
          if (!idsToUpdate.includes(String(appointmentId))) {
            if (!idsToDelete.includes(String(appointmentId))) idsToDelete = [...idsToDelete, String(appointmentId)]
            appointmentIdDeleted = true
          }
          for (const id of idsToDelete) {
            const delRes = await AppointmentsAPI.delete(id)
            if (!delRes?.success) {
              toast({ title: "Error", description: "Failed to delete removed service.", variant: "destructive" })
              return
            }
          }
          for (let i = 0; i < selectedServices.length; i++) {
            const s = selectedServices[i]
            const serviceTime = schedulingMode === "custom" && s.startTime
              ? s.startTime
              : getSequentialServiceStartTime(selectedServices, values.time, i)
            const apiTime = formatTimeForApi(serviceTime)
            const aptId = s.id === "edit-service" ? appointmentId : s.id.startsWith("related-") ? s.id.replace("related-", "") : null
            if (!aptId) continue
            const updateRes = await AppointmentsAPI.update(aptId, {
              date: dateStr,
              time: apiTime,
              serviceId: s.serviceId,
              staffId: s.staffId,
              staffAssignments: s.staffId ? [{ staffId: s.staffId, percentage: 100, role: "primary" }] : undefined,
              duration: s.duration,
              price: s.price,
              leadSource: leadSourceValue || "",
              notes: values.notes,
              staffLocked: !!s.staffLocked,
              ...(schedulingMode === "custom" ? { schedulingMode: "custom" } : {}),
              ...parallelPayload,
            })
            if (!updateRes?.success) {
              toast({ title: "Error", description: updateRes?.error || "Failed to update.", variant: "destructive" })
              return
            }
          }
        } else {
          // Single service or edit-service only
          const originalService = selectedServices.find((s) => s.id === "edit-service")
          if (originalService) {
            const customTimeStr = schedulingMode === "custom" && originalService.startTime
              ? formatTimeForApi(originalService.startTime)
              : timeStr
            const updateRes = await AppointmentsAPI.update(appointmentId, {
              date: dateStr,
              time: customTimeStr,
              serviceId: originalService.serviceId,
              additionalServiceIds: [],
              staffId: originalService.staffId,
              staffAssignments: originalService.staffId ? [{ staffId: originalService.staffId, percentage: 100, role: "primary" }] : undefined,
              duration: originalService.duration,
              price: originalService.price,
              leadSource: leadSourceValue || "",
              notes: values.notes,
              staffLocked: !!originalService.staffLocked,
              ...(schedulingMode === "custom" ? { schedulingMode: "custom" } : {}),
              ...parallelPayload,
            })
            if (!updateRes?.success) {
              toast({ title: "Error", description: updateRes?.error || "Failed to update.", variant: "destructive" })
              return
            }
          } else {
            await AppointmentsAPI.delete(appointmentId)
          }
        }

        if (newServices.length > 0) {
          // Link new cards to existing group (or create group for originally single card).
          // Each newly added service — same staff or different staff — becomes its own linked card.
          const groupId = existingBookingGroupId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
          if (!existingBookingGroupId && !appointmentIdDeleted) {
            await AppointmentsAPI.update(appointmentId, { bookingGroupId: groupId })
          }
          // New services must start after all existing services (sequential, no overlap)
          const firstNewIdx = selectedServices.findIndex((s) =>
            newServices.some((n) => n.serviceId === s.serviceId && n.staffId === s.staffId)
          )
          const baseTimeForNew =
            firstNewIdx >= 0
              ? getSequentialServiceStartTime(selectedServices, values.time, firstNewIdx)
              : values.time
          const timeStrForNew = formatTimeForApi(baseTimeForNew)
          const createRes = await AppointmentsAPI.create({
            clientId: selectedCustomer._id || selectedCustomer.id,
            clientName: selectedCustomer.name,
            date: dateStr,
            time: timeStrForNew,
            leadSource: leadSourceValue,
            bookingGroupId: groupId,
            schedulingMode,
            services: newServices.map((s) => {
              const idx = selectedServices.findIndex((x) => x.id === s.id)
              const effective = s.startTime
                || (schedulingMode === "custom" && idx >= 0 ? minutesToTimeString(getServiceStartMinutes(idx)) : undefined)
              return {
                serviceId: s.serviceId,
                staffId: s.staffId,
                name: s.name,
                duration: s.duration,
                price: s.price,
                staffLocked: !!s.staffLocked,
                ...(schedulingMode === "custom" && effective
                  ? { startTime: formatTimeForApi(effective) }
                  : {}),
              }
            }),
            totalDuration: newServices.reduce((sum, s) => sum + (s.duration || 0), 0),
            totalAmount: newServices.reduce((sum, s) => sum + (s.price || 0), 0),
            notes: values.notes,
            status: "scheduled",
            ...parallelPayload,
          })
          if (!createRes?.success) {
            toast({
              title:
                /\balready booked\b/i.test(createRes?.error || "")
                  ? "Scheduling conflict"
                  : "Error",
              description: createRes?.error || "Failed to create new services.",
              variant: "destructive",
            })
            return
          }
        }

        toast({ title: "Appointment Updated", description: newServices.length > 0 ? "Changes saved and new services added." : "Changes have been saved." })
        commitEditBaseline(values, selectedServices)
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("appointments-refresh"))
        onSuccess ? onSuccess() : router.push("/appointments")
      } else {
        const appointmentData = {
          clientId: selectedCustomer._id || selectedCustomer.id,
          clientName: selectedCustomer.name,
          date: format(values.date, "yyyy-MM-dd"),
          time: formatTimeForApi(values.time),
          leadSource: leadSourceValue,
          schedulingMode,
          services: selectedServices.map((service, idx) => {
            const effective = service.startTime
              || (schedulingMode === "custom" ? minutesToTimeString(getServiceStartMinutes(idx)) : undefined)
            return {
              serviceId: service.serviceId,
              staffId: service.staffId,
              name: service.name,
              duration: service.duration,
              price: service.price,
              staffLocked: !!service.staffLocked,
              ...(schedulingMode === "custom" && effective
                ? { startTime: formatTimeForApi(effective) }
                : {}),
            }
          }),
          totalDuration: calculateTotalDuration(),
          totalAmount: calculateTotalAmount(),
          notes: values.notes,
          status: "scheduled",
          ...parallelPayload,
        }
        const response = await AppointmentsAPI.create(appointmentData)
        if (!response.success) {
          toast({
            title:
              /\balready booked\b/i.test(response.error || "")
                ? "Scheduling conflict"
                : "Error",
            description: response.error || "Failed to create appointment.",
            variant: "destructive",
          })
          return
        }
        toast({ title: "Appointment Created", description: "New appointment has been successfully scheduled." })
        onSuccess ? onSuccess() : router.push("/appointments")
      }
    } catch (error: any) {
      const serverMsg = error?.responseData?.error || error?.response?.data?.error
      if (process.env.NODE_ENV === "development") {
        console.warn("[appointment-form]", error?.message || error)
      }
      toast({
        title: "Error",
        description: serverMsg || "Failed to create appointment. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (appointmentId) return
    setEditedAppointmentStatus(null)
  }, [appointmentId])

  useEffect(() => {
    if (appointmentId || !prefillClientId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await ClientsAPI.getById(prefillClientId)
        if (cancelled || !res?.success || !res.data) return
        const c = res.data
        const clientData: Client = {
          _id: c._id,
          id: c._id,
          name: c.name || "",
          phone: c.phone || "",
          email: c.email,
          status: "active",
        }
        setSelectedCustomer(clientData)
        setCustomerSearch(clientData.name)
        onClientSelect?.(clientData)
      } catch {
        // ignore failed client prefill
      }
    })()
    return () => {
      cancelled = true
    }
  }, [prefillClientId, appointmentId, onClientSelect])

  const openActivityDialog = useCallback(async () => {
    setActivityDialogOpen(true)
    setActivityDetail(null)
    if (!appointmentId) return
    setActivityLoading(true)
    try {
      const res = await AppointmentsAPI.getById(appointmentId)
      if (res?.success && res.data) setActivityDetail(res.data)
    } finally {
      setActivityLoading(false)
    }
  }, [appointmentId])

  const openRebookDialog = useCallback(() => {
    const d = form.getValues("date")
    const t = form.getValues("time")
    setRebookDate(d ? startOfDay(d) : startOfDay(new Date()))
    setRebookTime(t || timeSlots[96] || timeSlots[0] || "")
    setRebookDialogOpen(true)
  }, [form])

  const confirmRebook = useCallback(() => {
    const cid = selectedCustomer?._id || selectedCustomer?.id
    const params = new URLSearchParams()
    if (cid) params.set("clientId", String(cid))
    params.set("date", format(rebookDate, "yyyy-MM-dd"))
    if (rebookTime) params.set("time", rebookTime)
    const firstStaff = selectedServices[0]?.staffId
    if (firstStaff) params.set("staffId", String(firstStaff))
    router.push(`/appointments/new?${params.toString()}`)
    setRebookDialogOpen(false)
  }, [rebookDate, rebookTime, router, selectedCustomer, selectedServices])

  const persistNotesEverywhere = useCallback(
    async (notesValue: string) => {
      if (appointmentIdsForGroupActions.length === 0) {
        form.setValue("notes", notesValue)
        return true
      }
      let ok = true
      for (const id of appointmentIdsForGroupActions) {
        const res = await AppointmentsAPI.update(id, { notes: notesValue })
        if (!res?.success) ok = false
      }
      if (ok) form.setValue("notes", notesValue)
      return ok
    },
    [appointmentIdsForGroupActions, form]
  )

  const submitNoteDialog = useCallback(async () => {
    if (noteDialogMode === "add") {
      const addition = addNoteDraft.trim()
      if (!addition) {
        toast({ title: "Empty note", description: "Enter some text to add.", variant: "destructive" })
        return
      }
      const current = (form.getValues("notes") || "").trim()
      const merged = current ? `${current}\n\n${addition}` : addition
      setAddNoteSaving(true)
      try {
        const ok = await persistNotesEverywhere(merged)
        if (ok) {
          setAddNoteDialogOpen(false)
          setAddNoteDraft("")
          toast({ title: "Note saved" })
          commitEditBaseline(form.getValues(), selectedServices)
          window.dispatchEvent(new Event("appointments-refresh"))
        } else {
          toast({ title: "Could not save note", description: "Please try again.", variant: "destructive" })
        }
      } finally {
        setAddNoteSaving(false)
      }
      return
    }
    const next = addNoteDraft.trim()
    setAddNoteSaving(true)
    try {
      const ok = await persistNotesEverywhere(next)
      if (ok) {
        setAddNoteDialogOpen(false)
        setAddNoteDraft("")
        toast({ title: "Note updated" })
        commitEditBaseline(form.getValues(), selectedServices)
        window.dispatchEvent(new Event("appointments-refresh"))
      } else {
        toast({ title: "Could not update note", description: "Please try again.", variant: "destructive" })
      }
    } finally {
      setAddNoteSaving(false)
    }
  }, [addNoteDraft, form, noteDialogMode, persistNotesEverywhere, selectedServices, toast])

  const deleteNotesFromBooking = useCallback(async () => {
    setAddNoteSaving(true)
    try {
      const ok = await persistNotesEverywhere("")
      if (ok) {
        setAddNoteDialogOpen(false)
        setAddNoteDraft("")
        toast({ title: "Notes removed" })
        commitEditBaseline(form.getValues(), selectedServices)
        window.dispatchEvent(new Event("appointments-refresh"))
      } else {
        toast({ title: "Could not remove notes", description: "Please try again.", variant: "destructive" })
      }
    } finally {
      setAddNoteSaving(false)
    }
  }, [form, persistNotesEverywhere, selectedServices, toast])

  const openRepeatingDialog = useCallback(() => {
    setRecurrenceForm(recurrenceFromApi(lastLoadedRecurrenceRef.current))
    setRepeatingDialogOpen(true)
  }, [])

  const saveRecurrence = useCallback(async () => {
    if (!appointmentId || appointmentIdsForGroupActions.length === 0) return
    if (recurrenceForm.frequency !== "doesnt") {
      if (recurrenceForm.frequency === "custom") {
        if (!recurrenceForm.customInterval || recurrenceForm.customInterval < 1) {
          toast({ title: "Invalid interval", description: "Enter a positive number.", variant: "destructive" })
          return
        }
      }
      if (recurrenceForm.endType === "count") {
        if (!recurrenceForm.endAfterCount || recurrenceForm.endAfterCount < 1) {
          toast({
            title: "Invalid end",
            description: "Enter how many times the series should repeat.",
            variant: "destructive",
          })
          return
        }
      }
      if (recurrenceForm.endType === "date" && !recurrenceForm.endOnDate) {
        toast({ title: "Pick an end date", variant: "destructive" })
        return
      }
    }
    const payload = recurrenceToApiPayload(recurrenceForm)
    setRecurrenceSaving(true)
    try {
      let ok = true
      for (const id of appointmentIdsForGroupActions) {
        const res = await AppointmentsAPI.update(id, { recurrence: payload })
        if (!res?.success) ok = false
      }
      if (ok) {
        lastLoadedRecurrenceRef.current = { ...payload }
        setRepeatingDialogOpen(false)
        toast({ title: "Repeat settings saved" })
        window.dispatchEvent(new Event("appointments-refresh"))
      } else {
        toast({ title: "Could not save", description: "Please try again.", variant: "destructive" })
      }
    } finally {
      setRecurrenceSaving(false)
    }
  }, [appointmentId, appointmentIdsForGroupActions, recurrenceForm, toast])

  const applyStatusToAllGroupDocs = useCallback(
    async (status: string) => {
      const ids = appointmentIdsForGroupActions
      if (ids.length === 0) return false
      let allOk = true
      for (const id of ids) {
        const res = await AppointmentsAPI.update(id, { status })
        if (!res?.success) allOk = false
      }
      return allOk
    },
    [appointmentIdsForGroupActions]
  )

  const applyWorkflowStatus = useCallback(
    async (next: string) => {
      if (!appointmentId || appointmentIdsForGroupActions.length === 0) return
      setStatusActionLoading(true)
      try {
        const ok = await applyStatusToAllGroupDocs(next)
        if (ok) {
          setEditedAppointmentStatus(next)
          toast({ title: "Status updated" })
          window.dispatchEvent(new Event("appointments-refresh"))
        } else {
          toast({
            title: "Could not update status",
            description: "Please try again.",
            variant: "destructive",
          })
        }
      } finally {
        setStatusActionLoading(false)
      }
    },
    [appointmentId, appointmentIdsForGroupActions.length, applyStatusToAllGroupDocs, toast]
  )

  const confirmCancelAppointmentAction = useCallback(async () => {
    if (!appointmentId || appointmentIdsForGroupActions.length === 0) return
    setStatusActionLoading(true)
    try {
      const ok = await applyStatusToAllGroupDocs("cancelled")
      if (ok) {
        toast({ title: "Appointment cancelled" })
        setEditedAppointmentStatus("cancelled")
        setCancelApptDialogOpen(false)
        window.dispatchEvent(new Event("appointments-refresh"))
        if (onSuccess) onSuccess()
        else router.push("/appointments")
      } else {
        toast({ title: "Could not cancel", description: "Please try again.", variant: "destructive" })
      }
    } finally {
      setStatusActionLoading(false)
    }
  }, [
    appointmentId,
    appointmentIdsForGroupActions.length,
    applyStatusToAllGroupDocs,
    onSuccess,
    router,
    toast,
  ])

  const confirmNoShowAction = useCallback(async () => {
    if (!appointmentId || appointmentIdsForGroupActions.length === 0) return
    setStatusActionLoading(true)
    try {
      const ok = await applyStatusToAllGroupDocs("missed")
      if (ok) {
        toast({ title: "Marked as no-show" })
        setEditedAppointmentStatus("missed")
        setNoShowDialogOpen(false)
        window.dispatchEvent(new Event("appointments-refresh"))
        if (onSuccess) onSuccess()
        else router.push("/appointments")
      } else {
        toast({ title: "Could not update", description: "Please try again.", variant: "destructive" })
      }
    } finally {
      setStatusActionLoading(false)
    }
  }, [
    appointmentId,
    appointmentIdsForGroupActions.length,
    applyStatusToAllGroupDocs,
    onSuccess,
    router,
    toast,
  ])

  const isDrawer = variant === "drawer"

  useEffect(() => {
    if (!onDrawerHeaderEndChange) return
    if (variant !== "drawer" || !isEditMode || !appointmentId || loadingAppointment || serviceCheckoutOpen) {
      onDrawerHeaderEndChange(null)
      return
    }
    onDrawerHeaderEndChange(
      <DrawerEditStatusDropdown
        appointmentStatus={editedAppointmentStatus}
        appearanceStatus={editAppearanceStatus}
        hasLinkedInvoice={hasLinkedInvoice}
        terminal={isTerminalAppointmentStatus || isPartialPaymentEditReadOnly}
        busy={statusActionLoading}
        onApplyStatus={applyWorkflowStatus}
        onRequestNoShow={() => setNoShowDialogOpen(true)}
        onRequestCancel={() => setCancelApptDialogOpen(true)}
      />
    )
  }, [
    onDrawerHeaderEndChange,
    variant,
    isEditMode,
    appointmentId,
    loadingAppointment,
    serviceCheckoutOpen,
    editedAppointmentStatus,
    editAppearanceStatus,
    hasLinkedInvoice,
    isTerminalAppointmentStatus,
    isPartialPaymentEditReadOnly,
    statusActionLoading,
    applyWorkflowStatus,
  ])

  useEffect(() => {
    return () => {
      onDrawerHeaderEndChange?.(null)
    }
  }, [onDrawerHeaderEndChange])

  useEffect(() => {
    if (!onDrawerHeaderStatusToneChange) return
    if (variant !== "drawer" || !isEditMode || !appointmentId || loadingAppointment || serviceCheckoutOpen) {
      onDrawerHeaderStatusToneChange(null)
      return
    }
    onDrawerHeaderStatusToneChange(editAppearanceStatus)
  }, [
    onDrawerHeaderStatusToneChange,
    variant,
    isEditMode,
    appointmentId,
    loadingAppointment,
    serviceCheckoutOpen,
    editAppearanceStatus,
  ])

  useEffect(() => {
    return () => {
      onDrawerHeaderStatusToneChange?.(null)
    }
  }, [onDrawerHeaderStatusToneChange])

  const formContent = (
    <>
        {loadingAppointment ? (
          <div className={cn("flex flex-col items-center justify-center gap-4", isDrawer ? "py-12" : "py-16")}>
            <Loader2 className={cn("animate-spin text-indigo-600", isDrawer ? "h-8 w-8" : "h-10 w-10")} />
            <p className="text-slate-600 text-sm">Loading appointment...</p>
          </div>
        ) : (
        <Form {...form}>
          <form id="appointmentForm" onSubmit={form.handleSubmit(onSubmit)} className={cn(isDrawer ? "space-y-6" : "space-y-10")}>
            
            {/* Client Selection */}
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Client *
                </Label>
              </div>
              {isEditMode ? (
                <div className="flex items-center gap-3 h-12 px-4 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-medium">
                  <User className="h-4 w-4 text-slate-500" />
                  {selectedCustomer?.name || "—"}
                </div>
              ) : (
              <div className="relative customer-search-container">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="tel"
                  placeholder="Search by name or phone (10 digits)..."
                  value={customerSearch}
                  onChange={(e) => {
                    const value = e.target.value
                    if (/^\d+$/.test(value)) {
                      const restricted = value.slice(0, 10)
                      handleCustomerSearchChange(restricted)
                    } else {
                      handleCustomerSearchChange(value)
                    }
                  }}
                  onPaste={(e) => {
                    const pastedText = e.clipboardData.getData('text')
                    if (/^\d+$/.test(pastedText)) {
                      e.preventDefault()
                      const restricted = pastedText.slice(0, 10)
                      handleCustomerSearchChange(restricted)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (/^\d+$/.test(customerSearch) && customerSearch.length >= 10) {
                      if (!['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key) && 
                          !e.ctrlKey && !e.metaKey) {
                        e.preventDefault()
                      }
                    }
                  }}
                  onFocus={() => {
                    setShowCustomerDropdown(true)
                    if (!customerSearch.trim() && !selectedCustomer) {
                      clientStore.preloadRecent().then(recent => {
                        if (recent.length) setClients(recent)
                      })
                    }
                  }}
                  className="pl-12 h-12 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl"
                />

                {showCustomerDropdown && (customerSearch || clients.length > 0) && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-auto">
                    {searchingClients ? (
                      <div className="p-4 text-center text-slate-500 flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Searching clients...</span>
                      </div>
                    ) : filteredCustomers.length > 0 ? (
                      filteredCustomers.map((customer, index) => (
                        <div
                          key={`${customer._id || customer.id || 'customer'}-${customer.phone || index}-${index}`}
                          className="p-4 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleCustomerSelect(customer)
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                              <User className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800">{customer.name}</div>
                              <div className="text-sm text-slate-500 flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {customer.phone}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div
                        className="p-4 hover:bg-indigo-50 cursor-pointer flex items-center gap-3 transition-colors"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleCreateNewCustomer()
                        }}
                      >
                        <div className="p-2 bg-green-100 rounded-lg">
                          <Plus className="h-4 w-4 text-green-600" />
                        </div>
                        <span className="font-medium text-slate-700">Create new customer: "{customerSearch}"</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Date & Time */}
            <div id="appointment-schedule-section" className="space-y-6">
              <div className="grid gap-6 pb-8 md:grid-cols-2">
                <FormField
                control={form.control}
                name="date"
                render={({ field }) => {
                  return (
                    <FormItem className="flex flex-col space-y-2">
                      <FormLabel className="text-sm font-semibold text-slate-700">Date *</FormLabel>
                      <Popover
                        open={isAppointmentFormReadOnly ? false : datePickerOpen}
                        onOpenChange={setDatePickerOpen}
                        modal
                      >
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              type="button"
                              disabled={isAppointmentFormReadOnly}
                              className={cn(
                                "h-12 w-full justify-start px-4 border-slate-200 hover:border-slate-400 focus-visible:ring-indigo-500 rounded-xl font-medium text-slate-700 bg-white shadow-sm transition-all duration-200",
                                !field.value && "text-slate-500"
                              )}
                            >
                              {field.value ? format(field.value, "PPP") : "Select a date"}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-60" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0 border border-slate-200 shadow-lg">
                          <div className="bg-white rounded-lg overflow-hidden">
                            <DayPicker
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => {
                                field.onChange(date)
                                if (date) {
                                  setDatePickerOpen(false)
                                }
                              }}
                              disabled={{ before: today }}
                              className="p-4"
                              classNames={{
                                months: "flex",
                                month: "space-y-8",
                                month_caption: "flex justify-center items-center mb-16 relative h-10 pt-4",
                                caption_label: "text-lg font-semibold text-slate-900 absolute left-1/2 -translate-x-1/2 z-10",
                                nav: "absolute inset-x-0 flex items-center justify-between px-1 top-4",
                                button_previous: "h-8 w-8 bg-transparent hover:bg-slate-100 rounded-md inline-flex items-center justify-center transition-colors disabled:opacity-50 z-20 absolute left-1",
                                button_next: "h-8 w-8 bg-transparent hover:bg-slate-100 rounded-md inline-flex items-center justify-center transition-colors disabled:opacity-50 z-20 absolute right-1",
                                month_grid: "w-full border-collapse mt-8",
                                weekdays: "flex mb-2",
                                weekday: "text-slate-500 font-medium text-xs uppercase w-10 text-center",
                                week: "flex w-full mt-1",
                                day: "relative p-0.5 text-center text-sm",
                                day_button: "h-9 w-9 rounded-md font-normal hover:bg-slate-100 transition-colors",
                                selected: "bg-indigo-600 text-white hover:bg-indigo-700 font-medium rounded-md [&>button]:bg-indigo-600 [&>button]:text-white [&>button]:hover:bg-indigo-700",
                                today: "font-semibold text-slate-900 border border-slate-300 rounded-md",
                                outside: "text-slate-300",
                                disabled: "text-slate-200 line-through cursor-not-allowed hover:bg-transparent",
                              }}
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )
                }}
                />
                <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem className="flex flex-col space-y-2">
                    <FormLabel className="text-sm font-semibold text-slate-700">Time *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined} disabled={isAppointmentFormReadOnly}>
                      <FormControl>
                        <SelectTrigger className="h-12 px-4 border-slate-200 hover:border-slate-400 focus:border-slate-500 focus:ring-slate-500 rounded-xl font-medium text-slate-700 bg-white shadow-sm transition-all duration-200">
                          <SelectValue placeholder="Select a time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl border-slate-200 shadow-lg">
                        {timeSlots.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
                />
              </div>
            </div>

            {/* Services Section */}
            <div id="appointment-services-section" className={cn("space-y-4", isDrawer ? "mt-6" : "mt-12")}>
              <div className="space-y-1">
                <div>
                  <h3 className={cn("font-semibold text-slate-800 flex items-center gap-2", isDrawer ? "text-base" : "text-lg")}>
                    <FileText className={cn("text-slate-600", isDrawer ? "h-4 w-4" : "h-5 w-5")} />
                    Services *
                  </h3>
                </div>
                {!isDrawer && <p className="text-sm text-slate-500">Add services and assign staff members for this appointment</p>}
              </div>

              {selectedServices.length > 0 ? (
                <div className="space-y-2">
                  {selectedServices.map((service) => {
                    const serviceIndex = selectedServices.indexOf(service)
                    const serviceStartM = getServiceStartMinutes(serviceIndex)
                    const serviceEndM = serviceStartM + (service.duration || 0)
                    const formatMinutesAs12h = (m: number) => {
                      const h24 = Math.floor(m / 60) % 24
                      const min = m % 60
                      const period = h24 >= 12 ? "PM" : "AM"
                      const h12 = h24 % 12 === 0 ? 12 : h24 % 12
                      return `${h12}:${String(min).padStart(2, "0")} ${period}`
                    }
                    return (
                    <div key={service.id} className="flex flex-col gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-500 w-6 shrink-0">{serviceIndex + 1}.</span>
                        <div className="relative service-dropdown-container flex-1 min-w-0">
                          {service.serviceId && service.name ? (
                            <div className="flex items-center justify-between h-9 px-2.5 py-1.5 bg-white rounded-md text-sm border border-slate-200 min-w-0">
                              <span className="truncate">{service.name}</span>
                              {!isAppointmentFormReadOnly ? (
                              <button
                                type="button"
                                onClick={() => {
                                  updateService(service.id, "serviceId", "")
                                  updateService(service.id, "name", "")
                                  updateDropdownState(service.id, { search: '', isOpen: false })
                                }}
                                className="ml-1.5 shrink-0 text-slate-400 hover:text-slate-600"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                              ) : null}
                            </div>
                          ) : (
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                              <Input
                                placeholder="Search service..."
                                value={getDropdownState(service.id).search}
                                disabled={isAppointmentFormReadOnly}
                                onChange={(e) => updateDropdownState(service.id, { search: e.target.value, isOpen: true })}
                                onFocus={() => updateDropdownState(service.id, { isOpen: true })}
                                className="h-9 pl-8 pr-8 text-sm border-slate-200 rounded-md"
                              />
                              {getDropdownState(service.id).search && !isAppointmentFormReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => updateDropdownState(service.id, { search: '', isOpen: false })}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                          {getDropdownState(service.id).isOpen && !service.serviceId && !isAppointmentFormReadOnly && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                              {loadingServices ? (
                                <div className="p-2 text-center text-xs text-slate-500">Loading...</div>
                              ) : getFilteredServices(service.id).length === 0 ? (
                                <div className="p-2 text-center text-xs text-slate-500">No matches</div>
                              ) : (
                                getFilteredServices(service.id).map((s) => (
                                  <div
                                    key={s._id || s.id}
                                    className="px-2.5 py-2 hover:bg-slate-50 cursor-pointer border-b last:border-b-0 text-sm"
                                    onClick={() => {
                                      updateService(service.id, "serviceId", s._id || s.id)
                                      updateDropdownState(service.id, { search: '', isOpen: false })
                                    }}
                                  >
                                    <div className="font-medium text-slate-800">{s.name}</div>
                                    <div className="text-xs text-slate-500">{s.duration} min · ₹{s.price}</div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        <Select
                          value={service.staffId}
                          onValueChange={(value) => updateService(service.id, "staffId", value)}
                          disabled={isAppointmentFormReadOnly}
                        >
                          <SelectTrigger className="h-9 w-[130px] shrink-0 border-slate-200 rounded-md text-sm">
                            <SelectValue placeholder="Staff" />
                          </SelectTrigger>
                          <SelectContent>
                            {loadingStaff ? (
                              <SelectItem value="__loading__" disabled>Loading...</SelectItem>
                            ) : staff.length === 0 ? (
                              <SelectItem value="no-staff" disabled>No staff</SelectItem>
                            ) : (
                              (() => {
                                const availableForRow = getAvailableStaffForService(serviceIndex).filter(
                                  (member: any) => member._id || member.id
                                )
                                const availableIds = new Set(
                                  availableForRow.map((m: any) => String(m._id || m.id))
                                )
                                const allStaff = staff.filter((member: any) => member._id || member.id)
                                const sorted = [...allStaff].sort((a: any, b: any) => {
                                  const aId = String(a._id || a.id)
                                  const bId = String(b._id || b.id)
                                  const aAvail = availableIds.has(aId)
                                  const bAvail = availableIds.has(bId)
                                  if (aAvail !== bAvail) return aAvail ? -1 : 1
                                  return (a.name || "").localeCompare(b.name || "", undefined, {
                                    sensitivity: "base",
                                  })
                                })
                                return sorted.map((member: any) => {
                                  const staffId = member._id || member.id
                                  const isUnavailable = !availableIds.has(String(staffId))
                                  return (
                                    <SelectItem key={staffId} value={staffId}>
                                      {member.name}
                                      {isUnavailable ? " (Not available)" : ""}
                                    </SelectItem>
                                  )
                                })
                              })()
                            )}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant={service.staffLocked ? "secondary" : "ghost"}
                          size="sm"
                          className={cn(
                            "h-9 w-9 shrink-0 p-0 border border-transparent",
                            service.staffLocked
                              ? "text-red-600 bg-red-50 border-red-200 hover:bg-red-100"
                              : "text-slate-400 hover:text-red-500 hover:bg-red-50/80 border-slate-200"
                          )}
                          disabled={isAppointmentFormReadOnly || !service.staffId}
                          title={
                            service.staffLocked
                              ? "Client requested this stylist — staff locked"
                              : service.staffId
                                ? "Mark: client requests this stylist only"
                                : "Select a stylist first"
                          }
                          aria-pressed={!!service.staffLocked}
                          onClick={() =>
                            !isAppointmentFormReadOnly &&
                            service.staffId &&
                            updateService(service.id, "staffLocked", !service.staffLocked)
                          }
                        >
                          {service.staffLocked ? (
                            <Heart className="h-4 w-4 fill-current" aria-hidden />
                          ) : (
                            <Heart className="h-4 w-4" aria-hidden />
                          )}
                        </Button>
                        {selectedServices.length >= 2 && (() => {
                          // Show the effective start time as the picker's value so all rows look populated.
                          // Row 0 reflects the appointment time picked above; later rows chain from it.
                          const computedStart = minutesToTimeString(serviceStartM)
                          const matchedSlot = timeSlots.find((t) => parseTimeToMinutes(t) === serviceStartM)
                          const displayValue = service.startTime || (formTime ? (matchedSlot ?? computedStart) : undefined)
                          const startTimeSelectOptions =
                            displayValue && !timeSlots.includes(displayValue)
                              ? [...timeSlots, displayValue].sort(
                                  (a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b)
                                )
                              : timeSlots
                          return (
                            <Select
                              value={displayValue}
                              disabled={isAppointmentFormReadOnly}
                              onValueChange={(value) => updateService(service.id, "startTime", value)}
                            >
                              <SelectTrigger
                                className="h-9 w-[110px] shrink-0 border-slate-200 rounded-md text-sm bg-white tabular-nums"
                                title={
                                  service.duration
                                    ? `Starts ${formatMinutesAs12h(serviceStartM)} · Ends ${formatMinutesAs12h(serviceEndM)} · ${service.duration} min`
                                    : serviceIndex === 0
                                      ? "Defaults to the appointment time above"
                                      : "Defaults to right after the previous service"
                                }
                              >
                                <SelectValue placeholder="Start" />
                              </SelectTrigger>
                              <SelectContent className="max-h-60">
                                {startTimeSelectOptions.map((time) => (
                                  <SelectItem key={time} value={time} className="text-xs tabular-nums">
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )
                        })()}
                        {!isAppointmentFormReadOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeService(service.id)}
                          className="h-9 w-9 p-0 shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        ) : (
                          <span className="h-9 w-9 shrink-0" aria-hidden />
                        )}
                      </div>
                    </div>
                  )})}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addService}
                    disabled={isAppointmentFormReadOnly}
                    className={cn(
                      "w-full rounded-full border-2 border-dashed font-medium text-slate-600 transition-colors",
                      "border-slate-200 bg-white/90 hover:bg-violet-50 hover:text-violet-800 hover:border-violet-300/80",
                      isDrawer ? "h-9 text-sm px-4 mt-1" : "h-11 text-sm px-5 mt-1"
                    )}
                  >
                    <Plus className={cn("mr-2 shrink-0", isDrawer ? "h-3.5 w-3.5" : "h-4 w-4")} />
                    Add Service
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                <div className={cn("text-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50", isDrawer ? "p-4" : "p-8")}>
                  <FileText className={cn("text-slate-300 mx-auto", isDrawer ? "h-8 w-8 mb-2" : "h-12 w-12 mb-4")} />
                  <p className="text-slate-500 text-sm">No services added yet</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addService}
                  disabled={isAppointmentFormReadOnly}
                  className={cn(
                    "w-full rounded-full border-2 border-dashed font-medium text-slate-600 transition-colors",
                    "border-slate-200 bg-white/90 hover:bg-violet-50 hover:text-violet-800 hover:border-violet-300/80",
                    isDrawer ? "h-9 text-sm px-4" : "h-11 text-sm px-5"
                  )}
                >
                  <Plus className={cn("mr-2 shrink-0", isDrawer ? "h-3.5 w-3.5" : "h-4 w-4")} />
                  Add Service
                </Button>
                </div>
              )}

              {/* Timeline preview (visible whenever there are 2+ services) */}
              {selectedServices.length >= 2 && (
                <details className="rounded-lg border border-slate-200 bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 select-none">
                    Timeline preview ({selectedServices.length} services)
                  </summary>
                  <div className="px-3 pb-3 pt-1 space-y-1.5">
                    {[...selectedServices]
                      .map((s, idx) => ({ ...s, _idx: idx, _startM: getServiceStartMinutes(idx) }))
                      .sort((a, b) => a._startM - b._startM)
                      .map((s) => {
                        const startM = s._startM
                        const endM = startM + (s.duration || 0)
                        const fmt = (m: number) => {
                          const h24 = Math.floor(m / 60) % 24
                          const min = m % 60
                          const period = h24 >= 12 ? "PM" : "AM"
                          const h12 = h24 % 12 === 0 ? 12 : h24 % 12
                          return `${h12}:${String(min).padStart(2, "0")} ${period}`
                        }
                        const staffMember = staff.find((st: any) => (st._id || st.id) === s.staffId)
                        const staffLabel = staffMember?.name || (s.staffId ? "Selected staff" : "Unassigned")
                        const serviceLabel = s.name || "Untitled service"
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between gap-3 text-xs rounded-md bg-slate-50 px-2.5 py-1.5"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-slate-800 truncate">{serviceLabel}</div>
                              <div className="text-slate-500 truncate">
                                {staffLabel}
                                {!s.startTime && s._idx >= 1 ? (
                                  <span className="ml-1 text-slate-400">· auto</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="text-slate-700 tabular-nums shrink-0">
                              {fmt(startM)} <span className="text-slate-400">–</span> {fmt(endM)}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </details>
              )}
              {(formNotes || "").trim() ? (
                <div
                  role={isAppointmentFormReadOnly ? undefined : "button"}
                  tabIndex={isAppointmentFormReadOnly ? undefined : 0}
                  className={cn(
                    "mt-3 rounded-lg border border-amber-200/90 bg-amber-50/60 px-3 py-2.5 sm:px-4 sm:py-3",
                    isAppointmentFormReadOnly
                      ? "cursor-default"
                      : "cursor-pointer hover:bg-amber-50/95 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                  )}
                  onClick={
                    isAppointmentFormReadOnly
                      ? undefined
                      : () => {
                          setNoteDialogMode("edit")
                          setAddNoteDraft((formNotes || "").trim())
                          setAddNoteDialogOpen(true)
                        }
                  }
                  onKeyDown={
                    isAppointmentFormReadOnly
                      ? undefined
                      : (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setNoteDialogMode("edit")
                            setAddNoteDraft((formNotes || "").trim())
                            setAddNoteDialogOpen(true)
                          }
                        }
                  }
                >
                  <p className="text-sm text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                    {(formNotes || "").trim()}
                  </p>
                </div>
              ) : null}
            </div>



          </form>
        </Form>
        )}
    </>
  )

  const checkoutServiceFooterButton =
    isEditMode && editAppearanceStatus === "partial_payment" ? (
      <Button
        variant="outline"
        type="button"
        disabled={isSubmitting || loadingAppointment || !selectedCustomer || openingPayRemaining}
        onClick={() => void openPayRemainingFromLinkedSale()}
        className={cn(
          "font-medium min-w-[140px]",
          isDrawer ? "rounded-lg border-amber-300 text-amber-800 hover:bg-amber-50" : "px-8 py-3 border-amber-300 text-amber-800 hover:bg-amber-50 rounded-xl"
        )}
      >
        <Banknote className="h-4 w-4 mr-2" />
        Pay Now
      </Button>
    ) : isEditMode && editAppearanceStatus === "completed" ? (
      <Button
        variant="outline"
        type="button"
        disabled={loadingAppointment || invoicePreviewLoading || !hasLinkedInvoice}
        title={!hasLinkedInvoice ? "Invoice is not available for this appointment yet." : undefined}
        onClick={() => void openLinkedInvoicePreview()}
        className={cn(
          "font-medium min-w-[140px]",
          isDrawer
            ? "rounded-lg border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            : "px-8 py-3 border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-xl"
        )}
      >
        {invoicePreviewLoading ? (
          <Loader2 className="h-4 w-4 mr-2 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Eye className="h-4 w-4 mr-2 shrink-0" aria-hidden />
        )}
        View Invoice
      </Button>
    ) : (
      <Button
        variant="outline"
        type="button"
        disabled={isSubmitting || loadingAppointment || selectedServices.length === 0 || !selectedCustomer}
        onClick={() => setServiceCheckoutOpen(true)}
        className={cn(
          "font-medium min-w-[140px]",
          isDrawer ? "rounded-lg border-violet-300 text-violet-700 hover:bg-violet-50" : "px-8 py-3 border-violet-300 text-violet-700 hover:bg-violet-50 rounded-xl"
        )}
      >
        <ShoppingCart className="h-4 w-4 mr-2" />
        Checkout Service
      </Button>
    )

  const scheduleOrUpdateFooterButton = (
    <Button
      type="submit"
      form="appointmentForm"
      disabled={
        isSubmitting ||
        loadingAppointment ||
        selectedServices.length === 0 ||
        !selectedCustomer ||
        isAppointmentFormReadOnly
      }
      className={cn(
        "font-semibold disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]",
        isDrawer ? "rounded-lg bg-violet-600 hover:bg-violet-700 text-white" : "px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl"
      )}
    >
      {isSubmitting ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {isEditMode ? "Updating..." : "Scheduling..."}
        </>
      ) : (
        <>
          <CalendarDays className="h-4 w-4 mr-2" />
          {isEditMode ? "Update Appointment" : "Schedule Appointment"}
        </>
      )}
    </Button>
  )

  const footerButtons = (
    <div
      className={cn(
        "flex justify-end items-center gap-3 w-full flex-nowrap",
        isDrawer ? "pt-4 border-t border-border/60" : ""
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="More appointment actions"
            title="More options"
            disabled={loadingAppointment || (isEditMode && (isTerminalAppointmentStatus || isPartialPaymentEditReadOnly))}
            className="shrink-0 h-10 w-10 rounded-full border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="w-[min(20rem,calc(100vw-2rem))] z-[200] rounded-lg border-slate-200 p-1 shadow-lg"
        >
          <DropdownMenuItem
            disabled={loadingAppointment || isAppointmentFormReadOnly}
            className="gap-2 cursor-pointer"
            onSelect={() => {
              setNoteDialogMode("add")
              setAddNoteDraft("")
              setAddNoteDialogOpen(true)
            }}
          >
            <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
            Add a note
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 cursor-pointer"
            onSelect={() =>
              toast({
                title: "Add a form",
                description: "Client intake forms will be available in a future update.",
              })
            }
          >
            <FilePlus className="h-4 w-4 shrink-0" aria-hidden />
            Add a form
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          {isEditMode ? (
            <>
              <DropdownMenuItem
                disabled={loadingAppointment}
                className="gap-2 cursor-pointer"
                onSelect={() => void openActivityDialog()}
              >
                <History className="h-4 w-4 shrink-0" aria-hidden />
                View appointment activity
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={loadingAppointment || isAppointmentFormReadOnly}
                className="gap-2 cursor-pointer"
                onSelect={openRepeatingDialog}
              >
                <Repeat className="h-4 w-4 shrink-0" aria-hidden />
                Set as repeating
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />
            </>
          ) : null}
          <DropdownMenuItem
            disabled={loadingAppointment || isTerminalAppointmentStatus || isPartialPaymentEditReadOnly}
            className="gap-2 cursor-pointer"
            onSelect={openRebookDialog}
          >
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            Rebook
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem
            disabled={loadingAppointment || isTerminalAppointmentStatus || isPartialPaymentEditReadOnly}
            className="gap-2 cursor-pointer"
            onSelect={() => scrollToFormSection("appointment-schedule-section")}
          >
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
            Reschedule
          </DropdownMenuItem>
          {isEditMode ? (
            <>
              <DropdownMenuItem
                disabled={loadingAppointment || isTerminalAppointmentStatus || isPartialPaymentEditReadOnly}
                className="gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                onSelect={() => setNoShowDialogOpen(true)}
              >
                <UserX className="h-4 w-4 shrink-0" aria-hidden />
                No-show
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={loadingAppointment || isTerminalAppointmentStatus || isPartialPaymentEditReadOnly}
                className="gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                onSelect={() => setCancelApptDialogOpen(true)}
              >
                <X className="h-4 w-4 shrink-0" aria-hidden />
                Cancel
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {isEditMode && isEditAppointmentDirty ? (
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            revertEditAppointmentToBaseline()
          }}
          className={cn(
            "font-medium min-w-[100px]",
            isDrawer ? "rounded-lg" : "px-8 py-3 border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl"
          )}
        >
          Cancel
        </Button>
      ) : null}
      {isEditMode ? (
        isEditAppointmentDirty ? (
          scheduleOrUpdateFooterButton
        ) : (
          checkoutServiceFooterButton
        )
      ) : (
        <>
          {checkoutServiceFooterButton}
          {scheduleOrUpdateFooterButton}
        </>
      )}
    </div>
  )

  return (
    <>
      {isDrawer ? (
        <div className="relative flex flex-col min-h-0 flex-1">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
            {formContent}
          </div>
          <div className="shrink-0">
            {selectedServices.length > 0 && (
              <div className="flex items-center justify-between gap-4 py-3 text-sm border-b border-border/60">
                <span className="text-slate-600">Total Duration: <span className="font-medium text-slate-800">{calculateTotalDuration()} min</span></span>
                <span className="text-slate-600">Total Amount: <span className="font-semibold text-slate-800">₹{calculateTotalAmount()}</span></span>
              </div>
            )}
            {footerButtons}
          </div>
          <ServiceCheckoutDialog
            variant="drawer"
            open={serviceCheckoutOpen}
            onOpenChange={setServiceCheckoutOpen}
            customer={selectedCustomer}
            staff={staff}
            catalogServices={services}
            initialLines={checkoutInitialLines}
            appointmentDate={formDate}
            appointmentTime={formTime || ""}
            notes={formNotes || ""}
            isEditMode={isEditMode}
            appointmentId={appointmentId}
            existingGroupAppointmentIds={existingGroupAppointmentIds}
            existingBookingGroupId={existingBookingGroupId}
            consumeResumeDraftIntent={consumeResumeDraftIntent}
            resumeSavedDraftToken={resumeSavedDraftToken ?? null}
            onCustomerChange={handleCheckoutCustomerChange}
            ensureAppointmentBookingBeforeCheckout={
              isEditMode ? undefined : ensureAppointmentBookingBeforeCheckout
            }
            onSuccessfulCheckout={onSuccess}
          />
        </div>
      ) : (
        <div className="w-full max-w-full">
          <Card className="shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-lg">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <CalendarDays className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold">{isEditMode ? "Edit Appointment" : "New Appointment"}</CardTitle>
                  <CardDescription className="text-indigo-100 mt-1">
                    {isEditMode ? "Update appointment details" : "Schedule a new appointment with multiple services"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              {formContent}
            </CardContent>
            <CardFooter className="bg-slate-50/50 px-8 py-8 border-t border-slate-200/50">
              {footerButtons}
            </CardFooter>
          </Card>
        </div>
      )}

      {/* New Client Dialog */}
      <Dialog open={showNewClientDialog} onOpenChange={setShowNewClientDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
            <DialogDescription>Add a new client to your salon database.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={newClient.firstName}
                  onChange={(e) => setNewClient({ ...newClient, firstName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={newClient.lastName}
                  onChange={(e) => setNewClient({ ...newClient, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="Enter 10-digit phone number"
                maxLength={10}
                value={newClient.phone}
                onChange={(e) => {
                  // Only allow digits and limit to 10
                  const value = e.target.value.replace(/\D/g, '').slice(0, 10)
                  setNewClient({ ...newClient, phone: value })
                }}
                className={newClient.phone && newClient.phone.length !== 10 ? "border-red-500 focus:border-red-500" : ""}
              />
              {newClient.phone && newClient.phone.length > 0 && newClient.phone.length !== 10 && (
                <p className="text-sm text-red-500">Phone number must be exactly 10 digits. Current: {newClient.phone.length} digits</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newClient.email}
                onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClientDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNewCustomer}>
              Create Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentCollectionModal
        isOpen={payRemainingSheetOpen}
        presentation="sheet"
        onClose={closePayRemainingSheet}
        sale={payRemainingSaleForCollection}
        onPaymentCollected={handlePayRemainingCollected}
        exitAfterPaymentSuccess={variant === "drawer"}
      />

      <Dialog
        open={invoicePreviewOpen}
        onOpenChange={(next) => {
          if (!next) {
            setInvoicePreviewOpen(false)
            setInvoicePreviewReceipt(null)
            setInvoicePreviewSettings(null)
          }
        }}
      >
        <DialogContent
          overlayClassName="z-[120]"
          className="z-[120] flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>
              {invoicePreviewReceipt ? `Invoice #${invoicePreviewReceipt.receiptNumber}` : "Invoice preview"}
            </DialogTitle>
            <DialogDescription className="sr-only">Preview of the invoice linked to this appointment</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
            {invoicePreviewLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
                Loading invoice…
              </div>
            ) : invoicePreviewReceipt ? (
              <ReceiptPreview receipt={invoicePreviewReceipt} businessSettings={invoicePreviewSettings} />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {isDrawer ? null : (
        <ServiceCheckoutDialog
          variant="dialog"
          open={serviceCheckoutOpen}
          onOpenChange={setServiceCheckoutOpen}
          customer={selectedCustomer}
          staff={staff}
          catalogServices={services}
          initialLines={checkoutInitialLines}
          appointmentDate={formDate}
          appointmentTime={formTime || ""}
          notes={formNotes || ""}
          isEditMode={isEditMode}
          appointmentId={appointmentId}
          existingGroupAppointmentIds={existingGroupAppointmentIds}
          existingBookingGroupId={existingBookingGroupId}
          consumeResumeDraftIntent={consumeResumeDraftIntent}
          resumeSavedDraftToken={resumeSavedDraftToken ?? null}
          onCustomerChange={handleCheckoutCustomerChange}
          ensureAppointmentBookingBeforeCheckout={
            isEditMode ? undefined : ensureAppointmentBookingBeforeCheckout
          }
        />
      )}

      <Dialog
        open={addNoteDialogOpen}
        onOpenChange={(open) => {
          if (!open && addNoteSaving) return
          setAddNoteDialogOpen(open)
          if (!open) {
            setNoteDialogMode("add")
            setAddNoteDraft("")
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[min(90vh,520px)] overflow-y-auto">
          <button
            type="button"
            className="absolute right-4 top-4 rounded-sm p-1 text-slate-500 opacity-70 ring-offset-background transition-opacity hover:opacity-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none z-10"
            disabled={addNoteSaving}
            onClick={() => setAddNoteDialogOpen(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <DialogHeader className="pr-10 sm:pr-12">
            <DialogTitle>{noteDialogMode === "add" ? "Add a note" : "Edit note"}</DialogTitle>
            <DialogDescription>
              {noteDialogMode === "add"
                ? "Your text is appended to this booking's notes and saved for all linked services (or on this draft until you schedule)."
                : "Update or remove notes for all linked services in this booking (or this draft appointment)."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={addNoteDraft}
            onChange={(e) => setAddNoteDraft(e.target.value)}
            placeholder="Type your note…"
            rows={6}
            className="resize-none border-slate-200 rounded-xl"
          />
          <DialogFooter
            className={cn(
              "flex-col gap-2 sm:flex-row sm:items-center sm:justify-end",
              noteDialogMode === "edit" && "sm:justify-between"
            )}
          >
            {noteDialogMode === "edit" ? (
              <Button
                type="button"
                variant="outline"
                disabled={addNoteSaving}
                className="w-full sm:w-auto text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 sm:mr-auto"
                onClick={() => void deleteNotesFromBooking()}
              >
                Delete
              </Button>
            ) : null}
            <div className={cn("flex w-full flex-col-reverse gap-2 sm:flex-row sm:w-auto sm:justify-end")}>
              {noteDialogMode === "edit" ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={addNoteSaving}
                  onClick={() => setAddNoteDialogOpen(false)}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={addNoteSaving}
                onClick={() => void submitNoteDialog()}
                className="w-full sm:w-auto"
              >
                {addNoteSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : noteDialogMode === "edit" ? (
                  "Update"
                ) : (
                  "Save note"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={repeatingDialogOpen}
        onOpenChange={(open) => !recurrenceSaving && setRepeatingDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-md max-h-[min(90vh,640px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set as repeating</DialogTitle>
            <DialogDescription>
              Choose how often this appointment repeats and when it should end. Applies to every row in this booking
              group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={recurrenceForm.frequency}
                onValueChange={(v) =>
                  setRecurrenceForm((f) => ({ ...f, frequency: v as RecurrenceFrequency }))
                }
              >
                <SelectTrigger className="border-slate-200 rounded-xl">
                  <SelectValue placeholder="Choose frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doesnt">Doesn&apos;t repeat</SelectItem>
                  <SelectItem value="repeat">Repeat</SelectItem>
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="weekly">Every week</SelectItem>
                  <SelectItem value="monthly">Every month</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recurrenceForm.frequency === "custom" ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-2 min-w-[5rem] flex-1">
                  <Label htmlFor="rec-custom-interval">Every</Label>
                  <Input
                    id="rec-custom-interval"
                    type="number"
                    min={1}
                    value={recurrenceForm.customInterval}
                    onChange={(e) =>
                      setRecurrenceForm((f) => ({
                        ...f,
                        customInterval: Math.max(1, parseInt(e.target.value, 10) || 1),
                      }))
                    }
                    className="border-slate-200 rounded-xl"
                  />
                </div>
                <div className="space-y-2 w-full sm:w-40">
                  <Label className="opacity-0 sm:block sm:h-5">Unit</Label>
                  <Select
                    value={recurrenceForm.customUnit}
                    onValueChange={(v) =>
                      setRecurrenceForm((f) => ({ ...f, customUnit: v as "day" | "week" | "month" }))
                    }
                  >
                    <SelectTrigger className="border-slate-200 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Day(s)</SelectItem>
                      <SelectItem value="week">Week(s)</SelectItem>
                      <SelectItem value="month">Month(s)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {recurrenceForm.frequency !== "doesnt" ? (
              <div className="space-y-2">
                <Label>Ends</Label>
                <RadioGroup
                  value={recurrenceForm.endType}
                  onValueChange={(v) =>
                    setRecurrenceForm((f) => ({ ...f, endType: v as "never" | "count" | "date" }))
                  }
                  className="grid gap-3"
                >
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-100 px-2 py-2">
                    <RadioGroupItem value="never" id="rec-end-never" />
                    <Label htmlFor="rec-end-never" className="font-normal cursor-pointer flex-1">
                      Never
                    </Label>
                  </div>
                  <div className="flex flex-col gap-2 rounded-lg border border-slate-100 px-2 py-2 sm:flex-row sm:items-center">
                    <div className="flex items-center space-x-2 shrink-0">
                      <RadioGroupItem value="count" id="rec-end-count" />
                      <Label htmlFor="rec-end-count" className="font-normal cursor-pointer whitespace-nowrap">
                        After
                      </Label>
                    </div>
                    <div className="flex items-center gap-2 flex-1 flex-wrap pl-6 sm:pl-0">
                      <Input
                        type="number"
                        min={1}
                        disabled={recurrenceForm.endType !== "count"}
                        value={recurrenceForm.endAfterCount}
                        onChange={(e) =>
                          setRecurrenceForm((f) => ({
                            ...f,
                            endAfterCount: Math.max(1, parseInt(e.target.value, 10) || 1),
                            endType: "count",
                          }))
                        }
                        onFocus={() => setRecurrenceForm((f) => ({ ...f, endType: "count" }))}
                        className="h-9 w-20 border-slate-200 rounded-lg"
                      />
                      <span className="text-sm text-slate-600">times</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 rounded-lg border border-slate-100 px-2 py-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="date" id="rec-end-date" />
                      <Label htmlFor="rec-end-date" className="font-normal cursor-pointer">
                        Specific date
                      </Label>
                    </div>
                    {recurrenceForm.endType === "date" ? (
                      <div className="pl-6">
                        <Popover open={recurrenceEndDatePickerOpen} onOpenChange={setRecurrenceEndDatePickerOpen} modal>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-start border-slate-200 rounded-xl font-normal"
                              onClick={() => setRecurrenceForm((f) => ({ ...f, endType: "date" }))}
                            >
                              {recurrenceForm.endOnDate
                                ? format(recurrenceForm.endOnDate, "PPP")
                                : "Pick end date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <DayPicker
                              mode="single"
                              selected={recurrenceForm.endOnDate ?? undefined}
                              onSelect={(d) => {
                                if (d) {
                                  setRecurrenceForm((f) => ({ ...f, endOnDate: startOfDay(d) }))
                                  setRecurrenceEndDatePickerOpen(false)
                                }
                              }}
                              disabled={{ before: today }}
                              className="p-3"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    ) : null}
                  </div>
                </RadioGroup>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={recurrenceSaving} onClick={() => setRepeatingDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={recurrenceSaving} onClick={() => void saveRecurrence()}>
              {recurrenceSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rebookDialogOpen} onOpenChange={setRebookDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rebook</DialogTitle>
            <DialogDescription>Select a time to book. You&apos;ll open the new appointment flow with the same client.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover open={rebookDatePickerOpen} onOpenChange={setRebookDatePickerOpen} modal>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start border-slate-200 rounded-xl font-medium text-slate-700"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
                    {format(rebookDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border border-slate-200 shadow-lg" align="start">
                  <DayPicker
                    mode="single"
                    selected={rebookDate}
                    onSelect={(d) => {
                      if (d) {
                        setRebookDate(startOfDay(d))
                        setRebookDatePickerOpen(false)
                      }
                    }}
                    disabled={{ before: today }}
                    className="p-4"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Select value={rebookTime || undefined} onValueChange={setRebookTime}>
                <SelectTrigger className="h-12 border-slate-200 rounded-xl">
                  <SelectValue placeholder="Select a time" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto rounded-xl">
                  {timeSlots.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRebookDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmRebook} disabled={!rebookTime}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activityDialogOpen}
        onOpenChange={(open) => {
          setActivityDialogOpen(open)
          if (!open) setActivityDetail(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Appointment activity</DialogTitle>
            <DialogDescription className="text-slate-600">
              Summary for this booking{existingBookingGroupId ? " (primary row)" : ""}.
            </DialogDescription>
          </DialogHeader>
          {activityLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
              Loading…
            </div>
          ) : activityDetail ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-2">
                <span className="text-slate-500">Status</span>
                <span className="font-medium text-slate-900 capitalize">{String(activityDetail.status || "—").replace(/_/g, " ")}</span>
                <span className="text-slate-500">Date</span>
                <span className="font-medium text-slate-900">{activityDetail.date || "—"}</span>
                <span className="text-slate-500">Time</span>
                <span className="font-medium text-slate-900">{activityDetail.time || "—"}</span>
                {activityDetail.bookingGroupId ? (
                  <>
                    <span className="text-slate-500">Group</span>
                    <span className="font-mono text-xs text-slate-800 break-all">{String(activityDetail.bookingGroupId)}</span>
                  </>
                ) : null}
                <span className="text-slate-500">Created</span>
                <span className="text-slate-800">
                  {activityDetail.createdAt
                    ? format(new Date(activityDetail.createdAt), "dd MMM yyyy, HH:mm")
                    : "—"}
                </span>
                <span className="text-slate-500">Last updated</span>
                <span className="text-slate-800">
                  {activityDetail.updatedAt
                    ? format(new Date(activityDetail.updatedAt), "dd MMM yyyy, HH:mm")
                    : "—"}
                </span>
                {activityDetail.createdBy ? (
                  <>
                    <span className="text-slate-500">Created by</span>
                    <span className="text-slate-800">{String(activityDetail.createdBy)}</span>
                  </>
                ) : null}
              </div>
              {(activityDetail.notes || "").trim() ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note</div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-800">{String(activityDetail.notes).trim()}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-600 py-4">No details loaded.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActivityDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelApptDialogOpen} onOpenChange={(o) => !statusActionLoading && setCancelApptDialogOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this appointment?</DialogTitle>
            <DialogDescription className="text-slate-600">
              {appointmentIdsForGroupActions.length > 1
                ? `This will cancel all ${appointmentIdsForGroupActions.length} linked services in this booking.`
                : "This will mark the appointment as cancelled."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={statusActionLoading}
              onClick={() => setCancelApptDialogOpen(false)}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={statusActionLoading}
              onClick={() => void confirmCancelAppointmentAction()}
            >
              {statusActionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling…
                </>
              ) : (
                "Confirm cancel"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noShowDialogOpen} onOpenChange={(o) => !statusActionLoading && setNoShowDialogOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as no-show?</DialogTitle>
            <DialogDescription className="text-slate-600">
              {appointmentIdsForGroupActions.length > 1
                ? `All ${appointmentIdsForGroupActions.length} linked services will be marked as no-show.`
                : "This appointment will be marked as missed (no-show)."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={statusActionLoading}
              onClick={() => setNoShowDialogOpen(false)}
            >
              Back
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700"
              disabled={statusActionLoading}
              onClick={() => void confirmNoShowAction()}
            >
              {statusActionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating…
                </>
              ) : (
                "Confirm no-show"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
