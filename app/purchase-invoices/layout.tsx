import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

export default function PurchaseInvoicesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredModule="products">
      <ProtectedLayout>{children}</ProtectedLayout>
    </ProtectedRoute>
  )
}
