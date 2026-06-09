"use client"

import { CalendarRange } from "lucide-react"
import { Input } from "@/components/ui/input"
import { RANGE_PRESETS, type DateRangePreset } from "@/hooks/use-branch-date-range"

export function DateRangePicker({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: {
  preset: DateRangePreset
  onPresetChange: (p: DateRangePreset) => void
  customFrom: string
  customTo: string
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden items-center gap-1.5 text-sm font-medium text-slate-500 sm:inline-flex">
        <CalendarRange className="h-4 w-4" /> Period
      </span>
      <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onPresetChange(p.value)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              preset === p.value
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="h-8 w-[9.5rem] text-xs"
            aria-label="From date"
          />
          <span className="text-xs text-slate-400">to</span>
          <Input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="h-8 w-[9.5rem] text-xs"
            aria-label="To date"
          />
        </div>
      )}
    </div>
  )
}
