import Link from "next/link"
import { Award } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UsersTable } from "@/components/users/users-table"
import { ProtectedLayout } from "@/components/layout/protected-layout"

export default function UsersPage() {
  return (
    <ProtectedLayout requiredRoles={['admin']}>
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Staff Directory</h1>
            <p className="text-muted-foreground">
              Manage staff accounts and their access permissions
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/staff/commission">
              <Award className="h-4 w-4 mr-2" />
              Commission Management
            </Link>
          </Button>
        </div>
        <UsersTable />
      </div>
    </ProtectedLayout>
  )
} 