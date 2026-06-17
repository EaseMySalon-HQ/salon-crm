import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { GoogleBusinessSettings } from "@/components/settings/google-business-settings"

export default function GmbReviewsPage() {
  return (
    <ProtectedRoute requiredModule="settings">
      <ProtectedLayout>
        <div className="min-h-screen bg-slate-50/80 p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Google Business Reviews</h1>
            <p className="text-sm text-slate-500 mt-1">Manage and reply to your Google reviews</p>
          </div>
          <GoogleBusinessSettings />
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
