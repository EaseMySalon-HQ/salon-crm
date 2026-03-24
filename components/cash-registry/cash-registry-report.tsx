"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search, Download, Filter, TrendingUp, DollarSign, Users, MoreHorizontal, Eye, Pencil, Trash2, Banknote, Calendar, Clock, CreditCard, Receipt, RefreshCw, CheckCircle, Clock as ClockIcon, FileText, FileSpreadsheet, ChevronDown, Info, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { toDateStringIST, formatInIST, getStartOfDayIST, getEndOfDayIST, getTodayIST } from "@/lib/date-utils"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import type { DateRange } from "react-day-picker"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { CashRegistryAPI, ExpensesAPI, SalesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useFeature } from "@/hooks/use-entitlements"
import { useAuth } from "@/lib/auth-context"
import { CashRegistryModal } from "./cash-registry-modal"
import { VerificationModal } from "./verification-modal"
import { CashDifferenceBreakdownDrawer } from "./cash-difference-breakdown-drawer"
import { AddEditReasonModal } from "./add-edit-reason-modal"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"

interface CashRegistryEntry {
  id: string
  date: string
  shiftType: "opening" | "closing"
  createdBy: string
  openingBalance: number
  closingBalance: number
  totalBalance: number
  denominations: Array<{
    value: number
    count: number
    total: number
  }>
  closingDenominations?: Array<{
    value: number
    count: number
    total: number
  }>
  onlineCash: number
  posCash: number
  balanceDifference: number
  balanceDifferenceReason?: string
  balanceDifferenceNote?: string
  onlinePosDifference: number
  onlineCashDifferenceReason?: string
  onlineCashDifferenceNote?: string
  cashBalance?: number
  status: "active" | "closed" | "verified"
  isVerified: boolean
  createdAt: string
}

type DatePeriod = "today" | "yesterday" | "last7days" | "last30days" | "currentMonth" | "custom"

interface CashRegistryReportProps {
  isVerificationModalOpen: boolean
  onVerificationModalChange: (open: boolean) => void
}

export function CashRegistryReport({ isVerificationModalOpen, onVerificationModalChange }: CashRegistryReportProps) {
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("today")
  const [shiftFilter, setShiftFilter] = useState<string>("all")
  const [reportType, setReportType] = useState<string>("summary")
  const [cashRegistryData, setCashRegistryData] = useState<CashRegistryEntry[]>([])
  const [expensesData, setExpensesData] = useState<{ [date: string]: number }>({})
  const [salesData, setSalesData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEntry, setSelectedEntry] = useState<CashRegistryEntry | null>(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isDenominationsModalOpen, setIsDenominationsModalOpen] = useState(false)
  const [selectedDenominationsEntry, setSelectedDenominationsEntry] = useState<CashRegistryEntry | null>(null)
  const [selectedDenominationsType, setSelectedDenominationsType] = useState<"opening" | "closing">("opening")
  const [isDeletingDailySummary, setIsDeletingDailySummary] = useState(false)
  const [selectedSummaryDate, setSelectedSummaryDate] = useState<string | null>(null)
  const [breakdownDrawerOpen, setBreakdownDrawerOpen] = useState(false)
  const [breakdownEntry, setBreakdownEntry] = useState<import("./cash-difference-breakdown-drawer").DifferenceBreakdownEntry | null>(null)
  const [addEditReasonModalOpen, setAddEditReasonModalOpen] = useState(false)
  const [selectedClosingEntry, setSelectedClosingEntry] = useState<CashRegistryEntry | null>(null)
  const [cashSalesCardExpanded, setCashSalesCardExpanded] = useState(false)
  const cashSalesCardRef = useRef<HTMLDivElement>(null)
  const [onlineSalesCardExpanded, setOnlineSalesCardExpanded] = useState(false)
  const onlineSalesCardRef = useRef<HTMLDivElement>(null)

  // State for daily summaries (populated when "Verified and Close" is clicked)
  const [dailySummaries, setDailySummaries] = useState<Array<{
    date: string
    openingBalance: number
    cashCollected: number
    expense: number
    cashBalance: number
    closingBalance: number
    cashDifference: number
    cashDifferenceReason?: string
    cashDifferenceNote?: string
    closingEntryId?: string
    totalOnlineSales: number
    cashInPos: number
    onlineCashDifference: number
    onlineCashDifferenceReason?: string
    onlineCashDifferenceNote?: string
    isVerified: boolean
    verifiedAt: string
    verifiedBy: string
  }>>([])

  // Generate daily summaries from existing cash registry data
  const generateDailySummaries = useCallback(() => {
    // Only require cash registry data - sales can be empty
    if (!cashRegistryData.length) {
      return
    }
    
    // Group entries by date
    const entriesByDate: { [date: string]: { opening?: any; closing?: any } } = {}
    
    cashRegistryData.forEach(entry => {
      const dateKey = toDateStringIST(entry.date)
      if (!entriesByDate[dateKey]) {
        entriesByDate[dateKey] = {}
      }
      
      if (entry.shiftType === 'opening') {
        entriesByDate[dateKey].opening = entry
      } else if (entry.shiftType === 'closing') {
        entriesByDate[dateKey].closing = entry
      }
    })

    // Generate summaries for each date
    const summaries = Object.entries(entriesByDate).map(([dateKey, entries]) => {
      const openingEntry = entries.opening
      const closingEntry = entries.closing
      
      const openingBalance = openingEntry?.openingBalance || 0
      const closingBalance = closingEntry?.closingBalance || 0
      
      // Calculate values for this specific date
      const cashCollected = getEntryCashSales(dateKey)
      const expense = getEntryExpenses(dateKey)
      const cashBalance = openingBalance + cashCollected - expense
      const cashDifference = closingBalance - cashBalance
      const cashInPos = closingEntry?.posCash || 0
      const onlineSales = getEntryOnlineSales(dateKey)
      const onlineCashDifference = cashInPos - onlineSales
      
      // Check if we already have a summary with reasons for this date
      const existingSummary = dailySummaries.find(s => s.date === dateKey)
      
      const summary = {
        date: dateKey,
        openingBalance,
        cashCollected,
        expense,
        cashBalance,
        closingBalance,
        cashDifference,
        cashDifferenceReason: existingSummary?.cashDifferenceReason || closingEntry?.balanceDifferenceReason || '',
        cashDifferenceNote: existingSummary?.cashDifferenceNote || (closingEntry as any)?.balanceDifferenceNote || '',
        closingEntryId: closingEntry?.id || '',
        totalOnlineSales: onlineSales,
        cashInPos,
        onlineCashDifference,
        onlineCashDifferenceReason: existingSummary?.onlineCashDifferenceReason || closingEntry?.onlineCashDifferenceReason || '',
        onlineCashDifferenceNote: existingSummary?.onlineCashDifferenceNote || (closingEntry as any)?.onlineCashDifferenceNote || '',
        isVerified: closingEntry?.isVerified || false,
        verifiedAt: closingEntry?.verifiedAt || '',
        verifiedBy: closingEntry?.verifiedBy || ''
      }
      
      return summary
    })

    if (summaries.length > 0) {
      setDailySummaries(summaries)
    } else {
      setDailySummaries([])
    }
  }, [cashRegistryData, salesData, expensesData])

  // Get today's closing entry for verification (IST calendar day)
  const todayClosingEntry = cashRegistryData.find(entry => {
    return entry.shiftType === "closing" && toDateStringIST(entry.date) === getTodayIST()
  })

  // Handle verification
  const handleVerification = async (data: { 
    entryId: string
    balanceDifferenceReason?: string
    balanceDifferenceNote?: string
    onlinePosDifferenceReason?: string
    onlineCashDifferenceNote?: string
  }) => {
    try {
      const response = await CashRegistryAPI.verify(data.entryId, {
        balanceDifferenceReason: data.balanceDifferenceReason,
        balanceDifferenceNote: data.balanceDifferenceNote,
        onlineCashDifferenceReason: data.onlinePosDifferenceReason,
        onlineCashDifferenceNote: data.onlineCashDifferenceNote,
      })

      if (response.success) {
        // Get the verified entry from API response (has updated verifiedBy field)
        const verifiedEntryFromAPI = response.data
        // Find the verified entry in local data (could be today's or back-dated)
        const verifiedEntry = cashRegistryData.find(entry => entry.id === data.entryId)
        
        if (verifiedEntry) {
          const entryDate = new Date(verifiedEntry.date)
          const dateKey = toDateStringIST(entryDate) // YYYY-MM-DD format
          
          // Get the opening entry for the same date
          const openingEntry = cashRegistryData.find(entry => {
            const entryDate2 = new Date(entry.date)
            return entry.shiftType === "opening" && 
                   entryDate2.getDate() === entryDate.getDate() &&
                   entryDate2.getMonth() === entryDate.getMonth() &&
                   entryDate2.getFullYear() === entryDate.getFullYear()
          })

          // Calculate values for the summary
          const openingBalance = openingEntry?.openingBalance || 0
          const closingBalance = verifiedEntry.closingBalance || 0
          
          // For back-dated entries, we need to calculate sales and expenses for that specific date
          let cashCollected = 0
          let expense = 0
          let onlineSales = 0
          
          if (dateKey === getTodayIST()) {
            // For today's entries, use real-time data
            cashCollected = getRealTimeCashSales()
            expense = getRealTimeExpenses()
            onlineSales = getRealTimeOnlineSales()
          } else {
            // For back-dated entries, calculate from historical data
            cashCollected = getEntryCashSales(verifiedEntry.date)
            expense = getEntryExpenses(verifiedEntry.date)
            onlineSales = getEntryOnlineSales(verifiedEntry.date)
          }
          
          const cashBalance = openingBalance + cashCollected - expense
          const cashDifference = closingBalance - cashBalance
          const cashInPos = verifiedEntry.posCash || 0
          const onlineCashDifference = cashInPos - onlineSales

          // Get verifiedBy from API response, or use current user's name as fallback
          const verifiedByName = verifiedEntryFromAPI?.verifiedBy || 
                                 (user?.name || (user as any)?.firstName && (user as any)?.lastName 
                                   ? `${(user as any).firstName} ${(user as any).lastName}`.trim() 
                                   : user?.email || 'Unknown')

          // Create or update daily summary with the verification reasons
          const newSummary = {
            date: dateKey,
            openingBalance,
            cashCollected,
            expense,
            cashBalance,
            closingBalance,
            cashDifference,
            cashDifferenceReason: data.balanceDifferenceReason || '',
            cashDifferenceNote: data.balanceDifferenceNote || '',
            closingEntryId: data.entryId,
            totalOnlineSales: onlineSales,
            cashInPos,
            onlineCashDifference,
            onlineCashDifferenceReason: data.onlinePosDifferenceReason || '',
            onlineCashDifferenceNote: data.onlineCashDifferenceNote || '',
            isVerified: true,
            verifiedAt: verifiedEntryFromAPI?.verifiedAt || new Date().toISOString(),
            verifiedBy: verifiedByName
          }

          setDailySummaries(prev => {
            const existingIndex = prev.findIndex(summary => summary.date === dateKey)
            if (existingIndex >= 0) {
              // Update existing summary
              const updated = [...prev]
              updated[existingIndex] = newSummary
              return updated
            } else {
              // Add new summary
              return [...prev, newSummary]
            }
          })
        }

        toast({
          title: "Success",
          description: "Cash registry has been verified and closed successfully. Summary by Day has been updated.",
        })
        // Refresh all data after successful verification (silent = no full-page loading spinner)
        await fetchCashRegistryData(true)
        await fetchSalesData()
        await fetchExpensesData()
        // useEffect will regenerate daily summaries when cashRegistryData updates
        onVerificationModalChange(false)
      } else {
        toast({
          title: "Error",
          description: response.message || "Failed to verify cash registry.",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error verifying cash registry:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred while verifying the cash registry.",
        variant: "destructive"
      })
    }
  }

  // Generate daily summaries when data changes
  useEffect(() => {
    if (cashRegistryData.length > 0) {
      generateDailySummaries()
    }
  }, [cashRegistryData, salesData, expensesData, generateDailySummaries])

  // Click outside both cards to collapse — clicking the other card must not collapse this one
  // (so Cash + Online breakdowns can stay open together).
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const insideCash = cashSalesCardRef.current?.contains(target) ?? false
      const insideOnline = onlineSalesCardRef.current?.contains(target) ?? false
      const outsideBoth = !insideCash && !insideOnline
      if (cashSalesCardExpanded && outsideBoth) {
        setCashSalesCardExpanded(false)
      }
      if (onlineSalesCardExpanded && outsideBoth) {
        setOnlineSalesCardExpanded(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [cashSalesCardExpanded, onlineSalesCardExpanded])

  // Convert calendar-picked dates to effective range (start of from-day, end of to-day) — used by API filters
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

  const fetchCashRegistryData = async (
    silent = false,
    rangeOverride?: { from: Date; to: Date } | null
  ) => {
    const range =
      rangeOverride ??
      (dateRange?.from && dateRange?.to ? getEffectiveDateRange(dateRange.from, dateRange.to) : null)
    if (!range) {
      setCashRegistryData([])
      if (!silent) setLoading(false)
      return
    }
    const { dateFrom, dateTo } = getEffectiveDateParams(range.from, range.to)
    if (!silent) setLoading(true)
    try {
      const response = await CashRegistryAPI.getAll({
        page: 1,
        limit: 500,
        dateFrom,
        dateTo,
      })
      if (response.data && Array.isArray(response.data)) {
        const mapped = response.data.map((entry: any) => ({
          id: entry._id,
          date: entry.date,
          shiftType: entry.shiftType,
          createdBy: entry.createdBy,
          openingBalance: entry.openingBalance || 0,
          closingBalance: entry.closingBalance || 0,
          totalBalance: entry.shiftType === "opening" ? entry.openingBalance : entry.closingBalance,
          denominations: entry.denominations || [],
          closingDenominations: entry.closingDenominations || [],
          onlineCash: entry.onlineCash || 0,
          posCash: entry.posCash || 0,
          balanceDifference: entry.balanceDifference || 0,
          onlinePosDifference: entry.onlinePosDifference || 0,
          balanceDifferenceReason: entry.balanceDifferenceReason || '',
          balanceDifferenceNote: entry.balanceDifferenceNote || '',
          onlineCashDifferenceReason: entry.onlineCashDifferenceReason || '',
          onlineCashDifferenceNote: entry.onlineCashDifferenceNote || '',
          cashBalance: entry.cashBalance,
          status: entry.status || "active",
          isVerified: entry.isVerified || false,
          createdAt: entry.createdAt
        }))
        // Sort by date (latest first) and then by shift type (opening first, then closing)
        const sorted = mapped.sort((a, b) => {
          const dateA = new Date(a.date).getTime()
          const dateB = new Date(b.date).getTime()
          
          if (dateA !== dateB) {
            return dateB - dateA // Latest date first
          }
          
          // If same date, opening comes before closing
          if (a.shiftType === 'opening' && b.shiftType === 'closing') return -1
          if (a.shiftType === 'closing' && b.shiftType === 'opening') return 1
          
          return 0
        })
        
        setCashRegistryData(sorted)
      } else {
        setCashRegistryData([])
      }
    } catch (error) {
      console.error("Error fetching cash registry data:", error)
      setCashRegistryData([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const fetchExpensesData = async (rangeOverride?: { from: Date; to: Date } | null) => {
    const range =
      rangeOverride ??
      (dateRange?.from && dateRange?.to ? getEffectiveDateRange(dateRange.from, dateRange.to) : null)
    if (!range) {
      setExpensesData({})
      return
    }
    const { dateFrom, dateTo } = getEffectiveDateParams(range.from, range.to)
    try {
      // Fetch only Cash expenses - non-Cash expenses (Card, UPI, etc.) do not affect cash balance
      const response = await ExpensesAPI.getAll({ 
        page: 1, 
        limit: 1000,
        paymentMethod: 'Cash',
        dateFrom,
        dateTo,
      })
      if (response.success && response.data) {
        // Group expenses by date
        const expensesMap: { [date: string]: number } = {}
        
        response.data.forEach((expense: any) => {
          const expenseDate = toDateStringIST(expense.date)
          if (!expensesMap[expenseDate]) {
            expensesMap[expenseDate] = 0
          }
          expensesMap[expenseDate] += expense.amount || 0
        })
        
        setExpensesData(expensesMap)
      } else {
        setExpensesData({})
      }
    } catch (error) {
      console.error("💥 Error fetching expenses data:", error)
      setExpensesData({})
    }
  }

  const fetchSalesData = async (overrideRange?: { from: Date; to: Date } | null) => {
    try {
      const range =
        overrideRange ??
        (dateRange?.from && dateRange?.to ? getEffectiveDateRange(dateRange.from, dateRange.to) : null)
      const params: { dateFrom?: string; dateTo?: string } = {}
      if (range) {
        // Match selected period only (same IST bounds as stats). Note: bills invoiced on older
        // dates but paid today are filtered by sale.date on the server — use a wider range if you add server-side payment-date filtering.
        const { dateFrom, dateTo } = getEffectiveDateParams(range.from, range.to)
        params.dateFrom = dateFrom
        params.dateTo = dateTo
      }
      const rows = await SalesAPI.getAllMergePages({ ...params, batchSize: 500 })
      setSalesData(Array.isArray(rows) ? rows : [])
    } catch (error) {
      console.error("Failed to fetch sales:", error)
      setSalesData([])
    }
  }

  // Default: today (IST); then load registry, expenses, and sales only for the selected range
  useEffect(() => {
    const todayStr = getTodayIST()
    setDateRange({
      from: new Date(getStartOfDayIST(todayStr)),
      to: new Date(getEndOfDayIST(todayStr)),
    })
  }, [])

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return
    const effectiveRange = getEffectiveDateRange(dateRange.from, dateRange.to)
    fetchCashRegistryData(false, effectiveRange)
    fetchExpensesData(effectiveRange)
    fetchSalesData(effectiveRange)
  }, [dateRange?.from?.getTime(), dateRange?.to?.getTime()])

  useEffect(() => {
    const handleCashRegistrySaved = () => {
      if (!dateRange?.from || !dateRange?.to) return
      const effectiveRange = getEffectiveDateRange(dateRange.from, dateRange.to)
      fetchCashRegistryData(true, effectiveRange)
      fetchExpensesData(effectiveRange)
      fetchSalesData(effectiveRange)
    }
    window.addEventListener("cash-registry-saved", handleCashRegistrySaved)
    return () => window.removeEventListener("cash-registry-saved", handleCashRegistrySaved)
  }, [dateRange?.from?.getTime(), dateRange?.to?.getTime()])

  // Function to get date range based on selected period
  const getDateRangeFromPeriod = (period: DatePeriod) => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    switch (period) {
      case "today": {
        const todayStr = getTodayIST()
        return {
          from: new Date(getStartOfDayIST(todayStr)),
          to: new Date(getEndOfDayIST(todayStr)),
        }
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
        return {
          from: firstDayOfMonth,
          to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
      case "custom":
        // Default to last 7 days when switching to custom; user can change via picker
        const last7 = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
        return {
          from: last7,
          to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
      default:
        return {
          from: new Date(0), // Start of epoch
          to: new Date() // Current date
        }
    }
  }

  const handleDatePeriodChange = (period: DatePeriod) => {
    setDatePeriod(period)
    setDateRange(getDateRangeFromPeriod(period))
  }

  // Filter data for stats calculations (ALWAYS use unfiltered data, only affected by date range)
  const effectiveRange = dateRange?.from && dateRange?.to ? getEffectiveDateRange(dateRange.from, dateRange.to) : null
  const rangeForPeriod = datePeriod !== "custom" ? getDateRangeFromPeriod(datePeriod) : null
  const activeDateRange = effectiveRange || (rangeForPeriod?.from && rangeForPeriod?.to ? { from: rangeForPeriod.from, to: rangeForPeriod.to } : null)
  /** IST calendar-day comparison avoids UTC/local midnight mismatches on YYYY-MM-DD strings */
  const isInSelectedDateRange = (d: Date | string) => {
    if (!activeDateRange) return true
    const day = toDateStringIST(d)
    const fromDay = toDateStringIST(activeDateRange.from)
    const toDay = toDateStringIST(activeDateRange.to)
    return day >= fromDay && day <= toDay
  }
  const statsFilteredData = cashRegistryData.filter(entry => isInSelectedDateRange(entry.date))

  // Filter data for table display (affected by search, shift filter, and report type)
  const filteredData = cashRegistryData.filter(entry => {
    const matchesSearch = searchTerm === "" || 
      entry.createdBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.date.includes(searchTerm) ||
      entry.shiftType.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesShift = shiftFilter === "all" || entry.shiftType === shiftFilter
    
    // Report type filtering
    let matchesReportType = true
    if (reportType === "summary") {
      // For summary report, don't filter by entry type since generateDailySummaries handles pairing
      matchesReportType = true
    } else {
      // For activity report, show all entries
      matchesReportType = true
    }
    
    const matchesDateRange = isInSelectedDateRange(entry.date)
    return matchesSearch && matchesShift && matchesReportType && matchesDateRange
  })

  // Filter daily summaries by date range (for Summary By Day report)
  const filteredDailySummaries = dailySummaries.filter(summary => {
    if (!activeDateRange) return true
    const fromDay = toDateStringIST(activeDateRange.from)
    const toDay = toDateStringIST(activeDateRange.to)
    return summary.date >= fromDay && summary.date <= toDay
  })

  // Calculate real-time stats from sales and expenses data
  // Cash Register uses PAYMENT DATE (when cash was collected), not invoice date
  // Total Cash Sales = New payments today (checkout) + Due collections today
  const getRealTimeCashSales = () => {
    if (!activeDateRange) return 0
    const fromDay = toDateStringIST(activeDateRange.from)
    const toDay = toDateStringIST(activeDateRange.to)
    let total = 0
    salesData.forEach((sale: any) => {
      const saleDay = toDateStringIST(sale.date)
      // 1. Cash from new bills (checkout payments) - use sale date (payment at checkout = same day as invoice)
      if (saleDay >= fromDay && saleDay <= toDay) {
        let cashAmt = 0
        let isAllCash = false
        if (sale.payments && sale.payments.length > 0) {
          const cashPayments = sale.payments.filter((p: any) => (p.mode || p.type || "").toLowerCase().includes("cash"))
          const hasNonCash = sale.payments.some((p: any) => {
            const m = (p.mode || p.type || "").toLowerCase()
            return m.includes("card") || m.includes("online") || m.includes("upi")
          })
          cashAmt = cashPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
          isAllCash = cashAmt > 0 && !hasNonCash
        } else {
          const pm = (sale.paymentMode || "").toLowerCase()
          cashAmt = pm.includes("cash") && !pm.includes("card") && !pm.includes("online") ? (sale.netTotal || 0) : 0
          isAllCash = cashAmt > 0
        }
        const tip = sale.tip || 0
        total += cashAmt - (isAllCash ? tip : 0)
      }
      // 2. Cash from due collections - use paymentHistory date (when payment was actually collected)
      ;(sale.paymentHistory || []).forEach((ph: any) => {
        if (!ph || (ph.method || "").toLowerCase() !== "cash") return
        const phDay = ph.date ? toDateStringIST(ph.date) : ""
        if (phDay && phDay >= fromDay && phDay <= toDay) {
          total += ph.amount || 0
        }
      })
    })
    return total
  }

  const getRealTimeOnlineSales = () => {
    if (!activeDateRange) return 0
    const fromDay = toDateStringIST(activeDateRange.from)
    const toDay = toDateStringIST(activeDateRange.to)
    return salesData.reduce((sum: number, sale: any) => {
      const saleDay = toDateStringIST(sale.date)
      if (saleDay >= fromDay && saleDay <= toDay) {
        if (sale.payments && sale.payments.length > 0) {
          return sum + sale.payments
            .filter((payment: any) => payment.mode === "Card" || payment.mode === "Online")
            .reduce((paymentSum: number, payment: any) => paymentSum + payment.amount, 0)
        }
        return sum + ((sale.paymentMode === "Card" || sale.paymentMode === "Online") ? sale.netTotal : 0)
      }
      return sum
    }, 0)
  }

  const getRealTimeExpenses = () => {
    if (!activeDateRange) return 0
    const fromDay = toDateStringIST(activeDateRange.from)
    const toDay = toDateStringIST(activeDateRange.to)
    return Object.entries(expensesData).reduce((sum: number, [date, amount]) => {
      const expenseDay = toDateStringIST(date)
      if (expenseDay >= fromDay && expenseDay <= toDay) {
        return sum + amount
      }
      return sum
    }, 0)
  }

  // Get today's online sales specifically for the modal (IST calendar day)
  const getTodayOnlineSales = () => {
    const todayString = getTodayIST()
    return salesData.reduce((sum: number, sale: any) => {
      const saleDate = toDateStringIST(sale.date)
      if (saleDate === todayString) {
        if (sale.payments && sale.payments.length > 0) {
          return sum + sale.payments
            .filter((payment: any) => payment.mode === "Card" || payment.mode === "Online")
            .reduce((paymentSum: number, payment: any) => paymentSum + payment.amount, 0)
        }
        return sum + ((sale.paymentMode === "Card" || sale.paymentMode === "Online") ? sale.netTotal : 0)
      }
      return sum
    }, 0)
  }

  // Use real-time data for stats
  const totalCashSales = getRealTimeCashSales()
  const totalOnlineSales = getRealTimeOnlineSales()
  const totalExpenses = getRealTimeExpenses()

  // Cash breakdown for UI (From New Bills + From Due Collected)
  const getCashSalesBreakdown = () => {
    if (!activeDateRange) return { fromNewBills: 0, fromDueCollected: 0 }
    const fromDay = toDateStringIST(activeDateRange.from)
    const toDay = toDateStringIST(activeDateRange.to)
    let fromNewBills = 0
    let fromDueCollected = 0
    salesData.forEach((sale: any) => {
      const saleDay = toDateStringIST(sale.date)
      if (saleDay >= fromDay && saleDay <= toDay) {
        let cashAmt = 0
        let isAllCash = false
        if (sale.payments && sale.payments.length > 0) {
          const cashPayments = sale.payments.filter((p: any) => (p.mode || p.type || "").toLowerCase().includes("cash"))
          const hasNonCash = sale.payments.some((p: any) => {
            const m = (p.mode || p.type || "").toLowerCase()
            return m.includes("card") || m.includes("online") || m.includes("upi")
          })
          cashAmt = cashPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
          isAllCash = cashAmt > 0 && !hasNonCash
        } else {
          const pm = (sale.paymentMode || "").toLowerCase()
          cashAmt = pm.includes("cash") && !pm.includes("card") && !pm.includes("online") ? (sale.netTotal || 0) : 0
          isAllCash = cashAmt > 0
        }
        const tip = sale.tip || 0
        fromNewBills += cashAmt - (isAllCash ? tip : 0)
      }
      ;(sale.paymentHistory || []).forEach((ph: any) => {
        if (!ph || (ph.method || "").toLowerCase() !== "cash") return
        const phDay = ph.date ? toDateStringIST(ph.date) : ""
        if (phDay && phDay >= fromDay && phDay <= toDay) {
          fromDueCollected += ph.amount || 0
        }
      })
    })
    return { fromNewBills, fromDueCollected }
  }
  const cashSalesBreakdown = getCashSalesBreakdown()

  // Online sales breakdown (Card vs Online/UPI)
  const getOnlineSalesBreakdown = () => {
    if (!activeDateRange) return { fromCard: 0, fromOnline: 0 }
    const fromDay = toDateStringIST(activeDateRange.from)
    const toDay = toDateStringIST(activeDateRange.to)
    let fromCard = 0
    let fromOnline = 0
    salesData.forEach((sale: any) => {
      const saleDay = toDateStringIST(sale.date)
      if (saleDay >= fromDay && saleDay <= toDay) {
        if (sale.payments && sale.payments.length > 0) {
          sale.payments.forEach((p: any) => {
            const mode = (p.mode || p.type || "").toLowerCase()
            const amt = p.amount || 0
            if (mode.includes("card")) fromCard += amt
            else if (mode.includes("online") || mode.includes("upi")) fromOnline += amt
          })
        } else {
          const pm = (sale.paymentMode || "").toLowerCase()
          if (pm.includes("card")) fromCard += sale.netTotal || 0
          else if (pm.includes("online") || pm.includes("upi")) fromOnline += sale.netTotal || 0
        }
      }
    })
    return { fromCard, fromOnline }
  }
  const onlineSalesBreakdown = getOnlineSalesBreakdown()

  // Helper functions to get real-time data for each entry
  const getEntryCashSales = (entryDate: string) => {
    const normalizedEntryDate = toDateStringIST(entryDate)
    let total = 0
    salesData.forEach((sale: any) => {
      const saleDateStr = toDateStringIST(sale.date)
      // 1. Cash from new bills (checkout) - sale date = entry date
      if (saleDateStr === normalizedEntryDate) {
        let cashAmt = 0
        let isAllCash = false
        if (sale.payments && sale.payments.length > 0) {
          const cashPayments = sale.payments.filter((p: any) => (p.mode || p.type || "").toLowerCase().includes("cash"))
          const hasNonCash = sale.payments.some((p: any) => {
            const m = (p.mode || p.type || "").toLowerCase()
            return m.includes("card") || m.includes("online") || m.includes("upi")
          })
          cashAmt = cashPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0)
          isAllCash = cashAmt > 0 && !hasNonCash
        } else {
          const pm = (sale.paymentMode || "").toLowerCase()
          cashAmt = pm.includes("cash") && !pm.includes("card") && !pm.includes("online") ? (sale.netTotal || 0) : 0
          isAllCash = cashAmt > 0
        }
        const tip = sale.tip || 0
        total += cashAmt - (isAllCash ? tip : 0)
      }
      // 2. Cash from due collections - paymentHistory date = entry date
      ;(sale.paymentHistory || []).forEach((ph: any) => {
        if (!ph || (ph.method || "").toLowerCase() !== "cash") return
        const phDateStr = ph.date ? toDateStringIST(ph.date) : ""
        if (phDateStr === normalizedEntryDate) {
          total += ph.amount || 0
        }
      })
    })
    return total
  }



  const getEntryOnlineSales = (entryDate: string) => {
    // Normalize entry date to YYYY-MM-DD format
    const normalizedEntryDate = toDateStringIST(entryDate)
    
    return salesData.reduce((sum: number, sale: any) => {
      const saleDate = toDateStringIST(sale.date)
      if (saleDate === normalizedEntryDate) {
        if (sale.payments && sale.payments.length > 0) {
          return sum + sale.payments
            .filter((payment: any) => payment.mode === "Card" || payment.mode === "Online")
            .reduce((paymentSum: number, payment: any) => paymentSum + payment.amount, 0)
        }
        return sum + ((sale.paymentMode === "Card" || sale.paymentMode === "Online") ? sale.netTotal : 0)
      }
      return sum
    }, 0)
  }

  const getEntryExpenses = (entryDate: string) => {
    const normalizedEntryDate = toDateStringIST(entryDate)
    return Object.entries(expensesData).reduce((sum: number, [date, amount]) => {
      const expenseDate = toDateStringIST(date)
      if (expenseDate === normalizedEntryDate) {
        return sum + amount
      }
      return sum
    }, 0)
  }
  
  const totalOpeningBalance = statsFilteredData
    .filter(entry => entry.shiftType === "opening")
    .reduce((sum, entry) => sum + entry.openingBalance, 0)
  
  const totalClosingBalance = statsFilteredData
    .filter(entry => entry.shiftType === "closing")
    .reduce((sum, entry) => sum + (entry.closingBalance || 0), 0)

  // Calculate total online cash collected during closing shifts (Cash in POS Machine values)
  const totalOnlineCashCollected = statsFilteredData
    .filter(entry => entry.shiftType === "closing")
    .reduce((sum, entry) => sum + (entry.posCash || 0), 0)
  
  // Calculate Cash Difference using the formula: ((Total Opening Balance + Total Cash Sales) - Total Expenses) - Total Closing Balance
  // This represents the variance between expected and actual cash at closing
  const cashDifference =   totalClosingBalance - ((totalOpeningBalance + totalCashSales) - totalExpenses)
  
  // Calculate Online Cash Difference using the formula: Online Cash Collected - Total Online Sales
  // This represents the variance between collected online cash and actual online sales
  const onlineCashDifference = totalOnlineCashCollected - totalOnlineSales

  const activeClosingForVerify = selectedClosingEntry || todayClosingEntry || null
  const verificationSummaryDateKey = activeClosingForVerify
    ? toDateStringIST(new Date(activeClosingForVerify.date))
    : null
  const verificationDaySummary = verificationSummaryDateKey
    ? dailySummaries.find((s) => s.date === verificationSummaryDateKey) ?? null
    : null
  const verificationModalCashDifference = verificationDaySummary
    ? verificationDaySummary.cashDifference
    : cashDifference
  const verificationModalOnlineDifference = verificationDaySummary
    ? verificationDaySummary.onlineCashDifference
    : onlineCashDifference

  const handleExportPDF = async () => {
    toast({ title: "Export requested", description: "Generating cash registry PDF...", duration: 3000 })
    try {
      const { ReportsAPI } = await import('@/lib/api');
      
      const dateParams = dateRange?.from && dateRange?.to ? getEffectiveDateParams(dateRange.from, dateRange.to) : {}
      const result = await ReportsAPI.exportCashRegistry('pdf', {
        reportType: reportType,
        dateFrom: dateParams.dateFrom,
        dateTo: dateParams.dateTo
      });
      
      if (result && result.success) {
        toast({
          title: "Export Successful",
          description: result.message || "Cash registry report has been generated and sent to admin email(s)",
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
    toast({ title: "Export requested", description: "Generating cash registry Excel...", duration: 3000 })
    try {
      const { ReportsAPI } = await import('@/lib/api');
      
      const dateParams = dateRange?.from && dateRange?.to ? getEffectiveDateParams(dateRange.from, dateRange.to) : {}
      const result = await ReportsAPI.exportCashRegistry('xlsx', {
        reportType: reportType,
        dateFrom: dateParams.dateFrom,
        dateTo: dateParams.dateTo
      });
      
      if (result && result.success) {
        toast({
          title: "Export Successful",
          description: result.message || "Cash registry report has been generated and sent to admin email(s)",
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

  const handleViewEntry = (entry: CashRegistryEntry) => {
    setSelectedEntry(entry)
    setIsViewDialogOpen(true)
  }

  const handleViewDenominations = (entry: CashRegistryEntry, type: "opening" | "closing") => {
    setSelectedDenominationsEntry(entry)
    setSelectedDenominationsType(type)
    setIsDenominationsModalOpen(true)
  }

  const handleEditEntry = (entry: CashRegistryEntry) => {
    setSelectedEntry(entry)
    setIsEditDialogOpen(true)
  }

  const handleDeleteEntry = (entry: CashRegistryEntry) => {
    // Check if entry is verified - show special warning for verified entries
    if (entry.isVerified) {
      // Check if user is admin - allow deletion with confirmation
      if (user?.role === 'admin') {
        setSelectedEntry(entry)
        setIsDeleteDialogOpen(true)
        return
      } else {
        toast({
          title: "Cannot Delete Verified Entry",
          description: "Verified cash registry entries cannot be deleted. Only administrators can delete verified entries.",
          variant: "destructive"
        })
        return
      }
    }

    // Check if this is a closing shift and if there's also opening data
    const hasOpeningData = entry.openingBalance > 0
    const hasClosingData = entry.closingBalance > 0
    
    if (hasOpeningData && hasClosingData) {
      // This record has both opening and closing data
      // We need to ask user which part to delete
      setSelectedEntry(entry)
      setIsDeleteDialogOpen(true)
    } else {
      // This record only has one type of data, safe to delete entirely
      setSelectedEntry(entry)
      setIsDeleteDialogOpen(true)
    }
  }

  const handleDeleteDailySummary = (summary: any) => {
    // For daily summaries, we need to find and delete the underlying cash registry entries
    const summaryDate = summary.date
    
    // Find all cash registry entries for this date
    const entriesForDate = cashRegistryData.filter(entry => {
      const entryDate = toDateStringIST(entry.date)
      return entryDate === summaryDate
    })
    
    if (entriesForDate.length === 0) {
      toast({
        title: "No Entries Found",
        description: "No cash registry entries found for this date to delete.",
        variant: "destructive"
      })
      return
    }
    
    // Verification check removed for now - will implement proper audit controls later
    
    // Set state for daily summary deletion
    setSelectedSummaryDate(summaryDate)
    setIsDeletingDailySummary(true)
    setSelectedEntry(entriesForDate[0])
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedEntry) return
    
    setIsDeleting(true)
    try {
      let response
      
      if (isDeletingDailySummary && selectedSummaryDate) {
        // Delete all entries for the selected date (daily summary deletion)
        // Find all entries for this date
        const entriesForDate = cashRegistryData.filter(entry => {
          const entryDate = toDateStringIST(entry.date)
          return entryDate === selectedSummaryDate
        })
        
        // Delete each entry
        const deletePromises = entriesForDate.map(entry => CashRegistryAPI.delete(entry.id))
        const deleteResults = await Promise.all(deletePromises)
        
        // Check if all deletions were successful
        const allSuccessful = deleteResults.every(result => 
          result.message && result.message.includes('deleted successfully')
        )
        
        if (allSuccessful) {
          toast({
            title: "Success",
            description: `Successfully deleted daily summary for ${selectedSummaryDate}`,
          })
          // Refresh data after successful deletion
          await fetchCashRegistryData()
          // Regenerate daily summaries
          setTimeout(() => {
            generateDailySummaries()
          }, 100)
        } else {
          throw new Error("Some entries could not be deleted")
        }
      } else {
        // Regular single entry deletion
        // Determine which shift to delete based on the current context
        let shiftTypeToDelete = null
        
        // Check if this is a row-specific deletion (we need to determine from the row context)
        if (selectedEntry.openingBalance > 0 && selectedEntry.closingBalance > 0) {
          // This record has both opening and closing data
          // We need to determine which shift the user wants to delete
          // For now, we'll delete the entire record and let them recreate what they need
          shiftTypeToDelete = null
        } else if (selectedEntry.openingBalance > 0) {
          shiftTypeToDelete = 'opening'
        } else if (selectedEntry.closingBalance > 0) {
          shiftTypeToDelete = 'closing'
        }
        
        // Call delete API (shiftType parameter removed for now)
        response = await CashRegistryAPI.delete(selectedEntry.id)
        
        // Check if the response has a success message (backend returns { message: '...' })
        if (response.message && response.message.includes('deleted successfully')) {
          toast({
            title: "Success",
            description: response.message,
          })
          // Refresh data after successful deletion
          await fetchCashRegistryData()
        } else {
          throw new Error(response.message || "Failed to delete entry")
        }
      }
      
      // Common cleanup
      setIsDeleteDialogOpen(false)
      setSelectedEntry(null)
      setIsDeletingDailySummary(false)
      setSelectedSummaryDate(null)
      
    } catch (error: any) {
      console.error("Delete error:", error)

      // Handle different types of errors - check responseData (attached by interceptor) and response.data
      let errorMessage = "Failed to delete entry"
      const responseData = error.responseData ?? error.response?.data
      if (responseData?.message) {
        errorMessage = responseData.message
      } else if (responseData?.error) {
        errorMessage = typeof responseData.error === "string" ? responseData.error : error.message
      } else if (error.message) {
        errorMessage = error.message
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const getStatusBadge = (status: string, isVerified: boolean) => {
    if (isVerified) {
      return (
        <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 shadow-md px-3 py-1 rounded-full font-medium">
          ✅ Verified
        </Badge>
      )
    }
    
    switch (status) {
      case "active":
        return (
          <Badge className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0 shadow-md px-3 py-1 rounded-full font-medium">
            🔄 Active
          </Badge>
        )
      case "closed":
        return (
          <Badge className="bg-gradient-to-r from-slate-500 to-gray-600 text-white border-0 shadow-md px-3 py-1 rounded-full font-medium">
            🔒 Closed
          </Badge>
        )
      case "verified":
        return (
          <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 shadow-md px-3 py-1 rounded-full font-medium">
            ✅ Verified
          </Badge>
        )
      default:
        return (
          <Badge className="bg-gradient-to-r from-slate-400 to-gray-500 text-white border-0 shadow-md px-3 py-1 rounded-full font-medium">
            {status}
          </Badge>
        )
    }
  }

  const getShiftBadge = (shiftType: string) => {
    switch (shiftType) {
      case "opening":
        return (
          <Badge className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0 shadow-md px-3 py-1 rounded-full font-medium">
            🌅 Opening
          </Badge>
        )
      case "closing":
        return (
          <Badge className="bg-gradient-to-r from-orange-500 to-red-600 text-white border-0 shadow-md px-3 py-1 rounded-full font-medium">
            🌆 Closing
          </Badge>
        )
      default:
        return (
          <Badge className="bg-gradient-to-r from-slate-400 to-gray-500 text-white border-0 shadow-md px-3 py-1 rounded-full font-medium">
            {shiftType}
          </Badge>
        )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-700">Loading Cash Registry...</h3>
            <p className="text-slate-500">Fetching your financial data</p>
          </div>
          <div className="flex items-center justify-center space-x-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 w-full">
      {/* Enhanced Stats Cards - Full Width Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        <Card
          ref={cashSalesCardRef}
          role="button"
          tabIndex={0}
          onClick={() => setCashSalesCardExpanded((prev) => !prev)}
          onKeyDown={(e) => e.key === "Enter" && setCashSalesCardExpanded((prev) => !prev)}
          className={`bg-white border border-gray-200 rounded-lg shadow-sm transition-all duration-300 ease-in-out cursor-pointer select-none overflow-hidden ${
            cashSalesCardExpanded ? "shadow-md ring-2 ring-blue-200" : "hover:shadow-md hover:ring-1 hover:ring-gray-200"
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-gray-900">Total Cash Sales</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help" onClick={(e) => e.stopPropagation()}>
                      <Info className="h-3 w-3 text-gray-400" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>New payments + due collections (by payment date)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 min-h-[88px]">
            {!cashSalesCardExpanded ? (
              <>
                <div className="text-2xl font-bold text-gray-900">₹{totalCashSales.toFixed(2)}</div>
                <p className="text-xs text-gray-500">New Bills + Due Collected</p>
                {(cashSalesBreakdown.fromNewBills > 0 || cashSalesBreakdown.fromDueCollected > 0) && (
                  <p className="text-xs text-gray-400 italic">Tap to view breakdown</p>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3 animate-in fade-in-0 zoom-in-95 duration-300">
                <div className="rounded-lg bg-slate-50/80 border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-1">
                    <Receipt className="h-3 w-3" />
                    New Bills
                  </div>
                  <div className="text-lg font-bold text-gray-900">₹{cashSalesBreakdown.fromNewBills.toFixed(2)}</div>
                  {totalCashSales > 0 && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {Math.round((cashSalesBreakdown.fromNewBills / totalCashSales) * 100)}%
                    </div>
                  )}
                </div>
                <div className="rounded-lg bg-emerald-50/80 border border-emerald-100 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
                    <Banknote className="h-3 w-3" />
                    Due Collected
                  </div>
                  <div className="text-lg font-bold text-gray-900">₹{cashSalesBreakdown.fromDueCollected.toFixed(2)}</div>
                  {totalCashSales > 0 && (
                    <div className="text-xs text-emerald-600 mt-0.5">
                      {Math.round((cashSalesBreakdown.fromDueCollected / totalCashSales) * 100)}%
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card
          ref={onlineSalesCardRef}
          role="button"
          tabIndex={0}
          onClick={() => setOnlineSalesCardExpanded((prev) => !prev)}
          onKeyDown={(e) => e.key === "Enter" && setOnlineSalesCardExpanded((prev) => !prev)}
          className={`bg-white border border-gray-200 rounded-lg shadow-sm transition-all duration-300 ease-in-out cursor-pointer select-none overflow-hidden ${
            onlineSalesCardExpanded ? "shadow-md ring-2 ring-blue-200" : "hover:shadow-md hover:ring-1 hover:ring-gray-200"
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-gray-900">Total Online Sales</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help" onClick={(e) => e.stopPropagation()}>
                      <Info className="h-3 w-3 text-gray-400" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Real-time online payments</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <CreditCard className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 min-h-[88px]">
            {!onlineSalesCardExpanded ? (
              <>
                <div className="text-2xl font-bold text-gray-900">₹{totalOnlineSales.toFixed(2)}</div>
                <p className="text-xs text-gray-500">Card + Online (UPI)</p>
                {(onlineSalesBreakdown.fromCard > 0 || onlineSalesBreakdown.fromOnline > 0) && (
                  <p className="text-xs text-gray-400 italic">Tap to view breakdown</p>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3 animate-in fade-in-0 zoom-in-95 duration-300">
                <div className="rounded-lg bg-slate-50/80 border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-1">
                    <CreditCard className="h-3 w-3" />
                    Card
                  </div>
                  <div className="text-lg font-bold text-gray-900">₹{onlineSalesBreakdown.fromCard.toFixed(2)}</div>
                  {totalOnlineSales > 0 && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {Math.round((onlineSalesBreakdown.fromCard / totalOnlineSales) * 100)}%
                    </div>
                  )}
                </div>
                <div className="rounded-lg bg-violet-50/80 border border-violet-100 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-violet-700 mb-1">
                    <Smartphone className="h-3 w-3" />
                    Online (UPI)
                  </div>
                  <div className="text-lg font-bold text-gray-900">₹{onlineSalesBreakdown.fromOnline.toFixed(2)}</div>
                  {totalOnlineSales > 0 && (
                    <div className="text-xs text-violet-600 mt-0.5">
                      {Math.round((onlineSalesBreakdown.fromOnline / totalOnlineSales) * 100)}%
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-gray-900">Total Expenses</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help">
                      <Info className="h-3 w-3 text-gray-400" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Real-time business expenses</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <Receipt className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">₹{totalExpenses.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-gray-900">Cash Difference</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help">
                      <Info className="h-3 w-3 text-gray-400" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Closing - (Opening + Sales - Expenses)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <TrendingUp className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={`text-2xl font-bold ${
              cashDifference > 0 ? 'text-green-600' : 
              cashDifference < 0 ? 'text-red-600' : 
              'text-gray-900'
            }`}>
              ₹{cashDifference.toFixed(2)}
            </div>
            {cashDifference !== 0 && (
              <div className={`px-2 py-1 rounded text-xs font-medium ${
                cashDifference > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {cashDifference > 0 ? 'Surplus' : 'Shortage'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-gray-900">Online Cash Diff.</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help">
                      <Info className="h-3 w-3 text-gray-400" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Online Cash - Online Sales</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <CreditCard className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={`text-2xl font-bold ${
              onlineCashDifference > 0 ? 'text-green-600' : 
              onlineCashDifference < 0 ? 'text-red-600' : 
              'text-gray-900'
            }`}>
              ₹{onlineCashDifference.toFixed(2)}
            </div>
            {onlineCashDifference !== 0 && (
              <div className={`px-2 py-1 rounded text-xs font-medium ${
                onlineCashDifference > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {onlineCashDifference > 0 ? 'Surplus' : 'Shortage'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Balance Summary Cards - Full Width */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-gray-900">Total Opening Balance</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help">
                      <Info className="h-3 w-3 text-gray-400" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>From all opening shifts</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">₹{totalOpeningBalance.toFixed(2)}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-gray-900">Total Closing Balance</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help">
                      <Info className="h-3 w-3 text-gray-400" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>From all closing shifts</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">₹{totalClosingBalance.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-gray-900">Online Cash Collected</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help">
                      <Info className="h-3 w-3 text-gray-400" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>From Cash in POS Machine during closing shifts</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="p-2 bg-gray-100 rounded-lg">
              <CreditCard className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">₹{totalOnlineCashCollected.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>



      {/* All Filters and Actions in Single Row */}
      <div className="relative overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-lg">
        {/* Background Pattern */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/5 to-indigo-400/5 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-purple-400/5 to-blue-400/5 rounded-full blur-2xl" />
        
        <div className="relative p-6">
          {/* Everything in Single Row */}
          <div className="flex items-center justify-between">
            {/* Left Side - Filters */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search entries..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-48"
                />
              </div>
              
              <Select value={datePeriod} onValueChange={handleDatePeriodChange}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Quick periods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last7days">Last 7 days</SelectItem>
                  <SelectItem value="last30days">Last 30 days</SelectItem>
                  <SelectItem value="currentMonth">Current month</SelectItem>
                  <SelectItem value="custom">Custom Date</SelectItem>
                </SelectContent>
              </Select>
              
              {datePeriod === "custom" && (
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-[140px] justify-start text-left font-normal"
                      >
                        <Calendar className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {dateRange?.from ? format(dateRange.from, "dd MMM yyyy") : "From"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        initialFocus
                        mode="single"
                        selected={dateRange?.from}
                        onSelect={(d) => setDateRange((r) => ({ from: d, to: r?.to ?? d }))}
                        disabled={(d) => d > new Date() || (dateRange?.to ? d > dateRange.to : false)}
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-[140px] justify-start text-left font-normal"
                      >
                        <Calendar className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {dateRange?.to ? format(dateRange.to, "dd MMM yyyy") : "To"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        initialFocus
                        mode="single"
                        selected={dateRange?.to}
                        onSelect={(d) => setDateRange((r) => ({ from: r?.from, to: d }))}
                        disabled={(d) => d > new Date() || (dateRange?.from ? d < dateRange.from : false)}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              
              <Select value={shiftFilter} onValueChange={setShiftFilter}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shifts</SelectItem>
                  <SelectItem value="opening">Opening</SelectItem>
                  <SelectItem value="closing">Closing</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Report Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activity">Activity Report</SelectItem>
                  <SelectItem value="summary">Summary By Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Right Side - Actions */}
            <div className="flex items-center space-x-3">
              {canExport ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center space-x-2 bg-white border-slate-300 hover:bg-slate-50 hover:border-slate-400 hover:shadow-md transition-all duration-200 rounded-xl px-4 py-2"
                  >
                    <Download className="h-4 w-4 text-slate-600" />
                    <span className="font-medium">Export</span>
                    <ChevronDown className="h-4 w-4 text-slate-600" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                    <FileText className="h-4 w-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportXLS} className="cursor-pointer">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export as Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                className="flex items-center space-x-2 bg-gray-100 border-gray-300 cursor-not-allowed text-gray-500 rounded-xl px-4 py-2"
                disabled
                title="Data export requires Professional or Enterprise plan"
              >
                <Download className="h-4 w-4" />
                <span className="font-medium">Export (Upgrade)</span>
              </Button>
            )}
              
              <Button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 rounded-xl px-6 py-2"
              >
                <Banknote className="h-4 w-4" />
                <span className="font-semibold">Add Entry</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

            {/* Compact Cash Registry Table Header */}
            <div className="relative overflow-hidden border-0 bg-white rounded-2xl shadow-xl">
              {/* Background Pattern */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/5 to-purple-400/5 rounded-full blur-2xl" />
              
              <div className="relative p-4 border-b border-slate-200/50 bg-gradient-to-r from-slate-50 via-blue-50/30 to-indigo-50/30">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-sm">
                    <Receipt className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">
                      {reportType === "summary" ? "Summary By Day Report" : "Activity Report"}
                    </h3>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {reportType === "summary" 
                        ? "Showing consolidated daily summaries with opening and closing balances"
                        : "Showing detailed activity entries for each shift"
                      }
                    </p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto p-6">
                <Table className="w-full">
                <TableHeader>
                  <TableRow className="bg-slate-50 border-b border-slate-200">
                    {reportType === "summary" ? (
                      <>
                        <TableHead className="font-semibold text-slate-700 py-4">Date</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 py-4">Opening Balance</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 py-4">Cash Collected</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 py-4">Expense</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 py-4">Expected Cash</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 py-4">Actual Cash (Closing)</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 py-4">Cash Difference</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 py-4">Total Online Sales</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 py-4">Cash in POS</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 py-4">Online Cash Difference</TableHead>
                        <TableHead className="text-center font-semibold text-slate-700 py-4">Status</TableHead>
                        <TableHead className="text-center font-semibold text-slate-700 py-4">Actions</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead className="font-semibold text-slate-700 py-4">Date & Time</TableHead>
                        <TableHead className="font-semibold text-slate-700 py-4">Created By</TableHead>
                        <TableHead className="font-semibold text-slate-700 py-4">Shift Type</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 py-4">Total Amount</TableHead>
                        <TableHead className="font-semibold text-slate-700 py-4">Denominations</TableHead>
                        <TableHead className="text-center font-semibold text-slate-700 py-4">Actions</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(reportType === "summary" ? filteredDailySummaries.length === 0 : filteredData.length === 0) ? (
                    <TableRow className="border-0">
                      <TableCell colSpan={reportType === "summary" ? 12 : 6} className="text-center py-16 border-0">
                        <div className="flex flex-col items-center space-y-5">
                          <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-blue-100 rounded-full flex items-center justify-center">
                            <Receipt className="h-10 w-10 text-slate-400" />
                          </div>
                          <div className="text-center space-y-2">
                            <h3 className="text-lg font-semibold text-slate-700">
                              {reportType === "summary" 
                                ? "No Daily Summaries Found"
                                : "No Cash Registry Entries Found"
                              }
                            </h3>
                            <p className="text-slate-500 max-w-md text-sm leading-relaxed">
                              {reportType === "summary" 
                                ? "Complete a verification to see daily summaries here. Summaries provide consolidated views of opening and closing balances."
                                : "Get started by adding your first cash registry entry. Track opening and closing balances for each shift."
                              }
                            </p>
                          </div>
                          {reportType === "summary" && (
                            <Button
                              onClick={() => setIsAddModalOpen(true)}
                              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 rounded-xl px-6 py-2.5 text-sm"
                            >
                              <Banknote className="h-4 w-4 mr-2" />
                              Add First Entry
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (reportType === "summary" ? filteredDailySummaries : filteredData).map((entry) => {
                      if (reportType === "summary") {
                        // SUMMARY REPORT - Shows actual data from daily summaries
                        // Type guard to ensure this is a summary entry
                        if ('cashCollected' in entry) {
                          const date = entry.date
                          const openingBalance = entry.openingBalance
                          const cashCollected = entry.cashCollected
                          const expense = entry.expense
                          const cashBalance = entry.cashBalance
                          const closingBalance = entry.closingBalance
                          const cashDifference = entry.cashDifference
                          const cashDifferenceReason = entry.cashDifferenceReason
                          const cashDifferenceNote = entry.cashDifferenceNote
                          const totalOnlineSales = entry.totalOnlineSales
                          const cashInPos = entry.cashInPos
                          const onlineCashDifference = entry.onlineCashDifference
                          const onlineCashDifferenceReason = entry.onlineCashDifferenceReason
                          const onlineCashDifferenceNote = entry.onlineCashDifferenceNote
                          const closingEntryId = entry.closingEntryId || ''
                          const openCashBreakdown = () => {
                            setBreakdownEntry({
                              date,
                              type: 'cash',
                              expectedCash: cashBalance,
                              actualCash: closingBalance,
                              difference: cashDifference,
                              reason: cashDifferenceReason,
                              note: cashDifferenceNote,
                              closingEntryId,
                            })
                            setBreakdownDrawerOpen(true)
                          }
                          const openOnlineBreakdown = () => {
                            setBreakdownEntry({
                              date,
                              type: 'online',
                              expectedCash: totalOnlineSales,
                              actualCash: cashInPos,
                              difference: onlineCashDifference,
                              reason: onlineCashDifferenceReason,
                              note: onlineCashDifferenceNote,
                              closingEntryId,
                            })
                            setBreakdownDrawerOpen(true)
                          }
                          
                          return (
                            <TableRow key={entry.date} className="hover:bg-gray-50">
                              <TableCell className="font-medium min-w-[100px]">
                                {format(new Date(date), "dd MMM yyyy")}
                              </TableCell>
                              <TableCell className="text-right min-w-[120px]">₹{openingBalance.toFixed(2)}</TableCell>
                              <TableCell className="text-right min-w-[120px]">₹{cashCollected.toFixed(2)}</TableCell>
                              <TableCell className="text-right min-w-[100px]">₹{expense.toFixed(2)}</TableCell>
                              <TableCell className="text-right min-w-[120px]">₹{cashBalance.toFixed(2)}</TableCell>
                              <TableCell className="text-right min-w-[120px]">₹{closingBalance.toFixed(2)}</TableCell>
                              <TableCell className="text-right min-w-[120px]">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={openCashBreakdown}
                                        className={`inline-flex items-center gap-1 font-medium cursor-pointer hover:underline focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-300 rounded px-1.5 py-0.5 hover:bg-slate-100 transition-colors ${
                                          cashDifference > 0 ? 'text-green-600' : 
                                          cashDifference < 0 ? 'text-red-600' : 
                                          'text-gray-900'
                                        }`}
                                      >
                                        ₹{cashDifference.toFixed(2)}
                                        <Eye className="h-3 w-3 opacity-60" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Click to view details</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="text-right min-w-[140px]">₹{totalOnlineSales.toFixed(2)}</TableCell>
                              <TableCell className="text-right min-w-[120px]">₹{cashInPos.toFixed(2)}</TableCell>
                              <TableCell className="text-right min-w-[120px]">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={openOnlineBreakdown}
                                        className={`inline-flex items-center gap-1 font-medium cursor-pointer hover:underline focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-300 rounded px-1.5 py-0.5 hover:bg-slate-100 transition-colors ${
                                          onlineCashDifference > 0 ? 'text-green-600' : 
                                          onlineCashDifference < 0 ? 'text-red-600' : 
                                          'text-gray-900'
                                        }`}
                                      >
                                        ₹{onlineCashDifference.toFixed(2)}
                                        <Eye className="h-3 w-3 opacity-60" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Click to view details</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="text-center min-w-[100px]">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <div className="cursor-pointer hover:scale-105 transition-transform duration-200">
                                      {entry.isVerified ? (
                                        <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-200 flex items-center gap-1">
                                          <CheckCircle className="h-3 w-3" />
                                          Verified
                                        </Badge>
                                      ) : (() => {
                                        // Check for opening and closing entries for this date
                                        const openingEntry = cashRegistryData.find(registryEntry => {
                                          const entryDate = toDateStringIST(registryEntry.date)
                                          return entryDate === entry.date && registryEntry.shiftType === 'opening'
                                        })
                                        
                                        const closingEntry = cashRegistryData.find(registryEntry => {
                                          const entryDate = toDateStringIST(registryEntry.date)
                                          return entryDate === entry.date && registryEntry.shiftType === 'closing'
                                        })
                                        
                                        // Determine the current stage
                                        let statusText = "Click to Verify"
                                        let statusColor = "bg-blue-100 text-blue-800 hover:bg-blue-200"
                                        
                                        if (!openingEntry) {
                                          statusText = "Opening Balance Required"
                                          statusColor = "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                                        } else if (!closingEntry) {
                                          statusText = "Closing Balance Required"
                                          statusColor = "bg-red-100 text-red-800 hover:bg-red-200"
                                        }
                                        
                                        return (
                                          <Badge 
                                            variant="secondary" 
                                            className={`${statusColor} flex items-center gap-1 cursor-pointer transition-colors`}
                                            onClick={async (e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              
                                              // Only allow verification if both opening and closing entries exist
                                              if (!openingEntry || !closingEntry) {
                                                return
                                              }
                                              
                                              // Match the summary row (live sales); server re-computes ledger on verify.
                                              const hasCashDifference = entry.cashDifference !== 0
                                              const hasOnlineDifference = entry.onlineCashDifference !== 0
                                              
                                              if (hasCashDifference || hasOnlineDifference) {
                                                // Has differences - open modal to collect reasons
                                                setSelectedClosingEntry(closingEntry)
                                                onVerificationModalChange(true)
                                              } else {
                                                // No differences - verify immediately
                                                try {
                                                  await handleVerification({
                                                    entryId: closingEntry.id,
                                                    balanceDifferenceReason: undefined,
                                                    onlinePosDifferenceReason: undefined,
                                                  })
                                                  toast({
                                                    title: "Verified Successfully",
                                                    description: "Entry verified with no differences found.",
                                                  })
                                                } catch (error) {
                                                  console.error("Verification failed:", error)
                                                  toast({
                                                    title: "Verification Failed",
                                                    description: "An error occurred during verification. Please try again.",
                                                    variant: "destructive"
                                                  })
                                                }
                                              }
                                            }}
                                          >
                                            <CheckCircle className="h-3 w-3" />
                                            {statusText}
                                          </Badge>
                                        )
                                      })()}
                                    </div>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-64 p-3">
                                    <div className="space-y-2">
                                      <div className="font-medium text-sm flex items-center gap-2">
                                        {entry.isVerified ? (
                                          <>
                                            <CheckCircle className="h-4 w-4 text-green-600" />
                                            Verification Details
                                          </>
                                        ) : (
                                          <>
                                            <CheckCircle className="h-4 w-4 text-blue-600" />
                                            Verification Required
                                          </>
                                        )}
                                      </div>
                                      {entry.isVerified ? (
                                        <>
                                          <div className="text-xs text-muted-foreground">
                                            <span className="font-medium">Verified by:</span> {entry.verifiedBy || 'Unknown'}
                                          </div>
                                        </>
                                      ) : (
                                        <div className="text-xs text-muted-foreground">
                                          This daily summary requires verification. Click the "Click to Verify" button to open the verification modal and provide reasons for any differences.
                                        </div>
                                      )}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </TableCell>
                                                              <TableCell className="text-center min-w-[80px]">
                                <div className="flex items-center justify-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteDailySummary(entry)}
                                    className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-red-50 transition-all duration-200 rounded-xl hover:shadow-md transform hover:scale-105"
                                    title="Delete daily summary"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        }
                        return null
                      } else {
                        // ACTIVITY REPORT - Show separate rows for opening and closing activities
                        // Type guard to ensure this is a CashRegistryEntry
                        if ('id' in entry) {
                          const rows = []
                          
                          // Add opening balance row if it exists
                          if (entry.openingBalance > 0) {
                            rows.push(
                              <TableRow key={`${entry.id}-opening`}>
                                <TableCell className="font-medium">
                                  {entry.createdAt
                                    ? format(new Date(entry.createdAt), "dd MMM yyyy, h:mm a")
                                    : format(new Date(entry.date), "dd MMM yyyy")}
                                </TableCell>
                                <TableCell>{entry.createdBy}</TableCell>
                                <TableCell>
                                  <Badge variant="default">Opening Shift</Badge>
                                </TableCell>
                                <TableCell className="font-medium text-right">
                                  ₹{entry.openingBalance.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  {entry.denominations && entry.denominations.length > 0 ? (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      onClick={() => handleViewDenominations(entry, "opening")}
                                      className="h-auto p-0 text-blue-600 hover:text-blue-800"
                                    >
                                      View
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteEntry(entry)}
                                    disabled={entry.isVerified && user?.role !== 'admin'}
                                    className={`h-9 w-9 p-0 transition-all duration-200 rounded-xl ${
                                      entry.isVerified && user?.role !== 'admin'
                                        ? 'text-muted-foreground cursor-not-allowed opacity-50' 
                                        : entry.isVerified && user?.role === 'admin'
                                        ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50 hover:shadow-md transform hover:scale-105'
                                        : 'text-destructive hover:text-destructive hover:bg-red-50 hover:shadow-md transform hover:scale-105'
                                    }`}
                                    title={
                                      entry.isVerified && user?.role !== 'admin'
                                        ? "Cannot delete verified entry (Admin only)"
                                        : entry.isVerified && user?.role === 'admin'
                                        ? "Delete verified entry (Admin override)"
                                        : "Delete entry"
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          }
                          
                          // Add closing balance row if it exists
                          if (entry.closingBalance > 0) {
                            rows.push(
                              <TableRow key={`${entry.id}-closing`}>
                                <TableCell className="font-medium">
                                  {entry.createdAt
                                    ? format(new Date(entry.createdAt), "dd MMM yyyy, h:mm a")
                                    : format(new Date(entry.date), "dd MMM yyyy")}
                                </TableCell>
                                <TableCell>{entry.createdBy}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary">Closing Shift</Badge>
                                </TableCell>
                                <TableCell className="font-medium text-right">
                                  ₹{entry.closingBalance.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  {entry.denominations && entry.denominations.length > 0 ? (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      onClick={() => handleViewDenominations(entry, "closing")}
                                      className="h-auto p-0 text-blue-600 hover:text-blue-800"
                                    >
                                      View
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteEntry(entry)}
                                    disabled={entry.isVerified && user?.role !== 'admin'}
                                    className={`h-9 w-9 p-0 transition-all duration-200 rounded-xl ${
                                      entry.isVerified && user?.role !== 'admin'
                                        ? 'text-muted-foreground cursor-not-allowed opacity-50' 
                                        : entry.isVerified && user?.role === 'admin'
                                        ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50 hover:shadow-md transform hover:scale-105'
                                        : 'text-destructive hover:text-destructive hover:bg-red-50 hover:shadow-md transform hover:scale-105'
                                    }`}
                                    title={
                                      entry.isVerified && user?.role !== 'admin'
                                        ? "Cannot delete verified entry (Admin only)"
                                        : entry.isVerified && user?.role === 'admin'
                                        ? "Delete verified entry (Admin override)"
                                        : "Delete entry"
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          }
                          
                          return rows
                        }
                        return null
                      }
                    }).flat().filter(Boolean)
                  )}
                </TableBody>
              </Table>
                </div>
            </div>

      {/* Add Entry Modal */}
      <CashRegistryModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        onSaveSuccess={fetchCashRegistryData}
        onlineSalesAmount={getTodayOnlineSales()}
        onPosCashChange={() => {}}
      />

      {/* Denominations Modal */}
      <Dialog open={isDenominationsModalOpen} onOpenChange={setIsDenominationsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Denominations Details</DialogTitle>
            <DialogDescription>
              {selectedDenominationsEntry && (
                <span>
                  {selectedDenominationsType === "opening" ? "Opening" : "Closing"} shift denominations for{" "}
                  {format(new Date(selectedDenominationsEntry.date), "dd MMM yyyy")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedDenominationsEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 bg-muted/30 border rounded-lg overflow-hidden">
                <div className="px-3 py-2 font-semibold text-sm border-r">Value (₹)</div>
                <div className="px-3 py-2 font-semibold text-sm border-r">Count</div>
                <div className="px-3 py-2 font-semibold text-sm">Total (₹)</div>
              </div>
              
              {selectedDenominationsType === "opening" ? (
                selectedDenominationsEntry.denominations && selectedDenominationsEntry.denominations.length > 0 ? (
                  selectedDenominationsEntry.denominations.map((denom, index) => (
                    <div key={denom.value} className={`grid grid-cols-3 border-b last:border-b-0 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                      <div className="px-3 py-2">₹{denom.value}</div>
                      <div className="px-3 py-2">{denom.count}</div>
                      <div className="px-3 py-2 font-medium">₹{denom.total.toFixed(2)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground">No denominations recorded</div>
                )
              ) : (
                selectedDenominationsEntry.denominations && selectedDenominationsEntry.denominations.length > 0 ? (
                  selectedDenominationsEntry.denominations.map((denom, index) => (
                    <div key={denom.value} className={`grid grid-cols-3 border-b last:border-b-0 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                      <div className="px-3 py-2">₹{denom.value}</div>
                      <div className="px-3 py-2">{denom.count}</div>
                      <div className="px-3 py-2 font-medium">₹{denom.total.toFixed(2)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground">No denominations recorded</div>
                )
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDenominationsModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Entry Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cash Registry Entry Details</DialogTitle>
            <DialogDescription>
              Detailed view of the cash registry entry
            </DialogDescription>
          </DialogHeader>
          
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Date</Label>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedEntry.date), "MMM dd, yyyy")}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Shift Type</Label>
                  <div className="mt-1">{getShiftBadge(selectedEntry.shiftType)}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Created By</Label>
                  <p className="text-sm text-muted-foreground">{selectedEntry.createdBy}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedEntry.status, selectedEntry.isVerified)}</div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Denominations</Label>
                <div className="border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-3 bg-muted/30 border-b">
                    <div className="px-3 py-2 font-semibold text-sm">Value (₹)</div>
                    <div className="px-3 py-2 font-semibold text-sm">Count</div>
                    <div className="px-3 py-2 font-semibold text-sm">Total (₹)</div>
                  </div>
                  {selectedEntry.denominations.map((denom, index) => (
                    <div key={denom.value} className={`grid grid-cols-3 border-b last:border-b-0 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                      <div className="px-3 py-2">₹{denom.value}</div>
                      <div className="px-3 py-2">{denom.count}</div>
                      <div className="px-3 py-2 font-medium">₹{denom.total.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Total Balance</Label>
                  <p className="text-lg font-bold text-primary">
                    ₹{selectedEntry.totalBalance.toFixed(2)}
                  </p>
                </div>
                {selectedEntry.shiftType === "closing" && (
                  <>
                    <div>
                      <Label className="text-sm font-medium">Online Cash</Label>
                      <p className="text-sm text-muted-foreground">
                        ₹{selectedEntry.onlineCash.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">POS Cash</Label>
                      <p className="text-sm text-muted-foreground">
                        ₹{selectedEntry.posCash.toFixed(2)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isDeletingDailySummary ? "Delete Daily Summary" : "Delete Cash Registry Entry"}
            </DialogTitle>
            <DialogDescription>
              {isDeletingDailySummary 
                ? `Are you sure you want to delete the daily summary for ${selectedSummaryDate ? format(new Date(selectedSummaryDate), "MMM dd, yyyy") : "this date"}? This will delete all cash registry entries for that date and cannot be undone.`
                : selectedEntry?.isVerified 
                  ? `⚠️ WARNING: You are about to delete a VERIFIED cash registry entry. This action cannot be undone and may affect your financial records. Are you sure you want to proceed?`
                  : "Are you sure you want to delete this cash registry entry? This action cannot be undone."
              }
            </DialogDescription>
          </DialogHeader>
          
          {selectedEntry && (
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
              {isDeletingDailySummary ? (
                // Daily Summary Deletion Info
                <div className="space-y-3">
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800 font-medium">
                      🗑️ Daily Summary Deletion
                    </p>
                    <p className="text-sm text-red-700 mt-1">
                      This will delete ALL cash registry entries (opening and closing shifts) for the selected date.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Date:</span>
                      <p className="text-muted-foreground">
                        {selectedSummaryDate ? format(new Date(selectedSummaryDate), "MMM dd, yyyy") : "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium">Entries to Delete:</span>
                      <p className="text-muted-foreground">
                        {selectedSummaryDate ? cashRegistryData.filter(entry => {
                          const entryDate = toDateStringIST(entry.date)
                          return entryDate === selectedSummaryDate
                        }).length : 0} entries
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                // Regular Entry Deletion Info
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Date:</span>
                      <p className="text-muted-foreground">
                        {format(new Date(selectedEntry.date), "MMM dd, yyyy")}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium">Created By:</span>
                      <p className="text-muted-foreground">{selectedEntry.createdBy}</p>
                    </div>
                    <div>
                      <span className="font-medium">Opening Balance:</span>
                      <p className="text-muted-foreground">
                        {selectedEntry.openingBalance > 0 ? `₹${selectedEntry.openingBalance.toFixed(2)}` : "Not set"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium">Closing Balance:</span>
                      <p className="text-muted-foreground">
                        {selectedEntry.closingBalance > 0 ? `₹${selectedEntry.closingBalance.toFixed(2)}` : "Not set"}
                      </p>
                    </div>
                  </div>
                  
                  {/* Show deletion warning for records with both shifts */}
                  {selectedEntry.openingBalance > 0 && selectedEntry.closingBalance > 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        ⚠️ This record contains both opening and closing data. 
                        Deleting will remove the entire record. Consider editing instead to modify specific shift data.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : (isDeletingDailySummary ? "Delete Daily Summary" : "Delete Entry")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Modal */}
      <VerificationModal 
        isOpen={isVerificationModalOpen}
        onClose={() => {
          onVerificationModalChange(false)
          setSelectedClosingEntry(null)
        }}
        onVerify={handleVerification}
        closingEntry={selectedClosingEntry || todayClosingEntry || null}
        cashDifference={verificationModalCashDifference}
        onlineCashDifference={verificationModalOnlineDifference}
      />

      {/* Cash Difference Breakdown Drawer */}
      <CashDifferenceBreakdownDrawer
        open={breakdownDrawerOpen}
        onOpenChange={setBreakdownDrawerOpen}
        entry={breakdownEntry}
        onAddEditReason={() => {
          setBreakdownDrawerOpen(false)
          setAddEditReasonModalOpen(true)
        }}
      />

      {/* Add/Edit Reason Modal */}
      {breakdownEntry && (
        <AddEditReasonModal
          open={addEditReasonModalOpen}
          onOpenChange={setAddEditReasonModalOpen}
          type={breakdownEntry.type}
          difference={breakdownEntry.difference}
          closingEntryId={breakdownEntry.closingEntryId}
          existingReason={breakdownEntry.reason}
          existingNote={breakdownEntry.note}
          onSuccess={() => {
            fetchCashRegistryData(true)
          }}
        />
      )}
    </div>
  )
}
