"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { FeatureGate } from "@/components/ui/feature-gate"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CommissionProfileList } from "@/components/settings/commission-profile-list"
import { StaffCommissionAssignments } from "@/components/settings/staff-commission-assignments"

export default function StaffCommissionPage() {
  return (
    <ProtectedRoute requiredModule="staff">
      <ProtectedLayout>
        <div className="flex flex-col space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Commission Management</h1>
            <p className="text-muted-foreground">
              Configure commission profiles, target-based incentives, and see which staff use each profile
            </p>
          </div>
          <FeatureGate
            featureId="staff_commissions"
            upgradeMessage="Staff commission tracking is available in Professional and Enterprise plans. Upgrade to configure commission profiles and track staff commissions."
          >
            <Tabs defaultValue="profiles" className="space-y-6">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="profiles">Commission profiles</TabsTrigger>
                <TabsTrigger value="assignments">Staff &amp; profiles</TabsTrigger>
              </TabsList>
              <TabsContent value="profiles" className="mt-0 outline-none">
                <CommissionProfileList />
              </TabsContent>
              <TabsContent value="assignments" className="mt-0 outline-none">
                <StaffCommissionAssignments />
              </TabsContent>
            </Tabs>
          </FeatureGate>
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
