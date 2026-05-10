export type BundleScheduleType = "sequence" | "parallel"
export type BundlePricingType = "full_price" | "custom" | "percent_discount" | "free"

export type CatalogService = {
  _id?: string
  id?: string
  name?: string
  duration?: number
  price?: number
  fullPrice?: number
  offerPrice?: number
  taxApplicable?: boolean
  serviceKind?: "simple" | "bundle"
  bundleItems?: Array<{ serviceId?: string; sortOrder?: number }>
  bundleScheduleType?: BundleScheduleType
  bundlePricingType?: BundlePricingType
  bundlePercentOff?: number
  bundleRetailPrice?: number
}

export type ExpandedBundleLine = {
  serviceId: string
  name: string
  duration: number
  price: number
}

export function childUnitPrice(s: CatalogService | undefined | null): number {
  if (!s) return 0
  const offer = s.offerPrice
  const full = s.fullPrice
  const p = s.price
  if (offer != null && !Number.isNaN(Number(offer))) return Number(offer)
  if (full != null && !Number.isNaN(Number(full))) return Number(full)
  return Number(p) || 0
}

export function isBundleService(s: CatalogService | null | undefined): boolean {
  if (!s || s.serviceKind !== "bundle") return false
  const items = s.bundleItems
  return Array.isArray(items) && items.length >= 2
}

function allocateProportionalUnitPrices(unitPrices: number[], targetTotal: number): number[] {
  const n = unitPrices.length
  if (n === 0) return []
  const sumW = unitPrices.reduce((a, b) => a + b, 0)
  if (sumW <= 0) {
    const each = Math.round((targetTotal / n) * 100) / 100
    const out = unitPrices.map(() => each)
    const drift = Math.round((targetTotal - out.reduce((a, b) => a + b, 0)) * 100) / 100
    out[n - 1] = Math.round((out[n - 1] + drift) * 100) / 100
    return out
  }
  const raw = unitPrices.map((u) => (targetTotal * u) / sumW)
  const rounded = raw.map((x) => Math.floor(x * 100) / 100)
  let drift = Math.round((targetTotal - rounded.reduce((a, b) => a + b, 0)) * 100) / 100
  rounded[n - 1] = Math.round((rounded[n - 1] + drift) * 100) / 100
  return rounded
}

/**
 * Expand a catalog entry into invoice / appointment lines. Bundles become child services only.
 */
export function expandBundleToLines(
  item: CatalogService,
  catalog: CatalogService[]
): ExpandedBundleLine[] {
  if (!isBundleService(item)) {
    const id = String(item._id || item.id || "")
    return [
      {
        serviceId: id,
        name: item.name || "Service",
        duration: Number(item.duration) || 0,
        price: childUnitPrice(item),
      },
    ]
  }

  const sorted = [...(item.bundleItems || [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  )
  const byId = new Map(catalog.map((c) => [String(c._id || c.id), c]))
  const children = sorted
    .map((row) => byId.get(String(row.serviceId)))
    .filter((c): c is CatalogService => !!c)

  if (children.length < sorted.length) {
    return []
  }

  const unitPrices = children.map((c) => childUnitPrice(c))
  const sum = unitPrices.reduce((a, b) => a + b, 0)

  let targetTotal: number
  switch (item.bundlePricingType) {
    case "custom":
      targetTotal =
        item.bundleRetailPrice != null && !Number.isNaN(Number(item.bundleRetailPrice))
          ? Number(item.bundleRetailPrice)
          : Number(item.price) || 0
      break
    case "percent_discount":
      targetTotal = sum * (1 - (Number(item.bundlePercentOff) || 0) / 100)
      break
    case "free":
      targetTotal = 0
      break
    default:
      targetTotal = sum
  }

  if (item.bundlePricingType === "full_price" || item.bundlePricingType === undefined) {
    return children.map((c, i) => ({
      serviceId: String(c._id || c.id),
      name: c.name || "Service",
      duration: Number(c.duration) || 0,
      price: unitPrices[i],
    }))
  }

  const allocated = allocateProportionalUnitPrices(unitPrices, targetTotal)
  return children.map((c, i) => ({
    serviceId: String(c._id || c.id),
    name: c.name || "Service",
    duration: Number(c.duration) || 0,
    price: allocated[i] ?? 0,
  }))
}
