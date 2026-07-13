"use client"

import { useRef, Suspense, useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"

import { AppointmentsCalendar } from "@/components/appointments/appointments-calendar"
import { AppointmentsCalendarGrid } from "@/components/appointments/appointments-calendar-grid"
import { AppointmentFormDrawer } from "@/components/appointments/appointment-form-drawer"
import { ServiceCheckoutDraftFloatChip } from "@/components/appointments/service-checkout-draft-float-chip"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { PageSkeleton } from "@/components/loading"
import { ProtectedRoute } from "@/components/auth/protected-route"

const VIEW_STORAGE_KEY = "appointments-view"

function AppointmentsContent() {
  const calendarRef = useRef<{ showCancelledModal: () => void }>(null)
  const gridRef = useRef<{ showCancelledModal: () => void }>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedAppointmentId = searchParams?.get("appointment") || undefined
  const appointmentPanel = searchParams?.get("panel") === "details" ? "details" : undefined

  const clearAppointmentDeepLink = useCallback(() => {
    const view = searchParams?.get("view")
    router.replace(view === "calendar" || view === "list" ? `/appointments?view=${view}` : "/appointments", {
      scroll: false,
    })
  }, [router, searchParams])

  const [formDrawerOpen, setFormDrawerOpen] = useState(false)
  const [formDrawerParams, setFormDrawerParams] = useState<{
    date?: string
    time?: string
    staffId?: string
    appointmentId?: string
    initialClientId?: string
    resumeServiceCheckoutDraft?: boolean
    resumeSavedDraftToken?: string
    openCheckoutDirectly?: boolean
  }>({})

  const openAppointmentForm = useCallback(
    (params?: {
      date?: string
      time?: string
      staffId?: string
      appointmentId?: string
      initialClientId?: string
      resumeServiceCheckoutDraft?: boolean
      resumeSavedDraftToken?: string
      openCheckoutDirectly?: boolean
    }) => {
      setFormDrawerParams(params ?? {})
      setFormDrawerOpen(true)
    },
    []
  )

  useEffect(() => {
    const formParam = searchParams?.get("form")
    const date = searchParams?.get("date")
    const time = searchParams?.get("time")
    const staffId = searchParams?.get("staffId")
    const edit = searchParams?.get("edit")
    if (formParam === "1") {
      openAppointmentForm({ date: date ?? undefined, time: time ?? undefined, staffId: staffId ?? undefined, appointmentId: edit ?? undefined })
      router.replace("/appointments", { scroll: false })
    }
  }, [searchParams, router, openAppointmentForm])

  const viewParam = searchParams?.get("view")
  const [view, setViewState] = useState<"list" | "calendar">(() => {
    if (viewParam === "calendar" || viewParam === "list") return viewParam
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(VIEW_STORAGE_KEY) as "list" | "calendar" | null
        if (stored === "calendar" || stored === "list") return stored
      } catch {
        // ignore
      }
    }
    return "list"
  })

  useEffect(() => {
    const param = searchParams?.get("view")
    if (param === "calendar" || param === "list") {
      setViewState(param)
      try {
        localStorage.setItem(VIEW_STORAGE_KEY, param)
      } catch {
        // ignore
      }
      return
    }
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY) as "list" | "calendar" | null
      if (stored === "calendar" || stored === "list") {
        setViewState(stored)
        router.replace(`/appointments?view=${stored}`, { scroll: false })
      }
    } catch {
      // ignore
    }
  }, [searchParams, router])

  const setView = (v: "list" | "calendar") => {
    setViewState(v)
    router.replace(`/appointments?view=${v}`, { scroll: false })
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v)
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7.25rem)] min-h-0 w-full bg-slate-100/80">
      <div className="flex flex-col flex-1 min-h-0 w-full max-w-full px-4 py-4">
        <div className="flex flex-col flex-1 min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 sm:p-6 transition-opacity duration-300 w-full">
          {view === "list" ? (
            <AppointmentsCalendar
              ref={calendarRef}
              initialAppointmentId={selectedAppointmentId}
              initialAppointmentPanel={appointmentPanel}
              onAppointmentDeepLinkConsumed={clearAppointmentDeepLink}
              onOpenAppointmentForm={openAppointmentForm}
              view={view}
              onSwitchView={setView}
            />
          ) : (
            <AppointmentsCalendarGrid
              ref={gridRef}
              initialAppointmentId={selectedAppointmentId}
              initialAppointmentPanel={appointmentPanel}
              onAppointmentDeepLinkConsumed={clearAppointmentDeepLink}
              onSwitchToList={() => setView("list")}
              onOpenAppointmentForm={openAppointmentForm}
              view={view}
              onSwitchView={setView}
            />
          )}
        </div>
      </div>

      <ServiceCheckoutDraftFloatChip
        hidden={formDrawerOpen}
        onResumeDraft={(meta) => {
          openAppointmentForm({
            appointmentId: meta.appointmentId ?? undefined,
            initialClientId: meta.clientId,
            resumeServiceCheckoutDraft: true,
            resumeSavedDraftToken: meta.draftRef,
          })
        }}
      />

      <AppointmentFormDrawer
        open={formDrawerOpen}
        onOpenChange={(open) => {
          setFormDrawerOpen(open)
          if (!open) {
            setFormDrawerParams((p) => ({
              ...p,
              resumeServiceCheckoutDraft: false,
              initialClientId: undefined,
              resumeSavedDraftToken: undefined,
              openCheckoutDirectly: false,
            }))
          }
        }}
        initialDate={formDrawerParams.date}
        initialTime={formDrawerParams.time}
        initialStaffId={formDrawerParams.staffId}
        appointmentId={formDrawerParams.appointmentId}
        initialClientId={formDrawerParams.initialClientId}
        resumeServiceCheckoutDraft={formDrawerParams.resumeServiceCheckoutDraft}
        resumeSavedDraftToken={formDrawerParams.resumeSavedDraftToken}
        openCheckoutDirectly={formDrawerParams.openCheckoutDirectly}
        onSuccess={() => {
          setFormDrawerOpen(false)
          window.dispatchEvent(new CustomEvent("appointments-refresh"))
        }}
      />
    </div>
  )
}

export default function AppointmentsPage() {
  return (
    <ProtectedRoute requiredModule="appointments">
      <ProtectedLayout>
        <Suspense fallback={<PageSkeleton variant="calendar" />}>
          <AppointmentsContent />
        </Suspense>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
