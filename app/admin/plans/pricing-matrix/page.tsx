import { AdminLayout } from "@/components/admin/admin-layout"
import { PricingMatrixManager } from "@/components/admin/pricing-matrix-manager"

export default function AdminPricingMatrixPage() {
  return (
    <AdminLayout>
      <PricingMatrixManager />
    </AdminLayout>
  )
}
