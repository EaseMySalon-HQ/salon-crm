import type { Admin } from "@/lib/admin-auth-context"

export function hasAdminLeadPermission(
  admin: Admin | null | undefined,
  action: "view" | "create" | "update" | "delete"
): boolean {
  if (!admin) return false
  if (admin.role === "super_admin") return true
  return (
    admin.permissions?.some(
      (p) => p.module === "leads" && Array.isArray(p.actions) && p.actions.includes(action)
    ) ?? false
  )
}

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  "walk-in": "Walk-in",
  phone: "Phone",
  website: "Website",
  social: "Social Media",
  referral: "Referral",
  other: "Other",
}

export const LEAD_STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  "follow-up": "bg-orange-100 text-orange-800",
  trial: "bg-violet-100 text-violet-800",
  converted: "bg-green-100 text-green-800",
  lost: "bg-gray-100 text-gray-800",
}

export function formatLeadStatus(status: string): string {
  if (status === "follow-up") return "Follow-up"
  if (status === "trial") return "Trial"
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function adminAssigneeName(
  assigned: PlatformLeadAssigneeShape | string | null | undefined
): string {
  if (!assigned) return "—"
  if (typeof assigned === "string") return assigned
  return (
    assigned.name ||
    [assigned.firstName, assigned.lastName].filter(Boolean).join(" ") ||
    assigned.email ||
    "—"
  )
}

type PlatformLeadAssigneeShape = {
  name?: string
  firstName?: string
  lastName?: string
  email?: string
}

type PlatformLeadLocationShape = {
  city?: string
  branchCount?: string
  interestedIn?: string
}

type PlatformLeadServicesShape = {
  interestedServices?: string[]
  notes?: string
}

/** Demo form message stored on `notes` (services live in `interestedServices`, not here). */
export function getPlatformLeadDemoNotes(lead: { notes?: string }): string {
  const raw = (lead.notes || "").trim()
  if (!raw) return ""

  // Legacy demo wizard: "Services interested in: …\n\nNotes: …" or "… Notes: …"
  const notesMatch = raw.match(/\bNotes:\s*(.+)$/is)
  if (notesMatch) {
    return notesMatch[1].trim()
  }

  if (/^Services interested in:/i.test(raw)) {
    return ""
  }

  return raw
}

/** Legacy website leads duplicated city/branches into `interestedIn`; hide when redundant. */
export function isLegacyPlatformLeadInterestedIn(lead: PlatformLeadLocationShape): boolean {
  const interested = (lead.interestedIn || "").trim()
  if (!interested) return false
  const legacy = [
    lead.city ? `City: ${lead.city}` : "",
    lead.branchCount ? `Branches: ${lead.branchCount}` : "",
  ]
    .filter(Boolean)
    .join(" | ")
  return interested === legacy
}

export function getPlatformLeadInterestedInDisplay(lead: PlatformLeadLocationShape): string {
  if (isLegacyPlatformLeadInterestedIn(lead)) return ""
  return (lead.interestedIn || "").trim()
}

/** Services from demo booking — uses stored array or legacy notes format. */
export function getPlatformLeadInterestedServices(lead: PlatformLeadServicesShape): string[] {
  if (lead.interestedServices?.length) return lead.interestedServices

  const notes = lead.notes || ""
  const match = notes.match(/^Services interested in:\s*(.+?)(?:\n\n|\s+Notes:|$)/is)
  if (!match) return []

  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}
