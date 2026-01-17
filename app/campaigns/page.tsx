import { CampaignsListPage } from "@/components/campaigns/campaigns-list"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

export default function CampaignsPage() {
  return (
    <ProtectedRoute requiredRole="manager">
      <ProtectedLayout>
        <CampaignsListPage />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}

