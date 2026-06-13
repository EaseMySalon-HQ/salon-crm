"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CommissionProfileList } from "@/components/settings/commission-profile-list"
import { StaffCommissionAssignments } from "@/components/settings/staff-commission-assignments"
import { useFeature } from "@/hooks/use-entitlements"
import { PageSkeleton } from "@/components/loading"

export default function StaffCommissionPage() {
  const router = useRouter()
  const { hasAccess, isLoading } = useFeature("incentive_management")

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      router.replace("/staff")
    }
  }, [hasAccess, isLoading, router])

  if (isLoading) {
    return (
      <ProtectedRoute requiredModule="staff">
        <ProtectedLayout>
          <PageSkeleton variant="form" />
        </ProtectedLayout>
      </ProtectedRoute>
    )
  }

  if (!hasAccess) {
    return null
  }

  return (
    <ProtectedRoute requiredModule="staff">
      <ProtectedLayout>
        <div className="flex flex-col space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Incentive Management</h1>
            <p className="text-muted-foreground">
              Configure commission profiles (by target, service, or item) and assign them to staff
            </p>
          </div>
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
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
