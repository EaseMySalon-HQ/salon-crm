"use client"

import { IndianRupee, CalendarCheck, Receipt, Users, UserRound, Gauge, Star } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { BranchSummaryResponse, BranchSummaryRow } from "@/lib/api"
import { formatINR, formatNumber } from "./branch-format"

const CARDS = [
  { key: "revenue", label: "Total Revenue", icon: IndianRupee, tint: "from-emerald-500 to-green-600", currency: true, suffix: false },
  { key: "appointments", label: "Appointments", icon: CalendarCheck, tint: "from-indigo-500 to-blue-600", currency: false, suffix: false },
  { key: "avgTicketSize", label: "Avg Ticket", icon: Receipt, tint: "from-amber-500 to-orange-600", currency: true, suffix: false },
  { key: "capacityUtilizationPct", label: "Utilization", icon: Gauge, tint: "from-cyan-500 to-teal-600", currency: false, suffix: true },
  { key: "avgRating", label: "Avg Rating", icon: Star, tint: "from-yellow-500 to-amber-600", currency: false, suffix: false, rating: true },
  { key: "staff", label: "Active Staff", icon: Users, tint: "from-violet-500 to-purple-600", currency: false, suffix: false },
  { key: "clients", label: "Clients", icon: UserRound, tint: "from-pink-500 to-rose-600", currency: false, suffix: false },
] as const

export function SummaryCards({
  data,
  isLoading,
  rangeLabel,
  selectedBranch,
}: {
  data?: BranchSummaryResponse
  isLoading: boolean
  rangeLabel: string
  selectedBranch?: BranchSummaryRow | null
}) {
  const source: Record<string, number> | undefined = selectedBranch
    ? (selectedBranch as unknown as Record<string, number>)
    : (data?.aggregate as unknown as Record<string, number> | undefined)

  const scope = selectedBranch ? selectedBranch.branchName : "All branches"

  return (
    <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {CARDS.map((card) => {
        const Icon = card.icon
        const raw = source ? source[card.key] : undefined
        const value = typeof raw === "number" ? raw : 0
        const display =
          "rating" in card && card.rating
            ? raw == null
              ? "—"
              : `${value}/5`
            : card.suffix
              ? `${value}%`
              : card.currency
                ? formatINR(value)
                : formatNumber(value)
        return (
          <div
            key={card.key}
            className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${card.tint} text-white shadow-sm`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-500">{card.label}</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-6 w-20" />
              ) : (
                <p className="truncate text-xl font-bold tracking-tight text-slate-900">
                  {display}
                </p>
              )}
              <p className="truncate text-[10px] text-slate-400">
                {scope} · {rangeLabel}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
