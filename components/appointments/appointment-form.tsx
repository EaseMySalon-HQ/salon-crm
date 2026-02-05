"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Check, Plus, Trash2, Search, User, Phone, X, CalendarDays, FileText, TrendingUp, Loader2, Calendar as CalendarIcon } from "lucide-react"
import { format, isBefore, startOfDay } from "date-fns"
import { DayPicker } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
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

// Time slots for appointments (15-min intervals to match calendar grid)
const timeSlots = [
  "9:00 AM", "9:15 AM", "9:30 AM", "9:45 AM",
  "10:00 AM", "10:15 AM", "10:30 AM", "10:45 AM",
  "11:00 AM", "11:15 AM", "11:30 AM", "11:45 AM",
  "12:00 PM", "12:15 PM", "12:30 PM", "12:45 PM",
  "1:00 PM", "1:15 PM", "1:30 PM", "1:45 PM",
  "2:00 PM", "2:15 PM", "2:30 PM", "2:45 PM",
  "3:00 PM", "3:15 PM", "3:30 PM", "3:45 PM",
  "4:00 PM", "4:15 PM", "4:30 PM", "4:45 PM",
  "5:00 PM", "5:15 PM", "5:30 PM", "5:45 PM",
]

const formSchema = z.object({
  date: z.date({
    required_error: "Please select a date.",
  }),
  time: z.string({
    required_error: "Please select a time.",
  }),
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
  /** Called when user selects or clears the client (for showing client details panel) */
  onClientSelect?: (client: Client | null) => void
}

export function AppointmentForm({ initialDate, initialTime, initialStaffId, onClientSelect }: AppointmentFormProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])

  // Prefer URL params (from calendar slot) over props so time is correct on first paint
  const urlDate = searchParams?.get("date") ?? initialDate
  const urlTime = searchParams?.get("time") ?? initialTime
  const urlStaffId = searchParams?.get("staffId") ?? initialStaffId

  // Normalize time to match a form timeSlot exactly so the Select displays it
  const defaultTime = useMemo(() => {
    if (!urlTime) return ""
    return timeSlots.find((t) => t.toLowerCase() === urlTime.toLowerCase()) ?? urlTime
  }, [urlTime])

  const defaultDate = useMemo(() => {
    if (!urlDate) return undefined
    const parts = urlDate.split("-").map(Number)
    if (parts.length < 3) return undefined
    return new Date(parts[0], parts[1] - 1, parts[2])
  }, [urlDate])

  // Client search state
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Client | null>(null)
  const [clients, setClients] = useState<Client[]>([])

  // Services and staff state
  const [services, setServices] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [blockTimesForDate, setBlockTimesForDate] = useState<any[]>([])
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

  // Fetch block times when date is set (for availability filtering)
  useEffect(() => {
    if (!formDate) {
      setBlockTimesForDate([])
      return
    }
    const dateStr = format(formDate, "yyyy-MM-dd")
    BlockTimeAPI.getAll({ startDate: dateStr, endDate: dateStr })
      .then((res) => {
        if (res?.success && Array.isArray(res?.data)) setBlockTimesForDate(res.data)
        else setBlockTimesForDate([])
      })
      .catch(() => setBlockTimesForDate([]))
  }, [formDate])

  // Staff available on the selected date and time (work schedule + not blocked)
  const availableStaff = useMemo(() => {
    if (!formDate || !formTime) return staff
    const dateStr = format(formDate, "yyyy-MM-dd")
    const dayIndex = formDate.getDay()
    const timeMinutes = parseTimeToMinutes(formTime)

    return staff.filter((member: any) => {
      const staffId = member._id || member.id
      if (!staffId) return false

      const schedule = member.workSchedule || []
      const dayRow = schedule.find((r: any) => r.day === dayIndex)
      if (dayRow && dayRow.enabled === false) return false
      const startStr = dayRow?.startTime ?? "09:00"
      const endStr = dayRow?.endTime ?? "21:00"
      const startM = parseTimeToMinutes(startStr)
      const endM = parseTimeToMinutes(endStr)
      if (timeMinutes < startM || timeMinutes >= endM) return false

      const isBlocked = blockTimesForDate.some((block: any) => {
        const blockStaffId = typeof block.staffId === "object" && block.staffId?._id ? block.staffId._id : String(block.staffId)
        if (blockStaffId !== staffId) return false
        if (!blockAppliesOnDate(block, dateStr)) return false
        const blockStartM = parseTimeToMinutes(block.startTime)
        const blockEndM = parseTimeToMinutes(block.endTime)
        return timeMinutes >= blockStartM && timeMinutes < blockEndM
      })
      return !isBlocked
    })
  }, [staff, formDate, formTime, blockTimesForDate])

  // Load services and staff on component mount
  useEffect(() => {
    fetchServices()
    fetchStaff()
    fetchClients()
  }, [])

  // Subscribe to client store changes
  useEffect(() => {
    const unsubscribe = clientStore.subscribe(() => {
      const updatedClients = clientStore.getClients()
      setClients(updatedClients || [])
    })

    return unsubscribe
  }, [])

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

  const fetchClients = async () => {
    try {
      await clientStore.loadClients()
      const allClients = clientStore.getClients()
      setClients(allClients || [])
    } catch (error) {
      console.error('Failed to fetch clients:', error)
    }
  }

  // Filter customers based on search
  const filteredCustomers = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      client.phone.includes(customerSearch) ||
      (client.email && client.email.toLowerCase().includes(customerSearch.toLowerCase())),
  )

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
        // Refresh clients list
        await fetchClients()
        
        // Find the newly created client
        const allClients = clientStore.getClients()
        const createdClient = allClients.find(c => 
          c.name === newClientData.name && c.phone === newClientData.phone
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
      const availableIds = new Set(availableStaff.map((m: any) => m._id || m.id))
      const unavailable = selectedServices.filter((s) => s.staffId && !availableIds.has(s.staffId))
      if (unavailable.length > 0) {
        toast({
          title: "Error",
          description: "One or more selected staff are not available on the chosen date and time. Please pick a different time or staff.",
          variant: "destructive",
        })
        return
      }
    }

    setIsSubmitting(true)

    try {
      // Prepare appointment data
      const appointmentData = {
        clientId: selectedCustomer._id || selectedCustomer.id,
        clientName: selectedCustomer.name,
        date: format(values.date, "yyyy-MM-dd"),
        time: values.time,
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

      // Create appointment
      const response = await AppointmentsAPI.create(appointmentData)
      
      if (response.success) {
        toast({
          title: "Appointment Created",
          description: "New appointment has been successfully scheduled.",
        })
        router.push("/appointments")
      } else {
        toast({
          title: "Error",
          description: "Failed to create appointment. Please try again.",
          variant: "destructive",
        })
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

  return (
    <>
      <div className="w-full max-w-full">
        <Card className="shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-lg">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <CalendarDays className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">New Appointment</CardTitle>
                <CardDescription className="text-indigo-100 mt-1">Schedule a new appointment with multiple services</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
        <Form {...form}>
          <form id="appointmentForm" onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
            
            {/* Client Selection */}
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Client *
                </Label>
                <p className="text-sm text-slate-500">Search and select a client for the appointment</p>
              </div>
              <div className="relative customer-search-container">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="tel"
                  placeholder="Search by name or phone (10 digits)..."
                  value={customerSearch}
                  onChange={(e) => {
                    const value = e.target.value
                    // If it's all digits, restrict immediately to 10 digits
                    if (/^\d+$/.test(value)) {
                      const restricted = value.slice(0, 10)
                      handleCustomerSearchChange(restricted)
                    } else {
                      handleCustomerSearchChange(value)
                    }
                  }}
                  onPaste={(e) => {
                    // Handle paste events for phone numbers
                    const pastedText = e.clipboardData.getData('text')
                    if (/^\d+$/.test(pastedText)) {
                      e.preventDefault()
                      const restricted = pastedText.slice(0, 10)
                      handleCustomerSearchChange(restricted)
                    }
                  }}
                  onKeyDown={(e) => {
                    // Prevent typing if it's a phone number and already 10 digits
                    if (/^\d+$/.test(customerSearch) && customerSearch.length >= 10) {
                      // Allow backspace, delete, arrow keys, tab, etc.
                      if (!['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key) && 
                          !e.ctrlKey && !e.metaKey) {
                        e.preventDefault()
                      }
                    }
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  className="pl-12 h-12 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl"
                />

                {showCustomerDropdown && customerSearch && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-auto">
                    {filteredCustomers.length > 0 ? (
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
            </div>

            {/* Date & Time */}
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-slate-600" />
                  Schedule Details
                </h3>
                <p className="text-sm text-slate-500">Select the date and time for the appointment</p>
              </div>
              <div className="grid gap-6 md:grid-cols-2 pb-8">
                <FormField
                control={form.control}
                name="date"
                render={({ field }) => {
                  return (
                    <FormItem className="flex flex-col space-y-2">
                      <FormLabel className="text-sm font-semibold text-slate-700">Date *</FormLabel>
                      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
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
                                caption: "flex justify-center items-center mb-16 relative h-10 pt-4",
                                caption_label: "text-lg font-semibold text-slate-900 absolute left-1/2 -translate-x-1/2 z-10",
                                nav: "absolute inset-x-0 flex items-center justify-between px-1 top-4",
                                nav_button: "h-8 w-8 bg-transparent hover:bg-slate-100 rounded-md inline-flex items-center justify-center transition-colors disabled:opacity-50 z-20",
                                nav_button_previous: "absolute left-1",
                                nav_button_next: "absolute right-1",
                                table: "w-full border-collapse mt-8",
                                head_row: "flex mb-2",
                                head_cell: "text-slate-500 font-medium text-xs uppercase w-10 text-center",
                                row: "flex w-full mt-1",
                                cell: "relative p-0.5 text-center text-sm",
                                day: "h-9 w-9 rounded-md font-normal text-sm",
                                day_button: "h-9 w-9 rounded-md font-normal hover:bg-slate-100 transition-colors",
                                day_selected: "bg-slate-900 text-white hover:bg-slate-800 font-medium",
                                day_today: "font-semibold text-slate-900 border border-slate-300",
                                day_outside: "text-slate-300",
                                day_disabled: "text-slate-200 line-through cursor-not-allowed hover:bg-transparent",
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
            <div className="space-y-6 mt-12">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-slate-600" />
                    Services *
                  </h3>
                  <Button type="button" onClick={addService} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl px-4 py-2">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Service
                  </Button>
                </div>
                <p className="text-sm text-slate-500">Add services and assign staff members for this appointment</p>
              </div>

              {selectedServices.length > 0 ? (
                <div className="space-y-4">
                  {selectedServices.map((service) => (
                    <div key={service.id} className="bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-xl p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-100 rounded-lg">
                            <FileText className="h-4 w-4 text-slate-600" />
                          </div>
                          <h4 className="font-semibold text-slate-800">Service {selectedServices.indexOf(service) + 1}</h4>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeService(service.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-slate-700">Service</Label>
                          <div className="relative service-dropdown-container">
                            {service.serviceId && service.name ? (
                              <div className="flex items-center justify-between h-10 px-3 py-2 bg-slate-100 rounded-lg text-sm border border-slate-200">
                                <span className="truncate">{service.name}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateService(service.id, "serviceId", "")
                                    updateService(service.id, "name", "")
                                    updateDropdownState(service.id, { search: '', isOpen: false })
                                  }}
                                  className="ml-2 text-slate-500 hover:text-slate-700"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                  placeholder="Search services..."
                                  value={getDropdownState(service.id).search}
                                  onChange={(e) => updateDropdownState(service.id, { search: e.target.value, isOpen: true })}
                                  onFocus={() => updateDropdownState(service.id, { isOpen: true })}
                                  className="pl-10 border-slate-200 hover:border-indigo-500 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg"
                                />
                                {getDropdownState(service.id).search && (
                                  <button
                                    type="button"
                                    onClick={() => updateDropdownState(service.id, { search: '', isOpen: false })}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            )}
                            
                            {getDropdownState(service.id).isOpen && !service.serviceId && (
                              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                                {loadingServices ? (
                                  <div className="p-3 text-center text-sm text-slate-500">Loading services...</div>
                                ) : getFilteredServices(service.id).length === 0 ? (
                                  <div className="p-3 text-center text-sm text-slate-500">
                                    No services found matching "{getDropdownState(service.id).search}"
                                  </div>
                                ) : (
                                  getFilteredServices(service.id).map((s) => (
                                    <div
                                      key={s._id || s.id}
                                      className="p-3 hover:bg-slate-50 cursor-pointer border-b last:border-b-0 transition-colors"
                                      onClick={() => {
                                        updateService(service.id, "serviceId", s._id || s.id)
                                        updateDropdownState(service.id, { search: '', isOpen: false })
                                      }}
                                    >
                                      <div className="font-medium text-slate-800">{s.name}</div>
                                      <div className="text-xs text-slate-500 mt-1">{s.duration} min - ₹{s.price}</div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-slate-700">Staff Member</Label>
                          <Select
                            value={service.staffId}
                            onValueChange={(value) => updateService(service.id, "staffId", value)}
                          >
                            <SelectTrigger className="border-slate-200 hover:border-indigo-500 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg">
                              <SelectValue placeholder="Select staff" />
                            </SelectTrigger>
                          <SelectContent>
                             {loadingStaff ? (
                              <SelectItem value="__loading__" disabled>
                                Loading staff...
                              </SelectItem>
                            ) : staff.length === 0 ? (
                              <SelectItem value="no-staff" disabled>
                                No active staff available
                              </SelectItem>
                            ) : (
                              (() => {
                                const list = availableStaff.filter((member: any) => member._id || member.id)
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
                                      {isUnavailable ? " (unavailable for this date/time)" : ""}
                                    </SelectItem>
                                  )
                                })
                              })()
                            )}
                          </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {service.name && (
                        <div className="bg-white/60 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-600">Duration:</span>
                            <span className="text-sm font-semibold text-slate-800">{service.duration} minutes</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-600">Price:</span>
                            <span className="text-sm font-semibold text-green-600">₹{service.price}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">No services added yet</p>
                  <p className="text-sm text-slate-400 mt-1">Please add at least one service to continue</p>
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
                <p className="text-sm text-slate-500">Add any special requests or important information</p>
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
                    <FormDescription className="text-slate-500">Include any special requests or important information.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Summary */}
            {selectedServices.length > 0 && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-slate-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-800">Appointment Summary</h4>
                </div>
                <div className="grid gap-3">
                  <div className="flex justify-between items-center py-2 border-b border-indigo-100">
                    <span className="text-slate-600 font-medium">Total Services:</span>
                    <span className="text-slate-800 font-semibold">{selectedServices.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-indigo-100">
                    <span className="text-slate-600 font-medium">Total Duration:</span>
                    <span className="text-slate-800 font-semibold">{calculateTotalDuration()} minutes</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-600 font-medium">Total Amount:</span>
                    <span className="text-green-600 font-bold text-lg">₹{calculateTotalAmount()}</span>
                  </div>
                </div>
              </div>
            )}
          </form>
        </Form>
          </CardContent>
          <CardFooter className="bg-slate-50/50 px-8 py-8 border-t border-slate-200/50">
            <div className="flex justify-end gap-4 w-full">
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => router.push("/appointments")}
                className="px-8 py-3 border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-medium min-w-[120px]"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                form="appointmentForm" 
                disabled={isSubmitting || selectedServices.length === 0 || !selectedCustomer}
                className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed min-w-[200px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Schedule Appointment
                  </>
                )}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

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
