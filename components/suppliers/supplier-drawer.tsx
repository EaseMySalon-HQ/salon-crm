"use client"

/**
 * Sheet wrapper for supplier detail. Kept for imports of `./supplier-drawer` after the
 * standalone drawer file was removed — full-page detail is still available via `hrefSupplierDetail`.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SuppliersAPI } from "@/lib/api"
import { hrefPurchaseInvoiceNew } from "@/lib/settings-products-routes"
import { POForm } from "@/components/purchase-orders/po-form"

import { SupplierDetailView } from "./supplier-detail-view"

export interface SupplierDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, used as the detail body (no fetch). */
  supplier?: any | null
  /** When `supplier` is absent, load this id while `open`. */
  supplierId?: string | null
  onRefresh?: () => void
  onEditSupplier?: (supplier: any) => void
}

export function SupplierDrawer({
  open,
  onOpenChange,
  supplier: supplierProp,
  supplierId: supplierIdProp,
  onRefresh,
  onEditSupplier,
}: SupplierDrawerProps) {
  const router = useRouter()
  const [supplier, setSupplier] = React.useState<any | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [showPOForm, setShowPOForm] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (supplierProp) {
      setSupplier(supplierProp)
      setLoading(false)
      return
    }
    const id = (supplierIdProp && String(supplierIdProp).trim()) || ""
    if (!id) {
      setSupplier(null)
      setLoading(false)
      return
    }
    setLoading(true)
    SuppliersAPI.getById(id)
      .then((r) => {
        if (r.success && r.data) setSupplier(r.data)
        else setSupplier(null)
      })
      .catch(() => setSupplier(null))
      .finally(() => setLoading(false))
  }, [open, supplierProp, supplierIdProp])

  const active = supplier

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl md:max-w-2xl">
          <SheetHeader className="sr-only">
            <SheetTitle>Supplier</SheetTitle>
          </SheetHeader>
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : active ? (
            <SupplierDetailView
              supplier={active}
              onEdit={
                onEditSupplier
                  ? () => {
                      onEditSupplier(active)
                      onOpenChange(false)
                    }
                  : undefined
              }
              onNewPurchaseOrder={() => setShowPOForm(true)}
              onNewPurchaseInvoice={() => router.push(hrefPurchaseInvoiceNew(null, active._id))}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Supplier could not be loaded.</p>
          )}
        </SheetContent>
      </Sheet>

      {showPOForm && active?._id ? (
        <POForm
          open={showPOForm}
          onOpenChange={(o) => {
            if (!o) setShowPOForm(false)
          }}
          preselectedSupplierId={active._id}
          onSaved={() => {
            setShowPOForm(false)
            onRefresh?.()
          }}
        />
      ) : null}
    </>
  )
}
