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
import { UsersAPI, SalesAPI, StaffPerformanceAPI, SettingsAPI, CommissionProfileAPI, StaffDirectoryAPI } from "@/lib/api"
import { CommissionProfileCalculator, StaffCommissionResult } from "@/lib/commission-profile-calculator"
import { CommissionProfile } from "@/lib/commission-profile-types"
import { useToast } from "@/hooks/use-toast"
import { useFeature } from "@/hooks/use-entitlements"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"

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

type DatePeriod = "currentMonth" | "previousMonth" | "customRange"

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

export function StaffPerformanceReport() {
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("currentMonth")
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

        switch (datePeriod) {
          case "currentMonth":
            startDate = new Date(now.getFullYear(), now.getMonth(), 1)
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0) // Last day of current month
            break
          case "previousMonth":
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            endDate = new Date(now.getFullYear(), now.getMonth(), 0) // Last day of previous month
            break
          case "customRange":
            // Use custom date range if set, otherwise default to current month
            if (dateRange?.from && dateRange?.to) {
              startDate = dateRange.from
              endDate = dateRange.to
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
        const salesResponse = await SalesAPI.getAll()
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
            // Process each item in the sale to get accurate staff attribution
            if (sale.items && Array.isArray(sale.items)) {
              sale.items.forEach((item: any) => {
                const itemStaffId = item.staffId || item.staffName || sale.staffId || sale.staffName
                const staffData = performanceMap.get(itemStaffId)
                
                if (staffData) {
                  // Update transaction count (only once per sale)
                  if (sale.items.indexOf(item) === 0) {
                    staffData.totalTransactions += 1
                    staffData.lastActivity = sale.date
                  }

                  // Update revenue and counts based on item type
                  if (item.type === "service") {
                    staffData.serviceCount += item.quantity || 1
                    const itemRevenue = item.total || (item.price * (item.quantity || 1))
                    staffData.totalRevenue += itemRevenue
                    
                    // Track service revenue separately
                    const currentServiceRevenue = staffServiceRevenue.get(itemStaffId) || 0
                    staffServiceRevenue.set(itemStaffId, currentServiceRevenue + itemRevenue)
                  } else if (item.type === "product") {
                    staffData.productCount += item.quantity || 1
                    const itemRevenue = item.total || (item.price * (item.quantity || 1))
                    staffData.totalRevenue += itemRevenue
                    
                    // Track product revenue separately
                    const currentProductRevenue = staffProductRevenue.get(itemStaffId) || 0
                    staffProductRevenue.set(itemStaffId, currentProductRevenue + itemRevenue)
                  }

                  // Track customers
                  const customerId = sale.customerId || sale.customerName
                  if (customerId) {
                    if (!staffCustomers.has(itemStaffId)) {
                      staffCustomers.set(itemStaffId, new Set())
                    }
                    staffCustomers.get(itemStaffId)!.add(customerId)

                    if (!customerStaffMap.has(customerId)) {
                      customerStaffMap.set(customerId, new Set())
                    }
                    customerStaffMap.get(customerId)!.add(itemStaffId)
                  }
                }
              })
            }
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
              const staffProfiles = commissionProfiles.filter(profile => 
                staff.commissionProfileIds?.includes(profile.id)
              )
              
              if (staffProfiles.length > 0) {
                // Get sales for this staff member
                const staffSales = filteredSales.filter(sale => 
                  sale.staffId === staffId || 
                  sale.items.some((item: any) => item.staffId === staffId || item.staffName === staffId)
                )
                
                const commissionResult = CommissionProfileCalculator.calculateMultipleSalesCommission(
                  staffSales,
                  staffProfiles,
                  staffId
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
              if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach((item: any) => {
                  const itemStaffId = item.staffId || item.staffName || sale.staffId || sale.staffName
                  const staffData = prevPerformanceMap.get(itemStaffId)
                  
                  if (staffData) {
                    if (sale.items.indexOf(item) === 0) {
                      staffData.totalTransactions += 1
                      staffData.lastActivity = sale.date
                    }

                    if (item.type === "service") {
                      staffData.serviceCount += item.quantity || 1
                      const itemRevenue = item.total || (item.price * (item.quantity || 1))
                      staffData.totalRevenue += itemRevenue
                      
                      const currentServiceRevenue = prevStaffServiceRevenue.get(itemStaffId) || 0
                      prevStaffServiceRevenue.set(itemStaffId, currentServiceRevenue + itemRevenue)
                    } else if (item.type === "product") {
                      staffData.productCount += item.quantity || 1
                      const itemRevenue = item.total || (item.price * (item.quantity || 1))
                      staffData.totalRevenue += itemRevenue
                      
                      const currentProductRevenue = prevStaffProductRevenue.get(itemStaffId) || 0
                      prevStaffProductRevenue.set(itemStaffId, currentProductRevenue + itemRevenue)
                    }

                    const customerId = sale.customerId || sale.customerName
                    if (customerId) {
                      if (!prevStaffCustomers.has(itemStaffId)) {
                        prevStaffCustomers.set(itemStaffId, new Set())
                      }
                      prevStaffCustomers.get(itemStaffId)!.add(customerId)

                      if (!prevCustomerStaffMap.has(customerId)) {
                        prevCustomerStaffMap.set(customerId, new Set())
                      }
                      prevCustomerStaffMap.get(customerId)!.add(itemStaffId)
                    }
                  }
                })
              }
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

  const handleExportPDF = () => {
    const doc = new jsPDF()
    
    // Title
    doc.setFontSize(20)
    doc.text("Staff Performance Report", 14, 22)
    
    // Date range
    doc.setFontSize(10)
    const dateRangeText = dateRange?.from && dateRange?.to 
      ? `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`
      : `Period: ${datePeriod}`
    doc.text(dateRangeText, 14, 30)
    
    // Summary
    doc.setFontSize(12)
    doc.text("Summary", 14, 40)
    doc.setFontSize(10)
    doc.text(`Total Revenue: ${formatCurrency(totalRevenue, currencySymbol)}`, 14, 50)
    doc.text(`Total Transactions: ${totalTransactions}`, 14, 58)
    doc.text(`Total Commission: ${formatCurrency(totalCommission, currencySymbol)}`, 14, 66)
    doc.text(`Average Performance Score: ${averagePerformanceScore.toFixed(1)}`, 14, 74)
    
    // Table
    const tableData = filteredPerformanceData.map(data => [
      data.staffName,
      formatCurrency(data.totalRevenue, currencySymbol),
      formatCurrency(data.serviceRevenue, currencySymbol),
      formatCurrency(data.productRevenue, currencySymbol),
      data.totalTransactions.toString(),
      data.serviceCount.toString(),
      data.productCount.toString(),
      formatCurrency(data.serviceCommission, currencySymbol),
      formatCurrency(data.productCommission, currencySymbol),
      formatCurrency(data.totalCommission, currencySymbol),
      data.customerCount.toString(),
      data.performanceScore.toFixed(1)
    ])
    
    autoTable(doc, {
      head: [["Staff", "Total Revenue", "Service Revenue", "Product Revenue", "Transactions", "Services", "Products", "Service Commission", "Product Commission", "Total Commission", "Customers", "Score"]],
      body: tableData,
      startY: 85,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [59, 130, 246] }
    })
    
    doc.save(`staff-performance-report-${format(new Date(), "yyyy-MM-dd")}.pdf`)
  }

  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      filteredPerformanceData.map(data => ({
        "Staff Name": data.staffName,
        "Total Revenue": data.totalRevenue,
        "Service Revenue": data.serviceRevenue,
        "Product Revenue": data.productRevenue,
        "Total Transactions": data.totalTransactions,
        "Service Count": data.serviceCount,
        "Product Count": data.productCount,
        "Service Commission": data.serviceCommission,
        "Product Commission": data.productCommission,
        "Total Commission": data.totalCommission,
        "Customer Count": data.customerCount,
        "Repeat Customers": data.repeatCustomers,
        "Performance Score": data.performanceScore,
        "Last Activity": data.lastActivity
      }))
    )
    
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Staff Performance")
    
    XLSX.writeFile(workbook, `staff-performance-report-${format(new Date(), "yyyy-MM-dd")}.xlsx`)
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
      <div className="space-y-8 p-6">
        {/* Header Section */}

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
            <CardTitle className="text-sm font-medium text-gray-900">Avg. Performance</CardTitle>
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

      {/* Filters Section */}
      <Card className="border-0 shadow-md">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="w-full sm:w-72">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 group-focus-within:text-blue-500 transition-colors" />
                  <Input
                    placeholder="Search staff members..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20 transition-all"
                  />
                </div>
              </div>

              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger className="w-full sm:w-52 h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20">
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
                  setDateRange(undefined) // Clear custom range when selecting other options
                }
              }}>
                <SelectTrigger className="w-full sm:w-52 h-11 border-gray-200 focus:border-blue-500 focus:ring-blue-500/20">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="currentMonth">Current Month</SelectItem>
                  <SelectItem value="previousMonth">Previous Month</SelectItem>
                  <SelectItem value="customRange">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {datePeriod === "customRange" && (
                <div className="flex flex-wrap gap-3 items-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full sm:w-52 justify-start text-left font-normal h-11 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all"
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {dateRange?.from ? format(dateRange.from, "MMM dd, yyyy") : "From Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 shadow-lg border-gray-200" align="start">
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
                        className="w-full sm:w-52 justify-start text-left font-normal h-11 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all"
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {dateRange?.to ? format(dateRange.to, "MMM dd, yyyy") : "To Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 shadow-lg border-gray-200" align="start">
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
                    onClick={() => setDateRange(undefined)}
                    variant="outline"
                    className="h-11 px-4 border-gray-200 hover:border-red-500 hover:bg-red-50 hover:text-red-600 transition-all"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>

            {canExport ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-auto h-11 border-gray-200 hover:border-green-500 hover:bg-green-50 hover:text-green-600 transition-all">
                    <Download className="h-4 w-4 mr-2" />
                    Export Data
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
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
                variant="outline" 
                className="w-full sm:w-auto h-11 border-gray-200 bg-gray-100 cursor-not-allowed" 
                disabled
                title="Data export requires Professional or Enterprise plan"
              >
                <Download className="h-4 w-4 mr-2" />
                Export (Upgrade Required)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Performance Table */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50/50 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-gray-800">Staff Performance Details</CardTitle>
              <CardDescription className="text-gray-600 mt-1">
                Comprehensive performance metrics and commission tracking for each staff member
              </CardDescription>
            </div>
            <Badge variant="outline" className="px-3 py-1">
              <BarChart3 className="h-3 w-3 mr-1" />
              Analytics
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50 hover:bg-gray-50">
                  <TableHead className="font-semibold text-gray-700">Staff Member</TableHead>
                  <TableHead className="font-semibold text-gray-700">Total Revenue</TableHead>
                  <TableHead className="font-semibold text-gray-700">Service Revenue</TableHead>
                  <TableHead className="font-semibold text-gray-700">Product Revenue</TableHead>
                  <TableHead className="font-semibold text-gray-700">Transactions</TableHead>
                  <TableHead className="font-semibold text-gray-700">Services</TableHead>
                  <TableHead className="font-semibold text-gray-700">Products</TableHead>
                  <TableHead className="font-semibold text-gray-700">Service Commission</TableHead>
                  <TableHead className="font-semibold text-gray-700">Product Commission</TableHead>
                  <TableHead className="font-semibold text-gray-700">Total Commission</TableHead>
                  <TableHead className="font-semibold text-gray-700">Customers</TableHead>
                  <TableHead className="font-semibold text-gray-700">Performance Trend</TableHead>
                  <TableHead className="font-semibold text-gray-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPerformanceData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-12">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                          <BarChart3 className="h-8 w-8 text-gray-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-800 mb-1">No Performance Data</h3>
                          <p className="text-gray-600">No staff performance data found for the selected criteria.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPerformanceData.map((data, index) => (
                  <TableRow key={data.staffId} className="hover:bg-blue-50/30 transition-colors group">
                    <TableCell className="font-semibold text-gray-800 group-hover:text-blue-700">
                      {data.staffName}
                    </TableCell>
                    <TableCell className="font-semibold text-emerald-700">
                      {formatCurrency(data.totalRevenue, currencySymbol)}
                    </TableCell>
                    <TableCell className="text-blue-600 font-medium">
                      {formatCurrency(data.serviceRevenue, currencySymbol)}
                    </TableCell>
                    <TableCell className="text-purple-600 font-medium">
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
                    <TableCell className="font-semibold text-amber-600">
                      {formatCurrency(data.serviceCommission, currencySymbol)}
                    </TableCell>
                    <TableCell className="font-semibold text-amber-600">
                      {formatCurrency(data.productCommission, currencySymbol)}
                    </TableCell>
                    <TableCell className="font-bold text-amber-700 text-lg">
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
                          <DropdownMenuItem className="cursor-pointer hover:bg-blue-50">
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
        </CardContent>
      </Card>

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
      </div>
    </div>
  )
}
