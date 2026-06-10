"use client"

import { useQuery } from "@tanstack/react-query"
import { AuthAPI, type AuthBranchOption } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { useEntitlements } from "@/hooks/use-entitlements"
import { STALE_TIME } from "@/lib/queries/staleness"

/**
 * Shared source of truth for the current owner's active branches.
 *
 * - `isMultiBranch`: owner with 2+ branches — enables login picker and top-nav switcher
 * - `canManageBranches`: above + `multi_location` plan feature — Branch Management section
 */
export function useMyBranches() {
  const { user } = useAuth()
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements()
  const isOwner = !!user && user.isOwner === true
  const hasMultiLocation = hasFeature("multi_location")

  const query = useQuery({
    queryKey: ["auth", "my-branches"],
    queryFn: async () => {
      const res = await AuthAPI.getMyBranches()
      if (!res.success || !res.data?.branches) return [] as AuthBranchOption[]
      return res.data.branches
    },
    staleTime: STALE_TIME.auth,
    enabled: isOwner,
    retry: false,
  })

  const branches = query.data ?? []
  const isMultiBranch = isOwner && branches.length >= 2
  const canManageBranches = isMultiBranch && hasMultiLocation

  return {
    branches,
    hasMultiLocation,
    isMultiBranch,
    canManageBranches,
    isLoading: query.isLoading || entitlementsLoading,
    isFetched: query.isFetched,
    refetch: query.refetch,
  }
}
