"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { Loader2 } from "lucide-react"

export default function EditAppointmentRedirect() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  useEffect(() => {
    if (id) {
      router.replace(`/appointments/new?edit=${id}`)
    } else {
      router.replace("/appointments")
    }
  }, [id, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
    </div>
  )
}
