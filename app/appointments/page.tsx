"use client"

import { PlusCircle, List, Calendar } from "lucide-react"
import { useRef, Suspense, useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { AppointmentsCalendar } from "@/components/appointments/appointments-calendar"
import { AppointmentsCalendarGrid } from "@/components/appointments/appointments-calendar-grid"
import { AppointmentFormDrawer } from "@/components/appointments/appointment-form-drawer"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

const VIEW_STORAGE_KEY = "appointments-view"

function AppointmentsContent() {
  const calendarRef = useRef<{ showCancelledModal: () => void }>(null)
  const gridRef = useRef<{ showCancelledModal: () => void }>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedAppointmentId = searchParams?.get("appointment") || undefined

  const [formDrawerOpen, setFormDrawerOpen] = useState(false)
  const [formDrawerParams, setFormDrawerParams] = useState<{
    date?: string
    time?: string
    staffId?: string
    appointmentId?: string
  }>({})

  const openAppointmentForm = useCallback(
    (params?: { date?: string; time?: string; staffId?: string; appointmentId?: string }) => {
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
    <div className="min-h-screen bg-slate-100/80 px-4 py-6 w-full">
      <div className="w-full max-w-full">
        <div className="flex flex-col space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-slate-800">
                Appointments
              </h1>
              <p className="text-slate-500 text-sm">Manage and view all your appointments</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
                <Button
                  variant={view === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView("list")}
                  className={`rounded-lg transition-all duration-200 ${
                    view === "list"
                      ? "bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <List className="mr-2 h-4 w-4" />
                  List
                </Button>
                <Button
                  variant={view === "calendar" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView("calendar")}
                  className={`rounded-lg transition-all duration-200 ${
                    view === "calendar"
                      ? "bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Calendar
                </Button>
              </div>
              <Button
                onClick={() => openAppointmentForm()}
                className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-5 py-2.5 font-semibold shadow-md shadow-violet-500/20 transition-all hover:shadow-lg"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                New Appointment
              </Button>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 sm:p-6 transition-opacity duration-300 w-full">
            {view === "list" ? (
              <AppointmentsCalendar
                ref={calendarRef}
                initialAppointmentId={selectedAppointmentId}
                onOpenAppointmentForm={openAppointmentForm}
              />
            ) : (
              <AppointmentsCalendarGrid
                ref={gridRef}
                initialAppointmentId={selectedAppointmentId}
                onSwitchToList={() => setView("list")}
                onOpenAppointmentForm={openAppointmentForm}
              />
            )}
          </div>
        </div>
      </div>

      <AppointmentFormDrawer
        open={formDrawerOpen}
        onOpenChange={setFormDrawerOpen}
        initialDate={formDrawerParams.date}
        initialTime={formDrawerParams.time}
        initialStaffId={formDrawerParams.staffId}
        appointmentId={formDrawerParams.appointmentId}
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
        <Suspense fallback={
          <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-12 py-8 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading appointments...</p>
            </div>
          </div>
        }>
          <AppointmentsContent />
        </Suspense>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
