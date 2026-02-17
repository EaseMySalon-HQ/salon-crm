import { ClientsListPage } from "@/components/clients/clients-list"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

export default function ClientsPage() {
  return (
    <ProtectedRoute requiredModule="clients">
      <ProtectedLayout>
        <ClientsListPage />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
