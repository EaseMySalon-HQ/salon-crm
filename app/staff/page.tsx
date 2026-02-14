"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { StaffDirectory } from "@/components/settings/staff-directory"

export default function StaffDirectoryPage() {
  return (
    <ProtectedRoute>
      <ProtectedLayout requiredRoles={["admin"]}>
        <div className="flex flex-col space-y-6">
          <StaffDirectory />
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
