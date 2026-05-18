/**
 * Membership plan % discount on services, respecting `excludedServiceIds` on the plan.
 */

export function membershipPlanExcludedServiceIdSet(
  plan: { excludedServiceIds?: unknown } | null | undefined,
): Set<string> {
  const raw = plan?.excludedServiceIds
  if (!Array.isArray(raw)) return new Set()
  const out = new Set<string>()
  for (const x of raw) {
    if (x == null) continue
    const id =
      typeof x === "object" && x !== null && "_id" in x
        ? String((x as { _id?: unknown })._id)
        : String(x)
    const t = id.trim()
    if (t) out.add(t)
  }
  return out
}

/** Plan discount % that applies to this service (0 if service is excluded). */
export function effectiveMembershipPlanDiscountPercent(
  plan: { discountPercentage?: unknown; excludedServiceIds?: unknown } | null | undefined,
  serviceId: string | null | undefined,
): number {
  const pct = Math.min(100, Math.max(0, Number(plan?.discountPercentage) || 0))
  if (pct <= 0) return 0
  const sid = serviceId != null ? String(serviceId).trim() : ""
  if (!sid) return pct
  if (membershipPlanExcludedServiceIdSet(plan).has(sid)) return 0
  return pct
}
