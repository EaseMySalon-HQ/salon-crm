"use client"

import * as React from "react"
import { Plus, Loader2, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PurchaseOrdersAPI, SuppliersAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { format, startOfMonth, endOfMonth } from "date-fns"
import { PODetailDrawer } from "./po-detail-drawer"
import { POForm } from "./po-form"
import { ListDateRangeToolbar, ListTableExportMenu } from "@/components/suppliers/list-date-range-export-toolbar"
import { buildDateRangeSubtitle, downloadTablePdf, downloadTableXlsx } from "@/lib/inventory-lists-export"

interface POListProps {
  onRefresh?: () => void
}

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "ordered", label: "Ordered" },
  { value: "partially_received", label: "Partially Received" },
  { value: "fully_received", label: "Fully Received" },
  { value: "received", label: "Received (legacy)" },
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
  const [formEditingId, setFormEditingId] = React.useState<string | null>(null)
  const [dateFrom, setDateFrom] = React.useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = React.useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"))
  const [search, setSearch] = React.useState("")
  const [searchTick, setSearchTick] = React.useState(0)
  const { toast } = useToast()

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true)
      const [ordersRes, suppliersRes] = await Promise.all([
        PurchaseOrdersAPI.getAll({
          status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
          supplier: supplierFilter && supplierFilter !== "all" ? supplierFilter : undefined,
          dateFrom: dateFrom.trim() || undefined,
          dateTo: dateTo.trim() || undefined,
          search: search.trim() || undefined,
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
  }, [statusFilter, supplierFilter, search, searchTick, dateFrom, dateTo, toast])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") setSearchTick((t) => t + 1)
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      sent: "outline",
      ordered: "secondary",
      partially_received: "default",
      fully_received: "default",
      received: "default",
      cancelled: "destructive",
    }
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status?.replace(/_/g, " ") || "-"}
      </Badge>
    )
  }

  const canCancelPO = (o: any) =>
    !["fully_received", "received", "partially_received", "cancelled"].includes(o.status)

  const handleCancelPO = async (o: any) => {
    if (!canCancelPO(o)) {
      toast({
        title: "Cannot cancel",
        description: "Received purchase orders cannot be cancelled.",
        variant: "destructive",
      })
      return
    }
    if (!window.confirm(`Cancel purchase order ${o.poNumber}?`)) return
    const res = await PurchaseOrdersAPI.cancel(o._id)
    if (res.success) {
      toast({ title: "Purchase order cancelled" })
      loadData()
      onRefresh?.()
      if (selectedPO?._id === o._id) setSelectedPO(null)
    } else {
      toast({ title: "Cancel failed", description: (res as { error?: string }).error || "", variant: "destructive" })
    }
  }

  const exportSubtitle = buildDateRangeSubtitle(dateFrom, dateTo)
  const runExport = (exportKind: "pdf" | "xlsx") => {
    if (!orders.length) {
      toast({ title: "Nothing to export", description: "No rows match the current filters.", variant: "destructive" })
      return
    }
    const headers = ["PO Number", "Supplier", "Order Date", "Status"]
    const rows: (string | number)[][] = orders.map((o) => [
      o.poNumber || "",
      o.supplierId?.name || "",
      o.orderDate ? format(new Date(o.orderDate), "dd MMM yyyy") : "",
      String(o.status || "").replace(/_/g, " "),
    ])
    const base = `purchase-orders-${format(new Date(), "yyyy-MM-dd-HHmm")}`
    if (exportKind === "xlsx") {
      downloadTableXlsx(base, "Purchase orders", headers, rows)
      toast({ title: "Download started", description: "Excel file saved." })
    } else {
      downloadTablePdf("Purchase orders", exportSubtitle, base, headers, rows, true)
      toast({ title: "Download started", description: "PDF saved." })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex w-full flex-wrap items-end justify-between gap-3 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          <Input
            placeholder="Enter PO Number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            className="w-full sm:w-72"
          />
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
          <ListDateRangeToolbar
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            disabled={loading}
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-end justify-end gap-2">
          <ListTableExportMenu
            onExportPdf={() => runExport("pdf")}
            onExportXlsx={() => runExport("xlsx")}
            disabled={loading}
          />
          <Button
            className="shrink-0"
            onClick={() => {
              setFormEditingId(null)
              setShowForm(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Purchase Order
          </Button>
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
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => setSelectedPO(o)}>View</DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={o.status !== "draft"}
                            onClick={() => {
                              setFormEditingId(o._id)
                              setShowForm(true)
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!canCancelPO(o)}
                            className="text-destructive focus:text-destructive"
                            onClick={() => void handleCancelPO(o)}
                          >
                            Cancel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
          editingPoId={formEditingId}
          onOpenChange={(o) => {
            if (!o) {
              setShowForm(false)
              setFormEditingId(null)
            }
          }}
          onSaved={() => {
            setShowForm(false)
            setFormEditingId(null)
            loadData()
            onRefresh?.()
          }}
        />
      )}
    </div>
  )
}
