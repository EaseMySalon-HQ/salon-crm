import { LeadsListPage } from "@/components/leads/leads-list"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

export default function LeadsPage() {
  return (
    <ProtectedRoute requiredModule="lead_management">
      <ProtectedLayout>
        <LeadsListPage />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}

