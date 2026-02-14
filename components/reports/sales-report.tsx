"use client"

import { useState, useEffect } from "react"
import { Download, Filter, TrendingUp, DollarSign, Users, MoreHorizontal, Eye, Pencil, Trash2, Receipt, AlertCircle, FileText, FileSpreadsheet, ChevronDown, Edit, RefreshCw, CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SalesAPI, ServicesAPI, StaffDirectoryAPI, ReportsAPI } from "@/lib/api"
import { ServiceListReport, type ServiceListControlledFilters, type DatePeriod as ServiceListDatePeriod } from "@/components/reports/service-list-report"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { useFeature } from "@/hooks/use-entitlements"

interface SalesRecord {
  id: string
  billNo: string
  customerName: string
  date: string
  paymentMode: string // Legacy support
  payments?: Array<{
    mode: string
    amount: number
  }>
  tip?: number
  netTotal: number
  taxAmount: number
  grossTotal: number
  status: "completed" | "partial" | "unpaid" | "cancelled"
  staffName: string
  tipStaffId?: string
  tipStaffName?: string
  isEdited?: boolean // Track if bill has been edited
  editedAt?: Date | string
  items?: Array<{ type: string; [key: string]: unknown }>
}

type DatePeriod = "today" | "yesterday" | "last7days" | "last30days" | "currentMonth" | "all" | "custom"

export function SalesReport() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  const [reportType, setReportType] = useState("sales")
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("today")
  const [paymentFilter, setPaymentFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [staffTipFilter, setStaffTipFilter] = useState<string>("all")
  const [salesStaff, setSalesStaff] = useState<{ _id: string; name: string }[]>([])
  const [salesData, setSalesData] = useState<SalesRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBill, setSelectedBill] = useState<SalesRecord | null>(null)
  const [isBillDialogOpen, setIsBillDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<SalesRecord | null>(null)

  // Service List filters (when report type is service-list; shown in same bar)
  const [serviceListDatePeriod, setServiceListDatePeriod] = useState<ServiceListDatePeriod>("today")
  const [serviceListDateRange, setServiceListDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [serviceListServiceFilter, setServiceListServiceFilter] = useState<string>("all")
  const [serviceListStaffFilter, setServiceListStaffFilter] = useState<string>("all")
  const [serviceListStatusFilter, setServiceListStatusFilter] = useState<string>("all")
  const [serviceListModeFilter, setServiceListModeFilter] = useState<string>("all")
  const [serviceListServices, setServiceListServices] = useState<{ _id: string; name: string; duration?: number }[]>([])
  const [serviceListStaff, setServiceListStaff] = useState<{ _id: string; name: string }[]>([])

  // Staff Tip report: payouts (for Mark as Paid)
  const [tipPayouts, setTipPayouts] = useState<{ staffId: string; staffName: string; amount: number; paidAt: string }[]>([])
  const [tipPayoutsLoading, setTipPayoutsLoading] = useState(false)

  // Summary report (same 10 metrics as daily summary email)
  const [summaryData, setSummaryData] = useState<{
    totalBillCount: number
    totalCustomerCount: number
    totalSales: number
    totalSalesCash: number
    totalSalesOnline: number
    totalSalesCard: number
    duesCollected: number
    cashExpense: number
    tipCollected: number
    cashBalance: number
  } | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Function to navigate to receipt page
  const handleViewReceipt = (sale: SalesRecord) => {
    router.push(`/receipt/${sale.billNo}`)
  }

  const handleEditBill = (sale: SalesRecord) => {
    router.push(`/billing/${sale.billNo}?mode=edit`)
  }

  const handleExchangeBill = (sale: SalesRecord) => {
    router.push(`/billing/${sale.billNo}?mode=exchange`)
  }


  // Mock data - replace with actual API call
  useEffect(() => {
    // Set default date range to today
    const today = new Date()
    const todayRange = {
      from: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
    }
    setDateRange(todayRange)
    
    async function fetchSales() {
      setLoading(true)
      try {
        const res = await SalesAPI.getAll()
        const apiData = res.data || []
        console.log('🔍 Raw API data received:', apiData)
        const mapped = apiData.map((sale: any) => {
          const mappedSale = {
            id: sale._id,
            billNo: sale.billNo,
            customerName: sale.customerName,
            date: sale.date,
            paymentMode: sale.paymentMode, // Legacy support
            payments: sale.payments || [], // New split payment structure
            tip: sale.tip || 0,
            tipStaffId: sale.tipStaffId,
            tipStaffName: sale.tipStaffName,
            netTotal: sale.netTotal,
            taxAmount: sale.taxAmount,
            grossTotal: sale.grossTotal,
            status: sale.status,
            staffName: sale.staffName,
            items: sale.items || [],
            isEdited: sale.isEdited === true || !!sale.editedAt, // Track if bill has been edited
            editedAt: sale.editedAt, // Include editedAt for fallback check
          }
          console.log(`📋 Mapped sale ${sale.billNo}:`, {
            paymentMode: mappedSale.paymentMode,
            payments: mappedSale.payments,
            hasPayments: !!mappedSale.payments.length,
            isEdited: mappedSale.isEdited,
            rawIsEdited: sale.isEdited,
            allSaleFields: Object.keys(sale)
          })
          return mappedSale
        })
        setSalesData(mapped)
      } catch (err) {
        setSalesData([])
      }
      setLoading(false)
    }
    fetchSales()
  }, [])

  // Fetch staff for Staff Tip dropdown when Sales or Staff Tip report is selected
  useEffect(() => {
    if (reportType !== "sales" && reportType !== "staff-tip") return
    let cancelled = false
    StaffDirectoryAPI.getAll()
      .then((res) => {
        if (!cancelled && res?.data && Array.isArray(res.data)) {
          setSalesStaff(res.data.map((s: any) => ({ _id: s._id, name: s.name || s.firstName || "—" })))
        } else if (!cancelled) setSalesStaff([])
      })
      .catch(() => { if (!cancelled) setSalesStaff([]) })
    return () => { cancelled = true }
  }, [reportType])

  // Function to get date range based on selected period
  const getDateRangeFromPeriod = (period: DatePeriod) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    switch (period) {
      case "today":
        return {
          from: today,
          to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
      case "yesterday":
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
        return {
          from: yesterday,
          to: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
      case "last7days":
        const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
        return {
          from: last7Days,
          to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
      case "last30days":
        const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
        return {
          from: last30Days,
          to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
      case "currentMonth":
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        return {
          from: firstDayOfMonth,
          to: new Date(lastDayOfMonth.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
      case "custom":
        return { from: undefined, to: undefined }
      case "all":
      default:
        return { from: undefined, to: undefined }
    }
  }

  // Handle date period change
  const handleDatePeriodChange = (period: DatePeriod) => {
    setDatePeriod(period)
    if (period === "custom") {
      // Default to last 7 days when switching to custom; user can change via picker
      const range = getDateRangeFromPeriod("last7days")
      setDateRange(range)
    } else if (period !== "all") {
      const newDateRange = getDateRangeFromPeriod(period)
      setDateRange(newDateRange)
    } else {
      setDateRange({})
    }
  }

  // Service list date range helper (same shape as ServiceListReport)
  const getServiceListDateRangeFromPeriod = (period: ServiceListDatePeriod) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    switch (period) {
      case "today":
        return { from: today, to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case "yesterday": {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
        return { from: yesterday, to: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1) }
      }
      case "last7days":
        return { from: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000), to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case "last30days":
        return { from: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000), to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
      case "currentMonth":
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) }
      case "all":
      default:
        return { from: undefined, to: undefined }
    }
  }

  const handleServiceListDatePeriodChange = (period: ServiceListDatePeriod) => {
    setServiceListDatePeriod(period)
    if (period !== "all" && period !== "custom") {
      setServiceListDateRange(getServiceListDateRangeFromPeriod(period))
    } else {
      setServiceListDateRange({})
    }
  }

  useEffect(() => {
    if (reportType !== "service-list") return
    let cancelled = false
    async function fetchServiceListOptions() {
      try {
        const [servicesRes, staffRes] = await Promise.all([
          ServicesAPI.getAll({ limit: 500 }),
          StaffDirectoryAPI.getAll()
        ])
        if (cancelled) return
        setServiceListServices((servicesRes?.data && Array.isArray(servicesRes.data)) ? servicesRes.data : [])
        const staffData = staffRes?.data && Array.isArray(staffRes.data) ? staffRes.data : []
        setServiceListStaff(staffData.map((s: any) => ({ _id: s._id, name: s.name || s.firstName || "—" })))
      } catch {
        if (!cancelled) {
          setServiceListServices([])
          setServiceListStaff([])
        }
      }
    }
    fetchServiceListOptions()
    return () => { cancelled = true }
  }, [reportType])

  // Fetch summary when Summary report is selected (uses same date range as sales)
  useEffect(() => {
    if (reportType !== "summary") return
    let cancelled = false
    setSummaryLoading(true)
    const params: { dateFrom?: string; dateTo?: string } = {}
    if (dateRange.from) params.dateFrom = dateRange.from.toISOString()
    if (dateRange.to) params.dateTo = dateRange.to.toISOString()
    // When "all" time, pass full year to date so backend returns a range
    if (!params.dateFrom && !params.dateTo && datePeriod === "all") {
      const now = new Date()
      params.dateFrom = new Date(now.getFullYear(), 0, 1).toISOString()
      params.dateTo = new Date(now.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
    }
    ReportsAPI.getSummary(params)
      .then((res) => {
        if (!cancelled && res?.success && res?.data) setSummaryData(res.data)
      })
      .catch(() => {
        if (!cancelled) setSummaryData(null)
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })
    return () => { cancelled = true }
  }, [reportType, datePeriod, dateRange.from, dateRange.to])

  // Fetch tip payouts when Staff Tip report is selected (for Paid state)
  useEffect(() => {
    if (reportType !== "staff-tip") return
    const range = dateRange.from && dateRange.to
      ? { from: dateRange.from, to: dateRange.to }
      : datePeriod !== "all" && datePeriod !== "custom"
        ? getDateRangeFromPeriod(datePeriod)
        : null
    const from = range?.from
    const to = range?.to
    if (!from || !to) {
      setTipPayouts([])
      return
    }
    let cancelled = false
    setTipPayoutsLoading(true)
    ReportsAPI.getTipPayouts({
      dateFrom: from.toISOString(),
      dateTo: to.toISOString()
    })
      .then((res) => {
        if (!cancelled && res?.success && res?.data) setTipPayouts(Array.isArray(res.data) ? res.data : [])
        else if (!cancelled) setTipPayouts([])
      })
      .catch(() => { if (!cancelled) setTipPayouts([]) })
      .finally(() => { if (!cancelled) setTipPayoutsLoading(false) })
    return () => { cancelled = true }
  }, [reportType, datePeriod, dateRange.from, dateRange.to])

  // Staff Tip aggregated rows: staff name, tip amount, paid state
  const staffTipDateRange = reportType === "staff-tip"
    ? (dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : datePeriod !== "all" && datePeriod !== "custom" ? getDateRangeFromPeriod(datePeriod) : null)
    : null
  const staffTipSales = reportType === "staff-tip" && staffTipDateRange && staffTipDateRange.from != null && staffTipDateRange.to != null
    ? salesData.filter((sale) => {
        const saleDate = new Date(sale.date)
        const inRange = saleDate >= staffTipDateRange.from! && saleDate <= staffTipDateRange.to!
        const hasTip = !!(sale.tip && sale.tip > 0) && (sale.tipStaffId || sale.tipStaffName)
        const matchesStaff = staffTipFilter === "all" || sale.tipStaffId === staffTipFilter
        return inRange && hasTip && matchesStaff
      })
    : []
  const staffTipAggregated = (() => {
    const map = new Map<string, { staffId: string; staffName: string; tipAmount: number }>()
    staffTipSales.forEach((sale) => {
      const id = (sale.tipStaffId || sale.tipStaffName || "").toString()
      const name = sale.tipStaffName || (salesStaff.find((s) => s._id === sale.tipStaffId)?.name) || "—"
      const existing = map.get(id)
      if (existing) {
        existing.tipAmount += sale.tip || 0
      } else {
        map.set(id, { staffId: id, staffName: name, tipAmount: sale.tip || 0 })
      }
    })
    return Array.from(map.values()).sort((a, b) => b.tipAmount - a.tipAmount)
  })()
  const staffTipPaidAmountByStaff = (() => {
    const map = new Map<string, number>()
    tipPayouts.forEach((p: any) => {
      const id = (p.staffId && typeof p.staffId === "object" ? p.staffId._id || p.staffId : p.staffId)?.toString() || ""
      map.set(id, (map.get(id) || 0) + (p.amount || 0))
    })
    return map
  })()

  const handleMarkTipAsPaid = async (row: { staffId: string; staffName: string; tipAmount: number }) => {
    const from = staffTipDateRange?.from
    const to = staffTipDateRange?.to
    if (!from || !to) return
    try {
      const res = await ReportsAPI.createTipPayout({
        staffId: row.staffId,
        staffName: row.staffName,
        amount: row.tipAmount,
        dateFrom: from.toISOString(),
        dateTo: to.toISOString()
      })
      if (res?.success) {
        toast({ title: "Marked as paid", description: `₹${row.tipAmount.toFixed(2)} paid to ${row.staffName}.` })
        const list = await ReportsAPI.getTipPayouts({
          dateFrom: from.toISOString(),
          dateTo: to.toISOString()
        })
        if (list?.success && list?.data) setTipPayouts(Array.isArray(list.data) ? list.data : [])
      } else throw new Error((res as any)?.error || "Failed")
    } catch (e: any) {
      toast({ title: "Failed to mark as paid", description: e?.message || "Please try again.", variant: "destructive" })
    }
  }

  // Enhanced filtering for split payments
  const filteredSales = salesData.filter((sale) => {
    const matchesSearch = 
      sale.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.billNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.staffName.toLowerCase().includes(searchTerm.toLowerCase())
    
    // Enhanced payment filtering for split payments
    let matchesPayment = true
    if (paymentFilter !== "all") {
      if (sale.payments && sale.payments.length > 0) {
        // Check if any payment matches the filter
        matchesPayment = sale.payments.some(payment => payment.mode === paymentFilter)
        if (matchesPayment) {
          console.log(`✅ Bill ${sale.billNo} matches ${paymentFilter} filter:`, {
            payments: sale.payments,
            matchingPayment: sale.payments.find(p => p.mode === paymentFilter)
          })
        }
      } else {
        // Legacy single payment mode
        matchesPayment = sale.paymentMode === paymentFilter
        if (matchesPayment) {
          console.log(`✅ Bill ${sale.billNo} matches ${paymentFilter} filter (legacy):`, sale.paymentMode)
        }
      }
    }
    
    const matchesStatus = statusFilter === "all" || sale.status === statusFilter

    // Staff Tip filter: show only sales where tip was given to selected staff
    const matchesStaffTip =
      staffTipFilter === "all" || (!!(sale.tip && sale.tip > 0) && sale.tipStaffId === staffTipFilter)
    
    // Date range filtering
    const saleDate = new Date(sale.date)
    const matchesDateRange = 
      (!dateRange.from || saleDate >= dateRange.from) &&
      (!dateRange.to || saleDate <= dateRange.to)
    
    return matchesSearch && matchesPayment && matchesStatus && matchesStaffTip && matchesDateRange
  })

  console.log(`🔍 Payment filter "${paymentFilter}" applied:`, {
    totalSales: salesData.length,
    filteredSales: filteredSales.length,
    filterType: paymentFilter
  })

  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.grossTotal, 0)
  const completedSales = filteredSales.filter(sale => sale.status === "completed").length
  const partialSales = filteredSales.filter(sale => sale.status === "partial").length
  const unpaidSales = filteredSales.filter(sale => sale.status === "unpaid").length
  const tipsCollected = filteredSales.reduce((sum, sale) => sum + (sale.tip || 0), 0)
  
  // Calculate cash and online collections (supporting both legacy and split payments)
  const cashCollected = filteredSales.reduce((sum, sale) => {
    if (sale.payments && sale.payments.length > 0) {
      // New split payment structure
      return sum + sale.payments
        .filter(payment => payment.mode === "Cash")
        .reduce((paymentSum, payment) => paymentSum + payment.amount, 0)
    } else {
      // Legacy single payment mode
      return sum + (sale.paymentMode === "Cash" ? sale.netTotal : 0)
    }
  }, 0)
  
  const onlineCashCollected = filteredSales.reduce((sum, sale) => {
    if (sale.payments && sale.payments.length > 0) {
      // New split payment structure
      return sum + sale.payments
        .filter(payment => payment.mode === "Card" || payment.mode === "Online")
        .reduce((paymentSum, payment) => paymentSum + payment.amount, 0)
    } else {
      // Legacy single payment mode
      return sum + ((sale.paymentMode === "Card" || sale.paymentMode === "Online") ? sale.netTotal : 0)
    }
  }, 0)

  const handleExportPDF = async () => {
    try {
      const { ReportsAPI } = await import('@/lib/api');
      
      // Calculate date range from datePeriod
      let dateFrom, dateTo;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      switch (datePeriod) {
        case 'today':
          dateFrom = new Date(today);
          dateTo = new Date(today);
          dateTo.setHours(23, 59, 59, 999);
          break;
        case 'yesterday':
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          dateFrom = yesterday;
          dateTo = new Date(yesterday);
          dateTo.setHours(23, 59, 59, 999);
          break;
        case 'last7days':
          dateFrom = new Date(today);
          dateFrom.setDate(dateFrom.getDate() - 7);
          dateTo = new Date(today);
          dateTo.setHours(23, 59, 59, 999);
          break;
        case 'last30days':
          dateFrom = new Date(today);
          dateFrom.setDate(dateFrom.getDate() - 30);
          dateTo = new Date(today);
          dateTo.setHours(23, 59, 59, 999);
          break;
        case 'currentMonth':
          dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
          dateTo = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        default:
          dateFrom = undefined;
          dateTo = undefined;
      }
      
      const result = await ReportsAPI.exportSales('pdf', {
        dateFrom: dateFrom?.toISOString(),
        dateTo: dateTo?.toISOString(),
        status: statusFilter !== 'all' ? statusFilter : undefined,
        paymentMode: paymentFilter !== 'all' ? paymentFilter : undefined
      });
      
      if (result && result.success) {
        toast({
          title: "Export Successful",
          description: result.message || "Sales report has been generated and sent to admin email(s)",
        });
      } else {
        throw new Error(result?.error || 'Export failed');
      }
    } catch (error: any) {
      console.error("PDF export error:", error);
      toast({
        title: "Export Failed",
        description: error?.message || "Failed to export PDF. Please try again.",
        variant: "destructive"
      });
    }
  }

  const handleExportXLS = async () => {
    try {
      const { ReportsAPI } = await import('@/lib/api');
      
      // Calculate date range from datePeriod
      let dateFrom, dateTo;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      switch (datePeriod) {
        case 'today':
          dateFrom = new Date(today);
          dateTo = new Date(today);
          dateTo.setHours(23, 59, 59, 999);
          break;
        case 'yesterday':
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          dateFrom = yesterday;
          dateTo = new Date(yesterday);
          dateTo.setHours(23, 59, 59, 999);
          break;
        case 'last7days':
          dateFrom = new Date(today);
          dateFrom.setDate(dateFrom.getDate() - 7);
          dateTo = new Date(today);
          dateTo.setHours(23, 59, 59, 999);
          break;
        case 'last30days':
          dateFrom = new Date(today);
          dateFrom.setDate(dateFrom.getDate() - 30);
          dateTo = new Date(today);
          dateTo.setHours(23, 59, 59, 999);
          break;
        case 'currentMonth':
          dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
          dateTo = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        default:
          dateFrom = undefined;
          dateTo = undefined;
      }
      
      const result = await ReportsAPI.exportSales('xlsx', {
        dateFrom: dateFrom?.toISOString(),
        dateTo: dateTo?.toISOString(),
        status: statusFilter !== 'all' ? statusFilter : undefined,
        paymentMode: paymentFilter !== 'all' ? paymentFilter : undefined
      });
      
      if (result && result.success) {
        toast({
          title: "Export Successful",
          description: result.message || "Sales report has been generated and sent to admin email(s)",
        });
      } else {
        throw new Error(result?.error || 'Export failed');
      }
    } catch (error: any) {
      console.error("XLS export error:", error);
      toast({
        title: "Export Failed",
        description: error?.message || "Failed to export Excel file. Please try again.",
        variant: "destructive"
      });
    }
  }

  function getServiceListExportDateRange(): { dateFrom?: string; dateTo?: string } {
    if (serviceListDatePeriod === "all") return {}
    const range = serviceListDateRange.from && serviceListDateRange.to
      ? serviceListDateRange
      : getServiceListDateRangeFromPeriod(serviceListDatePeriod)
    if (!range.from || !range.to) return {}
    return {
      dateFrom: range.from.toISOString(),
      dateTo: range.to.toISOString()
    }
  }

  function getSummaryExportDateRange(): { dateFrom?: string; dateTo?: string } {
    if (dateRange?.from && dateRange?.to) {
      return {
        dateFrom: dateRange.from.toISOString(),
        dateTo: dateRange.to.toISOString()
      }
    }
    if (datePeriod === "all") {
      const now = new Date()
      return {
        dateFrom: new Date(now.getFullYear(), 0, 1).toISOString(),
        dateTo: new Date(now.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      }
    }
    const range = getDateRangeFromPeriod(datePeriod)
    if (!range.from || !range.to) return {}
    return { dateFrom: range.from.toISOString(), dateTo: range.to.toISOString() }
  }

  const handleExportSummaryPDF = async () => {
    try {
      const { ReportsAPI } = await import("@/lib/api")
      const filters = getSummaryExportDateRange()
      const result = await ReportsAPI.exportSummary("pdf", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Summary report has been generated and sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message || "Failed to export PDF.", variant: "destructive" })
    }
  }

  const handleExportSummaryXLS = async () => {
    try {
      const { ReportsAPI } = await import("@/lib/api")
      const filters = getSummaryExportDateRange()
      const result = await ReportsAPI.exportSummary("xlsx", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Summary report has been generated and sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message || "Failed to export Excel.", variant: "destructive" })
    }
  }

  const handleExportServiceListPDF = async () => {
    try {
      const { ReportsAPI } = await import("@/lib/api")
      const filters: any = getServiceListExportDateRange()
      if (serviceListStatusFilter !== "all") filters.status = serviceListStatusFilter
      if (serviceListModeFilter !== "all") filters.paymentMode = serviceListModeFilter
      if (serviceListServiceFilter !== "all") filters.serviceId = serviceListServiceFilter
      if (serviceListStaffFilter !== "all") filters.staffId = serviceListStaffFilter
      const result = await ReportsAPI.exportServiceList("pdf", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Service list report sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.message || "Failed to export PDF.", variant: "destructive" })
    }
  }

  const handleExportServiceListXLS = async () => {
    try {
      const { ReportsAPI } = await import("@/lib/api")
      const filters: any = getServiceListExportDateRange()
      if (serviceListStatusFilter !== "all") filters.status = serviceListStatusFilter
      if (serviceListModeFilter !== "all") filters.paymentMode = serviceListModeFilter
      if (serviceListServiceFilter !== "all") filters.serviceId = serviceListServiceFilter
      if (serviceListStaffFilter !== "all") filters.staffId = serviceListStaffFilter
      const result = await ReportsAPI.exportServiceList("xlsx", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Service list report sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.message || "Failed to export Excel.", variant: "destructive" })
    }
  }

  const handleViewBill = (sale: SalesRecord) => {
    setSelectedBill(sale)
    setIsBillDialogOpen(true)
  }

  const handleEditSale = (sale: SalesRecord) => {
    router.push(`/billing/${sale.billNo}?mode=edit`)
  }

  const handleDeleteSale = (sale: SalesRecord) => {
    setSelectedSale(sale)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedSale) return
    
    try {
      console.log("Deleting sale:", selectedSale.billNo)
      
      // Call the API to delete the sale from the database
      const response = await SalesAPI.delete(selectedSale.id)
      
      if (response.success) {
        // Remove from local state only after successful API call
        setSalesData(prev => prev.filter(sale => sale.id !== selectedSale.id))
        setIsDeleteDialogOpen(false)
        setSelectedSale(null)
        
        toast({
          title: "Sale Deleted",
          description: `Sale record for ${selectedSale.customerName} has been successfully deleted.`,
        })
        
        console.log("Sale deleted successfully")
      } else {
        console.error("Failed to delete sale:", response.error)
        toast({
          title: "Error",
          description: "Failed to delete sale record. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to delete sale:", error)
      toast({
        title: "Error",
        description: "Failed to delete sale record. Please try again.",
        variant: "destructive",
      })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default">Completed</Badge>
      case "partial":
        return <Badge variant="secondary">Partial</Badge>
      case "unpaid":
        return <Badge variant="outline">Unpaid</Badge>
      case "cancelled":
        return <Badge variant="destructive">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPaymentModeDisplay = (sale: SalesRecord) => {
    console.log(`🔍 Processing payment display for ${sale.billNo}:`, {
      paymentMode: sale.paymentMode,
      payments: sale.payments,
      hasPayments: !!sale.payments?.length,
      status: sale.status
    })
    
    // First priority: Check if there are payments (new split payment structure)
    if (sale.payments && sale.payments.length > 0) {
      const paymentModes = sale.payments.map(payment => payment.mode)
      const uniqueModes = [...new Set(paymentModes)]
      const display = uniqueModes.join(", ")
      console.log(`✅ Split payment for ${sale.billNo}:`, { payments: sale.payments, display })
      return display
    }
    
    // Second priority: Check legacy paymentMode field
    if (sale.paymentMode) {
      console.log(`✅ Legacy payment mode for ${sale.billNo}:`, sale.paymentMode)
      return sale.paymentMode
    }
    
    // For unpaid bills with no payments, return empty
    if (sale.status === 'unpaid' && (!sale.payments || sale.payments.length === 0)) {
      return ''
    }
    
    // For partial bills, show what's been paid
    if (sale.status === 'partial' && sale.payments && sale.payments.length > 0) {
      const paymentModes = sale.payments.map(payment => payment.mode)
      const uniqueModes = [...new Set(paymentModes)]
      return uniqueModes.join(", ")
    }
    
    // Default: no payment recorded
    return ''
  }

  // Get filtered amount based on payment filter
  const getFilteredAmount = (sale: SalesRecord) => {
    if (paymentFilter === "all") {
      return sale.netTotal
    }
    
    if (sale.payments && sale.payments.length > 0) {
      // Get amount for the selected payment type
      const filteredPayment = sale.payments.find(payment => payment.mode === paymentFilter)
      return filteredPayment ? filteredPayment.amount : 0
    } else {
      // Legacy single payment mode
      return sale.paymentMode === paymentFilter ? sale.netTotal : 0
    }
  }

  // Get filtered gross total based on payment filter
  const getFilteredGrossTotal = (sale: SalesRecord) => {
    if (paymentFilter === "all") {
      return sale.grossTotal
    }
    
    if (sale.payments && sale.payments.length > 0) {
      // Get amount for the selected payment type
      const filteredPayment = sale.payments.find(payment => payment.mode === paymentFilter)
      if (filteredPayment) {
        // Calculate proportional tax and gross total
        const ratio = filteredPayment.amount / sale.netTotal
        return filteredPayment.amount + (sale.taxAmount * ratio)
      }
      return 0
    } else {
      // Legacy single payment mode
      return sale.paymentMode === paymentFilter ? sale.grossTotal : 0
    }
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium bg-slate-200 h-4 rounded"></CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold bg-slate-200 h-8 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center py-16">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-20 h-20 bg-slate-200 rounded-full animate-pulse"></div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-slate-900 mb-2">Loading sales data...</h3>
              <p className="text-slate-500 text-sm">Please wait while we fetch your data</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/*
        CONVENTION: Report type + filters live in this single bar.
        When adding a new report/list type:
        1. Add the option to the report type Select below.
        2. Add a {reportType === "new-type" && ( ... )} block here with that type's filters.
        3. Add state and fetch for any dropdown options (e.g. services, staff) and pass controlledFilters if the report is an embedded component.
        4. Do not add a separate filter bar for the new type—keep all filters in this same bar.
      */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {/* Report type */}
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales Report</SelectItem>
                  <SelectItem value="staff-tip">Staff Tip</SelectItem>
                  <SelectItem value="summary">Summary Reports</SelectItem>
                  <SelectItem value="service-list">Service List</SelectItem>
                </SelectContent>
              </Select>
              {reportType === "summary" && (
                <>
                  <Select value={datePeriod} onValueChange={handleDatePeriodChange}>
                    <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="last7days">Last 7 days</SelectItem>
                      <SelectItem value="last30days">Last 30 days</SelectItem>
                      <SelectItem value="currentMonth">Current month</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="custom">Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                  {datePeriod === "custom" && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-40 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {dateRange?.from ? (dateRange?.to && dateRange.from.getTime() !== dateRange.to.getTime()
                              ? `${format(dateRange.from, "dd MMM")} – ${format(dateRange.to, "dd MMM")}`
                              : format(dateRange.from, "dd MMM yyyy")) : "Pick dates"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="range" selected={dateRange as never} onSelect={(r) => setDateRange(r || {})} numberOfMonths={2} />
                      </PopoverContent>
                    </Popover>
                  )}
                </>
              )}
              {reportType === "sales" && (
                <>
                  <Input
                    placeholder="Search sales..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-52 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <Select value={datePeriod} onValueChange={handleDatePeriodChange}>
                    <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Quick periods" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="last7days">Last 7 days</SelectItem>
                      <SelectItem value="last30days">Last 30 days</SelectItem>
                      <SelectItem value="currentMonth">Current month</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="custom">Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                  {datePeriod === "custom" && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-40 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {dateRange?.from ? (dateRange?.to && dateRange.from.getTime() !== dateRange.to.getTime()
                              ? `${format(dateRange.from, "dd MMM")} – ${format(dateRange.to, "dd MMM")}`
                              : format(dateRange.from, "dd MMM yyyy")) : "Pick dates"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="range" selected={dateRange as never} onSelect={(r) => setDateRange(r || {})} numberOfMonths={2} />
                      </PopoverContent>
                    </Popover>
                  )}
                  <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                    <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Payment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payments</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              {reportType === "staff-tip" && (
                <>
                  <Select value={datePeriod} onValueChange={handleDatePeriodChange}>
                    <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="last7days">Last 7 days</SelectItem>
                      <SelectItem value="last30days">Last 30 days</SelectItem>
                      <SelectItem value="currentMonth">Current month</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="custom">Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                  {datePeriod === "custom" && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-40 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {dateRange?.from ? (dateRange?.to && dateRange.from.getTime() !== dateRange.to.getTime()
                              ? `${format(dateRange.from, "dd MMM")} – ${format(dateRange.to, "dd MMM")}`
                              : format(dateRange.from, "dd MMM yyyy")) : "Pick dates"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="range" selected={dateRange as never} onSelect={(r) => setDateRange(r || {})} numberOfMonths={2} />
                      </PopoverContent>
                    </Popover>
                  )}
                  <Select value={staffTipFilter} onValueChange={setStaffTipFilter}>
                    <SelectTrigger className="w-44 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="All staff" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All staff</SelectItem>
                      {salesStaff.map((s) => (
                        <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              {reportType === "service-list" && (
                <>
                  <Select value={serviceListServiceFilter} onValueChange={setServiceListServiceFilter}>
                    <SelectTrigger className="w-44 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All services</SelectItem>
                      {serviceListServices.map((s) => (
                        <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={serviceListDatePeriod} onValueChange={handleServiceListDatePeriodChange}>
                    <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="last7days">Last 7 days</SelectItem>
                      <SelectItem value="last30days">Last 30 days</SelectItem>
                      <SelectItem value="currentMonth">Current month</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="custom">Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                  {serviceListDatePeriod === "custom" && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-40 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {serviceListDateRange?.from ? (serviceListDateRange?.to && serviceListDateRange.from.getTime() !== serviceListDateRange.to.getTime()
                              ? `${format(serviceListDateRange.from, "dd MMM")} – ${format(serviceListDateRange.to, "dd MMM")}`
                              : format(serviceListDateRange.from, "dd MMM yyyy")) : "Pick dates"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="range" selected={serviceListDateRange as never} onSelect={(r) => setServiceListDateRange(r || {})} numberOfMonths={2} />
                      </PopoverContent>
                    </Popover>
                  )}
                  <Select value={serviceListStaffFilter} onValueChange={setServiceListStaffFilter}>
                    <SelectTrigger className="w-44 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Staff" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All staff</SelectItem>
                      {serviceListStaff.map((s) => (
                        <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={serviceListStatusFilter} onValueChange={setServiceListStatusFilter}>
                    <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All status</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={serviceListModeFilter} onValueChange={setServiceListModeFilter}>
                    <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All modes</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              {(reportType === "sales" || reportType === "staff-tip") && (
                <Button
                  onClick={() => router.push('/reports/unpaid-bills')}
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  View Unpaid Bills
                </Button>
              )}
              {(reportType === "sales" || reportType === "staff-tip" || reportType === "summary" || reportType === "service-list") && (
                canExport ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export Report
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {(reportType === "sales" || reportType === "staff-tip") && (
                        <>
                          <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                            <FileText className="h-4 w-4 mr-2" />
                            Export as PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleExportXLS} className="cursor-pointer">
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Export as Excel
                          </DropdownMenuItem>
                        </>
                      )}
                      {reportType === "summary" && (
                        <>
                          <DropdownMenuItem onClick={handleExportSummaryPDF} className="cursor-pointer">
                            <FileText className="h-4 w-4 mr-2" />
                            Export as PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleExportSummaryXLS} className="cursor-pointer">
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Export as Excel
                          </DropdownMenuItem>
                        </>
                      )}
                      {reportType === "service-list" && (
                        <>
                          <DropdownMenuItem onClick={handleExportServiceListPDF} className="cursor-pointer">
                            <FileText className="h-4 w-4 mr-2" />
                            Export as PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleExportServiceListXLS} className="cursor-pointer">
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Export as Excel
                          </DropdownMenuItem>
                        </>
                      )}
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
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {reportType === "service-list" ? (
        <ServiceListReport
          controlledFilters={{
            datePeriod: serviceListDatePeriod,
            setDatePeriod: setServiceListDatePeriod,
            dateRange: serviceListDateRange,
            setDateRange: setServiceListDateRange,
            serviceFilter: serviceListServiceFilter,
            setServiceFilter: setServiceListServiceFilter,
            staffFilter: serviceListStaffFilter,
            setStaffFilter: setServiceListStaffFilter,
            statusFilter: serviceListStatusFilter,
            setStatusFilter: setServiceListStatusFilter,
            modeFilter: serviceListModeFilter,
            setModeFilter: setServiceListModeFilter,
          }}
        />
      ) : reportType === "summary" ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            {summaryLoading ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-slate-500">Loading summary...</p>
              </div>
            ) : summaryData ? (
              <div className="space-y-1">
                <div className="flex justify-between items-center py-3 px-4 rounded-lg bg-slate-50 border-b border-slate-200">
                  <span className="font-medium text-slate-700">1. Total Bill Count</span>
                  <span className="font-semibold text-slate-900">{summaryData.totalBillCount}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg border-b border-slate-100">
                  <span className="font-medium text-slate-700">2. Total Customer Count</span>
                  <span className="font-semibold text-slate-900">{summaryData.totalCustomerCount}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg border-b border-slate-100">
                  <span className="font-medium text-slate-700">3. Total Sales</span>
                  <span className="font-semibold text-slate-900">₹{summaryData.totalSales.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg border-b border-slate-100">
                  <span className="font-medium text-slate-700">4. Total Sales (Cash)</span>
                  <span className="font-semibold text-slate-900">₹{summaryData.totalSalesCash.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg border-b border-slate-100">
                  <span className="font-medium text-slate-700">5. Total Sales (Online)</span>
                  <span className="font-semibold text-slate-900">₹{summaryData.totalSalesOnline.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg border-b border-slate-100">
                  <span className="font-medium text-slate-700">6. Total Sales (Card)</span>
                  <span className="font-semibold text-slate-900">₹{summaryData.totalSalesCard.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg border-b border-slate-100">
                  <span className="font-medium text-slate-700">7. Dues Collected</span>
                  <span className="font-semibold text-slate-900">₹{summaryData.duesCollected.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg border-b border-slate-100">
                  <span className="font-medium text-slate-700">8. Cash Expense</span>
                  <span className="font-semibold text-slate-900">₹{summaryData.cashExpense.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg border-b border-slate-100">
                  <span className="font-medium text-slate-700">9. Tip Collected</span>
                  <span className="font-semibold text-slate-900">₹{summaryData.tipCollected.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg">
                  <span className="font-medium text-slate-700">10. Cash Balance</span>
                  <span className="font-semibold text-slate-900">₹{summaryData.cashBalance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500">No summary data for the selected period.</div>
            )}
          </div>
        </div>
      ) : reportType === "staff-tip" ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Staff Tip Report</h3>
            {!staffTipDateRange ? (
              <div className="text-center py-12 text-slate-500">Select a date range to view staff tips.</div>
            ) : tipPayoutsLoading ? (
              <div className="text-center py-12 text-slate-500">Loading...</div>
            ) : staffTipAggregated.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No tips found for the selected period and staff.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Name</TableHead>
                    <TableHead className="text-right">Tip Amount</TableHead>
                    <TableHead className="w-[140px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffTipAggregated.map((row) => {
                    const paid = (staffTipPaidAmountByStaff.get(row.staffId) || 0) >= row.tipAmount - 0.01
                    return (
                      <TableRow key={row.staffId}>
                        <TableCell className="font-medium">{row.staffName}</TableCell>
                        <TableCell className="text-right">₹{row.tipAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {paid ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">Paid</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-200 text-amber-700 hover:bg-amber-50"
                              onClick={() => handleMarkTipAsPaid(row)}
                            >
                              Mark as Paid
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      ) : (
        <>
      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Total Revenue</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">₹{totalRevenue.toFixed(2)}</div>
            <p className="text-sm text-gray-500">From {filteredSales.length} sales</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Completed Sales</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <TrendingUp className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">{completedSales}</div>
            <p className="text-sm text-gray-500">Successfully completed</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Partial Payments</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <Users className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">{partialSales}</div>
            <p className="text-sm text-gray-500">Partially paid bills</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Unpaid Bills</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <Users className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">{unpaidSales}</div>
            <p className="text-sm text-gray-500">Awaiting payment</p>
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Tips Collected</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">₹{tipsCollected.toFixed(2)}</div>
            <p className="text-sm text-gray-500">Tips from selected sales</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Cash Collected</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">₹{cashCollected.toFixed(2)}</div>
            <p className="text-sm text-gray-500">
              {paymentFilter === "all" ? "Cash payments only" : 
               paymentFilter === "Cash" ? "Filtered: Cash only" : "All cash payments"}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Online Cash Collected</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <TrendingUp className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">₹{onlineCashCollected.toFixed(2)}</div>
            <p className="text-sm text-gray-500">
              {paymentFilter === "all" ? "Card + Online/Paytm" : 
               paymentFilter === "Card" ? "Filtered: Card only" : 
               paymentFilter === "Online" ? "Filtered: Online only" : "All online payments"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Table – same layout as Service List / reports */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-slate-200">
                <TableHead className="font-semibold text-slate-800">Bill No.</TableHead>
                <TableHead className="font-semibold text-slate-800">Customer Name</TableHead>
                <TableHead className="font-semibold text-slate-800">Date</TableHead>
                <TableHead className="font-semibold text-slate-800">Status</TableHead>
                <TableHead className="font-semibold text-slate-800">Payment Mode</TableHead>
                <TableHead className="font-semibold text-slate-800">
                  Net Total
                  {paymentFilter !== "all" && (
                    <Badge variant="secondary" className="ml-2 text-xs bg-blue-100 text-blue-700 border-blue-200">
                      {paymentFilter} only
                    </Badge>
                  )}
                </TableHead>
                <TableHead className="font-semibold text-slate-800">Tax Amount</TableHead>
                <TableHead className="font-semibold text-slate-800">
                  Gross Total
                  {paymentFilter !== "all" && (
                    <Badge variant="secondary" className="ml-2 text-xs bg-blue-100 text-blue-700 border-blue-200">
                      {paymentFilter} only
                    </Badge>
                  )}
                </TableHead>
                <TableHead className="font-semibold text-slate-800">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                    No sales records found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSales.map((sale) => (
                  <TableRow key={sale.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <TableCell className="font-medium text-slate-900">
                      <Button
                          variant="link"
                          className="p-0 h-auto font-medium text-blue-600 hover:text-blue-800 hover:underline transition-all duration-200"
                          onClick={() => handleViewReceipt(sale)}
                        >
                          {sale.billNo}
                          {(sale.isEdited === true || sale.editedAt) && <span className="text-xs text-gray-500 ml-1">(edited)</span>}
                        </Button>
                    </TableCell>
                    <TableCell className="font-medium text-slate-800">{sale.customerName}</TableCell>
                    <TableCell className="text-slate-600">{new Date(sale.date).toLocaleDateString()}</TableCell>
                    <TableCell>{getStatusBadge(sale.status)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {getPaymentModeDisplay(sale)}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold text-green-700">₹{getFilteredAmount(sale).toFixed(2)}</TableCell>
                    <TableCell className="text-slate-600">₹{sale.taxAmount.toFixed(2)}</TableCell>
                    <TableCell className="font-bold text-emerald-700">₹{getFilteredGrossTotal(sale).toFixed(2)}</TableCell>
                    <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-100 rounded-lg transition-colors duration-200">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4 text-slate-600" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-slate-700">Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleViewReceipt(sale)} className="hover:bg-blue-50">
                              <Receipt className="mr-2 h-4 w-4 text-blue-600" />
                              <span className="text-slate-700">View Receipt</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleViewBill(sale)} className="hover:bg-blue-50">
                              <Eye className="mr-2 h-4 w-4 text-blue-600" />
                              <span className="text-slate-700">View Bill Details</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditBill(sale)} className="hover:bg-amber-50">
                              <Edit className="mr-2 h-4 w-4 text-amber-600" />
                              <span className="text-slate-700">Edit Bill</span>
                            </DropdownMenuItem>
                            {sale.items && sale.items.some((item: any) => item.type === 'product') && (
                              <DropdownMenuItem onClick={() => handleExchangeBill(sale)} className="hover:bg-blue-50">
                                <RefreshCw className="mr-2 h-4 w-4 text-blue-600" />
                                <span className="text-slate-700">Exchange Products</span>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={() => handleDeleteSale(sale)}
                              className="text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
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

      {/* Bill View Dialog */}
      <Dialog open={isBillDialogOpen} onOpenChange={setIsBillDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bill Details - {selectedBill?.billNo}</DialogTitle>
            <DialogDescription>
              Detailed view of the bill information
            </DialogDescription>
          </DialogHeader>
          {selectedBill && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Bill No.</label>
                  <p className="text-lg font-semibold">{selectedBill.billNo}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Date</label>
                  <p className="text-lg">{new Date(selectedBill.date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Customer Name</label>
                  <p className="text-lg font-semibold">{selectedBill.customerName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Payment Mode</label>
                  <p className="text-lg">{getPaymentModeDisplay(selectedBill)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Net Total</label>
                  <p className="text-lg">₹{selectedBill.netTotal.toFixed(2)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Tax Amount</label>
                  <p className="text-lg">₹{selectedBill.taxAmount.toFixed(2)}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Gross Total</label>
                  <p className="text-2xl font-bold text-green-600">₹{selectedBill.grossTotal.toFixed(2)}</p>
                </div>
              </div>
              {selectedBill.payments && selectedBill.payments.length > 0 && (
                <div className="border-t pt-4">
                  <label className="text-sm font-medium text-muted-foreground">Payment Breakdown</label>
                  <div className="space-y-2 mt-2">
                    {selectedBill.payments.map((payment, index) => (
                      <div key={index} className="flex justify-between items-center bg-muted/30 p-2 rounded">
                        <span className="font-medium">{payment.mode}</span>
                        <span className="text-green-600 font-semibold">₹{payment.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="border-t pt-4">
                <label className="text-sm font-medium text-muted-foreground">Staff</label>
                <p className="text-lg">{selectedBill.staffName}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBillDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => {
              setIsBillDialogOpen(false)
              // Here you could add print functionality
              console.log("Printing bill:", selectedBill?.billNo)
            }}>
              Print Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sale Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the sale record for {selectedSale?.customerName}? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        </>
      )}
    </div>
  )
}