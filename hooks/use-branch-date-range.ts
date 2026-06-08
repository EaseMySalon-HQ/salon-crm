"use client"

import { useMemo, useState } from "react"

export type DateRangePreset =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_12_months"
  | "custom"

export const RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "last_12_months", label: "Last 12 Months" },
  { value: "custom", label: "Custom" },
]

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function computeRange(
  preset: DateRangePreset,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  const now = new Date()
  switch (preset) {
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: ymd(start), to: ymd(end) }
    }
    case "last_3_months": {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: ymd(start), to: ymd(end) }
    }
    case "last_12_months": {
      const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: ymd(start), to: ymd(end) }
    }
    case "custom":
      return { from: customFrom, to: customTo }
    case "this_month":
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: ymd(start), to: ymd(end) }
    }
  }
}

/**
 * Local-state date range for the Branch Management dashboard. A `custom` preset
 * keeps its own `from`/`to`; every other preset derives the range from today.
 * `params` is `undefined` for a custom range that is not yet fully filled so the
 * caller can hold off fetching until both ends are valid.
 */
export function useBranchDateRange(initial: DateRangePreset = "this_month") {
  const [preset, setPreset] = useState<DateRangePreset>(initial)
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const range = useMemo(
    () => computeRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  )

  const isCustomIncomplete = preset === "custom" && (!customFrom || !customTo || customFrom > customTo)
  const label = RANGE_PRESETS.find((p) => p.value === preset)?.label ?? "This Month"

  return {
    preset,
    setPreset,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    range,
    /** Range params to send to the API, or `undefined` while a custom range is incomplete. */
    params: isCustomIncomplete ? undefined : range,
    isCustomIncomplete,
    label,
  }
}
