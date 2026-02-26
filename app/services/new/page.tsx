import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ServiceForm } from "@/components/services/service-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function NewService() {
  return (
    <ProtectedRoute requiredModule="services">
      <ProtectedLayout>
        <div className="max-w-2xl mx-auto space-y-6">
              <div className="flex items-center gap-4">
                <Link href="/settings?section=services">
                  <Button variant="ghost" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Services
                  </Button>
                </Link>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Create New Service</CardTitle>
                  <CardDescription>Add a new service to your salon&apos;s offerings</CardDescription>
                </CardHeader>
                <CardContent>
                  <ServiceForm />
                </CardContent>
              </Card>
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
