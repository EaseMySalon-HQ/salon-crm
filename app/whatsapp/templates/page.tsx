import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { WhatsAppTemplatesPage } from "@/components/whatsapp/templates/whatsapp-templates-page"

export default function Page() {
  return (
    <ProtectedRoute requiredModule="campaigns">
      <ProtectedLayout>
        <WhatsAppTemplatesPage />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
