"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Building2 } from "lucide-react"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { BranchManagementTabsNav } from "@/components/branch-management/branch-management-sub-nav"
import { useAuth } from "@/lib/auth-context"
import { useMyBranches } from "@/hooks/use-my-branches"
import { useEntitlements } from "@/hooks/use-entitlements"
import { toast } from "@/components/ui/use-toast"

function BranchManagementGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user } = useAuth()
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements()
  const { canManageBranches, isFetched } = useMyBranches()
  const isOwner = !!user && user.isOwner === true
  const hasMultiLocation = hasFeature("multi_location")
  const denied =
    isFetched && !entitlementsLoading && (!isOwner || !canManageBranches)

  useEffect(() => {
    if (denied) {
      toast({
        title: "Branch Management unavailable",
        description: !hasMultiLocation
          ? "Upgrade your plan to enable Multi-Location Support."
          : "This section requires 2 or more active branches.",
      })
      router.replace("/dashboard")
    }
  }, [denied, hasMultiLocation, router])

  if (!isFetched || entitlementsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    )
  }

  if (denied) return null

  return (
    <div className="w-full min-w-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="mb-8">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <Building2 className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <h1 className="mb-1 text-3xl font-bold text-slate-800">Branch Management</h1>
                <p className="text-base text-slate-600">
                  Compare performance and manage all your branches in one place.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-8 border-t border-slate-100 bg-white px-8 py-4 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span>Cross-branch performance</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Staff &amp; inventory sync</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-indigo-500" />
              <span>Unified client lookup</span>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6 pb-4">
          <BranchManagementTabsNav />
        </div>
        <div className="p-6 pt-4">{children}</div>
      </div>
    </div>
  )
}

export default function BranchManagementLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedLayout requiredModule="dashboard">
      <BranchManagementGate>{children}</BranchManagementGate>
    </ProtectedLayout>
  )
}
