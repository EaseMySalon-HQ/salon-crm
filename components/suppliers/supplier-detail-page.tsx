"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SuppliersAPI } from "@/lib/api"
import { hrefPurchaseInvoiceNew, hrefSuppliersAndOrdersDefault } from "@/lib/settings-products-routes"
import { SupplierDetailView } from "@/components/suppliers/supplier-detail-view"
import { SupplierForm } from "@/components/suppliers/supplier-form"
import { POForm } from "@/components/purchase-orders/po-form"
import { useToast } from "@/hooks/use-toast"

export function SupplierDetailPage({ supplierId }: { supplierId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [supplier, setSupplier] = React.useState<any | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [showForm, setShowForm] = React.useState(false)
  const [showPOForm, setShowPOForm] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const res = await SuppliersAPI.getById(supplierId)
      if (res.success && res.data) {
        setSupplier(res.data)
      } else {
        setSupplier(null)
        toast({
          title: "Supplier not found",
          description: "This supplier may have been removed.",
          variant: "destructive",
        })
      }
    } catch {
      setSupplier(null)
      toast({ title: "Error", description: "Failed to load supplier", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [supplierId, toast])

  React.useEffect(() => {
    load()
  }, [load])

  const handleSaved = () => {
    setShowForm(false)
    load()
  }

  const handlePOClose = () => {
    setShowPOForm(false)
    load()
  }

  const backHref = hrefSuppliersAndOrdersDefault()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!supplier) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <Button variant="ghost" size="sm" className="-ml-2 mb-6" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to suppliers
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">We could not load this supplier.</p>
      </div>
    )
  }

  return (
    <>
      <SupplierDetailView
        supplier={supplier}
        headerLeading={
          <Button variant="ghost" size="sm" className="-ml-2 gap-2 text-muted-foreground hover:text-foreground" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
              Back to suppliers
            </Link>
          </Button>
        }
        onEdit={() => setShowForm(true)}
        onNewPurchaseOrder={() => setShowPOForm(true)}
        onNewPurchaseInvoice={() => router.push(hrefPurchaseInvoiceNew(null, supplier._id))}
      />

      <SupplierForm
        open={showForm}
        onOpenChange={(o) => {
          if (!o) setShowForm(false)
        }}
        supplier={supplier}
        onSaved={handleSaved}
      />

      <POForm
        open={showPOForm}
        onOpenChange={(o) => {
          if (!o) handlePOClose()
        }}
        preselectedSupplierId={supplier._id}
        onSaved={handlePOClose}
      />
    </>
  )
}
