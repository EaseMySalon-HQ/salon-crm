"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"

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
  }
}

interface Entitlements {
  planInfo: PlanInfo | null
  hasFeature: (featureId: string) => boolean
  getLimit: (limitName: string) => number
  canUseAddon: (addonId: string) => boolean
  getAddonStatus: (addonId: string) => { enabled: boolean; quota: number; used: number; remaining: number }
  isLoading: boolean
  error: string | null
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

export function useEntitlements(): Entitlements {
  const { user } = useAuth()
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user?.branchId) {
      fetchPlanInfo()
    } else {
      setIsLoading(false)
    }
  }, [user?.branchId])

  const fetchPlanInfo = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/business/plan`, {
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setPlanInfo(data.data.plan)
        } else {
          setError(data.error || 'Failed to fetch plan info')
        }
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to fetch plan info')
      }
    } catch (err) {
      console.error('Error fetching plan info:', err)
      setError('Failed to fetch plan information')
    } finally {
      setIsLoading(false)
    }
  }

  const hasFeature = (featureId: string): boolean => {
    if (!planInfo) return false
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
    error,
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

