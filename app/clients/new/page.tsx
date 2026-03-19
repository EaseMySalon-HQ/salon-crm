import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ClientForm } from "@/components/clients/client-form"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

export default function NewClientPage() {
  return (
    <ProtectedRoute requiredModule="clients">
      <ProtectedLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <Button asChild variant="outline" size="icon">
                <Link href="/clients">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Add new client</h1>
                <p className="text-sm text-slate-600 mt-1">Enter client details to add them to your directory.</p>
              </div>
            </div>

            <ClientForm />
          </div>
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
