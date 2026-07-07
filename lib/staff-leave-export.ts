import { downloadTableXlsx } from "@/lib/inventory-lists-export"
import type { StaffLeaveSummaryRow } from "@/lib/api"

export function exportLeaveSummaryXlsx(
  rows: StaffLeaveSummaryRow[],
  periodLabel: string
) {
  const headers = [
    "Staff",
    "Total days",
    "Unpaid (LWP)",
    "Half days",
    "Paid leave",
    "LWP equivalent",
    "Entries",
  ]
  const data = rows.map((r) => [
    r.staffName,
    r.totalDays,
    r.unpaidDays,
    r.halfDays,
    r.paidDays,
    r.lwpDays,
    r.entries,
  ])
  const safeLabel = periodLabel.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 40)
  downloadTableXlsx(`leave-summary-${safeLabel}`, "Leave Summary", headers, data)
}
