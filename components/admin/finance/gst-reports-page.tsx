"use client"

import { Badge } from "@/components/ui/badge"
import { BarChart3 } from "lucide-react"
import { GstReports } from "@/components/admin/admin-settings/gst-reports"

const PAGE_TITLE = "GST Reports"
const PAGE_DESC =
  "SaaS revenue invoice ledger — filter, export for filing, and lock periods after GST return"

export function FinanceGstReportsPage() {
  return (
    <div className="space-y-8 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">Finance</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{PAGE_TITLE}</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-xl">{PAGE_DESC}</p>
        </div>
        <Badge
          variant="secondary"
          className="shrink-0 w-fit px-3 py-1.5 text-xs font-medium bg-teal-50 text-teal-900 border-0"
        >
          <BarChart3 className="h-3.5 w-3.5 mr-1.5 inline" />
          Compliance
        </Badge>
      </div>
      <GstReports />
    </div>
  )
}
