import { Suspense } from "react"
import { PackageSellPage } from "@/components/packages/package-sell-page"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { PlanFeaturePageGate } from "@/components/plan/plan-feature-page-gate"

function SellFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100/80">
      <p className="text-sm text-slate-500">Loading…</p>
    </div>
  )
}

export default function PackageSellRoutePage() {
  return (
    <ProtectedRoute requiredModule="sales">
      <ProtectedLayout>
        <PlanFeaturePageGate
          featureId="packages"
          title="Packages"
          description="Multi-session packages and sellable bundles are available on Growth and Pro plans."
        >
          <Suspense fallback={<SellFallback />}>
            <PackageSellPage />
          </Suspense>
        </PlanFeaturePageGate>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
