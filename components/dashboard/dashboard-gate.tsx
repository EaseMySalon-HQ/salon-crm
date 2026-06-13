"use client"

import { useDashboardInit } from "@/lib/queries/dashboard"
import { Button } from "@/components/ui/button"
import { PageSkeleton } from "@/components/loading"
import { AlertCircle } from "lucide-react"

export function DashboardGate({ children }: { children: React.ReactNode }) {
  const { isPending, isError, refetch, error } = useDashboardInit()

  if (isPending) {
    return <PageSkeleton variant="dashboard" />
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50/90 p-6 flex flex-col gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-amber-700 mx-auto" />
          <p className="text-amber-950 text-sm">
            {error instanceof Error ? error.message : "Could not load dashboard data."}
          </p>
          <Button type="button" variant="outline" onClick={() => refetch()} className="border-amber-400">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
