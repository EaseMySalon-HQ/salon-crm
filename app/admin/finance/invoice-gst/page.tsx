"use client"

import { AdminLayout } from "@/components/admin/admin-layout"
import { FinanceInvoiceGstPage } from "@/components/admin/finance/invoice-gst-page"

export default function FinanceInvoiceGstRoute() {
  return (
    <AdminLayout>
      <FinanceInvoiceGstPage />
    </AdminLayout>
  )
}
