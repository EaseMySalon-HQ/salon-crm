import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { StaffForm } from "@/components/staff/staff-form"

export default function NewStaffPage() {
  return (
    <ProtectedRoute requiredModule="staff">
      <ProtectedLayout>
        <div className="flex flex-col space-y-6 min-h-0 flex-1 overflow-y-auto">
              <div className="flex items-center gap-4 shrink-0">
                <Button asChild variant="outline" size="icon">
                  <Link href="/settings">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">Add New Staff Member</h1>
              </div>
              <div className="max-w-2xl pb-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Staff Information</CardTitle>
                    <CardDescription>Add a new staff member to your salon team</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <StaffForm />
                  </CardContent>
                </Card>
              </div>
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
