"use client"

import { useDashboardInit } from "@/lib/queries/dashboard"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

function DashboardFullSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6 space-y-8 animate-pulse">
      <div className="h-40 rounded-2xl bg-white/60" />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-lg bg-white/70 border border-slate-100" />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4 h-[400px] rounded-xl bg-white/70 border border-slate-100" />
        <div className="col-span-3 h-[400px] rounded-xl bg-white/70 border border-slate-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-white/70 border border-slate-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg bg-white/70 border border-slate-100" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-lg bg-white/70 border border-slate-100" />
        ))}
      </div>
    </div>
  )
}

export function DashboardGate({ children }: { children: React.ReactNode }) {
  const { isPending, isError, refetch, error } = useDashboardInit()

  if (isPending) {
    return <DashboardFullSkeleton />
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
