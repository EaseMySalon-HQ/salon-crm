"use client"

import { useState, useEffect } from "react"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SalesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { PaymentCollectionModal } from "@/components/reports/payment-collection-modal"
import { 
  AlertCircle, 
  Clock, 
  DollarSign, 
  Search, 
  Filter, 
  TrendingUp,
  Eye,
  Receipt,
  Edit,
  RefreshCw
} from "lucide-react"
import { useRouter } from "next/navigation"

interface UnpaidBill {
  _id: string
  id?: string // Optional for backward compatibility
  billNo: string
  customerName: string
  customerPhone: string
  date: string
  grossTotal: number
  status: string
  paymentStatus: {
    totalAmount: number
    paidAmount: number
    remainingAmount: number
    dueDate: string
    lastPaymentDate?: string
    isOverdue: boolean
  }
  staffName: string
  isEdited?: boolean // Track if bill has been edited
}

export default function UnpaidBillsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [unpaidBills, setUnpaidBills] = useState<UnpaidBill[]>([])
  const [loading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState<UnpaidBill | null>(null)

  useEffect(() => {
    loadUnpaidBills()
  }, [])

  const loadUnpaidBills = async () => {
    setIsLoading(true)
    try {
      const response = await SalesAPI.getUnpaidBills()
      if (response.success) {
        setUnpaidBills(response.data)
      } else {
        toast({
          title: "Error",
          description: "Failed to load unpaid bills",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error loading unpaid bills:', error)
      toast({
        title: "Error",
        description: "Failed to load unpaid bills",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const filteredBills = unpaidBills.filter(bill => {
    const matchesSearch = bill.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         bill.billNo.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || bill.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const totalOutstanding = filteredBills.reduce((sum, bill) => sum + bill.paymentStatus.remainingAmount, 0)
  const overdueAmount = filteredBills
    .filter(bill => bill.paymentStatus.isOverdue)
    .reduce((sum, bill) => sum + bill.paymentStatus.remainingAmount, 0)

  const handleCollectPayment = (bill: UnpaidBill) => {
    setSelectedBill(bill)
    setIsPaymentModalOpen(true)
  }

  const handlePaymentCollected = () => {
    loadUnpaidBills() // Refresh the data
  }

  const handleViewReceipt = (bill: UnpaidBill) => {
    router.push(`/receipt/${bill.billNo}`)
  }

  const handleEditBill = (bill: UnpaidBill) => {
    router.push(`/billing/${bill.billNo}?mode=edit`)
  }

  const handleExchangeBill = (bill: UnpaidBill) => {
    router.push(`/billing/${bill.billNo}?mode=exchange`)
  }

  const handleExchangeComplete = () => {
    setIsExchangeDialogOpen(false)
    setBillForExchange(null)
    loadUnpaidBills() // Refresh the list
  }

  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (isOverdue) {
      return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Overdue</Badge>
    }
    
    switch (status) {
      case "Partial":
      case "partial":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Partial</Badge>
      case "Unpaid":
      case "unpaid":
        return <Badge className="bg-red-100 text-red-800 border-red-200">Unpaid</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">{status}</Badge>
    }
  }

  const getDaysOverdue = (dueDate: string) => {
    const due = new Date(dueDate)
    const today = new Date()
    const diffTime = today.getTime() - due.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }

  if (loading) {
    return (
      <ProtectedRoute requiredModule="reports">
        <ProtectedLayout requiredModule="reports">
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Loading unpaid bills...</p>
            </div>
          </div>
        </ProtectedLayout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute requiredModule="reports">
      <ProtectedLayout requiredModule="reports">
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Unpaid Bills Report</h1>
              <p className="text-slate-600 mt-2">
                Track outstanding payments and overdue bills
              </p>
            </div>
            <Button 
              onClick={() => router.push('/reports')}
              variant="outline"
              className="border-slate-200 hover:bg-slate-50"
            >
              Back to Reports
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <Card className="bg-gradient-to-br from-red-50 to-pink-100 border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Total Outstanding
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-900">₹{totalOutstanding.toFixed(2)}</div>
                <p className="text-xs text-red-600 mt-1">
                  From {filteredBills.length} bills
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-50 to-amber-100 border-orange-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-orange-800 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Overdue Amount
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-900">₹{overdueAmount.toFixed(2)}</div>
                <p className="text-xs text-orange-600 mt-1">
                  {filteredBills.filter(b => b.paymentStatus.isOverdue).length} overdue bills
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-cyan-100 border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-blue-800 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Collection Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-900">
                  {unpaidBills.length > 0 
                    ? Math.round(((unpaidBills.length - filteredBills.length) / unpaidBills.length) * 100)
                    : 0}%
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Bills collected today
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by customer name or bill number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bills Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <h3 className="text-xl font-semibold text-slate-800 mb-6">Outstanding Bills</h3>
            
            {filteredBills.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">No outstanding bills!</h3>
                <p className="text-slate-500 text-sm">All payments have been collected</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 border-b border-slate-200">
                      <TableHead className="py-4 text-slate-700 font-semibold">Bill No.</TableHead>
                      <TableHead className="py-4 text-slate-700 font-semibold">Customer</TableHead>
                      <TableHead className="py-4 text-slate-700 font-semibold">Due Date</TableHead>
                      <TableHead className="py-4 text-slate-700 font-semibold">Total Amount</TableHead>
                      <TableHead className="py-4 text-slate-700 font-semibold">Paid Amount</TableHead>
                      <TableHead className="py-4 text-slate-700 font-semibold">Remaining</TableHead>
                      <TableHead className="py-4 text-slate-700 font-semibold">Status</TableHead>
                      <TableHead className="py-4 text-slate-700 font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBills.map((bill) => (
                      <TableRow key={bill._id} className="hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50 transition-all duration-200 border-b border-slate-100">
                        <TableCell className="py-4">
                          <Button
                            variant="link"
                            className="p-0 h-auto font-medium text-blue-600 hover:text-blue-800 hover:underline transition-all duration-200"
                            onClick={() => handleViewReceipt(bill)}
                          >
                            {bill.billNo}
                            {(bill.isEdited === true || bill.editedAt) && <span className="text-xs text-gray-500 ml-1">(edited)</span>}
                          </Button>
                        </TableCell>
                        <TableCell className="py-4">
                          <div>
                            <div className="font-medium text-slate-800">{bill.customerName}</div>
                            {bill.customerPhone && (
                              <div className="text-sm text-slate-500">{bill.customerPhone}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="text-sm">
                            <div className="text-slate-800">
                              {new Date(bill.paymentStatus.dueDate).toLocaleDateString()}
                            </div>
                            {bill.paymentStatus.isOverdue && (
                              <div className="text-red-600 font-medium">
                                {getDaysOverdue(bill.paymentStatus.dueDate)} days overdue
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 font-semibold text-slate-800">
                          ₹{bill.paymentStatus.totalAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="py-4 text-green-700">
                          ₹{bill.paymentStatus.paidAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="py-4 font-bold text-red-700">
                          ₹{bill.paymentStatus.remainingAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="py-4">
                          {getStatusBadge(bill.status, bill.paymentStatus.isOverdue)}
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleCollectPayment(bill)}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <DollarSign className="h-4 w-4 mr-1" />
                              Collect
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditBill(bill)}
                              title="Edit Bill"
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleExchangeBill(bill)}
                              title="Exchange Products"
                              className="border-blue-200 text-blue-700 hover:bg-blue-50"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Exchange
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewReceipt(bill)}
                            >
                              <Receipt className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Collection Modal */}
      <PaymentCollectionModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false)
          setSelectedBill(null)
        }}
        sale={selectedBill}
        onPaymentCollected={handlePaymentCollected}
      />

    </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
