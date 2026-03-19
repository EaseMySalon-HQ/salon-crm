/** Per-line staff split for multi-staff services (matches Sale item schema). */
export type ReceiptStaffContribution = {
  staffId?: string
  staffName?: string
  percentage?: number
  amount?: number
}

export type ReceiptItemStaffInput = {
  staffName?: string
  staffContributions?: ReceiptStaffContribution[] | null
}

/**
 * Returns a single label for receipt lines: all contributor names when
 * `staffContributions` is set, otherwise `staffName`.
 */
export function formatReceiptItemStaffNames(item: ReceiptItemStaffInput): string {
  const contributions = item.staffContributions
  if (Array.isArray(contributions) && contributions.length > 0) {
    const seen = new Set<string>()
    const names: string[] = []
    for (const c of contributions) {
      const n = (c?.staffName && String(c.staffName).trim()) || ""
      if (!n) continue
      const key = n.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      names.push(n)
    }
    if (names.length === 0) {
      const fallback = item.staffName && String(item.staffName).trim()
      return fallback || ""
    }
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} & ${names[1]}`
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`
  }
  return (item.staffName && String(item.staffName).trim()) || ""
}
