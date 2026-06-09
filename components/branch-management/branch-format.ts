/** Shared formatting helpers for the Branch Management UI. */

export function formatINR(amount: number): string {
  const n = Number(amount) || 0
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

export function formatNumber(n: number): string {
  return (Number(n) || 0).toLocaleString("en-IN")
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

/** Up to two uppercase initials from a person's name (e.g. "Asha Rao" -> "AR"). */
export function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
