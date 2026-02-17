"use client"

import * as React from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { SupplierPayablesAPI } from "@/lib/api"
import { Loader2, Circle } from "lucide-react"
import { format } from "date-fns"

interface PaymentHistoryDrawerProps {
  payable: any
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PaymentHistoryDrawer({ payable, open, onOpenChange }: PaymentHistoryDrawerProps) {
  const [detail, setDetail] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (open && payable?._id) {
      setLoading(true)
      SupplierPayablesAPI.getById(payable._id)
        .then((r) => {
          if (r.success) setDetail(r.data)
        })
        .catch(() => setDetail(null))
        .finally(() => setLoading(false))
    } else {
      setDetail(null)
    }
  }, [open, payable?._id])

  const payments = (detail?.payments || []).slice().sort(
    (a: any, b: any) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()
  )

  if (!payable) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Payment History - {payable.purchaseOrderId?.poNumber || "PO"}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <>
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p><span className="text-muted-foreground">Supplier:</span> {detail.supplierId?.name || "-"}</p>
                <p><span className="text-muted-foreground">Total:</span> ₹{(detail.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                <p><span className="text-muted-foreground">Paid:</span> ₹{(detail.amountPaid || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                <p><span className="text-muted-foreground">Status:</span> {detail.status}</p>
              </div>

              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <div>
                  <h4 className="text-sm font-medium mb-3">Payment Timeline</h4>
                  <div className="relative pl-4 border-l-2 border-muted space-y-4">
                    {payments.map((pmt: any, idx: number) => (
                      <div key={pmt._id || idx} className="relative flex gap-3">
                        <Circle className="absolute -left-[21px] top-0.5 h-3 w-3 fill-primary text-primary" />
                        <div className="flex-1 min-w-0 pb-2">
                          <p className="text-sm font-medium">
                            ₹{(pmt.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} • {pmt.paymentMethod || "Cash"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {pmt.paymentDate ? format(new Date(pmt.paymentDate), "dd MMM yyyy") : "-"}
                            {pmt.reference ? ` • ${pmt.reference}` : ""}
                          </p>
                          {pmt.notes && <p className="text-xs text-muted-foreground mt-0.5">{pmt.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
