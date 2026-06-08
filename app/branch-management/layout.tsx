"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
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
    <div className="w-full min-w-0 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Branch Management</h1>
        <p className="text-sm text-slate-500">
          Compare performance and manage all your branches in one place.
        </p>
      </div>
      <BranchManagementTabsNav />
      {children}
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
