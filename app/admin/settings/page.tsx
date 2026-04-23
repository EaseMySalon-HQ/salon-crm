"use client"

import { Suspense } from "react"
import { AdminLayout } from "@/components/admin/admin-layout"
import { AdminSettingsPage } from "@/components/admin/admin-settings-page"

function SettingsPageFallback() {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white px-6 py-12 text-center text-sm text-slate-500">
      Loading settings…
    </div>
  )
}

export default function AdminSettings() {
  return (
    <AdminLayout>
      <Suspense fallback={<SettingsPageFallback />}>
        <AdminSettingsPage />
      </Suspense>
    </AdminLayout>
  )
}
