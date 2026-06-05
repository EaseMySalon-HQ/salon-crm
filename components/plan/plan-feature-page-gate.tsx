"use client"

import type { ReactNode } from "react"
import { useFeature } from "@/hooks/use-entitlements"
import { PlanUpgradePanel } from "@/components/plan/plan-upgrade-panel"

interface PlanFeaturePageGateProps {
  featureId: string
  title: string
  description?: string
  children: ReactNode
}

/** Shows a plan upgrade panel instead of redirecting to dashboard when the feature is not on the tenant plan. */
export function PlanFeaturePageGate({
  featureId,
  title,
  description,
  children,
}: PlanFeaturePageGateProps) {
  const { hasAccess, isLoading } = useFeature(featureId)

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600"
          aria-hidden
        />
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <PlanUpgradePanel title={title} description={description} />
      </div>
    )
  }

  return <>{children}</>
}
