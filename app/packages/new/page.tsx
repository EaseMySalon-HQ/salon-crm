import { PackageNewPage } from "@/components/packages/package-new-page"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { PlanFeaturePageGate } from "@/components/plan/plan-feature-page-gate"

export default function PackageNewRoutePage() {
  return (
    <ProtectedRoute requiredModule="sales">
      <ProtectedLayout>
        <PlanFeaturePageGate
          featureId="packages"
          title="Packages"
          description="Multi-session packages and sellable bundles are available on Growth and Pro plans."
        >
          <PackageNewPage />
        </PlanFeaturePageGate>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
