"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Check, Plus, Trash2, Search, User, Phone, X, CalendarDays, FileText, Loader2, Receipt, Calendar as CalendarIcon } from "lucide-react"
import { format, isBefore, startOfDay } from "date-fns"
import { DayPicker } from "react-day-picker"

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
import { ServicesAPI, StaffAPI, AppointmentsAPI, UsersAPI, StaffDirectoryAPI, BlockTimeAPI } from "@/lib/api"

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

/** Check if a block applies on a given date (recurring logic) */
function blockAppliesOnDate(block: { startDate: string; endDate?: string | null; recurringFrequency?: string }, dateStr: string): boolean {
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

// Time slots for appointments (15-min intervals, 24-hour format)
const timeSlots = (() => {
  const slots: string[] = []
  for (let h = 0; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
    }
  }
  return slots
})()

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
  /** "drawer" = compact layout for right-side drawer; "page" = full card layout for standalone page */
  variant?: "page" | "drawer"
}

export function AppointmentForm({ initialDate, initialTime, initialStaffId, appointmentId: appointmentIdProp, onClientSelect, onSuccess, onCancel, variant = "page" }: AppointmentFormProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appointmentId = appointmentIdProp ?? searchParams?.get("edit") ?? undefined
  const isEditMode = !!appointmentId
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingAppointment, setLoadingAppointment] = useState(false)
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [existingBookingGroupId, setExistingBookingGroupId] = useState<string | null>(null)
  const [existingGroupAppointmentIds, setExistingGroupAppointmentIds] = useState<string[]>([])

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
  const [blockTimesForDate, setBlockTimesForDate] = useState<any[]>([])
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

  // Fetch block times and appointments when date is set (for availability filtering)
  useEffect(() => {
    if (!formDate) {
      setBlockTimesForDate([])
      setAppointmentsForDate([])
      return
    }
    const dateStr = format(formDate, "yyyy-MM-dd")
    BlockTimeAPI.getAll({ startDate: dateStr, endDate: dateStr })
      .then((res) => {
        if (res?.success && Array.isArray(res?.data)) setBlockTimesForDate(res.data)
        else setBlockTimesForDate([])
      })
      .catch(() => setBlockTimesForDate([]))
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
    return Math.max(sum || 60, 15)
  }, [selectedServices])

  /**
   * Get staff available for a specific service's time block only.
   * Services are sequential: Service 0 = formTime to formTime+dur0, Service 1 = formTime+dur0 to formTime+dur0+dur1, etc.
   * Availability is checked per service time block - NOT against full appointment duration.
   * Excludes: current appointment when editing (so editing one service doesn't invalidate others).
   */
  const getAvailableStaffForService = useCallback((serviceIndex: number) => {
    if (!formDate || !formTime) return staff
    const dateStr = format(formDate, "yyyy-MM-dd")
    const dayIndex = formDate.getDay()

    // Compute this service's start and end (sequential)
    let serviceStartM = parseTimeToMinutes(formTime)
    for (let i = 0; i < serviceIndex; i++) {
      serviceStartM += selectedServices[i]?.duration ?? 60
    }
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

      const isBlocked = blockTimesForDate.some((block: any) => {
        const blockStaffId = typeof block.staffId === "object" && block.staffId?._id ? block.staffId._id : String(block.staffId)
        if (blockStaffId !== staffId) return false
        if (!blockAppliesOnDate(block, dateStr)) return false
        const blockStartM = parseTimeToMinutes(block.startTime)
        const blockEndM = parseTimeToMinutes(block.endTime)
        return serviceStartM < blockEndM && serviceEndM > blockStartM
      })
      if (isBlocked) return false

      // Only check conflicts for THIS service's time block; exclude all appointments we're editing (main + related)
      const idsBeingEdited = new Set<string>()
      if (appointmentId) idsBeingEdited.add(String(appointmentId))
      selectedServices.forEach((s) => {
        if (s.id.startsWith("related-")) idsBeingEdited.add(s.id.replace("related-", ""))
      })
      const hasOverlappingAppointment = appointmentsForDate.some((apt: any) => {
        if (apt.status === "cancelled") return false
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
  }, [staff, formDate, formTime, selectedServices, blockTimesForDate, appointmentsForDate, appointmentId])

  // Load services and staff on component mount
  useEffect(() => {
    fetchServices()
    fetchStaff()
  }, [])

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
        let servicesToShow: Array<{ id: string; serviceId: string; staffId: string; name: string; duration: number; price: number }> = []
        const related = (res as any).relatedAppointments as any[] | undefined

        const nonCancelledRelated = (related ?? []).filter((r: any) => r.status !== "cancelled")
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
          }
          const additional = (a.additionalServices as any[]).map((s: any, idx: number) => ({
            id: `additional-${idx}`,
            serviceId: s._id || s,
            staffId: staffIdVal || "",
            name: s?.name || "Service",
            duration: s?.duration ?? 60,
            price: s?.price ?? 0,
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
          }]
        }

        setSelectedServices(servicesToShow)
        setExistingBookingGroupId(a.bookingGroupId || null)
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
        }
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

  // Add a service to the appointment (pre-fill staff when coming from calendar slot)
  const addService = () => {
    const isFirstService = selectedServices.length === 0
    const newService: SelectedService = {
      id: Date.now().toString(),
      serviceId: "",
      staffId: isFirstService && urlStaffId ? urlStaffId : "",
      name: "",
      duration: 0,
      price: 0,
    }
    setSelectedServices([...selectedServices, newService])
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

  async function onSubmit(values: z.infer<typeof formSchema>) {
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

    if (values.date && values.time) {
      const unavailable = selectedServices.filter((s, idx) => {
        if (!s.staffId) return false
        const availableForService = getAvailableStaffForService(idx)
        const availableIds = new Set(availableForService.map((m: any) => m._id || m.id))
        return !availableIds.has(s.staffId)
      })
      if (unavailable.length > 0) {
        toast({
          title: "Error",
          description: "One or more selected staff are not available for their assigned service time. Please pick a different time or staff.",
          variant: "destructive",
        })
        return
      }
    }

    setIsSubmitting(true)

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
        // Newly added services (via Add Service) with same staff as primary → merge into same card
        const newServicesSameStaff = primary ? newServices.filter((s) => s.staffId && s.staffId === primary.staffId) : []
        const newServicesDifferentStaff = primary ? newServices.filter((s) => !s.staffId || s.staffId !== primary.staffId) : newServices

        if (hasAdditional || newServicesSameStaff.length > 0) {
          // Same staff, multiple services: update single appointment with primary + additionalServiceIds
          // If primary (edit-service) was removed: promote first additional to primary
          const effectivePrimary = primary ?? (existingAdditional.length > 0 ? { ...existingAdditional[0], id: "edit-service" } : null)
          if (!effectivePrimary) {
            toast({ title: "Error", description: "Invalid edit state.", variant: "destructive" })
            return
          }
          const restAdditional = primary ? existingAdditional : existingAdditional.slice(1)
          const allAdditional = [...restAdditional, ...newServicesSameStaff]
          const additionalIds = allAdditional.map((s) => s.serviceId)
          const totalDur = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0)
          const totalPrice = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0)
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
          })
          if (!updateRes?.success) {
            toast({ title: "Error", description: updateRes?.error || "Failed to update.", variant: "destructive" })
            return
          }
        } else if (hasRelated) {
          // Multi staff: delete removed appointments, update remaining with sequential times
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
            const serviceTime = getSequentialServiceStartTime(selectedServices, values.time, i)
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
            const updateRes = await AppointmentsAPI.update(appointmentId, {
              date: dateStr,
              time: timeStr,
              serviceId: originalService.serviceId,
              additionalServiceIds: [],
              staffId: originalService.staffId,
              staffAssignments: originalService.staffId ? [{ staffId: originalService.staffId, percentage: 100, role: "primary" }] : undefined,
              duration: originalService.duration,
              price: originalService.price,
              leadSource: leadSourceValue || "",
              notes: values.notes,
            })
            if (!updateRes?.success) {
              toast({ title: "Error", description: updateRes?.error || "Failed to update.", variant: "destructive" })
              return
            }
          } else {
            await AppointmentsAPI.delete(appointmentId)
          }
        }

        if (newServicesDifferentStaff.length > 0) {
          // Link new cards to existing group (or create group for originally single card)
          const groupId = existingBookingGroupId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
          if (!existingBookingGroupId && !appointmentIdDeleted) {
            await AppointmentsAPI.update(appointmentId, { bookingGroupId: groupId })
          }
          // New services must start after all existing services (sequential, no overlap)
          const firstNewIdx = selectedServices.findIndex((s) =>
            newServicesDifferentStaff.some((n) => n.serviceId === s.serviceId && n.staffId === s.staffId)
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
            services: newServicesDifferentStaff.map((s) => ({
              serviceId: s.serviceId,
              staffId: s.staffId,
              name: s.name,
              duration: s.duration,
              price: s.price,
            })),
            totalDuration: newServicesDifferentStaff.reduce((sum, s) => sum + (s.duration || 0), 0),
            totalAmount: newServicesDifferentStaff.reduce((sum, s) => sum + (s.price || 0), 0),
            notes: values.notes,
            status: "scheduled",
          })
          if (!createRes?.success) {
            toast({ title: "Error", description: "Failed to create new services.", variant: "destructive" })
            return
          }
        }

        toast({ title: "Appointment Updated", description: newServicesSameStaff.length > 0 || newServicesDifferentStaff.length > 0 ? "Changes saved and new services added." : "Changes have been saved." })
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("appointments-refresh"))
        onSuccess ? onSuccess() : router.push("/appointments")
      } else {
        const appointmentData = {
          clientId: selectedCustomer._id || selectedCustomer.id,
          clientName: selectedCustomer.name,
          date: format(values.date, "yyyy-MM-dd"),
          time: formatTimeForApi(values.time),
          leadSource: leadSourceValue,
          services: selectedServices.map(service => ({
            serviceId: service.serviceId,
            staffId: service.staffId,
            name: service.name,
            duration: service.duration,
            price: service.price,
          })),
          totalDuration: calculateTotalDuration(),
          totalAmount: calculateTotalAmount(),
          notes: values.notes,
          status: "scheduled",
        }
        const response = await AppointmentsAPI.create(appointmentData)
        if (response.success) {
          toast({ title: "Appointment Created", description: "New appointment has been successfully scheduled." })
          onSuccess ? onSuccess() : router.push("/appointments")
        } else {
          toast({ title: "Error", description: "Failed to create appointment. Please try again.", variant: "destructive" })
        }
      }
    } catch (error) {
      console.error('Error creating appointment:', error)
      toast({
        title: "Error",
        description: "Failed to create appointment. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isDrawer = variant === "drawer"

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
            <div className="space-y-6">
              <div className="grid gap-6 pb-8 md:grid-cols-2">
                <FormField
                control={form.control}
                name="date"
                render={({ field }) => {
                  return (
                    <FormItem className="flex flex-col space-y-2">
                      <FormLabel className="text-sm font-semibold text-slate-700">Date *</FormLabel>
                      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen} modal>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              type="button"
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
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
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
            <div className={cn("space-y-4", isDrawer ? "mt-6" : "mt-12")}>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className={cn("font-semibold text-slate-800 flex items-center gap-2", isDrawer ? "text-base" : "text-lg")}>
                    <FileText className={cn("text-slate-600", isDrawer ? "h-4 w-4" : "h-5 w-5")} />
                    Services *
                  </h3>
                  <Button
                    type="button"
                    onClick={addService}
                    className={cn(
                      "text-white",
                      isDrawer ? "bg-violet-600 hover:bg-violet-700 rounded-lg px-3 py-1.5" : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-xl px-4 py-2"
                    )}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Service
                  </Button>
                </div>
                {!isDrawer && <p className="text-sm text-slate-500">Add services and assign staff members for this appointment</p>}
              </div>

              {selectedServices.length > 0 ? (
                <div className="space-y-2">
                  {selectedServices.map((service) => (
                    <div key={service.id} className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                      <span className="text-xs font-medium text-slate-500 w-6 shrink-0">{selectedServices.indexOf(service) + 1}.</span>
                      <div className="relative service-dropdown-container flex-1 min-w-0">
                        {service.serviceId && service.name ? (
                          <div className="flex items-center justify-between h-9 px-2.5 py-1.5 bg-white rounded-md text-sm border border-slate-200 min-w-0">
                            <span className="truncate">{service.name}</span>
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
                          </div>
                        ) : (
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                              placeholder="Search service..."
                              value={getDropdownState(service.id).search}
                              onChange={(e) => updateDropdownState(service.id, { search: e.target.value, isOpen: true })}
                              onFocus={() => updateDropdownState(service.id, { isOpen: true })}
                              className="h-9 pl-8 pr-8 text-sm border-slate-200 rounded-md"
                            />
                            {getDropdownState(service.id).search && (
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
                        {getDropdownState(service.id).isOpen && !service.serviceId && (
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
                              const serviceIndex = selectedServices.indexOf(service)
                              const list = getAvailableStaffForService(serviceIndex).filter((member: any) => member._id || member.id)
                              const selectedId = service.staffId
                              const selectedNotInList = selectedId && !list.some((m: any) => (m._id || m.id) === selectedId)
                              const options = selectedNotInList
                                ? [...list, staff.find((m: any) => (m._id || m.id) === selectedId)].filter(Boolean)
                                : list
                              return options.map((member: any) => {
                                const staffId = member._id || member.id
                                const isUnavailable = selectedNotInList && staffId === selectedId
                                return (
                                  <SelectItem key={staffId} value={staffId}>
                                    {member.name}
                                    {isUnavailable ? " (unavailable)" : ""}
                                  </SelectItem>
                                )
                              })
                            })()
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeService(service.id)}
                        className="h-9 w-9 p-0 shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={cn("text-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50", isDrawer ? "p-4" : "p-8")}>
                  <FileText className={cn("text-slate-300 mx-auto", isDrawer ? "h-8 w-8 mb-2" : "h-12 w-12 mb-4")} />
                  <p className="text-slate-500 text-sm">No services added yet</p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-slate-600" />
                  Additional Notes
                </h3>
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Enter any additional notes about the appointment"
                        className="resize-none h-24 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

          </form>
        </Form>
        )}
    </>
  )

  const footerButtons = (
    <div className={cn("flex justify-end gap-3 w-full flex-nowrap", isDrawer ? "pt-4 border-t border-border/60" : "")}>
      <Button
        variant="outline"
        type="button"
        onClick={() => (onCancel ? onCancel() : router.push("/appointments"))}
        className={cn(
          "font-medium min-w-[100px]",
          isDrawer ? "rounded-lg" : "px-8 py-3 border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl"
        )}
      >
        Cancel
      </Button>
      <Button
        variant="outline"
        type="button"
        disabled={isSubmitting || loadingAppointment || selectedServices.length === 0 || !selectedCustomer}
        onClick={() => {
          const values = form.getValues()
          if (!selectedCustomer || selectedServices.length === 0) return
          const saleData: Record<string, unknown> = {
            clientId: selectedCustomer._id || selectedCustomer.id,
            clientName: selectedCustomer.name,
            clientPhone: selectedCustomer.phone || "",
            clientEmail: selectedCustomer.email || "",
            date: values.date ? format(values.date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
            time: values.time || "",
            notes: values.notes || "",
            services: selectedServices.map(s => {
              const staffMember = staff.find((st: any) => (st._id || st.id) === s.staffId)
              return {
                serviceId: s.serviceId,
                staffId: s.staffId,
                staffName: staffMember?.name || "",
                name: s.name,
                price: s.price,
                duration: s.duration,
              }
            }),
          }
          if (isEditMode && appointmentId) {
            saleData.appointmentId = appointmentId
          }
          router.push(`/quick-sale?appointment=${btoa(JSON.stringify(saleData))}`)
        }}
        className={cn(
          "font-medium min-w-[120px]",
          isDrawer ? "rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50" : "px-8 py-3 border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl"
        )}
      >
        <Receipt className="h-4 w-4 mr-2" />
        Raise Sale
      </Button>
      <Button
        type="submit"
        form="appointmentForm"
        disabled={isSubmitting || loadingAppointment || selectedServices.length === 0 || !selectedCustomer}
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
    </div>
  )

  return (
    <>
      {isDrawer ? (
        <div className="flex flex-col min-h-0 flex-1">
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
    </>
  )
}
