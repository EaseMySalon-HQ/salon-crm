"use client"

import * as React from "react"
import { Check, Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-react"
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "currentMonth"
  | "all"
  | "custom"

const PRESET_ORDER: DateRangePreset[] = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "currentMonth",
  "all",
  "custom",
]

const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  currentMonth: "Current month",
  all: "All time",
  custom: "Custom range",
}

function computeRange(preset: Exclude<DateRangePreset, "custom">): { from: string; to: string } {
  const now = new Date()
  switch (preset) {
    case "today":
      return {
        from: format(startOfDay(now), "yyyy-MM-dd"),
        to: format(endOfDay(now), "yyyy-MM-dd"),
      }
    case "yesterday": {
      const d = subDays(now, 1)
      return {
        from: format(startOfDay(d), "yyyy-MM-dd"),
        to: format(endOfDay(d), "yyyy-MM-dd"),
      }
    }
    case "last7":
      return {
        from: format(startOfDay(subDays(now, 6)), "yyyy-MM-dd"),
        to: format(endOfDay(now), "yyyy-MM-dd"),
      }
    case "last30":
      return {
        from: format(startOfDay(subDays(now, 29)), "yyyy-MM-dd"),
        to: format(endOfDay(now), "yyyy-MM-dd"),
      }
    case "currentMonth":
      return {
        from: format(startOfMonth(now), "yyyy-MM-dd"),
        to: format(endOfMonth(now), "yyyy-MM-dd"),
      }
    case "all":
      return { from: "", to: "" }
  }
}

export function ListDateRangeToolbar({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  disabled,
}: {
  dateFrom: string
  dateTo: string
  onDateFromChange: (v: string) => void
  onDateToChange: (v: string) => void
  disabled?: boolean
}) {
  const [preset, setPreset] = React.useState<DateRangePreset>("currentMonth")

  const applyPreset = React.useCallback(
    (next: DateRangePreset) => {
      setPreset(next)
      if (next === "all") {
        onDateFromChange("")
        onDateToChange("")
        return
      }
      if (next === "custom") {
        const now = new Date()
        if (!dateFrom.trim() && !dateTo.trim()) {
          onDateFromChange(format(startOfDay(now), "yyyy-MM-dd"))
          onDateToChange(format(endOfDay(now), "yyyy-MM-dd"))
        }
        return
      }
      const { from, to } = computeRange(next)
      onDateFromChange(from)
      onDateToChange(to)
    },
    [onDateFromChange, onDateToChange, dateFrom, dateTo]
  )

  const onCustomFrom = (v: string) => {
    setPreset("custom")
    onDateFromChange(v)
  }
  const onCustomTo = (v: string) => {
    setPreset("custom")
    onDateToChange(v)
  }

  return (
    <div className="flex flex-wrap items-end gap-2 sm:gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="default"
            className="h-10 w-[200px] justify-between gap-2 px-3 font-normal"
            disabled={disabled}
          >
            <span className="min-w-0 flex-1 truncate text-left">{PRESET_LABELS[preset]}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[200px]">
          {PRESET_ORDER.map((key) => (
            <DropdownMenuItem key={key} className="cursor-pointer gap-2" onClick={() => applyPreset(key)}>
              {preset === key ? (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <span className="inline-block w-4 shrink-0" />
              )}
              {PRESET_LABELS[key]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {preset === "custom" && (
        <>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onCustomFrom(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onCustomTo(e.target.value)}
              className="w-[150px]"
            />
          </div>
        </>
      )}
    </div>
  )
}

export function ListTableExportMenu({
  onExportPdf,
  onExportXlsx,
  disabled,
}: {
  onExportPdf: () => void
  onExportXlsx: () => void
  disabled?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className="gap-2 shrink-0">
          <Download className="h-4 w-4" />
          Export
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Export current list</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onExportPdf} className="cursor-pointer">
          <FileText className="h-4 w-4 mr-2" />
          PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportXlsx} className="cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Excel (XLSX)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
