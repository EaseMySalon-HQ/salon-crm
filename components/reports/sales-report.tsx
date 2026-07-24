"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Download, Filter, TrendingUp, DollarSign, Users, MoreHorizontal, Eye, Pencil, Trash2, Receipt, AlertCircle, FileText, FileSpreadsheet, ChevronDown, Edit, CalendarIcon, HelpCircle, Wallet, CreditCard, Banknote, ArrowUpRight, Mail, ReceiptText, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { formatPaymentRecordedDateLabel, getSalePaymentLinesWithDates, normalizePaymentModeLabel } from "@/lib/sale-payment-lines"
import { getSaleAdjustmentSummary } from "@/lib/sale-adjustments"
import { formatDateIST, getTodayIST, getStartOfDayIST, getEndOfDayIST, toDateStringIST } from "@/lib/date-utils"
import { formatBillTimeStringTo12h, formatInstantToTime12hIST } from "@/lib/sale-datetime-format"
import { Calendar } from "@/components/ui/calendar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CursorTooltip } from "@/components/ui/cursor-tooltip"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { SalesAPI, ServicesAPI, StaffDirectoryAPI, ReportsAPI, ProductsAPI, SettingsAPI, type SalesSummaryData } from "@/lib/api"
import { ServiceListReport, type ServiceListControlledFilters, type DatePeriod as ServiceListDatePeriod } from "@/components/reports/service-list-report"
import { ProductListReport } from "@/components/reports/product-list-report"
import {
  CashMovementReport,
  type CashMovementReportHandle,
} from "@/components/reports/cash-movement-report"
import { GstReport, type GstReportHandle } from "@/components/reports/gst-report"
import { AnalyticsDonutChart, type AnalyticsDonutSlice } from "@/components/analytics/analytics-donut-chart"
import { CASH_MOVEMENT_TYPE_OPTIONS } from "@/lib/cash-movements"
import { ProductFilterCombobox } from "@/components/reports/product-filter-combobox"
import { ServiceFilterCombobox } from "@/components/reports/service-filter-combobox"
import { RecordConsumptionDialog } from "@/components/bills/record-consumption-dialog"
import { canShowRecordConsumptionCta } from "@/lib/record-consumption-cta"
import { useToast } from "@/hooks/use-toast"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useFeature } from "@/hooks/use-entitlements"
import { useAuth } from "@/lib/auth-context"
import {
  REPORT_TABLE_FOOTER_CLASS,
  REPORT_TABLE_HEAD_ROW_CLASS,
  REPORT_TABLE_HEADER_CLASS,
  REPORT_TABLE_HEADER_META_CLASS,
  REPORT_TABLE_HEADER_TITLE_CLASS,
  REPORT_TABLE_SHELL_CLASS,
} from "@/lib/report-table-theme"

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
  paymentHistory?: Array<{
    date?: string | Date
    amount: number
    method?: string
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
  tipLines?: Array<{ staffId?: string; staffName?: string; amount: number }>
  isEdited?: boolean // Track if bill has been edited
  editedAt?: Date | string
  items?: Array<{ type: string; [key: string]: unknown }>
  billChangeCreditedToWallet?: number
  walletRefundCredited?: number
  refundHistory?: Array<{ mode?: string; amount?: number }>
}

function expandSaleTipAllocations(sale: SalesRecord): { staffId: string; staffName: string; amount: number }[] {
  const raw = sale.tipLines
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((l) => ({
        staffId: String(l.staffId || "").trim(),
        staffName: String(l.staffName || "").trim(),
        amount: Math.max(0, Number(l.amount) || 0),
      }))
      .filter((l) => l.amount > 0.005 && (l.staffId || l.staffName))
  }
  const tip = sale.tip || 0
  if (tip > 0.005 && (sale.tipStaffId || sale.tipStaffName)) {
    return [
      {
        staffId: String(sale.tipStaffId || "").trim(),
        staffName: (sale.tipStaffName || "").trim() || "—",
        amount: tip,
      },
    ]
  }
  return []
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
    paymentHistory: (sale.paymentHistory as SalesRecord["paymentHistory"]) || [],
    tip: (sale.tip as number) || 0,
    tipStaffId: sale.tipStaffId != null ? String(sale.tipStaffId) : undefined,
    tipStaffName: sale.tipStaffName as string | undefined,
    tipLines: Array.isArray(sale.tipLines)
      ? (sale.tipLines as Record<string, unknown>[]).map((l) => {
          const sid = l.staffId
          const staffIdStr =
            sid != null
              ? String(
                  typeof sid === "object" && sid !== null && "_id" in sid
                    ? (sid as { _id?: unknown })._id
                    : sid,
                )
              : ""
          return {
            staffId: staffIdStr || undefined,
            staffName: l.staffName != null ? String(l.staffName) : undefined,
            amount: Math.max(0, Number(l.amount) || 0),
          }
        })
      : undefined,
    netTotal: Number(sale.netTotal ?? 0),
    taxAmount: Number(sale.taxAmount ?? 0),
    grossTotal: Number(sale.grossTotal ?? 0),
    paymentStatus: sale.paymentStatus as SalesRecord["paymentStatus"],
    status: (sale.status as SalesRecord["status"]) || "unpaid",
    staffName: String(sale.staffName ?? ""),
    items: (sale.items as SalesRecord["items"]) || [],
    isEdited: sale.isEdited === true || !!sale.editedAt,
    editedAt: sale.editedAt as Date | string | undefined,
    billChangeCreditedToWallet:
      sale.billChangeCreditedToWallet != null ? Number(sale.billChangeCreditedToWallet) : undefined,
    walletRefundCredited:
      sale.walletRefundCredited != null ? Number(sale.walletRefundCredited) : undefined,
    refundHistory: Array.isArray(sale.refundHistory)
      ? (sale.refundHistory as Record<string, unknown>[]).map((entry) => ({
          mode: entry.mode != null ? String(entry.mode) : undefined,
          amount: entry.amount != null ? Number(entry.amount) : undefined,
        }))
      : undefined,
    loyaltyPointsRedeemed:
      sale.loyaltyPointsRedeemed != null ? Number(sale.loyaltyPointsRedeemed) : undefined,
    loyaltyDiscountAmount:
      sale.loyaltyDiscountAmount != null ? Number(sale.loyaltyDiscountAmount) : undefined,
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
  "cash-movement",
] as const

export function SalesReport() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  // Advanced report types (tip payouts, deleted invoices, unpaid/part-paid)
  // require the `advanced_reports` plan feature; the backend gates the same
  // endpoints. Basic types stay available to every plan with basic_reports.
  const { hasAccess: canAdvancedReports } = useFeature("advanced_reports")
  const { hasPermission } = useAuth()
  const canEditSale = hasPermission("sales", "edit")
  const canDeleteSale = hasPermission("sales", "delete")
  const [reportType, setReportTypeState] = useState("sales")

  useEffect(() => {
    const p = searchParams.get("reportType")
    if (p && REPORT_TYPES.includes(p as (typeof REPORT_TYPES)[number])) {
      setReportTypeState(p)
    }
  }, [searchParams])

  // If the plan lacks advanced reports, never leave the UI on an advanced type
  // (e.g. via a shared/bookmarked URL) — fall back to the basic Sales report.
  const ADVANCED_REPORT_TYPES = ["staff-tip", "deleted-invoice", "unpaid-part-paid"]
  useEffect(() => {
    if (!canAdvancedReports && ADVANCED_REPORT_TYPES.includes(reportType)) {
      setReportTypeState("sales")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdvancedReports, reportType])

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

  const [filtersOpen, setFiltersOpen] = useState(false)

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
  const [billConsumptionDialogOpen, setBillConsumptionDialogOpen] = useState(false)
  const [consumptionDialogSale, setConsumptionDialogSale] = useState<SalesRecord | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteSaleReason, setDeleteSaleReason] = useState("")
  const [selectedSale, setSelectedSale] = useState<SalesRecord | null>(null)
  const [salesPageIndex, setSalesPageIndex] = useState(0)
  const [salesPageSize, setSalesPageSize] = useState(10)
  /** Sales stat card: click Cash Collected for service vs wallet breakdown */
  const [showCashCollectedBreakdown, setShowCashCollectedBreakdown] = useState(false)
  const [showOnlineCashCollectedBreakdown, setShowOnlineCashCollectedBreakdown] = useState(false)
  // Service List filters (when report type is service-list; shown in same bar)
  const [serviceListDatePeriod, setServiceListDatePeriod] = useState<ServiceListDatePeriod>("today")
  const [serviceListDateRange, setServiceListDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [serviceListCategoryFilter, setServiceListCategoryFilter] = useState<string>("all")
  const [serviceListServiceFilter, setServiceListServiceFilter] = useState<string>("all")
  const [serviceListStaffFilter, setServiceListStaffFilter] = useState<string>("all")
  const [serviceListStatusFilter, setServiceListStatusFilter] = useState<string>("all")
  const [serviceListModeFilter, setServiceListModeFilter] = useState<string>("all")
  const [serviceListServices, setServiceListServices] = useState<{ _id: string; name: string; duration?: number; category?: string }[]>([])
  const [serviceListStaff, setServiceListStaff] = useState<{ _id: string; name: string }[]>([])

  const [productListDatePeriod, setProductListDatePeriod] = useState<ServiceListDatePeriod>("today")
  const [productListDateRange, setProductListDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [productListCategoryFilter, setProductListCategoryFilter] = useState<string>("all")
  const [productListProductFilter, setProductListProductFilter] = useState<string>("all")
  const [productListStaffFilter, setProductListStaffFilter] = useState<string>("all")
  const [productListStatusFilter, setProductListStatusFilter] = useState<string>("all")
  const [productListModeFilter, setProductListModeFilter] = useState<string>("all")
  const [productListProducts, setProductListProducts] = useState<{ _id: string; name: string; category?: string }[]>([])
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
  const [unpaidPartPaidSummary, setUnpaidPartPaidSummary] = useState<{
    count: number
    totalOutstanding: number
    totalDuesSettled?: number
  }>({ count: 0, totalOutstanding: 0 })
  const [unpaidPartPaidLoading, setUnpaidPartPaidLoading] = useState(false)

  // Cash Movement report filters
  const [cashMovementDatePeriod, setCashMovementDatePeriod] = useState<DatePeriod>("today")
  const [cashMovementDateRange, setCashMovementDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [cashMovementTypeFilter, setCashMovementTypeFilter] = useState<string>("all")
  const [cashMovementDirectionFilter, setCashMovementDirectionFilter] = useState<string>("all")
  const cashMovementReportRef = useRef<CashMovementReportHandle>(null)

  // GST report filters
  const [gstDatePeriod, setGstDatePeriod] = useState<DatePeriod>("currentMonth")
  const [gstDateRange, setGstDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [gstBusinessGstin, setGstBusinessGstin] = useState("")
  const gstReportRef = useRef<GstReportHandle>(null)

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
    totalSalesWallet?: number
    totalSalesRewardPoint?: number
    duesCollected: number
    cashDuesCollected?: number
    cashExpense: number
    pettyCashExpense?: number
    tipCollected: number
    cashAddedToWallet?: number
    cashBalance: number
    openingBalance?: number
    closingBalance?: number
    totalDue?: number
    customersWithDue?: number
  } | null>(null)
  const [summaryReportLoading, setSummaryReportLoading] = useState(false)

  const paymentModeBreakdown = useMemo(() => {
    if (!summaryData) {
      return { modes: [] as { label: string; value: number; fill: string }[], chartSlices: [] as AnalyticsDonutSlice[], total: 0 }
    }
    const modes = [
      { label: "Cash", value: summaryData.totalSalesCash, fill: "#10b981" },
      { label: "Online", value: summaryData.totalSalesOnline, fill: "#3b82f6" },
      { label: "Card", value: summaryData.totalSalesCard, fill: "#8b5cf6" },
      { label: "Wallet", value: summaryData.totalSalesWallet ?? 0, fill: "#f59e0b" },
      { label: "Reward Point", value: summaryData.totalSalesRewardPoint ?? 0, fill: "#f43f5e" },
    ]
    const chartSlices: AnalyticsDonutSlice[] = modes
      .filter((m) => m.value > 0.005)
      .map((m) => ({ name: m.label, value: Math.round(m.value * 100) / 100, fill: m.fill }))
    const total = modes.reduce((sum, m) => sum + m.value, 0)
    return { modes, chartSlices, total }
  }, [summaryData])

  /** Ref for sales list: reset page when filter key changes (avoids stale page + fetch race). */
  const prevSalesFilterKeyRef = useRef<string | null>(null)

  const openReceiptInNewTab = (path: string) => {
    if (typeof window === "undefined") return
    window.open(path, "_blank", "noopener,noreferrer")
  }

  /** Open receipt in a new tab (keeps Reports open). */
  const handleViewReceipt = (sale: SalesRecord) => {
    openReceiptInNewTab(`/receipt/${sale.billNo}?returnTo=${encodeURIComponent(buildReportsReturnPath())}`)
  }

  const navigateToReceiptByBillNo = useCallback(
    (billNo: string) => {
      if (!billNo?.trim()) return
      openReceiptInNewTab(
        `/receipt/${encodeURIComponent(billNo.trim())}?returnTo=${encodeURIComponent(buildReportsReturnPath())}`,
      )
    },
    [buildReportsReturnPath],
  )

  const handleEditBill = (sale: SalesRecord) => {
    router.push(
      `/billing/${sale.billNo}?mode=edit&returnTo=${encodeURIComponent(buildReportsReturnPath())}`
    )
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

  const handleCashMovementDatePeriodChange = (period: DatePeriod) => {
    setCashMovementDatePeriod(period)
    if (period === "custom") {
      setCashMovementDateRange(getDateRangeFromPeriod("last7days"))
    } else if (period !== "all") {
      setCashMovementDateRange(getDateRangeFromPeriod(period))
    } else {
      setCashMovementDateRange({})
    }
  }

  const handleExportCashMovementXLS = () => {
    toast({ title: "Export", description: "Downloading cash movement Excel...", duration: 2500 })
    cashMovementReportRef.current?.exportExcel()
  }

  const handleGstDatePeriodChange = (period: DatePeriod) => {
    setGstDatePeriod(period)
    if (period === "custom") {
      setGstDateRange(getDateRangeFromPeriod("last30days"))
    } else if (period !== "all") {
      setGstDateRange(getDateRangeFromPeriod(period))
    } else {
      setGstDateRange({})
    }
  }

  const activeFilterCount = useMemo(() => {
    switch (reportType) {
      case "sales": {
        let count = 0
        if (searchTerm.trim()) count++
        if (datePeriod !== "today") count++
        if (paymentFilter !== "all") count++
        if (statusFilter !== "all") count++
        return count
      }
      case "summary":
        return datePeriod !== "today" ? 1 : 0
      case "staff-tip": {
        let count = 0
        if (datePeriod !== "today") count++
        if (staffTipFilter !== "all") count++
        return count
      }
      case "service-list": {
        let count = 0
        if (serviceListServiceFilter !== "all") count++
        if (serviceListCategoryFilter !== "all") count++
        if (serviceListDatePeriod !== "today") count++
        if (serviceListStaffFilter !== "all") count++
        if (serviceListStatusFilter !== "all") count++
        if (serviceListModeFilter !== "all") count++
        return count
      }
      case "product-list": {
        let count = 0
        if (productListProductFilter !== "all") count++
        if (productListCategoryFilter !== "all") count++
        if (productListDatePeriod !== "today") count++
        if (productListStaffFilter !== "all") count++
        if (productListStatusFilter !== "all") count++
        if (productListModeFilter !== "all") count++
        return count
      }
      case "appointment-list": {
        let count = 0
        if (appointmentListDateFilterType !== "appointment_date") count++
        if (appointmentListDatePeriod !== "today") count++
        if (appointmentListStatusFilter !== "all") count++
        if (!appointmentListShowWalkIn) count++
        return count
      }
      case "deleted-invoice":
        return deletedInvoiceDatePeriod !== "today" ? 1 : 0
      case "unpaid-part-paid": {
        let count = 0
        if (unpaidPartPaidDatePeriod !== "today") count++
        if (unpaidPartPaidStatusFilter !== "all") count++
        return count
      }
      case "cash-movement": {
        let count = 0
        if (cashMovementDatePeriod !== "today") count++
        if (cashMovementTypeFilter !== "all") count++
        if (cashMovementDirectionFilter !== "all") count++
        return count
      }
      case "gst":
        return gstDatePeriod !== "currentMonth" ? 1 : 0
      default:
        return 0
    }
  }, [
    reportType,
    searchTerm,
    datePeriod,
    paymentFilter,
    statusFilter,
    staffTipFilter,
    serviceListServiceFilter,
    serviceListCategoryFilter,
    serviceListDatePeriod,
    serviceListStaffFilter,
    serviceListStatusFilter,
    serviceListModeFilter,
    productListProductFilter,
    productListCategoryFilter,
    productListDatePeriod,
    productListStaffFilter,
    productListStatusFilter,
    productListModeFilter,
    appointmentListDateFilterType,
    appointmentListDatePeriod,
    appointmentListStatusFilter,
    appointmentListShowWalkIn,
    deletedInvoiceDatePeriod,
    unpaidPartPaidDatePeriod,
    unpaidPartPaidStatusFilter,
    cashMovementDatePeriod,
    cashMovementTypeFilter,
    cashMovementDirectionFilter,
    gstDatePeriod,
  ])

  const clearReportFilters = useCallback(() => {
    switch (reportType) {
      case "sales":
        setSearchTerm("")
        handleDatePeriodChange("today")
        setPaymentFilter("all")
        setStatusFilter("all")
        break
      case "summary":
        handleDatePeriodChange("today")
        break
      case "staff-tip":
        handleDatePeriodChange("today")
        setStaffTipFilter("all")
        break
      case "service-list":
        setServiceListServiceFilter("all")
        setServiceListCategoryFilter("all")
        handleServiceListDatePeriodChange("today")
        setServiceListStaffFilter("all")
        setServiceListStatusFilter("all")
        setServiceListModeFilter("all")
        break
      case "product-list":
        setProductListProductFilter("all")
        setProductListCategoryFilter("all")
        handleProductListDatePeriodChange("today")
        setProductListStaffFilter("all")
        setProductListStatusFilter("all")
        setProductListModeFilter("all")
        break
      case "appointment-list":
        setAppointmentListDateFilterType("appointment_date")
        handleAppointmentListDatePeriodChange("today")
        setAppointmentListStatusFilter("all")
        setAppointmentListShowWalkIn(true)
        break
      case "deleted-invoice":
        handleDeletedInvoiceDatePeriodChange("today")
        break
      case "unpaid-part-paid":
        handleUnpaidPartPaidDatePeriodChange("today")
        setUnpaidPartPaidStatusFilter("all")
        break
      case "cash-movement":
        handleCashMovementDatePeriodChange("today")
        setCashMovementTypeFilter("all")
        setCashMovementDirectionFilter("all")
        break
      case "gst":
        handleGstDatePeriodChange("currentMonth")
        break
      default:
        break
    }
  }, [
    reportType,
    handleDatePeriodChange,
    handleServiceListDatePeriodChange,
    handleProductListDatePeriodChange,
    handleAppointmentListDatePeriodChange,
    handleDeletedInvoiceDatePeriodChange,
    handleUnpaidPartPaidDatePeriodChange,
    handleCashMovementDatePeriodChange,
    handleGstDatePeriodChange,
  ])

  useEffect(() => {
    if (reportType !== "gst") return
    let cancelled = false
    SettingsAPI.getBusinessSettings()
      .then((res) => {
        if (cancelled) return
        const data = (res?.data || {}) as { gstNumber?: string }
        setGstBusinessGstin(String(data.gstNumber || ""))
      })
      .catch(() => {
        if (!cancelled) setGstBusinessGstin("")
      })
    return () => {
      cancelled = true
    }
  }, [reportType])

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

  const serviceListCategoryOptions = useMemo(() => {
    const set = new Set<string>()
    serviceListServices.forEach((s) => {
      const cat = (s.category || "").trim()
      if (cat) set.add(cat)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [serviceListServices])

  const serviceListServicesForFilter = useMemo(() => {
    if (serviceListCategoryFilter === "all") return serviceListServices
    return serviceListServices.filter((s) => (s.category || "").trim() === serviceListCategoryFilter)
  }, [serviceListServices, serviceListCategoryFilter])

  const handleServiceListCategoryFilterChange = (next: string) => {
    setServiceListCategoryFilter(next)
    if (serviceListServiceFilter !== "all") {
      const selected = serviceListServices.find((s) => s._id === serviceListServiceFilter)
      if (next !== "all" && selected && (selected.category || "").trim() !== next) {
        setServiceListServiceFilter("all")
      }
    }
  }

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

  const productListCategoryOptions = useMemo(() => {
    const set = new Set<string>()
    productListProducts.forEach((p) => {
      const cat = (p.category || "").trim()
      if (cat) set.add(cat)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [productListProducts])

  const productListProductsForFilter = useMemo(() => {
    if (productListCategoryFilter === "all") return productListProducts
    return productListProducts.filter((p) => (p.category || "").trim() === productListCategoryFilter)
  }, [productListProducts, productListCategoryFilter])

  const handleProductListCategoryFilterChange = (next: string) => {
    setProductListCategoryFilter(next)
    if (productListProductFilter !== "all") {
      const selected = productListProducts.find((p) => p._id === productListProductFilter)
      if (next !== "all" && selected && (selected.category || "").trim() !== next) {
        setProductListProductFilter("all")
      }
    }
  }

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
      .then((res: {
        success?: boolean
        data?: any[]
        summary?: { count: number; totalOutstanding: number; totalDuesSettled?: number }
      }) => {
        if (!cancelled && res?.success) {
          setUnpaidPartPaidData(Array.isArray(res.data) ? res.data : [])
          setUnpaidPartPaidSummary(
            res.summary || { count: 0, totalOutstanding: 0, totalDuesSettled: 0 }
          )
        } else if (!cancelled) {
          setUnpaidPartPaidData([])
          setUnpaidPartPaidSummary({ count: 0, totalOutstanding: 0, totalDuesSettled: 0 })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnpaidPartPaidData([])
          setUnpaidPartPaidSummary({ count: 0, totalOutstanding: 0, totalDuesSettled: 0 })
        }
      })
      .finally(() => {
        if (!cancelled) setUnpaidPartPaidLoading(false)
      })
    return () => { cancelled = true }
  }, [reportType, unpaidPartPaidDatePeriod, unpaidPartPaidDateRange.from, unpaidPartPaidDateRange.to, unpaidPartPaidStatusFilter])

  useEffect(() => {
    if (unpaidPartPaidStatusFilter === "dues_settled") {
      setUnpaidPartPaidStatusFilter("all")
    }
  }, [unpaidPartPaidStatusFilter])

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
          const allocs = expandSaleTipAllocations(sale)
          const hasTip = allocs.length > 0
          const matchesStaff =
            staffTipFilter === "all" || allocs.some((a) => a.staffId === staffTipFilter)
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
      const mode = getTipPaymentMode(sale)
      const isCash = mode === "Cash"
      expandSaleTipAllocations(sale).forEach((alloc) => {
        const id = (alloc.staffId || alloc.staffName || "—").toString()
        const name =
          alloc.staffName ||
          (salesStaff.find((s) => s._id === alloc.staffId || String(s._id) === alloc.staffId)?.name) ||
          "—"
        const tipAmt = alloc.amount
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
            paymentModes: [mode],
          })
        }
      })
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


  // Reset stat card breakdowns when filters change
  useEffect(() => {
    setShowCashCollectedBreakdown(false)
    setShowOnlineCashCollectedBreakdown(false)
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
  const serviceCashCollected = summaryStats?.serviceCashCollected ?? cashCollected
  const walletCashCollected = summaryStats?.walletCashCollected ?? 0
  const onlineCashCollected = summaryStats?.onlineCash ?? 0
  const cardCollected = summaryStats?.cardCollected ?? onlineCashCollected
  const onlinePayCollected = summaryStats?.onlinePayCollected ?? 0

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

  const handleOpenRecordConsumption = (sale: SalesRecord) => {
    setConsumptionDialogSale(sale)
    setBillConsumptionDialogOpen(true)
  }

  const handleEditSale = (sale: SalesRecord) => {
    router.push(
      `/billing/${sale.billNo}?mode=edit&returnTo=${encodeURIComponent(buildReportsReturnPath())}`
    )
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
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("appointments-refresh"))
        }
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
    const paidAmount =
      sale.paymentStatus?.paidAmount ??
      sale.payments?.reduce((s, p) => s + (p.amount || 0), 0) ??
      0

    // First priority: Check if there are payments (new split payment structure)
    if (sale.payments && sale.payments.length > 0) {
      const paymentModes = sale.payments.map(payment => payment.mode)
      const uniqueModes = [...new Set(paymentModes)]
      return uniqueModes.join(", ")
    }

    // Unpaid bills with nothing collected yet
    if (paidAmount < 0.005 && String(sale.status || "").toLowerCase() === "unpaid") {
      return ""
    }

    // Second priority: Check legacy paymentMode field (only when something was paid)
    if (sale.paymentMode && paidAmount >= 0.005) {
      return sale.paymentMode
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
    const filterLabel = normalizePaymentModeLabel(paymentFilter)
    if (sale.payments && sale.payments.length > 0) {
      const filteredTotal = sale.payments
        .filter((payment) => normalizePaymentModeLabel(payment.mode) === filterLabel)
        .reduce((s, p) => s + (p.amount || 0), 0)
      if (filteredTotal > 0) return filteredTotal
    }
    if (filterLabel === "Reward Point") {
      const pts = Math.floor(Number(sale.loyaltyPointsRedeemed) || 0)
      const disc = Math.max(0, Number(sale.loyaltyDiscountAmount) || 0)
      if (pts > 0 && disc > 0.005) return disc
    }
    const legacyModes = sale.paymentMode.split(",").map((m) => normalizePaymentModeLabel(m.trim()))
    if (legacyModes.includes(filterLabel)) return fullPaid
    return 0
  }

  return (
    <div className="space-y-8">
      {/*
        CONVENTION: Report type stays in the toolbar; type-specific filters live in the Filters popover.
        When adding a new report/list type:
        1. Add the option to the report type Select below.
        2. Add a {reportType === "new-type" && ( ... )} block inside the Filters popover grid.
        3. Add state and fetch for any dropdown options (e.g. services, staff) and pass controlledFilters if the report is an embedded component.
        4. Extend activeFilterCount and clearReportFilters for the new type.
      */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {/* Report type */}
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="h-10 w-40 min-w-[9.5rem] border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales Report</SelectItem>
                  {canAdvancedReports && <SelectItem value="staff-tip">Staff Tip</SelectItem>}
                  <SelectItem value="summary">Summary Reports</SelectItem>
                  <SelectItem value="service-list">Service List</SelectItem>
                  <SelectItem value="product-list">Product List</SelectItem>
                  <SelectItem value="appointment-list">Appointment List</SelectItem>
                  {canAdvancedReports && <SelectItem value="deleted-invoice">Deleted Invoice</SelectItem>}
                  {canAdvancedReports && <SelectItem value="unpaid-part-paid">Unpaid/Part-Paid</SelectItem>}
                  <SelectItem value="cash-movement">Cash Movement</SelectItem>
                  <SelectItem value="gst">GST Report</SelectItem>
                </SelectContent>
              </Select>
              <Popover open={filtersOpen} onOpenChange={setFiltersOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant={activeFilterCount > 0 ? "default" : "outline"}
                    className="h-10 border-slate-200"
                  >
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-2 h-5 min-w-5 rounded-full px-1.5 text-[10px] bg-white/20 text-inherit"
                      >
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(100vw-2rem,44rem)] p-0">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <p className="text-sm font-medium text-foreground">Filters</p>
                    {activeFilterCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={clearReportFilters}
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              {reportType === "summary" && (
                <>
                  <Select value={datePeriod} onValueChange={handleDatePeriodChange}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 w-full min-w-[8.5rem] max-w-full justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 sm:w-auto">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.from ? format(dateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.to ? format(dateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                    className="h-10 w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <Select value={datePeriod} onValueChange={handleDatePeriodChange}>
                    <SelectTrigger className="h-10 w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 w-full min-w-[8.5rem] max-w-full justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 sm:w-auto">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.from ? format(dateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                          <Button variant="outline" className="h-10 w-full min-w-[8.5rem] max-w-full justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 sm:w-auto">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.to ? format(dateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                    <SelectTrigger className="h-10 w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Payment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payments</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                      <SelectItem value="Wallet">Wallet</SelectItem>
                      <SelectItem value="Reward Point">Reward Point</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10 w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 w-full min-w-[8.5rem] max-w-full justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500 sm:w-auto">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.from ? format(dateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {dateRange?.to ? format(dateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                  <ServiceFilterCombobox
                    value={serviceListServiceFilter}
                    onValueChange={setServiceListServiceFilter}
                    services={serviceListServicesForFilter}
                    triggerClassName="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <Select value={serviceListCategoryFilter} onValueChange={handleServiceListCategoryFilterChange}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {serviceListCategoryOptions.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={serviceListDatePeriod} onValueChange={handleServiceListDatePeriodChange}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {serviceListDateRange?.from ? format(serviceListDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {serviceListDateRange?.to ? format(serviceListDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All modes</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                      <SelectItem value="Wallet">Wallet</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              {reportType === "product-list" && (
                <>
                  <ProductFilterCombobox
                    value={productListProductFilter}
                    onValueChange={setProductListProductFilter}
                    products={productListProductsForFilter}
                    triggerClassName="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <Select value={productListCategoryFilter} onValueChange={handleProductListCategoryFilterChange}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {productListCategoryOptions.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={productListDatePeriod} onValueChange={handleProductListDatePeriodChange}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {productListDateRange?.from ? format(productListDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {productListDateRange?.to ? format(productListDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All modes</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                      <SelectItem value="Wallet">Wallet</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              {reportType === "appointment-list" && (
                <>
                  <Select value={appointmentListDateFilterType} onValueChange={(v: "appointment_date" | "created_date") => setAppointmentListDateFilterType(v)}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Date type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appointment_date">Appointment Date</SelectItem>
                      <SelectItem value="created_date">Created Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={appointmentListDatePeriod} onValueChange={(v: DatePeriod) => handleAppointmentListDatePeriodChange(v)}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {appointmentListDateRange?.from ? format(appointmentListDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {appointmentListDateRange?.to ? format(appointmentListDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 text-sm whitespace-nowrap sm:col-span-2">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {deletedInvoiceDateRange?.from ? format(deletedInvoiceDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {deletedInvoiceDateRange?.to ? format(deletedInvoiceDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
              {reportType === "cash-movement" && (
                <>
                  <Select value={cashMovementDatePeriod} onValueChange={(v: DatePeriod) => handleCashMovementDatePeriodChange(v)}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                  {cashMovementDatePeriod === "custom" && (
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {cashMovementDateRange?.from ? format(cashMovementDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={cashMovementDateRange?.from}
                            onSelect={(d) => setCashMovementDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                            disabled={(d) => d > new Date() || (cashMovementDateRange?.to ? d > cashMovementDateRange.to : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {cashMovementDateRange?.to ? format(cashMovementDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={cashMovementDateRange?.to}
                            onSelect={(d) => setCashMovementDateRange((r) => ({ from: r?.from, to: d }))}
                            disabled={(d) => d > new Date() || (cashMovementDateRange?.from ? d < cashMovementDateRange.from : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                  <Select value={cashMovementTypeFilter} onValueChange={setCashMovementTypeFilter}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {CASH_MOVEMENT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={cashMovementDirectionFilter} onValueChange={setCashMovementDirectionFilter}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Direction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="in">Cash in</SelectItem>
                      <SelectItem value="out">Cash out</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
              {reportType === "gst" && (
                <>
                  <Select value={gstDatePeriod} onValueChange={(v: DatePeriod) => handleGstDatePeriodChange(v)}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                  {gstDatePeriod === "custom" && (
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {gstDateRange?.from ? format(gstDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={gstDateRange?.from}
                            onSelect={(d) => setGstDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                            disabled={(d) => d > new Date() || (gstDateRange?.to ? d > gstDateRange.to : false)}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {gstDateRange?.to ? format(gstDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={gstDateRange?.to}
                            onSelect={(d) => setGstDateRange((r) => ({ from: r?.from, to: d }))}
                            disabled={(d) => d > new Date() || (gstDateRange?.from ? d < gstDateRange.from : false)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                  {gstBusinessGstin ? (
                    <Badge variant="outline" className="w-full justify-center border-emerald-200 bg-emerald-50 text-emerald-700 sm:col-span-2">
                      GSTIN: {gstBusinessGstin}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="w-full justify-center border-amber-200 bg-amber-50 text-amber-700 sm:col-span-2">
                      No GSTIN — set in Business Settings
                    </Badge>
                  )}
                </>
              )}
              {reportType === "unpaid-part-paid" && (
                <>
                  <Select value={unpaidPartPaidDatePeriod} onValueChange={(v: DatePeriod) => handleUnpaidPartPaidDatePeriodChange(v)}>
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {unpaidPartPaidDateRange?.from ? format(unpaidPartPaidDateRange.from, "dd MMM yyyy") : "From"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                          <Button variant="outline" className="h-10 flex-1 min-w-0 justify-start px-3 text-left font-normal border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                              {unpaidPartPaidDateRange?.to ? format(unpaidPartPaidDateRange.to, "dd MMM yyyy") : "To"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!z-[120] w-auto p-0" align="start">
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
                    <SelectTrigger className="w-full border-slate-200 focus:border-blue-500 focus:ring-blue-500">
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
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
              {(reportType === "sales" || reportType === "staff-tip" || reportType === "summary" || reportType === "service-list" || reportType === "product-list" || reportType === "appointment-list" || reportType === "deleted-invoice" || reportType === "unpaid-part-paid" || reportType === "cash-movement" || reportType === "gst") && canExport && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="h-10 whitespace-nowrap bg-blue-600 px-4 py-2 font-medium text-white shadow-md transition-all duration-300 hover:bg-blue-700 hover:shadow-lg sm:px-6 sm:py-2.5 rounded-lg"
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
                      {reportType === "cash-movement" && (
                        <DropdownMenuItem onClick={handleExportCashMovementXLS} className="cursor-pointer">
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Export as Excel
                        </DropdownMenuItem>
                      )}
                      {reportType === "gst" && (
                        <>
                          <DropdownMenuItem
                            onClick={() => gstReportRef.current?.exportCsv()}
                            className="cursor-pointer"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            CSV (per bill)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => gstReportRef.current?.exportXlsx()}
                            className="cursor-pointer"
                          >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Excel (summary + detail)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => gstReportRef.current?.exportJson()}
                            className="cursor-pointer"
                          >
                            <ReceiptText className="h-4 w-4 mr-2" />
                            GSTR-1 B2CS JSON
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                          tipLines: Array.isArray(bill.tipLines)
                            ? bill.tipLines.map((tl: { staffName?: string; amount?: number }) => ({
                                staffName: tl.staffName,
                                amount: Math.max(0, Number(tl.amount) || 0),
                              }))
                            : undefined,
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
                                    openReceiptInNewTab(
                                      `/receipt/${encodeURIComponent(row.billNo || bill.billNo)}?data=${dataStr}&returnTo=${encodeURIComponent(buildReportsReturnPath())}`,
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <Card className="bg-white border-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">Dues settled (period)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-emerald-700">
                      ₹{(unpaidPartPaidSummary.totalDuesSettled ?? 0).toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                      })}
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
                      <TableHead className="font-semibold">Dues settled</TableHead>
                      <TableHead className="font-semibold">Outstanding</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unpaidPartPaidData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                          No bills found for selected filters
                        </TableCell>
                      </TableRow>
                    ) : (
                      unpaidPartPaidData.map((row) => (
                        <TableRow key={row.id} className="border-slate-50">
                          <TableCell className="font-medium">
                            <Button
                              type="button"
                              variant="link"
                              className="p-0 h-auto font-medium text-blue-600 hover:text-blue-800 hover:underline"
                              onClick={() => navigateToReceiptByBillNo(row.billNo)}
                            >
                              {row.billNo}
                            </Button>
                          </TableCell>
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
                            <span
                              className={
                                (row.duesSettledInPeriod ?? 0) > 0
                                  ? "font-semibold text-emerald-700"
                                  : "text-slate-500"
                              }
                            >
                              ₹{(row.duesSettledInPeriod ?? 0).toLocaleString("en-IN", {
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </TableCell>
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
                                row.status === "Part Paid" ? "secondary" :
                                row.status === "Full Paid" ? "outline" : "default"
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
      ) : reportType === "cash-movement" ? (
        <CashMovementReport
          ref={cashMovementReportRef}
          controlledFilters={{
            datePeriod: cashMovementDatePeriod,
            dateRange: cashMovementDateRange,
            typeFilter: cashMovementTypeFilter,
            directionFilter: cashMovementDirectionFilter,
          }}
        />
      ) : reportType === "gst" ? (
        <GstReport
          ref={gstReportRef}
          controlledFilters={{
            datePeriod: gstDatePeriod,
            dateRange: gstDateRange,
          }}
        />
      ) : reportType === "service-list" ? (
        <ServiceListReport
          controlledFilters={{
            datePeriod: serviceListDatePeriod,
            setDatePeriod: setServiceListDatePeriod,
            dateRange: serviceListDateRange,
            setDateRange: setServiceListDateRange,
            categoryFilter: serviceListCategoryFilter,
            setCategoryFilter: setServiceListCategoryFilter,
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
            categoryFilter: productListCategoryFilter,
            setCategoryFilter: setProductListCategoryFilter,
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
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 flex items-center gap-1.5">
                        Cash Added to wallet
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs p-3">
                            <p className="text-sm">
                              Cash received at checkout but credited to the client&apos;s prepaid wallet (e.g. bill change
                              added to wallet balance).
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="font-semibold text-indigo-600">
                        ₹{(summaryData.cashAddedToWallet ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </span>
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
                  {paymentModeBreakdown.total > 0 ? (
                    <div className="space-y-4">
                      <AnalyticsDonutChart
                        data={paymentModeBreakdown.chartSlices}
                        emptyMessage="No payment data for this period."
                        formatTooltip={(value) =>
                          `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                        }
                        innerRadius={0}
                        outerRadius={88}
                      />
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {paymentModeBreakdown.modes.map(({ label, value, fill }) => (
                          <li key={label} className="flex items-center justify-between gap-2 min-w-0">
                            <span className="flex items-center gap-2 text-slate-600 min-w-0">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: fill }}
                                aria-hidden
                              />
                              <span className="truncate">{label}</span>
                            </span>
                            <span className="font-medium text-slate-900 tabular-nums shrink-0">
                              ₹{value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">No payment data for this period.</p>
                  )}
                </div>

                {/* Section C + D: Expenses & Final Settlement (stacked) */}
                {(() => {
                  const isSummarySingleDay =
                    datePeriod === "today" ||
                    datePeriod === "yesterday" ||
                    (datePeriod === "custom" &&
                      dateRange.from &&
                      dateRange.to &&
                      toDateStringIST(dateRange.from) === toDateStringIST(dateRange.to))
                  const expectedCashInDrawer =
                    (summaryData.openingBalance ?? 0) +
                    summaryData.totalSalesCash +
                    (summaryData.cashDuesCollected ?? 0) -
                    summaryData.cashExpense
                  const cashBalance = summaryData.closingBalance ?? summaryData.cashBalance ?? 0
                  const diff = Math.abs(cashBalance - expectedCashInDrawer)
                  const cashBalanceColor =
                    diff < 0.01
                      ? "text-emerald-600"
                      : cashBalance < expectedCashInDrawer
                        ? "text-red-600"
                        : "text-orange-600"
                  return (
                    <div className="flex flex-col gap-4">
                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                        <h3 className="text-sm font-semibold text-slate-800 mb-2.5 flex items-center gap-2">
                          <Wallet className="h-4 w-4 text-indigo-500" />
                          Expenses
                        </h3>
                        <div className="space-y-2.5 text-sm">
                          <div className="flex justify-between items-center gap-3">
                            <span className="text-slate-600 flex items-center gap-1.5 min-w-0">
                              Cash Expense
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs p-3">
                                  <p className="text-sm">Cash paid out for expenses during this period (e.g. supplies, misc).</p>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                            <span
                              className={`font-semibold tabular-nums shrink-0 ${summaryData.cashExpense > 0 ? "text-red-600" : "text-slate-900"}`}
                            >
                              ₹{summaryData.cashExpense.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center gap-3">
                            <span className="text-slate-600 flex items-center gap-1.5 min-w-0">
                              Petty Cash Expense
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs p-3">
                                  <p className="text-sm">Expenses paid from the petty cash wallet during this period.</p>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                            <span
                              className={`font-semibold tabular-nums shrink-0 ${(summaryData.pettyCashExpense ?? 0) > 0 ? "text-red-600" : "text-slate-900"}`}
                            >
                              ₹{(summaryData.pettyCashExpense ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                        <h3 className="text-sm font-semibold text-slate-800 mb-2.5 flex items-center gap-2">
                          <Banknote className="h-4 w-4 text-indigo-500" />
                          {isSummarySingleDay ? "Final Settlement" : "Total Cash Balance"}
                        </h3>
                        <div className="space-y-2.5 text-sm">
                          {isSummarySingleDay ? (
                            <>
                              <div className="flex justify-between items-center gap-3">
                                <span className="text-slate-600 flex items-center gap-1.5 min-w-0">
                                  Expected Cash in Drawer
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs p-3">
                                      <p className="text-sm">
                                        Opening Balance + Cash Sales + Cash Dues Collected − Cash Expenses
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </span>
                                <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                                  ₹{expectedCashInDrawer.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex justify-between items-center gap-3 pt-2.5 border-t border-slate-100">
                                <span className="text-slate-600 flex items-center gap-1.5 min-w-0">
                                  Cash Balance
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs p-3">
                                      <p className="text-sm">
                                        Closing balance recorded in the cash registry when the shift was closed.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </span>
                                <span className={`font-bold text-base tabular-nums shrink-0 ${cashBalanceColor}`}>
                                  ₹{cashBalance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="flex justify-between items-center gap-3">
                              <span className="text-slate-600 flex items-center gap-1.5 min-w-0">
                                Total Cash Balance
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs p-3">
                                    <p className="text-sm">Total cash balance across the selected date range.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </span>
                              <span className={`font-bold text-base tabular-nums shrink-0 ${cashBalanceColor}`}>
                                ₹{cashBalance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          )}
                        </div>
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
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-7">
        <CursorTooltip wrapperClassName="h-full min-h-0" className="text-center" content="Successfully completed">
          <Card className="h-full min-w-0 overflow-hidden bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="min-w-0 flex-1 text-sm font-medium leading-snug text-gray-900 break-words">Completed Sales</CardTitle>
              <div className="shrink-0 p-2 bg-gray-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-gray-900 sm:text-2xl">
                {salesStatsLoading ? salesStatSkeleton : completedSales}
              </div>
            </CardContent>
          </Card>
        </CursorTooltip>

        <CursorTooltip
          wrapperClassName="h-full min-h-0"
          className="text-center"
          content="Bills with partial payment vs fully unpaid for current filters."
        >
          <Card className="h-full min-w-0 overflow-hidden bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="min-w-0 flex-1 text-sm font-medium leading-snug text-gray-900 break-words">Partial/Unpaid Payments</CardTitle>
              <div className="shrink-0 p-2 bg-gray-100 rounded-lg">
                <Users className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              {salesStatsLoading ? (
                salesStatSkeleton
              ) : (
                <div className="space-y-2">
                  <div className="text-xl font-bold text-gray-900 sm:text-2xl">{partialSales + unpaidSales}</div>
                  <div className="flex flex-col gap-1 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Partial{" "}
                      <span className="font-semibold text-gray-900">{partialSales}</span>
                    </span>
                    <span>
                      Unpaid{" "}
                      <span className="font-semibold text-gray-900">{unpaidSales}</span>
                    </span>
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
          <Card className="h-full min-w-0 overflow-hidden bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="min-w-0 flex-1 text-sm font-medium leading-snug text-gray-900 break-words">Total Revenue</CardTitle>
              <div className="shrink-0 p-2 bg-gray-100 rounded-lg">
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
          <Card className="h-full min-w-0 overflow-hidden bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="min-w-0 flex-1 text-sm font-medium leading-snug text-gray-900 break-words">Unpaid Value</CardTitle>
              <div className="shrink-0 p-2 bg-gray-100 rounded-lg">
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

        <CursorTooltip
          wrapperClassName="h-full min-h-0"
          wrapperTabIndex={-1}
          className="text-center"
          content={
            showCashCollectedBreakdown
              ? "Click to show combined cash total."
              : "Service cash from bills; wallet cash is change credited to prepaid wallet. Click for breakdown."
          }
        >
          <Card
            className="h-full min-w-0 overflow-hidden cursor-pointer select-none rounded-lg border border-gray-200 bg-white shadow-sm outline-none transition-shadow duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            role="button"
            tabIndex={0}
            aria-expanded={showCashCollectedBreakdown}
            onClick={() => setShowCashCollectedBreakdown((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setShowCashCollectedBreakdown((v) => !v)
              }
            }}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="min-w-0 flex-1 text-sm font-medium leading-snug text-gray-900 break-words">Cash Collected</CardTitle>
              <div className="shrink-0 p-2 bg-gray-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              {salesStatsLoading ? (
                salesStatSkeleton
              ) : !showCashCollectedBreakdown ? (
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-gray-900">₹{cashCollected.toFixed(2)}</div>
                  <p className="text-xs leading-snug text-gray-400 break-words">Click for breakdown</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Service Cash</p>
                    <p className="text-xl font-bold text-gray-900">₹{serviceCashCollected.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Wallet Cash</p>
                    <p className="text-xl font-bold text-gray-900">₹{walletCashCollected.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </CursorTooltip>

        <CursorTooltip
          wrapperClassName="h-full min-h-0"
          wrapperTabIndex={-1}
          className="text-center"
          content={
            showOnlineCashCollectedBreakdown
              ? "Click to show combined online total."
              : "Card and online/UPI payments for current filters. Click for breakdown."
          }
        >
          <Card
            className="h-full min-w-0 overflow-hidden cursor-pointer select-none rounded-lg border border-gray-200 bg-white shadow-sm outline-none transition-shadow duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            role="button"
            tabIndex={0}
            aria-expanded={showOnlineCashCollectedBreakdown}
            onClick={() => setShowOnlineCashCollectedBreakdown((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setShowOnlineCashCollectedBreakdown((v) => !v)
              }
            }}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="min-w-0 flex-1 text-sm font-medium leading-snug text-gray-900 break-words">Online Cash Collected</CardTitle>
              <div className="shrink-0 p-2 bg-gray-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-gray-600" />
              </div>
            </CardHeader>
            <CardContent>
              {salesStatsLoading ? (
                salesStatSkeleton
              ) : !showOnlineCashCollectedBreakdown ? (
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-gray-900">₹{onlineCashCollected.toFixed(2)}</div>
                  <p className="text-xs leading-snug text-gray-400 break-words">Click for breakdown</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Card</p>
                    <p className="text-xl font-bold text-gray-900">₹{cardCollected.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Online</p>
                    <p className="text-xl font-bold text-gray-900">₹{onlinePayCollected.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </CursorTooltip>

        <CursorTooltip wrapperClassName="h-full min-h-0" className="text-center" content="Tips from selected sales">
          <Card className="h-full min-w-0 overflow-hidden bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="min-w-0 flex-1 text-sm font-medium leading-snug text-gray-900 break-words">Tips Collected</CardTitle>
              <div className="shrink-0 p-2 bg-gray-100 rounded-lg">
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
      <div className={REPORT_TABLE_SHELL_CLASS}>
        {/* Table Header with pagination controls */}
        <div className={REPORT_TABLE_HEADER_CLASS}>
          <div className="flex items-center justify-between">
            <h3 className={REPORT_TABLE_HEADER_TITLE_CLASS}>Sales Records</h3>
            <div className="flex items-center gap-4">
              <div className={REPORT_TABLE_HEADER_META_CLASS}>
                {salesListLoading
                  ? "Loading…"
                  : totalSalesRows > 0
                    ? `Showing ${salesStartRow}-${salesEndRow} of ${totalSalesRows} sales`
                    : "No sales"}
              </div>
              <div className={`flex items-center gap-2 ${REPORT_TABLE_HEADER_META_CLASS}`}>
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
              <TableRow className={REPORT_TABLE_HEAD_ROW_CLASS}>
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
                <TableHead className="font-semibold text-slate-800">
                  <span className="inline-flex items-center gap-1">
                    Adjustments
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help">
                            <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm">
                            Change credited to prepaid wallet, product-return wallet refunds, or other non-bill adjustments.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                </TableHead>
                <TableHead className="font-semibold text-slate-800">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesListLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-16 text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                      <span className="text-sm">Loading sales…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-slate-500">
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
                      {(() => {
                        const modeLabel = getPaymentModeDisplay(sale)
                        if (!modeLabel) {
                          return <span className="text-slate-400">—</span>
                        }
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {modeLabel}
                          </span>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="text-slate-600">₹{getTaxableAmount(sale).toFixed(2)}</TableCell>
                    <TableCell className="text-slate-600">₹{getGST(sale).toFixed(2)}</TableCell>
                    <TableCell className="font-semibold text-green-700">₹{getTotalPaid(sale).toFixed(2)}</TableCell>
                    <TableCell>
                      {(() => {
                        const adj = getSaleAdjustmentSummary(sale)
                        if (!adj.hasAdjustment) {
                          return <span className="text-slate-400">—</span>
                        }
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-800 border border-violet-200 cursor-help">
                                  {adj.displayLabel}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-sm">{adj.tooltip}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )
                      })()}
                    </TableCell>
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
                            {canShowRecordConsumptionCta({
                              saleId: sale.id,
                              status: sale.status,
                            }) ? (
                              <DropdownMenuItem
                                onSelect={() => {
                                  setTimeout(() => handleOpenRecordConsumption(sale), 0)
                                }}
                                className="hover:bg-amber-50"
                              >
                                <Package className="mr-2 h-4 w-4 text-amber-600" />
                                <span className="text-slate-700">Record consumption</span>
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              onSelect={() => {
                                setTimeout(() => handleViewBill(sale), 0)
                              }}
                              className="hover:bg-blue-50"
                            >
                              <Eye className="mr-2 h-4 w-4 text-blue-600" />
                              <span className="text-slate-700">View Bill Details</span>
                            </DropdownMenuItem>
                            {canEditSale && (
                              <DropdownMenuItem onClick={() => handleEditBill(sale)} className="hover:bg-amber-50">
                                <Edit className="mr-2 h-4 w-4 text-amber-600" />
                                <span className="text-slate-700">Edit Bill</span>
                              </DropdownMenuItem>
                            )}
                            {canDeleteSale && (
                              <DropdownMenuItem
                                onSelect={() => {
                                  setTimeout(() => handleDeleteSale(sale), 0)
                                }}
                                className="text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            )}
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
          <div className={REPORT_TABLE_FOOTER_CLASS}>
            <div className="flex items-center justify-between">
              <div className={REPORT_TABLE_HEADER_META_CLASS}>
                Page {safeSalesPageIndex + 1} of {displayTotalPages}
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSalesPageIndex(prev => Math.max(0, prev - 1))}
                  disabled={safeSalesPageIndex === 0 || salesListLoading}
                  className="h-9 px-4 border-gray-200 hover:border-gray-300 dark:border-border dark:hover:border-border"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSalesPageIndex(prev => Math.min(displayTotalPages - 1, prev + 1))}
                  disabled={safeSalesPageIndex >= displayTotalPages - 1 || salesListLoading}
                  className="h-9 px-4 border-gray-200 hover:border-gray-300 dark:border-border dark:hover:border-border"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bill View Dialog */}
      <Dialog
        open={isBillDialogOpen}
        onOpenChange={(open) => {
          setIsBillDialogOpen(open)
          if (!open) setBillConsumptionDialogOpen(false)
        }}
      >
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
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Adjustments</label>
                  {(() => {
                    const adj = getSaleAdjustmentSummary(selectedBill)
                    if (!adj.hasAdjustment) {
                      return <p className="text-lg text-muted-foreground">—</p>
                    }
                    return (
                      <p className="text-lg font-semibold text-violet-700">{adj.displayLabel}</p>
                    )
                  })()}
                </div>
              </div>
              {selectedBill.payments && selectedBill.payments.length > 0 && (
                <div className="border-t pt-4">
                  <label className="text-sm font-medium text-muted-foreground">Payment Breakdown</label>
                  <div className="space-y-2 mt-2">
                    {getSalePaymentLinesWithDates(selectedBill).map((line, index) => (
                      <div key={index} className="flex justify-between items-center bg-muted/30 p-2 rounded">
                        <span className="font-medium">
                          {line.mode}
                          <span className="text-muted-foreground font-normal"> · {formatPaymentRecordedDateLabel(line.recordedAt)}</span>
                        </span>
                        <span className="text-green-600 font-semibold">₹{line.amount.toFixed(2)}</span>
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
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setIsBillDialogOpen(false)}>
              Close
            </Button>
            {selectedBill &&
            canShowRecordConsumptionCta({
              saleId: selectedBill.id,
              status: selectedBill.status,
            }) ? (
              <Button
                variant="outline"
                className="bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100"
                onClick={() => handleOpenRecordConsumption(selectedBill)}
              >
                <Package className="h-4 w-4 mr-2" />
                Record consumption
              </Button>
            ) : null}
            <Button onClick={() => {
              setIsBillDialogOpen(false)
              // Here you could add print functionality
            }}>
              Print Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(consumptionDialogSale ?? selectedBill)?.id ? (
        <RecordConsumptionDialog
          saleId={(consumptionDialogSale ?? selectedBill)!.id}
          billNo={(consumptionDialogSale ?? selectedBill)!.billNo}
          open={billConsumptionDialogOpen}
          onOpenChange={(open) => {
            setBillConsumptionDialogOpen(open)
            if (!open) setConsumptionDialogSale(null)
          }}
        />
      ) : null}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open)
          if (!open) setDeleteSaleReason("")
        }}
      >
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
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false)
                setDeleteSaleReason("")
              }}
            >
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