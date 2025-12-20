import { LeadsListPage } from "@/components/leads/leads-list"
import { ProtectedLayout } from "@/components/layout/protected-layout"

export default function LeadsPage() {
  return (
    <ProtectedLayout>
      <LeadsListPage />
    </ProtectedLayout>
  )
}

