import { ProtectedRoute } from "@/components/auth/protected-route"
import { ClientDetailsPage } from "@/components/clients/client-details"

interface ClientDetailsPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ClientDetailsRoute({ params }: ClientDetailsPageProps) {
  const { id } = await params
  return (
    <ProtectedRoute>
      <ClientDetailsPage clientId={id} />
    </ProtectedRoute>
  )
} 