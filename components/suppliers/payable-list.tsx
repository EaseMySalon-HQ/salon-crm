"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { Input } from "@/components/ui/input"
import { SupplierPayablesAPI, SuppliersAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { format, startOfMonth, endOfMonth } from "date-fns"
import { PaymentModal } from "./payment-modal"
import { PaymentHistoryDrawer } from "./payment-history-drawer"

import { supplierPayableReferenceLabel } from "@/lib/supplier-payable-reference"
import { ListDateRangeToolbar, ListTableExportMenu } from "@/components/suppliers/list-date-range-export-toolbar"
import { buildDateRangeSubtitle, downloadTablePdf, downloadTableXlsx } from "@/lib/inventory-lists-export"

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
  const router = useRouter()
  const searchParams = useSearchParams()
  const payableIdFocus = searchParams.get("payableId")
  const [payables, setPayables] = React.useState<any[]>([])
  const [suppliers, setSuppliers] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [supplierFilter, setSupplierFilter] = React.useState("all")
  const [searchInput, setSearchInput] = React.useState("")
  const [searchApplied, setSearchApplied] = React.useState("")
  const [dateFrom, setDateFrom] = React.useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = React.useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"))
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
          search: searchApplied || undefined,
          dateFrom: dateFrom.trim() || undefined,
          dateTo: dateTo.trim() || undefined,
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
  }, [statusFilter, supplierFilter, searchApplied, dateFrom, dateTo, toast])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    if (!payableIdFocus || loading) return
    const want = String(payableIdFocus)
    const p = payables.find((x) => String(x._id) === want)
    const clearParam = () => {
      const params = new URLSearchParams(searchParams.toString())
      if (!params.has("payableId")) return
      params.delete("payableId")
      router.replace(`/settings?${params.toString()}`)
    }
    if (!p) {
      if (payables.length > 0) clearParam()
      return
    }
    const balance = p.balanceDue ?? Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0))
    if (balance > 0.005) setPaymentPayable(p)
    else setHistoryPayable(p)
    clearParam()
  }, [payableIdFocus, loading, payables, router, searchParams])

  const handlePaymentSuccess = () => {
    setPaymentPayable(null)
    loadData()
    onRefresh?.()
  }

  const exportSubtitle = buildDateRangeSubtitle(dateFrom, dateTo)
  const runExport = (exportKind: "pdf" | "xlsx") => {
    if (!payables.length) {
      toast({ title: "Nothing to export", description: "No rows match the current filters.", variant: "destructive" })
      return
    }
    const headers = ["Supplier", "Entry date", "Reference", "Total (₹)", "Paid (₹)", "Balance (₹)", "Paid on", "Due date", "Status"]
    const rows: (string | number)[][] = payables.map((p) => {
      const balance = p.balanceDue ?? Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0))
      return [
        p.supplierId?.name || "",
        p.createdAt ? format(new Date(p.createdAt), "dd MMM yyyy") : "",
        supplierPayableReferenceLabel(p),
        p.totalAmount ?? 0,
        p.amountPaid ?? 0,
        balance,
        p.paidOn ? format(new Date(p.paidOn), "dd MMM yyyy") : "",
        p.dueDate ? format(new Date(p.dueDate), "dd MMM yyyy") : "",
        p.status || "",
      ]
    })
    const base = `supplier-payables-${format(new Date(), "yyyy-MM-dd-HHmm")}`
    if (exportKind === "xlsx") {
      downloadTableXlsx(base, "Payables", headers, rows)
      toast({ title: "Download started", description: "Excel file saved." })
    } else {
      downloadTablePdf("Supplier payables", exportSubtitle, base, headers, rows, true)
      toast({ title: "Download started", description: "PDF saved." })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex w-full flex-wrap items-end justify-between gap-3 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          <Input
            placeholder="Search by reference (Enter)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearchApplied(searchInput.trim())
            }}
            className="w-full sm:w-64"
          />
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
          <ListDateRangeToolbar
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            disabled={loading}
          />
        </div>
        <ListTableExportMenu
          onExportPdf={() => runExport("pdf")}
          onExportXlsx={() => runExport("xlsx")}
          disabled={loading}
        />
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
                <TableHead>Entry Date</TableHead>
                <TableHead>Reference</TableHead>
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
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
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
                      <TableCell>
                        {p.createdAt ? format(new Date(p.createdAt), "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell>{supplierPayableReferenceLabel(p)}</TableCell>
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
