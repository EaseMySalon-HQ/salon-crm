"use client"

import { Suspense, useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AppointmentForm } from "@/components/appointments/appointment-form"
import { ClientDetailPanel } from "@/components/appointments/client-detail-panel"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import type { Client } from "@/lib/client-store"

const LAYOUT_TRANSITION_MS = 320
const PANEL_FADE_MS = 220
const LG_BREAKPOINT = 1024

function useIsLg() {
  const [isLg, setIsLg] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`)
    const update = () => setIsLg(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])
  return isLg
}

function NewAppointmentContent() {
  const searchParams = useSearchParams()
  const initialDate = searchParams?.get("date") ?? undefined
  const initialTime = searchParams?.get("time") ?? undefined
  const initialStaffId = searchParams?.get("staffId") ?? undefined
  const editAppointmentId = searchParams?.get("edit") ?? undefined
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [panelVisible, setPanelVisible] = useState(false)
  const isLg = useIsLg()

  const handleClientSelect = useCallback((client: Client | null) => {
    setSelectedClient(client)
    if (!client) setPanelVisible(false)
  }, [])

  useEffect(() => {
    if (!selectedClient) return
    const t = setTimeout(() => setPanelVisible(true), 60)
    return () => clearTimeout(t)
  }, [selectedClient])

  const form = (
    <AppointmentForm
      key={editAppointmentId ? `form-edit-${editAppointmentId}` : initialDate && initialTime ? `form-${initialDate}-${initialTime}-${initialStaffId ?? ""}` : "form-new"}
      initialDate={initialDate}
      initialTime={initialTime}
      initialStaffId={initialStaffId}
      appointmentId={editAppointmentId}
      onClientSelect={handleClientSelect}
    />
  )

  const hasPanel = !!selectedClient
  const gridCols = isLg
    ? hasPanel
      ? "minmax(0, 2fr) minmax(320px, 1fr)"
      : "1fr 0fr"
    : "1fr"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4 sm:p-6 flex flex-col space-y-6 w-full max-w-full">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="icon">
          <Link href="/appointments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div
        className="grid gap-8 w-full max-w-full items-start overflow-hidden flex-1 min-h-0"
        style={{
          gridTemplateColumns: gridCols,
          transition: `grid-template-columns ${LAYOUT_TRANSITION_MS}ms ease-out`,
        }}
      >
        <div className="min-w-0 w-full">{form}</div>
        <aside className="w-full min-w-0 overflow-hidden lg:sticky lg:top-6 lg:z-10">
          <div
            className="w-full min-w-0 h-full"
            style={{
              opacity: hasPanel && panelVisible ? 1 : 0,
              transition: `opacity ${PANEL_FADE_MS}ms ease-out`,
            }}
          >
            {hasPanel && selectedClient ? (
              <ClientDetailPanel client={selectedClient} />
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function NewAppointmentPage() {
  return (
    <ProtectedRoute requiredModule="appointments">
      <ProtectedLayout>
        <Suspense fallback={
          <div className="flex flex-col space-y-6">
            <div className="flex items-center gap-4">
              <Button asChild variant="outline" size="icon">
                <Link href="/appointments">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          </div>
        }>
          <NewAppointmentContent />
        </Suspense>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
