"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Package, Loader2, Circle } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { PurchaseOrdersAPI } from "@/lib/api"
import { hrefPurchaseInvoiceNew } from "@/lib/settings-products-routes"
import { format } from "date-fns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { GRNModal } from "./grn-modal"

function poHasOutstandingReceiptGap(po: any): boolean {
  if (!po?.items?.length) return false
  const receivedMap: Record<string, number> = {}
  for (const ri of po.receivedItems || []) {
    const pid = (ri.productId?._id || ri.productId)?.toString?.() ?? ""
    if (pid) receivedMap[pid] = parseFloat(String(ri.receivedQty)) || 0
  }
  return po.items.some((item: any) => {
    const pid = (item.productId?._id || item.productId)?.toString?.() ?? ""
    const ordered = parseFloat(String(item.quantity)) || 0
    const rec = pid ? receivedMap[pid] || 0 : 0
    return rec < ordered - 1e-9
  })
}

interface PODetailDrawerProps {
  po: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefresh?: () => void
}

export function PODetailDrawer({ po, open, onOpenChange, onRefresh }: PODetailDrawerProps) {
  const router = useRouter()
  const [detail, setDetail] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(false)
  const [showGRN, setShowGRN] = React.useState(false)

  React.useEffect(() => {
    if (open && po?._id) {
      setLoading(true)
      PurchaseOrdersAPI.getById(po._id)
        .then((r) => {
          if (r.success) setDetail(r.data)
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [open, po?._id])

  const canReceive =
    detail &&
    !["fully_received", "received", "cancelled"].includes(detail.status) &&
    poHasOutstandingReceiptGap(detail)

  const handleGRNSuccess = () => {
    setShowGRN(false)
    PurchaseOrdersAPI.getById(po._id).then((r) => {
      if (r.success) setDetail(r.data)
    })
    onRefresh?.()
    router.push(hrefPurchaseInvoiceNew(po._id))
  }

  if (!po) return null

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    ordered: "secondary",
    sent: "outline",
    partially_received: "default",
    received: "default",
    fully_received: "default",
    cancelled: "destructive",
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {po.poNumber}
              <Badge variant={statusColors[po.status] || "secondary"}>
                {po.status?.replace(/_/g, " ")}
              </Badge>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : detail ? (
              <>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Supplier</h4>
                  <p className="font-medium">
                    {detail.supplierId?.name || (typeof detail.supplierId === "object" ? detail.supplierId?.name : "-")}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Order Date</h4>
                    <p>{format(new Date(detail.orderDate), "dd MMM yyyy")}</p>
                  </div>
                  {detail.expectedDeliveryDate && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Expected Delivery</h4>
                      <p>{format(new Date(detail.expectedDeliveryDate), "dd MMM yyyy")}</p>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Items</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Quantities only on the PO. Landing cost and GST are recorded on the purchase invoice when goods arrive.
                  </p>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Ordered</TableHead>
                          {(detail.status === "partially_received" || detail.status === "fully_received" || detail.status === "received") && detail.receivedItems?.length > 0 && (
                            <TableHead className="text-right">Received</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(detail.items || []).map((item: any, idx: number) => {
                          const rec = (detail.receivedItems || []).find(
                            (r: any) => (r.productId?._id || r.productId)?.toString() === (item.productId?._id || item.productId)?.toString()
                          )
                          return (
                            <TableRow key={idx}>
                              <TableCell>{item.productName}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              {(detail.status === "partially_received" || detail.status === "fully_received" || detail.status === "received") && detail.receivedItems?.length > 0 && (
                                <TableCell className="text-right">
                                  {rec?.receivedQty ?? 0} / {item.quantity}
                                </TableCell>
                              )}
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {(detail.receivedAt || (detail.deliveryHistory && detail.deliveryHistory.length > 0)) && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Delivery Timeline</h4>
                    {(() => {
                      const events = detail.deliveryHistory && detail.deliveryHistory.length > 0
                        ? detail.deliveryHistory
                        : detail.receivedAt
                        ? [{
                            receivedAt: detail.receivedAt,
                            receivedItems: detail.receivedItems || [],
                            grnNotes: detail.grnNotes || '',
                            supplierInvoiceNumber: detail.supplierInvoiceNumber || "",
                          }]
                        : []
                      return events.length > 0 ? (
                        <div className="relative pl-4 border-l-2 border-muted space-y-4">
                          {[...events].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()).map((evt: any, idx: number) => (
                            <div key={idx} className="relative flex gap-3">
                              <Circle className="absolute -left-[21px] top-0.5 h-3 w-3 fill-primary text-primary" />
                              <div className="flex-1 min-w-0 pb-2">
                                <p className="text-sm font-medium">
                                  {format(new Date(evt.receivedAt), "dd MMM yyyy")}
                                </p>
                                {(evt.receivedItems || []).filter((i: any) => (i.receivedQty || 0) > 0).length > 0 && (
                                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                    {(evt.receivedItems || []).filter((i: any) => (i.receivedQty || 0) > 0).map((ri: any, i: number) => {
                                      const item = (detail.items || []).find((it: any) => (it.productId?._id || it.productId)?.toString() === (ri.productId?._id || ri.productId)?.toString())
                                      const uc = ri.unitCost || 0
                                      const showCost = uc > 0.005
                                      return (
                                        <li key={i}>
                                          {(ri.productName || item?.productName || "Product")}: {ri.receivedQty}
                                          {showCost ? ` × ₹${uc.toFixed(2)}` : ""}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                                {(evt.supplierInvoiceNumber || "").trim() ? (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Invoice no.: <span className="font-medium text-foreground">{String(evt.supplierInvoiceNumber).trim()}</span>
                                  </p>
                                ) : null}
                                {evt.grnNotes && <p className="text-xs text-muted-foreground mt-1 italic">{evt.grnNotes}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </div>
                )}

                {detail && detail.status !== "cancelled" && (
                  <div className="space-y-2">
                    {detail.deliveryHistory && detail.deliveryHistory.length > 0 && (
                      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200/80 rounded-md p-2.5">
                        Delivery quantities are recorded here; stock increases when you post the purchase invoice for this shipment with matching received qty.
                      </p>
                    )}
                    {canReceive && (
                      <div className="flex flex-col gap-2">
                        <Button onClick={() => setShowGRN(true)} className="w-full">
                          <Package className="h-4 w-4 mr-2" />
                          {detail.status === "partially_received" ? "Receive remaining → invoice" : "Record delivery → invoice"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {showGRN && detail && (
        <GRNModal
          open={showGRN}
          onOpenChange={setShowGRN}
          purchaseOrder={detail}
          onSuccess={handleGRNSuccess}
        />
      )}
    </>
  )
}
