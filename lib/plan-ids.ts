/** Subscription plans: Starter, Growth, Pro only. */

export const CANONICAL_PLAN_IDS = ["starter", "growth", "pro"] as const

export type PlanSubscriptionId = (typeof CANONICAL_PLAN_IDS)[number]

const LEGACY_PLAN_ID_ALIASES: Record<string, PlanSubscriptionId> = {
  free: "starter",
  professional: "pro",
  enterprise: "pro",
}

const PLAN_DISPLAY_NAMES: Record<PlanSubscriptionId, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
}

export function normalizePlanId(planId: string | null | undefined): PlanSubscriptionId {
  if (!planId) return "starter"
  if ((CANONICAL_PLAN_IDS as readonly string[]).includes(planId)) {
    return planId as PlanSubscriptionId
  }
  return LEGACY_PLAN_ID_ALIASES[planId] ?? "starter"
}

export function planDisplayName(planId: string | null | undefined): string {
  return PLAN_DISPLAY_NAMES[normalizePlanId(planId)]
}

export function planBadgeClass(planId: string | null | undefined): string {
  const id = normalizePlanId(planId)
  switch (id) {
    case "starter":
      return "bg-emerald-100 text-emerald-800 border-emerald-200"
    case "growth":
      return "bg-blue-100 text-blue-800 border-blue-200"
    case "pro":
      return "bg-purple-100 text-purple-800 border-purple-200"
  }
}

export const PLAN_TIER_ORDER: Record<PlanSubscriptionId, number> = {
  starter: 0,
  growth: 1,
  pro: 2,
}

export function tierOf(planId: string | null | undefined): number {
  return PLAN_TIER_ORDER[normalizePlanId(planId)]
}

export function isCanonicalPlanId(planId: string | null | undefined): boolean {
  return (CANONICAL_PLAN_IDS as readonly string[]).includes(planId ?? "")
}
