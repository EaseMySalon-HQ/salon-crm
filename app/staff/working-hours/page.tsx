"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { StaffWorkingHoursContent } from "@/components/staff/staff-working-hours-content"

export default function StaffWorkingHoursPage() {
  return (
    <ProtectedRoute requiredModule="staff">
      <ProtectedLayout>
        <StaffWorkingHoursContent />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
