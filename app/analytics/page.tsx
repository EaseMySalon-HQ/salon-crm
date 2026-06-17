"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AnalyticsPageContent } from "@/components/analytics/analytics-page-content"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { useFeature } from "@/hooks/use-entitlements"
import { PageSkeleton } from "@/components/loading"

export default function AnalyticsPage() {
  const router = useRouter()
  const { hasAccess, isLoading } = useFeature("analytics")

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      router.replace("/dashboard")
    }
  }, [hasAccess, isLoading, router])

  if (isLoading) {
    return (
      <ProtectedRoute requiredModule="analytics">
        <ProtectedLayout>
          <PageSkeleton variant="dashboard" />
        </ProtectedLayout>
      </ProtectedRoute>
    )
  }

  if (!hasAccess) {
    return null
  }

  return (
    <ProtectedRoute requiredModule="analytics">
      <ProtectedLayout>
        <AnalyticsPageContent />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
