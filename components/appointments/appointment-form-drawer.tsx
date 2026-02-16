"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { AppointmentForm } from "@/components/appointments/appointment-form"
import { ClientDetailPanel } from "@/components/appointments/client-detail-panel"
import { useState, useCallback, useEffect } from "react"
import type { Client } from "@/lib/client-store"

export interface AppointmentFormDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate?: string
  initialTime?: string
  initialStaffId?: string
  appointmentId?: string
  onSuccess?: () => void
}

export function AppointmentFormDrawer({
  open,
  onOpenChange,
  initialDate,
  initialTime,
  initialStaffId,
  appointmentId,
  onSuccess,
}: AppointmentFormDrawerProps) {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [panelVisible, setPanelVisible] = useState(false)

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
          selectedClient ? "sm:max-w-4xl" : "sm:max-w-2xl"
        )}
      >
        <div className="flex h-full overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <SheetHeader className="border-b border-border/60 px-6 py-4 shrink-0">
              <SheetTitle className="text-base font-semibold tracking-tight">
                {appointmentId ? "Edit Appointment" : "New Appointment"}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 p-6 flex flex-col">
              <AppointmentForm
                key={
                  appointmentId
                    ? `form-edit-${appointmentId}`
                    : initialDate && initialTime
                    ? `form-${initialDate}-${initialTime}-${initialStaffId ?? ""}`
                    : "form-new"
                }
                variant="drawer"
                initialDate={initialDate}
                initialTime={initialTime}
                initialStaffId={initialStaffId}
                appointmentId={appointmentId}
                onClientSelect={handleClientSelect}
                onSuccess={handleSuccess}
                onCancel={handleCancel}
              />
            </div>
          </div>
          {selectedClient && (
            <aside
              className="w-full min-w-0 overflow-y-auto border-l border-slate-200/80 bg-slate-50/50 shrink-0"
              style={{
                width: 400,
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
