import { AnalyticsPageContent } from "@/components/analytics/analytics-page-content"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { FeatureGate } from "@/components/ui/feature-gate"

export default function AnalyticsPage() {
  return (
    <ProtectedRoute requiredModule="analytics">
      <ProtectedLayout>
        <FeatureGate
          featureId="analytics"
          upgradeMessage="Analytics is available in Professional and Enterprise plans. Upgrade to access advanced business insights and analytics."
        >
          <AnalyticsPageContent />
        </FeatureGate>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
