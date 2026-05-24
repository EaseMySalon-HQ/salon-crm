import { PackageNewPage } from "@/components/packages/package-new-page"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

export default function PackageNewRoutePage() {
  return (
    <ProtectedRoute requiredModule="sales">
      <ProtectedLayout>
        <PackageNewPage />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
