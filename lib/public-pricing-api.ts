import type { FeatureCategory, PlanTier } from "@/lib/pricing-matrix"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

export async function fetchPublicPricingMatrix(): Promise<FeatureCategory[]> {
  try {
    const res = await fetch(`${API_URL}/public/pricing-matrix`, {
      credentials: "include",
      cache: "no-store",
    })
    if (!res.ok) return []
    const json = await res.json()
    if (json?.success && Array.isArray(json.data?.categories)) {
      return json.data.categories as FeatureCategory[]
    }
  } catch {
    /* fall through */
  }
  return []
}

export interface PublicPlanPricing {
  id: PlanTier
  monthlyPrice: number | null
  yearlyPrice: number | null
}

export async function fetchPublicPlanPricing(): Promise<PublicPlanPricing[]> {
  try {
    const res = await fetch(`${API_URL}/public/plans`, {
      credentials: "include",
      cache: "no-store",
    })
    if (!res.ok) return []
    const json = await res.json()
    if (json?.success && Array.isArray(json.data?.plans)) {
      return (json.data.plans as Array<{ id: string; monthlyPrice: number | null; yearlyPrice: number | null }>)
        .filter((p) => p.id === "starter" || p.id === "growth" || p.id === "pro")
        .map((p) => ({
          id: p.id as PlanTier,
          monthlyPrice: typeof p.monthlyPrice === "number" ? p.monthlyPrice : null,
          yearlyPrice: typeof p.yearlyPrice === "number" ? p.yearlyPrice : null,
        }))
    }
  } catch {
    /* fall through */
  }
  return []
}
