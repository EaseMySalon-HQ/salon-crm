"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { BranchManagementAPI } from "@/lib/api"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StaffTable } from "@/components/branch-management/staff-table"
import { BranchErrorNote } from "@/components/branch-management/branch-error-note"
import { DateRangePicker } from "@/components/branch-management/date-range-picker"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useBranchDateRange } from "@/hooks/use-branch-date-range"
import { STALE_TIME } from "@/lib/queries/staleness"

function BranchStaffContent() {
  const searchParams = useSearchParams()
  const [branchFilter, setBranchFilter] = useState<string>("all")
  const [includeInactive, setIncludeInactive] = useState(true)
  const dateRange = useBranchDateRange("this_month")
  const { params, label } = dateRange
  const staffParams = params ? { ...params, includeInactive } : undefined
  const rangeKey = params ? `${params.from}:${params.to}:${includeInactive}` : "incomplete"
  const enabled = !!params

  // Pre-filter when arriving from a dashboard branch card drilldown.
  useEffect(() => {
    const b = searchParams.get("branch")
    if (b) setBranchFilter(b)
  }, [searchParams])

  const { data, isLoading } = useQuery({
    queryKey: ["branch-management", "staff", rangeKey],
    queryFn: async () => {
      const res = await BranchManagementAPI.getStaff(staffParams)
      if (!res.success) throw new Error(res.error || "Failed to load staff")
      return res.data
    },
    enabled,
    staleTime: STALE_TIME.dashboard,
  })

  const branches = data?.branches ?? []

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <DateRangePicker
          preset={dateRange.preset}
          onPresetChange={dateRange.setPreset}
          customFrom={dateRange.customFrom}
          customTo={dateRange.customTo}
          onCustomFromChange={dateRange.setCustomFrom}
          onCustomToChange={dateRange.setCustomTo}
        />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
            <Label htmlFor="include-inactive" className="text-sm text-slate-600">
              Include inactive
            </Label>
          </div>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-full shrink-0 sm:w-56">
            <SelectValue placeholder="All branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.branchId} value={b.branchId}>
                {b.branchName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      {dateRange.isCustomIncomplete && (
        <p className="rounded-lg border border-dashed bg-slate-50/60 px-4 py-3 text-sm text-slate-500">
          Pick a start and end date to load this custom range.
        </p>
      )}

      <BranchErrorNote rows={branches} />
      <StaffTable
        branches={branches}
        isLoading={isLoading && enabled}
        branchFilter={branchFilter}
        rangeLabel={label}
        includeInactive={includeInactive}
      />
    </div>
  )
}

export default function BranchStaffPage() {
  return (
    <Suspense fallback={null}>
      <BranchStaffContent />
    </Suspense>
  )
}
