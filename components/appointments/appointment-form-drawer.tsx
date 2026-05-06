"use client"

import { ArrowLeft } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AppointmentForm } from "@/components/appointments/appointment-form"
import { ClientDetailPanel } from "@/components/appointments/client-detail-panel"
import { getAppointmentStatusSheetHeaderClass } from "@/lib/appointment-calendar-helpers"
import { useState, useCallback, useEffect, type ReactNode } from "react"
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
  onSuccess,
}: AppointmentFormDrawerProps) {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [panelVisible, setPanelVisible] = useState(false)
  const [formOpenKey, setFormOpenKey] = useState(0)
  const [serviceCheckoutOpen, setServiceCheckoutOpen] = useState(false)
  const [drawerHeaderEnd, setDrawerHeaderEnd] = useState<ReactNode>(null)
  const [drawerHeaderStatusTone, setDrawerHeaderStatusTone] = useState<string | null>(null)
  const [drawerSelectedServiceCount, setDrawerSelectedServiceCount] = useState(1)

  const showClientDetailPanel = !!(selectedClient && !serviceCheckoutOpen)
  const drawerMultiServices = drawerSelectedServiceCount > 1

  useEffect(() => {
    if (!open) {
      setServiceCheckoutOpen(false)
      setDrawerHeaderStatusTone(null)
      setDrawerSelectedServiceCount(1)
    }
  }, [open])

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
    if (open && !appointmentId && !resumeServiceCheckoutDraft) {
      setFormOpenKey((k) => k + 1)
      setSelectedClient(null)
      setPanelVisible(false)
      setServiceCheckoutOpen(false)
    }
  }, [open, appointmentId, resumeServiceCheckoutDraft])

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-full overflow-hidden p-0 flex flex-col transition-[max-width] duration-200",
          serviceCheckoutOpen
            ? drawerMultiServices
              ? "sm:max-w-6xl"
              : "sm:max-w-5xl"
            : showClientDetailPanel
              ? drawerMultiServices
                ? "sm:max-w-6xl"
                : "sm:max-w-5xl"
              : drawerMultiServices
                ? "sm:max-w-3xl"
                : "sm:max-w-xl"
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
                    onClick={() => setServiceCheckoutOpen(false)}
                    aria-label="Back to appointment"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <SheetTitle className="text-base font-semibold tracking-tight">
                    Add to Cart
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
              className={cn(
                "flex-1 min-h-0 p-4 sm:p-5 flex flex-col w-full",
                !serviceCheckoutOpen &&
                  (drawerMultiServices ? "max-w-3xl mx-auto" : "max-w-xl mx-auto")
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
                onServiceCheckoutOpenChange={setServiceCheckoutOpen}
                initialClientIdForPrefill={initialClientId}
                resumeServiceCheckoutDraft={resumeServiceCheckoutDraft}
                resumeSavedDraftToken={resumeSavedDraftToken}
                onDrawerHeaderEndChange={setDrawerHeaderEnd}
                onDrawerHeaderStatusToneChange={setDrawerHeaderStatusTone}
                onDrawerSelectedServiceCountChange={setDrawerSelectedServiceCount}
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
