"use client"

import Link from "next/link"
import { PlusCircle, List, Calendar } from "lucide-react"
import { useRef, Suspense, useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { AppointmentsCalendar } from "@/components/appointments/appointments-calendar"
import { AppointmentsCalendarGrid } from "@/components/appointments/appointments-calendar-grid"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

const VIEW_STORAGE_KEY = "appointments-view"

function AppointmentsContent() {
  const calendarRef = useRef<{ showCancelledModal: () => void }>(null)
  const gridRef = useRef<{ showCancelledModal: () => void }>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedAppointmentId = searchParams?.get("appointment") || undefined

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-12 py-8">
      <div className="max-w-8xl mx-auto">
        <div className="flex flex-col space-y-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Appointments
              </h1>
              <p className="text-slate-600">Manage and view all your appointments</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <Button
                  variant={view === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView("list")}
                  className={`rounded-lg ${
                    view === "list"
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow"
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
                  className={`rounded-lg ${
                    view === "calendar"
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  Calendar
                </Button>
              </div>
              <Button asChild className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl px-6 py-3 font-semibold shadow-lg">
                <Link href="/appointments/new">
                  <PlusCircle className="mr-2 h-5 w-5" />
                  New Appointment
                </Link>
              </Button>
            </div>
          </div>
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8">
            {view === "list" ? (
              <AppointmentsCalendar ref={calendarRef} initialAppointmentId={selectedAppointmentId} />
            ) : (
              <AppointmentsCalendarGrid ref={gridRef} initialAppointmentId={selectedAppointmentId} onSwitchToList={() => setView("list")} />
            )}
          </div>
        </div>
      </div>
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
