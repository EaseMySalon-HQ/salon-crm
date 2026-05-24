"use client"

import * as React from "react"
import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { PurchaseInvoiceList } from "@/components/purchase-invoices/purchase-invoice-list"
import { PurchaseInvoiceEditor } from "@/components/purchase-invoices/purchase-invoice-editor"
import { PurchaseInvoiceDetail } from "@/components/purchase-invoices/purchase-invoice-detail"
import {
  hrefPurchaseInvoicesList,
  isLikelyMongoId,
} from "@/lib/settings-products-routes"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function EditorFallback() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

/** Portaled Radix menus (outside `DialogContent` DOM) must not count as “outside” the dialog. */
function isInsidePortaledPickerLayer(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest("[data-pi-combobox]") ||
      target.closest("[data-radix-popover-content]") ||
      target.closest("[data-radix-select-content]") ||
      target.closest("[data-radix-dropdown-menu-content]")
  )
}

export function PurchaseInvoicesSettingsPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const piRaw = searchParams.get("pi")
  const piEdit = searchParams.get("piEdit") === "1"
  const pi = !piRaw ? null : isLikelyMongoId(piRaw) ? piRaw : null

  const [newInvoiceOpen, setNewInvoiceOpen] = React.useState(false)
  const [newInvoiceDraftId, setNewInvoiceDraftId] = React.useState<string | undefined>()
  const [newInvoicePrefillPo, setNewInvoicePrefillPo] = React.useState<string | null>(null)
  const [newInvoicePrefillSupplierId, setNewInvoicePrefillSupplierId] = React.useState<string | null>(null)
  const [listRefreshNonce, setListRefreshNonce] = React.useState(0)
  const openedFromQueryRef = React.useRef(false)
  const [invoiceDialogContentEl, setInvoiceDialogContentEl] = React.useState<HTMLElement | null>(null)

  const bumpList = React.useCallback(() => {
    setListRefreshNonce((n) => n + 1)
  }, [])

  const closeInvoiceModal = React.useCallback(() => {
    setNewInvoiceOpen(false)
    setNewInvoiceDraftId(undefined)
    setNewInvoicePrefillPo(null)
    setNewInvoicePrefillSupplierId(null)
    router.replace(hrefPurchaseInvoicesList())
    bumpList()
  }, [router, bumpList])

  React.useEffect(() => {
    if (pi) {
      setNewInvoiceOpen(false)
      setNewInvoiceDraftId(undefined)
      setNewInvoicePrefillPo(null)
      setNewInvoicePrefillSupplierId(null)
    }
  }, [pi])

  React.useEffect(() => {
    const wantNew =
      searchParams.get("newPurchaseInvoice") === "1" || searchParams.get("pi") === "new"
    if (!wantNew) {
      openedFromQueryRef.current = false
      return
    }
    if (openedFromQueryRef.current) return
    openedFromQueryRef.current = true
    const po = searchParams.get("purchaseOrderId")
    const sup = searchParams.get("purchaseInvoiceSupplierId")
    setNewInvoicePrefillPo(po)
    setNewInvoicePrefillSupplierId(sup && isLikelyMongoId(sup) ? sup : null)
    setNewInvoiceDraftId(undefined)
    setNewInvoiceOpen(true)
    router.replace(hrefPurchaseInvoicesList())
  }, [router, searchParams])

  const invoiceModalOpen = newInvoiceOpen || !!pi

  const modalTitle =
    newInvoiceOpen && !newInvoiceDraftId
      ? "New purchase invoice"
      : newInvoiceOpen && newInvoiceDraftId
        ? "Edit purchase invoice"
        : pi && piEdit
          ? "Edit purchase invoice"
          : "View purchase invoice"

  const showEditorDescription =
    newInvoiceOpen || (pi != null && piEdit)

  return (
    <div className="space-y-2">
      <PurchaseInvoiceList
        refreshNonce={listRefreshNonce}
        onOpenNewInvoiceModal={() => {
          setNewInvoicePrefillPo(null)
          setNewInvoicePrefillSupplierId(null)
          setNewInvoiceDraftId(undefined)
          setNewInvoiceOpen(true)
        }}
      />

      <Dialog
        open={invoiceModalOpen}
        onOpenChange={(open) => {
          if (!open) closeInvoiceModal()
        }}
      >
        <DialogContent
          ref={(el) => setInvoiceDialogContentEl(el)}
          className="max-h-[min(90vh,900px)] max-w-[min(98vw,85rem)] overflow-y-auto gap-0 p-0"
          onPointerDownOutside={(e) => {
            if (isInsidePortaledPickerLayer(e.target)) e.preventDefault()
          }}
          onFocusOutside={(e) => {
            if (isInsidePortaledPickerLayer(e.target)) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (isInsidePortaledPickerLayer(e.target)) e.preventDefault()
          }}
        >
          <DialogHeader className="sticky top-0 z-10 border-b border-slate-100 bg-background px-6 py-4 text-left">
            <DialogTitle>{modalTitle}</DialogTitle>
            {showEditorDescription ? (
              <DialogDescription>
                Supplier bill details and received quantities. Stock updates when you post the invoice.
              </DialogDescription>
            ) : (
              <DialogDescription>
                Supplier bill, lines, stock impact, and payment.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="px-6 py-4">
            {newInvoiceOpen ? (
              <Suspense fallback={<EditorFallback />}>
                <PurchaseInvoiceEditor
                  key={`modal-new-${newInvoiceDraftId ?? "new"}-${newInvoicePrefillPo ?? "none"}-${newInvoicePrefillSupplierId ?? "nos"}`}
                  invoiceId={newInvoiceDraftId}
                  initialPurchaseOrderId={newInvoicePrefillPo}
                  initialSupplierId={newInvoicePrefillSupplierId}
                  embeddedInModal
                  popoverPortalContainer={invoiceDialogContentEl}
                  onDraftCreated={(id) => setNewInvoiceDraftId(id)}
                  onPosted={closeInvoiceModal}
                  onRequestClose={closeInvoiceModal}
                />
              </Suspense>
            ) : pi && piEdit ? (
              <Suspense fallback={<EditorFallback />}>
                <PurchaseInvoiceEditor
                  key={`modal-edit-${pi}`}
                  invoiceId={pi}
                  embeddedInModal
                  popoverPortalContainer={invoiceDialogContentEl}
                  onPosted={closeInvoiceModal}
                  onRequestClose={closeInvoiceModal}
                />
              </Suspense>
            ) : pi ? (
              <PurchaseInvoiceDetail
                id={pi}
                embeddedInModal
                onAfterMutation={bumpList}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
