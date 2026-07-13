"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/auth-context"
import { GMB_BUNDLE_ID, hasGmbBundle } from "@/lib/plan-feature-bundles"

interface PlanInfo {
  planId: string
  planName: string
  description: string
  billingPeriod: string
  renewalDate: string | null
  isTrial: boolean
  trialEndsAt: string | null
  features: string[]
  limits: {
    locations: number
    staff: number
    whatsappMessages: number
    smsMessages: number
  }
  support: {
    email: boolean
    phone: boolean
    priority: boolean
  }
  hasOverrides: boolean
  overridesExpiresAt: string | null
  addons: {
    whatsapp?: { enabled: boolean; quota: number; used: number }
    sms?: { enabled: boolean; quota: number; used: number }
    waba?: { enabled: boolean; quota: number; used: number }
  }
  monthlyPrice?: number | null
  yearlyPrice?: number | null
  name?: string
  // Scheduled downgrade waiting to apply at the next renewal.
  pendingPlanId?: string | null
  pendingBillingPeriod?: string | null
  pendingEffectiveAt?: string | null
}

interface Entitlements {
  planInfo: PlanInfo | null
  hasFeature: (featureId: string) => boolean
  getLimit: (limitName: string) => number
  canUseAddon: (addonId: string) => boolean
  getAddonStatus: (addonId: string) => { enabled: boolean; quota: number; used: number; remaining: number }
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

/**
 * Stable React Query key for the current business's entitlements. All
 * `useEntitlements`/`useFeature`/`FeatureGate` consumers share this key so the
 * plan is fetched ONCE and cached, instead of every gated component issuing its
 * own `/api/business/plan` request.
 */
export const ENTITLEMENTS_QUERY_KEY = (branchId?: string | null) => [
  'entitlements',
  branchId || 'none',
] as const

async function fetchPlanInfo(): Promise<PlanInfo> {
  const response = await fetch(`${API_URL}/business/plan`, {
    credentials: 'include',
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.success) {
    const err = new Error(data?.error || 'Failed to fetch plan info') as Error & { status?: number }
    err.status = response.status
    throw err
  }
  return data.data.plan as PlanInfo
}

/**
 * Invalidate the shared entitlements cache. Call after any action that can
 * change the current business's plan/features (checkout, downgrade, etc.) so
 * every gated component re-resolves access.
 */
export function useInvalidateEntitlements() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['entitlements'] })
}

export function useEntitlements(): Entitlements {
  const { user } = useAuth()
  const branchId = user?.branchId || null

  const {
    data: planInfo = null,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ENTITLEMENTS_QUERY_KEY(branchId),
    queryFn: fetchPlanInfo,
    enabled: Boolean(branchId),
    retry: (failureCount, error) => {
      const status = (error as Error & { status?: number })?.status
      if (status === 429) return false
      return failureCount < 2
    },
    // Entitlements change rarely; align with auth/me staleness and let explicit
    // invalidation drive freshness after plan changes.
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })

  const hasFeature = (featureId: string): boolean => {
    if (!planInfo) return false
    if (featureId === GMB_BUNDLE_ID) {
      return hasGmbBundle(planInfo.features)
    }
    return planInfo.features.includes(featureId)
  }

  const getLimit = (limitName: string): number => {
    if (!planInfo) return 0
    return planInfo.limits[limitName as keyof typeof planInfo.limits] || 0
  }

  const canUseAddon = (addonId: string): boolean => {
    if (!planInfo) return false
    const addon = planInfo.addons[addonId as keyof typeof planInfo.addons]
    if (!addon) return false
    return addon.enabled && (addon.quota === Infinity || (addon.used || 0) < addon.quota)
  }

  const getAddonStatus = (addonId: string) => {
    if (!planInfo) {
      return { enabled: false, quota: 0, used: 0, remaining: 0 }
    }

    const addon = planInfo.addons[addonId as keyof typeof planInfo.addons]
    if (!addon) {
      return { enabled: false, quota: 0, used: 0, remaining: 0 }
    }

    const quota = addon.quota || 0
    const used = addon.used || 0
    const remaining = quota === Infinity ? Infinity : Math.max(0, quota - used)

    return {
      enabled: addon.enabled || false,
      quota,
      used,
      remaining,
    }
  }

  return {
    planInfo,
    hasFeature,
    getLimit,
    canUseAddon,
    getAddonStatus,
    isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    refetch: async () => {
      await refetch()
    },
  }
}

/**
 * Hook to check if a specific feature is available
 * Returns a simple boolean and loading state
 */
export function useFeature(featureId: string) {
  const { hasFeature, isLoading } = useEntitlements()
  return {
    hasAccess: hasFeature(featureId),
    isLoading,
  }
}

/**
 * Hook to check addon availability
 */
export function useAddon(addonId: string) {
  const { canUseAddon, getAddonStatus, isLoading } = useEntitlements()
  return {
    canUse: canUseAddon(addonId),
    status: getAddonStatus(addonId),
    isLoading,
  }
}

