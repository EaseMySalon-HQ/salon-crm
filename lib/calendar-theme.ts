/** Root class that scopes calendar grid CSS variables (see globals.css). */
export const APPOINTMENTS_CALENDAR_SURFACE_CLASS = "appointments-calendar-surface"

/** Build `rgb(var(--token) / alpha)` for use in inline styles and gradients. */
export function calRgb(token: string, alpha = 1): string {
  return alpha === 1 ? `rgb(var(${token}))` : `rgb(var(${token}) / ${alpha})`
}

/** Slot / grid fill colors — resolved via CSS variables for light & dark themes. */
export const CAL_GRID_COLORS = {
  cellBase: calRgb("--cal-cell-base"),
  cellMuted: calRgb("--cal-cell-muted"),
  cellOutsideInBand: calRgb("--cal-cell-outside-in"),
  cellCurrentHour: calRgb("--cal-cell-current-hour", 0.3),
  cellCurrentHourStaff: calRgb("--cal-cell-current-hour", 0.2),
  cellAltHour: calRgb("--cal-cell-alt", 0.4),
  slotMenu: calRgb("--cal-slot-menu", 0.4),
  slotMenuStaff: calRgb("--cal-slot-menu", 0.5),
  dragValid: calRgb("--cal-drag-valid", 0.5),
  dragInvalid: calRgb("--cal-drag-invalid", 0.48),
  guide1: calRgb("--cal-guide-1", 0.22),
  guide2: calRgb("--cal-guide-2", 0.38),
} as const

/** Tailwind arbitrary classes that reference calendar CSS variables. */
export const CAL_GRID_CLASSES = {
  shell: "rounded-2xl overflow-hidden border border-slate-200/80 bg-slate-50/50 shadow-sm",
  scroll: "overflow-auto flex-1 min-h-0 bg-white/50",
  timeHeader:
    "sticky border-b border-r border-slate-200/80 bg-slate-50 px-3 py-3 font-medium text-slate-500 text-xs uppercase tracking-wider text-left w-full hover:bg-slate-100/80 transition-colors cursor-default",
  staffHeader:
    "sticky border-b border-r border-slate-200/80 bg-white/95 backdrop-blur-sm px-3 py-2 last:border-r-0 calendar-staff-header-shadow flex items-center justify-center min-w-0",
  slotHover:
    "hover:shadow-[inset_0_0_0_9999px_rgb(var(--cal-hover-slot)/0.55)] hover:ring-1 hover:ring-violet-200/60 hover:ring-inset",
  gapHover:
    "hover:bg-violet-100/85 hover:shadow-[inset_0_0_0_9999px_rgb(var(--cal-hover-slot)/0.45)] hover:ring-1 hover:ring-inset hover:ring-violet-200/60",
} as const
