"use client"

import { useState, useEffect } from "react"
import { Search, Download, Filter, Receipt, DollarSign, TrendingUp, MoreHorizontal, Eye, Pencil, Trash2, FileText, FileSpreadsheet, ChevronDown, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format } from "date-fns"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExpensesAPI, CashRegistryAPI, PettyCashAPI } from "@/lib/api"
import { ExpenseForm } from "@/components/expenses/expense-form"
import { useToast } from "@/hooks/use-toast"
import { useFeature } from "@/hooks/use-entitlements"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"

interface ExpenseRecord {
  id: string
  category: string
  description: string
  amount: number
  paymentMethod: string
  date: string
  staffName?: string
  notes?: string
  vendor?: string
}

type DatePeriod = "today" | "yesterday" | "last7days" | "last30days" | "currentMonth" | "all"

export function ExpenseReport() {
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  const [searchTerm, setSearchTerm] = useState("")
  const [datePeriod, setDatePeriod] = useState<DatePeriod>("today")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all")
  const [expensesData, setExpensesData] = useState<ExpenseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [pettyCashBalance, setPettyCashBalance] = useState<number | null>(null)
  const [isAddPettyCashOpen, setIsAddPettyCashOpen] = useState(false)
  const [isViewLogsOpen, setIsViewLogsOpen] = useState(false)
  const [addPettyCashAmount, setAddPettyCashAmount] = useState("")
  const [addPettyCashDate, setAddPettyCashDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [pettyCashLogs, setPettyCashLogs] = useState<{ type: string; amount: number; date: string }[]>([])
  const [pettyCashLogsLoading, setPettyCashLogsLoading] = useState(false)

  const fetchExpenses = async () => {
    setLoading(true)
    try {
      const res = await ExpensesAPI.getAll()
      const apiData = res.data || []
        const mapped = apiData.map((expense: any) => ({
          id: expense._id,
          category: expense.category,
          description: expense.description,
          amount: expense.amount,
          paymentMethod: expense.paymentMode || expense.paymentMethod || '',
          date: expense.date,
          staffName: expense.staffName,
          notes: expense.notes,
          vendor: expense.vendor,
        }))
      setExpensesData(mapped)
    } catch (err) {
      setExpensesData([])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchExpenses()
  }, [])

  const fetchPettyCash = async () => {
    try {
      const today = format(new Date(), "yyyy-MM-dd")
      const res = await CashRegistryAPI.getPettyCashSummary(today)
      if (res.success && res.data) {
        setPettyCashBalance(res.data.expectedBalance)
      } else {
        setPettyCashBalance(null)
      }
    } catch {
      setPettyCashBalance(null)
    }
  }

  useEffect(() => {
    fetchPettyCash()
  }, [expensesData])

  const handleAddPettyCash = async () => {
    const amt = parseFloat(addPettyCashAmount)
    if (!amt || amt <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid amount.", variant: "destructive" })
      return
    }
    try {
      const res = await PettyCashAPI.addBalance(amt, addPettyCashDate)
      if (res.success) {
        toast({ title: "Success", description: `₹${amt.toFixed(2)} added to petty cash.` })
        setIsAddPettyCashOpen(false)
        setAddPettyCashAmount("")
        setAddPettyCashDate(format(new Date(), "yyyy-MM-dd"))
        fetchPettyCash()
      } else {
        throw new Error(res.error)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error || (err as Error)?.message || "Failed to add petty cash"
      toast({ title: "Error", description: String(msg), variant: "destructive" })
    }
  }

  const handleOpenViewLogs = async () => {
    setIsViewLogsOpen(true)
    setPettyCashLogsLoading(true)
    try {
      const res = await PettyCashAPI.getLogs()
      if (res.success && res.data) {
        setPettyCashLogs(res.data)
      } else {
        setPettyCashLogs([])
      }
    } catch {
      setPettyCashLogs([])
    } finally {
      setPettyCashLogsLoading(false)
    }
  }

  useEffect(() => {
    const handler = () => fetchExpenses()
    window.addEventListener('expense-added', handler)
    return () => window.removeEventListener('expense-added', handler)
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
  }

  // Filter expenses based on search and filters
  const filteredData = expensesData.filter((expense) => {
    const matchesSearch = 
      expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.staffName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.paymentMethod.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = categoryFilter === "all" || expense.category === categoryFilter
    const matchesPaymentMethod = paymentMethodFilter === "all" || expense.paymentMethod === paymentMethodFilter
    
    // Date range filtering
    const expenseDate = new Date(expense.date)
    const dateRange = getDateRangeFromPeriod(datePeriod)
    const matchesDateRange = 
      (!dateRange.from || expenseDate >= dateRange.from) &&
      (!dateRange.to || expenseDate <= dateRange.to)
    
    return matchesSearch && matchesCategory && matchesPaymentMethod && matchesDateRange
  })

  // Calculate statistics
  const stats = {
    totalExpenses: filteredData.reduce((sum, expense) => sum + expense.amount, 0),
    totalCount: filteredData.length,
    averageExpense: filteredData.length > 0 ? filteredData.reduce((sum, expense) => sum + expense.amount, 0) / filteredData.length : 0
  }

  const handleExportPDF = async () => {
    toast({ title: "Export requested", description: "Generating expense report PDF...", duration: 3000 })
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
      
      const result = await ReportsAPI.exportExpenses('pdf', {
        dateFrom: dateFrom?.toISOString(),
        dateTo: dateTo?.toISOString(),
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        paymentMethod: paymentMethodFilter !== 'all' ? paymentMethodFilter : undefined
      });
      
      if (result && result.success) {
        toast({
          title: "Export Successful",
          description: result.message || "Expense report has been generated and sent to admin email(s)",
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
    toast({ title: "Export requested", description: "Generating expense report Excel...", duration: 3000 })
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
      
      const result = await ReportsAPI.exportExpenses('xlsx', {
        dateFrom: dateFrom?.toISOString(),
        dateTo: dateTo?.toISOString(),
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        paymentMethod: paymentMethodFilter !== 'all' ? paymentMethodFilter : undefined
      });
      
      if (result && result.success) {
        toast({
          title: "Export Successful",
          description: result.message || "Expense report has been generated and sent to admin email(s)",
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

  const handleViewExpense = (expense: ExpenseRecord) => {
    setSelectedExpense(expense)
    setIsViewDialogOpen(true)
  }

  const handleEditExpense = (expense: ExpenseRecord) => {
    setSelectedExpense(expense)
    setIsEditDialogOpen(true)
  }

  const handleDeleteExpense = (expense: ExpenseRecord) => {
    setSelectedExpense(expense)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedExpense) return
    
    try {
      console.log("Deleting expense:", selectedExpense.description)
      
      // Call the API to delete the expense from the database
      const response = await ExpensesAPI.delete(selectedExpense.id)
      
      if (response.success) {
        // Remove from local state only after successful API call
        setExpensesData(prev => prev.filter(expense => expense.id !== selectedExpense.id))
        setIsDeleteDialogOpen(false)
        setSelectedExpense(null)
        
        toast({
          title: "Expense Deleted",
          description: `Expense record for ${selectedExpense.description} has been successfully deleted.`,
        })
        
        console.log("Expense deleted successfully")
      } else {
        console.error("Failed to delete expense:", response.error)
        toast({
          title: "Error",
          description: "Failed to delete expense record. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to delete expense:", error)
      toast({
        title: "Error",
        description: "Failed to delete expense record. Please try again.",
        variant: "destructive",
      })
    }
  }

  const formatAmount = (amount: number) => {
    return `₹${amount.toFixed(2)}`
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
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
              <h3 className="text-lg font-medium text-slate-900 mb-2">Loading expenses...</h3>
              <p className="text-slate-500 text-sm">Please wait while we fetch your data</p>
            </div>
          </div>
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
                placeholder="Search expenses..."
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
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Supplies">Supplies</SelectItem>
                  <SelectItem value="Equipment">Equipment</SelectItem>
                  <SelectItem value="Utilities">Utilities</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Rent">Rent</SelectItem>
                  <SelectItem value="Insurance">Insurance</SelectItem>
                  <SelectItem value="Maintenance">Maintenance</SelectItem>
                  <SelectItem value="Professional Services">Professional Services</SelectItem>
                  <SelectItem value="Travel">Travel</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="Petty Cash Wallet">Petty Cash Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Total Expenses</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <Receipt className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">{formatAmount(stats.totalExpenses)}</div>
            <p className="text-sm text-gray-500">
              {datePeriod === "all" ? "All time" : `This ${datePeriod}`}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Total Count</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">{stats.totalCount}</div>
            <p className="text-sm text-gray-500">Expense records</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Average Expense</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <TrendingUp className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">{formatAmount(stats.averageExpense)}</div>
            <p className="text-sm text-gray-500">Per transaction</p>
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-gray-900">Petty Cash Balance</CardTitle>
            <div className="p-2 bg-gray-100 rounded-lg">
              <Wallet className="h-4 w-4 text-gray-600" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold text-gray-900">
              {pettyCashBalance !== null ? formatAmount(pettyCashBalance) : "—"}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <button type="button" onClick={() => setIsAddPettyCashOpen(true)} className="hover:underline hover:text-gray-700">
                Add Petty Cash
              </button>
              <span className="text-gray-400">·</span>
              <button type="button" onClick={handleOpenViewLogs} className="hover:underline hover:text-gray-700">
                View Logs
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expense Table – same layout as Service List / Sales */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-slate-200">
                <TableHead className="font-semibold text-slate-800">Category</TableHead>
                <TableHead className="font-semibold text-slate-800">Vendor</TableHead>
                <TableHead className="font-semibold text-slate-800">Amount</TableHead>
                <TableHead className="font-semibold text-slate-800">Payment Method</TableHead>
                <TableHead className="font-semibold text-slate-800">Transaction Id</TableHead>
                <TableHead className="font-semibold text-slate-800">Description</TableHead>
                <TableHead className="font-semibold text-slate-800">Date</TableHead>
                <TableHead className="font-semibold text-slate-800">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                    No expenses found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((expense) => (
                  <TableRow key={expense.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        {expense.category}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-slate-800" title={expense.vendor || ''}>
                      {expense.vendor || '—'}
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-red-700">{formatAmount(expense.amount)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {expense.paymentMethod}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600 font-mono text-sm">{expense.notes || '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-slate-800" title={expense.description}>
                      {expense.description}
                    </TableCell>
                    <TableCell className="text-slate-600">{format(new Date(expense.date), 'MMM dd, yyyy')}</TableCell>
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
                            <DropdownMenuItem onClick={() => handleViewExpense(expense)} className="hover:bg-blue-50">
                              <Eye className="mr-2 h-4 w-4 text-blue-600" />
                              <span className="text-slate-700">View Details</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditExpense(expense)} className="hover:bg-amber-50">
                              <Pencil className="mr-2 h-4 w-4 text-amber-600" />
                              <span className="text-slate-700">Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDeleteExpense(expense)}
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

      {/* View Expense Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Expense Details</DialogTitle>
            <DialogDescription>
              Detailed view of the expense information
            </DialogDescription>
          </DialogHeader>
          {selectedExpense && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Category</label>
                  <p className="text-lg font-semibold">{selectedExpense.category}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Amount</label>
                  <p className="text-2xl font-bold text-red-600">{formatAmount(selectedExpense.amount)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Payment Method</label>
                  <p className="text-lg">{selectedExpense.paymentMethod}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Date</label>
                  <p className="text-lg">{format(new Date(selectedExpense.date), 'MMM dd, yyyy')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Vendor</label>
                  <p className="text-lg">{selectedExpense.vendor || '—'}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <p className="text-lg">{selectedExpense.description}</p>
                </div>
                {selectedExpense.staffName && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Staff</label>
                    <p className="text-lg">{selectedExpense.staffName}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Transaction Id</label>
                  <p className="text-lg">{selectedExpense.notes || '—'}</p>
                </div>
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

      {/* Edit Expense Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open)
        if (!open) setSelectedExpense(null)
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
            <DialogDescription>
              Update the expense details below.
            </DialogDescription>
          </DialogHeader>
          {selectedExpense && (
            <ExpenseForm
              key={selectedExpense.id}
              expense={{
                id: selectedExpense.id,
                category: selectedExpense.category,
                description: selectedExpense.description,
                amount: selectedExpense.amount,
                paymentMode: selectedExpense.paymentMethod,
                paymentMethod: selectedExpense.paymentMethod,
                date: selectedExpense.date,
                notes: selectedExpense.notes,
                vendor: selectedExpense.vendor,
              }}
              isEditMode={true}
              onClose={() => {
                setIsEditDialogOpen(false)
                setSelectedExpense(null)
                fetchExpenses()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Expense Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the expense record for {selectedExpense?.description}? 
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

      {/* Add Petty Cash Dialog */}
      <Dialog open={isAddPettyCashOpen} onOpenChange={setIsAddPettyCashOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Petty Cash</DialogTitle>
            <DialogDescription>
              Add amount to the petty cash balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={addPettyCashAmount}
                  onChange={(e) => setAddPettyCashAmount(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={addPettyCashDate}
                onChange={(e) => setAddPettyCashDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddPettyCashOpen(false)}>Cancel</Button>
            <Button onClick={handleAddPettyCash}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Petty Cash Logs Dialog */}
      <Dialog open={isViewLogsOpen} onOpenChange={setIsViewLogsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Petty Cash Logs</DialogTitle>
            <DialogDescription>
              History of petty cash additions and deductions.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {pettyCashLogsLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
            ) : pettyCashLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No logs yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pettyCashLogs.map((log, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant={log.type === "add" ? "default" : "secondary"}>
                          {log.type === "add" ? "Added" : "Deducted"}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono ${log.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {log.amount >= 0 ? "+" : ""}{formatAmount(log.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(log.date), "MMM dd, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
