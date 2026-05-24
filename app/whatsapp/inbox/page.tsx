import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { WhatsAppInboxPage } from "@/components/whatsapp/inbox/whatsapp-inbox-page"

export default function Page() {
  return (
    <ProtectedRoute requiredModule="campaigns">
      <ProtectedLayout>
        <WhatsAppInboxPage />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
