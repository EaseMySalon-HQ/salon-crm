import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function normalizeEmailForLookup(s: string): string {
  return s.trim().toLowerCase()
}

function displayNameFromUser(u: {
  name?: string
  firstName?: string
  lastName?: string
  email?: string
}): string {
  const n = u.name?.trim()
  if (n) return n
  const fl = [u.firstName, u.lastName].filter(Boolean).join(" ").trim()
  if (fl) return fl
  return u.email?.trim() || "—"
}

/**
 * Resolve `createdBy` (often an email saved on the appointment) to the staff member's real name
 * using the staff directory and the logged-in user (auth).
 */
export function resolveCreatedByDisplay(
  createdBy: string | undefined | null,
  options: {
    staffDirectory: Array<{ name?: string; email?: string }>
    currentUser: {
      name?: string
      firstName?: string
      lastName?: string
      email?: string
    } | null
  }
): string {
  if (createdBy == null || createdBy === "") return "—"
  const raw = String(createdBy).trim()
  if (raw === "" || raw === "—") return "—"

  if (!raw.includes("@")) {
    return raw
  }

  const key = normalizeEmailForLookup(raw)

  const curEmail = options.currentUser?.email
  if (curEmail && normalizeEmailForLookup(curEmail) === key) {
    return displayNameFromUser(options.currentUser)
  }

  for (const s of options.staffDirectory) {
    const em = s.email?.trim()
    if (em && normalizeEmailForLookup(em) === key) {
      const nm = s.name?.trim()
      if (nm) return nm
    }
  }

  return raw
}
