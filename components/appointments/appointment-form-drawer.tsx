"use client"

import { ArrowLeft } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AppointmentForm } from "@/components/appointments/appointment-form"
import { ClientDetailPanel } from "@/components/appointments/client-detail-panel"
import { getAppointmentStatusSheetHeaderClass } from "@/lib/appointment-calendar-helpers"
import { useToast } from "@/hooks/use-toast"
import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react"
import type { Client } from "@/lib/client-store"

export interface AppointmentFormDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate?: string
  initialTime?: string
  initialStaffId?: string
  appointmentId?: string
  /** Pre-load client when resuming a new-appointment checkout draft from the calendar chip. */
  initialClientId?: string
  /** After open: fetch client if needed and restore checkout from localStorage draft. */
  resumeServiceCheckoutDraft?: boolean
  /** Token from calendar pill (`draftRef`) paired with resume flag. */
  resumeSavedDraftToken?: string
  /** Open Add to Cart immediately (Quick Sale) — skip appointment service selection. */
  openCheckoutDirectly?: boolean
  onSuccess?: () => void
}

export function AppointmentFormDrawer({
  open,
  onOpenChange,
  initialDate,
  initialTime,
  initialStaffId,
  appointmentId,
  initialClientId,
  resumeServiceCheckoutDraft = false,
  resumeSavedDraftToken,
  openCheckoutDirectly = false,
  onSuccess,
}: AppointmentFormDrawerProps) {
  const { toast } = useToast()
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [panelVisible, setPanelVisible] = useState(false)
  const [formOpenKey, setFormOpenKey] = useState(0)
  const [serviceCheckoutOpen, setServiceCheckoutOpen] = useState(false)
  const [checkoutPaymentStep, setCheckoutPaymentStep] = useState(false)
  const postPaymentModalActiveRef = useRef(false)
  const serviceCheckoutPaymentBackRef = useRef<(() => void) | null>(null)
  const [drawerHeaderEnd, setDrawerHeaderEnd] = useState<ReactNode>(null)
  const [drawerHeaderStatusTone, setDrawerHeaderStatusTone] = useState<string | null>(null)
  const [drawerSelectedServiceCount, setDrawerSelectedServiceCount] = useState(1)
  const [editAppointmentDirty, setEditAppointmentDirty] = useState(false)

  const showClientDetailPanel = !!(selectedClient && !serviceCheckoutOpen)
  const drawerMultiServices = drawerSelectedServiceCount > 1

  const sheetMaxWidth = useMemo(() => {
    if (serviceCheckoutOpen) {
      return drawerMultiServices ? "72rem" : "64rem"
    }
    if (showClientDetailPanel) {
      return drawerMultiServices ? "72rem" : "64rem"
    }
    if (drawerMultiServices) return "48rem"
    return "36rem"
  }, [serviceCheckoutOpen, showClientDetailPanel, drawerMultiServices])

  const formContentMaxWidth = useMemo(() => {
    if (serviceCheckoutOpen) return undefined
    if (drawerMultiServices) return "48rem"
    return "36rem"
  }, [serviceCheckoutOpen, drawerMultiServices])

  useEffect(() => {
    if (!open) {
      setServiceCheckoutOpen(false)
      setCheckoutPaymentStep(false)
      setDrawerHeaderStatusTone(null)
      setDrawerSelectedServiceCount(1)
      setEditAppointmentDirty(false)
    }
  }, [open])

  useEffect(() => {
    if (!serviceCheckoutOpen) setCheckoutPaymentStep(false)
  }, [serviceCheckoutOpen])

  useEffect(() => {
    if (!appointmentId) {
      setDrawerHeaderStatusTone(null)
    }
  }, [appointmentId])

  useEffect(() => {
    setServiceCheckoutOpen(false)
  }, [appointmentId])

  // Reset form and client panel when opening for new appointment (no appointmentId),
  // unless we're resuming a saved checkout draft from the calendar chip.
  useEffect(() => {
    if (open && !appointmentId && !resumeServiceCheckoutDraft && !openCheckoutDirectly) {
      setFormOpenKey((k) => k + 1)
      setSelectedClient(null)
      setPanelVisible(false)
      setServiceCheckoutOpen(false)
    }
  }, [open, appointmentId, resumeServiceCheckoutDraft, openCheckoutDirectly])

  useEffect(() => {
    if (open && openCheckoutDirectly && !appointmentId) {
      setFormOpenKey((k) => k + 1)
      setServiceCheckoutOpen(true)
    }
  }, [open, openCheckoutDirectly, appointmentId])

  useEffect(() => {
    if (open && resumeServiceCheckoutDraft) {
      setFormOpenKey((k) => k + 1)
    }
  }, [open, resumeServiceCheckoutDraft])

  const handleClientSelect = useCallback((client: Client | null) => {
    setSelectedClient(client)
    if (!client) setPanelVisible(false)
  }, [])

  useEffect(() => {
    if (!selectedClient) return
    const t = setTimeout(() => setPanelVisible(true), 60)
    return () => clearTimeout(t)
  }, [selectedClient])

  const handleSuccess = useCallback(() => {
    onSuccess?.()
    onOpenChange(false)
  }, [onSuccess, onOpenChange])

  const handleCancel = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const handleServiceCheckoutOpenChange = useCallback(
    (next: boolean) => {
      setServiceCheckoutOpen(next)
      if (openCheckoutDirectly && !next && !postPaymentModalActiveRef.current) {
        onOpenChange(false)
      }
    },
    [openCheckoutDirectly, onOpenChange]
  )

  const handleSheetOpenChange = useCallback(
    (next: boolean) => {
      if (!next && appointmentId && editAppointmentDirty) {
        toast({
          title: "Unsaved changes",
          description: "Use Cancel to discard your edits, or Update Appointment to save.",
        })
        return
      }
      onOpenChange(next)
    },
    [appointmentId, editAppointmentDirty, onOpenChange, toast]
  )

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent
        side="right"
        style={{ maxWidth: sheetMaxWidth }}
        className={cn(
          "w-full overflow-hidden p-0 flex flex-col motion-reduce:transition-none transition-[max-width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        <div className="flex h-full overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <SheetHeader
              className={cn(
                "px-6 py-4 shrink-0 sm:pr-14 border-b",
                serviceCheckoutOpen && "space-y-0",
                !serviceCheckoutOpen && "flex flex-col space-y-0 text-left",
                serviceCheckoutOpen || !appointmentId || drawerHeaderStatusTone == null
                  ? "border-border/60"
                  : getAppointmentStatusSheetHeaderClass(drawerHeaderStatusTone),
              )}
            >
              {serviceCheckoutOpen ? (
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
                      if (openCheckoutDirectly) {
                        onOpenChange(false)
                        return
                      }
                      setServiceCheckoutOpen(false)
                    }}
                    aria-label={
                      checkoutPaymentStep
                        ? "Back to cart items"
                        : openCheckoutDirectly
                          ? "Close checkout"
                          : "Back to appointment"
                    }
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <SheetTitle className="text-base font-semibold tracking-tight">
                    {checkoutPaymentStep ? "Select Payment" : "Add to Cart"}
                  </SheetTitle>
                </div>
              ) : (
                <div className="flex flex-row items-center justify-between gap-3 w-full min-w-0">
                  <SheetTitle className="text-base font-semibold tracking-tight shrink min-w-0">
                    {appointmentId ? "Edit Appointment" : "New Appointment"}
                  </SheetTitle>
                  {appointmentId ? <div className="shrink-0 flex items-center">{drawerHeaderEnd}</div> : null}
                </div>
              )}
            </SheetHeader>
            <div
              style={formContentMaxWidth ? { maxWidth: formContentMaxWidth } : undefined}
              className={cn(
                "flex-1 min-h-0 p-4 sm:p-5 flex flex-col w-full mx-auto motion-reduce:transition-none transition-[max-width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
              )}
            >
              <AppointmentForm
                key={
                  appointmentId
                    ? `form-edit-${appointmentId}`
                    : `form-new-${formOpenKey}`
                }
                variant="drawer"
                initialDate={initialDate}
                initialTime={initialTime}
                initialStaffId={initialStaffId}
                appointmentId={appointmentId}
                onClientSelect={handleClientSelect}
                onSuccess={handleSuccess}
                onCancel={handleCancel}
                serviceCheckoutOpen={serviceCheckoutOpen}
                onServiceCheckoutOpenChange={handleServiceCheckoutOpenChange}
                onServiceCheckoutPaymentStepChange={setCheckoutPaymentStep}
                serviceCheckoutPaymentBackRef={serviceCheckoutPaymentBackRef}
                initialClientIdForPrefill={initialClientId}
                resumeServiceCheckoutDraft={resumeServiceCheckoutDraft}
                resumeSavedDraftToken={resumeSavedDraftToken}
                openCheckoutDirectly={openCheckoutDirectly}
                onDrawerHeaderEndChange={setDrawerHeaderEnd}
                onDrawerHeaderStatusToneChange={setDrawerHeaderStatusTone}
                onDrawerSelectedServiceCountChange={setDrawerSelectedServiceCount}
                onEditAppointmentDirtyChange={setEditAppointmentDirty}
                onPostPaymentModalActiveChange={(active) => {
                  postPaymentModalActiveRef.current = active
                }}
              />
            </div>
          </div>
          {showClientDetailPanel && (
            <aside
              className="w-full min-w-0 overflow-y-auto border-l border-slate-200/80 bg-slate-50/50 shrink-0"
              style={{
                width: 480,
                opacity: panelVisible ? 1 : 0,
                transition: "opacity 220ms ease-out",
              }}
            >
              <div className="p-4">
                <ClientDetailPanel client={selectedClient} />
              </div>
            </aside>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
