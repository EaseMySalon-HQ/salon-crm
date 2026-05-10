/** Sale line `lineSource` from API (appointment-linked bills); set server-side only. */
export function receiptWalkInSaleLabel(lineSource: unknown): string | null {
  const s = String(lineSource || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
  if (s === "walk_in") return "Walk-in sale"
  return null
}
