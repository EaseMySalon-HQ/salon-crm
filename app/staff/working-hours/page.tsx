"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { PlanFeaturePageGate } from "@/components/plan/plan-feature-page-gate"
import { StaffWorkingHoursContent } from "@/components/staff/staff-working-hours-content"

export default function StaffWorkingHoursPage() {
  return (
    <ProtectedRoute requiredModule="staff">
      <ProtectedLayout>
        <PlanFeaturePageGate
          featureId="attendance"
          title="Timesheets"
          description="Export staff timesheets and track working hours. Available on the Growth plan and above."
        >
          <StaffWorkingHoursContent />
        </PlanFeaturePageGate>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
