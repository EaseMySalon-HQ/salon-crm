"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PurchaseInvoicesAPI, SuppliersAPI, apiErrorMessage } from "@/lib/api"
import { hrefPurchaseInvoiceDetail, hrefPurchaseInvoiceEdit, hrefPurchaseInvoiceNew } from "@/lib/settings-products-routes"
import { useToast } from "@/hooks/use-toast"
import { formatPurchaseInvoiceIstDate } from "@/lib/purchase-invoice-calendar-date"
import { format, startOfMonth, endOfMonth } from "date-fns"
import { ListDateRangeToolbar, ListTableExportMenu } from "@/components/suppliers/list-date-range-export-toolbar"
import { buildDateRangeSubtitle, downloadTablePdf, downloadTableXlsx } from "@/lib/inventory-lists-export"

const STATUS_OPTS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "cancelled", label: "Cancelled" },
]

function badgeVariant(s: string) {
  const m: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    posted: "default",
    cancelled: "destructive",
  }
  return m[s] || "secondary"
}

export function PurchaseInvoiceList({
  refreshNonce = 0,
  onOpenNewInvoiceModal,
}: {
  refreshNonce?: number
  onOpenNewInvoiceModal?: () => void
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [rows, setRows] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [status, setStatus] = React.useState("all")
  const [supplierId, setSupplierId] = React.useState("all")
  const [suppliers, setSuppliers] = React.useState<{ _id: string; name?: string }[]>([])
  const [suppliersLoading, setSuppliersLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [dateFrom, setDateFrom] = React.useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = React.useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"))

  const [searchTick, setSearchTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setSuppliersLoading(true)
        const res = await SuppliersAPI.getAll({ activeOnly: false })
        if (!cancelled && res.success) {
          const list = [...(res.data || [])].sort((a: { name?: string }, b: { name?: string }) =>
            String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
          )
          setSuppliers(list.map((s: any) => ({ _id: s._id, name: s.name })))
        }
      } catch {
        if (!cancelled) setSuppliers([])
      } finally {
        if (!cancelled) setSuppliersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const res = await PurchaseInvoicesAPI.getAll({
        supplier: supplierId === "all" ? undefined : supplierId,
        status: status === "all" ? undefined : status,
        search: search.trim() || undefined,
        dateFrom: dateFrom.trim() || undefined,
        dateTo: dateTo.trim() || undefined,
      })
      if (res.success) setRows(res.data || [])
      else {
        toast({
          title: "Could not load invoices",
          description: res.error || "Unknown error.",
          variant: "destructive",
        })
        setRows([])
      }
    } catch (e) {
      toast({ title: "Could not load invoices", description: apiErrorMessage(e), variant: "destructive" })
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [status, supplierId, search, searchTick, dateFrom, dateTo, toast])

  React.useEffect(() => {
    load()
  }, [load, refreshNonce])

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") setSearchTick((t) => t + 1)
  }

  const handleCancelInvoice = async (r: any) => {
    if (!r?._id || r.status === "cancelled") return
    if (r.status === "posted") {
      if (
        !window.confirm(
          "Cancel this posted invoice? Stock will be reduced and the payable removed if unpaid."
        )
      )
        return
    } else if (r.status === "draft") {
      if (!window.confirm("Cancel this draft invoice?")) return
    } else return
    const res = await PurchaseInvoicesAPI.cancel(r._id)
    if (res.success) {
      toast({ title: "Invoice cancelled" })
      load()
    } else {
      toast({ title: "Cancel failed", description: (res as { error?: string }).error || "", variant: "destructive" })
    }
  }

  const exportSubtitle = buildDateRangeSubtitle(dateFrom, dateTo)
  const runExport = (exportKind: "pdf" | "xlsx") => {
    if (!rows.length) {
      toast({ title: "Nothing to export", description: "No rows match the current filters.", variant: "destructive" })
      return
    }
    const headers = [
      "Internal #",
      "Supplier",
      "Supplier inv.",
      "Date",
      "Grand (₹)",
      "Paid (₹)",
      "Due (₹)",
      "Status",
      "Payment",
    ]
    const dataRows: (string | number)[][] = rows.map((r) => {
      const due = r.dueAmount ?? Math.max(0, (r.grandTotal || 0) - (r.paidAmount || 0))
      return [
        r.invoiceNumber || "",
        r.supplierId?.name || "",
        r.supplierInvoiceNumber || "",
        r.invoiceDate ? formatPurchaseInvoiceIstDate(r.invoiceDate) : "",
        r.grandTotal ?? 0,
        r.paidAmount ?? 0,
        due,
        r.status || "",
        r.paymentStatus || "",
      ]
    })
    const base = `purchase-invoices-${format(new Date(), "yyyy-MM-dd-HHmm")}`
    if (exportKind === "xlsx") {
      downloadTableXlsx(base, "Purchase invoices", headers, dataRows)
      toast({ title: "Download started", description: "Excel file saved." })
    } else {
      downloadTablePdf("Purchase invoices", exportSubtitle, base, headers, dataRows, true)
      toast({ title: "Download started", description: "PDF saved." })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex w-full flex-wrap items-end justify-between gap-3 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          <Input
            placeholder="Enter Invoice Number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            className="w-full sm:w-72"
          />
          <Select
            value={supplierId}
            onValueChange={setSupplierId}
            disabled={suppliersLoading}
          >
            <SelectTrigger className="w-full min-w-[200px] sm:w-[220px]">
              <SelectValue placeholder={suppliersLoading ? "Loading suppliers…" : "Supplier"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s._id} value={s._id}>
                  {s.name?.trim() || "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
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
          {onOpenNewInvoiceModal ? (
            <Button type="button" className="shrink-0" onClick={onOpenNewInvoiceModal}>
              <Plus className="h-4 w-4 mr-2" />
              New invoice
            </Button>
          ) : (
            <Button asChild className="shrink-0">
              <Link href={hrefPurchaseInvoiceNew()} prefetch={false}>
                <Plus className="h-4 w-4 mr-2" />
                New invoice
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200/90 overflow-hidden bg-white">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Internal #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Supplier inv.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Grand</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                    No purchase invoices match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow
                    key={r._id}
                    className="cursor-pointer hover:bg-slate-50/80"
                    onClick={() => router.push(hrefPurchaseInvoiceDetail(r._id))}
                  >
                    <TableCell className="font-medium">{r.invoiceNumber}</TableCell>
                    <TableCell>{r.supplierId?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.supplierInvoiceNumber || "—"}</TableCell>
                    <TableCell>{formatPurchaseInvoiceIstDate(r.invoiceDate)}</TableCell>
                    <TableCell className="text-right">₹{(r.grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">₹{(r.paidAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">₹{(r.dueAmount ?? Math.max(0, (r.grandTotal || 0) - (r.paidAmount || 0))).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => router.push(hrefPurchaseInvoiceDetail(r._id))}>
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={r.status !== "draft"}
                            onClick={() => {
                              if (r.status === "draft") router.push(hrefPurchaseInvoiceEdit(r._id))
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={r.status === "cancelled"}
                            className="text-destructive focus:text-destructive"
                            onClick={() => void handleCancelInvoice(r)}
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
    </div>
  )
}
