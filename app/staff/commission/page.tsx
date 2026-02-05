"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { FeatureGate } from "@/components/ui/feature-gate"
import { CommissionProfileList } from "@/components/settings/commission-profile-list"

export default function StaffCommissionPage() {
  return (
    <ProtectedRoute>
      <ProtectedLayout>
        <div className="flex flex-col space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Commission Management</h1>
            <p className="text-muted-foreground">
              Configure commission profiles and target-based incentives
            </p>
          </div>
          <FeatureGate
            featureId="staff_commissions"
            upgradeMessage="Staff commission tracking is available in Professional and Enterprise plans. Upgrade to configure commission profiles and track staff commissions."
          >
            <CommissionProfileList />
          </FeatureGate>
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
