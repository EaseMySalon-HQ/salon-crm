"use client"

import { useState, useEffect } from "react"
import { Search, Download, Filter, TrendingUp, DollarSign, Users, MoreHorizontal, Eye, Pencil, Trash2, Receipt, AlertCircle, FileText, FileSpreadsheet, ChevronDown } from "lucide-react"
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
import { SalesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { useFeature } from "@/hooks/use-entitlements"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"

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
  netTotal: number
  taxAmount: number
  grossTotal: number
  status: "completed" | "partial" | "unpaid" | "cancelled"
  staffName: string
}

type DatePeriod = "today" | "yesterday" | "last7days" | "last30days" | "currentMonth" | "all"

export function SalesReport() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("today")
  const [paymentFilter, setPaymentFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [salesData, setSalesData] = useState<SalesRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBill, setSelectedBill] = useState<SalesRecord | null>(null)
  const [isBillDialogOpen, setIsBillDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<SalesRecord | null>(null)

  // Function to navigate to receipt page
  const handleViewReceipt = (sale: SalesRecord) => {
    router.push(`/receipt/${sale.billNo}`)
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
            netTotal: sale.netTotal,
            taxAmount: sale.taxAmount,
            grossTotal: sale.grossTotal,
            status: sale.status,
            staffName: sale.staffName,
            items: sale.items || [],
          }
          console.log(`📋 Mapped sale ${sale.billNo}:`, {
            paymentMode: mappedSale.paymentMode,
            payments: mappedSale.payments,
            hasPayments: !!mappedSale.payments.length
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
      case "all":
      default:
        return { from: undefined, to: undefined }
    }
  }

  // Handle date period change
  const handleDatePeriodChange = (period: DatePeriod) => {
    setDatePeriod(period)
    if (period !== "all") {
      const newDateRange = getDateRangeFromPeriod(period)
      setDateRange(newDateRange)
    } else {
      setDateRange({})
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
    
    // Date range filtering
    const saleDate = new Date(sale.date)
    const matchesDateRange = 
      (!dateRange.from || saleDate >= dateRange.from) &&
      (!dateRange.to || saleDate <= dateRange.to)
    
    return matchesSearch && matchesPayment && matchesStatus && matchesDateRange
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

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF()
      
      // Add title
      doc.setFontSize(20)
      doc.text("Sales Report", 14, 22)
      
      // Add date range
      doc.setFontSize(12)
      const dateRangeText = datePeriod === "all" 
        ? "All Time"
        : `${datePeriod.charAt(0).toUpperCase() + datePeriod.slice(1)}`
      doc.text(`Period: ${dateRangeText}`, 14, 32)
      
      // Add filters
      doc.text(`Payment Filter: ${paymentFilter === "all" ? "All Payments" : paymentFilter}`, 14, 42)
      doc.text(`Status Filter: ${statusFilter === "all" ? "All Status" : statusFilter}`, 14, 52)
      
      // Add generation date
      doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy 'at' h:mm a")}`, 14, 62)
      
      // Add summary stats
      doc.setFontSize(14)
      doc.text("Summary", 14, 80)
      doc.setFontSize(10)
      doc.text(`Total Revenue: ₹${totalRevenue.toFixed(2)}`, 14, 90)
      doc.text(`Completed Sales: ${completedSales}`, 14, 100)
      doc.text(`Partial Sales: ${partialSales}`, 14, 110)
      doc.text(`Unpaid Sales: ${unpaidSales}`, 14, 120)
      doc.text(`Cash Collected: ₹${cashCollected.toFixed(2)}`, 14, 130)
      doc.text(`Online Collected: ₹${onlineCashCollected.toFixed(2)}`, 14, 140)
      
      let yPosition = 160
      
      if (filteredSales.length === 0) {
        doc.setFontSize(14)
        doc.text("No sales data available", 14, yPosition)
      } else {
        // Sales table headers
        const headers = [
          "Bill No.",
          "Customer",
          "Date",
          "Status",
          "Payment Mode",
          "Net Total",
          "Tax Amount",
          "Gross Total",
          "Staff"
        ]
        
        const data = filteredSales.map(sale => [
          sale.billNo,
          sale.customerName,
          format(new Date(sale.date), "MMM dd, yyyy"),
          sale.status,
          getPaymentModeDisplay(sale),
          `₹${getFilteredAmount(sale).toFixed(2)}`,
          `₹${sale.taxAmount.toFixed(2)}`,
          `₹${getFilteredGrossTotal(sale).toFixed(2)}`,
          sale.staffName
        ])
        
        autoTable(doc, {
          head: [headers],
          body: data,
          startY: yPosition,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] }
        })
      }
      
      // Save the PDF
      const fileName = `sales-report-${datePeriod}-${format(new Date(), "yyyy-MM-dd")}.pdf`
      doc.save(fileName)
      
      toast({
        title: "Export Successful",
        description: `PDF exported as ${fileName}`,
      })
    } catch (error) {
      console.error("PDF export error:", error)
      toast({
        title: "Export Failed",
        description: "Failed to export PDF. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleExportXLS = () => {
    try {
      const data = filteredSales.map(sale => ({
        "Bill No.": sale.billNo,
        "Customer Name": sale.customerName,
        "Date": format(new Date(sale.date), "MMM dd, yyyy"),
        "Status": sale.status,
        "Payment Mode": getPaymentModeDisplay(sale),
        "Net Total": getFilteredAmount(sale),
        "Tax Amount": sale.taxAmount,
        "Gross Total": getFilteredGrossTotal(sale),
        "Staff Name": sale.staffName,
        "Payment Details": sale.payments ? JSON.stringify(sale.payments) : ""
      }))
      
      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Sales Report")
      
      // Add summary sheet
      const summaryData = [
        { Metric: "Total Revenue", Value: totalRevenue },
        { Metric: "Completed Sales", Value: completedSales },
        { Metric: "Partial Sales", Value: partialSales },
        { Metric: "Unpaid Sales", Value: unpaidSales },
        { Metric: "Cash Collected", Value: cashCollected },
        { Metric: "Online Collected", Value: onlineCashCollected },
        { Metric: "Period", Value: datePeriod === "all" ? "All Time" : datePeriod },
        { Metric: "Payment Filter", Value: paymentFilter === "all" ? "All Payments" : paymentFilter },
        { Metric: "Status Filter", Value: statusFilter === "all" ? "All Status" : statusFilter }
      ]
      
      const summaryWs = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")
      
      // Save the file
      const fileName = `sales-report-${datePeriod}-${format(new Date(), "yyyy-MM-dd")}.xlsx`
      XLSX.writeFile(wb, fileName)
      
      toast({
        title: "Export Successful",
        description: `Excel file exported as ${fileName}`,
      })
    } catch (error) {
      console.error("XLS export error:", error)
      toast({
        title: "Export Failed",
        description: "Failed to export Excel file. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleViewBill = (sale: SalesRecord) => {
    setSelectedBill(sale)
    setIsBillDialogOpen(true)
  }

  const handleEditSale = (sale: SalesRecord) => {
    setSelectedSale(sale)
    setIsEditDialogOpen(true)
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
      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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

      {/* Enhanced Filters and Actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
              {/* Search */}
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Search className="h-4 w-4 text-blue-600" />
                </div>
                <Input
                  placeholder="Search sales..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              
              {/* Date Period Dropdown */}
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
                </SelectContent>
              </Select>
              
              {/* Payment Method Filter */}
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
              
              {/* Status Filter */}
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
            </div>
            
            <div className="flex items-center space-x-3">
              <Button 
                onClick={() => router.push('/reports/unpaid-bills')}
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                View Unpaid Bills
              </Button>
              {canExport ? (
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

      {/* Enhanced Sales Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-semibold text-slate-800">Sales Records</h3>
              <p className="text-slate-600 text-sm mt-1">
                {paymentFilter === "all" 
                  ? "Detailed view of all sales transactions" 
                  : `Showing only ${paymentFilter} payments - amounts reflect ${paymentFilter} portion only`
                }
              </p>
            </div>
          </div>
          
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-slate-50 to-blue-50 hover:bg-gradient-to-r hover:from-slate-100 hover:to-blue-100">
                  <TableHead className="py-4 text-slate-700 font-semibold">Bill No.</TableHead>
                  <TableHead className="py-4 text-slate-700 font-semibold">Customer Name</TableHead>
                  <TableHead className="py-4 text-slate-700 font-semibold">Date</TableHead>
                  <TableHead className="py-4 text-slate-700 font-semibold">Status</TableHead>
                  <TableHead className="py-4 text-slate-700 font-semibold">Payment Mode</TableHead>
                  <TableHead className="py-4 text-slate-700 font-semibold">
                    Net Total
                    {paymentFilter !== "all" && (
                      <Badge variant="secondary" className="ml-2 text-xs bg-blue-100 text-blue-700 border-blue-200">
                        {paymentFilter} only
                      </Badge>
                    )}
                  </TableHead>
                  <TableHead className="py-4 text-slate-700 font-semibold">Tax Amount</TableHead>
                  <TableHead className="py-4 text-slate-700 font-semibold">
                    Gross Total
                    {paymentFilter !== "all" && (
                      <Badge variant="secondary" className="ml-2 text-xs bg-blue-100 text-blue-700 border-blue-200">
                        {paymentFilter} only
                      </Badge>
                    )}
                  </TableHead>
                  <TableHead className="py-4 text-slate-700 font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16">
                      <div className="flex flex-col items-center space-y-4">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                          <TrendingUp className="h-10 w-10 text-slate-400" />
                        </div>
                        <div className="text-center">
                          <h3 className="text-lg font-medium text-slate-900 mb-2">No sales records found</h3>
                          <p className="text-slate-500 text-sm">Try adjusting your filters or search terms</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSales.map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50 transition-all duration-200 border-b border-slate-100">
                      <TableCell className="py-4">
                        <Button
                          variant="link"
                          className="p-0 h-auto font-medium text-blue-600 hover:text-blue-800 hover:underline transition-all duration-200"
                          onClick={() => handleViewReceipt(sale)}
                        >
                          {sale.billNo}
                        </Button>
                      </TableCell>
                      <TableCell className="py-4 font-medium text-slate-800">{sale.customerName}</TableCell>
                      <TableCell className="py-4 text-slate-600">{new Date(sale.date).toLocaleDateString()}</TableCell>
                      <TableCell className="py-4">{getStatusBadge(sale.status)}</TableCell>
                      <TableCell className="py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {getPaymentModeDisplay(sale)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 font-semibold text-green-700">₹{getFilteredAmount(sale).toFixed(2)}</TableCell>
                      <TableCell className="py-4 text-slate-600">₹{sale.taxAmount.toFixed(2)}</TableCell>
                      <TableCell className="py-4 font-bold text-emerald-700">₹{getFilteredGrossTotal(sale).toFixed(2)}</TableCell>
                      <TableCell className="py-4">
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
                            <DropdownMenuItem onClick={() => handleEditSale(sale)} className="hover:bg-amber-50">
                              <Pencil className="mr-2 h-4 w-4 text-amber-600" />
                              <span className="text-slate-700">Edit</span>
                            </DropdownMenuItem>
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
    </div>
  )
}