"use client"

import Link from "next/link"
import { PlusCircle, CalendarDays } from "lucide-react"
import { useRef } from "react"
import { useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { AppointmentsCalendar } from "@/components/appointments/appointments-calendar"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

export default function AppointmentsPage() {
  const calendarRef = useRef<{ showCancelledModal: () => void }>(null)
  const searchParams = useSearchParams()
  const selectedAppointmentId = searchParams?.get("appointment") || undefined

  return (
    <ProtectedRoute>
      <ProtectedLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 px-12 py-8">
          <div className="max-w-8xl mx-auto">
            <div className="flex flex-col space-y-8">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    Appointments
                  </h1>
                  <p className="text-slate-600">Manage and view all your appointments</p>
                </div>
                <div className="flex gap-3">
                  <Button 
                    className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white rounded-xl px-6 py-3 font-semibold shadow-lg"
                    onClick={() => calendarRef.current?.showCancelledModal()}
                  >
                    <CalendarDays className="mr-2 h-5 w-5" />
                    View Cancelled
                  </Button>
                  <Button asChild className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl px-6 py-3 font-semibold shadow-lg">
                    <Link href="/appointments/new">
                      <PlusCircle className="mr-2 h-5 w-5" />
                      New Appointment
                    </Link>
                  </Button>
                </div>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8">
                <AppointmentsCalendar ref={calendarRef} initialAppointmentId={selectedAppointmentId} />
              </div>
            </div>
          </div>
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
