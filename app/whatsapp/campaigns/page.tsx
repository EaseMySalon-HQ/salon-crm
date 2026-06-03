import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { WhatsAppCampaignsPage } from "@/components/whatsapp/campaigns/whatsapp-campaigns-page"

export default function Page() {
  return (
    <ProtectedRoute requiredModule="campaigns">
      <ProtectedLayout>
        <WhatsAppCampaignsPage />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
