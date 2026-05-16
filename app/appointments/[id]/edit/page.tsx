"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { ProtectedRoute } from "@/components/auth/protected-route"

export default function EditAppointmentRedirect() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  useEffect(() => {
    if (id) {
      // Open the appointment drawer directly on /appointments rather than bouncing through /appointments/new,
      // so that route's "create" permission gate doesn't block users who only have "edit".
      router.replace(`/appointments?form=1&edit=${id}`)
    } else {
      router.replace("/appointments")
    }
  }, [id, router])

  return (
    <ProtectedRoute requiredModule="appointments" requiredFeature="edit">
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    </ProtectedRoute>
  )
}
