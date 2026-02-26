"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"

export default function MembershipPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/settings?section=membership")
  }, [router])

  return (
    <ProtectedRoute requiredModule="membership">
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting to Settings...</p>
        </div>
      </div>
    </ProtectedRoute>
  )
}
