"use client"

import { AdminLayout } from "@/components/admin/admin-layout"
import { FinanceGstReportsPage } from "@/components/admin/finance/gst-reports-page"

export default function FinanceGstReportsRoute() {
  return (
    <AdminLayout>
      <FinanceGstReportsPage />
    </AdminLayout>
  )
}
