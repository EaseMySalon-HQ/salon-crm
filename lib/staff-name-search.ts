/** Staff name filter: prefix match (alphabetical typing), list sorted A–Z. */

export function sortStaffByName<T extends { name?: string | null }>(staff: T[]): T[] {
  return [...staff].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
    })
  )
}

export function staffNameMatchesPrefix(name: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return String(name || "")
    .trim()
    .toLowerCase()
    .startsWith(q)
}

export function filterStaffByNamePrefix<T extends { name?: string | null }>(
  staff: T[],
  query: string
): T[] {
  const sorted = sortStaffByName(staff)
  const q = query.trim()
  if (!q) return sorted
  return sorted.filter((s) => staffNameMatchesPrefix(String(s.name || ""), q))
}

/** cmdk filter: 1 = visible, 0 = hidden — prefix on display name only. */
export function staffNamePrefixCommandFilter(value: string, search: string): number {
  return staffNameMatchesPrefix(value, search) ? 1 : 0
}
