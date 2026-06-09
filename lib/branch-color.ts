/**
 * Deterministic per-branch color so the same branch always reads the same hue
 * across charts, snapshot cards, switcher avatars and legends. Keyed by branchId.
 */

const BRANCH_PALETTE = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
] as const

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/** Stable color for a branch id. */
export function getBranchColor(branchId: string): string {
  if (!branchId) return BRANCH_PALETTE[0]
  return BRANCH_PALETTE[hashString(String(branchId)) % BRANCH_PALETTE.length]
}

export { BRANCH_PALETTE }
