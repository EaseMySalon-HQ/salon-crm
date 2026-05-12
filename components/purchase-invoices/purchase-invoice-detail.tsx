"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PurchaseInvoicesAPI } from "@/lib/api"
import { hrefProductsSettings, hrefPurchaseInvoiceEdit, hrefSupplierPayables } from "@/lib/settings-products-routes"
import { formatPurchaseInvoiceIstDate } from "@/lib/purchase-invoice-calendar-date"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export function PurchaseInvoiceDetail({
  id,
  embeddedInModal,
  onAfterMutation,
}: {
  id: string
  embeddedInModal?: boolean
  onAfterMutation?: () => void
}) {
  const { toast } = useToast()
  const [data, setData] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(() => {
    setLoading(true)
    PurchaseInvoicesAPI.getById(id)
      .then((r) => {
        if (r.success) setData(r.data)
        else setData(null)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [id])

  React.useEffect(() => {
    load()
  }, [load])

  const stockAfterByLineIndex = React.useMemo(() => {
    if (!data) return [] as (number | null)[]
    const inv = data
    const lines = inv.lines || []
    const txs = (inv.stockTransactions || [])
      .filter(
        (t: any) =>
          t.transactionType === 'purchase_invoice' && (Number(t.quantity) || 0) > 0
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
      )
    const used = new Set<number>()
    return lines.map((l: any) => {
      const qty = Number(l.receivedQty) || 0
      if (qty <= 0) return null
      const pid = String(l.productId ?? '')
      let pick = -1
      for (let i = 0; i < txs.length; i++) {
        if (used.has(i)) continue
        if (String(txs[i].productId) === pid) {
          pick = i
          break
        }
      }
      if (pick < 0) return null
      used.add(pick)
      const n = txs[pick].newStock
      return typeof n === 'number' && !Number.isNaN(n) ? n : null
    })
  }, [data])

  const cancelPosted = async () => {
    if (!data || data.status !== "posted") return
    if (!window.confirm("Cancel this posted invoice? Stock will be reduced and the payable removed if unpaid.")) return
    const res = await PurchaseInvoicesAPI.cancel(id)
    if (res.success) {
      toast({ title: "Invoice cancelled" })
      load()
      onAfterMutation?.()
    } else {
      toast({ title: "Cancel failed", description: (res as any).error || "", variant: "destructive" })
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Invoice not found.</p>
  }

  const inv = data
  const payable = inv.payable

  return (
    <div className={embeddedInModal ? "space-y-4" : "space-y-6"}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            className={`font-semibold tracking-tight text-slate-900 flex flex-wrap items-center gap-2 ${
              embeddedInModal ? "text-lg" : "text-xl"
            }`}
          >
            {inv.invoiceNumber}
            <Badge variant={inv.status === "posted" ? "default" : inv.status === "cancelled" ? "destructive" : "outline"}>
              {inv.status}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Supplier: {inv.supplierId?.name || "—"} · Supplier inv. {inv.supplierInvoiceNumber || "—"}
          </p>
        </div>
        {inv.status === "posted" ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {payable &&
              payable._id &&
              Math.max(0, (payable.totalAmount || 0) - (payable.amountPaid || 0)) > 0.005 && (
                <Button variant="default" size="sm" asChild>
                  <Link href={hrefSupplierPayables(String(payable._id))} prefetch={false}>
                    Record payment in Payables
                  </Link>
                </Button>
              )}
            <Button variant="destructive" size="sm" onClick={cancelPosted}>
              Cancel invoice
            </Button>
          </div>
        ) : inv.status === "draft" ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={hrefPurchaseInvoiceEdit(id)} prefetch={false}>
              Edit draft
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoice date</p>
          <p>{formatPurchaseInvoiceIstDate(inv.invoiceDate)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment</p>
          <p>
            {inv.paymentStatus} · {inv.paymentMethod || "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Grand total</p>
          <p className="font-semibold">₹{(inv.grandTotal || 0).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paid / Due</p>
          <p>
            ₹{(inv.paidAmount || 0).toFixed(2)} / ₹{(inv.dueAmount ?? Math.max(0, (inv.grandTotal || 0) - (inv.paidAmount || 0))).toFixed(2)}
          </p>
        </div>
      </div>

      {inv.purchaseOrderId && (
        <div className="rounded-lg border border-slate-200/90 bg-slate-50/50 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Linked PO: </span>
          <span className="font-medium text-slate-900">{inv.purchaseOrderId?.poNumber || "—"}</span>
          <span className="text-muted-foreground"> · </span>
          <Link
            className="font-medium text-indigo-700 hover:underline"
            href={hrefProductsSettings({ productsTab: "suppliers", supplierOrdersTab: "orders" })}
            prefetch={false}
          >
            Open in Settings → Purchase Orders
          </Link>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Line items</h2>
        {/* Single CSS grid: one physical row per line so borders/heights align (two HTML tables cannot). */}
        <div className="overflow-x-auto rounded-lg border border-slate-200/90">
          <div
            role="table"
            aria-label="Line items with stock after"
            className="grid min-w-[36rem] w-full text-sm"
            style={{
              gridTemplateColumns:
                "minmax(8rem,1fr) minmax(4rem,auto) minmax(5rem,auto) minmax(3rem,auto) minmax(5rem,auto) minmax(6rem,auto)",
            }}
          >
            <div
              role="columnheader"
              className="flex h-12 items-center border-b bg-slate-50/80 px-4 align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
            >
              Product
            </div>
            <div
              role="columnheader"
              className="flex h-12 items-center justify-end border-b bg-slate-50/80 px-4 align-middle font-medium text-muted-foreground"
            >
              Quantity
            </div>
            <div
              role="columnheader"
              className="flex h-12 items-center justify-end border-b bg-slate-50/80 px-4 align-middle font-medium text-muted-foreground"
            >
              Purchase ₹
            </div>
            <div
              role="columnheader"
              className="flex h-12 items-center justify-end border-b bg-slate-50/80 px-4 align-middle font-medium text-muted-foreground"
            >
              GST %
            </div>
            <div
              role="columnheader"
              className="flex h-12 items-center justify-end border-b bg-slate-50/80 px-4 align-middle font-medium text-muted-foreground"
            >
              Line total
            </div>
            <div
              role="columnheader"
              className="flex h-12 items-center justify-end border-b border-l border-slate-200/90 bg-slate-50/80 px-4 align-middle font-medium text-muted-foreground"
            >
              Stock after
            </div>
            {(inv.lines || []).map((l: any, idx: number) => {
              const v = stockAfterByLineIndex[idx]
              const lineCount = (inv.lines || []).length
              const isLastRow = idx === lineCount - 1
              const rowBottom = cn("border-b border-slate-200", isLastRow && "border-b-0")
              return (
                <React.Fragment key={idx}>
                  <div role="cell" className={cn("p-4 align-middle text-slate-900", rowBottom)}>
                    {l.productName}
                  </div>
                  <div
                    role="cell"
                    className={cn("flex items-center justify-end p-4 align-middle", rowBottom)}
                  >
                    {l.receivedQty}
                  </div>
                  <div
                    role="cell"
                    className={cn("flex items-center justify-end p-4 align-middle", rowBottom)}
                  >
                    ₹{(l.purchasePrice || 0).toFixed(2)}
                  </div>
                  <div
                    role="cell"
                    className={cn("flex items-center justify-end p-4 align-middle", rowBottom)}
                  >
                    {l.gstRate}%
                  </div>
                  <div
                    role="cell"
                    className={cn("flex items-center justify-end p-4 align-middle", rowBottom)}
                  >
                    ₹{(l.lineTotal || 0).toFixed(2)}
                  </div>
                  <div
                    role="cell"
                    className={cn(
                      "flex items-center justify-end border-l border-slate-200/90 p-4 align-middle text-sm font-medium tabular-nums text-slate-900",
                      rowBottom
                    )}
                  >
                    {v == null ? "—" : v}
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </div>



    </div>
  )
}
