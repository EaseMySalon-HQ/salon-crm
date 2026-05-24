"use client"

import { useParams } from "next/navigation"

import { PackageNewPage } from "@/components/packages/package-new-page"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

function PackageEditContent() {
  const params = useParams()
  const packageId = typeof params?.id === "string" ? params.id : ""
  return <PackageNewPage packageId={packageId} />
}

export default function PackageEditRoutePage() {
  return (
    <ProtectedRoute requiredModule="sales">
      <ProtectedLayout>
        <PackageEditContent />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
