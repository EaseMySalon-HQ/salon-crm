"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { QuickSale } from "@/components/appointments/quick-sale"

export default function QuickSalePage() {
  return (
    <ProtectedRoute requiredModule="sales">
      <ProtectedLayout>
        <QuickSale />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
