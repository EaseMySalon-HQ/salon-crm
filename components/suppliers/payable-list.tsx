"use client"

import * as React from "react"
import { CreditCard, History, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { SupplierPayablesAPI, SuppliersAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { PaymentModal } from "./payment-modal"
import { PaymentHistoryDrawer } from "./payment-history-drawer"

interface PayableListProps {
  onRefresh?: () => void
}

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
]

export function PayableList({ onRefresh }: PayableListProps) {
  const [payables, setPayables] = React.useState<any[]>([])
  const [suppliers, setSuppliers] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [supplierFilter, setSupplierFilter] = React.useState("all")
  const [paymentPayable, setPaymentPayable] = React.useState<any | null>(null)
  const [historyPayable, setHistoryPayable] = React.useState<any | null>(null)
  const { toast } = useToast()

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true)
      const [payablesRes, suppliersRes] = await Promise.all([
        SupplierPayablesAPI.getAll({
          status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
          supplier: supplierFilter && supplierFilter !== "all" ? supplierFilter : undefined,
        }),
        SuppliersAPI.getAll({ activeOnly: true }),
      ])
      if (payablesRes.success) setPayables(payablesRes.data || [])
      if (suppliersRes.success) setSuppliers(suppliersRes.data || [])
    } catch (err) {
      console.error(err)
      toast({ title: "Error", description: "Failed to load payables", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, supplierFilter, toast])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handlePaymentSuccess = () => {
    setPaymentPayable(null)
    loadData()
    onRefresh?.()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s._id} value={s._id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Paid On</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payables.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No payables found.
                  </TableCell>
                </TableRow>
              ) : (
                payables.map((p) => {
                  const balance = p.balanceDue ?? Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0))
                  const canPay = balance > 0
                  return (
                    <TableRow key={p._id}>
                      <TableCell className="font-medium">
                        {p.supplierId?.name || "-"}
                      </TableCell>
                      <TableCell>{p.purchaseOrderId?.poNumber || "-"}</TableCell>
                      <TableCell className="text-right">
                        ₹{(p.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{(p.amountPaid || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        {balance > 0 ? (
                          <span className="text-amber-600 font-medium">
                            ₹{balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {p.paidOn ? format(new Date(p.paidOn), "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell>
                        {p.dueDate ? format(new Date(p.dueDate), "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.status === "paid"
                              ? "default"
                              : p.status === "partial"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {canPay && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPaymentPayable(p)}
                            >
                              <CreditCard className="h-4 w-4 mr-1" />
                              Pay
                            </Button>
                          )}
                          {(p.amountPaid || 0) > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setHistoryPayable(p)}
                              title="View payment history"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {paymentPayable && (
        <PaymentModal
          open={!!paymentPayable}
          onOpenChange={(o) => { if (!o) setPaymentPayable(null) }}
          payable={paymentPayable}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {historyPayable && (
        <PaymentHistoryDrawer
          payable={historyPayable}
          open={!!historyPayable}
          onOpenChange={(o) => { if (!o) setHistoryPayable(null) }}
        />
      )}
    </div>
  )
}
