export const GMB_BUNDLE_ID = "gmb"

/** Legacy storage ids collapsed into the single GMB bundle toggle. */
export const GMB_LEGACY_IDS = [
  "gmb_connect",
  "gmb_reviews_read",
  "gmb_reviews_reply",
  "gmb_advanced",
  "gmb_health",
  "gmb_sync",
  "gmb_insights",
  "gmb_conversion_tracking",
] as const

export type PlanFeatureRow = {
  id: string
  name: string
  description?: string
  category: string
}

export const GMB_BUNDLE_FEATURE: PlanFeatureRow = {
  id: GMB_BUNDLE_ID,
  name: "Google Business Profile",
  description:
    "Connect, reviews, health dashboard, SEO insights, services sync, and conversion tracking",
  category: "growth",
}

const GMB_LEGACY_SET = new Set<string>(GMB_LEGACY_IDS)

export function hasGmbBundle(featureIds: string[]) {
  return (
    featureIds.includes(GMB_BUNDLE_ID) ||
    GMB_LEGACY_IDS.some((id) => featureIds.includes(id))
  )
}

export function normalizePlanFeaturesForStorage(featureIds: string[]) {
  const withoutLegacy = featureIds.filter(
    (id) => !GMB_LEGACY_SET.has(id) && id !== GMB_BUNDLE_ID
  )
  if (hasGmbBundle(featureIds)) {
    return [...withoutLegacy, GMB_BUNDLE_ID]
  }
  return withoutLegacy
}

export function toggleGmbBundle(featureIds: string[], enabled: boolean) {
  const without = featureIds.filter(
    (id) => id !== GMB_BUNDLE_ID && !GMB_LEGACY_SET.has(id)
  )
  return enabled ? [...without, GMB_BUNDLE_ID] : without
}

/**
 * Admin plan UI: collapse all GMB feature rows into one bundle toggle.
 */
export function preparePlanFeaturesForAdminUi(features: PlanFeatureRow[]): PlanFeatureRow[] {
  const withoutLegacy = features.filter(
    (f) => !GMB_LEGACY_SET.has(f.id) && f.id !== GMB_BUNDLE_ID
  )
  const hasBundleRow = features.some((f) => f.id === GMB_BUNDLE_ID)

  const prepared: PlanFeatureRow[] = [
    ...withoutLegacy,
    hasBundleRow
      ? { ...GMB_BUNDLE_FEATURE, ...features.find((f) => f.id === GMB_BUNDLE_ID)!, category: "growth" }
      : { ...GMB_BUNDLE_FEATURE },
  ]

  return prepared
}

export function isGmbBundleFeatureId(featureId: string) {
  return featureId === GMB_BUNDLE_ID || GMB_LEGACY_SET.has(featureId)
}

/** @deprecated Use GMB_BUNDLE_ID */
export const GMB_ADVANCED_BUNDLE_ID = GMB_BUNDLE_ID
/** @deprecated Use hasGmbBundle */
export const hasGmbAdvancedBundle = hasGmbBundle
/** @deprecated Use toggleGmbBundle */
export const toggleGmbAdvancedBundle = toggleGmbBundle
