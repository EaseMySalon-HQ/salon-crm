"use client"

import { useState, useEffect } from "react"
import { Search, Download, Filter, TrendingUp, DollarSign, Users, MoreHorizontal, Eye, Calendar, Target, Award, BarChart3, ChevronDown, Receipt, FileText, FileSpreadsheet, ArrowUp, ArrowDown, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import type { DateRange } from "react-day-picker"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StaffServiceDetailDrawer } from "@/components/reports/staff-service-detail-drawer"
import { UsersAPI, SalesAPI, StaffPerformanceAPI, SettingsAPI, CommissionProfileAPI, StaffDirectoryAPI, ReportsAPI } from "@/lib/api"
import { CommissionProfileCalculator, StaffCommissionResult } from "@/lib/commission-profile-calculator"
import { CommissionProfile } from "@/lib/commission-profile-types"
import { splitLineRevenueByStaff } from "@/lib/staff-line-revenue"
import { useToast } from "@/hooks/use-toast"
import { useFeature } from "@/hooks/use-entitlements"

interface StaffMember {
  _id: string
  id?: string
  firstName: string
  lastName: string
  name: string
  email: string
  mobile: string
  role: string
  isActive: boolean
  hasLoginAccess: boolean
  allowAppointmentScheduling: boolean
  specialties: string[]
  commissionRate?: number
  serviceCommissionRate?: number
  productCommissionRate?: number
  commissionProfileIds?: string[]
}

interface StaffPerformanceData {
  staffId: string
  staffName: string
  totalRevenue: number
  serviceRevenue: number
  productRevenue: number
  serviceCount: number
  productCount: number
  totalTransactions: number
  serviceCommission: number
  productCommission: number
  totalCommission: number
  customerCount: number
  repeatCustomers: number
  lastActivity: string
  performanceScore: number
  effectiveCommissionRate: number
  profileBreakdown: Array<{
    profileId: string
    profileName: string
    commission: number
    revenue: number
    itemCount: number
  }>
}

interface SalesRecord {
  id: string
  billNo: string
  customerName: string
  date: string
  netTotal: number
  taxAmount: number
  grossTotal: number
  staffName: string
  items: Array<{
    name: string
    type: string
    quantity: number
    price: number
    total: number
    staffName: string
  }>
}

type DatePeriod = "today" | "yesterday" | "last7days" | "last30days" | "currentMonth" | "previousMonth" | "all" | "customRange"

// Utility function to format currency
const formatCurrency = (amount: number, symbol: string) => {
  return `${symbol}${amount.toFixed(2)}`
}

// Function to calculate performance trend
const getPerformanceTrend = (currentScore: number, previousScore: number) => {
  if (previousScore === 0) {
    return currentScore > 0 ? 'up' : 'neutral'
  }
  
  const change = ((currentScore - previousScore) / previousScore) * 100
  
  if (change > 5) return 'up'      // More than 5% improvement
  if (change < -5) return 'down'   // More than 5% decline
  return 'neutral'                 // Less than 5% change
}

/** Split each line by staffContributions (or single staff); attribute revenue & share of qty per staff. */
function applySaleToStaffPerformanceMaps(
  sale: any,
  performanceMap: Map<string, StaffPerformanceData>,
  staffServiceRevenue: Map<string, number>,
  staffProductRevenue: Map<string, number>,
  staffCustomers: Map<string, Set<string>>,
  customerStaffMap: Map<string, Set<string>>
) {
  const staffSeenInSale = new Set<string>()
  const saleFallback = { staffId: sale.staffId, staffName: sale.staffName }
  const items = sale.items
  if (!items || !Array.isArray(items)) return

  for (const item of items) {
    const splits = splitLineRevenueByStaff(item, saleFallback)
    if (splits.length === 0) continue

    const qty = Number(item.quantity) || 1
    const n = Math.max(1, splits.length)
    const customerId = sale.customerId || sale.customerName

    for (const { staffId, revenue } of splits) {
      if (!staffId || revenue <= 0) continue
      const staffData = performanceMap.get(staffId)
      if (!staffData) continue

      if (!staffSeenInSale.has(staffId)) {
        staffSeenInSale.add(staffId)
        staffData.totalTransactions += 1
        if (!staffData.lastActivity || String(sale.date) > String(staffData.lastActivity)) {
          staffData.lastActivity = sale.date
        }
      }

      if (item.type === "service") {
        staffData.serviceCount += qty / n
        staffData.totalRevenue += revenue
        staffServiceRevenue.set(staffId, (staffServiceRevenue.get(staffId) || 0) + revenue)
      } else if (item.type === "product") {
        staffData.productCount += qty / n
        staffData.totalRevenue += revenue
        staffProductRevenue.set(staffId, (staffProductRevenue.get(staffId) || 0) + revenue)
      }

      if (customerId) {
        if (!staffCustomers.has(staffId)) staffCustomers.set(staffId, new Set())
        staffCustomers.get(staffId)!.add(customerId)
        if (!customerStaffMap.has(customerId)) customerStaffMap.set(customerId, new Set())
        customerStaffMap.get(customerId)!.add(staffId)
      }
    }
  }
}

export function StaffPerformanceReport() {
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("today")
  const [selectedStaff, setSelectedStaff] = useState<string>("all")
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
  const [performanceData, setPerformanceData] = useState<StaffPerformanceData[]>([])
  const [previousMonthData, setPreviousMonthData] = useState<StaffPerformanceData[]>([])
  const [commissionData, setCommissionData] = useState<StaffCommissionResult[]>([])
  const [commissionProfiles, setCommissionProfiles] = useState<CommissionProfile[]>([])
  const [salesData, setSalesData] = useState<SalesRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCommissionModal, setShowCommissionModal] = useState(false)
  const [selectedStaffForCommission, setSelectedStaffForCommission] = useState<StaffMember | null>(null)
  const [commissionRates, setCommissionRates] = useState({
    serviceRate: 0,
    productRate: 0
  })
  const [paymentSettings, setPaymentSettings] = useState<any>(null)
  const [currencySymbol, setCurrencySymbol] = useState("$")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerStaffId, setDrawerStaffId] = useState<string | null>(null)
  const [drawerStaffName, setDrawerStaffName] = useState("")
  const [drawerStaffRole, setDrawerStaffRole] = useState<string | undefined>(undefined)

  // Load staff members and payment settings
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load staff members (includes business owners and staff)
        const staffResponse = await StaffDirectoryAPI.getAll()
        if (staffResponse.success) {
          setStaffMembers(staffResponse.data)
        }

        // Load payment settings for currency
        const paymentResponse = await SettingsAPI.getPaymentSettings()
        if (paymentResponse.success) {
          setPaymentSettings(paymentResponse.data)
          // Map currency codes to symbols
          const currencyMap: { [key: string]: string } = {
            'USD': '$', 'EUR': '€', 'GBP': '£', 'INR': '₹', 'JPY': '¥',
            'CAD': 'C$', 'AUD': 'A$', 'CHF': 'CHF', 'CNY': '¥', 'SGD': 'S$',
            'HKD': 'HK$', 'NZD': 'NZ$', 'KRW': '₩', 'MXN': 'MX$', 'BRL': 'R$',
            'RUB': '₽', 'ZAR': 'R', 'SEK': 'kr', 'NOK': 'kr', 'DKK': 'kr',
            'PLN': 'zł', 'CZK': 'Kč', 'HUF': 'Ft', 'ILS': '₪', 'AED': 'د.إ',
            'SAR': '﷼', 'QAR': '﷼', 'KWD': 'د.ك', 'BHD': 'د.ب', 'OMR': '﷼',
            'JOD': 'د.ا', 'LBP': 'ل.ل', 'EGP': '£', 'TRY': '₺', 'THB': '฿',
            'MYR': 'RM', 'IDR': 'Rp', 'PHP': '₱', 'VND': '₫', 'TWD': 'NT$',
            'PKR': '₨', 'BDT': '৳', 'LKR': '₨', 'NPR': '₨', 'MMK': 'K',
            'KHR': '៛', 'LAK': '₭', 'BND': 'B$', 'FJD': 'FJ$', 'PGK': 'K',
            'SBD': 'SI$', 'VUV': 'Vt', 'WST': 'WS$', 'TOP': 'T$', 'XPF': '₣'
          }
          const currencyCode = paymentResponse.data.currency || 'USD'
          setCurrencySymbol(currencyMap[currencyCode] || '$')
        }

        // Load commission profiles
        const profilesResponse = await CommissionProfileAPI.getProfiles()
        if (profilesResponse.success) {
          setCommissionProfiles(profilesResponse.data)
        }
      } catch (error) {
        console.error("Error loading initial data:", error)
        toast({
          title: "Error",
          description: "Failed to load initial data",
          variant: "destructive"
        })
      }
    }
    loadInitialData()
  }, [toast])

  // Load performance data
  useEffect(() => {
    const loadPerformanceData = async () => {
      setIsLoading(true)
      try {
        // Calculate date range based on period
        const now = new Date()
        let startDate: Date
        let endDate: Date = now

        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        switch (datePeriod) {
          case "today":
            startDate = new Date(today)
            endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
            break
          case "yesterday": {
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
            startDate = yesterday
            endDate = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
            break
          }
          case "last7days":
            startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
            endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
            break
          case "last30days":
            startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
            endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
            break
          case "currentMonth":
            startDate = new Date(now.getFullYear(), now.getMonth(), 1)
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0) // Last day of current month
            break
          case "previousMonth":
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            endDate = new Date(now.getFullYear(), now.getMonth(), 0) // Last day of previous month
            break
          case "all":
            startDate = new Date(0) // Beginning of time
            endDate = new Date()
            break
          case "customRange":
            // Use custom date range if set, otherwise default to current month
            if (dateRange?.from && dateRange?.to) {
              startDate = new Date(dateRange.from)
              startDate.setHours(0, 0, 0, 0)
              endDate = new Date(dateRange.to)
              endDate.setHours(23, 59, 59, 999)
            } else if (dateRange?.from) {
              startDate = new Date(dateRange.from)
              startDate.setHours(0, 0, 0, 0)
              endDate = new Date(dateRange.from)
              endDate.setHours(23, 59, 59, 999)
            } else {
              startDate = new Date(now.getFullYear(), now.getMonth(), 1)
              endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
            }
            break
          default: // fallback to current month
            startDate = new Date(now.getFullYear(), now.getMonth(), 1)
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        }


        // Fetch sales data
        const salesResponse = await SalesAPI.getAll({ limit: 10000 })
        if (salesResponse.success) {
          const allSales = salesResponse.data
          
          // Filter sales by date range
          const filteredSales = allSales.filter((sale: any) => {
            const saleDate = new Date(sale.date)
            return saleDate >= startDate && saleDate <= endDate
          })

          setSalesData(filteredSales)

          // Also fetch previous month's data for comparison (only for current month view)
          let previousMonthSales: any[] = []
          if (datePeriod === "currentMonth") {
            const prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0)
            
            try {
              const prevFilteredSales = allSales.filter((sale: any) => {
                const saleDate = new Date(sale.date)
                return saleDate >= prevStartDate && saleDate <= prevEndDate
              })
              previousMonthSales = prevFilteredSales
            } catch (error) {
              console.warn('Could not fetch previous month data:', error)
            }
          }

          // Calculate performance data for each staff member
          const performanceMap = new Map<string, StaffPerformanceData>()

          // Initialize performance data for all staff
          staffMembers.forEach(staff => {
            const staffId = staff._id || staff.id
            if (!staffId) return
            performanceMap.set(staffId, {
              staffId,
              staffName: staff.name,
              totalRevenue: 0,
              serviceRevenue: 0,
              productRevenue: 0,
              serviceCount: 0,
              productCount: 0,
              totalTransactions: 0,
              serviceCommission: 0,
              productCommission: 0,
              totalCommission: 0,
              customerCount: 0,
              repeatCustomers: 0,
              lastActivity: "",
              performanceScore: 0,
              effectiveCommissionRate: 0,
              profileBreakdown: []
            })
          })

          // Process sales data with proper staff attribution
          const customerStaffMap = new Map<string, Set<string>>() // customer -> staff set
          const staffCustomers = new Map<string, Set<string>>() // staff -> customer set
          const staffServiceRevenue = new Map<string, number>() // staff -> service revenue
          const staffProductRevenue = new Map<string, number>() // staff -> product revenue

          filteredSales.forEach((sale: any) => {
            applySaleToStaffPerformanceMaps(
              sale,
              performanceMap,
              staffServiceRevenue,
              staffProductRevenue,
              staffCustomers,
              customerStaffMap
            )
          })

          // Calculate additional metrics and commission
          performanceMap.forEach((data, staffId) => {
            // Calculate customer metrics
            const customers = staffCustomers.get(staffId) || new Set()
            data.customerCount = customers.size

            // Calculate repeat customers (customers who have multiple transactions with this staff)
            let repeatCustomers = 0
            customers.forEach(customerId => {
              const staffSet = customerStaffMap.get(customerId)
              if (staffSet && staffSet.size > 1) {
                repeatCustomers++
              }
            })
            data.repeatCustomers = repeatCustomers

            // Calculate performance score (enhanced scoring system)
            data.performanceScore = Math.min(100, 
              (data.totalRevenue / 1000) * 10 + // Revenue component
              (data.totalTransactions * 2) + // Transaction component
              (data.customerCount * 5) + // Customer component
              (data.repeatCustomers * 10) + // Repeat customer component
              (data.serviceCount * 0.5) + // Service component
              (data.productCount * 0.3) // Product component
            )

            // Set service and product revenue
            data.serviceRevenue = staffServiceRevenue.get(staffId) || 0
            data.productRevenue = staffProductRevenue.get(staffId) || 0

            // Calculate commission using commission profiles
            const staff = staffMembers.find(s => (s._id || s.id) === staffId)
            if (staff && staff.commissionProfileIds && staff.commissionProfileIds.length > 0) {
              const staffProfiles = commissionProfiles.filter(profile => {
                const profileId = profile.id ?? profile._id
                return profileId != null && staff.commissionProfileIds?.includes(profileId)
              })
              
              if (staffProfiles.length > 0) {
                // Get sales for this staff member (match by id or name so both old and new data work)
                const staffSales = filteredSales.filter((sale: any) => {
                  const saleStaffMatch = sale.staffId === staffId || sale.staffName === staff.name
                  const itemMatch = sale.items?.some((item: any) =>
                    item.staffId != null && String(item.staffId) === String(staffId) ||
                    item.staffName === staffId ||
                    item.staffName === staff.name
                  )
                  return saleStaffMatch || itemMatch
                })
                
                const commissionResult = CommissionProfileCalculator.calculateMultipleSalesCommission(
                  staffSales,
                  staffProfiles,
                  staffId,
                  staff.name
                )
                
                if (commissionResult) {
                  data.serviceCommission = commissionResult.serviceCommission
                  data.productCommission = commissionResult.productCommission
                  data.totalCommission = commissionResult.totalCommission
                  data.effectiveCommissionRate = commissionResult.effectiveCommissionRate
                  data.profileBreakdown = commissionResult.profileBreakdown
                } else {
                  data.serviceCommission = 0
                  data.productCommission = 0
                  data.totalCommission = 0
                  data.effectiveCommissionRate = 0
                  data.profileBreakdown = []
                }
              } else {
                data.serviceCommission = 0
                data.productCommission = 0
                data.totalCommission = 0
                data.effectiveCommissionRate = 0
                data.profileBreakdown = []
              }
            } else {
              data.serviceCommission = 0
              data.productCommission = 0
              data.totalCommission = 0
              data.effectiveCommissionRate = 0
              data.profileBreakdown = []
            }
          })

          // Calculate previous month's performance data for comparison
          let previousMonthPerformance: StaffPerformanceData[] = []
          if (previousMonthSales.length > 0) {
            const prevPerformanceMap = new Map<string, StaffPerformanceData>()

            // Initialize previous month performance data
            staffMembers.forEach(staff => {
              const staffId = staff._id || staff.id
              if (!staffId) return
              prevPerformanceMap.set(staffId, {
                staffId,
                staffName: staff.name,
                totalRevenue: 0,
                serviceRevenue: 0,
                productRevenue: 0,
                serviceCount: 0,
                productCount: 0,
                totalTransactions: 0,
                serviceCommission: 0,
                productCommission: 0,
                totalCommission: 0,
                customerCount: 0,
                repeatCustomers: 0,
                lastActivity: "",
                performanceScore: 0,
                effectiveCommissionRate: 0,
                profileBreakdown: []
              })
            })

            // Process previous month sales data
            const prevStaffCustomers = new Map<string, Set<string>>()
            const prevCustomerStaffMap = new Map<string, Set<string>>()
            const prevStaffServiceRevenue = new Map<string, number>()
            const prevStaffProductRevenue = new Map<string, number>()

            previousMonthSales.forEach((sale: any) => {
              applySaleToStaffPerformanceMaps(
                sale,
                prevPerformanceMap,
                prevStaffServiceRevenue,
                prevStaffProductRevenue,
                prevStaffCustomers,
                prevCustomerStaffMap
              )
            })

            // Calculate previous month metrics
            prevPerformanceMap.forEach((data, staffId) => {
              const customers = prevStaffCustomers.get(staffId) || new Set()
              data.customerCount = customers.size

              let repeatCustomers = 0
              customers.forEach(customerId => {
                const staffSet = prevCustomerStaffMap.get(customerId)
                if (staffSet && staffSet.size > 1) {
                  repeatCustomers++
                }
              })
              data.repeatCustomers = repeatCustomers

              data.performanceScore = Math.min(100, 
                (data.totalRevenue / 1000) * 10 +
                (data.totalTransactions * 2) +
                (data.customerCount * 5) +
                (data.repeatCustomers * 10) +
                (data.serviceCount * 0.5) +
                (data.productCount * 0.3)
              )

              data.serviceRevenue = prevStaffServiceRevenue.get(staffId) || 0
              data.productRevenue = prevStaffProductRevenue.get(staffId) || 0
            })

            previousMonthPerformance = Array.from(prevPerformanceMap.values())
          }

          setPreviousMonthData(previousMonthPerformance)

          // Convert to array and sort by performance score
          const performanceArray = Array.from(performanceMap.values())
            .sort((a, b) => b.performanceScore - a.performanceScore)

          setPerformanceData(performanceArray)

          // Calculate commission data using commission profiles
          const commissionSummaries = CommissionProfileCalculator.calculateAllStaffCommission(
            filteredSales,
            staffMembers.map(staff => ({
              _id: staff._id || staff.id || '',
              name: staff.name,
              commissionProfileIds: staff.commissionProfileIds || []
            })),
            commissionProfiles
          )
          setCommissionData(commissionSummaries)
        }
      } catch (error) {
        console.error("Error loading performance data:", error)
        toast({
          title: "Error",
          description: "Failed to load performance data",
          variant: "destructive"
        })
      } finally {
        setIsLoading(false)
      }
    }

    if (staffMembers.length > 0) {
      loadPerformanceData()
    }
  }, [staffMembers, datePeriod, dateRange, commissionProfiles, toast])

  // Filter performance data based on search and staff selection
  const filteredPerformanceData = performanceData.filter(data => {
    const matchesSearch = data.staffName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStaff = selectedStaff === "all" || data.staffId === selectedStaff
    return matchesSearch && matchesStaff
  })

  // Calculate summary statistics
  const totalRevenue = performanceData.reduce((sum, data) => sum + data.totalRevenue, 0)
  const totalTransactions = performanceData.reduce((sum, data) => sum + data.totalTransactions, 0)
  const totalCommission = performanceData.reduce((sum, data) => sum + data.totalCommission, 0)
  const averagePerformanceScore = performanceData.length > 0 
    ? performanceData.reduce((sum, data) => sum + data.performanceScore, 0) / performanceData.length 
    : 0

  function getStaffPerformanceExportFilters(): { dateFrom?: string; dateTo?: string; periodLabel: string; staffId?: string; currencySymbol: string } {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let from: Date
    let to: Date
    let periodLabel: string
    if (datePeriod === "customRange" && dateRange?.from && dateRange?.to) {
      from = dateRange.from
      to = dateRange.to
      periodLabel = `${format(from, "MMM dd, yyyy")} - ${format(to, "MMM dd, yyyy")}`
    } else if (datePeriod === "today") {
      from = today
      to = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      periodLabel = "Today"
    } else if (datePeriod === "yesterday") {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
      from = yesterday
      to = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
      periodLabel = "Yesterday"
    } else if (datePeriod === "last7days") {
      from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      to = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      periodLabel = "Last 7 days"
    } else if (datePeriod === "last30days") {
      from = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      to = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      periodLabel = "Last 30 days"
    } else if (datePeriod === "currentMonth") {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      periodLabel = "Current month"
    } else if (datePeriod === "previousMonth") {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      to = new Date(now.getFullYear(), now.getMonth(), 0)
      periodLabel = "Previous month"
    } else if (datePeriod === "all") {
      from = new Date(0)
      to = new Date()
      periodLabel = "All time"
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      periodLabel = "Current month"
    }
    const filters: { dateFrom?: string; dateTo?: string; periodLabel: string; staffId?: string; currencySymbol: string } = {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      periodLabel,
      currencySymbol
    }
    if (selectedStaff && selectedStaff !== "all") filters.staffId = selectedStaff
    return filters
  }

  const handleExportPDF = async () => {
    toast({ title: "Export requested", description: "Generating staff performance PDF...", duration: 3000 })
    try {
      const filters = getStaffPerformanceExportFilters()
      const result = await ReportsAPI.exportStaffPerformance("pdf", filters, filteredPerformanceData)
      if (result?.success) {
        toast({
          title: "Export successful",
          description: result.message || "Staff performance report has been generated and sent to admin email(s)."
        })
      } else throw new Error(result?.error || "Export failed")
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Failed to export PDF. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleExportExcel = async () => {
    toast({ title: "Export requested", description: "Generating staff performance Excel...", duration: 3000 })
    try {
      const filters = getStaffPerformanceExportFilters()
      const result = await ReportsAPI.exportStaffPerformance("xlsx", filters, filteredPerformanceData)
      if (result?.success) {
        toast({
          title: "Export successful",
          description: result.message || "Staff performance report has been generated and sent to admin email(s)."
        })
      } else throw new Error(result?.error || "Export failed")
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Failed to export Excel. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleSetCommission = (staff: StaffMember) => {
    setSelectedStaffForCommission(staff)
    // Commission rates are now managed through commission profiles
    setCommissionRates({
      serviceRate: 0,
      productRate: 0
    })
    setShowCommissionModal(true)
  }

  const handleSaveCommission = async () => {
    if (!selectedStaffForCommission) return

    try {
      // Commission rates are now managed through commission profiles
      // This function can be used to redirect to staff management or show a message
      toast({
        title: "Info",
        description: "Commission rates are now managed through commission profiles in Staff Management"
      })
      setShowCommissionModal(false)
      setSelectedStaffForCommission(null)
    } catch (error) {
      console.error("Error updating commission rates:", error)
      toast({
        title: "Error",
        description: "Failed to update commission rates",
        variant: "destructive"
      })
    }
  }

  // Effective date range for drawer (derived from report filters)
  const getEffectiveDrawerDateRange = (): DateRange | undefined => {
    const now = new Date()
    if (datePeriod === "customRange" && dateRange?.from && dateRange?.to) {
      return dateRange
    }
    if (datePeriod === "currentMonth") {
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0)
      }
    }
    if (datePeriod === "previousMonth") {
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0)
      }
    }
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) }
  }

  const openStaffDetailDrawer = (staffId: string, staffName: string) => {
    setDrawerStaffId(staffId)
    setDrawerStaffName(staffName)
    const staff = staffMembers.find(s => (s._id || s.id) === staffId)
    setDrawerStaffRole(staff?.role)
    setDrawerOpen(true)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Loading Performance Data</h3>
          <p className="text-gray-600">Fetching staff analytics and commission information...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Filter bar – same position as Sales */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <Input
                  placeholder="Search staff members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-52 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                  <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                    <SelectValue placeholder="All Staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    {staffMembers.map((staff) => {
                      const staffId = staff._id || staff.id
                      if (!staffId) return null
                      return (
                        <SelectItem key={staffId} value={staffId}>
                          {staff.name}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <Select value={datePeriod} onValueChange={(value: DatePeriod) => {
                  setDatePeriod(value)
                  if (value !== "customRange") {
                    setDateRange(undefined)
                  }
                }}>
                  <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last7days">Last 7 days</SelectItem>
                    <SelectItem value="last30days">Last 30 days</SelectItem>
                    <SelectItem value="currentMonth">Current month</SelectItem>
                    <SelectItem value="previousMonth">Previous month</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="customRange">Custom range</SelectItem>
                  </SelectContent>
                </Select>
                {datePeriod === "customRange" && (
                  <div className="flex flex-wrap gap-3 items-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-40 justify-start text-left font-normal border-slate-200"
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {dateRange?.from ? format(dateRange.from, "MMM dd, yyyy") : "From"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          initialFocus
                          mode="single"
                          selected={dateRange?.from}
                          onSelect={(date) => setDateRange(prev => ({ from: date, to: prev?.to }))}
                          disabled={(date) => date > new Date() || (dateRange?.to ? date > dateRange.to : false)}
                        />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-40 justify-start text-left font-normal border-slate-200"
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {dateRange?.to ? format(dateRange.to, "MMM dd, yyyy") : "To"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          initialFocus
                          mode="single"
                          selected={dateRange?.to}
                          onSelect={(date) => setDateRange(prev => ({ from: prev?.from, to: date }))}
                          disabled={(date) => date > new Date() || (dateRange?.from ? date < dateRange.from : false)}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDateRange(undefined)}
                      className="border-slate-200"
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {canExport ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium">
                        <Download className="h-4 w-4 mr-2" />
                        Export Report
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                        <FileText className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer">
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export as Excel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    className="bg-gray-400 cursor-not-allowed text-white px-6 py-2.5 shadow-md rounded-lg font-medium"
                    disabled
                    title="Data export requires Professional or Enterprise plan"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export (Upgrade Required)
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Total Revenue</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue, currencySymbol)}</div>
            <p className="text-sm text-gray-500">
              Across all staff members
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Total Transactions</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <Receipt className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">{totalTransactions}</div>
            <p className="text-sm text-gray-500">
              Completed transactions
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Total Commission</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <Award className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalCommission, currencySymbol)}</div>
            <p className="text-sm text-gray-500">
              Commission earned
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Average Performance Score</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <Target className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">{averagePerformanceScore.toFixed(1)}</div>
            <p className="text-sm text-gray-500">
              Performance score
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Table – same layout as Service List / Sales */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-slate-200">
                <TableHead className="font-semibold text-slate-800">Staff Name</TableHead>
                <TableHead className="font-semibold text-slate-800 text-right">Total Revenue</TableHead>
                <TableHead className="font-semibold text-slate-800 text-right">Service Revenue</TableHead>
                <TableHead className="font-semibold text-slate-800 text-right">Product Revenue</TableHead>
                <TableHead className="font-semibold text-slate-800">Transactions</TableHead>
                <TableHead className="font-semibold text-slate-800">Services</TableHead>
                <TableHead className="font-semibold text-slate-800">Products</TableHead>
                <TableHead className="font-semibold text-slate-800 text-right">Service Commission</TableHead>
                <TableHead className="font-semibold text-slate-800 text-right">Product Commission</TableHead>
                <TableHead className="font-semibold text-slate-800 text-right">Total Commission</TableHead>
                <TableHead className="font-semibold text-slate-800">Customers</TableHead>
                <TableHead className="font-semibold text-slate-800">Performance Trend</TableHead>
                <TableHead className="font-semibold text-slate-800">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPerformanceData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-12 text-slate-500">
                    No staff performance data found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPerformanceData.map((data, index) => (
                  <TableRow key={data.staffId} className="border-b border-slate-100 hover:bg-slate-50/50 group">
                    <TableCell className="font-semibold">
                      <button
                        type="button"
                        onClick={() => openStaffDetailDrawer(data.staffId, data.staffName)}
                        className="text-left text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded px-1 -mx-1"
                      >
                        {data.staffName}
                      </button>
                    </TableCell>
                    <TableCell className="font-semibold text-emerald-700 text-right">
                      {formatCurrency(data.totalRevenue, currencySymbol)}
                    </TableCell>
                    <TableCell className="text-blue-600 font-medium text-right">
                      {formatCurrency(data.serviceRevenue, currencySymbol)}
                    </TableCell>
                    <TableCell className="text-purple-600 font-medium text-right">
                      {formatCurrency(data.productRevenue, currencySymbol)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-medium">
                        {data.totalTransactions}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-medium">
                        {data.serviceCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-medium">
                        {data.productCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-amber-600 text-right">
                      {formatCurrency(data.serviceCommission, currencySymbol)}
                    </TableCell>
                    <TableCell className="font-semibold text-amber-600 text-right">
                      {formatCurrency(data.productCommission, currencySymbol)}
                    </TableCell>
                    <TableCell className="font-bold text-amber-700 text-lg text-right">
                      {formatCurrency(data.totalCommission, currencySymbol)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-center">
                        <Badge variant="outline" className="font-medium mb-1">
                          {data.customerCount}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {data.repeatCustomers} repeat
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const previousData = previousMonthData.find(prev => prev.staffId === data.staffId)
                          const trend = getPerformanceTrend(data.performanceScore, previousData?.performanceScore || 0)
                          
                          if (trend === 'up') {
                            return (
                              <div className="flex items-center gap-1 text-green-600">
                                <ArrowUp className="h-4 w-4" />
                                <span className="text-sm font-semibold">{data.performanceScore.toFixed(1)}</span>
                              </div>
                            )
                          } else if (trend === 'down') {
                            return (
                              <div className="flex items-center gap-1 text-red-600">
                                <ArrowDown className="h-4 w-4" />
                                <span className="text-sm font-semibold">{data.performanceScore.toFixed(1)}</span>
                              </div>
                            )
                          } else {
                            return (
                              <div className="flex items-center gap-1 text-gray-600">
                                <Minus className="h-4 w-4" />
                                <span className="text-sm font-semibold">{data.performanceScore.toFixed(1)}</span>
                              </div>
                            )
                          }
                        })()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-blue-100 transition-colors">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem 
                            onClick={() => handleSetCommission(staffMembers.find(s => (s._id || s.id) === data.staffId)!)}
                            className="cursor-pointer hover:bg-blue-50"
                          >
                            <Award className="h-4 w-4 mr-2" />
                            Manage Commission
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => openStaffDetailDrawer(data.staffId, data.staffName)}
                            className="cursor-pointer hover:bg-blue-50"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Commission Modal */}
      <Dialog open={showCommissionModal} onOpenChange={setShowCommissionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Commission Rates</DialogTitle>
            <DialogDescription>
              Set commission rates for {selectedStaffForCommission?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Service Commission Rate (%)</label>
              <Input
                type="number"
                value={commissionRates.serviceRate}
                onChange={(e) => setCommissionRates(prev => ({ ...prev, serviceRate: parseFloat(e.target.value) || 0 }))}
                placeholder="Enter service commission rate"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Product Commission Rate (%)</label>
              <Input
                type="number"
                value={commissionRates.productRate}
                onChange={(e) => setCommissionRates(prev => ({ ...prev, productRate: parseFloat(e.target.value) || 0 }))}
                placeholder="Enter product commission rate"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCommissionModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCommission}>
              Save Commission Rates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staff Service Detail Drawer */}
      <StaffServiceDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        staffId={drawerStaffId ?? ""}
        staffName={drawerStaffName}
        staffRole={drawerStaffRole}
        dateRange={getEffectiveDrawerDateRange()}
        currencySymbol={currencySymbol}
      />
    </div>
  )
}
