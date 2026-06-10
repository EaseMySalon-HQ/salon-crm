import type { FeatureCell } from "@/lib/pricing-matrix"

export type MatrixTierKey = "starter" | "growth" | "pro"

export const MATRIX_TIER_LABELS: Record<MatrixTierKey, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
}

export const MATRIX_CELL_STATUS_OPTIONS = [
  { value: "yes", label: "Included in tier" },
  { value: "no", label: "Not included" },
  { value: "addon", label: "Paid add-on" },
  { value: "soon", label: "Coming soon" },
  { value: "__custom__", label: "Custom label" },
] as const

export type MatrixCellStatusValue = (typeof MATRIX_CELL_STATUS_OPTIONS)[number]["value"]

const KNOWN_STATUSES = new Set<string>(["yes", "no", "addon", "soon"])

export function isKnownMatrixCellStatus(value: string): value is FeatureCell {
  return KNOWN_STATUSES.has(value)
}

export function getMatrixCellEditorMode(value: string): MatrixCellStatusValue {
  return isKnownMatrixCellStatus(value) ? value : "__custom__"
}

export function getMatrixCellDisplayLabel(value: FeatureCell): string {
  if (value === "yes") return "Included in tier"
  if (value === "no") return "Not included"
  if (value === "addon") return "Paid add-on"
  if (value === "soon") return "Coming soon"
  return value
}
