"use client"

import * as React from "react"
import { Plus, Eye, Package, XCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { PurchaseOrdersAPI, SuppliersAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { PODetailDrawer } from "./po-detail-drawer"
import { POForm } from "./po-form"

interface POListProps {
  onRefresh?: () => void
}

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "ordered", label: "Ordered" },
  { value: "partially_received", label: "Partially Received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
]

export function POList({ onRefresh }: POListProps) {
  const [orders, setOrders] = React.useState<any[]>([])
  const [suppliers, setSuppliers] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [supplierFilter, setSupplierFilter] = React.useState("all")
  const [selectedPO, setSelectedPO] = React.useState<any | null>(null)
  const [showForm, setShowForm] = React.useState(false)
  const { toast } = useToast()

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true)
      const [ordersRes, suppliersRes] = await Promise.all([
        PurchaseOrdersAPI.getAll({
          status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
          supplier: supplierFilter && supplierFilter !== "all" ? supplierFilter : undefined,
        }),
        SuppliersAPI.getAll({ activeOnly: true }),
      ])
      if (ordersRes.success) setOrders(ordersRes.data || [])
      if (suppliersRes.success) setSuppliers(suppliersRes.data || [])
    } catch (err) {
      console.error(err)
      toast({ title: "Error", description: "Failed to load purchase orders", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, supplierFilter, toast])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      ordered: "secondary",
      partially_received: "default",
      received: "default",
      cancelled: "destructive",
    }
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status?.replace(/_/g, " ") || "-"}
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
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
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Purchase Order
        </Button>
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
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Grand Total</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No purchase orders found.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow
                    key={o._id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedPO(o)}
                  >
                    <TableCell className="font-medium">{o.poNumber}</TableCell>
                    <TableCell>
                      {o.supplierId?.name || (typeof o.supplierId === "string" ? "-" : "-")}
                    </TableCell>
                    <TableCell>{format(new Date(o.orderDate), "dd MMM yyyy")}</TableCell>
                    <TableCell>{getStatusBadge(o.status)}</TableCell>
                    <TableCell className="text-right">
                      ₹{(o.grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedPO(o)}
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <PODetailDrawer
        po={selectedPO}
        open={!!selectedPO}
        onOpenChange={(o) => { if (!o) setSelectedPO(null) }}
        onRefresh={() => { loadData(); onRefresh?.() }}
      />

      {showForm && (
        <POForm
          open={showForm}
          onOpenChange={(o) => { if (!o) setShowForm(false) }}
          onSaved={() => { setShowForm(false); loadData(); onRefresh?.() }}
        />
      )}
    </div>
  )
}
