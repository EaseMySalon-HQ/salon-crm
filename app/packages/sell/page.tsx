import { Suspense } from "react"
import { PackageSellPage } from "@/components/packages/package-sell-page"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

function SellFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100/80">
      <p className="text-sm text-slate-500">Loading…</p>
    </div>
  )
}

export default function PackageSellRoutePage() {
  return (
    <ProtectedRoute requiredModule="sales">
      <ProtectedLayout>
        <Suspense fallback={<SellFallback />}>
          <PackageSellPage />
        </Suspense>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
