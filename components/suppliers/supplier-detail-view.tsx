"use client"

import * as React from "react"
import { FileText, Loader2, User, Phone, MessageCircle, Hash, Tag, Building2, StickyNote, Landmark, Receipt, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SuppliersAPI } from "@/lib/api"
import { supplierPayableReferenceLabel } from "@/lib/supplier-payable-reference"
import { format } from "date-fns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const SUPPLIER_PAYMENT_DATE_TZ = "Asia/Kolkata"

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

function InfoItem({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  const displayValue = value?.trim() || "—"
  return (
    <div className="flex gap-3 rounded-lg bg-slate-50/80 px-3 py-2.5 dark:bg-slate-900/40">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 break-words text-sm leading-snug ${value?.trim() ? "font-medium text-foreground" : "text-muted-foreground"}`}>
          {displayValue}
        </p>
      </div>
    </div>
  )
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
  const [supplierDetailsOpen, setSupplierDetailsOpen] = React.useState(false)
  const [orderHistory, setOrderHistory] = React.useState<any[]>([])
  const [outstanding, setOutstanding] = React.useState<{ outstanding: number; payables: any[] } | null>(null)
  const [paymentTimeline, setPaymentTimeline] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (supplier?._id) {
      setLoading(true)
      setOrderHistory([])
      setOutstanding(null)
      setPaymentTimeline([])
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

  if (!supplier) return null

  const categories = Array.isArray(supplier.categories) ? supplier.categories : supplier.category ? [supplier.category] : []
  const supplierNotesTrimmed =
    supplier.notes == null ? "" : String(supplier.notes).trim()
  const hasSupplierNotes = supplierNotesTrimmed.length > 0
  const outstandingAmt =
    outstanding != null ? Number(outstanding.outstanding) || 0 : supplier.outstandingAmount || 0

  const openPayables =
    outstanding?.payables?.filter((p: any) => {
      const bal = (p.totalAmount || 0) - (p.amountPaid || 0)
      return bal > 0
    }) ?? []

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
          {(onEdit || onNewPurchaseOrder || onNewPurchaseInvoice) && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {onEdit && (
                <Button variant="outline" size="sm" className="shadow-sm" onClick={onEdit}>
                  Edit details
                </Button>
              )}
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
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 w-full">
        <div className="w-full max-w-none space-y-5 py-6">
          <div className="overflow-hidden rounded-lg border border-slate-200/90 bg-card text-card-foreground shadow-sm">
            <button
              type="button"
              aria-expanded={supplierDetailsOpen}
              aria-controls="supplier-details-extras"
              id="supplier-details-toggle"
              onClick={() => setSupplierDetailsOpen((o) => !o)}
              className="flex w-full items-start justify-between gap-3 bg-slate-50/70 px-4 py-3.5 text-left outline-none ring-offset-background transition-colors hover:bg-slate-100/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-6 sm:py-4 dark:bg-slate-900/30 dark:hover:bg-slate-900/50"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Supplier details</p>
                <p className="text-xs font-normal text-muted-foreground">
                  Expand for address, categories{hasSupplierNotes ? ", and notes" : ""}
                </p>
              </div>
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200/90 bg-background text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${supplierDetailsOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </span>
            </button>
            <div className="border-t border-slate-200/80 px-4 py-4 sm:px-6 dark:border-slate-800/80">
              <Card className="border-slate-200/90 shadow-sm">
                <CardContent className="grid min-w-0 grid-cols-1 gap-2.5 pt-6 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-7 xl:grid-rows-1 xl:gap-3 [&>*]:min-w-0">
                  <InfoItem label="Contact name" value={supplier.contactPerson || ""} icon={User} />
                  <InfoItem label="Phone" value={supplier.phone || ""} icon={Phone} />
                  <InfoItem label="WhatsApp" value={supplier.whatsapp || ""} icon={MessageCircle} />
                  <InfoItem label="Email" value={supplier.email || ""} />
                  <InfoItem label="GST number" value={supplier.gstNumber || ""} icon={Hash} />
                  <div className="flex min-h-full min-w-0 flex-col gap-1.5 rounded-lg bg-slate-50/80 px-3 py-2.5 dark:bg-slate-900/40 lg:col-span-full xl:col-span-2">
                    <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <Landmark className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Bank details
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground">
                      {supplier.bankDetails?.trim() || "—"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {supplierDetailsOpen ? (
              <div
                id="supplier-details-extras"
                role="region"
                aria-labelledby="supplier-details-toggle"
                className="border-t border-slate-200/80 px-4 pb-6 pt-4 sm:px-6 dark:border-slate-800/80"
              >
                <Card className="border-slate-200/90 shadow-sm">
                  <CardContent className="grid min-w-0 grid-cols-1 gap-4 pt-6 lg:grid-cols-2 xl:grid-cols-12 xl:grid-rows-1 xl:gap-6 [&>*]:min-w-0">
                    <div
                      className={`flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-50/80 px-3 py-2.5 dark:bg-slate-900/40 ${hasSupplierNotes ? "xl:col-span-4" : "xl:col-span-6"}`}
                    >
                      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Address
                      </p>
                      <p className="break-words text-sm font-medium leading-snug text-foreground">
                        {supplier.address?.trim() || "—"}
                      </p>
                    </div>
                    <div
                      className={`flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-50/80 px-3 py-2.5 dark:bg-slate-900/40 ${hasSupplierNotes ? "xl:col-span-4" : "xl:col-span-6"}`}
                    >
                      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Categories
                      </p>
                      {categories.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {categories.map((c: string) => (
                            <Badge key={c} variant="secondary" className="font-normal">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                      )}
                    </div>
                    {hasSupplierNotes ? (
                      <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-50/80 px-3 py-2.5 dark:bg-slate-900/40 lg:col-span-full xl:col-span-4">
                        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          <StickyNote className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Notes
                        </p>
                        <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground">
                          {supplierNotesTrimmed}
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>

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
                    <div className="overflow-x-auto rounded-lg border border-slate-200/80">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                            <TableHead className="w-[52px]">Type</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderHistory.map((row) => (
                            <TableRow key={`${row.kind}-${row._id}`}>
                              <TableCell>
                                <Badge variant="outline" className="font-normal">
                                  {row.kind === "purchase_order" ? "PO" : "PI"}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                {row.reference?.trim() ? row.reference : "—"}
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
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
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
                    <div className="overflow-x-auto rounded-lg border border-amber-200/60 bg-amber-50/25 dark:border-amber-900/50 dark:bg-amber-950/20">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-amber-50/50 hover:bg-amber-50/50 dark:bg-amber-950/30">
                            <TableHead>Reference</TableHead>
                            <TableHead>Due date</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {openPayables.map((p: any) => {
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
                    <div className="overflow-x-auto rounded-lg border border-slate-200/80">
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
                          {paymentTimeline.map((row: any) => (
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
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
