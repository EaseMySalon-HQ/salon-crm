"use client"

import { Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AppointmentForm } from "@/components/appointments/appointment-form"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

function NewAppointmentContent() {
  const searchParams = useSearchParams()
  const initialDate = searchParams?.get("date") ?? undefined
  const initialTime = searchParams?.get("time") ?? undefined
  const initialStaffId = searchParams?.get("staffId") ?? undefined

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="icon">
          <Link href="/appointments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <AppointmentForm
        key={initialDate && initialTime ? `form-${initialDate}-${initialTime}-${initialStaffId ?? ""}` : "form-new"}
        initialDate={initialDate}
        initialTime={initialTime}
        initialStaffId={initialStaffId}
      />
    </div>
  )
}

export default function NewAppointmentPage() {
  return (
    <ProtectedRoute>
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
