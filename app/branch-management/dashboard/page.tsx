"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { BranchManagementAPI } from "@/lib/api"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SummaryCards } from "@/components/branch-management/summary-cards"
import { ComparisonChart } from "@/components/branch-management/comparison-chart"
import { BranchSnapshotCards } from "@/components/branch-management/branch-snapshot-cards"
import { BranchErrorNote } from "@/components/branch-management/branch-error-note"
import { DateRangePicker } from "@/components/branch-management/date-range-picker"
import { RevenueVsTargetBar } from "@/components/branch-management/revenue-vs-target-bar"
import { BranchBenchmarkChart } from "@/components/branch-management/branch-benchmark-chart"
import { TopPerformersPanel } from "@/components/branch-management/top-performers-panel"
import { useBranchDateRange } from "@/hooks/use-branch-date-range"
import { STALE_TIME } from "@/lib/queries/staleness"

export default function BranchDashboardPage() {
  const dateRange = useBranchDateRange("this_month")
  const [branchFilter, setBranchFilter] = useState<string>("all")
  const { params, label } = dateRange
  const rangeKey = params ? `${params.from}:${params.to}` : "incomplete"
  const enabled = !!params

  const summary = useQuery({
    queryKey: ["branch-management", "summary", rangeKey],
    queryFn: async () => {
      const res = await BranchManagementAPI.getSummary(params)
      if (!res.success) throw new Error(res.error || "Failed to load summary")
      return res.data
    },
    enabled,
    staleTime: STALE_TIME.dashboard,
  })

  const revenue = useQuery({
    queryKey: ["branch-management", "revenue", rangeKey],
    queryFn: async () => {
      const res = await BranchManagementAPI.getRevenue(params)
      if (!res.success) throw new Error(res.error || "Failed to load revenue")
      return res.data
    },
    enabled,
    staleTime: STALE_TIME.dashboard,
  })

  const appointments = useQuery({
    queryKey: ["branch-management", "appointments", rangeKey],
    queryFn: async () => {
      const res = await BranchManagementAPI.getAppointments(params)
      if (!res.success) throw new Error(res.error || "Failed to load appointments")
      return res.data
    },
    enabled,
    staleTime: STALE_TIME.dashboard,
  })

  const topPerformers = useQuery({
    queryKey: ["branch-management", "top-performers", rangeKey],
    queryFn: async () => {
      const res = await BranchManagementAPI.getTopPerformers(params)
      if (!res.success) throw new Error(res.error || "Failed to load top performers")
      return res.data
    },
    enabled,
    staleTime: STALE_TIME.dashboard,
  })

  const branches = summary.data?.branches ?? []
  const selectedBranch = useMemo(
    () => (branchFilter === "all" ? null : branches.find((b) => b.branchId === branchFilter) ?? null),
    [branches, branchFilter]
  )

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      {/* Toolbar — full width */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <DateRangePicker
          preset={dateRange.preset}
          onPresetChange={dateRange.setPreset}
          customFrom={dateRange.customFrom}
          customTo={dateRange.customTo}
          onCustomFromChange={dateRange.setCustomFrom}
          onCustomToChange={dateRange.setCustomTo}
        />
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

      {dateRange.isCustomIncomplete && (
        <p className="rounded-lg border border-dashed bg-slate-50/60 px-4 py-3 text-sm text-slate-500">
          Pick a start and end date to load this custom range.
        </p>
      )}

      <SummaryCards
        data={summary.data}
        isLoading={summary.isLoading && enabled}
        rangeLabel={label}
        selectedBranch={selectedBranch}
      />

      {summary.data && <BranchErrorNote rows={summary.data.branches} />}

      <RevenueVsTargetBar
        branches={
          branchFilter === "all"
            ? branches
            : branches.filter((b) => b.branchId === branchFilter)
        }
        isLoading={summary.isLoading && enabled}
      />

      <div
        className={`grid min-w-0 grid-cols-1 gap-5 ${
          branchFilter === "all" ? "xl:grid-cols-2 xl:items-stretch" : ""
        }`}
      >
        <ComparisonChart
          revenue={revenue.data}
          appointments={appointments.data}
          isLoading={(revenue.isLoading || appointments.isLoading) && enabled}
          branchFilter={branchFilter}
          rangeLabel={label}
          tall={branchFilter !== "all"}
        />
        {branchFilter === "all" && (
          <BranchBenchmarkChart
            branches={branches}
            isLoading={summary.isLoading && enabled}
            rangeLabel={label}
            className="h-full"
          />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex h-full flex-col rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Branch performance</h2>
            <p className="text-xs text-slate-400">Click a branch to filter the overview</p>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-3 xl:max-h-none xl:flex-1">
            <BranchSnapshotCards
              branches={branches}
              isLoading={summary.isLoading && enabled}
              selectedBranchId={branchFilter}
              onSelect={setBranchFilter}
              variant="sidebar"
            />
            <div className="mt-4 border-t border-slate-100 pt-4">
              <TopPerformersPanel
                data={topPerformers.data}
                isLoading={topPerformers.isLoading && enabled}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
