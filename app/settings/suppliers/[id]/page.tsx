import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { SupplierDetailPage } from "@/components/suppliers/supplier-detail-page"

interface Props {
  params: Promise<{ id: string }>
}

export default async function SupplierDetailRoute({ params }: Props) {
  const { id } = await params
  return (
    <ProtectedRoute requiredModule="settings">
      <ProtectedLayout>
        <SupplierDetailPage supplierId={id} />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
