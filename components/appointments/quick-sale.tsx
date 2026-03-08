"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import {
  Search,
  Plus,
  User,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  Eye,
  X,
  CreditCard,
  Smartphone,
  Banknote,
  Loader2,
  CalendarIcon,
  Receipt,
  CalendarDays,
  FileText,
  Minus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Edit,
  RefreshCw,
  Package,
} from "lucide-react"
import { Calendar as DatePicker } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/use-toast"
import { ReceiptDialog } from "@/components/receipts/receipt-dialog"
import { PaymentCollectionModal } from "@/components/reports/payment-collection-modal"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import {
  addReceipt,
  getReceiptsByClient,
  type PaymentMethod,
  getAllReceipts,
} from "@/lib/data"
import { ServicesAPI, ProductsAPI, StaffAPI, SalesAPI, UsersAPI, SettingsAPI, ReceiptsAPI, StaffDirectoryAPI, AppointmentsAPI, BlockTimeAPI, MembershipAPI } from "@/lib/api"
import { clientStore, type Client } from "@/lib/client-store"
import { MultiStaffSelector, type StaffContribution } from "@/components/ui/multi-staff-selector"
import { TaxCalculator, createTaxCalculator, type TaxSettings, type BillItem } from "@/lib/tax-calculator"
import { useRouter } from "next/navigation"

// Mock data for customers
// const mockCustomers = [
//   {
//     id: "1",
//     name: "Shubham Anand",
//     phone: "6360019041",
//     email: "shubham@example.com",
//     status: "active",
//     visits: 12,
//     totalSpent: 15600,
//     lastVisit: "2024-01-25",
//     bills: [
//       {
//         id: "R001",
//         date: "2024-01-25",
//         time: "14:30",
//         total: 850,
//         paymentMethod: "Cash",
//         items: [
//           { name: "Hair Cut", price: 500, staff: "John Doe" },
//           { name: "Hair Wash", price: 200, staff: "John Doe" },
//           { name: "Hair Oil", price: 150, staff: "John Doe" },
//         ],
//         notes: "Regular customer, prefers short cut",
//       },
//       {
//         id: "R002",
//         date: "2024-01-10",
//         time: "16:15",
//         total: 1200,
//         paymentMethod: "Card",
//         items: [
//           { name: "Hair Cut", price: 500, staff: "Jane Smith" },
//           { name: "Beard Trim", price: 300, staff: "Jane Smith" },
//           { name: "Face Massage", price: 400, staff: "Jane Smith" },
//         ],
//         notes: "Requested specific styling",
//       },
//     ],
//   },
//   {
//     id: "2",
//     name: "Priya Sharma",
//     phone: "9876543210",
//     email: "priya@example.com",
//     status: "active",
//     visits: 8,
//     totalSpent: 12400,
//     lastVisit: "2024-01-20",
//     bills: [],
//   },
//   {
//     id: "3",
//     name: "Rahul Kumar",
//     phone: "8765432109",
//     email: "rahul@example.com",
//     status: "inactive",
//     visits: 3,
//     totalSpent: 2100,
//     lastVisit: "2023-12-15",
//     bills: [],
//   },
// ]

// Mock data for services and products
// const mockServices = [
//   { id: "1", name: "Hair Cut", price: 500, duration: 30 },
//   { id: "2", name: "Hair Wash", price: 200, duration: 15 },
//   { id: "3", name: "Beard Trim", price: 300, duration: 20 },
//   { id: "4", name: "Face Massage", price: 400, duration: 45 },
// ]

// const mockProducts = [
//   { id: "1", name: "Hair Oil", price: 150, stock: 25 },
//   { id: "2", name: "Shampoo", price: 250, stock: 15 },
//   { id: "3", name: "Hair Gel", price: 180, stock: 30 },
//   { id: "4", name: "Face Cream", price: 320, stock: 12 },
// ]

// interface CartItem {
//   id: string
//   name: string
//   price: number
//   quantity: number
//   type: "service" | "product"
// }

interface ServiceItem {
  id: string
  serviceId: string
  staffId: string // Legacy field for backward compatibility
  staffContributions?: Array<{
    staffId: string
    staffName: string
    percentage: number
    amount: number
  }>
  quantity: number
  price: number
  discount: number
  total: number
  isMembershipFree?: boolean
  membershipDiscountPercent?: number
}

interface ProductItem {
  id: string
  productId: string
  staffId: string
  quantity: number
  price: number
  discount: number
  total: number
}

interface MembershipItem {
  id: string
  planId: string
  planName: string
  price: number
  durationInDays: number
  quantity: number
  total: number
  staffId: string
}

type BillingMode = "create" | "edit" | "exchange"

/** Parse time string (e.g. "HH:mm", "9:00am") to minutes since midnight */
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

/** Check if a block time applies on the given date (handles recurring) */
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

/** Get staff IDs that are available for a slot [startM, startM + duration] on dateStr.
 * When considerAllAppointments is true (from linked appointment), check all non-cancelled appointments for conflicts.
 * For walk-in QuickSale: "arrived" and "service_started" do NOT block - staff may have rest periods or gaps where they can take other work. */
function getAvailableStaffIds(
  dateStr: string,
  timeStr: string,
  durationMinutes: number,
  appointments: any[],
  blockTimes: any[],
  allStaffIds: string[],
  considerAllAppointments = false
): string[] {
  const startM = parseTimeToMinutes(timeStr)
  const endM = startM + durationMinutes
  const busyStaffIds = new Set<string>()

  for (const apt of appointments) {
    if (apt.status === "cancelled") continue
    // For walk-in QuickSale, don't block by appointments - staff can take other work during rest periods or gaps.
    if (!considerAllAppointments) continue
    const aptStartM = parseTimeToMinutes(apt.time || "0:00")
    const aptDuration = apt.duration ?? 60
    const aptEndM = aptStartM + aptDuration
    if (aptEndM <= startM || aptStartM >= endM) continue // no overlap
    const staffId = apt.staffId?._id || apt.staffId?.id || apt.staffId
    if (staffId) busyStaffIds.add(String(staffId))
    for (const a of apt.staffAssignments || []) {
      const sid = a.staffId?._id || a.staffId?.id || a.staffId
      if (sid) busyStaffIds.add(String(sid))
    }
  }

  // Block times that apply on this date
  for (const block of blockTimes) {
    if (!blockAppliesOnDate(block, dateStr)) continue
    const blockStaffId = block.staffId?._id || block.staffId?.id || block.staffId
    if (!blockStaffId) continue
    const blockStartM = parseTimeToMinutes(block.startTime || "0:00")
    const blockEndM = parseTimeToMinutes(block.endTime || "23:59")
    if (blockEndM <= startM || blockStartM >= endM) continue
    busyStaffIds.add(String(blockStaffId))
  }

  return allStaffIds.filter((id) => !busyStaffIds.has(String(id)))
}

interface QuickSaleProps {
  mode?: BillingMode
  initialSale?: any
  billLoading?: boolean
}

export function QuickSale({ mode = "create", initialSale, billLoading = false }: QuickSaleProps = {}) {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(null)
  const [linkedAppointmentTime, setLinkedAppointmentTime] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Client | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([])
  const [productItems, setProductItems] = useState<ProductItem[]>([])
  const [discountValue, setDiscountValue] = useState(0)
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [giftVoucher, setGiftVoucher] = useState("")
  const [tip, setTip] = useState(0)
  const [tipStaffId, setTipStaffId] = useState<string | null>(null)
  const [isGlobalDiscountActive, setIsGlobalDiscountActive] = useState(false)
  const [isValueDiscountActive, setIsValueDiscountActive] = useState(false)
  const [cashAmount, setCashAmount] = useState(0)
  const [cardAmount, setCardAmount] = useState(0)
  const [onlineAmount, setOnlineAmount] = useState(0)
  const [remarks, setRemarks] = useState("")
  const [isOldQuickSale, setIsOldQuickSale] = useState(false)
  const [currentReceipt, setCurrentReceipt] = useState<any | null>(null)
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  // Search states for service items dropdown
  const [serviceDropdownSearch, setServiceDropdownSearch] = useState("")
  const [productDropdownSearch, setProductDropdownSearch] = useState("")
  const [activeServiceDropdown, setActiveServiceDropdown] = useState<string | null>(null)
  const [activeProductDropdown, setActiveProductDropdown] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false)
  const [showBillActivityDialog, setShowBillActivityDialog] = useState(false)
  const [customerBills, setCustomerBills] = useState<any[]>([])
  const [showDuesDialog, setShowDuesDialog] = useState(false)
  const [unpaidBills, setUnpaidBills] = useState<any[]>([])
  const [showDuesPaymentModal, setShowDuesPaymentModal] = useState(false)
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<any>(null)
  const [newCustomer, setNewCustomer] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  })
  const customerSearchRef = useRef<HTMLDivElement>(null)
  const [showBillDetailsDialog, setShowBillDetailsDialog] = useState(false)
  const [selectedBill, setSelectedBill] = useState<any>(null)
  const [confirmUnpaid, setConfirmUnpaid] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showTipModal, setShowTipModal] = useState(false)
  const [tempTipAmount, setTempTipAmount] = useState(0)
  const [editReason, setEditReason] = useState("")
  const [showEditReasonModal, setShowEditReasonModal] = useState(false)
  const [tempEditReason, setTempEditReason] = useState("")
  const [isInitialized, setIsInitialized] = useState(false)

  // Membership state (for customer with active membership)
  const [membershipData, setMembershipData] = useState<{
    subscription: any
    plan: any
    usageSummary: Array<{ serviceId: string; serviceName: string; used: number; limit: number; remaining: number }>
  } | null>(null)

  // Plans for membership section (fetched when customer selected)
  const [plans, setPlans] = useState<Array<{ _id: string; id?: string; planName: string; price: number; durationInDays: number }>>([])

  // Add Items section: membership | gift-voucher | prepaid (none selected by default)
  const [addItemSection, setAddItemSection] = useState<'membership' | 'gift-voucher' | 'prepaid' | null>(null)

  // Membership items (rows added from Membership section)
  const [membershipItems, setMembershipItems] = useState<MembershipItem[]>([])

  // State for services and products from API
  const [services, setServices] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [businessSettings, setBusinessSettings] = useState<any>(null)
  const [posSettings, setPOSSettings] = useState<any>(null)
  const [paymentSettings, setPaymentSettings] = useState<any>(null)

  // Filtered services and products for dropdown search (search by name or category)
  const filteredServicesForDropdown = services.filter(service => {
    const q = serviceDropdownSearch.toLowerCase().trim()
    if (!q) return true
    const nameMatch = service.name?.toLowerCase().includes(q)
    const categoryMatch = service.category?.toLowerCase().includes(q)
    return nameMatch || categoryMatch
  })

  // Group filtered services by category for dropdown display
  const servicesByCategory = filteredServicesForDropdown.reduce<Record<string, typeof filteredServicesForDropdown>>((acc, service) => {
    const cat = service.category?.trim() || "Uncategorized"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(service)
    return acc
  }, {})
  const categoryOrder = Object.keys(servicesByCategory).sort((a, b) => a.localeCompare(b))

  // Filtered products (search by name or category)
  const filteredProductsForDropdown = products.filter(product => {
    const q = productDropdownSearch.toLowerCase().trim()
    if (!q) return true
    const nameMatch = product.name?.toLowerCase().includes(q)
    const categoryMatch = product.category?.toLowerCase().includes(q)
    return nameMatch || categoryMatch
  })

  // Group filtered products by category for dropdown display
  const productsByCategory = filteredProductsForDropdown.reduce<Record<string, typeof filteredProductsForDropdown>>((acc, product) => {
    const cat = product.category?.trim() || "Uncategorized"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(product)
    return acc
  }, {})
  const productCategoryOrder = Object.keys(productsByCategory).sort((a, b) => a.localeCompare(b))

  // Add item to cart function
  const addToCart = (item: any, type: "service" | "product") => {
    const priceInclusiveOfTax = paymentSettings?.priceInclusiveOfTax !== false
    const computeLineTotalAndTaxForAdd = (
      baseAmount: number,
      discountPct: number,
      taxRate: number,
      applyTax: boolean
    ): number => {
      const discountedAmount = baseAmount * (1 - (discountPct || 0) / 100)
      if (!applyTax) return discountedAmount
      if (priceInclusiveOfTax) return discountedAmount
      return discountedAmount + (discountedAmount * taxRate) / 100
    }

    if (type === "service") {
      const basePrice = item.price || 0
      let discount = 0
      let total = basePrice
      let isMembershipFree = false
      let membershipDiscountPercent = 0

      if (membershipData?.plan && membershipData?.usageSummary) {
        const svcId = String(item._id || item.id)
        const usage = membershipData.usageSummary.find((u: any) => String(u.serviceId || u.serviceId?._id) === svcId)
        const plan = membershipData.plan
        if (usage && usage.remaining > 0) {
          discount = 100
          total = 0
          isMembershipFree = true
          membershipDiscountPercent = 100
        } else if (plan?.discountPercentage > 0) {
          discount = plan.discountPercentage
          membershipDiscountPercent = plan.discountPercentage
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const applyTax = item.taxApplicable && taxSettings?.enableTax !== false
          total = computeLineTotalAndTaxForAdd(basePrice, discount, serviceTaxRate, applyTax)
        }
      } else {
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = item.taxApplicable && taxSettings?.enableTax !== false
        total = computeLineTotalAndTaxForAdd(basePrice, 0, serviceTaxRate, applyTax)
      }

      const newItem: ServiceItem = {
        id: Date.now().toString(),
        serviceId: item._id || item.id,
        staffId: "",
        quantity: 1,
        price: basePrice,
        discount,
        total,
        isMembershipFree,
        membershipDiscountPercent,
      }
      setServiceItems([...serviceItems, newItem])
    } else if (type === "product") {
      const basePrice = item.price || 0
      const productForTax = products.find((p) => (p._id || p.id) === (item._id || item.id)) || item
      let productTaxRate = 18
      if (productForTax?.taxCategory && taxSettings) {
        switch (productForTax.taxCategory) {
          case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
          case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
          case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
          case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
          case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
        }
      }
      const applyTax = taxSettings?.enableTax !== false
      const total = computeLineTotalAndTaxForAdd(basePrice, 0, productTaxRate, applyTax)
      const newItem: ProductItem = {
        id: Date.now().toString(),
        productId: item._id || item.id,
        staffId: "",
        quantity: 1,
        price: basePrice,
        discount: 0,
        total,
      }
      setProductItems([...productItems, newItem])
    }
    
    // Clear search after adding
          // Clear search when item is added
          if (type === "service") {
            setServiceDropdownSearch("")
          } else {
            setProductDropdownSearch("")
          }
  }
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null)
  const [taxCalculator, setTaxCalculator] = useState<TaxCalculator | null>(null)
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [loadingClients, setLoadingClients] = useState(true)
  const [appointmentsForDate, setAppointmentsForDate] = useState<any[]>([])
  const [blockTimesForDate, setBlockTimesForDate] = useState<any[]>([])
  const [, setTimeTick] = useState(0)

  // Refresh availability every minute (billing uses current time)
  useEffect(() => {
    const id = setInterval(() => setTimeTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Close service/product dropdowns when clicking outside
  useEffect(() => {
    if (!activeServiceDropdown && !activeProductDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (target instanceof Element && target.closest('[data-quicksale-dropdown]')) return
      setActiveServiceDropdown(null)
      setActiveProductDropdown(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [activeServiceDropdown, activeProductDropdown])

  const dateStr = format(selectedDate, "yyyy-MM-dd")
  const currentTimeStr = format(new Date(), "HH:mm")
  const allStaffIds = staff.map((s) => String(s._id || s.id)).filter(Boolean)

  /** Available staff for a given duration. When from linked appointment, uses appointment time + offset and considers all appointments. */
  const getAvailableStaffForSlot = (
    durationMinutes: number,
    slotTimeStr?: string,
    slotDateStr?: string,
    considerAll = false
  ) => {
    return getAvailableStaffIds(
      slotDateStr ?? dateStr,
      slotTimeStr ?? currentTimeStr,
      durationMinutes,
      appointmentsForDate,
      blockTimesForDate,
      allStaffIds,
      considerAll
    )
  }

  /** Staff list filtered by availability. Services are sequential: Service 0 at base, Service 1 at base+dur0, Service 2 at base+dur0+dur1, etc. */
  const getAvailableStaffList = (
    durationMinutes: number,
    includeIds?: string[],
    serviceIndex?: number
  ) => {
    let slotTimeStr = currentTimeStr
    let considerAll = false
    const baseTime = linkedAppointmentTime ?? currentTimeStr
    if (serviceIndex != null) {
      if (serviceIndex === 0) {
        slotTimeStr = baseTime
      } else {
        let cumulativeM = 0
        for (let i = 0; i < serviceIndex; i++) {
          const item = serviceItems[i]
          const raw = item?.serviceId
        const sid = typeof raw === "object" && raw && "_id" in raw ? (raw as { _id: string })._id : raw
          const svc = sid ? services.find((s) => (s._id || s.id) === sid) : null
          cumulativeM += svc?.duration ?? 60
        }
        const baseM = parseTimeToMinutes(baseTime)
        const slotM = baseM + cumulativeM
        slotTimeStr = `${Math.floor(slotM / 60)}:${String(slotM % 60).padStart(2, "0")}`
      }
    }
    if (linkedAppointmentId && linkedAppointmentTime) considerAll = true
    const availableIds = getAvailableStaffForSlot(durationMinutes, slotTimeStr, dateStr, considerAll)
    const includeSet = new Set(includeIds?.map(String) || [])
    const dayOfWeek = selectedDate.getDay() // 0 = Sunday, 6 = Saturday
    return staff.filter((s) => {
      const id = String(s._id || s.id)
      // Exclude staff marked as absent (Full Day Off) for this day in work schedule
      const daySchedule = (s.workSchedule || []).find((d: { day: number; enabled?: boolean }) => d.day === dayOfWeek)
      if (daySchedule && daySchedule.enabled === false) return false
      return availableIds.includes(id) || includeSet.has(id)
    })
  }

  // Fetch services, products, staff, clients, and business settings from API
  useEffect(() => {
    const fetchServices = async () => {
      try {
        console.log('Fetching services from API...')
        const response = await ServicesAPI.getAll({ limit: 1000 }) // Fetch up to 1000 services
        console.log('Services API response:', response)
        if (response.success) {
          setServices(response.data || [])
          console.log('Services loaded:', response.data?.length || 0)
        }
      } catch (error) {
        console.error('Failed to fetch services:', error)
      } finally {
        setLoadingServices(false)
      }
    }

    const fetchProducts = async () => {
      try {
        console.log('Fetching products from API...')
        const response = await ProductsAPI.getAll({ limit: 1000 }) // Fetch up to 1000 products
        console.log('Products API response:', response)
        if (response.success) {
          // Filter out service-only products (only show retail and both)
          const sellableProducts = (response.data || []).filter((product: any) => {
            const productType = product.productType || 'retail'
            return productType === 'retail' || productType === 'both'
          })
          setProducts(sellableProducts)
          console.log('Products loaded:', response.data?.length || 0)
          console.log('Sellable products (retail + both):', sellableProducts.length)
        } else {
          console.log('Products API returned unsuccessful response:', response)
          setProducts([])
        }
      } catch (error) {
        console.error('Failed to fetch products:', error)
        setProducts([]) // Ensure products array is empty on error
      } finally {
        setLoadingProducts(false)
      }
    }

    const fetchStaff = async () => {
      try {
        console.log('Fetching staff from API...')
        const response = await StaffDirectoryAPI.getAll()
        console.log('Staff API response:', response)
        if (response.success) {
          // Filter for active staff members with appointment scheduling enabled
          const staffMembers = response.data.filter((user: any) => {
            const hasValidId = user._id || user.id
            const isActiveStaff = (user.role === 'staff' || user.role === 'manager' || user.role === 'admin') && 
              user.isActive === true && 
              user.allowAppointmentScheduling === true
            console.log(`User ${user.name}: ID=${hasValidId}, Active=${isActiveStaff}, AppointmentScheduling=${user.allowAppointmentScheduling}`)
            return hasValidId && isActiveStaff
          })
          setStaff(staffMembers)
          console.log('Active staff loaded:', staffMembers.length)
          console.log('Active staff members:', staffMembers.map(s => ({ name: s.name, id: s._id || s.id, allowAppointmentScheduling: s.allowAppointmentScheduling })))
        } else {
          console.error('Staff API returned error:', response.error)
        }
      } catch (error) {
        console.error('Failed to fetch staff:', error)
      } finally {
        setLoadingStaff(false)
      }
    }

    const fetchBusinessSettings = async () => {
      try {
        console.log('Fetching business settings from API...')
        const response = await SettingsAPI.getBusinessSettings()
        console.log('Business settings API response:', response)
        if (response.success) {
          setBusinessSettings(response.data)
          console.log('Business settings loaded:', response.data)
        }
      } catch (error) {
        console.error('Failed to fetch business settings:', error)
      }
    }

    const fetchPOSSettings = async () => {
      try {
        console.log('Fetching POS settings from API...')
        const response = await SettingsAPI.getPOSSettings()
        console.log('POS settings API response:', response)
        if (response.success) {
          setPOSSettings(response.data)
          console.log('POS settings loaded:', response.data)
          console.log('Invoice prefix from POS settings:', response.data.invoicePrefix)
        } else {
          console.error('POS settings API returned error:', response.error)
        }
      } catch (error) {
        console.error('Failed to fetch POS settings:', error)
      }
    }

    const fetchPaymentSettings = async () => {
      try {
        console.log('Fetching payment settings from API...')
        const response = await SettingsAPI.getPaymentSettings()
        console.log('Payment settings API response:', response)
        if (response.success) {
          setPaymentSettings(response.data)
          console.log('Payment settings loaded:', response.data)
        } else {
          console.error('Payment settings API returned error:', response.error)
        }
      } catch (error) {
        console.error('Failed to fetch payment settings:', error)
      }
    }

    const fetchTaxSettings = async () => {
      try {
        console.log('Fetching tax settings from API...')
        const response = await SettingsAPI.getPaymentSettings()
        console.log('Tax settings API response:', response)
        if (response.success) {
          const taxSettingsData: TaxSettings = {
            enableTax: response.data.enableTax !== false,
            taxType: response.data.taxType || 'gst',
            serviceTaxRate: response.data.serviceTaxRate || 5,
            essentialProductRate: response.data.essentialProductRate || 5,
            intermediateProductRate: response.data.intermediateProductRate || 12,
            standardProductRate: response.data.standardProductRate || 18,
            luxuryProductRate: response.data.luxuryProductRate || 28,
            exemptProductRate: response.data.exemptProductRate || 0,
            cgstRate: response.data.cgstRate || 9,
            sgstRate: response.data.sgstRate || 9,
          }
          setTaxSettings(taxSettingsData)
          setTaxCalculator(createTaxCalculator(taxSettingsData))
          console.log('Tax settings loaded:', taxSettingsData)
        } else {
          console.error('Tax settings API returned error:', response.error)
        }
      } catch (error) {
        console.error('Failed to fetch tax settings:', error)
      }
    }

    const fetchClients = async () => {
      try {
        console.log('Fetching clients from API...')
        await clientStore.loadClients()
        const allClients = clientStore.getClients()
        setClients(allClients)
        console.log('Clients loaded:', allClients.length)
      } catch (error) {
        console.error('Failed to fetch clients:', error)
      } finally {
        setLoadingClients(false)
      }
    }

    fetchServices()
    fetchProducts()
    fetchStaff()
    fetchBusinessSettings()
    fetchPOSSettings()
    fetchPaymentSettings()
    fetchTaxSettings()
    fetchClients()
  }, [])

  // Fetch appointments and block times for selected date (for staff availability)
  useEffect(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    let cancelled = false
    const load = async () => {
      try {
        const [aptRes, blockRes] = await Promise.all([
          AppointmentsAPI.getAll({ date: dateStr, limit: 500 }),
          BlockTimeAPI.getAll({ startDate: dateStr, endDate: dateStr }),
        ])
        if (cancelled) return
        setAppointmentsForDate(aptRes?.success && aptRes?.data ? aptRes.data : [])
        setBlockTimesForDate(blockRes?.success && blockRes?.data ? blockRes.data : [])
      } catch (e) {
        if (!cancelled) {
          setAppointmentsForDate([])
          setBlockTimesForDate([])
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedDate])

  // Subscribe to client store changes
  useEffect(() => {
    const unsubscribe = clientStore.subscribe(() => {
      const updatedClients = clientStore.getClients()
      setClients(updatedClients)
    })

    return unsubscribe
  }, [])

  // Initialize from initialSale when in edit/exchange mode
  // Use loading flags (not length checks) so initialization runs even when business has empty catalogs
  useEffect(() => {
    const catalogsLoaded = !loadingServices && !loadingProducts && !loadingStaff && !loadingClients
    if ((mode === "edit" || mode === "exchange") && initialSale && !isInitialized && catalogsLoaded) {
      console.log("Initializing QuickSale from initialSale:", initialSale)
      
      // Set customer
      if (initialSale.customerId || initialSale.customerName) {
        const customer = clients.find(c => 
          (c._id || c.id) === initialSale.customerId ||
          c.name === initialSale.customerName
        )
        if (customer) {
          setSelectedCustomer(customer)
          setCustomerSearch(customer.name)

          // Fetch and populate real stats (visits, revenue, last visit, dues)
          const customerId = getCustomerId(customer)
          if (customerId) {
            fetchCustomerStats(customerId)
          }
        } else if (initialSale.customerName) {
          // Create a temporary client object if not found
          setSelectedCustomer({
            _id: initialSale.customerId || "",
            id: initialSale.customerId || "",
            name: initialSale.customerName,
            phone: initialSale.customerPhone || "",
            email: initialSale.customerEmail || "",
          } as Client)
          setCustomerSearch(initialSale.customerName)
        }
      }

      // Set date
      if (initialSale.date) {
        setSelectedDate(new Date(initialSale.date))
      }

      // Set items
      const serviceItemsData: ServiceItem[] = []
      const productItemsData: ProductItem[] = []

      if (initialSale.items && Array.isArray(initialSale.items)) {
        const normalizeId = (id: any) => (id != null ? String(id) : "")
        const normalizeName = (n: any) => (n || "").trim().toLowerCase()

        initialSale.items.forEach((item: any, index: number) => {
          if (item.type === "service") {
            const service = services.find(s =>
              normalizeId(s._id || s.id) === normalizeId(item.serviceId) ||
              normalizeName(s.name) === normalizeName(item.name)
            )
            if (service) {
              serviceItemsData.push({
                id: `service-${index}`,
                serviceId: service._id || service.id,
                staffId: item.staffId || "",
                staffContributions: item.staffContributions || [],
                quantity: item.quantity || 1,
                price: item.price || 0,
                discount: item.discount || 0,
                total: item.total || (item.price || 0) * (item.quantity || 1),
              })
            }
          } else if (item.type === "product") {
            const product = products.find(p =>
              normalizeId(p._id || p.id) === normalizeId(item.productId) ||
              normalizeName(p.name) === normalizeName(item.name)
            )
            if (product) {
              productItemsData.push({
                id: `product-${index}`,
                productId: product._id || product.id,
                staffId: item.staffId || "",
                quantity: item.quantity || 1,
                price: item.price || 0,
                discount: item.discount || 0,
                total: item.total || (item.price || 0) * (item.quantity || 1),
              })
            }
          }
        })
      }

      setServiceItems(serviceItemsData)
      setProductItems(productItemsData)

      // Set discount (percentage = global %, fixed = amount in currency)
      if (initialSale.discount && initialSale.discount > 0) {
        const dType = (initialSale.discountType || "percentage").toLowerCase()
        if (dType === "percentage") {
          // Sanity: percentage should be 0-100; if >100 likely legacy bug (amount stored as %)
          const val = Number(initialSale.discount)
          if (val <= 100) {
            setDiscountPercentage(val)
            setIsGlobalDiscountActive(true)
          } else {
            setDiscountValue(val)
            setIsValueDiscountActive(true)
          }
        } else {
          setDiscountValue(Number(initialSale.discount))
          setIsValueDiscountActive(true)
        }
      }

      // Set notes
      if (initialSale.notes) {
        setRemarks(initialSale.notes)
      }

      // Set payment amounts (if any)
      if (initialSale.payments && Array.isArray(initialSale.payments)) {
        let cash = 0
        let card = 0
        let online = 0
        
        initialSale.payments.forEach((payment: any) => {
          const mode = (payment.mode || payment.type || "").toLowerCase()
          const amount = payment.amount || 0
          if (mode.includes("cash")) cash += amount
          else if (mode.includes("card")) card += amount
          else if (mode.includes("online") || mode.includes("upi")) online += amount
        })
        
        setCashAmount(cash)
        setCardAmount(card)
        setOnlineAmount(online)
      }

      // Set tip amount and tip staff (if any)
      if (initialSale.tip && initialSale.tip > 0) {
        setTip(Number(initialSale.tip))
        const tipStaff = initialSale.tipStaffId
        const tipStaffIdStr = typeof tipStaff === "object" && tipStaff?._id ? tipStaff._id : String(tipStaff || "")
        if (tipStaffIdStr) {
          setTipStaffId(tipStaffIdStr)
        }
      }

      // Set linked appointment
      if (initialSale.appointmentId) {
        setLinkedAppointmentId(initialSale.appointmentId)
      }

      setIsInitialized(true)
      console.log("QuickSale initialized from initialSale")
    }
  }, [mode, initialSale, isInitialized, services, products, staff, clients, loadingServices, loadingProducts, loadingStaff, loadingClients])

  // Pre-fill form from appointment data in URL
  useEffect(() => {
    const appointmentParam = searchParams.get('appointment')
    if (!appointmentParam || services.length === 0 || clients.length === 0 || staff.length === 0) return

    const prefillAppointmentData = async () => {
      try {
        // Decode the base64 appointment data
        const appointmentData = JSON.parse(atob(appointmentParam))
        console.log('Pre-filling from appointment:', appointmentData)

        if (appointmentData.appointmentId || appointmentData.appointmentID || appointmentData.id) {
          setLinkedAppointmentId(appointmentData.appointmentId || appointmentData.appointmentID || appointmentData.id)
        }
        if (appointmentData.time) {
          setLinkedAppointmentTime(appointmentData.time)
        }

        // Find and set the client
        if (appointmentData.clientId) {
          const client = clients.find(c => c._id === appointmentData.clientId || c.id === appointmentData.clientId)
          if (client) {
            setSelectedCustomer(client)
            setCustomerSearch(client.name)
            console.log('Pre-filled client:', client.name)
            
            // Fetch customer statistics (visits, revenue, last visit)
            const customerId = client._id || client.id
            if (customerId) {
              await fetchCustomerStats(customerId)
              console.log('Fetched customer stats for pre-filled client')
            }
          } else if (appointmentData.clientName) {
            // Client not in list (e.g. from new appointment form before sync) - use passed data
            setSelectedCustomer({
              _id: appointmentData.clientId,
              id: appointmentData.clientId,
              name: appointmentData.clientName,
              phone: appointmentData.clientPhone || "",
              email: appointmentData.clientEmail || "",
            } as Client)
            setCustomerSearch(appointmentData.clientName)
          }
        }

        // Set date and notes from new appointment form
        if (appointmentData.date) {
          setSelectedDate(new Date(appointmentData.date))
        }
        if (appointmentData.notes) {
          setRemarks(appointmentData.notes)
        }

        // Find and add service(s) - support both single service (from calendar) and multiple (from new appointment form)
        const serviceItemsToAdd: ServiceItem[] = []

        if (appointmentData.services && Array.isArray(appointmentData.services) && appointmentData.services.length > 0) {
          // Multiple services from new appointment form
          for (const svcData of appointmentData.services) {
            const service = services.find(s =>
              (s._id || s.id) === svcData.serviceId
            )
            if (service) {
              const staffMember = staff.find(s =>
                (s._id || s.id) === svcData.staffId
              )
              serviceItemsToAdd.push({
                id: Date.now().toString() + Math.random(),
                serviceId: service._id || service.id,
                staffId: svcData.staffId || "",
                quantity: 1,
                price: svcData.price ?? service.price ?? 0,
                discount: 0,
                total: svcData.price ?? service.price ?? 0,
                staffContributions: (svcData.staffId && staffMember) ? [{
                  staffId: svcData.staffId,
                  staffName: staffMember.name || svcData.staffName || "",
                  percentage: 100,
                  amount: svcData.price ?? service.price ?? 0
                }] : []
              })
              console.log("Pre-filled service:", service.name)
            }
          }
        } else if (appointmentData.serviceId) {
          // Single service from calendar / existing appointment
          const service = services.find(s =>
            (s._id || s.id) === appointmentData.serviceId
          )
          if (service) {
            const staffMember = staff.find(s =>
              (s._id || s.id) === appointmentData.staffId
            )
            serviceItemsToAdd.push({
              id: Date.now().toString(),
              serviceId: service._id || service.id,
              staffId: appointmentData.staffId || "",
              quantity: 1,
              price: service.price || appointmentData.servicePrice || 0,
              discount: 0,
              total: service.price || appointmentData.servicePrice || 0,
              staffContributions: (appointmentData.staffId && staffMember) ? [{
                staffId: appointmentData.staffId,
                staffName: staffMember.name || appointmentData.staffName || "",
                percentage: 100,
                amount: service.price || appointmentData.servicePrice || 0
              }] : []
            })
            console.log("Pre-filled service:", service.name)
          }
        }

        if (serviceItemsToAdd.length > 0) {
          setServiceItems(serviceItemsToAdd)
        }

        // Clear the URL parameter after reading it
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('appointment')
          window.history.replaceState({}, '', url.toString())
        }
      } catch (error) {
        console.error('Failed to parse appointment data:', error)
      }
    }
    
    // Call the async function
    prefillAppointmentData()
  }, [searchParams, services, clients, staff])

  // Pre-fill form from lead data in URL
  useEffect(() => {
    const leadParam = searchParams.get('lead')
    if (!leadParam || services.length === 0 || clients.length === 0 || staff.length === 0) return

    const prefillLeadData = async () => {
      try {
        // Decode the base64 lead data
        const leadData = JSON.parse(atob(leadParam))
        console.log('Pre-filling from lead:', leadData)

        // Try to find existing client by phone or name
        let client = clients.find(c => 
          c.phone === leadData.clientPhone || 
          c.name?.toLowerCase() === leadData.clientName?.toLowerCase()
        )

        if (client) {
          // Client exists, set it
          setSelectedCustomer(client)
          setCustomerSearch(client.name)
          console.log('Pre-filled existing client:', client.name)
          
          // Fetch customer statistics
          const customerId = client._id || client.id
          if (customerId) {
            await fetchCustomerStats(customerId)
            console.log('Fetched customer stats for pre-filled client')
          }
        } else {
          // Client doesn't exist, pre-fill the search with lead info
          setCustomerSearch(`${leadData.clientName} (${leadData.clientPhone})`)
          console.log('Pre-filled customer search with lead info')
        }

        // Add services from lead's interested services
        if (leadData.services && leadData.services.length > 0) {
          const serviceItemsToAdd: ServiceItem[] = []
          
          for (const serviceData of leadData.services) {
            const service = services.find(s => 
              (s._id || s.id) === serviceData.serviceId
            )
            
            if (service) {
              // Find staff member if available
              const staffMember = leadData.staffId 
                ? staff.find(s => (s._id || s.id) === leadData.staffId)
                : null
              
              const newServiceItem: ServiceItem = {
                id: Date.now().toString() + Math.random(),
                serviceId: service._id || service.id,
                staffId: leadData.staffId || "",
                quantity: 1,
                price: service.price || 0,
                discount: 0,
                total: service.price || 0,
                staffContributions: (leadData.staffId && staffMember) ? [{
                  staffId: leadData.staffId,
                  staffName: staffMember.name || '',
                  percentage: 100,
                  amount: service.price || 0
                }] : []
              }
              
              serviceItemsToAdd.push(newServiceItem)
              console.log('Pre-filled service:', service.name)
            }
          }
          
          if (serviceItemsToAdd.length > 0) {
            setServiceItems(serviceItemsToAdd)
          }
        }

        // Clear the URL parameter after reading it
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('lead')
          window.history.replaceState({}, '', url.toString())
        }
      } catch (error) {
        console.error('Failed to parse lead data:', error)
      }
    }
    
    // Call the async function
    prefillLeadData()
  }, [searchParams, services, clients, staff])

  // In production, prefill data should come from URL params or API
  // No localStorage dependency for critical business functionality

  // Once services load, if we have a prefilled serviceId, trigger price autofill
  useEffect(() => {
    if (services.length === 0 || serviceItems.length === 0) return
    const first = serviceItems[0]
    if (!first.serviceId) return
    const svc = services.find((s) => s._id === first.serviceId || s.id === first.serviceId)
    if (svc) {
      // Reuse existing update logic to compute price/total
      updateServiceItem(first.id, 'serviceId' as any, first.serviceId)
    }
  }, [services])

  // Filter customers based on search (matches from start)
  const filteredCustomers = clients.filter(
    (client) =>
      client.name.toLowerCase().startsWith(customerSearch.toLowerCase()) ||
      client.phone.startsWith(customerSearch) ||
      (client.email && client.email.toLowerCase().startsWith(customerSearch.toLowerCase())),
  )

  // Get the correct customer ID (handles both id and _id properties)
  const getCustomerId = (customer: Client | null): string | null => {
    if (!customer) {
      console.log('❌ No customer provided to getCustomerId')
      return null
    }
    
    const id = customer._id || customer.id || null
    console.log('🔍 Customer object:', customer)
    console.log('🔑 Customer ID (_id):', customer._id)
    console.log('🔑 Customer ID (id):', customer.id)
    console.log('🔑 Final ID resolved:', id)
    
    return id
  }

  // Handle customer selection with statistics fetch
  const handleCustomerSelect = async (customer: Client) => {
    console.log('🔍 Customer selected:', customer)
    console.log('🔑 Customer ID (id):', customer.id)
    console.log('🔑 Customer ID (_id):', customer._id)
    console.log('🔑 Final ID to use:', getCustomerId(customer))
    
    // Validate that the customer has a valid ID
    const customerId = getCustomerId(customer)
    if (!customerId) {
      console.error('❌ Customer selected but no valid ID found:', customer)
      toast({
        title: "Invalid Customer",
        description: "Selected customer has no valid ID. Please try selecting again.",
        variant: "destructive",
      })
      return
    }
    
    setSelectedCustomer(customer)
    setCustomerSearch(customer.name)
    setShowCustomerDropdown(false)
    
    // Fetch customer statistics when customer is selected
    await fetchCustomerStats(customerId)
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
      // Allow empty string
      setCustomerSearch(value)
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
    }
  }

  // Handle creating new customer
  const handleCreateNewCustomer = () => {
    console.log('🎯 Create new customer clicked!')
    console.log('🎯 Customer search value:', customerSearch)
    console.log('🎯 Current showNewCustomerDialog state:', showNewCustomerDialog)
    
    setNewCustomer({
      firstName: "",
      lastName: "",
      phone: customerSearch,
      email: "",
    })
    setShowNewCustomerDialog(true)
    setShowCustomerDropdown(false)
    
    console.log('🎯 Set showNewCustomerDialog to true')
  }

  // Handle saving new customer
  const handleSaveNewCustomer = async () => {
    if (!newCustomer.firstName) {
      toast({
        title: "Missing Information",
        description: "Please provide a first name.",
        variant: "destructive",
      })
      return
    }

    // Validate phone number - must be exactly 10 digits
    const phoneNumber = newCustomer.phone || customerSearch
    if (!phoneNumber || !/^\d{10}$/.test(phoneNumber)) {
      toast({
        title: "Invalid Phone Number",
        description: "Phone number must be exactly 10 digits.",
        variant: "destructive",
      })
      return
    }

    const customer: Client = {
      id: Date.now().toString(),
      name: newCustomer.lastName ? `${newCustomer.firstName} ${newCustomer.lastName}` : newCustomer.firstName,
      phone: phoneNumber,
      email: newCustomer.email,
      totalVisits: 0,
      totalSpent: 0,
      createdAt: new Date().toISOString(),
      status: "active",
    }

    try {
      // Add to client store (which will save to API)
      const success = await clientStore.addClient(customer)
      
      if (success) {
        // Refresh clients list
        await clientStore.loadClients()
        const updatedClients = clientStore.getClients()
        setClients(updatedClients)
        
        // Find the newly created client (it will have the API-generated ID)
        const newClient = updatedClients.find(c => 
          c.name === customer.name && c.phone === customer.phone
        )
        
        if (newClient) {
          // Select the new customer
          setSelectedCustomer(newClient)
          setCustomerSearch(newClient.name)
        }
        
        setShowNewCustomerDialog(false)

        // Reset form
        setNewCustomer({
          firstName: "",
          lastName: "",
          phone: "",
          email: "",
        })

        toast({
          title: "Customer Created",
          description: "New customer has been successfully created and selected.",
        })
      } else {
        toast({
          title: "Error",
          description: "Failed to create customer. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error creating customer:', error)
      toast({
        title: "Error",
        description: "Failed to create customer. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handle viewing bill activity
  const handleViewBillActivity = async () => {
    const customerId = getCustomerId(selectedCustomer)
    if (customerId) {
      try {
        // First get the customer object to get the name
        const customer = clients.find(c => (c._id || c.id) === customerId)
        if (!customer) {
          console.error('❌ Customer not found in clients list:', customerId)
          toast({
            title: "Error",
            description: "Customer not found. Please try again.",
            variant: "destructive",
          })
          return
        }
        
        console.log('👤 Fetching bills for customer:', customer.name)
        
        // Get sales data for this customer by name
        const salesResponse = await SalesAPI.getByClient(customer.name)
        if (salesResponse.success) {
          // Transform sales data to match the expected bill format
          const bills = salesResponse.data.map((sale: any) => ({
            id: sale._id || sale.id,
            receiptNumber: sale.billNo,
            date: sale.date,
            time: sale.time || '00:00',
            total: sale.grossTotal || sale.netTotal || 0,
            payments: sale.payments || [{ type: sale.paymentMode?.toLowerCase() || 'cash', amount: sale.grossTotal || sale.netTotal || 0 }],
            items: sale.items || [],
            notes: sale.notes || '',
            clientName: sale.customerName,
            staffName: sale.staffName || 'Unassigned Staff'
          }))
          
          setCustomerBills(bills)
          console.log('📋 Transformed bills:', bills)
        } else {
          console.error('Failed to fetch customer sales:', salesResponse.error)
          toast({
            title: "Error",
            description: "Failed to fetch customer bills. Please try again.",
            variant: "destructive",
          })
        }
      } catch (error) {
        console.error('Error fetching customer bills:', error)
        toast({
          title: "Error",
          description: "Failed to fetch customer bills. Please try again.",
          variant: "destructive",
        })
      }
      setShowBillActivityDialog(true)
    } else {
      toast({
        title: "Error",
        description: "Invalid customer ID. Please select a customer again.",
        variant: "destructive",
      })
    }
  }

  // Fetch unpaid/partially paid bills for the customer
  const fetchUnpaidBills = async (customerName: string) => {
    try {
      const salesResponse = await SalesAPI.getByClient(customerName)
      if (salesResponse.success) {
        const sales = salesResponse.data || []
        
        // Filter only unpaid or partially paid bills
        const unpaid = sales.filter((sale: any) => {
          const remainingAmount = sale.paymentStatus?.remainingAmount || 0
          return remainingAmount > 0
        }).map((sale: any) => ({
          _id: sale._id || sale.id,
          id: sale._id || sale.id,
          billNo: sale.billNo,
          date: sale.date,
          time: sale.time || '00:00',
          grossTotal: sale.grossTotal || sale.netTotal || 0,
          totalAmount: sale.grossTotal || sale.netTotal || 0,
          paidAmount: sale.paymentStatus?.paidAmount || 0,
          remainingAmount: sale.paymentStatus?.remainingAmount || 0,
          dueDate: sale.paymentStatus?.dueDate,
          items: sale.items || [],
          customerName: sale.customerName,
          staffName: sale.staffName || 'Unassigned Staff',
          status: sale.paymentStatus?.status || 'partial',
          paymentStatus: sale.paymentStatus,
          paymentHistory: sale.paymentHistory || []
        }))
        
        setUnpaidBills(unpaid)
      }
    } catch (error) {
      console.error('Error fetching unpaid bills:', error)
      toast({
        title: "Error",
        description: "Failed to fetch unpaid bills. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handle collect payment button click
  const handleCollectPayment = (bill: any) => {
    setSelectedBillForPayment(bill)
    setShowDuesDialog(false) // Close dues dialog first
    setShowDuesPaymentModal(true)
  }

  // Handle payment collected successfully
  const handlePaymentCollected = async () => {
    // Refresh unpaid bills list
    if (selectedCustomer) {
      await fetchUnpaidBills(selectedCustomer.name)
      // Refresh customer stats to update dues amount
      const customerId = getCustomerId(selectedCustomer)
      if (customerId) {
        await fetchCustomerStats(customerId)
      }
    }
    // Close payment modal and reopen dues dialog
    setShowDuesPaymentModal(false)
    setSelectedBillForPayment(null)
    setShowDuesDialog(true)
  }

  // Fetch membership when customer is selected
  useEffect(() => {
    const customerId = getCustomerId(selectedCustomer)
    if (!customerId) {
      setMembershipData(null)
      return
    }
    MembershipAPI.getByCustomer(customerId)
      .then((res) => {
        if (res.success && res.data) setMembershipData(res.data as any)
        else setMembershipData(null)
      })
      .catch(() => setMembershipData(null))
  }, [selectedCustomer])

  // Fetch plans when customer is selected (for Membership section)
  useEffect(() => {
    if (!selectedCustomer) {
      setPlans([])
      return
    }
    MembershipAPI.getPlans({ isActive: true })
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setPlans(res.data)
        else setPlans([])
      })
      .catch(() => setPlans([]))
  }, [selectedCustomer])

  // Apply membership pricing to service items when membership loads or changes
  // Price = base cost, Disc(%) = membership discount, Total = price after discount
  useEffect(() => {
    if (!membershipData?.plan) {
      // When no membership, reset any membership-applied discounts to base price
      setServiceItems((items) =>
        items.map((item) => {
          if (!item.serviceId || (!item.isMembershipFree && (item.membershipDiscountPercent ?? 0) === 0)) return item
          const service = services.find((s) => (s._id || s.id) === item.serviceId)
          const basePrice = service?.price ?? item.price
          const baseAmount = basePrice * item.quantity
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const applyTax = isServiceTaxable(item)
          const { total } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
          return { ...item, price: basePrice, discount: 0, total, isMembershipFree: false, membershipDiscountPercent: 0 }
        })
      )
      return
    }
    const usageMap = new Map(membershipData.usageSummary.map((u: any) => [u.serviceId, u]))
    const plan = membershipData.plan
    const discountPct = plan?.discountPercentage || 0

    setServiceItems((items) => {
      const remaining: Record<string, number> = {}
      usageMap.forEach((u: any, sid: string) => { remaining[sid] = u.remaining })

      return items.map((item) => {
        if (!item.serviceId) return item
        const sid = String(item.serviceId)
        const u = usageMap.get(sid)
        const service = services.find((s) => (s._id || s.id) === item.serviceId)
        const basePrice = service?.price ?? item.price

        if (u && remaining[sid] > 0 && item.quantity <= remaining[sid]) {
          remaining[sid] -= item.quantity
          return { ...item, price: basePrice, total: 0, discount: 100, isMembershipFree: true, membershipDiscountPercent: 100 }
        }
        if (discountPct > 0 && !item.isMembershipFree) {
          const baseAmount = basePrice * item.quantity
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const applyTax = service?.taxApplicable && taxSettings?.enableTax !== false
          const { total } = computeLineTotalAndTax(baseAmount, discountPct, serviceTaxRate, applyTax)
          return { ...item, price: basePrice, total, discount: discountPct, membershipDiscountPercent: discountPct }
        }
        return item
      })
    })
  }, [membershipData, paymentSettings?.priceInclusiveOfTax])

  // Fetch customer statistics including visits, revenue, and last visit
  const fetchCustomerStats = async (customerId: string) => {
    console.log('🔍 Fetching customer stats for ID:', customerId)
    try {
      // First get the customer object to get the name
      const customer = clients.find(c => (c._id || c.id) === customerId)
      if (!customer) {
        console.error('❌ Customer not found in clients list:', customerId)
        return
      }
      
      console.log('👤 Customer found:', customer.name)
      
      // Get sales data for this customer by name
      const salesResponse = await SalesAPI.getByClient(customer.name)
      console.log('📊 Sales API response:', salesResponse)
      
      if (salesResponse.success) {
        const sales = salesResponse.data || []
        const totalVisits = sales.length
        const totalRevenue = sales.reduce((sum: number, sale: any) => sum + (sale.grossTotal || sale.netTotal || 0), 0)
        const lastVisit = sales.length > 0 ? sales[0]?.date : null // Sales are sorted by date desc, so first is most recent
        
        // Calculate total dues (unpaid + partially paid)
        const totalDues = sales.reduce((sum: number, sale: any) => {
          const remainingAmount = sale.paymentStatus?.remainingAmount || 0
          
          // Count any sale with remaining amount > 0
          if (remainingAmount > 0) {
            return sum + remainingAmount
          }
          return sum
        }, 0)
        
        // Update the customer object with real statistics
        setSelectedCustomer(prev => prev ? {
          ...prev,
          totalVisits,
          totalSpent: totalRevenue,
          lastVisit,
          totalDues
        } : null)
      } else {
        console.error('❌ Failed to fetch sales data:', salesResponse.error)
      }
    } catch (error) {
      console.error('❌ Error fetching customer statistics:', error)
    }
  }

  // Fetch customer bills for Bill Activity dialog
  const fetchCustomerBills = async (customerName: string) => {
    console.log('🔍 fetchCustomerBills called with:', customerName)
    try {
      console.log('🔍 Calling SalesAPI.getByClient...')
      const salesResponse = await SalesAPI.getByClient(customerName)
      console.log('📊 Customer bills API response:', salesResponse)
      
      if (salesResponse.success) {
        const sales = salesResponse.data || []
        console.log('📊 Sales data received:', sales)
        console.log('📊 Sales response full data:', salesResponse.data)
        console.log('📊 Sales array length:', sales.length)
        
        // Transform sales data to match the expected bill format
        const bills = sales.map((sale: any) => ({
          id: sale._id || sale.id,
          receiptNumber: sale.billNo,
          date: sale.date,
          time: sale.time || '00:00',
          total: sale.grossTotal || sale.netTotal || 0,
          payments: sale.payments || [{ type: sale.paymentMode?.toLowerCase() || 'cash', amount: sale.grossTotal || sale.netTotal || 0 }],
          items: sale.items || [],
          notes: sale.notes || '',
          clientName: sale.customerName,
          staffName: sale.staffName || 'Unassigned Staff'
        }))
        
        console.log('📋 Transformed bills:', bills)
        setCustomerBills(bills)
        console.log('📋 Customer bills state updated')
      } else {
        console.error('❌ Failed to fetch customer bills:', salesResponse.error)
        setCustomerBills([])
      }
    } catch (error) {
      console.error('❌ Error fetching customer bills:', error)
      setCustomerBills([])
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Handle discount state flags
  useEffect(() => {
    if (discountPercentage > 0) {
      setIsGlobalDiscountActive(true)
      setIsValueDiscountActive(false)
    } else if (discountValue > 0) {
      setIsValueDiscountActive(true)
      setIsGlobalDiscountActive(false)
    } else {
      setIsGlobalDiscountActive(false)
      setIsValueDiscountActive(false)
    }
  }, [discountPercentage, discountValue])

  // Function to recalculate discounts
  const recalculateDiscounts = () => {
    console.log('🔄 Recalculating discounts...', { discountValue, discountPercentage, serviceItems: serviceItems.length, productItems: productItems.length })
    console.log('📋 Current service items:', serviceItems)
    console.log('📋 Current product items:', productItems)
    
    if (discountValue > 0) {
      // Value discount logic
      const serviceItemsWithGST = serviceItems.map(item => {
        const baseAmount = item.price * item.quantity
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = isServiceTaxable(item)
        const { total } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
        return { ...item, totalWithGST: total }
      })
      
      const productItemsWithGST = productItems.map(item => {
        const baseAmount = item.price * item.quantity
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        let productTaxRate = 18
        if (product?.taxCategory && taxSettings) {
          switch (product.taxCategory) {
            case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
            case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
            case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
            case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
            case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
          }
        }
        const applyTax = taxSettings?.enableTax !== false
        const { total } = computeLineTotalAndTax(baseAmount, 0, productTaxRate, applyTax)
        return { ...item, totalWithGST: total }
      })
      
      const totalPayableAmount = serviceItemsWithGST.reduce((sum, item) => sum + item.totalWithGST, 0) + 
                                productItemsWithGST.reduce((sum, item) => sum + item.totalWithGST, 0)
      
      if (totalPayableAmount > 0) {
        setServiceItems(prev => prev.map((item, index) => {
          const baseAmount = item.price * item.quantity
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const applyTax = isServiceTaxable(item)
          const { total: totalWithGST } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
          const proportionalDiscountValue = (totalWithGST / totalPayableAmount) * discountValue
          const proportionalDiscountPercentage = (proportionalDiscountValue / totalWithGST) * 100
          const finalTotal = totalWithGST - proportionalDiscountValue
          
          console.log(`🔧 Service item ${index + 1} calculation:`, {
            id: item.id,
            serviceId: item.serviceId,
            price: item.price,
            quantity: item.quantity,
            baseAmount,
            totalWithGST,
            proportionalDiscountValue,
            proportionalDiscountPercentage,
            finalTotal,
            totalPayableAmount
          })
          
          return { ...item, discount: proportionalDiscountPercentage, total: finalTotal }
        }))
        
        console.log('✅ Service items updated with new totals')
        
        setProductItems(prev => prev.map(item => {
          const baseAmount = item.price * item.quantity
          const product = products.find((p) => p._id === item.productId || p.id === item.productId)
          let productTaxRate = 18
          if (product?.taxCategory && taxSettings) {
            switch (product.taxCategory) {
              case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
              case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
              case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
              case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
              case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
            }
          }
          const applyTax = taxSettings?.enableTax !== false
          const { total: totalWithGST } = computeLineTotalAndTax(baseAmount, 0, productTaxRate, applyTax)
          const proportionalDiscountValue = (totalWithGST / totalPayableAmount) * discountValue
          const proportionalDiscountPercentage = (proportionalDiscountValue / totalWithGST) * 100
          const finalTotal = totalWithGST - proportionalDiscountValue
          return { ...item, discount: proportionalDiscountPercentage, total: finalTotal }
        }))
      }
    } else if (discountPercentage > 0) {
      // Percentage discount logic
      const serviceItemsWithGST = serviceItems.map(item => {
        const baseAmount = item.price * item.quantity
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = isServiceTaxable(item)
        const { total } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
        return { ...item, totalWithGST: total }
      })
      
      const productItemsWithGST = productItems.map(item => {
        const baseAmount = item.price * item.quantity
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        let productTaxRate = 18
        if (product?.taxCategory && taxSettings) {
          switch (product.taxCategory) {
            case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
            case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
            case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
            case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
            case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
          }
        }
        const applyTax = taxSettings?.enableTax !== false
        const { total } = computeLineTotalAndTax(baseAmount, 0, productTaxRate, applyTax)
        return { ...item, totalWithGST: total }
      })
      
      const totalPayableAmount = serviceItemsWithGST.reduce((sum, item) => sum + item.totalWithGST, 0) + 
                                productItemsWithGST.reduce((sum, item) => sum + item.totalWithGST, 0)
      
      const totalDiscountAmount = (totalPayableAmount * discountPercentage) / 100
      
      setServiceItems(prev => prev.map(item => {
        const baseAmount = item.price * item.quantity
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = isServiceTaxable(item)
        const { total: totalWithGST } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
        const proportionalDiscountValue = (totalWithGST / totalPayableAmount) * totalDiscountAmount
        const proportionalDiscountPercentage = (proportionalDiscountValue / totalWithGST) * 100
        const finalTotal = totalWithGST - proportionalDiscountValue
        
        console.log('🔧 Service item calculation (percentage):', {
          name: item.serviceId,
          baseAmount,
          totalWithGST,
          proportionalDiscountValue,
          proportionalDiscountPercentage,
          finalTotal
        })
        
        return { ...item, discount: proportionalDiscountPercentage, total: finalTotal }
      }))
      
      setProductItems(prev => prev.map(item => {
        const baseAmount = item.price * item.quantity
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        let productTaxRate = 18
        if (product?.taxCategory && taxSettings) {
          switch (product.taxCategory) {
            case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
            case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
            case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
            case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
            case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
          }
        }
        const applyTax = taxSettings?.enableTax !== false
        const { total: totalWithGST } = computeLineTotalAndTax(baseAmount, 0, productTaxRate, applyTax)
        const proportionalDiscountValue = (totalWithGST / totalPayableAmount) * totalDiscountAmount
        const proportionalDiscountPercentage = (proportionalDiscountValue / totalWithGST) * 100
        const finalTotal = totalWithGST - proportionalDiscountValue
        return { ...item, discount: proportionalDiscountPercentage, total: finalTotal }
      }))
    } else {
      // No global discount - keep line-level discounts (item.discount) and compute totals
      setServiceItems(prev => prev.map(item => {
        const baseAmount = item.price * item.quantity
        const itemDiscPct = item.discount || 0
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = isServiceTaxable(item)
        const { total } = computeLineTotalAndTax(baseAmount, itemDiscPct, serviceTaxRate, applyTax)
        return { ...item, discount: itemDiscPct, total }
      }))
      
      setProductItems(prev => prev.map(item => {
        const baseAmount = item.price * item.quantity
        const itemDiscPct = item.discount || 0
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        let productTaxRate = 18
        if (product?.taxCategory && taxSettings) {
          switch (product.taxCategory) {
            case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
            case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
            case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
            case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
            case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
          }
        }
        const applyTax = taxSettings?.enableTax !== false
        const { total } = computeLineTotalAndTax(baseAmount, itemDiscPct, productTaxRate, applyTax)
        return { ...item, discount: itemDiscPct, total }
      }))
    }
  }

  // Recalculate discounts when discount values or tax settings change
  useEffect(() => {
    recalculateDiscounts()
  }, [discountValue, discountPercentage, taxSettings, paymentSettings?.priceInclusiveOfTax])

  // Log when service items change
  useEffect(() => {
    console.log('🔄 Service items state changed:', serviceItems.map(item => ({
      id: item.id,
      price: item.price,
      quantity: item.quantity,
      total: item.total,
      discount: item.discount
    })))
  }, [serviceItems])

  // Recalculate discounts when item properties change (but avoid infinite loops)
  useEffect(() => {
    if (discountValue > 0 || discountPercentage > 0) {
      // Use setTimeout to avoid infinite loops
      const timeoutId = setTimeout(() => {
        recalculateDiscounts()
      }, 0)
      return () => clearTimeout(timeoutId)
    }
  }, [serviceItems.map(item => `${item.price}-${item.quantity}-${item.serviceId}`).join(','), 
       productItems.map(item => `${item.price}-${item.quantity}-${item.productId}`).join(',')])

  // Add service item
  const addServiceItem = () => {
    const newItem: ServiceItem = {
      id: Date.now().toString(),
      serviceId: "",
      staffId: "",
      quantity: 1,
      price: 0,
      discount: 0,
      total: 0,
      staffContributions: [],
    }
    setServiceItems([...serviceItems, newItem])
    
    // Recalculate discounts after adding new item
    setTimeout(() => {
      recalculateDiscounts()
    }, 0)
  }

  // Add product item
  const addProductItem = () => {
    // Check if products are still loading
    if (loadingProducts) {
      toast({
        title: "Loading Products",
        description: "Please wait while products are being loaded...",
        variant: "default",
      })
      return
    }
    
    // Check if there are any products available
    if (products.length === 0) {
      toast({
        title: "No Products Available",
        description: "Please add products to the inventory first.",
        variant: "destructive",
      })
      return
    }

    const newItem: ProductItem = {
      id: Date.now().toString(),
      productId: "",
      staffId: "",
      quantity: 1,
      price: 0,
      discount: 0,
      total: 0,
    }
    setProductItems([...productItems, newItem])
    
    // Recalculate discounts after adding new item
    setTimeout(() => {
      recalculateDiscounts()
    }, 0)
  }

  // Add membership item
  const addMembershipItem = () => {
    if (plans.length === 0) {
      toast({
        title: "No Plans Available",
        description: "Select a customer first, or add membership plans in settings.",
        variant: "destructive",
      })
      return
    }
    const newItem: MembershipItem = {
      id: Date.now().toString(),
      planId: "",
      staffId: "",
      planName: "",
      price: 0,
      durationInDays: 0,
      quantity: 1,
      total: 0,
    }
    setMembershipItems([...membershipItems, newItem])
  }

  // Remove membership item
  const removeMembershipItem = (id: string) => {
    setMembershipItems((items) => items.filter((item) => item.id !== id))
  }

  // Update membership item
  const updateMembershipItem = (id: string, field: keyof MembershipItem, value: any) => {
    setMembershipItems((items) =>
      items.map((item) => {
        if (item.id !== id) return item
        const updated = { ...item, [field]: value }
        if (field === "planId" && value) {
          const plan = plans.find((p) => (p._id || p.id) === value)
          if (plan) {
            updated.planName = plan.planName
            updated.price = plan.price ?? 0
            updated.durationInDays = plan.durationInDays ?? 0
            updated.total = updated.price * updated.quantity
          }
        } else if (field === "quantity") {
          updated.total = updated.price * updated.quantity
        }
        return updated
      })
    )
  }

  // Update service item
  const updateServiceItem = (id: string, field: keyof ServiceItem, value: any) => {
    console.log('=== UPDATE SERVICE ITEM ===')
    console.log('Service ID:', id)
    console.log('Field:', field)
    console.log('Value:', value)
    setServiceItems((items) =>
      items.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value }

          // Auto-fill price when service is selected (Price = base cost, Disc = membership discount %, Total = after discount)
          if (field === "serviceId" && value) {
            const service = services.find((s) => s._id === value || s.id === value)
            if (service) {
              const basePrice = service.price ?? 0
              let discount = 0
              let isMembershipFree = false
              let membershipDiscountPercent = 0

              if (membershipData?.plan && membershipData?.usageSummary) {
                const usage = membershipData.usageSummary.find((u: any) => String(u.serviceId || u.serviceId?._id) === String(value))
                const plan = membershipData.plan
                if (usage && usage.remaining > 0) {
                  discount = 100
                  isMembershipFree = true
                  membershipDiscountPercent = 100
                } else if (plan?.discountPercentage > 0) {
                  discount = plan.discountPercentage
                  membershipDiscountPercent = plan.discountPercentage
                }
              }

              updatedItem.price = basePrice
              updatedItem.discount = discount
              updatedItem.isMembershipFree = isMembershipFree
              updatedItem.membershipDiscountPercent = membershipDiscountPercent
            }
          }

          // Calculate total (Inclusive: price has tax; Excluded: add tax on top)
          const baseAmount = updatedItem.price * updatedItem.quantity
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const applyTax = isServiceTaxable(updatedItem)
          if (field === 'discount') {
            const itemDiscountPct = Number(value) || 0
            const { total } = computeLineTotalAndTax(baseAmount, itemDiscountPct, serviceTaxRate, applyTax)
            updatedItem.total = total
          } else if (discountValue === 0 && discountPercentage === 0) {
            const { total } = computeLineTotalAndTax(baseAmount, updatedItem.discount ?? 0, serviceTaxRate, applyTax)
            updatedItem.total = total
          }

          return updatedItem
        }
        return item
      }),
    )
  }

  // Update product item
  const updateProductItem = (id: string, field: keyof ProductItem, value: any) => {
    console.log('=== UPDATE PRODUCT ITEM ===')
    console.log('Product ID:', id)
    console.log('Field:', field)
    console.log('Value:', value)
    setProductItems((items) =>
      items.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value }

          // Auto-fill price when product is selected
          if (field === "productId" && value) {
            const product = products.find((p) => p._id === value || p.id === value)
            if (product) {
              updatedItem.price = product.price
            }
          }

          // Calculate total (Inclusive: price has tax; Excluded: add tax on top)
          const baseAmount = updatedItem.price * updatedItem.quantity
          let productTaxRate = 18
          const product = products.find((p) => p._id === updatedItem.productId || p.id === updatedItem.productId)
          if (product?.taxCategory && taxSettings) {
            switch (product.taxCategory) {
              case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
              case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
              case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
              case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
              case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
            }
          }
          const applyTax = taxSettings?.enableTax !== false
          if (field === 'discount') {
            const itemDiscountPct = Number(value) || 0
            const { total } = computeLineTotalAndTax(baseAmount, itemDiscountPct, productTaxRate, applyTax)
            updatedItem.total = total
          } else if (discountValue === 0 && discountPercentage === 0) {
            const { total } = computeLineTotalAndTax(baseAmount, updatedItem.discount ?? 0, productTaxRate, applyTax)
            updatedItem.total = total
          }

          console.log('Updated Product Item:', updatedItem)
          return updatedItem
        }
        return item
      }),
    )
    console.log('Product Items After Update:', productItems.map(p => ({ id: p.id, staffId: p.staffId })))
  }

  // Remove service item
  const removeServiceItem = (id: string) => {
    setServiceItems((items) => items.filter((item) => item.id !== id))
  }

  // Remove product item
  const removeProductItem = (id: string) => {
    setProductItems((items) => items.filter((item) => item.id !== id))
  }

  // Calculate totals (now includes GST in individual items)
  const serviceTotal = serviceItems.reduce((sum, item) => sum + item.total, 0)
  const productTotal = productItems.reduce((sum, item) => sum + item.total, 0)
  const subtotal = serviceTotal + productTotal
  const globalDiscount = discountValue + (subtotal * discountPercentage) / 100
  // Line-level discount (per service/product) - only when global discount is off
  const lineLevelDiscount =
    discountValue === 0 && discountPercentage === 0
      ? serviceItems.reduce((sum, item) => sum + (item.price * item.quantity * (item.discount || 0)) / 100, 0) +
        productItems.reduce((sum, item) => sum + (item.price * item.quantity * (item.discount || 0)) / 100, 0)
      : 0
  const totalDiscount = globalDiscount + lineLevelDiscount
  
  // Calculate tax breakdown for billing summary
  // Tax should be calculated on the discounted amount, not original price
  
  // Helper function to calculate discounted amount for an item
  const calculateDiscountedAmount = (baseAmount: number, taxRate: number) => {
    if (discountValue === 0 && discountPercentage === 0) {
      return baseAmount
    }
    
    // Calculate total payable amount (original prices + GST; service GST only when global tax ON and service Tax Applicable ON)
    const totalPayableAmount = serviceItems.reduce((total, serviceItem) => {
      const serviceBaseAmount = serviceItem.price * serviceItem.quantity
      const serviceTaxRate = taxSettings?.serviceTaxRate || 5
      const serviceGstAmount = isServiceTaxable(serviceItem) ? (serviceBaseAmount * serviceTaxRate) / 100 : 0
      return total + serviceBaseAmount + serviceGstAmount
    }, 0) + productItems.reduce((total, productItem) => {
      const productBaseAmount = productItem.price * productItem.quantity
      const product = products.find((p) => p._id === productItem.productId || p.id === productItem.productId)
      let productTaxRate = 18
      if (product?.taxCategory && taxSettings) {
        switch (product.taxCategory) {
          case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
          case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
          case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
          case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
          case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
        }
      }
      const productGstAmount = (taxSettings?.enableTax !== false) ? (productBaseAmount * productTaxRate) / 100 : 0
      return total + productBaseAmount + productGstAmount
    }, 0)
    
    const gstForItem = (taxSettings?.enableTax !== false) ? (baseAmount * taxRate) / 100 : 0
    const itemAmountWithGST = baseAmount + gstForItem
    const totalDiscountAmount = discountValue + (totalPayableAmount * discountPercentage / 100)
    const proportionalDiscount = totalPayableAmount > 0 ? (itemAmountWithGST / totalPayableAmount) * totalDiscountAmount : 0
    const discountOnBaseAmount = proportionalDiscount * baseAmount / itemAmountWithGST
    
    return baseAmount - discountOnBaseAmount
  }

  // Helper to compute discounted base considering item-level discount when no global discount
  const getDiscountedBase = (baseAmount: number, itemDiscountPct: number | undefined, taxRate: number) => {
    if (discountValue === 0 && discountPercentage === 0) {
      const pct = itemDiscountPct || 0
      return baseAmount - (baseAmount * pct) / 100
    }
    return calculateDiscountedAmount(baseAmount, taxRate)
  }

  // Only apply service tax when global tax is ON and this service has Tax Applicable = ON
  const isServiceTaxable = (serviceItem: { serviceId?: string }) => {
    if (taxSettings?.enableTax === false) return false
    const service = services.find((s) => (s._id || s.id) === serviceItem.serviceId)
    return service?.taxApplicable === true
  }

  // Tax Type: Included = price has GST, Excluded = GST added on top
  const priceInclusiveOfTax = paymentSettings?.priceInclusiveOfTax !== false

  // Compute line total and tax: when Inclusive, price already has tax; when Excluded, add tax on top
  const computeLineTotalAndTax = (
    baseAmount: number,
    discountPct: number,
    taxRate: number,
    applyTax: boolean
  ): { total: number; taxAmount: number } => {
    const discountedAmount = baseAmount * (1 - (discountPct || 0) / 100)
    if (!applyTax) return { total: discountedAmount, taxAmount: 0 }
    if (priceInclusiveOfTax) {
      // Price includes GST - total = discountedAmount, extract tax for display
      const taxAmount = discountedAmount - discountedAmount / (1 + taxRate / 100)
      return { total: discountedAmount, taxAmount }
    } else {
      // GST added on top
      const taxAmount = (discountedAmount * taxRate) / 100
      return { total: discountedAmount + taxAmount, taxAmount }
    }
  }

  // Total column display: price - discount (excludes tax)
  const getDisplayTotal = (item: { price: number; quantity: number; discount?: number }) => {
    const baseAmount = (item.price || 0) * (item.quantity || 1)
    const discountPct = item.discount ?? 0
    return baseAmount * (1 - discountPct / 100)
  }
  
  // Calculate service tax (Inclusive: extract from price; Excluded: add on top)
  const serviceTax = (taxSettings?.enableTax !== false) ? serviceItems.reduce((sum, item) => {
    if (!isServiceTaxable(item)) return sum
    const baseAmount = item.price * item.quantity
    const serviceTaxRate = taxSettings?.serviceTaxRate || 5
    const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, serviceTaxRate, true)
    return sum + taxAmount
  }, 0) : 0
  
  // Calculate product tax (Inclusive: extract from price; Excluded: add on top)
  const productTax = (taxSettings?.enableTax !== false) ? productItems.reduce((sum, item) => {
    const baseAmount = item.price * item.quantity
    const product = products.find((p) => p._id === item.productId || p.id === item.productId)
    let productTaxRate = 18
    if (product?.taxCategory && taxSettings) {
      switch (product.taxCategory) {
        case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
        case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
        case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
        case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
        case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
      }
    }
    const applyTax = taxSettings?.enableTax !== false
    const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, productTaxRate, applyTax)
    return sum + taxAmount
  }, 0) : 0

  const totalTax = serviceTax + productTax
  
  // Service Total (for billing display) = sum of (price × qty) for services only
  const billingServiceTotal = serviceItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  // Product Total (for billing display) = sum of (price × qty) for products only
  const billingProductTotal = productItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  // Item Total = Service Total + Product Total (before discounts)
  const billingItemTotal = billingServiceTotal + billingProductTotal
  // Discounts = Manual + Global (both line-level and global discount)
  const discounts = totalDiscount
  // Sub Total = Item Total - Discounts
  const subTotal = billingItemTotal - discounts
  
  // Calculate subtotal excluding tax (discounted amounts)
  const subtotalExcludingTax = serviceItems.reduce((sum, item) => {
    const baseAmount = item.price * item.quantity
    const serviceTaxRate = taxSettings?.serviceTaxRate || 5
    const discountedAmount = getDiscountedBase(baseAmount, item.discount, serviceTaxRate)
    return sum + discountedAmount
  }, 0) + productItems.reduce((sum, item) => {
    const baseAmount = item.price * item.quantity
    const product = products.find((p) => p._id === item.productId || p.id === item.productId)
    let productTaxRate = 18
    if (product?.taxCategory && taxSettings) {
      switch (product.taxCategory) {
        case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
        case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
        case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
        case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
        case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
      }
    }
    const discountedAmount = getDiscountedBase(baseAmount, item.discount, productTaxRate)
    return sum + discountedAmount
  }, 0)
  
  const serviceCGST = serviceTax / 2
  const serviceSGST = serviceTax / 2
  const productCGST = productTax / 2
  const productSGST = productTax / 2

  // Calculate tax percentages for display
  const serviceTaxRate = taxSettings?.serviceTaxRate || 5
  const serviceCGSTRate = serviceTaxRate / 2
  const serviceSGSTRate = serviceTaxRate / 2

  // Calculate product tax per category (group by tax category)
  const productTaxByCategory: Array<{
    category: string
    categoryLabel: string
    taxRate: number
    cgstRate: number
    sgstRate: number
    totalTax: number
    cgst: number
    sgst: number
  }> = []

  if (productItems.length > 0 && taxSettings?.enableTax !== false) {
    const categoryMap = new Map<string, number>()
    
    productItems.forEach(item => {
      const product = products.find((p) => p._id === item.productId || p.id === item.productId)
      let productTaxRate = 18
      let categoryKey = 'standard'
      
      if (product?.taxCategory && taxSettings) {
        switch (product.taxCategory) {
          case 'essential': 
            productTaxRate = taxSettings.essentialProductRate || 5
            categoryKey = 'essential'
            break
          case 'intermediate': 
            productTaxRate = taxSettings.intermediateProductRate || 12
            categoryKey = 'intermediate'
            break
          case 'standard': 
            productTaxRate = taxSettings.standardProductRate || 18
            categoryKey = 'standard'
            break
          case 'luxury': 
            productTaxRate = taxSettings.luxuryProductRate || 28
            categoryKey = 'luxury'
            break
          case 'exempt': 
            productTaxRate = taxSettings.exemptProductRate || 0
            categoryKey = 'exempt'
            break
        }
      }
      
      const baseAmount = item.price * item.quantity
      const discountedAmount = getDiscountedBase(baseAmount, item.discount, productTaxRate)
      const gstAmount = (discountedAmount * productTaxRate) / 100
      
      const existing = categoryMap.get(categoryKey) || 0
      categoryMap.set(categoryKey, existing + gstAmount)
    })

    // Convert to array with labels and rates
    categoryMap.forEach((totalTax, categoryKey) => {
      let taxRate = 18
      let categoryLabel = 'Standard'
      
      switch (categoryKey) {
        case 'essential':
          taxRate = taxSettings?.essentialProductRate || 5
          categoryLabel = 'Essential'
          break
        case 'intermediate':
          taxRate = taxSettings?.intermediateProductRate || 12
          categoryLabel = 'Intermediate'
          break
        case 'standard':
          taxRate = taxSettings?.standardProductRate || 18
          categoryLabel = 'Standard'
          break
        case 'luxury':
          taxRate = taxSettings?.luxuryProductRate || 28
          categoryLabel = 'Luxury'
          break
        case 'exempt':
          taxRate = taxSettings?.exemptProductRate || 0
          categoryLabel = 'Exempt'
          break
      }
      
      if (totalTax > 0) {
        productTaxByCategory.push({
          category: categoryKey,
          categoryLabel,
          taxRate,
          cgstRate: taxRate / 2,
          sgstRate: taxRate / 2,
          totalTax,
          cgst: totalTax / 2,
          sgst: totalTax / 2
        })
      }
    })
  }

  // Base bill (services/products) total = subtotal + membership items
  // Note: When value/percentage discount is active, item.total already has the proportional discount baked in,
  // so we must NOT subtract globalDiscount again (that would double-apply the discount).
  const membershipTotal = membershipItems.reduce((sum, item) => sum + item.total, 0)
  const baseTotal = subtotal + membershipTotal
  const baseRounded = Math.round(baseTotal)
  const roundOff = baseRounded - baseTotal
  // Amount payable by customer = baseRounded + tip (tip is separate, non-taxable)
  const grandTotal = baseRounded + tip
  const roundedTotal = grandTotal
  const totalPaid = cashAmount + cardAmount + onlineAmount
  const change = totalPaid - roundedTotal

  // Generate receipt number with proper increment.
  // No fallback to cached number - if the API fails after retries, we surface the error
  // to avoid duplicate invoice IDs (INV-000122, etc.) when multiple bills use the same cached value.
  const generateReceiptNumber = async () => {
    const maxRetries = 3
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`=== RECEIPT NUMBER GENERATION (attempt ${attempt}/${maxRetries}) ===`)

        const incrementResponse = await SettingsAPI.incrementReceiptNumber()
        if (incrementResponse.success) {
          const newReceiptNumber = incrementResponse.data.receiptNumber
          console.log('✅ Receipt number incremented successfully:', newReceiptNumber)

          let prefix = 'INV'
          const settingsResponse = await SettingsAPI.getBusinessSettings()
          if (settingsResponse.success && settingsResponse.data) {
            prefix = settingsResponse.data.invoicePrefix || settingsResponse.data.receiptPrefix || 'INV'
          } else {
            prefix = posSettings?.invoicePrefix || businessSettings?.invoicePrefix || businessSettings?.receiptPrefix || 'INV'
          }

          const formattedReceiptNumber = `${prefix}-${newReceiptNumber.toString().padStart(6, '0')}`

          setBusinessSettings((prev: any) => ({
            ...prev,
            receiptNumber: newReceiptNumber
          }))

          return formattedReceiptNumber
        }
        lastError = new Error(incrementResponse.error || 'Failed to increment receipt number')
      } catch (error) {
        lastError = error
        console.error(`Receipt number generation attempt ${attempt} failed:`, error)
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * attempt))
        }
      }
    }

    console.error('Failed to generate receipt number after retries:', lastError)
    throw lastError instanceof Error ? lastError : new Error('Failed to generate receipt number. Please check your connection and try again.')
  }

  // Handle checkout (reasonOverride: when called from modal, pass reason directly since setState is async)
  const handleCheckout = async (reasonOverride?: string) => {
    console.log('🚀 handleCheckout function called!')
    console.log('🚀 Mode:', mode)
    console.log('🚀 selectedCustomer:', selectedCustomer)
    console.log('🚀 customerSearch:', customerSearch)
    console.log('🚀 isProcessing:', isProcessing)
    
    // Prevent multiple simultaneous checkouts
    if (isProcessing) {
      console.log('❌ Checkout already in progress, ignoring')
      return
    }
    
    const effectiveReason = (reasonOverride ?? editReason).trim()
    // Validate edit reason for edit mode
    if (mode === "edit" && !effectiveReason) {
      toast({
        title: "Edit Reason Required",
        description: "Please provide a reason for editing this bill",
        variant: "destructive",
      })
      return
    }
    
    if (!selectedCustomer && !customerSearch) {
      toast({
        title: "Customer Required",
        description: "Please select or enter a customer",
        variant: "destructive",
      })
      return
    }

    const validServiceItems = serviceItems.filter((item) => item.serviceId)
    const validProductItems = productItems.filter((item) => item.productId)

    if (validServiceItems.length === 0 && validProductItems.length === 0 && membershipItems.filter((m) => m.planId).length === 0) {
      toast({
        title: "No Items",
        description: "Please add at least one service, product, or membership plan",
        variant: "destructive",
      })
      return
    }

    // Validate that we have a valid total amount
    if (roundedTotal <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Total amount must be greater than 0",
        variant: "destructive",
      })
      return
    }

    // Validate payment amounts don't exceed total
    if (totalPaid > roundedTotal) {
      toast({
        title: "Payment Error",
        description: `Total paid (₹${totalPaid.toFixed(2)}) cannot exceed total amount (₹${roundedTotal.toFixed(2)})`,
        variant: "destructive",
      })
      return
    }

    // Validate that all services have staff assigned
    const servicesWithoutStaff = validServiceItems.filter((item) => !item.staffId)
    if (validServiceItems.length > 0 && servicesWithoutStaff.length > 0) {
      toast({
        title: "Staff Required",
        description: "Please select staff for all services before checkout",
        variant: "destructive",
      })
      return
    }

    // Validate that all membership items have staff assigned
    const validMembershipItems = membershipItems.filter((m) => m.planId)
    const membershipWithoutStaff = validMembershipItems.filter((m) => !m.staffId)
    if (validMembershipItems.length > 0 && membershipWithoutStaff.length > 0) {
      toast({
        title: "Staff Required",
        description: "Please select staff for all membership plans before checkout",
        variant: "destructive",
      })
      return
    }

    // --- STOCK VALIDATION: Check if we have enough inventory for all products ---
    if (validProductItems.length > 0) {
      console.log('📦 Validating product stock before checkout...')
      
      for (const productItem of validProductItems) {
        const product = products.find((p) => p._id === productItem.productId || p.id === productItem.productId)
        
        if (product) {
          console.log(`📦 Checking stock for ${product.name}: Available ${product.stock}, Required ${productItem.quantity}`)
          
          if (product.stock < productItem.quantity) {
            toast({
              title: "Insufficient Stock",
              description: `${product.name} has insufficient stock. Available: ${product.stock}, Required: ${productItem.quantity}`,
              variant: "destructive",
            })
            return // Stop checkout if any product has insufficient stock
          }
        } else {
          console.error(`❌ Product not found for ID: ${productItem.productId}`)
          toast({
            title: "Product Error",
            description: "One or more products could not be found. Please refresh and try again.",
            variant: "destructive",
          })
          return
        }
      }
      
      console.log('✅ All products have sufficient stock')
    }



    setIsProcessing(true)

    try {
      // Calculate rounded total for customer stats (before receipt generation)
      // Grand total = baseTotal + tip (discount already in subtotal via item totals)
      const grandTotalForStats = baseTotal + tip
      const roundedTotalForStats = Math.round(grandTotalForStats)
      
      // Create or use existing customer
      let customer = selectedCustomer
      if (!customer && customerSearch) {
        // Create new customer
        customer = {
          id: Date.now().toString(),
          name: customerSearch,
          phone: customerSearch.match(/^\d+$/) ? customerSearch : "",
          email: customerSearch.includes("@") ? customerSearch : "",
          totalVisits: 1,
          totalSpent: roundedTotalForStats,
          createdAt: new Date().toISOString(),
          status: "active",
        }
        // Add to clients array
        clients.push(customer)
      } else if (customer) {
        // Update existing customer stats
        customer.totalVisits = (customer.totalVisits || 0) + 1
        customer.totalSpent = (customer.totalSpent || 0) + roundedTotalForStats
        customer.lastVisit = format(new Date(), "yyyy-MM-dd")
      }

      // Debug: Log all available data
      console.log('=== RECEIPT GENERATION DEBUG ===')
      console.log('Business Settings:', businessSettings)
      console.log('POS Settings:', posSettings)
      console.log('Business Settings invoicePrefix:', businessSettings?.invoicePrefix)
      console.log('Business Settings receiptPrefix:', businessSettings?.receiptPrefix)
      console.log('POS Settings invoicePrefix:', posSettings?.invoicePrefix)
      console.log('Services:', services.map(s => ({ id: s._id || s.id, name: s.name })))
      console.log('Products:', products.map(p => ({ id: p._id || p.id, name: p.name })))
      console.log('Staff:', staff.map(s => ({ id: s._id || s.id, name: s.name })))
      console.log('Valid Service Items:', validServiceItems)
      console.log('Valid Product Items:', validProductItems)
      console.log('=== CURRENT STATE BEFORE RECEIPT GENERATION ===')
      console.log('Service Items State:', serviceItems.map(s => ({ id: s.id, staffId: s.staffId, staffContributions: s.staffContributions })))
      console.log('Product Items State:', productItems.map(p => ({ id: p.id, staffId: p.staffId })))
      console.log('Staff Data:', staff.map(s => ({ id: s._id || s.id, name: s.name })))
      
      // Create receipt items
      const receiptItems: any[] = [
        ...validServiceItems.map((item) => {
          const service = services.find((s) => s._id === item.serviceId || s.id === item.serviceId)
          const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
          console.log('=== SERVICE RECEIPT GENERATION ===')
          console.log('Service item:', { id: item.id, serviceId: item.serviceId, staffId: item.staffId })
          console.log('Service lookup:', { serviceId: item.serviceId, foundService: service?.name, allServices: services.map(s => ({ id: s._id || s.id, name: s.name })) })
          console.log('Staff lookup:', { staffId: item.staffId, foundStaff: staffMember?.name, allStaff: staff.map(s => ({ id: s._id || s.id, name: s.name })) })
          
          // Handle staff contributions
          let staffContributions = item.staffContributions
          if (!staffContributions && item.staffId) {
            // Legacy support - create single staff contribution
            staffContributions = [{
              staffId: item.staffId,
              staffName: staffMember?.name || "Unassigned Staff",
              percentage: 100,
              amount: item.total
            }]
          }
          
          return {
            id: item.id,
            name: service?.name || "Unknown Service",
            type: "service",
            quantity: item.quantity,
            price: item.price,
            discount: item.discount,
            discountType: "percentage",
            staffId: item.staffId,
            staffName: staffMember?.name || "Unassigned Staff",
            total: item.total,
            staffContributions: staffContributions,
            hsnSacCode: (service as any)?.hsnSacCode || ""
          }
        }),
        ...validProductItems.map((item) => {
          const product = products.find((p) => p._id === item.productId || p.id === item.productId)
          const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
          console.log('=== PRODUCT RECEIPT GENERATION ===')
          console.log('Product item:', { id: item.id, productId: item.productId, staffId: item.staffId })
          console.log('Product lookup:', { productId: item.productId, foundProduct: product?.name, allProducts: products.map(p => ({ id: p._id || p.id, name: p.name })) })
          console.log('Product staff lookup:', { staffId: item.staffId, foundStaff: staffMember?.name, allStaff: staff.map(s => ({ id: s._id || s.id, name: s.name })) })
          return {
            id: item.id,
            name: product?.name || "Unknown Product",
            type: "product",
            quantity: item.quantity,
            price: item.price,
            discount: item.discount,
            discountType: "percentage",
            staffId: item.staffId,
            staffName: staffMember?.name || "Unassigned Staff",
            total: item.total,
            hsnSacCode: (product as any)?.hsnSacCode || ""
          }
        }),
        ...membershipItems
          .filter((m) => m.planId)
            .map((m) => ({
            id: m.id,
            name: `${m.planName} (${m.durationInDays} days)`,
            type: "membership" as const,
            quantity: m.quantity,
            price: m.price,
            discount: 0,
            discountType: "percentage" as const,
            hsnSacCode: "",
            staffId: m.staffId || staff[0]?._id || staff[0]?.id || "",
            staffName: (m.staffId ? staff.find((s) => (s._id || s.id) === m.staffId)?.name : null) || staff[0]?.name || "Unassigned Staff",
            total: m.total,
            taxAmount: 0,
            cgst: 0,
            sgst: 0,
            totalWithTax: m.total,
          })),
      ]

      // Create payments array
      const payments: PaymentMethod[] = []
              if (cashAmount > 0) payments.push({ type: "cash", amount: cashAmount })
        if (cardAmount > 0) payments.push({ type: "card", amount: cardAmount })
        if (onlineAmount > 0) payments.push({ type: "online", amount: onlineAmount })

      // Get the primary staff member (first staff member from items)
      const primaryStaff = receiptItems.length > 0 ? {
        staffId: receiptItems[0].staffId,
        staffName: receiptItems[0].staffName
      } : null
      
      console.log('=== STAFF ASSIGNMENT DEBUG ===')
      console.log('Service items before processing:', serviceItems)
      console.log('Staff list:', staff)
      console.log('Receipt items:', receiptItems)
      console.log('Primary staff:', primaryStaff)
      console.log('First item staff info:', receiptItems[0] ? {
        staffId: receiptItems[0].staffId,
        staffName: receiptItems[0].staffName
      } : 'No items')
      
      // Calculate tax breakdown from individual items (uses Inclusive/Excluded logic via computeLineTotalAndTax)
      let calculatedTax = 0
      // Base bill amount (for sales/revenue) = subtotal + membership plan (discount already baked into item totals)
      const baseTotalForSale = subtotal + membershipTotal
      const roundedBaseTotalForSale = Math.round(baseTotalForSale)
      const roundOff = roundedBaseTotalForSale - baseTotalForSale
      // calculatedTotal = bill amount used for sales/grossTotal (EXCLUDES tip)
      let calculatedTotal = roundedBaseTotalForSale
      let taxBreakdown: { cgst: number; sgst: number; igst: number; serviceTax: number; serviceRate: number; productTaxByRate: Record<string, number> } = {
        cgst: 0, sgst: 0, igst: 0, serviceTax: 0, serviceRate: 5, productTaxByRate: {}
      }

      // Service tax (Inclusive: extract from price; Excluded: add on top)
      const serviceTax = (taxSettings?.enableTax !== false) ? serviceItems.reduce((sum, item) => {
        if (!isServiceTaxable(item)) return sum
        const baseAmount = item.price * item.quantity
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, serviceTaxRate, true)
        return sum + taxAmount
      }, 0) : 0

      // Build product tax by rate map for receipt bifurcation (Inclusive: extract from price; Excluded: add on top)
      const productTaxByRate: Record<string, number> = {}

      const productTax = (taxSettings?.enableTax !== false) ? productItems.reduce((sum, item) => {
        const baseAmount = item.price * item.quantity
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        let productTaxRate = 18 // default standard rate
        if (product?.taxCategory && taxSettings) {
          switch (product.taxCategory) {
            case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
            case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
            case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
            case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
            case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
          }
        }
        const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, productTaxRate, true)
        const key = String(productTaxRate)
        productTaxByRate[key] = (productTaxByRate[key] || 0) + taxAmount
        return sum + taxAmount
      }, 0) : 0

      calculatedTax = serviceTax + productTax
        taxBreakdown = {
          cgst: calculatedTax / 2,
          sgst: calculatedTax / 2,
          igst: 0,
          serviceTax: serviceTax,
          serviceRate: taxSettings?.serviceTaxRate || 5,
          productTaxByRate
        } as any

      // Update receipt items with tax information (uses Inclusive/Excluded logic via computeLineTotalAndTax)
      receiptItems.forEach((item) => {
        if (item.type === 'service') {
          const origService = validServiceItems.find((s) => s.id === item.id)
          const applyTax = origService ? isServiceTaxable(origService) : false
          const baseAmount = item.price * item.quantity
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, serviceTaxRate, applyTax)
          item.taxAmount = taxAmount
          item.cgst = taxAmount / 2
          item.sgst = taxAmount / 2
          item.totalWithTax = item.total
          item.priceExcludingGST = (item.total - (taxAmount || 0)) / (item.quantity || 1)
          item.taxRate = applyTax ? serviceTaxRate : 0
        } else if (item.type === 'product') {
          const origProduct = validProductItems.find((p) => p.id === item.id)
          const product = origProduct ? products.find((prod) => prod._id === origProduct.productId || prod.id === origProduct.productId) : null
          let productTaxRate = 18
          if (product?.taxCategory && taxSettings) {
            switch (product.taxCategory) {
              case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
              case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
              case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
              case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
              case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
            }
          }
          const applyTax = (taxSettings?.enableTax !== false) && productTaxRate > 0
          const baseAmount = item.price * item.quantity
          const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, productTaxRate, applyTax)
          item.taxAmount = taxAmount
          item.cgst = taxAmount / 2
          item.sgst = taxAmount / 2
          item.totalWithTax = item.total
          item.priceExcludingGST = (item.total - (taxAmount || 0)) / (item.quantity || 1)
          item.taxRate = applyTax ? productTaxRate : 0
        } else if (item.type === 'membership') {
          item.priceExcludingGST = (item.total || 0) / (item.quantity || 1)
          item.taxRate = 0
        }
      })
      
      // Handle different modes: create, edit, exchange
      try {
        let receiptNumber
        let saleId: string | undefined

        if (mode === "edit" || mode === "exchange") {
          // For edit/exchange, use existing bill number and ID
          if (!initialSale) {
            toast({
              title: "Error",
              description: "Original bill data not found",
              variant: "destructive",
            })
            return
          }
          receiptNumber = initialSale.billNo || initialSale.receiptNumber
          saleId = initialSale._id || initialSale.id
          console.log('📝 Edit/Exchange mode - Using existing bill:', receiptNumber, saleId)
        } else {
          // For create mode, generate new receipt number
          try {
            receiptNumber = await generateReceiptNumber()
            if (!receiptNumber) {
              throw new Error('Failed to generate receipt number')
            }
            console.log('✅ Receipt number generated successfully:', receiptNumber)
          } catch (error) {
            console.error('❌ Failed to generate receipt number:', error)
            toast({
              title: "Receipt Generation Failed",
              description: "Failed to generate receipt number. Please try again.",
              variant: "destructive",
            })
            return
          }
        }

        // Create sale data with the receipt number
        const tipStaff = tipStaffId
          ? staff.find((s) => (s._id || s.id) === tipStaffId)
          : null
        const saleData = {
          billNo: receiptNumber,
          customerId: getCustomerId(customer),
          customerName: customer!.name,
          customerPhone: customer!.phone,
          customerEmail: customer?.email || '',
          items: [
            ...validServiceItems.map((item: any) => {
              const service = services.find((s) => s._id === item.serviceId || s.id === item.serviceId)
              const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
              const receiptItem = receiptItems.find((r) => r.id === item.id)
              const itemTax = receiptItem?.taxAmount ?? 0
          return {
                serviceId: item.serviceId,
                productId: null,
                name: service?.name || 'Unknown Service',
                type: 'service' as const,
                quantity: item.quantity,
                price: item.price,
                priceExcludingGST: (item.total - itemTax) / (item.quantity || 1),
                total: item.total,
                discount: item.discount ?? 0,
                staffId: item.staffId || '',
                staffName: staffMember?.name || '',
                staffContributions: item.staffContributions || [],
                isMembershipFree: item.isMembershipFree ?? false,
                membershipDiscountPercent: item.membershipDiscountPercent ?? 0,
                hsnSacCode: (service as any)?.hsnSacCode || '',
                taxRate: (receiptItem as any)?.taxRate ?? 0
              }
            }),
            ...validProductItems.map((item: any) => {
              const product = products.find((p) => p._id === item.productId || p.id === item.productId)
              const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
              const receiptItem = receiptItems.find((r) => r.id === item.id)
              const itemTax = receiptItem?.taxAmount ?? 0
              return {
                productId: item.productId,
                serviceId: null,
                name: product?.name || 'Unknown Product',
                type: 'product' as const,
                quantity: item.quantity,
                price: item.price,
                priceExcludingGST: (item.total - itemTax) / (item.quantity || 1),
                total: item.total,
                discount: item.discount ?? 0,
                staffId: item.staffId || '',
                staffName: staffMember?.name || '',
                staffContributions: item.staffContributions || [],
                hsnSacCode: (product as any)?.hsnSacCode || '',
                taxRate: (receiptItem as any)?.taxRate ?? 0
              }
            })
          ],
          // Sale model required fields
          // Net Total = bill + tip (including tip); Gross Total = bill only (excluding tip)
          netTotal: calculatedTotal + tip,
          taxAmount: calculatedTax,
          grossTotal: calculatedTotal,
          tip: tip,
          tipStaffId: tipStaffId || undefined,
          tipStaffName: tipStaff?.name || undefined,
          discount: isValueDiscountActive ? discountValue : (isGlobalDiscountActive ? discountPercentage : 0),
          discountType: isValueDiscountActive ? 'fixed' : 'percentage',
          // Payment status tracking
          paymentStatus: {
            // Total amount customer needs to pay = sales amount (calculatedTotal) + tip
            totalAmount: calculatedTotal + tip,
            paidAmount: totalPaid,
            remainingAmount: calculatedTotal + tip - totalPaid,
            dueDate: new Date()
          },
          status: totalPaid === 0 ? 'unpaid' : (totalPaid < calculatedTotal + tip ? 'partial' : 'completed'),
          paymentMode: payments.map(p => {
            const capitalized = p.type.charAt(0).toUpperCase() + p.type.slice(1);
            return capitalized;
          }).join(', '),
          payments: payments.map(p => ({
            mode: p.type.charAt(0).toUpperCase() + p.type.slice(1), // Capitalize first letter: "Cash", "Card", "Online"
            amount: p.amount
          })),
          staffId: primaryStaff?.staffId || staff[0]?._id || staff[0]?.id || "",
          staffName: primaryStaff?.staffName || staff[0]?.name || "Unassigned Staff",
          notes: remarks || '',
          appointmentId: linkedAppointmentId || undefined,
          date: selectedDate.toISOString(),
          time: format(new Date(), "HH:mm"),
          ...(membershipItems.filter((m) => m.planId).length > 0 && {
            planToAssignId: membershipItems.find((m) => m.planId)?.planId,
            membershipPlanPrice: membershipTotal,
          }),
          taxBreakdown: {
            serviceTax: taxBreakdown.serviceTax,
            serviceRate: taxBreakdown.serviceRate,
            productTaxByRate: taxBreakdown.productTaxByRate,
          },
        }

        console.log('💾 Creating sale in backend:', saleData)
        console.log('💾 Sale data items:', saleData.items)
        console.log('💾 Customer email check:', {
          customer: customer?.name,
          customerEmail: customer?.email,
          saleDataCustomerEmail: saleData.customerEmail,
          hasEmail: !!saleData.customerEmail
        })
        console.log('💾 Sale data validation:', {
          hasBillNo: !!saleData.billNo,
          hasCustomerName: !!saleData.customerName,
          hasCustomerEmail: !!saleData.customerEmail,
          customerEmail: saleData.customerEmail || 'NO EMAIL',
          hasItems: !!saleData.items && saleData.items.length > 0,
          hasGrossTotal: !!saleData.grossTotal,
          itemsCount: saleData.items?.length || 0
        })
        
        // Use the SalesAPI for proper authentication and error handling
        try {
          let result: any
          
          if (mode === "edit") {
            // Update existing sale
            console.log('🚀 About to call SalesAPI.update with data:', saleData)
            console.log('💳 Payment details being sent:', {
              payments: saleData.payments,
              paymentMode: saleData.paymentMode,
              cashAmount,
              cardAmount,
              onlineAmount,
              totalPaid
            })
            console.log('🔐 Current auth token:', localStorage.getItem('salon-auth-token') ? 'Present' : 'Missing')
            result = await SalesAPI.update(saleId!, {
              ...saleData,
              editReason: effectiveReason,
            })
            console.log('📊 SalesAPI.update response:', result)
            console.log('💳 Payment details in response:', {
              payments: result.data?.payments,
              paymentMode: result.data?.paymentMode
            })
          } else if (mode === "exchange") {
            // Exchange products
            console.log('🚀 About to call SalesAPI.exchangeProducts with data:', saleData)
            console.log('🔐 Current auth token:', localStorage.getItem('salon-auth-token') ? 'Present' : 'Missing')
            result = await SalesAPI.exchangeProducts(saleId!, {
              updatedItems: saleData.items,
              netTotal: saleData.netTotal,
              taxAmount: saleData.taxAmount,
              grossTotal: saleData.grossTotal,
              discount: saleData.discount,
              discountType: saleData.discountType,
              editReason: editReason.trim() || "Product exchange",
              notes: saleData.notes,
            })
            console.log('📊 SalesAPI.exchangeProducts response:', result)
          } else {
            // Create new sale
            console.log('🚀 About to call SalesAPI.create with data:', saleData)
            console.log('🔐 Current auth token:', localStorage.getItem('salon-auth-token') ? 'Present' : 'Missing')
            result = await SalesAPI.create(saleData)
            console.log('📊 SalesAPI.create response:', result)
          }
          
          if (result.success) {
            const actionText = mode === "edit" ? "updated" : mode === "exchange" ? "exchanged" : "created"
            console.log(`✅ Sale ${actionText} successfully in backend:`, result)
            
            // For edit/exchange, show success and redirect
            if (mode === "edit" || mode === "exchange") {
              toast({
                title: `Bill ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`,
                description: `Bill ${receiptNumber} has been ${actionText} successfully.`,
              })
              // Redirect to reports after a short delay
              setTimeout(() => {
                router.push("/reports")
              }, 1500)
              return
            }
            
            // Check email status if available
            if (result.emailStatus) {
              console.log('📧 Email Status from backend:', result.emailStatus)
              if (result.emailStatus.sent) {
                console.log('✅ Receipt email sent successfully!')
              } else if (result.emailStatus.attempted) {
                console.error('❌ Email sending attempted but failed:', result.emailStatus.error)
              } else {
                console.warn('⚠️ Email sending not attempted:', result.emailStatus.error)
              }
            } else {
              console.warn('⚠️ No email status in response')
            }
            
            // Check WhatsApp status if available
            if (result.whatsappStatus) {
              console.log('📱 WhatsApp Status from backend:', result.whatsappStatus)
              if (result.whatsappStatus.sent) {
                console.log('✅ Receipt WhatsApp sent successfully!')
              } else if (result.whatsappStatus.error) {
                console.warn('⚠️ WhatsApp sending failed:', result.whatsappStatus.error)
              } else {
                console.warn('⚠️ WhatsApp not sent. Status:', result.whatsappStatus)
              }
            } else {
              console.warn('⚠️ No WhatsApp status in response')
            }
            
            // Mark linked appointment (and all in same booking group) as completed if fully paid
            if (linkedAppointmentId && (totalPaid >= calculatedTotal + tip || result.data?.status === 'completed')) {
              try {
                await AppointmentsAPI.update(linkedAppointmentId, { status: "completed" })
                window.dispatchEvent(new CustomEvent("appointments-refresh"))
                toast({
                  title: "Appointment Completed",
                  description: "Linked appointment(s) have been marked as completed.",
                })
              } catch (error) {
                console.error("Failed to update appointment status:", error)
              }
            }
            // Refresh calendar so new walk-in cards (multi-staff services) appear - for both linked and standalone sales
            if (typeof window !== "undefined" && (totalPaid >= calculatedTotal + tip || result.data?.status === 'completed')) {
              window.dispatchEvent(new CustomEvent("appointments-refresh"))
            }
            
            // Now that backend sale is successful, create and store the receipt locally
      const tipStaff = tipStaffId
        ? staff.find((s) => (s._id || s.id) === tipStaffId)
        : null

      const subtotalExcludingTax = receiptItems.reduce((sum, item) => sum + (item.total - ((item as any).taxAmount || 0)), 0)
      const receipt: any = {
        id: Date.now().toString(),
        receiptNumber: receiptNumber,
        clientId: getCustomerId(customer),
        clientName: customer!.name,
        clientPhone: customer!.phone,
        date: selectedDate.toISOString(),
        time: format(new Date(), "HH:mm"),
        items: receiptItems,
        subtotal: subtotal,
        subtotalExcludingTax,
        tip: tip,
        discount: totalDiscount,
        tax: calculatedTax,
        roundOff: roundOff,
        // Receipt total = bill amount (calculatedTotal) + tip (what customer pays)
        total: calculatedTotal + tip,
        taxBreakdown: taxBreakdown,
        payments: payments,
        staffId: primaryStaff?.staffId || staff[0]?._id || staff[0]?.id || "",
        staffName: primaryStaff?.staffName || staff[0]?.name || "Unassigned Staff",
        tipStaffId: tipStaffId || undefined,
        tipStaffName: tipStaff?.name || undefined,
        notes: remarks,
        shareToken: result.data?.shareToken,
      }

            // Store the receipt locally
      addReceipt(receipt)
      setCurrentReceipt(receipt)
            console.log('✅ Receipt stored locally with number:', receipt.receiptNumber)
            
            // Refresh products to get updated stock levels from backend
            if (validProductItems.length > 0) {
              console.log('🔄 Refreshing product list to get updated stock levels...')
              try {
                const refreshResponse = await ProductsAPI.getAll({ limit: 1000 }) // Fetch up to 1000 products
                if (refreshResponse.success) {
                  const sellableProducts = (refreshResponse.data || []).filter((product: any) => {
                    const productType = product.productType || 'retail'
                    return productType === 'retail' || productType === 'both'
                  })
                  setProducts(sellableProducts)
                  console.log('✅ Product list refreshed with updated stock levels')
                }
              } catch (refreshError) {
                console.warn('⚠️ Failed to refresh product list:', refreshError)
              }
            }

            // Open receipt in new tab - Use business receipt page (with Print/Thermal Print buttons)
            try {
              // Always use business receipt URL for internal use (has Print/Thermal Print buttons)
              const returnTo = linkedAppointmentId ? 'appointments' : 'quick-sale'
              const receiptUrl = `/receipt/${receipt.receiptNumber}?data=${encodeURIComponent(JSON.stringify(receipt))}&returnTo=${returnTo}&t=${Date.now()}`
              console.log('🎯 Opening business receipt URL (with print options):', receiptUrl)
              
              const newWindow = window.open(receiptUrl, '_blank')
              if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
                console.warn('⚠️ Popup was blocked, showing fallback message')
                toast({
                  title: "Receipt Generated",
                  description: `Receipt #${receipt.receiptNumber} created successfully. Please check the receipts page.`,
                })
              } else {
                console.log('✅ Receipt opened successfully in new tab')
              }
            } catch (error) {
              console.error('❌ Error opening receipt:', error)
              toast({
                title: "Receipt Generated",
                description: `Receipt #${receipt.receiptNumber} created successfully. Please check the receipts page.`,
              })
            }
          } else {
            console.error('❌ Failed to create sale in backend:', result.error)
                  toast({
              title: "Sale Creation Failed",
              description: result.error || "Failed to create sale. Please try again.",
                    variant: "destructive",
                  })
            return
          }
        } catch (apiError: any) {
          console.error('💥 SalesAPI.create threw an error:', apiError)
          console.error('💥 Error details:', {
            message: apiError?.message,
            status: apiError?.response?.status,
            statusText: apiError?.response?.statusText,
            data: apiError?.response?.data
          })
          
          // Show error toast to user
                  toast({
            title: "Sale Creation Failed",
            description: apiError?.response?.data?.error || apiError?.message || "Failed to create sale. Please try again.",
                    variant: "destructive",
                  })
          
          // Don't proceed with receipt or form reset if backend fails
          return
        }
      } catch (error) {
        console.error('❌ Error creating sale in backend:', error)
        
        // Show error toast to user
            toast({
          title: "Sale Creation Failed",
          description: "Failed to create sale. Please try again.",
              variant: "destructive",
            })
        
        // Don't proceed with receipt or form reset if backend fails
        return
      }
      

      // Reset form
      resetForm()
      setLinkedAppointmentId(null)
    } catch (error: any) {
      console.error('❌ Checkout failed:', error)
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
      
      let errorMessage = "An error occurred during checkout"
      if (error.message) {
        errorMessage = error.message
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      }
      
      toast({
        title: "Checkout Failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // Reset form
  const resetForm = () => {
    setSelectedCustomer(null)
    setCustomerSearch("")
    setServiceItems([])
    setProductItems([])
    setDiscountValue(0)
    setDiscountPercentage(0)
    setGiftVoucher("")
    setTip(0)
    setIsGlobalDiscountActive(false)
    setIsValueDiscountActive(false)
    setCashAmount(0)
    setCardAmount(0)
    setOnlineAmount(0)
    setRemarks("")
    setTipStaffId(null)
    setConfirmUnpaid(false)
    setShowTipModal(false)
    setTempTipAmount(0)
    setEditReason("")
    setShowEditReasonModal(false)
    setTempEditReason("")
    setMembershipItems([])
    setAddItemSection(null)
  }

  // Tip modal handlers
  const handleTipClick = () => {
    setTempTipAmount(tip)
    setShowTipModal(true)
  }

  const handleTipCancel = () => {
    setShowTipModal(false)
    setTempTipAmount(0)
  }

  const handleTipOk = () => {
    if (tempTipAmount > 0 && !tipStaffId) {
      toast({
        title: "Select Staff",
        description: "Please select the staff member receiving the tip.",
        variant: "destructive",
      })
      return
    }
    if (tempTipAmount > 0) {
      setTip(tempTipAmount)
    } else {
      setTip(0)
      setTipStaffId(null)
    }
    setShowTipModal(false)
  }

  // Quick cash amounts
  const quickCashAmounts = [100, 200, 500]



  const formatCurrency = (amount: number) => {
    const currency = paymentSettings?.enableCurrency ? (paymentSettings?.currency || "USD") : "USD"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "Never"
    return new Date(dateString).toLocaleDateString()
  }

  const [showBillHistoryDialog, setShowBillHistoryDialog] = useState(false)
  const [focusedZeroInputKey, setFocusedZeroInputKey] = useState<string | null>(null)
  const [generatedReceipt, setGeneratedReceipt] = useState<any | null>(null)

  const handleNewCustomerSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    handleSaveNewCustomer()
  }

  // Handle viewing individual bill details
  const handleViewBillDetails = (bill: any) => {
    setSelectedBill(bill)
    setShowBillDetailsDialog(true)
  }

  if (isOldQuickSale) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Customer Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Customer Selection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer *</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="customer"
                    placeholder="Search by name or phone..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value)
                      setShowCustomerDropdown(true)
                      if (!e.target.value) {
                        setSelectedCustomer(null)
                      }
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    className="pl-10"
                  />

                  {showCustomerDropdown && customerSearch && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((customer, index) => (
                          <div
                            key={`${customer._id || customer.id}-${customer.phone}-${index}`}
                            className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                            onClick={() => handleCustomerSelect(customer)}
                          >
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{customer.name}</div>
                                <div className="text-sm text-muted-foreground">📞 {customer.phone}</div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div
                          className="p-3 hover:bg-muted cursor-pointer flex items-center gap-2"
                          onClick={handleCreateNewCustomer}
                        >
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>Create new customer: &quot;{customerSearch}&quot;</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Details */}
              {selectedCustomer && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span className="font-medium">{selectedCustomer.name}</span>
                      <Badge variant={selectedCustomer.status === "active" ? "default" : "secondary"}>
                        {selectedCustomer.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedCustomer.phone}
                    </div>
                    {selectedCustomer.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {selectedCustomer.email}
                      </div>
                    )}
                  </div>

                  <div className={`grid ${(selectedCustomer.totalDues || 0) > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-4 pt-2`}>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-1">
                        <Calendar className="h-3 w-3" />
                        Visits
                      </div>
                      <div className="font-semibold">{selectedCustomer.totalVisits || 0}</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-1">
                        <TrendingUp className="h-3 w-3" />
                        Revenue
                      </div>
                      <div className="font-semibold">{formatCurrency(selectedCustomer.totalSpent || 0)}</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-1">
                        <Calendar className="h-3 w-3" />
                        Last Visit
                      </div>
                      <div className="font-semibold text-xs">{formatDate(selectedCustomer.lastVisit || "")}</div>
                    </div>
                    {(selectedCustomer.totalDues || 0) > 0 && (
                      <div 
                        className="text-center cursor-pointer hover:bg-red-50 rounded-lg p-2 transition-all duration-200"
                        onClick={async () => {
                          if (selectedCustomer) {
                            await fetchUnpaidBills(selectedCustomer.name)
                            setShowDuesDialog(true)
                          }
                        }}
                      >
                        <div className="flex items-center justify-center gap-1 text-sm text-red-600 mb-1">
                          <CreditCard className="h-3 w-3" />
                          Dues
                        </div>
                        <div className="font-semibold text-red-600">{formatCurrency(selectedCustomer.totalDues || 0)}</div>
                      </div>
                    )}
                  </div>

                   <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                       className="flex-1 bg-transparent"
                       onClick={async () => {
                         if (selectedCustomer) {
                           await fetchCustomerBills(selectedCustomer.name)
                           setShowBillActivityDialog(true)
                         }
                       }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Bill Activity
                  </Button>
                     <Button
                       variant="outline"
                       size="sm"
                       className="px-2 bg-red-100 text-red-600"
                       onClick={() => {
                         console.log('🔍 TEST: Force opening dialog')
                         setShowBillActivityDialog(true)
                       }}
                     >
                       TEST
                  </Button>
                   </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Cart */}
        {/* <Card>
          <CardHeader>
            <CardTitle>Cart ({cart.length} items)</CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No items in cart</p>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div
                    key={`${item.id}-${item.type}`}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded"
                  >
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-muted-foreground capitalize">{item.type}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.id, item.type, item.quantity - 1)}
                      >
                        -
                      </Button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.id, item.type, item.quantity + 1)}
                      >
                        +
                      </Button>
                      <div className="w-20 text-right font-medium">{formatCurrency(item.price * item.quantity)}</div>
                      <Button size="sm" variant="ghost" onClick={() => removeFromCart(item.id, item.type)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card> */}

        {/* Payment */}
        {/* <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Total:</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="flex gap-2">
                <Button
                  variant={paymentMethod === "cash" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("cash")}
                >
                  Cash
                </Button>
                <Button
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("card")}
                >
                  Card
                </Button>
                <Button variant={paymentMethod === "upi" ? "default" : "outline"} onClick={() => setPaymentMethod("upi")}>
                  UPI
                </Button>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              disabled={isLoading || cart.length === 0 || !selectedCustomer}
            >
              {isLoading ? "Processing..." : `Complete Sale - ${formatCurrency(grandTotal)}`}
            </Button>
          </CardContent>
        </Card> */}





        {/* New Customer Dialog */}
        {/* Simple HTML Modal for New Customer */}
        {showNewCustomerDialog && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-50" 
              onClick={() => setShowNewCustomerDialog(false)}
            ></div>
            
            {/* Modal Content */}
            <div className="relative bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 p-6 border-4 border-blue-500">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Create New Customer</h2>
                <button 
                  onClick={() => setShowNewCustomerDialog(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  ×
                </button>
              </div>
              
              <p className="text-gray-600 mb-4">Add a new customer to your salon database.</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">First Name *</Label>
                    <Input
                      value={newCustomer.firstName}
                      onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })}
                      placeholder="Enter first name"
                      className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Last Name</Label>
                    <Input
                      value={newCustomer.lastName}
                      onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })}
                      placeholder="Enter last name"
                      className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Phone</Label>
                  <Input
                    type="tel"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    placeholder="Enter phone number"
                    className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Email</Label>
                  <Input
                    type="email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    placeholder="Enter email address"
                    className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowNewCustomerDialog(false)} 
                  className="border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  onClick={handleSaveNewCustomer} 
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Customer
                </Button>
              </div>
            </div>
          </div>
        )}


        
        

        {/* Bill Details Dialog */}
        <Dialog open={showBillDetailsDialog} onOpenChange={setShowBillDetailsDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto border-gray-200 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-800">
                <Receipt className="h-5 w-5 text-indigo-600" />
                Bill Details - {selectedBill?.receiptNumber}
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Detailed view of the selected bill
              </DialogDescription>
            </DialogHeader>
            {selectedBill && (
              <div className="space-y-4">
                {/* Bill Header */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border border-gray-200">
                  <div>
                    <p className="text-sm text-gray-600">Receipt Number</p>
                    <p className="font-semibold text-gray-800">{selectedBill.receiptNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Date & Time</p>
                    <p className="font-semibold text-gray-800">
                      {format(new Date(selectedBill.date), "dd MMM yyyy")} at {selectedBill.time}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Customer</p>
                    <p className="font-semibold text-gray-800">{selectedBill.clientName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-2xl font-bold text-indigo-600">₹{selectedBill.total?.toFixed(2)}</p>
                  </div>
                </div>

                {/* Bill Items */}
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">Items</h4>
                  <div className="space-y-2">
                    {selectedBill.items?.map((item: any, index: number) => (
                      <div key={item.id || index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{item.name}</p>
                          <p className="text-sm text-gray-600">
                            Qty: {item.quantity} × ₹{item.price?.toFixed(2)}
                            {item.staffName && ` • Staff: ${item.staffName}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-800">₹{getDisplayTotal(item).toFixed(2)}</p>
                          {item.discount > 0 && (
                            <p className="text-xs text-red-600">
                              -₹{((item.price * item.quantity * item.discount) / 100).toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment Information */}
                {selectedBill.payments && selectedBill.payments.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-3">Payment Methods</h4>
                    <div className="space-y-2">
                      {selectedBill.payments.map((payment: any, index: number) => (
                        <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <span className="capitalize font-medium text-gray-700">{payment.type}</span>
                          <span className="font-semibold text-gray-800">₹{payment.amount?.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Additional Details */}
                {(selectedBill.notes || selectedBill.staffName) && (
                  <div className="space-y-3">
                    {selectedBill.staffName && (
                      <div>
                        <p className="text-sm text-gray-600">Staff Member</p>
                        <p className="font-semibold text-gray-800">{selectedBill.staffName}</p>
                      </div>
                    )}
                    {selectedBill.notes && (
                      <div>
                        <p className="text-sm text-gray-600">Notes</p>
                        <p className="font-medium text-gray-800">{selectedBill.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBillDetailsDialog(false)} className="border-gray-200 text-gray-700 hover:bg-gray-50">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Receipt Dialog */}
        <ReceiptDialog
          receipt={currentReceipt}
          open={showReceiptDialog}
          onOpenChange={setShowReceiptDialog}
          onReceiptUpdate={(updatedReceipt) => {
            setCurrentReceipt(updatedReceipt)
            toast({ title: "Success", description: "Receipt updated successfully" })
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-white/80 backdrop-blur-sm pr-96">
        <div className="p-8 space-y-8 max-h-screen overflow-y-auto">
          {billLoading ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <p className="text-sm font-medium">Loading bill details...</p>
              </div>
            </div>
          ) : (
          <>
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                {mode === "edit" ? "Edit Bill" : mode === "exchange" ? "Exchange Products" : "Quick Sale"}
              </h2>
              <p className="text-muted-foreground">
                {mode === "edit" ? "Edit existing bill details" : mode === "exchange" ? "Exchange products in this bill" : "Create and process sales quickly and efficiently"}
              </p>
            </div>
            {(mode === "edit" || mode === "exchange") && initialSale && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3 shrink-0">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Edit className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <p className="font-semibold text-amber-900">
                    {mode === "edit" ? "Editing Bill" : "Exchanging Products"}: {initialSale.billNo || initialSale.receiptNumber}
                    {initialSale.isEdited && <span className="text-xs text-gray-500 ml-1">(edited)</span>}
                  </p>
                  <p className="text-sm text-amber-700">
                    Original Date: {initialSale.date ? format(new Date(initialSale.date), "dd MMM yyyy") : "N/A"}
                    {initialSale.tip && initialSale.tip > 0 && (
                      <span className="ml-2">• Tip: {formatCurrency(initialSale.tip)}</span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Customer and Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 relative" ref={customerSearchRef}>
              <Label htmlFor="customer" className="text-sm font-semibold text-gray-700">
                Customer * {mode === "edit" && <span className="text-xs text-gray-500 ml-2">(Locked)</span>}
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="customer"
                  type="tel"
                  placeholder="Search by name, phone (10 digits), or email"
                  value={customerSearch}
                  disabled={mode === "edit"}
                  className={cn(
                    "pl-10 h-12 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20 transition-all duration-300",
                    mode === "edit" ? "bg-gray-100 cursor-not-allowed" : ""
                  )}
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
                />
              </div>

              {/* Customer Dropdown */}
              {showCustomerDropdown && customerSearch && (
                <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-auto backdrop-blur-sm">
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customer, index) => (
                      <div
                        key={`${customer._id || customer.id}-${customer.phone}-${index}`}
                        className="p-4 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 cursor-pointer border-b last:border-b-0 transition-all duration-200 group"
                        onClick={() => handleCustomerSelect(customer)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg group-hover:from-indigo-200 group-hover:to-purple-200 transition-all duration-200">
                            <User className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-800 group-hover:text-indigo-800 transition-colors duration-200">{customer.name}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {customer.phone}
                              </span>
                              {customer.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {customer.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      className="p-4 text-center text-muted-foreground hover:bg-gradient-to-r hover:from-emerald-50 hover:to-green-50 cursor-pointer transition-all duration-200 group"
                      onClick={handleCreateNewCustomer}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className="p-2 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg group-hover:from-emerald-200 group-hover:to-green-200 transition-all duration-200">
                          <User className="h-4 w-4 text-emerald-600" />
                        </div>
                        <span className="font-medium">Create new customer: &quot;{customerSearch}&quot;</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Selected Customer Details */}
              {selectedCustomer && (
                <div className={cn(
                  "mt-4 p-6 rounded-xl shadow-sm",
                  membershipData?.plan?.planName?.toLowerCase().includes("gold")
                    ? "bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-100/80 border border-amber-200/60"
                    : "bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border border-indigo-100/50"
                )}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-3 rounded-xl shadow-md",
                        membershipData?.plan?.planName?.toLowerCase().includes("gold")
                          ? "bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600"
                          : "bg-gradient-to-br from-indigo-500 to-purple-600"
                      )}>
                        <User className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-800 text-lg">{selectedCustomer.name}</h4>
                        <p className="text-sm text-gray-600">{selectedCustomer.phone}</p>
                        {selectedCustomer.email && (
                          <p className="text-sm text-gray-600">{selectedCustomer.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        {membershipData?.subscription && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              membershipData?.plan?.planName?.toLowerCase().includes("gold")
                                ? "bg-amber-50 text-amber-800 border-amber-300"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            )}
                          >
                            {membershipData?.plan?.planName || "Membership Applied"}
                          </Badge>
                        )}
                        <Badge variant={selectedCustomer.status === "active" ? "default" : "secondary"} className="px-3 py-1">
                          {selectedCustomer.status}
                        </Badge>
                      </div>
                      {membershipData?.subscription?.expiryDate && (
                        <p className="text-xs text-gray-500">
                          Valid Till: {format(new Date(membershipData.subscription.expiryDate), "dd MMM yyyy")}
                        </p>
                      )}
                    </div>
                    {(selectedCustomer.totalDues || 0) > 0 && (
                      <div 
                        className="text-center p-3 bg-red-50/80 rounded-lg border border-red-200/50 cursor-pointer hover:bg-red-100/80 hover:border-red-300 transition-all duration-200"
                        onClick={async () => {
                          if (selectedCustomer) {
                            await fetchUnpaidBills(selectedCustomer.name)
                            setShowDuesDialog(true)
                          }
                        }}
                      >
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <CreditCard className="h-4 w-4 text-red-600" />
                          <span className="text-xs font-medium text-red-700">Dues</span>
                        </div>
                        <p className="text-lg font-bold text-red-700">₹{Number(selectedCustomer.totalDues || 0).toFixed(2)}</p>
                      </div>
                    )}
                  </div>

                  <div className={`grid ${(selectedCustomer.totalDues || 0) > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-4 mb-4`}>
                    <div className={cn(
                      "text-center p-3 rounded-lg border",
                      membershipData?.plan?.planName?.toLowerCase().includes("gold")
                        ? "bg-amber-50/60 border-amber-200/50"
                        : "bg-white/60 border-white/50"
                    )}>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <CalendarDays className={cn(
                          "h-4 w-4",
                          membershipData?.plan?.planName?.toLowerCase().includes("gold") ? "text-amber-600" : "text-indigo-600"
                        )} />
                        <span className="text-xs font-medium text-gray-700">Visits</span>
                      </div>
                      <p className={cn(
                        "text-lg font-bold",
                        membershipData?.plan?.planName?.toLowerCase().includes("gold") ? "text-amber-700" : "text-indigo-700"
                      )}>{selectedCustomer.totalVisits || 0}</p>
                    </div>
                    <div className={cn(
                      "text-center p-3 rounded-lg border",
                      membershipData?.plan?.planName?.toLowerCase().includes("gold")
                        ? "bg-amber-50/60 border-amber-200/50"
                        : "bg-white/60 border-white/50"
                    )}>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <TrendingUp className={cn(
                          "h-4 w-4",
                          membershipData?.plan?.planName?.toLowerCase().includes("gold") ? "text-amber-600" : "text-emerald-600"
                        )} />
                        <span className="text-xs font-medium text-gray-700">Revenue</span>
                      </div>
                      <p className={cn(
                        "text-lg font-bold",
                        membershipData?.plan?.planName?.toLowerCase().includes("gold") ? "text-amber-700" : "text-emerald-700"
                      )}>₹{Number(selectedCustomer.totalSpent || 0).toFixed(2)}</p>
                    </div>
                    <div className={cn(
                      "text-center p-3 rounded-lg border",
                      membershipData?.plan?.planName?.toLowerCase().includes("gold")
                        ? "bg-amber-50/60 border-amber-200/50"
                        : "bg-white/60 border-white/50"
                    )}>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <CalendarIcon className={cn(
                          "h-4 w-4",
                          membershipData?.plan?.planName?.toLowerCase().includes("gold") ? "text-amber-600" : "text-purple-600"
                        )} />
                        <span className="text-xs font-medium text-gray-700">Last Visit</span>
                      </div>
                      <p className={cn(
                        "text-sm font-semibold",
                        membershipData?.plan?.planName?.toLowerCase().includes("gold") ? "text-amber-700" : "text-purple-700"
                      )}>
                        {selectedCustomer.lastVisit ? format(new Date(selectedCustomer.lastVisit), "dd MMM") : "Never"}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewBillActivity}
                    className={cn(
                      "w-full h-10 text-sm transition-all duration-300",
                      membershipData?.plan?.planName?.toLowerCase().includes("gold")
                        ? "bg-amber-50/80 hover:bg-amber-50 border-amber-200 text-amber-800 hover:text-amber-900 hover:border-amber-300"
                        : "bg-white/80 hover:bg-white border-indigo-200 text-indigo-700 hover:text-indigo-800 hover:border-indigo-300"
                    )}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Bill Activity
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-700">
                Date {mode === "edit" && <span className="text-xs text-gray-500 ml-2">(Locked)</span>}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={mode === "edit"}
                    className={cn(
                      "w-full justify-start text-left font-normal h-12 border-gray-200 hover:border-indigo-300 focus:border-indigo-500 focus:ring-indigo-500/20 transition-all duration-300",
                      !selectedDate && "text-muted-foreground",
                      mode === "edit" && "bg-gray-100 cursor-not-allowed",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "dd MMM, yyyy") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                {mode !== "edit" && (
                  <PopoverContent className="w-auto p-0 border-gray-200 shadow-xl" align="start">
                    <DatePicker
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date: Date | undefined) => { if (date) setSelectedDate(date) }}
                      initialFocus
                    />
                  </PopoverContent>
                )}
              </Popover>
            </div>
          </div>


          {/* Services Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-gray-800">Services</h3>
                <p className="text-sm text-muted-foreground">Add services to the sale</p>
              </div>
              <Button onClick={addServiceItem} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                <Plus className="h-4 w-4 mr-2" />
                Add Service
              </Button>
            </div>

            {serviceItems.length > 0 && (
              <div className="border border-gray-200 rounded-xl shadow-sm bg-white">
                <div className="grid grid-cols-[2fr_2fr_120px_100px_100px_100px_40px] gap-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 font-semibold text-sm text-gray-700 border-b sticky top-0 bg-white z-10">
                  <div>Service *</div>
                  <div>Staff *</div>
                  <div>Qty</div>
                  <div>Price (₹)</div>
                  <div>Disc. (%)</div>
                  <div>Total (₹)</div>
                  <div></div>
                </div>

                <div style={{ overflow: 'visible' }}>
                  {serviceItems.map((item, serviceIndex) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[2fr_2fr_120px_100px_100px_100px_40px] gap-4 p-4 border-b last:border-b-0 items-center hover:bg-gray-50/50 transition-all duration-200"
                  >
                    <div className="relative" data-quicksale-dropdown>
                      {item.serviceId ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between h-8 px-3 py-1 bg-muted rounded-md text-sm">
                            <span className="truncate">
                              {services.find(s => (s._id || s.id) === item.serviceId)?.name || 'Unknown Service'}
                            </span>
                            <button
                              onClick={() => updateServiceItem(item.id, "serviceId", "")}
                              className="ml-2 h-4 w-4 text-muted-foreground hover:text-foreground"
                            >
                              ×
                            </button>
                          </div>
                          {(item.isMembershipFree || (item.membershipDiscountPercent ?? 0) > 0) && (
                            <span className="text-xs text-emerald-600">
                              {item.isMembershipFree ? "Free via Membership" : `${item.membershipDiscountPercent}% Membership Discount`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          <Input
                            placeholder="Search services..."
                            value={serviceDropdownSearch}
                            onChange={(e) => setServiceDropdownSearch(e.target.value)}
                            className="h-8 pl-7 pr-8 text-sm"
                            onFocus={(e) => {
                              e.target.select()
                              setActiveServiceDropdown(item.id)
                            }}
                          />
                          {serviceDropdownSearch && (
                            <button
                              onClick={() => {
                                setServiceDropdownSearch("")
                                setActiveServiceDropdown(null)
                              }}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      )}
                      {activeServiceDropdown === item.id && (
                        <div className="absolute top-full left-0 right-0 z-[9999] mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                          {loadingServices ? (
                            <div className="p-2 text-center text-sm text-muted-foreground">Loading services...</div>
                          ) : (
                            <>
                              {filteredServicesForDropdown.length === 0 ? (
                                <div className="p-2 text-center text-sm text-muted-foreground">
                                  {serviceDropdownSearch ? `No services found matching "${serviceDropdownSearch}"` : 'No services available'}
                                </div>
                              ) : (
                                <div className="py-1">
                                  {categoryOrder.map((category) => (
                                    <div key={category} className="mb-2 last:mb-0">
                                      <div className="px-3 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                                        {category}
                                      </div>
                                      {servicesByCategory[category].map((service) => (
                                        <div
                                          key={service._id || service.id}
                                          className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm transition-colors"
                                          onClick={() => {
                                            updateServiceItem(item.id, "serviceId", service._id || service.id)
                                            setServiceDropdownSearch("")
                                            setActiveServiceDropdown(null)
                                          }}
                                        >
                                          <User className="h-4 w-4 text-slate-400 shrink-0" />
                                          <span className="flex-1 font-medium text-slate-800 truncate">{service.name}</span>
                                          <span className="text-slate-600 shrink-0">{formatCurrency(service.price ?? service.offerPrice ?? 0)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <MultiStaffSelector
                      key={`service-${item.id}-staff`}
                      staffList={getAvailableStaffList(
                        services.find((s) => (s._id || s.id) === item.serviceId)?.duration ?? 60,
                        [...new Set([
                          ...(item.staffContributions || []).map((c) => c.staffId).filter(Boolean),
                          ...serviceItems.filter((s) => s.id !== item.id).flatMap((s) => (s.staffContributions || []).map((c) => c.staffId).filter(Boolean)),
                        ])],
                        serviceIndex
                      )}
                      serviceTotal={item.total}
                      compact
                      selectStaffFlex={1.5}
                      addStaffFlex={0.5}
                      onStaffContributionsChange={(contributions) => {
                        console.log('=== MULTI STAFF SELECTOR CALLBACK (SERVICE) ===')
                        console.log('Item ID:', item.id)
                        console.log('Contributions:', contributions)
                        updateServiceItem(item.id, "staffContributions", contributions)
                        // Also update staffId for backward compatibility (use first staff member)
                        if (contributions.length > 0) {
                          console.log('Setting staffId to:', contributions[0].staffId)
                          updateServiceItem(item.id, "staffId", contributions[0].staffId)
                        } else {
                          console.log('Clearing staffId')
                          updateServiceItem(item.id, "staffId", "")
                        }
                      }}
                      initialContributions={item.staffContributions || []}
                      disabled={loadingStaff}
                    />

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 p-0 bg-transparent"
                        onClick={() => updateServiceItem(item.id, "quantity", Math.max(1, item.quantity - 1))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <div className="w-8 text-center text-sm font-medium">{item.quantity}</div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 p-0 bg-transparent"
                        onClick={() => updateServiceItem(item.id, "quantity", item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    <Input
                      type="number"
                      value={focusedZeroInputKey === `service-price-${item.id}` && item.price === 0 ? "" : item.price}
                      onChange={(e) => updateServiceItem(item.id, "price", Number(e.target.value))}
                      onFocus={() => setFocusedZeroInputKey(`service-price-${item.id}`)}
                      onBlur={() => setFocusedZeroInputKey(null)}
                      className="h-8"
                    />

                    <Input
                      type="number"
                      value={
                        focusedZeroInputKey === `service-discount-${item.id}` && (isGlobalDiscountActive ? discountPercentage : item.discount) === 0
                          ? ""
                          : isGlobalDiscountActive ? discountPercentage : item.discount
                      }
                      onChange={(e) => updateServiceItem(item.id, "discount", Number(e.target.value))}
                      onFocus={() => setFocusedZeroInputKey(`service-discount-${item.id}`)}
                      onBlur={() => setFocusedZeroInputKey(null)}
                      className={`h-8 ${(isGlobalDiscountActive || isValueDiscountActive) ? 'bg-amber-50 border-amber-200' : ''}`}
                      disabled={isGlobalDiscountActive || isValueDiscountActive}
                      placeholder={(isGlobalDiscountActive || isValueDiscountActive) ? "Global discount" : "0"}
                    />

                    <div className="text-sm font-medium">
                      ₹{getDisplayTotal(item).toFixed(2)}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      onClick={() => removeServiceItem(item.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Products Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-gray-800">Products</h3>
                <p className="text-sm text-muted-foreground">Add products to the sale</p>
              </div>
              <Button onClick={addProductItem} className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </div>

            {productItems.length > 0 && (
              <div className="border border-gray-200 rounded-xl shadow-sm bg-white">
                <div className="grid grid-cols-[2fr_2fr_120px_100px_100px_100px_40px] gap-4 p-4 bg-gradient-to-r from-emerald-50 to-green-50 font-semibold text-sm text-gray-700 border-b sticky top-0 bg-white z-10">
                  <div>Product *</div>
                  <div>Staff *</div>
                  <div>Qty</div>
                  <div>Price (₹)</div>
                  <div>Disc. (%)</div>
                  <div>Total (₹)</div>
                  <div></div>
                </div>

                <div style={{ overflow: 'visible' }}>
                  {productItems.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <div className="grid grid-cols-[2fr_2fr_120px_100px_100px_100px_40px] gap-4 p-4 border-b last:border-b-0 items-center hover:bg-emerald-50/30 transition-all duration-200">
                      <div className="relative" data-quicksale-dropdown>
                        {item.productId ? (
                          <div className="flex items-center justify-between h-8 px-3 py-1 bg-muted rounded-md text-sm">
                            <span className="truncate">
                              {products.find(p => (p._id || p.id) === item.productId)?.name || 'Unknown Product'}
                            </span>
                            <button
                              onClick={() => updateProductItem(item.id, "productId", "")}
                              className="ml-2 h-4 w-4 text-muted-foreground hover:text-foreground"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input
                              placeholder="Search products..."
                              value={productDropdownSearch}
                              onChange={(e) => setProductDropdownSearch(e.target.value)}
                              className="h-8 pl-7 pr-8 text-sm"
                              onFocus={(e) => {
                                e.target.select()
                                setActiveProductDropdown(item.id)
                              }}
                            />
                            {productDropdownSearch && (
                              <button
                                onClick={() => {
                                  setProductDropdownSearch("")
                                  setActiveProductDropdown(null)
                                }}
                                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        )}
                        {activeProductDropdown === item.id && (
                          <div className="absolute top-full left-0 right-0 z-[9999] mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                            {loadingProducts ? (
                              <div className="p-2 text-center text-sm text-muted-foreground">Loading products...</div>
                            ) : (
                              <>
                                {filteredProductsForDropdown.length === 0 ? (
                                  <div className="p-2 text-center text-sm text-muted-foreground">
                                    {productDropdownSearch ? `No products found matching "${productDropdownSearch}"` : 'No products available'}
                                  </div>
                                ) : (
                                  <div className="py-1">
                                    {productCategoryOrder.map((category) => (
                                      <div key={category} className="mb-2 last:mb-0">
                                        <div className="px-3 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                                          {category}
                                        </div>
                                        {productsByCategory[category].map((product) => (
                                          <div
                                            key={product._id || product.id}
                                            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm transition-colors"
                                            onClick={() => {
                                              updateProductItem(item.id, "productId", product._id || product.id)
                                              setProductDropdownSearch("")
                                              setActiveProductDropdown(null)
                                            }}
                                          >
                                            <Package className="h-4 w-4 text-slate-400 shrink-0" />
                                            <span className="flex-1 min-w-0">
                                              <span className="font-medium text-slate-800 truncate block">{product.name}</span>
                                              <span className="text-xs text-slate-500">Stock: {product.stock ?? 0}</span>
                                            </span>
                                            <span className="text-slate-600 shrink-0">{formatCurrency(product.price ?? product.offerPrice ?? 0)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <Select
                        key={`product-${item.id}-staff`}
                        value={item.staffId}
                        onValueChange={(value) => updateProductItem(item.id, "staffId", value)}
                      >
                        <SelectTrigger className="h-8">
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
                              const availableStaff = getAvailableStaffList(15, item.staffId ? [item.staffId] : undefined)
                              const validStaff = availableStaff.filter((member) => {
                                const validId = member._id || member.id
                                const isValid = validId && validId.toString().trim() !== ''
                                return isValid
                              })
                              
                              if (validStaff.length === 0) {
                                return (
                                  <SelectItem value="no-valid-staff" disabled>
                                    No valid staff available
                                  </SelectItem>
                                )
                              }
                              
                              return validStaff.map((member) => {
                                const staffId = member._id || member.id
                                return (
                                  <SelectItem key={staffId} value={staffId}>
                                    {member.name}
                                  </SelectItem>
                                )
                              })
                            })()
                          )}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 p-0 bg-transparent"
                          onClick={() => updateProductItem(item.id, "quantity", Math.max(1, item.quantity - 1))}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <div className="w-8 text-center text-sm font-medium">{item.quantity}</div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 p-0 bg-transparent"
                          onClick={() => updateProductItem(item.id, "quantity", item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <Input
                        type="number"
                        value={focusedZeroInputKey === `product-price-${item.id}` && item.price === 0 ? "" : item.price}
                        onChange={(e) => updateProductItem(item.id, "price", Number(e.target.value))}
                        onFocus={() => setFocusedZeroInputKey(`product-price-${item.id}`)}
                        onBlur={() => setFocusedZeroInputKey(null)}
                        className="h-8"
                      />

                      <Input
                        type="number"
                        value={
                          focusedZeroInputKey === `product-discount-${item.id}` && (isGlobalDiscountActive ? discountPercentage : item.discount) === 0
                            ? ""
                            : isGlobalDiscountActive ? discountPercentage : item.discount
                        }
                        onChange={(e) => updateProductItem(item.id, "discount", Number(e.target.value))}
                        onFocus={() => setFocusedZeroInputKey(`product-discount-${item.id}`)}
                        onBlur={() => setFocusedZeroInputKey(null)}
                        className={`h-8 ${(isGlobalDiscountActive || isValueDiscountActive) ? 'bg-amber-50 border-amber-200' : ''}`}
                        disabled={isGlobalDiscountActive || isValueDiscountActive}
                        placeholder={(isGlobalDiscountActive || isValueDiscountActive) ? "Global discount" : "0"}
                      />

                      <div className="text-sm font-medium">
                        ₹{getDisplayTotal(item).toFixed(2)}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                        onClick={() => removeProductItem(item.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    {/* Stock Warning */}
                    {item.productId && (() => {
                      const product = products.find((p) => p._id === item.productId || p.id === item.productId)
                      if (product && item.quantity > product.stock) {
                        return (
                          <div className="px-3 text-xs text-red-600 font-medium">
                            ⚠️ Insufficient stock! Available: {product.stock}, Requested: {item.quantity}
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>

          {/* Add Items Section */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={addItemSection === 'membership' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  const next = addItemSection === 'membership' ? null : 'membership'
                  setAddItemSection(next)
                  if (next === 'membership' && membershipItems.length === 0 && selectedCustomer && !membershipData?.subscription && plans.length > 0) {
                    addMembershipItem()
                  }
                }}
              >
                Add Membership
              </Button>
              <Button
                type="button"
                variant={addItemSection === 'gift-voucher' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAddItemSection((prev) => (prev === 'gift-voucher' ? null : 'gift-voucher'))}
              >
                Add Gift Voucher
              </Button>
              <Button
                type="button"
                variant={addItemSection === 'prepaid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAddItemSection((prev) => (prev === 'prepaid' ? null : 'prepaid'))}
              >
                Add Prepaid Plans
              </Button>
            </div>
            <div className="mt-4">
              {addItemSection === 'membership' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {selectedCustomer
                      ? membershipData?.subscription
                        ? "Customer already has an active membership."
                        : "Add a membership plan to assign on checkout."
                      : "Select a customer above to add membership."}
                  </p>
                  {membershipItems.length > 0 && (
                    <div className="border border-gray-200 rounded-xl shadow-sm bg-white">
                      <div className="grid grid-cols-[2fr_1.5fr_100px_100px_100px_40px] gap-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 font-semibold text-sm text-gray-700 border-b">
                        <div>Plan *</div>
                        <div>Staff *</div>
                        <div>Qty</div>
                        <div>Price (₹)</div>
                        <div>Total (₹)</div>
                        <div></div>
                      </div>
                      {membershipItems.map((item) => (
                        <div
                          key={item.id}
                          className="grid grid-cols-[2fr_1.5fr_100px_100px_100px_40px] gap-4 p-4 border-b last:border-b-0 items-center hover:bg-indigo-50/30 transition-all duration-200"
                        >
                          <Select
                            value={item.planId || "__none__"}
                            onValueChange={(v) => updateMembershipItem(item.id, "planId", v === "__none__" ? "" : v)}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select plan" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Select plan</SelectItem>
                              {plans.map((p) => (
                                <SelectItem key={p._id} value={p._id}>
                                  {p.planName} — ₹{Number(p.price || 0).toFixed(2)} ({p.durationInDays} days)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={item.staffId || "__none__"}
                            onValueChange={(v) => updateMembershipItem(item.id, "staffId", v === "__none__" ? "" : v)}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select staff" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Select staff</SelectItem>
                              {getAvailableStaffList(15, item.staffId ? [item.staffId] : undefined).map((member) => {
                                const staffId = member._id || member.id
                                return (
                                  <SelectItem key={staffId} value={staffId}>
                                    {member.name}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 p-0"
                              onClick={() => updateMembershipItem(item.id, "quantity", Math.max(1, item.quantity - 1))}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <div className="w-8 text-center text-sm font-medium">{item.quantity}</div>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 p-0"
                              onClick={() => updateMembershipItem(item.id, "quantity", item.quantity + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <Input
                            type="number"
                            value={item.price}
                            readOnly
                            className="h-8 bg-muted"
                          />
                          <div className="text-sm font-medium">₹{getDisplayTotal(item).toFixed(2)}</div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeMembershipItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {addItemSection === 'gift-voucher' && null}
              {addItemSection === 'prepaid' && null}
            </div>
          </div>

          {/* Discounts & Offers */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Discounts & Offers</h3>
              {(isGlobalDiscountActive || isValueDiscountActive) && (
                <div className="text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                  ⚠️ {isValueDiscountActive ? 'Value discount active' : 'Global discount active'} - Individual discounts disabled
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discount-value">Disc. by Value</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-sm">₹</span>
                  <Input
                    id="discount-value"
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="pl-8"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="discount-percentage">Disc. by Percentage</Label>
                <div className="relative">
                  <Input
                    id="discount-percentage"
                    type="number"
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className={`pr-8 ${isValueDiscountActive ? 'bg-amber-50 border-amber-200' : ''}`}
                    placeholder="0"
                    disabled={isValueDiscountActive}
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gift-voucher">Redeem Gift Voucher</Label>
                <Input
                  id="gift-voucher"
                  value={giftVoucher}
                  onChange={(e) => setGiftVoucher(e.target.value)}
                  placeholder="Eg: YKL/VPPM"
                />
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Billing Summary Sidebar - Fixed Position */}
      <div className="w-96 bg-white border-l border-gray-100 shadow-xl h-[calc(100vh-5rem)] flex flex-col fixed right-0 top-20 z-50">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-50 bg-white flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">Billing Summary</h3>
          <p className="text-sm text-gray-500 mt-1">Review and complete the sale</p>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div className="px-6 py-4 space-y-2 flex-1">
            {/* Order Summary: Service Total → Discounts → Sub Total → GST → Total → Tip → Grand Total */}
            <div className="bg-gray-50/50 rounded-xl p-2 space-y-1 border border-gray-200">
              {/* 1. Service Total (price × qty for services only) */}
              <div className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600">Service Total</span>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(billingServiceTotal)}</span>
              </div>

              {/* Product Total (when products present) */}
              {productItems.length > 0 && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">Product Total</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(billingProductTotal)}</span>
                </div>
              )}

              {/* 2. Discounts (Manual + Global) */}
              <div className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600">Discounts</span>
                <span className={`text-sm font-medium ${discounts > 0 ? "text-red-500" : "text-gray-500"}`}>
                  {discounts > 0 ? `-${formatCurrency(discounts)}` : formatCurrency(0)}
                </span>
              </div>

              {/* 3. Sub Total */}
              <div className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600">Sub Total</span>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(subTotal)}</span>
              </div>

              {/* 4. GST - expandable dropdown for SGST/CGST */}
              <div>
                <button
                  type="button"
                  onClick={() => setSummaryExpanded((v) => !v)}
                  className="flex w-full justify-between items-center py-1 hover:bg-gray-100/50 rounded-md transition-colors -mx-1 px-1"
                >
                  <span className="text-sm text-gray-600">GST{priceInclusiveOfTax ? " (included)" : ""}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(totalTax)}</span>
                    {summaryExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                    )}
                  </div>
                </button>
                {summaryExpanded && (
                  <div className="pl-2 space-y-0.5 border-l-2 border-gray-200 ml-1">
                    {serviceTax > 0 && (
                      <>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">CGST @ {serviceCGSTRate.toFixed(1)}%</span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(serviceCGST)}</span>
                        </div>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">SGST @ {serviceSGSTRate.toFixed(1)}%</span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(serviceSGST)}</span>
                        </div>
                      </>
                    )}
                    {productTaxByCategory.map((categoryTax) => (
                      <div key={categoryTax.category}>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">CGST @ {categoryTax.cgstRate.toFixed(1)}% ({categoryTax.categoryLabel})</span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(categoryTax.cgst)}</span>
                        </div>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">SGST @ {categoryTax.sgstRate.toFixed(1)}% ({categoryTax.categoryLabel})</span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(categoryTax.sgst)}</span>
                        </div>
                      </div>
                    ))}
                    {totalTax === 0 && (
                      <div className="text-sm text-gray-500 py-0.5">No tax applied</div>
                    )}
                  </div>
                )}
              </div>

              {/* 5. Total (Sub Total + GST with round off) */}
              <div className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600">Total</span>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(baseRounded)}</span>
              </div>
              {Math.abs(roundOff) > 0.01 && (
                <div className="flex justify-between text-sm pl-2">
                  <span className="text-gray-500">Round Off</span>
                  <span className="font-medium text-gray-700">{formatCurrency(roundOff)}</span>
                </div>
              )}

              {/* 6. Tip (Optional) */}
              <div className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600">Tip (Optional)</span>
                {tip > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(tip)}</span>
                    <button
                      onClick={handleTipClick}
                      className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                      title="Edit tip amount"
                    >
                      <Pencil className="h-3 w-3 text-gray-500 hover:text-gray-700" />
                    </button>
                    <button
                      onClick={() => { setTip(0); setTipStaffId(null) }}
                      className="p-1 hover:bg-red-50 rounded-md transition-colors"
                      title="Remove tip"
                    >
                      <Trash2 className="h-3 w-3 text-gray-500 hover:text-red-600" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleTipClick}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    Add
                  </button>
                )}
              </div>

              {/* 7. Grand Total */}
              <div className="border-t border-gray-200 pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-gray-900">Grand Total</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(roundedTotal)}</span>
                </div>
              </div>
            </div>

            {/* Change Display - Modern */}
            <div className="bg-emerald-50/50 rounded-xl p-2 border border-emerald-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-emerald-700">Change</span>
                <span className="text-sm font-bold text-emerald-600">{formatCurrency(change)}</span>
              </div>
            </div>

            {/* Remarks - Modern */}
            <div className="space-y-1">
              <Label className="text-sm font-medium text-gray-700">Remarks</Label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Add remarks..."
                className="h-12 text-sm resize-none rounded-lg border-gray-200 focus:border-indigo-300 focus:ring-indigo-200"
              />
            </div>

            {/* Payment Section - Modern */}
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1">
                <span className="text-base font-semibold text-gray-900">Payable Amount</span>
                <span className="text-xl font-bold text-indigo-600">{formatCurrency(roundedTotal)}</span>
              </div>

              {/* Payment Methods - Modern Grid */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">Payment Methods</h4>
                
                <div className="grid grid-cols-3 gap-3">
                  {/* Cash - click to fill payable amount; darker background when selected (amount > 0) */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setCashAmount(roundedTotal)
                      setCardAmount(0)
                      setOnlineAmount(0)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCashAmount(roundedTotal); setCardAmount(0); setOnlineAmount(0); } }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-colors cursor-pointer ${cashAmount > 0 ? 'bg-green-200 border-green-400 hover:bg-green-300' : 'bg-green-50/50 border-green-200 hover:bg-green-50'}`}
                  >
                    <span className="text-sm font-medium text-green-700">Cash</span>
                    <Input
                      type="number"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full h-8 text-sm border-green-300 text-center rounded-lg focus:border-green-400 focus:ring-green-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ textAlign: 'center' }}
                      placeholder="0"
                    />
                  </div>

                  {/* Card - click to fill payable amount; darker background when selected (amount > 0) */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setCardAmount(roundedTotal)
                      setCashAmount(0)
                      setOnlineAmount(0)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardAmount(roundedTotal); setCashAmount(0); setOnlineAmount(0); } }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-colors cursor-pointer ${cardAmount > 0 ? 'bg-blue-200 border-blue-400 hover:bg-blue-300' : 'bg-blue-50/50 border-blue-200 hover:bg-blue-50'}`}
                  >
                    <span className="text-sm font-medium text-blue-700">Card</span>
                    <Input
                      type="number"
                      value={cardAmount}
                      onChange={(e) => setCardAmount(Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full h-8 text-sm border-blue-300 text-center rounded-lg focus:border-blue-400 focus:ring-blue-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ textAlign: 'center' }}
                      placeholder="0"
                    />
                  </div>

                  {/* Online - click to fill payable amount; darker background when selected (amount > 0) */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setOnlineAmount(roundedTotal)
                      setCashAmount(0)
                      setCardAmount(0)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOnlineAmount(roundedTotal); setCashAmount(0); setCardAmount(0); } }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-colors cursor-pointer ${onlineAmount > 0 ? 'bg-purple-200 border-purple-400 hover:bg-purple-300' : 'bg-purple-50/50 border-purple-200 hover:bg-purple-50'}`}
                  >
                    <span className="text-sm font-medium text-purple-700">Online</span>
                    <Input
                      type="number"
                      value={onlineAmount}
                      onChange={(e) => setOnlineAmount(Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full h-8 text-sm border-purple-300 text-center rounded-lg focus:border-purple-400 focus:ring-purple-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ textAlign: 'center' }}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* Processing Fees - Modern */}
              {paymentSettings?.enableProcessingFees && (cardAmount > 0 || onlineAmount > 0) && (
                <div className="p-2 bg-amber-50/50 rounded-xl border border-amber-200">
                  <div className="text-sm font-semibold text-amber-800 mb-1">Processing Fees</div>
                  {cardAmount > 0 && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-amber-700">Card ({paymentSettings?.processingFee || 2.9}%)</span>
                      <span className="text-sm font-semibold text-red-600">
                        {formatCurrency((cardAmount * (paymentSettings?.processingFee || 2.9)) / 100)}
                      </span>
                    </div>
                  )}
                  {onlineAmount > 0 && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-amber-700">Online ({paymentSettings?.processingFee || 2.9}%)</span>
                      <span className="text-sm font-semibold text-red-600">
                        {formatCurrency((onlineAmount * (paymentSettings?.processingFee || 2.9)) / 100)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Total Paid - Modern */}
              <div className="bg-emerald-50/50 rounded-xl p-2 border border-emerald-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-emerald-700">Total Paid</span>
                  <span className="text-sm font-bold text-emerald-600">{formatCurrency(totalPaid)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons - Modern */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white flex-shrink-0">
          <div className="flex gap-3">
            <Button 
              onClick={() => {
                console.log('🔍 Checkout button clicked!')
                console.log('🔍 roundedTotal:', roundedTotal)
                console.log('🔍 totalPaid:', totalPaid)
                console.log('🔍 isProcessing:', isProcessing)
                
                if (isProcessing) {
                  console.log('❌ Already processing, ignoring click')
                  return
                }
                
                if (roundedTotal <= 0) {
                  toast({
                    title: "Invalid Amount",
                    description: "Total amount must be greater than 0",
                    variant: "destructive",
                  })
                  return
                }
                
                // Edit mode: ask for reason first if not yet provided
                if (mode === "edit" && !editReason.trim()) {
                  setTempEditReason("")
                  setShowEditReasonModal(true)
                  return
                }
                
                if (totalPaid < roundedTotal) {
                  console.log('💰 Opening payment modal for partial/unpaid bill')
                  setShowPaymentModal(true)
                } else {
                  console.log('✅ Full payment, proceeding with checkout')
                  handleCheckout()
                }
              }} 
              disabled={isProcessing || roundedTotal <= 0} 
              className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4 mr-2" />
                  {mode === "edit" ? "Save Changes" : mode === "exchange" ? "Complete Exchange" : `Checkout - ${formatCurrency(roundedTotal)}`}
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={resetForm} 
              className="flex-1 h-10 text-sm font-medium rounded-lg border-gray-200 hover:bg-gray-50 transition-all duration-200"
            >
              Reset
            </Button>
          </div>
        </div>
      </div>
      
      {/* Tip Modal */}
      <Dialog open={showTipModal} onOpenChange={setShowTipModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-indigo-600" />
              Add Tip
            </DialogTitle>
            <DialogDescription>
              Enter the tip amount for this transaction
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tip-amount" className="text-sm font-medium">
                Tip Amount
              </Label>
              <Input
                id="tip-amount"
                type="number"
                value={tempTipAmount}
                onChange={(e) => setTempTipAmount(Number(e.target.value))}
                placeholder="0"
                className="text-lg"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tip-staff" className="text-sm font-medium">
                Staff for Tip
              </Label>
              <Select
                value={tipStaffId || ""}
                onValueChange={(value) => setTipStaffId(value || null)}
              >
                <SelectTrigger id="tip-staff" className="h-9">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.length === 0 ? (
                    <SelectItem value="__no_staff" disabled>
                      No staff available
                    </SelectItem>
                  ) : (
                    staff.map((s) => {
                      const id = s._id || s.id
                      return (
                        <SelectItem key={id} value={id}>
                          {s.name || "Unnamed Staff"}
                        </SelectItem>
                      )
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleTipCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTipOk}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Reason Modal - shown when user clicks Save Changes in edit mode */}
      <Dialog open={showEditReasonModal} onOpenChange={(open) => {
        setShowEditReasonModal(open)
        if (!open) setTempEditReason("")
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-amber-600" />
              Edit Reason Required
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for editing this bill (required for audit purposes).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-reason-modal" className="text-sm font-medium">
                Edit Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="edit-reason-modal"
                placeholder="Please provide a reason for editing this bill..."
                value={tempEditReason}
                onChange={(e) => setTempEditReason(e.target.value)}
                className="min-h-[100px] border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                autoFocus
              />
              {!tempEditReason.trim() && (
                <p className="text-xs text-red-600">Edit reason is required to save changes</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditReasonModal(false)
                setTempEditReason("")
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const reason = tempEditReason.trim()
                if (!reason) {
                  toast({
                    title: "Edit Reason Required",
                    description: "Please provide a reason for editing this bill",
                    variant: "destructive",
                  })
                  return
                }
                setEditReason(reason)
                setShowEditReasonModal(false)
                setTempEditReason("")
                if (totalPaid < roundedTotal) {
                  setShowPaymentModal(true)
                } else {
                  handleCheckout(reason)
                }
              }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* New Customer Modal */}
      {showNewCustomerDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '32px',
            borderRadius: '20px',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 32px 64px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(20px)',
            animation: 'slideIn 0.3s ease-out'
          }}>
            {/* Header with Icon */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
              paddingBottom: '20px',
              borderBottom: '2px solid #f3f4f6'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: '#8b5cf6',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '20px',
                  fontWeight: 'bold'
                }}>
                  👤
                </div>
                <div>
                  <h2 style={{
                    color: '#111827',
                    fontSize: '28px',
                    fontWeight: '700',
                    margin: 0,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}>
                    Create New Customer
                  </h2>
                  <p style={{
                    color: '#6b7280',
                    fontSize: '14px',
                    margin: '4px 0 0 0',
                    fontWeight: '500'
                  }}>
                    Add a new customer to your salon database
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewCustomerDialog(false)}
                style={{
                  backgroundColor: '#f9fafb',
                  color: '#6b7280',
                  border: 'none',
                  borderRadius: '12px',
                  width: '36px',
                  height: '36px',
                  fontSize: '18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  fontWeight: 'bold'
                }}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#ef4444'
                  target.style.color = 'white'
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#f9fafb'
                  target.style.color = '#6b7280'
                }}
              >
                ×
              </button>
            </div>
            
            {/* Form Fields */}
            <div style={{marginBottom: '28px'}}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={newCustomer.firstName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })}
                    placeholder="Enter first name"
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '12px',
                      fontSize: '15px',
                      backgroundColor: '#fafafa',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#8b5cf6'
                      e.target.style.backgroundColor = 'white'
                      e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb'
                      e.target.style.backgroundColor = '#fafafa'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={newCustomer.lastName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })}
                    placeholder="Enter last name"
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '12px',
                      fontSize: '15px',
                      backgroundColor: '#fafafa',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#8b5cf6'
                      e.target.style.backgroundColor = 'white'
                      e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb'
                      e.target.style.backgroundColor = '#fafafa'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                </div>
              </div>
              
              <div style={{marginBottom: '20px'}}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => {
                    // Only allow digits and limit to 10
                    const value = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setNewCustomer({ ...newCustomer, phone: value })
                  }}
                  placeholder="Enter 10-digit phone number"
                  maxLength={10}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    border: newCustomer.phone && newCustomer.phone.length !== 10 ? '2px solid #ef4444' : '2px solid #e5e7eb',
                    borderRadius: '12px',
                    fontSize: '15px',
                    backgroundColor: '#fafafa',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = newCustomer.phone && newCustomer.phone.length !== 10 ? '#ef4444' : '#8b5cf6'
                    e.target.style.backgroundColor = 'white'
                    e.target.style.boxShadow = newCustomer.phone && newCustomer.phone.length !== 10 
                      ? '0 0 0 3px rgba(239, 68, 68, 0.1)' 
                      : '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = newCustomer.phone && newCustomer.phone.length !== 10 ? '#ef4444' : '#e5e7eb'
                    e.target.style.backgroundColor = '#fafafa'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {newCustomer.phone && newCustomer.phone.length > 0 && newCustomer.phone.length !== 10 && (
                  <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                    Phone number must be exactly 10 digits. Current: {newCustomer.phone.length} digits
                  </p>
                )}
              </div>
              
              <div style={{marginBottom: '20px'}}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  placeholder="Enter email address"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '12px',
                    fontSize: '15px',
                    backgroundColor: '#fafafa',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#8b5cf6'
                    e.target.style.backgroundColor = 'white'
                    e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e5e7eb'
                    e.target.style.backgroundColor = '#fafafa'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>
            
            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '16px',
              paddingTop: '20px',
              borderTop: '2px solid #f3f4f6'
            }}>
              <button 
                onClick={() => setShowNewCustomerDialog(false)}
                style={{
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '2px solid #e5e7eb',
                  padding: '14px 24px',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: '100px'
                }}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#f9fafb'
                  target.style.borderColor = '#d1d5db'
                  target.style.color = '#374151'
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = 'white'
                  target.style.borderColor = '#e5e7eb'
                  target.style.color = '#6b7280'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveNewCustomer}
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '14px 24px',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: '140px',
                  boxShadow: '0 4px 14px 0 rgba(139, 92, 246, 0.25)'
                }}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.transform = 'translateY(-2px)'
                  target.style.boxShadow = '0 8px 25px 0 rgba(139, 92, 246, 0.35)'
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.transform = 'translateY(0)'
                  target.style.boxShadow = '0 4px 14px 0 rgba(139, 92, 246, 0.25)'
                }}
              >
                ✨ Create Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-5 w-5 text-orange-600">⚠️</div>
              Payment Confirmation Required
            </DialogTitle>
            <DialogDescription>
              Please review the payment details before proceeding with checkout.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Payment Summary */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h4 className="font-medium text-slate-800 mb-3">Payment Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Bill Total:</span>
                  <span className="font-medium">₹{roundedTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount Paid:</span>
                  <span className="font-medium text-green-600">₹{totalPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-semibold">Remaining:</span>
                  <span className="font-bold text-red-600">₹{(roundedTotal - totalPaid).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Warning Message */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-5 w-5 text-orange-600">⚠️</div>
                <span className="font-medium text-orange-800">Important Notice</span>
              </div>
              <p className="text-sm text-orange-700">
                {totalPaid === 0 ? 
                  `This will create an UNPAID bill. Customer owes ₹${roundedTotal.toFixed(2)}` :
                  `This will create a PARTIALLY PAID bill. Customer owes ₹${(roundedTotal - totalPaid).toFixed(2)} more`
                }
              </p>
            </div>

            {/* Confirmation Checkbox */}
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="confirmUnpaid" 
                checked={confirmUnpaid} 
                onChange={(e) => setConfirmUnpaid(e.target.checked)}
                className="rounded border-orange-300"
              />
              <label htmlFor="confirmUnpaid" className="text-sm text-orange-700 cursor-pointer">
                I confirm this {totalPaid === 0 ? 'unpaid' : 'partially paid'} bill
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowPaymentModal(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                console.log('🔍 Modal button clicked!')
                console.log('🔍 confirmUnpaid:', confirmUnpaid)
                console.log('🔍 roundedTotal:', roundedTotal)
                console.log('🔍 totalPaid:', totalPaid)
                console.log('🔍 isProcessing:', isProcessing)
                
                if (isProcessing) {
                  console.log('❌ Already processing, ignoring click')
                  return
                }
                
                if (confirmUnpaid) {
                  console.log('✅ Checkbox confirmed, proceeding with checkout...')
                  setShowPaymentModal(false)
                  console.log('🔍 Calling handleCheckout...')
                  handleCheckout()
                } else {
                  console.log('❌ Checkbox not confirmed')
                  toast({
                    title: "Confirmation Required",
                    description: "Please confirm the unpaid/partial payment bill",
                    variant: "destructive",
                  })
                }
              }}
              disabled={!confirmUnpaid || isProcessing}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm & Checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Payment Collection Modal for Dues */}
      <PaymentCollectionModal
        isOpen={showDuesPaymentModal}
        onClose={() => {
          setShowDuesPaymentModal(false)
          setSelectedBillForPayment(null)
          setShowDuesDialog(true) // Reopen dues dialog when payment modal is closed
        }}
        sale={selectedBillForPayment}
        onPaymentCollected={handlePaymentCollected}
      />
      
      {/* Dues Settlement Dialog - Rendered at root level */}
      {showDuesDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex: 99999 }}>
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto" style={{ zIndex: 100000 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">Settle Dues - {selectedCustomer?.name}</h2>
              <Button 
                onClick={() => setShowDuesDialog(false)}
                variant="outline"
                size="sm"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {unpaidBills.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No pending bills found</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-red-600" />
                      <span className="font-semibold text-red-900">Total Outstanding</span>
                    </div>
                    <span className="text-2xl font-bold text-red-600">
                      ₹{unpaidBills.reduce((sum, bill) => sum + bill.remainingAmount, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                
                {unpaidBills.map((bill) => (
                  <div key={bill.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-800">Bill #{bill.billNo}</h3>
                        <p className="text-sm text-gray-600">
                          {format(new Date(bill.date), "dd MMM yyyy")} at {bill.time}
                        </p>
                        <p className="text-sm text-gray-600">Staff: {bill.staffName}</p>
                      </div>
                      <Badge variant="destructive">Partial</Badge>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mb-3 p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-xs text-gray-600">Total Amount</p>
                        <p className="text-lg font-semibold text-gray-900">₹{bill.totalAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Paid Amount</p>
                        <p className="text-lg font-semibold text-green-600">₹{bill.paidAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Remaining</p>
                        <p className="text-lg font-bold text-red-600">₹{bill.remainingAmount.toFixed(2)}</p>
                      </div>
                    </div>
                    
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleCollectPayment(bill)}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Collect Payment
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Bill Activity Dialog - Rendered at root level */}
      {showBillActivityDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex: 99999 }}>
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto" style={{ zIndex: 100000 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">Bill Activity - {selectedCustomer?.name}</h2>
              <Button 
                onClick={() => setShowBillActivityDialog(false)}
                variant="outline"
                size="sm"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {customerBills.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Receipt className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No bills found for this customer</p>
              </div>
            ) : (
              <div className="space-y-4">
                {customerBills.map((bill) => (
                  <div key={bill.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">
                          Bill #{bill.receiptNumber}
                          {(bill.isEdited === true || bill.editedAt) && <span className="text-xs text-gray-500 ml-1">(edited)</span>}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {bill.date} at {bill.time}
                        </p>
                        <p className="text-sm text-gray-600">
                          Staff: {bill.staffName}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right">
                          <p className="text-lg font-bold text-green-600">
                            ₹{bill.total.toFixed(2)}
                          </p>
                          <p className="text-sm text-gray-600">
                            {bill.payments?.[0]?.type || 'Cash'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/bills/${bill.receiptNumber || bill.id}/edit`)}
                            title="Edit Bill"
                            className="h-8"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          {bill.items && bill.items.some((item: any) => item.type === 'product') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                router.push(`/billing/${bill.receiptNumber || bill.billNo || bill.id}?mode=exchange`)
                              }}
                              title="Exchange Products"
                              className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/receipt/${bill.receiptNumber || bill.id}?returnTo=/quick-sale`)}
                            title="View Receipt"
                            className="h-8"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
