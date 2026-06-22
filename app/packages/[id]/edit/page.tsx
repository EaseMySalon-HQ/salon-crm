"use client"

import { useParams } from "next/navigation"

import { PackageNewPage } from "@/components/packages/package-new-page"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { PlanFeaturePageGate } from "@/components/plan/plan-feature-page-gate"

function PackageEditContent() {
  const params = useParams()
  const packageId = typeof params?.id === "string" ? params.id : ""
  return <PackageNewPage packageId={packageId} />
}

export default function PackageEditRoutePage() {
  return (
    <ProtectedRoute requiredModule="sales">
      <ProtectedLayout>
        <PlanFeaturePageGate
          featureId="packages"
          title="Packages"
          description="Multi-session packages and sellable bundles are available on Growth and Pro plans."
        >
          <PackageEditContent />
        </PlanFeaturePageGate>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
