import type { FeatureCategory } from "@/lib/pricing-matrix"

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
