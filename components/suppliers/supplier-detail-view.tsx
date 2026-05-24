"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { FileText, Loader2, Receipt, ChevronDown, Search, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SuppliersAPI, PurchaseOrdersAPI, PurchaseInvoicesAPI } from "@/lib/api"
import { supplierPayableReferenceLabel } from "@/lib/supplier-payable-reference"
import { SupplierDetailsSheet } from "@/components/suppliers/supplier-details-sheet"
import { hrefPurchaseInvoiceDetail, hrefPurchaseInvoiceEdit } from "@/lib/settings-products-routes"
import { POForm } from "@/components/purchase-orders/po-form"
import { PODetailDrawer } from "@/components/purchase-orders/po-detail-drawer"
import { useToast } from "@/hooks/use-toast"
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const SUPPLIER_PAYMENT_DATE_TZ = "Asia/Kolkata"
const SUPPLIER_TABLE_PAGE_SIZE = 10

function SupplierTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  idPrefix,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (p: number) => void
  idPrefix: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0 || totalPages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div
      className="flex flex-col gap-2 border-t border-slate-200/80 bg-slate-50/40 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800/80 dark:bg-slate-950/30"
      aria-label="Table pagination"
    >
      <p id={`${idPrefix}-summary`} className="tabular-nums text-muted-foreground">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page <= 1}
          aria-label="Previous page"
          aria-controls={`${idPrefix}-table`}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="min-w-[5.5rem] tabular-nums text-center text-xs text-muted-foreground" aria-live="polite">
          Page {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page >= totalPages}
          aria-label="Next page"
          aria-controls={`${idPrefix}-table`}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

/** IST calendar date (matches date-only picker; avoids UTC midnight showing as 05:30 IST). */
function formatSupplierPaymentTimelineDate(paymentDate: string | Date | null | undefined): string {
  if (paymentDate == null) return "—"
  const d = new Date(paymentDate)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: SUPPLIER_PAYMENT_DATE_TZ,
  }).format(d)
}

function orderHistoryStatusBadgeVariant(row: { kind: string; status: string }): "default" | "destructive" | "secondary" | "outline" {
  if (row.kind === "purchase_invoice") {
    if (row.status === "posted") return "default"
    if (row.status === "cancelled") return "destructive"
    return "outline"
  }
  if (row.status === "fully_received" || row.status === "received") return "default"
  if (row.status === "cancelled") return "destructive"
  return "secondary"
}

const ORDER_TYPE_FILTER_ALL = "all"
const ORDER_STATUS_FILTER_ALL = "all"

type OrderDatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "currentMonth"
  | "lastMonth"
  | "custom"

const ORDER_DATE_PRESET_ORDER: OrderDatePreset[] = [
  "all",
  "today",
  "yesterday",
  "last7",
  "last30",
  "currentMonth",
  "lastMonth",
  "custom",
]

const ORDER_DATE_PRESET_LABELS: Record<OrderDatePreset, string> = {
  all: "All time",
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  currentMonth: "Current month",
  lastMonth: "Last month",
  custom: "Custom (date range)",
}

function computeOrderHistoryDateRange(preset: Exclude<OrderDatePreset, "all" | "custom">): {
  from: string
  to: string
} {
  const now = new Date()
  switch (preset) {
    case "today":
      return { from: format(startOfDay(now), "yyyy-MM-dd"), to: format(endOfDay(now), "yyyy-MM-dd") }
    case "yesterday": {
      const d = subDays(now, 1)
      return { from: format(startOfDay(d), "yyyy-MM-dd"), to: format(endOfDay(d), "yyyy-MM-dd") }
    }
    case "last7":
      return {
        from: format(startOfDay(subDays(now, 6)), "yyyy-MM-dd"),
        to: format(endOfDay(now), "yyyy-MM-dd"),
      }
    case "last30":
      return {
        from: format(startOfDay(subDays(now, 29)), "yyyy-MM-dd"),
        to: format(endOfDay(now), "yyyy-MM-dd"),
      }
    case "currentMonth":
      return {
        from: format(startOfMonth(now), "yyyy-MM-dd"),
        to: format(endOfMonth(now), "yyyy-MM-dd"),
      }
    case "lastMonth": {
      const lm = subMonths(now, 1)
      return {
        from: format(startOfMonth(lm), "yyyy-MM-dd"),
        to: format(endOfMonth(lm), "yyyy-MM-dd"),
      }
    }
  }
}

function filterOrderHistoryRow(
  row: any,
  opts: {
    referenceQuery: string
    typeFilter: string
    dateFrom: string
    dateTo: string
    statusFilter: string
  },
): boolean {
  if (opts.typeFilter !== ORDER_TYPE_FILTER_ALL && row.kind !== opts.typeFilter) return false
  if (opts.statusFilter !== ORDER_STATUS_FILTER_ALL && String(row.status ?? "") !== opts.statusFilter) {
    return false
  }
  const q = opts.referenceQuery.trim().toLowerCase()
  if (q) {
    const ref = String(row.reference ?? "").toLowerCase()
    if (!ref.includes(q)) return false
  }
  if (opts.dateFrom.trim() || opts.dateTo.trim()) {
    if (!row.date) return false
    const d = new Date(row.date)
    if (Number.isNaN(d.getTime())) return false
    const key = format(d, "yyyy-MM-dd")
    if (opts.dateFrom.trim() && key < opts.dateFrom.trim()) return false
    if (opts.dateTo.trim() && key > opts.dateTo.trim()) return false
  }
  return true
}

function payablesMatchSearch(p: any, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (supplierPayableReferenceLabel(p).toLowerCase().includes(q)) return true
  const pi = p.purchaseInvoiceId
  if (pi && typeof pi === "object") {
    if (String(pi.supplierInvoiceNumber ?? "").toLowerCase().includes(q)) return true
    if (String(pi.invoiceNumber ?? "").toLowerCase().includes(q)) return true
  }
  const po = p.purchaseOrderId
  if (po && typeof po === "object" && String(po.poNumber ?? "").toLowerCase().includes(q)) return true
  return false
}

function paymentTimelineMatchesSearch(row: any, query: string, formatPayDate: (d: unknown) => string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (String(row.payableReferenceNumber ?? "").toLowerCase().includes(q)) return true
  if (String(row.paymentMethod ?? "").toLowerCase().includes(q)) return true
  if (formatPayDate(row.paymentDate).toLowerCase().includes(q)) return true
  const amt = Number(row.amount) || 0
  const formatted = amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })
  const qNorm = q.replace(/,/g, "").replace(/\s/g, "").replace(/^₹/, "")
  if (qNorm && formatted.replace(/,/g, "").includes(qNorm)) return true
  return false
}

function canEditOrderHistoryRow(row: { kind: string; status: string }) {
  return row.status === "draft"
}

function canDeleteOrderHistoryRow(row: { kind: string; status: string }) {
  if (row.kind === "purchase_order") {
    if (row.status === "cancelled") return true
    return !["fully_received", "received", "partially_received"].includes(row.status)
  }
  if (row.kind === "purchase_invoice") {
    if (row.status === "cancelled") return true
    return row.status === "draft" || row.status === "posted"
  }
  return false
}

export interface SupplierDetailViewProps {
  supplier: any
  /** Rendered above the title row (e.g. back navigation). */
  headerLeading?: React.ReactNode
  onEdit?: () => void
  /** Opens the purchase order form modal. */
  onNewPurchaseOrder?: () => void
  /** Navigates to create a purchase invoice prefilled with this supplier. */
  onNewPurchaseInvoice?: () => void
}

export function SupplierDetailView({
  supplier,
  headerLeading,
  onEdit,
  onNewPurchaseOrder,
  onNewPurchaseInvoice,
}: SupplierDetailViewProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [detailsSheetOpen, setDetailsSheetOpen] = React.useState(false)
  const [poEditFormOpen, setPoEditFormOpen] = React.useState(false)
  const [poEditingId, setPoEditingId] = React.useState<string | null>(null)
  const [selectedPOForDetail, setSelectedPOForDetail] = React.useState<any | null>(null)
  const [orderHistory, setOrderHistory] = React.useState<any[]>([])
  const [outstanding, setOutstanding] = React.useState<{ outstanding: number; payables: any[] } | null>(null)
  const [paymentTimeline, setPaymentTimeline] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)
  const [ordersPage, setOrdersPage] = React.useState(1)
  const [duesPage, setDuesPage] = React.useState(1)
  const [paymentsPage, setPaymentsPage] = React.useState(1)
  const [orderRefSearch, setOrderRefSearch] = React.useState("")
  const [orderTypeFilter, setOrderTypeFilter] = React.useState(ORDER_TYPE_FILTER_ALL)
  const [orderDatePreset, setOrderDatePreset] = React.useState<OrderDatePreset>("all")
  const [orderDateCustomFrom, setOrderDateCustomFrom] = React.useState("")
  const [orderDateCustomTo, setOrderDateCustomTo] = React.useState("")
  const [orderStatusFilter, setOrderStatusFilter] = React.useState(ORDER_STATUS_FILTER_ALL)
  const [duesSearch, setDuesSearch] = React.useState("")
  const [paymentsSearch, setPaymentsSearch] = React.useState("")

  React.useEffect(() => {
    if (supplier?._id) {
      setLoading(true)
      setOrderHistory([])
      setOutstanding(null)
      setPaymentTimeline([])
      setOrdersPage(1)
      setDuesPage(1)
      setPaymentsPage(1)
      setOrderRefSearch("")
      setOrderTypeFilter(ORDER_TYPE_FILTER_ALL)
      setOrderDatePreset("all")
      setOrderDateCustomFrom("")
      setOrderDateCustomTo("")
      setOrderStatusFilter(ORDER_STATUS_FILTER_ALL)
      setDuesSearch("")
      setPaymentsSearch("")
      Promise.all([
        SuppliersAPI.getOrders(supplier._id),
        SuppliersAPI.getOutstanding(supplier._id),
        SuppliersAPI.getPaymentTimeline(supplier._id),
      ])
        .then(([ordersRes, outstandingRes, paymentsRes]) => {
          if (ordersRes.success) setOrderHistory(ordersRes.data || [])
          if (outstandingRes.success) setOutstanding(outstandingRes.data)
          if (paymentsRes.success) setPaymentTimeline(paymentsRes.data || [])
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [supplier?._id])

  const refreshSupplierFinancials = React.useCallback(() => {
    if (!supplier?._id) return
    Promise.all([
      SuppliersAPI.getOrders(supplier._id),
      SuppliersAPI.getOutstanding(supplier._id),
      SuppliersAPI.getPaymentTimeline(supplier._id),
    ])
      .then(([ordersRes, outstandingRes, paymentsRes]) => {
        if (ordersRes.success) setOrderHistory(ordersRes.data || [])
        if (outstandingRes.success) setOutstanding(outstandingRes.data)
        if (paymentsRes.success) setPaymentTimeline(paymentsRes.data || [])
      })
      .catch(console.error)
  }, [supplier?._id])

  const openPayables = React.useMemo(
    () =>
      outstanding?.payables?.filter((p: any) => {
        const bal = (p.totalAmount || 0) - (p.amountPaid || 0)
        return bal > 0
      }) ?? [],
    [outstanding],
  )

  const orderDateRangeForFilter = React.useMemo(() => {
    if (orderDatePreset === "all") return { from: "", to: "" }
    if (orderDatePreset === "custom") {
      return { from: orderDateCustomFrom.trim(), to: orderDateCustomTo.trim() }
    }
    return computeOrderHistoryDateRange(orderDatePreset)
  }, [orderDatePreset, orderDateCustomFrom, orderDateCustomTo])

  const orderHistoryStatusOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const row of orderHistory) {
      if (row?.status != null && String(row.status).trim()) set.add(String(row.status))
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [orderHistory])

  const filteredOrderHistory = React.useMemo(
    () =>
      orderHistory.filter((row) =>
        filterOrderHistoryRow(row, {
          referenceQuery: orderRefSearch,
          typeFilter: orderTypeFilter,
          dateFrom: orderDateRangeForFilter.from,
          dateTo: orderDateRangeForFilter.to,
          statusFilter: orderStatusFilter,
        }),
      ),
    [orderHistory, orderRefSearch, orderTypeFilter, orderDateRangeForFilter, orderStatusFilter],
  )

  const ordersPageSlice = React.useMemo(() => {
    const start = (ordersPage - 1) * SUPPLIER_TABLE_PAGE_SIZE
    return filteredOrderHistory.slice(start, start + SUPPLIER_TABLE_PAGE_SIZE)
  }, [filteredOrderHistory, ordersPage])

  const filteredOpenPayables = React.useMemo(
    () => openPayables.filter((p: any) => payablesMatchSearch(p, duesSearch)),
    [openPayables, duesSearch],
  )

  const filteredPaymentTimeline = React.useMemo(
    () =>
      paymentTimeline.filter((row: any) =>
        paymentTimelineMatchesSearch(row, paymentsSearch, formatSupplierPaymentTimelineDate),
      ),
    [paymentTimeline, paymentsSearch],
  )

  const duesPageSlice = React.useMemo(() => {
    const start = (duesPage - 1) * SUPPLIER_TABLE_PAGE_SIZE
    return filteredOpenPayables.slice(start, start + SUPPLIER_TABLE_PAGE_SIZE)
  }, [filteredOpenPayables, duesPage])

  const paymentsPageSlice = React.useMemo(() => {
    const start = (paymentsPage - 1) * SUPPLIER_TABLE_PAGE_SIZE
    return filteredPaymentTimeline.slice(start, start + SUPPLIER_TABLE_PAGE_SIZE)
  }, [filteredPaymentTimeline, paymentsPage])

  React.useEffect(() => {
    setOrdersPage(1)
  }, [orderRefSearch, orderTypeFilter, orderDatePreset, orderDateCustomFrom, orderDateCustomTo, orderStatusFilter])

  React.useEffect(() => {
    if (orderStatusFilter === ORDER_STATUS_FILTER_ALL) return
    if (!orderHistoryStatusOptions.includes(orderStatusFilter)) {
      setOrderStatusFilter(ORDER_STATUS_FILTER_ALL)
    }
  }, [orderHistoryStatusOptions, orderStatusFilter])

  React.useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredOrderHistory.length / SUPPLIER_TABLE_PAGE_SIZE))
    if (ordersPage > tp) setOrdersPage(tp)
  }, [filteredOrderHistory.length, ordersPage])

  React.useEffect(() => {
    setDuesPage(1)
  }, [duesSearch])

  React.useEffect(() => {
    setPaymentsPage(1)
  }, [paymentsSearch])

  React.useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredOpenPayables.length / SUPPLIER_TABLE_PAGE_SIZE))
    if (duesPage > tp) setDuesPage(tp)
  }, [filteredOpenPayables.length, duesPage])

  React.useEffect(() => {
    const tp = Math.max(1, Math.ceil(filteredPaymentTimeline.length / SUPPLIER_TABLE_PAGE_SIZE))
    if (paymentsPage > tp) setPaymentsPage(tp)
  }, [filteredPaymentTimeline.length, paymentsPage])

  if (!supplier) return null

  const outstandingAmt =
    outstanding != null ? Number(outstanding.outstanding) || 0 : supplier.outstandingAmount || 0

  const orderFiltersActive =
    orderRefSearch.trim() !== "" ||
    orderTypeFilter !== ORDER_TYPE_FILTER_ALL ||
    orderDatePreset !== "all" ||
    orderStatusFilter !== ORDER_STATUS_FILTER_ALL

  const clearOrderFilters = () => {
    setOrderRefSearch("")
    setOrderTypeFilter(ORDER_TYPE_FILTER_ALL)
    setOrderDatePreset("all")
    setOrderDateCustomFrom("")
    setOrderDateCustomTo("")
    setOrderStatusFilter(ORDER_STATUS_FILTER_ALL)
  }

  const onOrderDatePresetChange = (value: string) => {
    const p = value as OrderDatePreset
    setOrderDatePreset(p)
    if (p === "custom") {
      const now = new Date()
      setOrderDateCustomFrom((f) => f.trim() || format(startOfDay(now), "yyyy-MM-dd"))
      setOrderDateCustomTo((t) => t.trim() || format(endOfDay(now), "yyyy-MM-dd"))
    }
  }

  const openEditOrderHistoryRow = (row: any) => {
    const id = row?._id != null ? String(row._id) : ""
    if (!id) return
    if (row.kind === "purchase_order") {
      if (!canEditOrderHistoryRow(row)) {
        toast({
          title: "Cannot edit",
          description: "Only draft purchase orders can be edited.",
          variant: "destructive",
        })
        return
      }
      setPoEditingId(id)
      setPoEditFormOpen(true)
      return
    }
    if (row.kind === "purchase_invoice") {
      if (!canEditOrderHistoryRow(row)) {
        toast({
          title: "Cannot edit",
          description: "Only draft purchase invoices can be edited.",
          variant: "destructive",
        })
        return
      }
      router.push(hrefPurchaseInvoiceEdit(id))
    }
  }

  const deleteOrderHistoryRow = async (row: any) => {
    const id = row?._id != null ? String(row._id) : ""
    const refLabel = (row?.reference && String(row.reference).trim()) || id || "this record"
    if (!id || !canDeleteOrderHistoryRow(row)) {
      toast({
        title: "Cannot delete",
        description:
          row.kind === "purchase_order"
            ? "Received purchase orders cannot be removed unless cancelled first."
            : "This invoice cannot be cancelled or removed.",
        variant: "destructive",
      })
      return
    }

    if (row.status === "cancelled") {
      if (row.kind === "purchase_order") {
        if (!window.confirm(`Permanently delete cancelled purchase order ${refLabel}? This cannot be undone.`)) return
        const res = await PurchaseOrdersAPI.deletePermanently(id)
        if (res.success) {
          toast({ title: "Purchase order deleted" })
          refreshSupplierFinancials()
        } else {
          toast({
            title: "Delete failed",
            description: (res as { error?: string }).error || "",
            variant: "destructive",
          })
        }
        return
      }
      if (row.kind === "purchase_invoice") {
        if (!window.confirm(`Permanently delete cancelled purchase invoice ${refLabel}? This cannot be undone.`)) return
        const res = await PurchaseInvoicesAPI.deletePermanently(id)
        if (res.success) {
          toast({ title: "Purchase invoice deleted" })
          refreshSupplierFinancials()
        } else {
          toast({
            title: "Delete failed",
            description: (res as { error?: string }).error || "",
            variant: "destructive",
          })
        }
        return
      }
      return
    }

    if (row.kind === "purchase_order") {
      if (!window.confirm(`Delete purchase order ${refLabel}? This cancels the order.`)) return
      const res = await PurchaseOrdersAPI.cancel(id)
      if (res.success) {
        toast({ title: "Purchase order removed" })
        refreshSupplierFinancials()
      } else {
        toast({
          title: "Delete failed",
          description: (res as { error?: string }).error || "",
          variant: "destructive",
        })
      }
      return
    }
    if (row.kind === "purchase_invoice") {
      if (row.status === "posted") {
        if (
          !window.confirm(
            "Delete this posted invoice? Stock will be reduced and the payable removed if unpaid.",
          )
        ) {
          return
        }
      } else if (row.status === "draft") {
        if (!window.confirm("Delete this draft invoice?")) return
      } else return
      const res = await PurchaseInvoicesAPI.cancel(id)
      if (res.success) {
        toast({ title: "Purchase invoice removed" })
        refreshSupplierFinancials()
      } else {
        toast({
          title: "Delete failed",
          description: (res as { error?: string }).error || "",
          variant: "destructive",
        })
      }
    }
  }

  const openOrderHistoryReference = (row: any) => {
    const id = row?._id != null ? String(row._id) : ""
    if (!id) return
    if (row.kind === "purchase_order") {
      setSelectedPOForDetail({
        _id: row._id,
        poNumber: (row.reference && String(row.reference).trim()) || "—",
        status: row.status,
      })
      return
    }
    if (row.kind === "purchase_invoice") {
      router.push(hrefPurchaseInvoiceDetail(id))
    }
  }

  return (
    <div className="flex min-w-0 w-full flex-col">
      <div className="shrink-0 space-y-0 border-b border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-background pt-4 pb-5 text-left dark:from-slate-950/80">
        {headerLeading ? <div className="mb-4">{headerLeading}</div> : null}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
              {supplier.name}
            </h1>
            {outstandingAmt > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                <Receipt className="h-4 w-4 shrink-0 opacity-80" />
                Outstanding{" "}
                <span className="tabular-nums">
                  ₹{outstandingAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shadow-sm"
              onClick={() => setDetailsSheetOpen(true)}
            >
              View details
            </Button>
            {(onNewPurchaseOrder || onNewPurchaseInvoice) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="shadow-sm">
                    <FileText className="mr-1.5 h-4 w-4" />
                    New order
                    <ChevronDown className="ml-1 h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {onNewPurchaseOrder ? (
                    <DropdownMenuItem className="cursor-pointer" onClick={onNewPurchaseOrder}>
                      Purchase order
                    </DropdownMenuItem>
                  ) : null}
                  {onNewPurchaseInvoice ? (
                    <DropdownMenuItem className="cursor-pointer" onClick={onNewPurchaseInvoice}>
                      Purchase invoice
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 w-full">
        <div className="w-full max-w-none space-y-5 py-6">
          <Card className="border-slate-200/90 shadow-sm">
            <CardContent className="p-6">
              <Tabs defaultValue="orders" className="min-w-0">
                <TabsList className="grid h-auto w-full grid-cols-1 gap-1 rounded-md bg-muted p-1 sm:grid-cols-3">
                  <TabsTrigger value="orders" className="w-full">
                    Order history
                  </TabsTrigger>
                  <TabsTrigger
                    value="dues"
                    className="w-full gap-2 data-[state=active]:bg-amber-100/70 data-[state=active]:text-amber-950 dark:data-[state=active]:bg-amber-950/40 dark:data-[state=active]:text-amber-100"
                  >
                    Outstanding dues
                    {openPayables.length > 0 ? (
                      <span className="ml-1 rounded-full bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums dark:bg-amber-800/70">
                        {openPayables.length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="w-full">
                    Payment timeline
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="orders" className="mt-4">
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                    </div>
                  ) : orderHistory.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200/80 bg-slate-50/40 py-10 text-center text-sm text-muted-foreground dark:bg-slate-950/20">
                      No purchase orders or invoices yet
                    </p>
                  ) : (
                    <>
                      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800/80 dark:bg-slate-950/25 sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="w-full max-w-[180px] space-y-1 sm:w-[180px]">
                          <Label htmlFor="supplier-orders-ref-search" className="text-xs text-muted-foreground">
                            Search reference
                          </Label>
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <Input
                              id="supplier-orders-ref-search"
                              type="search"
                              placeholder="Reference"
                              value={orderRefSearch}
                              onChange={(e) => setOrderRefSearch(e.target.value)}
                              className="h-8 px-2 py-1 pl-7 text-sm"
                              autoComplete="off"
                              aria-controls="supplier-orders-table"
                            />
                          </div>
                        </div>
                        <div className="w-full space-y-1 sm:w-[148px]">
                          <Label className="text-xs text-muted-foreground">Type</Label>
                          <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                            <SelectTrigger className="h-9" aria-controls="supplier-orders-table">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={ORDER_TYPE_FILTER_ALL}>All types</SelectItem>
                              <SelectItem value="purchase_order">Purchase order</SelectItem>
                              <SelectItem value="purchase_invoice">Purchase invoice</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-full">
                          <div className="w-full space-y-1 sm:w-[min(100%,220px)]">
                            <Label className="text-xs text-muted-foreground">Date range</Label>
                            <Select value={orderDatePreset} onValueChange={onOrderDatePresetChange}>
                              <SelectTrigger className="h-9" aria-controls="supplier-orders-table">
                                <SelectValue placeholder="Date range" />
                              </SelectTrigger>
                              <SelectContent>
                                {ORDER_DATE_PRESET_ORDER.map((key) => (
                                  <SelectItem key={key} value={key}>
                                    {ORDER_DATE_PRESET_LABELS[key]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {orderDatePreset === "custom" ? (
                            <div className="flex flex-wrap gap-3">
                              <div className="space-y-1">
                                <Label htmlFor="supplier-orders-date-from" className="text-xs text-muted-foreground">
                                  From
                                </Label>
                                <Input
                                  id="supplier-orders-date-from"
                                  type="date"
                                  value={orderDateCustomFrom}
                                  onChange={(e) => setOrderDateCustomFrom(e.target.value)}
                                  className="h-9 w-[150px]"
                                  aria-controls="supplier-orders-table"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="supplier-orders-date-to" className="text-xs text-muted-foreground">
                                  To
                                </Label>
                                <Input
                                  id="supplier-orders-date-to"
                                  type="date"
                                  value={orderDateCustomTo}
                                  onChange={(e) => setOrderDateCustomTo(e.target.value)}
                                  className="h-9 w-[150px]"
                                  aria-controls="supplier-orders-table"
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="w-full space-y-1 sm:min-w-[160px] sm:flex-1 sm:max-w-[220px]">
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                            <SelectTrigger className="h-9" aria-controls="supplier-orders-table">
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={ORDER_STATUS_FILTER_ALL}>All statuses</SelectItem>
                              {orderHistoryStatusOptions.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {orderFiltersActive ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 shrink-0 text-muted-foreground"
                            onClick={clearOrderFilters}
                          >
                            Clear filters
                          </Button>
                        ) : null}
                      </div>

                      {filteredOrderHistory.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-200/80 bg-slate-50/40 py-10 text-center text-sm text-muted-foreground dark:bg-slate-950/20">
                          No orders match your filters
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-slate-200/80">
                          <div className="overflow-x-auto" id="supplier-orders-table">
                            <Table>
                            <TableHeader>
                              <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                                <TableHead className="w-[52px]">Type</TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="w-12 text-right" aria-label="Actions" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ordersPageSlice.map((row) => (
                                <TableRow key={`${row.kind}-${row._id}`}>
                                  <TableCell>
                                    <Badge variant="outline" className="font-normal">
                                      {row.kind === "purchase_order" ? "PO" : "PI"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    <Button
                                      type="button"
                                      variant="link"
                                      className="h-auto min-h-0 p-0 text-left font-medium"
                                      onClick={() => openOrderHistoryReference(row)}
                                    >
                                      {row.reference?.trim() ? row.reference : "—"}
                                    </Button>
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {row.date ? format(new Date(row.date), "dd MMM yyyy") : "—"}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={orderHistoryStatusBadgeVariant(row)}>{row.status}</Badge>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    ₹{(row.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          aria-label="Row actions"
                                        >
                                          <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-40">
                                        <DropdownMenuItem
                                          disabled={!canEditOrderHistoryRow(row)}
                                          className="cursor-pointer"
                                          onClick={() => openEditOrderHistoryRow(row)}
                                        >
                                          Edit
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          disabled={!canDeleteOrderHistoryRow(row)}
                                          className="cursor-pointer text-destructive focus:text-destructive"
                                          onClick={() => void deleteOrderHistoryRow(row)}
                                        >
                                          Delete
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          </div>
                          <SupplierTablePagination
                            page={ordersPage}
                            pageSize={SUPPLIER_TABLE_PAGE_SIZE}
                            total={filteredOrderHistory.length}
                            onPageChange={setOrdersPage}
                            idPrefix="supplier-orders"
                          />
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="dues" className="mt-4">
                  <p className="mb-3 text-xs text-muted-foreground">Open payables for this supplier</p>
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                    </div>
                  ) : openPayables.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-emerald-200/80 bg-emerald-50/30 py-10 text-center text-sm text-muted-foreground dark:bg-emerald-950/15">
                      No outstanding dues — all tracked payables are settled.
                    </p>
                  ) : (
                    <>
                      <div className="mb-3 max-w-[220px] space-y-1">
                        <Label htmlFor="supplier-dues-search" className="text-xs text-muted-foreground">
                          Search
                        </Label>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                          <Input
                            id="supplier-dues-search"
                            type="search"
                            placeholder="Reference / invoice / PO"
                            value={duesSearch}
                            onChange={(e) => setDuesSearch(e.target.value)}
                            className="h-8 px-2 py-1 pl-7 text-sm"
                            autoComplete="off"
                            aria-controls="supplier-dues-table"
                          />
                        </div>
                      </div>
                      {filteredOpenPayables.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-amber-200/80 bg-amber-50/20 py-10 text-center text-sm text-muted-foreground dark:bg-amber-950/20">
                          No dues match your search
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-amber-200/60 bg-amber-50/25 dark:border-amber-900/50 dark:bg-amber-950/20">
                          <div className="overflow-x-auto" id="supplier-dues-table">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-amber-50/50 hover:bg-amber-50/50 dark:bg-amber-950/30">
                                  <TableHead>Reference</TableHead>
                                  <TableHead>Due date</TableHead>
                                  <TableHead className="text-right">Balance</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {duesPageSlice.map((p: any) => {
                                  const bal = (p.totalAmount || 0) - (p.amountPaid || 0)
                                  return (
                                    <TableRow key={p._id}>
                                      <TableCell className="font-medium">{supplierPayableReferenceLabel(p)}</TableCell>
                                      <TableCell className="text-muted-foreground">
                                        {p.dueDate ? format(new Date(p.dueDate), "dd MMM yyyy") : "—"}
                                      </TableCell>
                                      <TableCell className="text-right font-medium tabular-nums text-amber-700 dark:text-amber-400">
                                        ₹{bal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </div>
                          <SupplierTablePagination
                            page={duesPage}
                            pageSize={SUPPLIER_TABLE_PAGE_SIZE}
                            total={filteredOpenPayables.length}
                            onPageChange={setDuesPage}
                            idPrefix="supplier-dues"
                          />
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="payments" className="mt-4">
                  <p className="mb-3 text-xs text-muted-foreground">All payments recorded to this supplier, newest first</p>
                  {loading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                    </div>
                  ) : paymentTimeline.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200/80 bg-slate-50/40 py-10 text-center text-sm text-muted-foreground dark:bg-slate-950/20">
                      No payments recorded yet
                    </p>
                  ) : (
                    <>
                      <div className="mb-3 max-w-[220px] space-y-1">
                        <Label htmlFor="supplier-payments-search" className="text-xs text-muted-foreground">
                          Search
                        </Label>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                          <Input
                            id="supplier-payments-search"
                            type="search"
                            placeholder="Reference, mode, date, amount"
                            value={paymentsSearch}
                            onChange={(e) => setPaymentsSearch(e.target.value)}
                            className="h-8 px-2 py-1 pl-7 text-sm"
                            autoComplete="off"
                            aria-controls="supplier-payments-table"
                          />
                        </div>
                      </div>
                      {filteredPaymentTimeline.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-200/80 bg-slate-50/40 py-10 text-center text-sm text-muted-foreground dark:bg-slate-950/20">
                          No payments match your search
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-slate-200/80">
                          <div className="overflow-x-auto" id="supplier-payments-table">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                                  <TableHead>Payment date</TableHead>
                                  <TableHead>Reference no.</TableHead>
                                  <TableHead className="text-right">Payment amount</TableHead>
                                  <TableHead>Payment mode</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {paymentsPageSlice.map((row: any) => (
                                  <TableRow key={String(row._id)}>
                                    <TableCell className="text-muted-foreground">
                                      {formatSupplierPaymentTimelineDate(row.paymentDate)}
                                    </TableCell>
                                    <TableCell className="max-w-[200px] break-words text-sm font-medium">
                                      {(row.payableReferenceNumber ?? "").trim() || "—"}
                                    </TableCell>
                                    <TableCell className="text-right font-medium tabular-nums">
                                      ₹{(Number(row.amount) || 0).toLocaleString("en-IN", {
                                        minimumFractionDigits: 2,
                                      })}
                                    </TableCell>
                                    <TableCell>{row.paymentMethod || "—"}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          <SupplierTablePagination
                            page={paymentsPage}
                            pageSize={SUPPLIER_TABLE_PAGE_SIZE}
                            total={filteredPaymentTimeline.length}
                            onPageChange={setPaymentsPage}
                            idPrefix="supplier-payments"
                          />
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <POForm
        open={poEditFormOpen && !!poEditingId}
        onOpenChange={(o) => {
          if (!o) {
            setPoEditFormOpen(false)
            setPoEditingId(null)
          }
        }}
        preselectedSupplierId={supplier._id}
        editingPoId={poEditingId}
        onSaved={() => {
          setPoEditFormOpen(false)
          setPoEditingId(null)
          refreshSupplierFinancials()
        }}
      />

      <PODetailDrawer
        po={selectedPOForDetail}
        open={!!selectedPOForDetail}
        onOpenChange={(o) => {
          if (!o) setSelectedPOForDetail(null)
        }}
        onRefresh={refreshSupplierFinancials}
      />

      <SupplierDetailsSheet
        open={detailsSheetOpen}
        onOpenChange={setDetailsSheetOpen}
        supplier={supplier}
        onEdit={onEdit}
      />
    </div>
  )
}
