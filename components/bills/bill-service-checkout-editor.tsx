"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

import {
  ServiceCheckoutDialog,
  type ServiceCheckoutDialogHandle,
  type ServiceCheckoutLine,
} from "@/components/appointments/service-checkout-dialog"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ClientsAPI, SalesAPI, ServicesAPI, StaffDirectoryAPI } from "@/lib/api"
import type { Client } from "@/lib/client-store"
import { mapSaleToServiceCheckoutInitialState } from "@/lib/map-sale-to-service-checkout"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

type BillServiceCheckoutEditorProps = {
  billNo: string
}

export function BillServiceCheckoutEditor({ billNo }: BillServiceCheckoutEditorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutPaymentStep, setCheckoutPaymentStep] = useState(false)
  const [sale, setSale] = useState<Record<string, unknown> | null>(null)
  const [customer, setCustomer] = useState<Client | null>(null)
  const [staff, setStaff] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])

  const serviceCheckoutRef = useRef<ServiceCheckoutDialogHandle>(null)
  const serviceCheckoutPaymentBackRef = useRef<(() => void) | null>(null)

  const returnTo = searchParams.get("returnTo") || "/reports"

  useEffect(() => {
    if (!serviceCheckoutPaymentBackRef) return
    serviceCheckoutPaymentBackRef.current = () => {
      serviceCheckoutRef.current?.closePaymentStep()
    }
    return () => {
      serviceCheckoutPaymentBackRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!billNo) return
      setLoading(true)
      try {
        const [saleRes, staffRes, servicesRes] = await Promise.all([
          SalesAPI.getByBillNo(billNo),
          StaffDirectoryAPI.getAll(),
          ServicesAPI.getAll({ limit: 1000 }),
        ])

        if (cancelled) return

        if (!saleRes.success || !saleRes.data) {
          toast({
            title: "Bill not found",
            description: "The requested bill could not be loaded.",
            variant: "destructive",
          })
          router.push(returnTo)
          return
        }

        const saleData = saleRes.data as Record<string, unknown>
        setSale(saleData)
        setStaff(Array.isArray(staffRes?.data) ? staffRes.data : [])
        setServices(Array.isArray(servicesRes?.data) ? servicesRes.data : [])

        const customerId = String(saleData.customerId || saleData.clientId || "").trim()
        if (customerId) {
          try {
            const clientRes = await ClientsAPI.getById(customerId)
            if (!cancelled && clientRes.success && clientRes.data) {
              setCustomer(clientRes.data as Client)
              setCheckoutOpen(true)
              return
            }
          } catch {
            /* fall through to sale snapshot */
          }
        }

        if (!cancelled) {
          setCustomer({
            _id: customerId,
            id: customerId,
            name: String(saleData.customerName || "Customer"),
            phone: String(saleData.customerPhone || ""),
            email: String(saleData.customerEmail || ""),
          } as Client)
          setCheckoutOpen(true)
        }
      } catch (error) {
        console.error("Failed to load bill for checkout edit:", error)
        if (!cancelled) {
          toast({
            title: "Error",
            description: "Failed to load bill. Please try again.",
            variant: "destructive",
          })
          router.push(returnTo)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [billNo, returnTo, router, toast])

  const initialBillEditState = useMemo(
    () => (sale ? mapSaleToServiceCheckoutInitialState(sale) : null),
    [sale]
  )

  const initialLines: ServiceCheckoutLine[] = initialBillEditState?.lines ?? []

  const drawerMultiServices = (initialBillEditState?.lines?.length ?? 0) > 1
  const sheetMaxWidth = drawerMultiServices ? "72rem" : "64rem"

  const handleClose = useCallback(() => {
    setDrawerOpen(false)
    router.push(returnTo)
  }, [router, returnTo])

  const handleDrawerOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        handleClose()
        return
      }
      setDrawerOpen(true)
    },
    [handleClose]
  )

  const handleCheckoutOpenChange = useCallback(
    (nextOpen: boolean) => {
      setCheckoutOpen(nextOpen)
      if (!nextOpen) {
        handleClose()
      }
    },
    [handleClose]
  )

  const handleSuccessfulCheckout = useCallback(() => {
    router.push(returnTo)
  }, [router, returnTo])

  useEffect(() => {
    if (!checkoutOpen) setCheckoutPaymentStep(false)
  }, [checkoutOpen])

  useEffect(() => {
    if (!drawerOpen) {
      setCheckoutOpen(false)
      setCheckoutPaymentStep(false)
    }
  }, [drawerOpen])

  const saleId = sale ? String(sale._id || sale.id || "") : ""
  const existingBillNo = sale ? String(sale.billNo || billNo) : billNo
  const checkoutReady = !loading && !!sale && !!initialBillEditState && !!customer

  return (
    <Sheet open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
      <SheetContent
        side="right"
        style={{ maxWidth: checkoutReady ? sheetMaxWidth : "64rem" }}
        className={cn(
          "w-full overflow-hidden p-0 flex flex-col motion-reduce:transition-none transition-[max-width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        <div className="flex h-full overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <SheetHeader className="px-6 py-4 shrink-0 sm:pr-14 border-b border-border/60 space-y-0">
              <div className="flex items-center gap-2 sm:gap-3 text-left">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 -ml-1 text-foreground"
                  onClick={() => {
                    if (checkoutPaymentStep && serviceCheckoutPaymentBackRef.current) {
                      serviceCheckoutPaymentBackRef.current()
                      return
                    }
                    handleClose()
                  }}
                  aria-label={
                    checkoutPaymentStep ? "Back to cart items" : "Close checkout"
                  }
                  disabled={loading}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <SheetTitle className="text-base font-semibold tracking-tight">
                  {loading
                    ? "Loading bill…"
                    : checkoutPaymentStep
                      ? "Select Payment"
                      : "Add to Cart"}
                </SheetTitle>
              </div>
            </SheetHeader>

            <div className="relative flex flex-col min-h-0 flex-1 w-full">
              {loading || !checkoutReady ? (
                <div className="flex flex-1 items-center justify-center p-6">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                    <p className="text-sm text-muted-foreground">Loading bill checkout…</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-0" aria-hidden />
                  <ServiceCheckoutDialog
                    ref={serviceCheckoutRef}
                    variant="drawer"
                    open={checkoutOpen}
                    onOpenChange={handleCheckoutOpenChange}
                    customer={customer}
                    staff={staff}
                    catalogServices={services}
                    initialLines={initialLines}
                    appointmentDate={initialBillEditState.appointmentDate}
                    appointmentTime={initialBillEditState.appointmentTime}
                    notes={initialBillEditState.notes}
                    isEditMode={false}
                    existingGroupAppointmentIds={[]}
                    existingBookingGroupId={null}
                    existingSaleId={saleId}
                    existingBillNo={existingBillNo}
                    initialBillEditState={initialBillEditState}
                    onSuccessfulCheckout={handleSuccessfulCheckout}
                    onPaymentStepChange={setCheckoutPaymentStep}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
