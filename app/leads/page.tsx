import { LeadsListPage } from "@/components/leads/leads-list"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { PlanFeaturePageGate } from "@/components/plan/plan-feature-page-gate"

export default function LeadsPage() {
  return (
    <ProtectedRoute requiredModule="lead_management">
      <ProtectedLayout>
        <PlanFeaturePageGate
          featureId="lead_management"
          title="Lead Management"
          description="Capture, track, and convert salon leads with follow-ups. Available on Growth and Pro plans."
        >
          <LeadsListPage />
        </PlanFeaturePageGate>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
