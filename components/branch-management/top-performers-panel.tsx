"use client"

import { Skeleton } from "@/components/ui/skeleton"
import type { TopPerformersResponse } from "@/lib/api"
import { formatINR, formatNumber } from "./branch-format"

export function TopPerformersPanel({
  data,
  isLoading,
}: {
  data?: TopPerformersResponse
  isLoading: boolean
}) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />
  }

  const services = data?.topServices ?? []
  const staff = data?.topStaff ?? []

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <RankList title="Top services" empty="No service revenue in this range." rows={services.map((s, i) => ({
        rank: i + 1,
        name: s.name,
        primary: formatINR(s.revenue),
        secondary: `${formatNumber(s.count)} bookings`,
      }))} />
      <RankList title="Top staff" empty="No staff revenue in this range." rows={staff.map((s, i) => ({
        rank: i + 1,
        name: s.name,
        primary: formatINR(s.revenue),
      }))} />
    </div>
  )
}

function RankList({
  title,
  empty,
  rows,
}: {
  title: string
  empty: string
  rows: { rank: number; name: string; primary: string; secondary?: string }[]
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.rank} className="flex items-start justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                  {r.rank}
                </span>
                <span className="truncate font-medium text-slate-800">{r.name}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="font-semibold tabular-nums text-slate-900">{r.primary}</span>
                {r.secondary && <span className="block text-[10px] text-slate-400">{r.secondary}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
