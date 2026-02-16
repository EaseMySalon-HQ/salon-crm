import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { SettingsPage } from "@/components/settings/settings-page"

export default function Settings() {
  return (
    <ProtectedRoute requiredModule="settings">
      <ProtectedLayout>
        <SettingsPage />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
