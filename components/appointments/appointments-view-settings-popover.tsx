"use client"

import { Calendar, List, Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function AppointmentColorLegend() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-1.5 text-sm text-slate-700">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded bg-slate-500" />
        Scheduled
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded bg-cyan-500" />
        Confirmed
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded bg-blue-500" />
        Arrived
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded bg-amber-500" />
        Partial payment
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded bg-indigo-500" />
        Service started
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded bg-emerald-500" />
        Completed
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded bg-rose-600" />
        No show
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded bg-red-500" />
        Cancelled
      </div>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded bg-slate-600" />
        Blocked time
      </div>
    </div>
  )
}

type AppointmentsViewSettingsPopoverProps = {
  view?: "list" | "calendar"
  onSwitchView?: (view: "list" | "calendar") => void
  showDensity?: boolean
  density?: "compact" | "comfortable"
  onDensityChange?: (density: "compact" | "comfortable") => void
  showWalkIn?: boolean
  showWalkInCards?: boolean
  onShowWalkInCardsChange?: (value: boolean) => void
  title?: string
  description?: string
}

export function AppointmentsViewSettingsPopover({
  view,
  onSwitchView,
  showDensity = false,
  density = "compact",
  onDensityChange,
  showWalkIn = false,
  showWalkInCards = false,
  onShowWalkInCardsChange,
  title = "Appointments settings",
  description = "View and display options",
}: AppointmentsViewSettingsPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl border-slate-200 bg-white/80"
          aria-label={title}
        >
          <Settings className="h-4 w-4 text-slate-600" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(calc(100vw-2rem),320px)] p-0 rounded-xl border-slate-200">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="space-y-4 p-4">
          {onSwitchView ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">View</p>
              <div className="flex gap-1 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => onSwitchView("list")}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                    view === "list"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  <List className="h-3.5 w-3.5 shrink-0" />
                  List
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchView("calendar")}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                    view === "calendar"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  Calendar
                </button>
              </div>
            </div>
          ) : null}

          {showDensity && onDensityChange ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Density</p>
              <div className="flex gap-1 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => onDensityChange("compact")}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                    density === "compact"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  Compact
                </button>
                <button
                  type="button"
                  onClick={() => onDensityChange("comfortable")}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                    density === "comfortable"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  Comfortable
                </button>
              </div>
            </div>
          ) : null}

          {showWalkIn && onShowWalkInCardsChange ? (
            <label className="flex items-center gap-2.5 cursor-pointer select-none rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
              <Checkbox
                checked={showWalkInCards}
                onCheckedChange={(checked) => onShowWalkInCardsChange(checked === true)}
                className="border-slate-300 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600"
              />
              <span className="text-sm text-slate-700">Show walk-in cards</span>
            </label>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Color code</p>
            <AppointmentColorLegend />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
