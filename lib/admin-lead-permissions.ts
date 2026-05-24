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
  converted: "bg-green-100 text-green-800",
  lost: "bg-gray-100 text-gray-800",
}

export function formatLeadStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ")
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
