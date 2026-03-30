"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Download, Filter, TrendingUp, DollarSign, Users, MoreHorizontal, Eye, Pencil, Trash2, Receipt, AlertCircle, FileText, FileSpreadsheet, ChevronDown, Edit, RefreshCw, CalendarIcon, HelpCircle, Wallet, CreditCard, Banknote, ArrowUpRight, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { getTodayIST, getStartOfDayIST, getEndOfDayIST, toDateStringIST, formatDateIST } from "@/lib/date-utils"
import { Calendar } from "@/components/ui/calendar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CursorTooltip } from "@/components/ui/cursor-tooltip"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { SalesAPI, ServicesAPI, StaffDirectoryAPI, ReportsAPI, ProductsAPI, type SalesSummaryData } from "@/lib/api"
import { ServiceListReport, type ServiceListControlledFilters, type DatePeriod as ServiceListDatePeriod } from "@/components/reports/service-list-report"
import { ProductListReport } from "@/components/reports/product-list-report"
import { useToast } from "@/hooks/use-toast"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useFeature } from "@/hooks/use-entitlements"

/** Sale.time is typically "HH:mm" (24h). Returns "hh:mm AM/PM" with zero-padded hour. */
function formatBillTimeStringTo12h(time24: string | undefined | null): string | null {
  if (time24 == null || !String(time24).trim()) return null
  const m = String(time24).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2].padStart(2, "0")
  const ampm = h >= 12 ? "PM" : "AM"
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  const hh = String(h12).padStart(2, "0")
  return `${hh}:${min} ${ampm}`
}

/** Time from full ISO datetime, displayed in IST as "hh:mm AM/PM". */
function formatInstantToTime12hIST(isoDate: Date): string {
  const s = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(isoDate)
  const match = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
  if (!match) return s
  let h = parseInt(match[1], 10)
  const min = match[2].padStart(2, "0")
  const ap = match[3].toUpperCase()
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  return `${String(h12).padStart(2, "0")}:${min} ${ap}`
}

function formatSalesRecordDateTimeParts(sale: { date: string; time?: string }): { dateLine: string; timeLine: string } | null {
  const d = new Date(sale.date)
  if (isNaN(d.getTime())) return null
  const dateLine = formatDateIST(sale.date)
  const fromField = formatBillTimeStringTo12h(sale.time)
  const timeLine = fromField ?? formatInstantToTime12hIST(d)
  return { dateLine, timeLine }
}

interface SalesRecord {
  id: string
  billNo: string
  customerName: string
  date: string
  /** Bill time of day from API (e.g. "14:30"); optional if only `date` ISO is present */
  time?: string
  paymentMode: string // Legacy support
  payments?: Array<{
    mode: string
    amount: number
  }>
  tip?: number
  netTotal: number
  taxAmount: number
  grossTotal: number
  paymentStatus?: { paidAmount?: number; totalAmount?: number; remainingAmount?: number }
  status: "completed" | "partial" | "unpaid" | "cancelled"
  staffName: string
  tipStaffId?: string
  tipStaffName?: string
  isEdited?: boolean // Track if bill has been edited
  editedAt?: Date | string
  items?: Array<{ type: string; [key: string]: unknown }>
}

function mapApiSaleToRecord(sale: Record<string, unknown>): SalesRecord {
  return {
    id: String(sale._id),
    billNo: String(sale.billNo ?? ""),
    customerName: String(sale.customerName ?? ""),
    date: typeof sale.date === "string" ? sale.date : (sale.date as Date)?.toISOString?.() ?? "",
    time: sale.time as string | undefined,
    paymentMode: String(sale.paymentMode ?? ""),
    payments: (sale.payments as SalesRecord["payments"]) || [],
    tip: (sale.tip as number) || 0,
    tipStaffId: sale.tipStaffId != null ? String(sale.tipStaffId) : undefined,
    tipStaffName: sale.tipStaffName as string | undefined,
    netTotal: Number(sale.netTotal ?? 0),
    taxAmount: Number(sale.taxAmount ?? 0),
    grossTotal: Number(sale.grossTotal ?? 0),
    paymentStatus: sale.paymentStatus as SalesRecord["paymentStatus"],
    status: (sale.status as SalesRecord["status"]) || "unpaid",
    staffName: String(sale.staffName ?? ""),
    items: (sale.items as SalesRecord["items"]) || [],
    isEdited: sale.isEdited === true || !!sale.editedAt,
    editedAt: sale.editedAt as Date | string | undefined,
  }
}

type DatePeriod = "today" | "yesterday" | "last7days" | "last30days" | "currentMonth" | "all" | "custom"

const SALES_SEARCH_DEBOUNCE_MS = 400

const REPORT_TYPES = [
  "sales",
  "staff-tip",
  "summary",
  "service-list",
  "product-list",
  "appointment-list",
  "deleted-invoice",
  "unpaid-part-paid",
] as const

export function SalesReport() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  const [reportType, setReportTypeState] = useState("sales")

  useEffect(() => {
    const p = searchParams.get("reportType")
    if (p && REPORT_TYPES.includes(p as (typeof REPORT_TYPES)[number])) {
      setReportTypeState(p)
    }
  }, [searchParams])

  const setReportType = useCallback(
    (value: string) => {
      setReportTypeState(value)
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", "sales")
      params.set("reportType", value)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const buildReportsReturnPath = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", "sales")
    params.set("reportType", reportType)
    return `/reports?${params.toString()}`
  }, [searchParams, reportType])
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("today")
  const [paymentFilter, setPaymentFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [staffTipFilter, setStaffTipFilter] = useState<string>("all")
  const [salesStaff, setSalesStaff] = useState<{ _id: string; name: string }[]>([])
  /** Staff-tip report only: wider fetch for aggregation */
  const [staffTipData, setStaffTipData] = useState<SalesRecord[]>([])
  const [salesListRows, setSalesListRows] = useState<SalesRecord[]>([])
  const [salesTotalCount, setSalesTotalCount] = useState(0)
  const [salesTotalPages, setSalesTotalPages] = useState(1)
  const [salesListLoading, setSalesListLoading] = useState(false)
  const [salesStatsLoading, setSalesStatsLoading] = useState(false)
  const [summaryStats, setSummaryStats] = useState<SalesSummaryData | null>(null)
  const [salesRefreshKey, setSalesRefreshKey] = useState(0)
  /** Bumps staff-tip wide fetch after Mark as paid (payout state + row data). */
  const [staffTipRefreshKey, setStaffTipRefreshKey] = useState(0)
  const [selectedBill, setSelectedBill] = useState<SalesRecord | null>(null)
  const [isBillDialogOpen, setIsBillDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteSaleReason, setDeleteSaleReason] = useState("")
  const [selectedSale, setSelectedSale] = useState<SalesRecord | null>(null)
  const [salesPageIndex, setSalesPageIndex] = useState(0)
  const [salesPageSize, setSalesPageSize] = useState(10)
  /** Sales stat card: combined count by default; click for partial vs unpaid breakdown */
  const [showPartialUnpaidBreakdown, setShowPartialUnpaidBreakdown] = useState(false)

  // Service List filters (when report type is service-list; shown in same bar)
  const [serviceListDatePeriod, setServiceListDatePeriod] = useState<ServiceListDatePeriod>("today")
  const [serviceListDateRange, setServiceListDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [serviceListServiceFilter, setServiceListServiceFilter] = useState<string>("all")
  const [serviceListStaffFilter, setServiceListStaffFilter] = useState<string>("all")
  const [serviceListStatusFilter, setServiceListStatusFilter] = useState<string>("all")
  const [serviceListModeFilter, setServiceListModeFilter] = useState<string>("all")
  const [serviceListServices, setServiceListServices] = useState<{ _id: string; name: string; duration?: number }[]>([])
  const [serviceListStaff, setServiceListStaff] = useState<{ _id: string; name: string }[]>([])

  const [productListDatePeriod, setProductListDatePeriod] = useState<ServiceListDatePeriod>("today")
  const [productListDateRange, setProductListDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [productListProductFilter, setProductListProductFilter] = useState<string>("all")
  const [productListStaffFilter, setProductListStaffFilter] = useState<string>("all")
  const [productListStatusFilter, setProductListStatusFilter] = useState<string>("all")
  const [productListModeFilter, setProductListModeFilter] = useState<string>("all")
  const [productListProducts, setProductListProducts] = useState<{ _id: string; name: string }[]>([])
  const [productListStaff, setProductListStaff] = useState<{ _id: string; name: string }[]>([])

  // Appointment List filters
  const [appointmentListDateFilterType, setAppointmentListDateFilterType] = useState<"appointment_date" | "created_date">("appointment_date")
  const [appointmentListDatePeriod, setAppointmentListDatePeriod] = useState<DatePeriod>("today")
  const [appointmentListDateRange, setAppointmentListDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [appointmentListStatusFilter, setAppointmentListStatusFilter] = useState<string>("all")
  const [appointmentListShowWalkIn, setAppointmentListShowWalkIn] = useState(true)
  const [appointmentListData, setAppointmentListData] = useState<any[]>([])
  const [appointmentListSummary, setAppointmentListSummary] = useState<{ count: number; totalValue: number }>({ count: 0, totalValue: 0 })
  const [appointmentListLoading, setAppointmentListLoading] = useState(false)

  // Deleted Invoice filters
  const [deletedInvoiceDatePeriod, setDeletedInvoiceDatePeriod] = useState<DatePeriod>("today")
  const [deletedInvoiceDateRange, setDeletedInvoiceDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [deletedInvoiceData, setDeletedInvoiceData] = useState<any[]>([])
  const [deletedInvoiceSummary, setDeletedInvoiceSummary] = useState<{ count: number; totalValue: number }>({ count: 0, totalValue: 0 })
  const [deletedInvoiceLoading, setDeletedInvoiceLoading] = useState(false)

  // Unpaid/Part-Paid filters
  const [unpaidPartPaidDatePeriod, setUnpaidPartPaidDatePeriod] = useState<DatePeriod>("today")
  const [unpaidPartPaidDateRange, setUnpaidPartPaidDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [unpaidPartPaidStatusFilter, setUnpaidPartPaidStatusFilter] = useState<string>("all")
  const [unpaidPartPaidData, setUnpaidPartPaidData] = useState<any[]>([])
  const [unpaidPartPaidSummary, setUnpaidPartPaidSummary] = useState<{ count: number; totalOutstanding: number }>({ count: 0, totalOutstanding: 0 })
  const [unpaidPartPaidLoading, setUnpaidPartPaidLoading] = useState(false)

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
    cashDuesCollected?: number
    cashExpense: number
    pettyCashExpense?: number
    tipCollected: number
    cashBalance: number
    openingBalance?: number
    closingBalance?: number
    totalDue?: number
    customersWithDue?: number
  } | null>(null)
  const [summaryReportLoading, setSummaryReportLoading] = useState(false)

  /** Ref for sales list: reset page when filter key changes (avoids stale page + fetch race). */
  const prevSalesFilterKeyRef = useRef<string | null>(null)

  // Function to navigate to receipt page (Back restores tab + report type, e.g. Deleted Invoice)
  const handleViewReceipt = (sale: SalesRecord) => {
    router.push(`/receipt/${sale.billNo}?returnTo=${encodeURIComponent(buildReportsReturnPath())}`)
  }

  const handleEditBill = (sale: SalesRecord) => {
    router.push(`/billing/${sale.billNo}?mode=edit`)
  }

  const handleExchangeBill = (sale: SalesRecord) => {
    router.push(`/billing/${sale.billNo}?mode=exchange`)
  }


  // Default date range: today (IST); sales load via server-side filters + pagination
  useEffect(() => {
    const todayRange = getDateRangeFromPeriod("today")
    setDateRange(todayRange)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim())
    }, SALES_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [searchTerm])

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

  // Convert calendar-picked dates to effective range (start of from-day, end of to-day)
  // Fixes same-day selection: calendar gives midnight for both, so we need end-of-day for "to"
  const getEffectiveDateParams = (from?: Date, to?: Date): { dateFrom?: string; dateTo?: string } => {
    if (!from || !to) return {}
    const fromStr = toDateStringIST(from)
    const toStr = toDateStringIST(to)
    return {
      dateFrom: getStartOfDayIST(fromStr),
      dateTo: getEndOfDayIST(toStr)
    }
  }
  const getEffectiveDateRange = (from?: Date, to?: Date): { from: Date; to: Date } | null => {
    if (!from || !to) return null
    const fromStr = toDateStringIST(from)
    const toStr = toDateStringIST(to)
    return {
      from: new Date(getStartOfDayIST(fromStr)),
      to: new Date(getEndOfDayIST(toStr))
    }
  }

  // Function to get date range based on selected period (all dates in IST)
  const getDateRangeFromPeriod = (period: DatePeriod) => {
    const todayStr = getTodayIST()
    const today = new Date(getStartOfDayIST(todayStr))
    
    switch (period) {
      case "today":
        return {
          from: today,
          to: new Date(getEndOfDayIST(todayStr))
        }
      case "yesterday": {
        const todayNoon = new Date(todayStr + "T12:00:00+05:30")
        const yesterdayNoon = new Date(todayNoon.getTime() - 24 * 60 * 60 * 1000)
        const yesterdayStr = toDateStringIST(yesterdayNoon)
        return {
          from: new Date(getStartOfDayIST(yesterdayStr)),
          to: new Date(getEndOfDayIST(yesterdayStr))
        }
      }
      case "last7days": {
        const todayNoon = new Date(todayStr + "T12:00:00+05:30")
        const fromNoon = new Date(todayNoon.getTime() - 7 * 24 * 60 * 60 * 1000)
        const fromStr = toDateStringIST(fromNoon)
        return {
          from: new Date(getStartOfDayIST(fromStr)),
          to: new Date(getEndOfDayIST(todayStr))
        }
      }
      case "last30days": {
        const todayNoon = new Date(todayStr + "T12:00:00+05:30")
        const fromNoon = new Date(todayNoon.getTime() - 30 * 24 * 60 * 60 * 1000)
        const fromStr = toDateStringIST(fromNoon)
        return {
          from: new Date(getStartOfDayIST(fromStr)),
          to: new Date(getEndOfDayIST(todayStr))
        }
      }
      case "currentMonth": {
        const [y, m] = todayStr.split("-").map(Number)
        const firstStr = `${y}-${String(m).padStart(2, "0")}-01`
        const firstOfMonth = new Date(firstStr + "T12:00:00+05:30")
        const lastOfMonth = new Date(firstOfMonth)
        lastOfMonth.setUTCMonth(lastOfMonth.getUTCMonth() + 1)
        lastOfMonth.setUTCDate(0)
        const lastStr = toDateStringIST(lastOfMonth)
        return {
          from: new Date(getStartOfDayIST(firstStr)),
          to: new Date(getEndOfDayIST(lastStr))
        }
      }
      case "custom":
        return { from: undefined, to: undefined }
      case "all":
      default:
        return { from: undefined, to: undefined }
    }
  }

  /** Query params for GET /api/sales and /api/sales/summary (server-side filters). */
  const buildSalesListFilterParams = useCallback((): Record<string, string> | null => {
    if (datePeriod === "custom" && (!dateRange.from || !dateRange.to)) {
      return null
    }
    const effectiveRange = dateRange.from && dateRange.to ? getEffectiveDateRange(dateRange.from, dateRange.to) : null
    const rangeForPeriod = datePeriod !== "all" && datePeriod !== "custom" ? getDateRangeFromPeriod(datePeriod) : null
    const activeRange =
      effectiveRange ||
      (rangeForPeriod?.from && rangeForPeriod?.to ? { from: rangeForPeriod.from, to: rangeForPeriod.to } : null)

    const params: Record<string, string> = {}
    if (activeRange) {
      const { dateFrom, dateTo } = getEffectiveDateParams(activeRange.from, activeRange.to)
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
    }
    if (statusFilter !== "all") params.status = statusFilter
    if (paymentFilter !== "all") params.paymentMode = paymentFilter
    if (staffTipFilter !== "all") params.tipStaffId = staffTipFilter
    const q = debouncedSearchTerm
    if (q) params.search = q
    return params
  }, [datePeriod, dateRange.from, dateRange.to, statusFilter, paymentFilter, staffTipFilter, debouncedSearchTerm])

  // Sales report: paginated list + aggregate summary (server-side filters)
  useEffect(() => {
    if (reportType !== "sales") return
    const base = buildSalesListFilterParams()
    if (!base) {
      prevSalesFilterKeyRef.current = null
      setSalesListRows([])
      setSalesTotalCount(0)
      setSalesTotalPages(1)
      setSummaryStats(null)
      setSalesListLoading(false)
      setSalesStatsLoading(false)
      return
    }
    const filterKey = JSON.stringify(base)
    const filterChanged = prevSalesFilterKeyRef.current !== filterKey
    if (filterChanged) {
      prevSalesFilterKeyRef.current = filterKey
      if (salesPageIndex !== 0) {
        setSalesPageIndex(0)
        return
      }
    }
    let cancelled = false
    setSalesListLoading(true)
    setSalesStatsLoading(true)
    const listParams = { ...base, page: salesPageIndex + 1, limit: salesPageSize }
    Promise.all([SalesAPI.getAll(listParams), SalesAPI.getSummary(base)])
      .then(([listRes, sumRes]) => {
        if (cancelled) return
        const rows = (listRes.data || []).map(mapApiSaleToRecord)
        setSalesListRows(rows)
        setSalesTotalCount(listRes.total ?? rows.length)
        setSalesTotalPages(Math.max(1, listRes.totalPages ?? 1))
        if (sumRes?.success && sumRes?.data) setSummaryStats(sumRes.data)
        else setSummaryStats(null)
      })
      .catch(() => {
        if (!cancelled) {
          setSalesListRows([])
          setSalesTotalCount(0)
          setSalesTotalPages(1)
          setSummaryStats(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSalesListLoading(false)
          setSalesStatsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [reportType, buildSalesListFilterParams, salesPageIndex, salesPageSize, salesRefreshKey])

  // Staff tip report: wide fetch for per-staff tip aggregation.
  // Filters (date, status, payment, tip staff, search) flow through buildSalesListFilterParams — do not list them here separately.
  useEffect(() => {
    if (reportType !== "staff-tip") return
    const base = buildSalesListFilterParams()
    if (!base) {
      setStaffTipData([])
      return
    }
    let cancelled = false
    SalesAPI.getAllMergePages({ ...base, batchSize: 500 })
      .then((rows) => {
        if (cancelled) return
        setStaffTipData((rows || []).map(mapApiSaleToRecord))
      })
      .catch(() => {
        if (!cancelled) setStaffTipData([])
      })
    return () => {
      cancelled = true
    }
  }, [reportType, buildSalesListFilterParams, staffTipRefreshKey])

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

  // Service list date range helper (same shape as ServiceListReport, uses IST)
  const getServiceListDateRangeFromPeriod = (period: ServiceListDatePeriod) => {
    const range = getDateRangeFromPeriod(period as DatePeriod)
    return { from: range.from, to: range.to }
  }

  const handleServiceListDatePeriodChange = (period: ServiceListDatePeriod) => {
    setServiceListDatePeriod(period)
    if (period !== "all" && period !== "custom") {
      setServiceListDateRange(getServiceListDateRangeFromPeriod(period))
    } else {
      setServiceListDateRange({})
    }
  }

  const handleProductListDatePeriodChange = (period: ServiceListDatePeriod) => {
    setProductListDatePeriod(period)
    if (period !== "all" && period !== "custom") {
      setProductListDateRange(getServiceListDateRangeFromPeriod(period))
    } else {
      setProductListDateRange({})
    }
  }

  const handleAppointmentListDatePeriodChange = (period: DatePeriod) => {
    setAppointmentListDatePeriod(period)
    if (period === "custom") {
      const range = getDateRangeFromPeriod("last7days")
      setAppointmentListDateRange(range)
    } else if (period !== "all") {
      setAppointmentListDateRange(getDateRangeFromPeriod(period))
    } else {
      setAppointmentListDateRange({})
    }
  }

  const handleDeletedInvoiceDatePeriodChange = (period: DatePeriod) => {
    setDeletedInvoiceDatePeriod(period)
    if (period === "custom") {
      const range = getDateRangeFromPeriod("last7days")
      setDeletedInvoiceDateRange(range)
    } else if (period !== "all") {
      setDeletedInvoiceDateRange(getDateRangeFromPeriod(period))
    } else {
      setDeletedInvoiceDateRange({})
    }
  }

  const handleUnpaidPartPaidDatePeriodChange = (period: DatePeriod) => {
    setUnpaidPartPaidDatePeriod(period)
    if (period === "custom") {
      const range = getDateRangeFromPeriod("last7days")
      setUnpaidPartPaidDateRange(range)
    } else if (period !== "all") {
      setUnpaidPartPaidDateRange(getDateRangeFromPeriod(period))
    } else {
      setUnpaidPartPaidDateRange({})
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

  useEffect(() => {
    if (reportType !== "product-list") return
    let cancelled = false
    async function fetchProductListOptions() {
      try {
        const [productsRes, staffRes] = await Promise.all([
          ProductsAPI.getAll({ limit: 500 }),
          StaffDirectoryAPI.getAll()
        ])
        if (cancelled) return
        const pdata = (productsRes as any)?.data
        setProductListProducts(Array.isArray(pdata) ? pdata : [])
        const staffData = staffRes?.data && Array.isArray(staffRes.data) ? staffRes.data : []
        setProductListStaff(staffData.map((s: any) => ({ _id: s._id, name: s.name || s.firstName || "—" })))
      } catch {
        if (!cancelled) {
          setProductListProducts([])
          setProductListStaff([])
        }
      }
    }
    fetchProductListOptions()
    return () => { cancelled = true }
  }, [reportType])

  // Fetch summary when Summary report is selected (uses same date range as sales)
  useEffect(() => {
    if (reportType !== "summary") return
    let cancelled = false
    setSummaryReportLoading(true)
    const params: { dateFrom?: string; dateTo?: string } = {}
    if (dateRange.from && dateRange.to) {
      Object.assign(params, getEffectiveDateParams(dateRange.from, dateRange.to))
    }
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
        if (!cancelled) setSummaryReportLoading(false)
      })
    return () => { cancelled = true }
  }, [reportType, datePeriod, dateRange.from, dateRange.to])

  // Fetch appointment list when Appointment List report is selected
  useEffect(() => {
    if (reportType !== "appointment-list") return
    const range = appointmentListDatePeriod === "custom"
      ? (appointmentListDateRange.from && appointmentListDateRange.to ? appointmentListDateRange : getDateRangeFromPeriod("last7days"))
      : appointmentListDatePeriod === "all"
        ? { from: undefined, to: undefined }
        : getDateRangeFromPeriod(appointmentListDatePeriod)
    const params: Record<string, string | boolean> = {
      dateFilterType: appointmentListDateFilterType,
      status: appointmentListStatusFilter,
      showWalkIn: appointmentListShowWalkIn
    }
    if (range.from && range.to) {
      const { dateFrom, dateTo } = getEffectiveDateParams(range.from, range.to)
      if (dateFrom && dateTo) {
        params.dateFrom = dateFrom
        params.dateTo = dateTo
      }
    }
    let cancelled = false
    setAppointmentListLoading(true)
    ReportsAPI.getAppointmentList(params)
      .then((res: { success?: boolean; data?: any[]; summary?: { count: number; totalValue: number } }) => {
        if (!cancelled && res?.success) {
          setAppointmentListData(Array.isArray(res.data) ? res.data : [])
          setAppointmentListSummary(res.summary || { count: 0, totalValue: 0 })
        } else if (!cancelled) {
          setAppointmentListData([])
          setAppointmentListSummary({ count: 0, totalValue: 0 })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppointmentListData([])
          setAppointmentListSummary({ count: 0, totalValue: 0 })
        }
      })
      .finally(() => {
        if (!cancelled) setAppointmentListLoading(false)
      })
    return () => { cancelled = true }
  }, [reportType, appointmentListDatePeriod, appointmentListDateRange.from, appointmentListDateRange.to, appointmentListDateFilterType, appointmentListStatusFilter, appointmentListShowWalkIn])

  // Fetch deleted invoices when Deleted Invoice report is selected
  useEffect(() => {
    if (reportType !== "deleted-invoice") return
    const range = deletedInvoiceDatePeriod === "custom"
      ? (deletedInvoiceDateRange.from && deletedInvoiceDateRange.to ? deletedInvoiceDateRange : getDateRangeFromPeriod("last7days"))
      : deletedInvoiceDatePeriod === "all"
        ? { from: undefined, to: undefined }
        : getDateRangeFromPeriod(deletedInvoiceDatePeriod)
    const params: Record<string, string> = {}
    if (range.from && range.to) {
      const { dateFrom, dateTo } = getEffectiveDateParams(range.from, range.to)
      if (dateFrom && dateTo) {
        params.dateFrom = dateFrom
        params.dateTo = dateTo
      }
    }
    let cancelled = false
    setDeletedInvoiceLoading(true)
    ReportsAPI.getDeletedInvoices(params)
      .then((res: { success?: boolean; data?: any[]; summary?: { count: number; totalValue: number } }) => {
        if (!cancelled && res?.success) {
          setDeletedInvoiceData(Array.isArray(res.data) ? res.data : [])
          setDeletedInvoiceSummary(res.summary || { count: 0, totalValue: 0 })
        } else if (!cancelled) {
          setDeletedInvoiceData([])
          setDeletedInvoiceSummary({ count: 0, totalValue: 0 })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDeletedInvoiceData([])
          setDeletedInvoiceSummary({ count: 0, totalValue: 0 })
        }
      })
      .finally(() => {
        if (!cancelled) setDeletedInvoiceLoading(false)
      })
    return () => { cancelled = true }
  }, [reportType, deletedInvoiceDatePeriod, deletedInvoiceDateRange.from, deletedInvoiceDateRange.to])

  // Fetch unpaid/part-paid when Unpaid/Part-Paid report is selected
  useEffect(() => {
    if (reportType !== "unpaid-part-paid") return
    const range = unpaidPartPaidDatePeriod === "custom"
      ? (unpaidPartPaidDateRange.from && unpaidPartPaidDateRange.to ? unpaidPartPaidDateRange : getDateRangeFromPeriod("last7days"))
      : unpaidPartPaidDatePeriod === "all"
        ? { from: undefined, to: undefined }
        : getDateRangeFromPeriod(unpaidPartPaidDatePeriod)
    const params: Record<string, string> = { status: unpaidPartPaidStatusFilter }
    if (range.from && range.to) {
      const { dateFrom, dateTo } = getEffectiveDateParams(range.from, range.to)
      if (dateFrom && dateTo) {
        params.dateFrom = dateFrom
        params.dateTo = dateTo
      }
    }
    let cancelled = false
    setUnpaidPartPaidLoading(true)
    ReportsAPI.getUnpaidPartPaid(params)
      .then((res: { success?: boolean; data?: any[]; summary?: { count: number; totalOutstanding: number } }) => {
        if (!cancelled && res?.success) {
          setUnpaidPartPaidData(Array.isArray(res.data) ? res.data : [])
          setUnpaidPartPaidSummary(res.summary || { count: 0, totalOutstanding: 0 })
        } else if (!cancelled) {
          setUnpaidPartPaidData([])
          setUnpaidPartPaidSummary({ count: 0, totalOutstanding: 0 })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnpaidPartPaidData([])
          setUnpaidPartPaidSummary({ count: 0, totalOutstanding: 0 })
        }
      })
      .finally(() => {
        if (!cancelled) setUnpaidPartPaidLoading(false)
      })
    return () => { cancelled = true }
  }, [reportType, unpaidPartPaidDatePeriod, unpaidPartPaidDateRange.from, unpaidPartPaidDateRange.to, unpaidPartPaidStatusFilter])

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
    const { dateFrom: df, dateTo: dt } = getEffectiveDateParams(from, to)
    ReportsAPI.getTipPayouts({ dateFrom: df, dateTo: dt })
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
    ? (dateRange.from && dateRange.to ? getEffectiveDateRange(dateRange.from, dateRange.to) : datePeriod !== "all" && datePeriod !== "custom" ? getDateRangeFromPeriod(datePeriod) : null)
    : null
  const staffTipSales =
    reportType === "staff-tip" && staffTipDateRange && staffTipDateRange.from != null && staffTipDateRange.to != null
      ? staffTipData.filter((sale) => {
          const hasTip = !!(sale.tip && sale.tip > 0) && (sale.tipStaffId || sale.tipStaffName)
          const matchesStaff = staffTipFilter === "all" || sale.tipStaffId === staffTipFilter
          return hasTip && matchesStaff
        })
      : []
  const getTipPaymentMode = (sale: SalesRecord): "Cash" | "Card" | "Online" | "Mixed" => {
    const norm = (s: string) => (s || "").toLowerCase()
    if (sale.payments && sale.payments.length > 0) {
      const modes = [...new Set(sale.payments.map((p: any) => norm(p.mode || p.type || "")))]
      const hasCash = modes.some(m => m.includes("cash"))
      const hasCard = modes.some(m => m.includes("card"))
      const hasOnline = modes.some(m => m.includes("online") || m.includes("upi"))
      if (hasCash && !hasCard && !hasOnline) return "Cash"
      if (hasCard && !hasCash && !hasOnline) return "Card"
      if (hasOnline && !hasCash && !hasCard) return "Online"
      return "Mixed"
    }
    const pm = norm(sale.paymentMode || "")
    if (pm.includes("cash") && !pm.includes("card") && !pm.includes("online")) return "Cash"
    if (pm.includes("card") && !pm.includes("cash") && !pm.includes("online")) return "Card"
    if (pm.includes("online") || pm.includes("upi")) return "Online"
    return "Mixed"
  }

  const staffTipAggregated = (() => {
    const map = new Map<string, { staffId: string; staffName: string; tipAmount: number; cashTipAmount: number; nonCashTipAmount: number; paymentModes: string[] }>()
    staffTipSales.forEach((sale) => {
      const id = (sale.tipStaffId || sale.tipStaffName || "").toString()
      const name = sale.tipStaffName || (salesStaff.find((s) => s._id === sale.tipStaffId)?.name) || "—"
      const tipAmt = sale.tip || 0
      const mode = getTipPaymentMode(sale)
      const isCash = mode === "Cash"
      const existing = map.get(id)
      if (existing) {
        existing.tipAmount += tipAmt
        if (isCash) existing.cashTipAmount += tipAmt
        else existing.nonCashTipAmount += tipAmt
        if (!existing.paymentModes.includes(mode)) existing.paymentModes.push(mode)
      } else {
        map.set(id, {
          staffId: id,
          staffName: name,
          tipAmount: tipAmt,
          cashTipAmount: isCash ? tipAmt : 0,
          nonCashTipAmount: isCash ? 0 : tipAmt,
          paymentModes: [mode]
        })
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

  const handleMarkTipAsPaid = async (row: { staffId: string; staffName: string; tipAmount: number; nonCashTipAmount: number }) => {
    const from = staffTipDateRange?.from
    const to = staffTipDateRange?.to
    if (!from || !to) return
    const amountToMark = row.nonCashTipAmount > 0 ? row.nonCashTipAmount : row.tipAmount
    try {
      const res = await ReportsAPI.createTipPayout({
        staffId: row.staffId,
        staffName: row.staffName,
        amount: amountToMark,
        dateFrom: from.toISOString(),
        dateTo: to.toISOString()
      })
      if (res?.success) {
        toast({ title: "Marked as paid", description: `₹${amountToMark.toFixed(2)} paid to ${row.staffName}.` })
        const list = await ReportsAPI.getTipPayouts({
          dateFrom: from.toISOString(),
          dateTo: to.toISOString()
        })
        if (list?.success && list?.data) setTipPayouts(Array.isArray(list.data) ? list.data : [])
        setStaffTipRefreshKey((k) => k + 1)
      } else throw new Error((res as any)?.error || "Failed")
    } catch (e: any) {
      toast({ title: "Failed to mark as paid", description: e?.message || "Please try again.", variant: "destructive" })
    }
  }

  // Reset partial/unpaid card when filters change
  useEffect(() => {
    setShowPartialUnpaidBreakdown(false)
  }, [debouncedSearchTerm, paymentFilter, statusFilter, staffTipFilter, datePeriod, dateRange])

  // Pagination for the sales table (server-side; order matches API — newest saved bill first)
  const totalSalesRows = salesTotalCount
  const displayTotalPages = Math.max(1, salesTotalPages)
  const safeSalesPageIndex = Math.min(salesPageIndex, displayTotalPages - 1)
  const paginatedSales = salesListRows
  const salesStartRow = totalSalesRows === 0 ? 0 : safeSalesPageIndex * salesPageSize + 1
  const salesEndRow = totalSalesRows === 0 ? 0 : Math.min(salesStartRow + Math.max(0, paginatedSales.length - 1), totalSalesRows)

  const totalRevenue = summaryStats?.totalRevenue ?? 0
  const completedSales = summaryStats?.completedSales ?? 0
  const partialSales = summaryStats?.partialSales ?? 0
  const unpaidSales = summaryStats?.unpaidSales ?? 0
  const unpaidValue = summaryStats?.unpaidValue ?? 0
  const tipsCollected = summaryStats?.tips ?? 0
  const cashCollected = summaryStats?.cashCollected ?? 0
  const onlineCashCollected = summaryStats?.onlineCash ?? 0

  const cashCollectedTooltip =
    paymentFilter === "all"
      ? "Cash payments only"
      : paymentFilter === "Cash"
        ? "Filtered: Cash only"
        : "All cash payments"
  const onlineCashCollectedTooltip =
    paymentFilter === "all"
      ? "Card + Online/Paytm"
      : paymentFilter === "Card"
        ? "Filtered: Card only"
        : paymentFilter === "Online"
          ? "Filtered: Online only"
          : "All online payments"

  const salesStatSkeleton = <div className="h-8 w-24 max-w-full bg-slate-200 rounded animate-pulse" aria-hidden />

  useEffect(() => {
    setSalesPageIndex((i) => Math.min(i, Math.max(0, salesTotalPages - 1)))
  }, [salesTotalPages])

  const handleExportPDF = async () => {
    toast({ title: "Export requested", description: "Generating sales report PDF...", duration: 3000 })
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
        case 'custom':
          if (dateRange.from && dateRange.to) {
            const eff = getEffectiveDateParams(dateRange.from, dateRange.to);
            dateFrom = eff.dateFrom ? new Date(eff.dateFrom) : undefined;
            dateTo = eff.dateTo ? new Date(eff.dateTo) : undefined;
          } else {
            dateFrom = undefined;
            dateTo = undefined;
          }
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
    toast({ title: "Export requested", description: "Generating sales report Excel...", duration: 3000 })
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
        case 'custom':
          if (dateRange.from && dateRange.to) {
            const eff = getEffectiveDateParams(dateRange.from, dateRange.to);
            dateFrom = eff.dateFrom ? new Date(eff.dateFrom) : undefined;
            dateTo = eff.dateTo ? new Date(eff.dateTo) : undefined;
          } else {
            dateFrom = undefined;
            dateTo = undefined;
          }
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
    return getEffectiveDateParams(range.from, range.to)
  }

  function getProductListExportDateRange(): { dateFrom?: string; dateTo?: string } {
    if (productListDatePeriod === "all") return {}
    const range = productListDateRange.from && productListDateRange.to
      ? productListDateRange
      : getServiceListDateRangeFromPeriod(productListDatePeriod)
    if (!range.from || !range.to) return {}
    return getEffectiveDateParams(range.from, range.to)
  }

  function getSummaryExportDateRange(): { dateFrom?: string; dateTo?: string } {
    if (dateRange?.from && dateRange?.to) {
      return getEffectiveDateParams(dateRange.from, dateRange.to)
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
    toast({ title: "Export requested", description: "Generating summary report PDF...", duration: 3000 })
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
    toast({ title: "Export requested", description: "Generating summary report Excel...", duration: 3000 })
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
    toast({ title: "Export requested", description: "Generating service list PDF...", duration: 3000 })
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
    toast({ title: "Export requested", description: "Generating service list Excel...", duration: 3000 })
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

  const handleExportProductListPDF = async () => {
    toast({ title: "Export requested", description: "Generating product list PDF...", duration: 3000 })
    try {
      const { ReportsAPI } = await import("@/lib/api")
      const filters: any = getProductListExportDateRange()
      if (productListStatusFilter !== "all") filters.status = productListStatusFilter
      if (productListModeFilter !== "all") filters.paymentMode = productListModeFilter
      if (productListProductFilter !== "all") filters.productId = productListProductFilter
      if (productListStaffFilter !== "all") filters.staffId = productListStaffFilter
      const result = await ReportsAPI.exportProductList("pdf", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Product list report sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.message || "Failed to export PDF.", variant: "destructive" })
    }
  }

  const handleExportProductListXLS = async () => {
    toast({ title: "Export requested", description: "Generating product list Excel...", duration: 3000 })
    try {
      const { ReportsAPI } = await import("@/lib/api")
      const filters: any = getProductListExportDateRange()
      if (productListStatusFilter !== "all") filters.status = productListStatusFilter
      if (productListModeFilter !== "all") filters.paymentMode = productListModeFilter
      if (productListProductFilter !== "all") filters.productId = productListProductFilter
      if (productListStaffFilter !== "all") filters.staffId = productListStaffFilter
      const result = await ReportsAPI.exportProductList("xlsx", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Product list report sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.message || "Failed to export Excel.", variant: "destructive" })
    }
  }

  function getAppointmentListExportFilters(): Record<string, string | boolean> {
    const range = appointmentListDatePeriod === "custom"
      ? (appointmentListDateRange.from && appointmentListDateRange.to ? appointmentListDateRange : getDateRangeFromPeriod("last7days"))
      : appointmentListDatePeriod === "all"
        ? { from: undefined, to: undefined }
        : getDateRangeFromPeriod(appointmentListDatePeriod)
    const result: Record<string, string | boolean> = {
      dateFilterType: appointmentListDateFilterType,
      status: appointmentListStatusFilter,
      showWalkIn: appointmentListShowWalkIn
    }
    if (range.from && range.to) {
      const { dateFrom, dateTo } = getEffectiveDateParams(range.from, range.to)
      if (dateFrom && dateTo) {
        result.dateFrom = dateFrom
        result.dateTo = dateTo
      }
    }
    return result
  }

  const handleExportAppointmentListXLS = async () => {
    toast({ title: "Export requested", description: "Sending appointment list via email...", duration: 3000 })
    try {
      const filters = getAppointmentListExportFilters()
      const result = await ReportsAPI.exportAppointmentList("xlsx", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Appointment list report sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" })
    }
  }

  const handleExportAppointmentListPDF = async () => {
    toast({ title: "Export requested", description: "Sending appointment list via email...", duration: 3000 })
    try {
      const filters = getAppointmentListExportFilters()
      const result = await ReportsAPI.exportAppointmentList("pdf", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Appointment list report sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" })
    }
  }

  function getDeletedInvoiceExportFilters(): Record<string, string> {
    const range = deletedInvoiceDatePeriod === "custom"
      ? (deletedInvoiceDateRange.from && deletedInvoiceDateRange.to ? deletedInvoiceDateRange : getDateRangeFromPeriod("last7days"))
      : deletedInvoiceDatePeriod === "all"
        ? { from: undefined, to: undefined }
        : getDateRangeFromPeriod(deletedInvoiceDatePeriod)
    if (range.from && range.to) {
      const { dateFrom, dateTo } = getEffectiveDateParams(range.from, range.to)
      if (dateFrom && dateTo) return { dateFrom, dateTo }
    }
    return {}
  }

  const handleExportDeletedInvoiceXLS = async () => {
    toast({ title: "Export requested", description: "Sending deleted invoice report via email...", duration: 3000 })
    try {
      const filters = getDeletedInvoiceExportFilters()
      const result = await ReportsAPI.exportDeletedInvoices("xlsx", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Deleted invoice report sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" })
    }
  }

  const handleExportDeletedInvoicePDF = async () => {
    toast({ title: "Export requested", description: "Sending deleted invoice report via email...", duration: 3000 })
    try {
      const filters = getDeletedInvoiceExportFilters()
      const result = await ReportsAPI.exportDeletedInvoices("pdf", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Deleted invoice report sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" })
    }
  }

  function getUnpaidPartPaidExportFilters(): Record<string, string> {
    const range = unpaidPartPaidDatePeriod === "custom"
      ? (unpaidPartPaidDateRange.from && unpaidPartPaidDateRange.to ? unpaidPartPaidDateRange : getDateRangeFromPeriod("last7days"))
      : unpaidPartPaidDatePeriod === "all"
        ? { from: undefined, to: undefined }
        : getDateRangeFromPeriod(unpaidPartPaidDatePeriod)
    const result: Record<string, string> = { status: unpaidPartPaidStatusFilter }
    if (range.from && range.to) {
      const { dateFrom, dateTo } = getEffectiveDateParams(range.from, range.to)
      if (dateFrom && dateTo) {
        result.dateFrom = dateFrom
        result.dateTo = dateTo
      }
    }
    return result
  }

  const handleExportUnpaidPartPaidXLS = async () => {
    toast({ title: "Export requested", description: "Sending Unpaid/Part-Paid report via email...", duration: 3000 })
    try {
      const filters = getUnpaidPartPaidExportFilters()
      const result = await ReportsAPI.exportUnpaidPartPaid("xlsx", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Unpaid/Part-Paid report sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" })
    }
  }

  const handleExportUnpaidPartPaidPDF = async () => {
    toast({ title: "Export requested", description: "Sending Unpaid/Part-Paid report via email...", duration: 3000 })
    try {
      const filters = getUnpaidPartPaidExportFilters()
      const result = await ReportsAPI.exportUnpaidPartPaid("pdf", filters)
      if (result?.success) {
        toast({ title: "Export successful", description: result.message || "Unpaid/Part-Paid report sent to admin email(s)." })
      } else throw new Error(result?.error || "Export failed")
    } catch (error: any) {
      toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" })
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
    if (!selectedSale || !deleteSaleReason.trim()) return
    
    try {
      // Call the API to delete the sale from the database
      const response = await SalesAPI.delete(selectedSale.id, deleteSaleReason.trim())
      
      if (response.success) {
        setSalesRefreshKey((k) => k + 1)
        setIsDeleteDialogOpen(false)
        setSelectedSale(null)
        setDeleteSaleReason("")
        
        toast({
          title: "Sale Deleted",
          description: `Sale record for ${selectedSale.customerName} has been successfully deleted.`,
        })
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
    // First priority: Check if there are payments (new split payment structure)
    if (sale.payments && sale.payments.length > 0) {
      const paymentModes = sale.payments.map(payment => payment.mode)
      const uniqueModes = [...new Set(paymentModes)]
      return uniqueModes.join(", ")
    }
    
    // Second priority: Check legacy paymentMode field
    if (sale.paymentMode) {
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

  // Payment summary: Taxable Amount | GST | Total Paid
  const getTaxableAmount = (sale: SalesRecord) => Math.max(0, (sale.grossTotal || 0) - (sale.taxAmount || 0))
  const getGST = (sale: SalesRecord) => sale.taxAmount || 0
  const getTotalPaid = (sale: SalesRecord, forceFull = false) => {
    const fullPaid = sale.paymentStatus?.paidAmount ?? sale.payments?.reduce((s, p) => s + (p.amount || 0), 0) ?? 0
    if (forceFull || paymentFilter === "all") return fullPaid
    if (sale.payments && sale.payments.length > 0) {
      const filteredPayment = sale.payments.find(payment => payment.mode === paymentFilter)
      return filteredPayment ? filteredPayment.amount : 0
    }
    return sale.paymentMode === paymentFilter ? fullPaid : 0
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
                  <SelectItem value="product-list">Product List</SelectItem>
                  <SelectItem value="appointment-list">Appointment List</SelectItem>
                  <SelectItem value="deleted-invoice">Deleted Invoice</SelectItem>
                  <SelectItem value="unpaid-part-paid">Unpaid/Part-Paid</SelectItem>
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
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.from ? format(dateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange?.from}
                            onSelect={(d) => setDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                            disabled={(d) => d > new Date() || (dateRange?.to ? d > dateRange.to : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.to ? format(dateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange?.to}
                            onSelect={(d) => setDateRange((r) => ({ from: r?.from, to: d }))}
                            disabled={(d) => d > new Date() || (dateRange?.from ? d < dateRange.from : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
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
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.from ? format(dateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange?.from}
                            onSelect={(d) => setDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                            disabled={(d) => d > new Date() || (dateRange?.to ? d > dateRange.to : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.to ? format(dateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange?.to}
                            onSelect={(d) => setDateRange((r) => ({ from: r?.from, to: d }))}
                            disabled={(d) => d > new Date() || (dateRange?.from ? d < dateRange.from : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
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
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.from ? format(dateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange?.from}
                            onSelect={(d) => setDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                            disabled={(d) => d > new Date() || (dateRange?.to ? d > dateRange.to : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.to ? format(dateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange?.to}
                            onSelect={(d) => setDateRange((r) => ({ from: r?.from, to: d }))}
                            disabled={(d) => d > new Date() || (dateRange?.from ? d < dateRange.from : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
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
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {serviceListDateRange?.from ? format(serviceListDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={serviceListDateRange?.from}
                            onSelect={(d) => setServiceListDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                            disabled={(d) => d > new Date() || (serviceListDateRange?.to ? d > serviceListDateRange.to : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {serviceListDateRange?.to ? format(serviceListDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={serviceListDateRange?.to}
                            onSelect={(d) => setServiceListDateRange((r) => ({ from: r?.from, to: d }))}
                            disabled={(d) => d > new Date() || (serviceListDateRange?.from ? d < serviceListDateRange.from : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
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
              {reportType === "product-list" && (
                <>
                  <Select value={productListProductFilter} onValueChange={setProductListProductFilter}>
                    <SelectTrigger className="w-44 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Product" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All products</SelectItem>
                      {productListProducts.map((p) => (
                        <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={productListDatePeriod} onValueChange={handleProductListDatePeriodChange}>
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
                  {productListDatePeriod === "custom" && (
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {productListDateRange?.from ? format(productListDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={productListDateRange?.from}
                            onSelect={(d) => setProductListDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                            disabled={(d) => d > new Date() || (productListDateRange?.to ? d > productListDateRange.to : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {productListDateRange?.to ? format(productListDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={productListDateRange?.to}
                            onSelect={(d) => setProductListDateRange((r) => ({ from: r?.from, to: d }))}
                            disabled={(d) => d > new Date() || (productListDateRange?.from ? d < productListDateRange.from : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                  <Select value={productListStaffFilter} onValueChange={setProductListStaffFilter}>
                    <SelectTrigger className="w-44 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Staff" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All staff</SelectItem>
                      {productListStaff.map((s) => (
                        <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={productListStatusFilter} onValueChange={setProductListStatusFilter}>
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
                  <Select value={productListModeFilter} onValueChange={setProductListModeFilter}>
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
              {reportType === "appointment-list" && (
                <>
                  <Select value={appointmentListDateFilterType} onValueChange={(v: "appointment_date" | "created_date") => setAppointmentListDateFilterType(v)}>
                    <SelectTrigger className="w-44 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Date type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appointment_date">Appointment Date</SelectItem>
                      <SelectItem value="created_date">Created Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={appointmentListDatePeriod} onValueChange={(v: DatePeriod) => handleAppointmentListDatePeriodChange(v)}>
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
                  {appointmentListDatePeriod === "custom" && (
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {appointmentListDateRange?.from ? format(appointmentListDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={appointmentListDateRange?.from}
                            onSelect={(d) => setAppointmentListDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                            disabled={(d) => d > new Date() || (appointmentListDateRange?.to ? d > appointmentListDateRange.to : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {appointmentListDateRange?.to ? format(appointmentListDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={appointmentListDateRange?.to}
                            onSelect={(d) => setAppointmentListDateRange((r) => ({ from: r?.from, to: d }))}
                            disabled={(d) => d > new Date() || (appointmentListDateRange?.from ? d < appointmentListDateRange.from : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                  <Select value={appointmentListStatusFilter} onValueChange={setAppointmentListStatusFilter}>
                    <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="arrived">Arrived</SelectItem>
                      <SelectItem value="started">Started</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 text-sm whitespace-nowrap">
                    <Switch
                      checked={appointmentListShowWalkIn}
                      onCheckedChange={setAppointmentListShowWalkIn}
                    />
                    <span>Show walk-in appointments</span>
                  </label>
                </>
              )}
              {reportType === "deleted-invoice" && (
                <>
                  <Select value={deletedInvoiceDatePeriod} onValueChange={(v: DatePeriod) => handleDeletedInvoiceDatePeriodChange(v)}>
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
                  {deletedInvoiceDatePeriod === "custom" && (
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {deletedInvoiceDateRange?.from ? format(deletedInvoiceDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={deletedInvoiceDateRange?.from}
                            onSelect={(d) => setDeletedInvoiceDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                            disabled={(d) => d > new Date() || (deletedInvoiceDateRange?.to ? d > deletedInvoiceDateRange.to : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {deletedInvoiceDateRange?.to ? format(deletedInvoiceDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={deletedInvoiceDateRange?.to}
                            onSelect={(d) => setDeletedInvoiceDateRange((r) => ({ from: r?.from, to: d }))}
                            disabled={(d) => d > new Date() || (deletedInvoiceDateRange?.from ? d < deletedInvoiceDateRange.from : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </>
              )}
              {reportType === "unpaid-part-paid" && (
                <>
                  <Select value={unpaidPartPaidDatePeriod} onValueChange={(v: DatePeriod) => handleUnpaidPartPaidDatePeriodChange(v)}>
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
                  {unpaidPartPaidDatePeriod === "custom" && (
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {unpaidPartPaidDateRange?.from ? format(unpaidPartPaidDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={unpaidPartPaidDateRange?.from}
                            onSelect={(d) => setUnpaidPartPaidDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                            disabled={(d) => d > new Date() || (unpaidPartPaidDateRange?.to ? d > unpaidPartPaidDateRange.to : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-36 justify-start text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 h-10 px-3">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {unpaidPartPaidDateRange?.to ? format(unpaidPartPaidDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={unpaidPartPaidDateRange?.to}
                            onSelect={(d) => setUnpaidPartPaidDateRange((r) => ({ from: r?.from, to: d }))}
                            disabled={(d) => d > new Date() || (unpaidPartPaidDateRange?.from ? d < unpaidPartPaidDateRange.from : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                  <Select value={unpaidPartPaidStatusFilter} onValueChange={setUnpaidPartPaidStatusFilter}>
                    <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="part_paid">Part Paid</SelectItem>
                      <SelectItem value="overdue">Overdue (after 30 Days)</SelectItem>
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
              {(reportType === "sales" || reportType === "staff-tip" || reportType === "summary" || reportType === "service-list" || reportType === "product-list" || reportType === "appointment-list" || reportType === "deleted-invoice" || reportType === "unpaid-part-paid") && (
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
                      {reportType === "product-list" && (
                        <>
                          <DropdownMenuItem onClick={handleExportProductListPDF} className="cursor-pointer">
                            <FileText className="h-4 w-4 mr-2" />
                            Export as PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleExportProductListXLS} className="cursor-pointer">
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Export as Excel
                          </DropdownMenuItem>
                        </>
                      )}
                      {reportType === "appointment-list" && (
                        <>
                          <DropdownMenuItem onClick={handleExportAppointmentListXLS} className="cursor-pointer">
                            <Mail className="h-4 w-4 mr-2" />
                            Export via Email (Excel)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleExportAppointmentListPDF} className="cursor-pointer">
                            <Mail className="h-4 w-4 mr-2" />
                            Export via Email (PDF)
                          </DropdownMenuItem>
                        </>
                      )}
                      {reportType === "deleted-invoice" && (
                        <>
                          <DropdownMenuItem onClick={handleExportDeletedInvoiceXLS} className="cursor-pointer">
                            <Mail className="h-4 w-4 mr-2" />
                            Export via Email (Excel)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleExportDeletedInvoicePDF} className="cursor-pointer">
                            <Mail className="h-4 w-4 mr-2" />
                            Export via Email (PDF)
                          </DropdownMenuItem>
                        </>
                      )}
                      {reportType === "unpaid-part-paid" && (
                        <>
                          <DropdownMenuItem onClick={handleExportUnpaidPartPaidXLS} className="cursor-pointer">
                            <Mail className="h-4 w-4 mr-2" />
                            Export via Email (Excel)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleExportUnpaidPartPaidPDF} className="cursor-pointer">
                            <Mail className="h-4 w-4 mr-2" />
                            Export via Email (PDF)
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

      {reportType === "appointment-list" ? (
        <div className="min-h-[400px] bg-slate-50/80 rounded-2xl p-6 space-y-6">
          {appointmentListLoading ? (
            <div className="flex justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-slate-500 text-sm">Loading appointments...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="bg-white border-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">No. Of Appointments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-slate-900">{appointmentListSummary.count}</p>
                  </CardContent>
                </Card>
                <Card className="bg-white border-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">Total Value</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-slate-900">
                      ₹{appointmentListSummary.totalValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="font-semibold">Customer Name</TableHead>
                      <TableHead className="font-semibold">Created Date</TableHead>
                      <TableHead className="font-semibold">Start Date</TableHead>
                      <TableHead className="font-semibold">Price</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Payment Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointmentListData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                          No appointments found for selected date
                        </TableCell>
                      </TableRow>
                    ) : (
                      appointmentListData.map((row) => (
                        <TableRow key={row.id} className="border-slate-50">
                          <TableCell>{row.customerName}</TableCell>
                          <TableCell>
                            {row.createdAt ? format(new Date(row.createdAt), "dd MMM yyyy") : "—"}
                          </TableCell>
                          <TableCell>
                            {row.startDate && row.startTime
                              ? `${row.startDate} ${row.startTime}`
                              : row.startDate || "—"}
                          </TableCell>
                          <TableCell>₹{(row.price ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                          <TableCell>
                            <Badge variant={row.status === "Cancelled" ? "destructive" : "secondary"} className="capitalize">
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{row.paymentStatus}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      ) : reportType === "deleted-invoice" ? (
        <div className="min-h-[400px] bg-slate-50/80 rounded-2xl p-6 space-y-6">
          {deletedInvoiceLoading ? (
            <div className="flex justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-slate-500 text-sm">Loading deleted invoices...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="bg-white border-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">No. Of Bills</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-slate-900">{deletedInvoiceSummary.count}</p>
                  </CardContent>
                </Card>
                <Card className="bg-white border-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">Total Value</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-slate-900">
                      ₹{deletedInvoiceSummary.totalValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="font-semibold">Bill No.</TableHead>
                      <TableHead className="font-semibold">Customer Name</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Reason</TableHead>
                      <TableHead className="font-semibold">Cancelled By</TableHead>
                      <TableHead className="font-semibold">Gross Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedInvoiceData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                          No deleted invoices found for selected date
                        </TableCell>
                      </TableRow>
                    ) : (
                      deletedInvoiceData.map((row) => {
                        const bill = row.originalBill
                        const receiptData = bill ? {
                          receiptNumber: bill.billNo,
                          clientName: bill.customerName,
                          clientPhone: bill.customerPhone || "",
                          date: bill.date,
                          time: typeof bill.date === "string" ? bill.date.split("T")[1]?.slice(0, 5) || "" : new Date(bill.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
                          items: (bill.items || []).map((item: any) => ({
                            name: item.name,
                            type: item.type,
                            quantity: item.quantity,
                            price: item.price,
                            total: item.total,
                            staffName: item.staffName || bill.staffName,
                            staffContributions: item.staffContributions
                          })),
                          subtotal: bill.netTotal,
                          tax: bill.taxAmount,
                          total: (bill.grossTotal || 0) + (bill.tip || 0),
                          tip: bill.tip || 0,
                          tipStaffName: bill.tipStaffName,
                          payments: (bill.payments || []).map((p: any) => ({ type: (p.mode || p.type || "cash").toLowerCase(), amount: p.amount })),
                          staffName: bill.staffName,
                          taxBreakdown: bill.taxBreakdown,
                          status: "cancelled",
                          invoiceDeleted: true,
                        } : null
                        return (
                          <TableRow key={row.id} className="border-slate-50">
                            <TableCell>
                              {receiptData ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const dataStr = encodeURIComponent(JSON.stringify(receiptData))
                                    router.push(
                                      `/receipt/${encodeURIComponent(row.billNo || bill.billNo)}?data=${dataStr}&returnTo=${encodeURIComponent(buildReportsReturnPath())}`
                                    )
                                  }}
                                  className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium text-left"
                                  title="View receipt"
                                >
                                  {row.billNo || "—"}
                                </button>
                              ) : (
                                row.billNo || "—"
                              )}
                            </TableCell>
                            <TableCell>{row.customerName}</TableCell>
                            <TableCell>
                              {row.date ? format(new Date(row.date), "dd MMM yyyy") : "—"}
                            </TableCell>
                            <TableCell>{row.reason || "—"}</TableCell>
                            <TableCell>{row.cancelledBy || "—"}</TableCell>
                            <TableCell>₹{(row.grossTotal ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      ) : reportType === "unpaid-part-paid" ? (
        <div className="min-h-[400px] bg-slate-50/80 rounded-2xl p-6 space-y-6">
          {unpaidPartPaidLoading ? (
            <div className="flex justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-slate-500 text-sm">Loading unpaid/part-paid bills...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="bg-white border-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">No. Of Bills</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-slate-900">{unpaidPartPaidSummary.count}</p>
                  </CardContent>
                </Card>
                <Card className="bg-white border-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">Total Outstanding Value</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-slate-900">
                      ₹{unpaidPartPaidSummary.totalOutstanding.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="font-semibold">Invoice Number</TableHead>
                      <TableHead className="font-semibold">Customer Name</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Invoice Amount</TableHead>
                      <TableHead className="font-semibold">Outstanding Amount</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unpaidPartPaidData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                          No bills found for selected filters
                        </TableCell>
                      </TableRow>
                    ) : (
                      unpaidPartPaidData.map((row) => (
                        <TableRow key={row.id} className="border-slate-50">
                          <TableCell className="font-medium">{row.billNo}</TableCell>
                          <TableCell>
                            <div>{row.customerName}</div>
                            {row.customerPhone && (
                              <div className="text-sm text-slate-500">{row.customerPhone}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.date ? format(new Date(row.date), "dd MMM yyyy") : "—"}
                          </TableCell>
                          <TableCell>₹{(row.invoiceAmount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                          <TableCell>
                            <span className={row.outstandingAmount > 0 ? "font-semibold text-red-600" : ""}>
                              ₹{(row.outstandingAmount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.status === "Overdue" ? "destructive" :
                                row.status === "Unpaid" ? "destructive" :
                                row.status === "Part Paid" ? "secondary" : "default"
                              }
                              className="capitalize"
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      ) : reportType === "service-list" ? (
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
      ) : reportType === "product-list" ? (
        <ProductListReport
          controlledFilters={{
            datePeriod: productListDatePeriod,
            setDatePeriod: setProductListDatePeriod,
            dateRange: productListDateRange,
            setDateRange: setProductListDateRange,
            productFilter: productListProductFilter,
            setProductFilter: setProductListProductFilter,
            staffFilter: productListStaffFilter,
            setStaffFilter: setProductListStaffFilter,
            statusFilter: productListStatusFilter,
            setStatusFilter: setProductListStatusFilter,
            modeFilter: productListModeFilter,
            setModeFilter: setProductListModeFilter,
          }}
        />
      ) : reportType === "summary" ? (
        <div className="min-h-[480px] bg-slate-50/80 rounded-2xl p-6 space-y-6">
          {summaryReportLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-slate-500 text-sm">Loading summary...</p>
              </div>
            </div>
          ) : summaryData ? (
            <TooltipProvider delayDuration={200}>
              {/* 1. Top KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 hover:shadow-md hover:border-slate-200/80 transition-all duration-200">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Sales</p>
                  <p className="text-2xl font-bold text-slate-900 tracking-tight">₹{summaryData.totalSales.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-0.5">
                    <ArrowUpRight className="h-3 w-3" /> Revenue for period
                  </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 hover:shadow-md hover:border-slate-200/80 transition-all duration-200">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Bills</p>
                  <p className="text-2xl font-bold text-slate-900 tracking-tight">{summaryData.totalBillCount}</p>
                  <p className="text-xs text-slate-400 mt-1.5">Transactions</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 hover:shadow-md hover:border-slate-200/80 transition-all duration-200">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Customers</p>
                  <p className="text-2xl font-bold text-slate-900 tracking-tight">{summaryData.totalCustomerCount}</p>
                  <p className="text-xs text-slate-400 mt-1.5">Unique visitors</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 hover:shadow-md hover:border-slate-200/80 transition-all duration-200">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Average Bill Value</p>
                  <p className="text-2xl font-bold text-slate-900 tracking-tight">
                    ₹{(summaryData.totalBillCount > 0 ? (summaryData.totalSales / summaryData.totalBillCount) : 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-400 mt-1.5">Total Sales ÷ Total Bills</p>
                </div>
              </div>

              {/* 2. Grouped Sections */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Section A: Revenue Overview */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-indigo-500" />
                    Revenue Overview
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Total Sales</span>
                      <span className="font-semibold text-slate-900">₹{summaryData.totalSales.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 flex items-center gap-1.5">
                        Dues Collected
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs p-3">
                            <p className="text-sm">Payments received during this period on previously unpaid or partially paid bills.</p>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="font-semibold text-emerald-600">₹{summaryData.duesCollected.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Tip Collected</span>
                      <span className="font-semibold text-emerald-600">₹{summaryData.tipCollected.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Section: Outstanding */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Outstanding
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs p-3">
                        <p className="text-sm">Outstanding = revenue generated but not yet collected. Bills with unpaid or partially paid amounts in the selected period.</p>
                      </TooltipContent>
                    </Tooltip>
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Total Due</span>
                      <span className={`font-semibold ${(summaryData.totalDue ?? 0) > 0 ? "text-amber-600" : "text-slate-900"}`}>
                        ₹{(summaryData.totalDue ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Customers with Due</span>
                      <span className={`font-semibold ${(summaryData.customersWithDue ?? 0) > 0 ? "text-amber-600" : "text-slate-900"}`}>
                        {summaryData.customersWithDue ?? 0}
                      </span>
                    </div>
                    {(summaryData.totalDue ?? 0) === 0 && (summaryData.customersWithDue ?? 0) === 0 && (
                      <p className="text-xs text-slate-400 pt-1">No outstanding payments</p>
                    )}
                    {(summaryData.totalDue ?? 0) > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 border-amber-200 text-amber-700 hover:bg-amber-50"
                        onClick={() => router.push("/reports/unpaid-bills")}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View unpaid invoices
                      </Button>
                    )}
                  </div>
                </div>

                {/* Section B: Payment Mode Breakdown */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-indigo-500" />
                    Payment Mode Breakdown
                  </h3>
                  {summaryData.totalSales > 0 ? (
                    <div className="space-y-4">
                      {[
                        { label: "Cash", value: summaryData.totalSalesCash, color: "bg-emerald-500" },
                        { label: "Online", value: summaryData.totalSalesOnline, color: "bg-blue-500" },
                        { label: "Card", value: summaryData.totalSalesCard, color: "bg-violet-500" },
                      ].map(({ label, value, color }) => (
                        <div key={label}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-600">{label}</span>
                            <span className="font-medium text-slate-900">₹{value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${color} transition-all duration-500`}
                              style={{ width: `${Math.min(100, (value / summaryData.totalSales) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">No payment data for this period.</p>
                  )}
                </div>

                {/* Section C: Expenses */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-indigo-500" />
                    Expenses
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 flex items-center gap-1.5">
                        Cash Expense
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs p-3">
                            <p className="text-sm">Cash paid out for expenses during this period (e.g. supplies, misc).</p>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className={`font-semibold ${summaryData.cashExpense > 0 ? "text-red-600" : "text-slate-900"}`}>
                        ₹{summaryData.cashExpense.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 flex items-center gap-1.5">
                        Petty Cash Expense
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs p-3">
                            <p className="text-sm">Expenses paid from the petty cash wallet during this period.</p>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className={`font-semibold ${(summaryData.pettyCashExpense ?? 0) > 0 ? "text-red-600" : "text-slate-900"}`}>
                        ₹{(summaryData.pettyCashExpense ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section D: Final Settlement (single day) / Total Cash Balance (date range) */}
                {(() => {
                  const isSummarySingleDay = datePeriod === "today" || datePeriod === "yesterday" ||
                    (datePeriod === "custom" && dateRange.from && dateRange.to && toDateStringIST(dateRange.from) === toDateStringIST(dateRange.to))
                  const expectedCashInDrawer = (summaryData.openingBalance ?? 0) + summaryData.totalSalesCash + (summaryData.cashDuesCollected ?? 0) - summaryData.cashExpense
                  const cashBalance = summaryData.closingBalance ?? summaryData.cashBalance ?? 0
                  const diff = Math.abs(cashBalance - expectedCashInDrawer)
                  const cashBalanceColor = diff < 0.01 ? "text-emerald-600" : cashBalance < expectedCashInDrawer ? "text-red-600" : "text-orange-600"
                  return (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-indigo-500" />
                    {isSummarySingleDay ? "Final Settlement" : "Total Cash Balance"}
                  </h3>
                  <div className="space-y-4">
                    {isSummarySingleDay ? (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-600 flex items-center gap-1.5">
                                Expected Cash in Drawer
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs p-3">
                                    <p className="text-sm">Opening Balance + Cash Sales + Cash Dues Collected − Cash Expenses</p>
                                  </TooltipContent>
                                </Tooltip>
                              </span>
                              <span className="font-semibold text-slate-900">₹{expectedCashInDrawer.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                              <span className="text-slate-600 flex items-center gap-1.5">
                                Cash Balance
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs p-3">
                                    <p className="text-sm">Closing balance recorded in the cash registry when the shift was closed.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </span>
                              <span className={`font-bold text-lg ${cashBalanceColor}`}>
                                ₹{cashBalance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </>
                    ) : (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 flex items-center gap-1.5">
                          Total Cash Balance
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs p-3">
                              <p className="text-sm">Total cash balance across the selected date range.</p>
                            </TooltipContent>
                          </Tooltip>
                        </span>
                        <span className={`font-bold text-lg ${cashBalanceColor}`}>
                          ₹{cashBalance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                  )
                })()}
              </div>

            </TooltipProvider>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500">
              <Receipt className="h-12 w-12 text-slate-300 mb-3" />
              <p className="font-medium">No summary data</p>
              <p className="text-sm">Select a different date range to view metrics.</p>
            </div>
          )}
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
                    <TableHead>Mode of Payment</TableHead>
                    <TableHead className="w-[140px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffTipAggregated.map((row) => {
                    const isAllCash = row.nonCashTipAmount < 0.01
                    const paidAmount = staffTipPaidAmountByStaff.get(row.staffId) || 0
                    const paid = isAllCash || paidAmount >= row.nonCashTipAmount - 0.01
                    const paymentModeLabel = row.paymentModes.length === 1 ? row.paymentModes[0] : "Mixed"
                    return (
                      <TableRow key={row.staffId}>
                        <TableCell className="font-medium">{row.staffName}</TableCell>
                        <TableCell className="text-right">₹{row.tipAmount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {paymentModeLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {isAllCash ? (
                            <span className="text-slate-500 text-sm">—</span>
                          ) : paid ? (
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
        <TooltipProvider delayDuration={200}>
        <>
      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <CursorTooltip wrapperClassName="h-full min-h-0" className="text-center" content="Successfully completed">
          <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-900">Completed Sales</CardTitle>
              <div className="p-2 bg-gray-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {salesStatsLoading ? salesStatSkeleton : completedSales}
              </div>
            </CardContent>
          </Card>
        </CursorTooltip>

        <CursorTooltip
          wrapperClassName="h-full min-h-0"
          wrapperTabIndex={-1}
          className="text-center"
          content={
            showPartialUnpaidBreakdown
              ? "Click the card to show combined partial + unpaid count."
              : "Partial + unpaid bill count for current filters. Click the card to see partial vs unpaid."
          }
        >
          <Card
            className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 h-full cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            role="button"
            tabIndex={0}
            aria-expanded={showPartialUnpaidBreakdown}
            aria-label={
              showPartialUnpaidBreakdown
                ? "Partial and unpaid breakdown. Activate to show combined count."
                : "Partial and unpaid combined count. Activate to show breakdown."
            }
            onClick={() => setShowPartialUnpaidBreakdown((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setShowPartialUnpaidBreakdown((v) => !v)
              }
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-900">Partial/Unpaid Payments</CardTitle>
              <div className="p-2 bg-gray-100 rounded-lg">
                <Users className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              {salesStatsLoading ? (
                salesStatSkeleton
              ) : !showPartialUnpaidBreakdown ? (
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-gray-900">{partialSales + unpaidSales}</div>
                  <p className="text-xs font-medium text-gray-500">Partial + Unpaid</p>
                  <p className="text-xs text-gray-400">Click for breakdown</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-6">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Partial</p>
                    <p className="text-2xl font-bold text-gray-900">{partialSales}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Unpaid</p>
                    <p className="text-2xl font-bold text-gray-900">{unpaidSales}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </CursorTooltip>

        <CursorTooltip
          wrapperClassName="h-full min-h-0"
          className="text-center"
          content={<>From {totalSalesRows} sales</>}
        >
          <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-900">Total Revenue</CardTitle>
              <div className="p-2 bg-gray-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {salesStatsLoading ? salesStatSkeleton : `₹${totalRevenue.toFixed(2)}`}
              </div>
            </CardContent>
          </Card>
        </CursorTooltip>

        <CursorTooltip
          wrapperClassName="h-full min-h-0"
          className="text-center"
          content={
            <>
              Total outstanding · {partialSales + unpaidSales} bill{partialSales + unpaidSales === 1 ? "" : "s"}
            </>
          }
        >
          <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-900">Unpaid Value</CardTitle>
              <div className="p-2 bg-gray-100 rounded-lg">
                <Wallet className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {salesStatsLoading ? salesStatSkeleton : `₹${unpaidValue.toFixed(2)}`}
              </div>
            </CardContent>
          </Card>
        </CursorTooltip>

        <CursorTooltip wrapperClassName="h-full min-h-0" className="text-center" content={cashCollectedTooltip}>
          <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-900">Cash Collected</CardTitle>
              <div className="p-2 bg-gray-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {salesStatsLoading ? salesStatSkeleton : `₹${cashCollected.toFixed(2)}`}
              </div>
            </CardContent>
          </Card>
        </CursorTooltip>

        <CursorTooltip wrapperClassName="h-full min-h-0" className="text-center" content={onlineCashCollectedTooltip}>
          <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-900">Online Cash Collected</CardTitle>
              <div className="p-2 bg-gray-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {salesStatsLoading ? salesStatSkeleton : `₹${onlineCashCollected.toFixed(2)}`}
              </div>
            </CardContent>
          </Card>
        </CursorTooltip>

        <CursorTooltip wrapperClassName="h-full min-h-0" className="text-center" content="Tips from selected sales">
          <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-900">Tips Collected</CardTitle>
              <div className="p-2 bg-gray-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {salesStatsLoading ? salesStatSkeleton : `₹${tipsCollected.toFixed(2)}`}
              </div>
            </CardContent>
          </Card>
        </CursorTooltip>
      </div>

      {/* Sales Table – same layout as Service List / reports */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Table Header with pagination controls */}
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">Sales Records</h3>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {salesListLoading
                  ? "Loading…"
                  : totalSalesRows > 0
                    ? `Showing ${salesStartRow}-${salesEndRow} of ${totalSalesRows} sales`
                    : "No sales"}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Rows per page:</span>
                <Select
                  value={String(salesPageSize)}
                  disabled={salesListLoading}
                  onValueChange={(v) => {
                    setSalesPageSize(parseInt(v, 10))
                    setSalesPageIndex(0)
                  }}
                >
                  <SelectTrigger className="h-8 w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-slate-200">
                <TableHead className="font-semibold text-slate-800">Bill No.</TableHead>
                <TableHead className="font-semibold text-slate-800">Customer Name</TableHead>
                <TableHead className="font-semibold text-slate-800">Date & Time</TableHead>
                <TableHead className="font-semibold text-slate-800">Status</TableHead>
                <TableHead className="font-semibold text-slate-800">Payment Mode</TableHead>
                <TableHead className="font-semibold text-slate-800">Taxable Amount</TableHead>
                <TableHead className="font-semibold text-slate-800">GST</TableHead>
                <TableHead className="font-semibold text-slate-800">
                  <span className="inline-flex items-center gap-1">
                    Total Paid
                    {paymentFilter !== "all" && (
                    <Badge variant="secondary" className="ml-2 text-xs bg-blue-100 text-blue-700 border-blue-200">
                      {paymentFilter} only
                    </Badge>
                    )}
                  </span>
                </TableHead>
                <TableHead className="font-semibold text-slate-800">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesListLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16 text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                      <span className="text-sm">Loading sales…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-slate-500">
                    No sales records found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSales.map((sale) => (
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
                    <TableCell className="text-slate-600">
                      {(() => {
                        const parts = formatSalesRecordDateTimeParts(sale)
                        if (!parts) return "—"
                        return (
                          <div className="flex flex-col gap-0.5 tabular-nums">
                            <span>{parts.dateLine}</span>
                            <span className="text-xs text-slate-500">{parts.timeLine}</span>
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell>{getStatusBadge(sale.status)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {getPaymentModeDisplay(sale)}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600">₹{getTaxableAmount(sale).toFixed(2)}</TableCell>
                    <TableCell className="text-slate-600">₹{getGST(sale).toFixed(2)}</TableCell>
                    <TableCell className="font-semibold text-green-700">₹{getTotalPaid(sale).toFixed(2)}</TableCell>
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

        {/* Pagination Footer */}
        {displayTotalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Page {safeSalesPageIndex + 1} of {displayTotalPages}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSalesPageIndex(prev => Math.max(0, prev - 1))}
                  disabled={safeSalesPageIndex === 0 || salesListLoading}
                  className="h-9 px-4 border-gray-200 hover:border-gray-300"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSalesPageIndex(prev => Math.min(displayTotalPages - 1, prev + 1))}
                  disabled={safeSalesPageIndex >= displayTotalPages - 1 || salesListLoading}
                  className="h-9 px-4 border-gray-200 hover:border-gray-300"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
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
                  <label className="text-sm font-medium text-muted-foreground">Date &amp; time</label>
                  <p className="text-lg">
                    {(() => {
                      const parts = formatSalesRecordDateTimeParts(selectedBill)
                      if (!parts) return "—"
                      return (
                        <>
                          {parts.dateLine}
                          <span className="text-base font-normal text-muted-foreground"> · {parts.timeLine}</span>
                        </>
                      )
                    })()}
                  </p>
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
                  <label className="text-sm font-medium text-muted-foreground">Taxable Amount</label>
                  <p className="text-lg">₹{getTaxableAmount(selectedBill).toFixed(2)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">GST</label>
                  <p className="text-lg">₹{getGST(selectedBill).toFixed(2)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Total Paid</label>
                  <p className="text-2xl font-bold text-green-600">₹{getTotalPaid(selectedBill, true).toFixed(2)}</p>
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
            }}>
              Print Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        setIsDeleteDialogOpen(open)
        if (!open) setDeleteSaleReason("")
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sale Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the sale record for {selectedSale?.customerName}? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="delete-sale-reason" className="block text-sm font-medium text-slate-700 mb-1.5">
                Reason for deletion <span className="text-red-500">*</span>
              </label>
              <textarea
                id="delete-sale-reason"
                value={deleteSaleReason}
                onChange={(e) => setDeleteSaleReason(e.target.value)}
                placeholder="Enter reason for deleting this invoice..."
                className="w-full min-h-[80px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDeleteDialogOpen(false); setDeleteSaleReason("") }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={!deleteSaleReason.trim()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        </>
        </TooltipProvider>
      )}
    </div>
  )
}