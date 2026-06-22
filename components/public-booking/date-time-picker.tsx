"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DayPicker } from "react-day-picker"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { BT } from "@/lib/booking-page-theme"
import {
  dateToIso,
  formatSlotTimeDisplay,
  isoToDate,
  isDayClosed,
  maxBookingDate,
  type PublicBookingProfile,
  type PublicBookingSlot,
} from "@/lib/public-booking-api"

type DateTimePickerView = "combined" | "date" | "slots"

type DateTimePickerProps = {
  profile: PublicBookingProfile
  selectedDate: string
  selectedTime: string | null
  selectedStartAt: string | null
  slots: PublicBookingSlot[]
  slotsLoading: boolean
  closedDay: boolean
  onDateChange: (iso: string) => void
  onSlotSelect: (slot: PublicBookingSlot) => void
  onChangeStaff?: () => void
  hideHeader?: boolean
  view?: DateTimePickerView
}

function formatSelectedDateLabel(iso: string): string {
  const d = isoToDate(iso)
  if (!d) return iso
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isDateSelectable(
  profile: PublicBookingProfile,
  date: Date,
  todayMidnight: Date,
  maxDate: Date
): boolean {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  if (day < todayMidnight || day > maxDate) return false
  return !isDayClosed(profile, day)
}

function slotLabel(status: PublicBookingSlot["status"]): string {
  switch (status) {
    case "available":
      return "Available"
    case "fully_booked":
      return "Booked"
    case "unavailable":
      return "Booked"
    default:
      return "Unavailable"
  }
}

export function DateTimePicker({
  profile,
  selectedDate,
  selectedTime,
  selectedStartAt,
  slots,
  slotsLoading,
  closedDay,
  onDateChange,
  onSlotSelect,
  onChangeStaff,
  hideHeader = false,
  view = "combined",
}: DateTimePickerProps) {
  const timeSlotsRef = useRef<HTMLDivElement>(null)
  const scrollToSlotsOnMobileRef = useRef(false)
  const [mobileCalendarExpanded, setMobileCalendarExpanded] = useState(true)

  const todayMidnight = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const maxDate = useMemo(
    () => maxBookingDate(profile.advanceBookingDays),
    [profile.advanceBookingDays]
  )

  const selectedDateObj = isoToDate(selectedDate)

  const istNow = useMemo(
    () =>
      new Date().toLocaleTimeString("en-IN", {
        timeZone: profile.timezone || "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
    [profile.timezone]
  )

  useEffect(() => {
    if (!selectedDate) {
      setMobileCalendarExpanded(true)
    }
  }, [selectedDate])

  const canStepDate = useCallback(
    (direction: -1 | 1) => {
      if (!selectedDateObj) return false
      let cursor = addDays(selectedDateObj, direction)
      for (let i = 0; i <= profile.advanceBookingDays + 7; i += 1) {
        if (isDateSelectable(profile, cursor, todayMidnight, maxDate)) return true
        cursor = addDays(cursor, direction)
      }
      return false
    },
    [profile, selectedDateObj, todayMidnight, maxDate]
  )

  const stepSelectedDate = useCallback(
    (direction: -1 | 1) => {
      if (!selectedDateObj || !canStepDate(direction)) return
      let cursor = addDays(selectedDateObj, direction)
      for (let i = 0; i <= profile.advanceBookingDays + 7; i += 1) {
        if (isDateSelectable(profile, cursor, todayMidnight, maxDate)) {
          scrollToSlotsOnMobileRef.current = true
          onDateChange(dateToIso(cursor))
          return
        }
        cursor = addDays(cursor, direction)
      }
    },
    [canStepDate, onDateChange, profile, selectedDateObj, todayMidnight, maxDate]
  )

  const handleDateSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) {
        onDateChange("")
        return
      }
      onDateChange(dateToIso(date))
      if (view === "combined" && window.matchMedia("(max-width: 1023px)").matches) {
        scrollToSlotsOnMobileRef.current = true
        setMobileCalendarExpanded(false)
      }
    },
    [onDateChange, view]
  )

  useEffect(() => {
    if (view !== "combined") return
    if (!scrollToSlotsOnMobileRef.current || !selectedDate || slotsLoading) return
    if (!window.matchMedia("(max-width: 1023px)").matches) {
      scrollToSlotsOnMobileRef.current = false
      return
    }
    scrollToSlotsOnMobileRef.current = false
    requestAnimationFrame(() => {
      timeSlotsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [selectedDate, slotsLoading])

  const dayPickerDisabled = useMemo(
    () => [
      { before: todayMidnight },
      { after: maxDate },
      (date: Date) => isDayClosed(profile, date),
    ],
    [todayMidnight, maxDate, profile]
  )

  const dayPickerClassNames = {
    months: "flex flex-col",
    month: "flex flex-col gap-2",
    nav: "flex items-center justify-between px-1",
    button_previous: cn(
      "inline-flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-30",
      BT.textSecondary,
      BT.hoverAccentSoft
    ),
    button_next: cn(
      "inline-flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-30",
      BT.textSecondary,
      BT.hoverAccentSoft
    ),
    month_caption: cn("flex h-8 items-center justify-center text-base font-semibold", BT.textPrimary),
    table: "w-full border-collapse",
    weekdays: "flex",
    weekday: cn(
      "flex-1 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide",
      BT.textMuted
    ),
    week: "flex",
    day: "flex-1 aspect-square p-0.5",
    outside: BT.textSubtle,
    disabled: "opacity-40",
  }

  const dayPickerComponents = {
    Chevron: ({ orientation, className }: { orientation?: "left" | "right" | "up" | "down"; className?: string }) =>
      orientation === "left" ? (
        <ChevronLeft className={cn("h-4 w-4", className)} aria-hidden />
      ) : (
        <ChevronRight className={cn("h-4 w-4", className)} aria-hidden />
      ),
    DayButton: ({
      day,
      modifiers,
      ...buttonProps
    }: {
      day: { date: Date }
      modifiers: Record<string, boolean>
    } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const isSelected = !!modifiers.selected
      const isToday = !!modifiers.today
      const isDisabled = !!modifiers.disabled
      return (
        <button
          type="button"
          disabled={isDisabled}
          aria-label={day.date.toDateString()}
          {...buttonProps}
          className={cn(
            "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors",
            isDisabled && cn("cursor-not-allowed", BT.textSubtle),
            !isDisabled && !isSelected && !isToday && cn("font-medium", BT.textSecondary, BT.hoverAccentSoft),
            !isDisabled &&
              isToday &&
              !isSelected &&
              cn("font-semibold ring-1 ring-inset", BT.textPrimary, BT.ringAccent),
            isSelected && cn("font-semibold text-white shadow-sm hover:opacity-90", BT.bgAccent)
          )}
        >
          {day.date.getDate()}
        </button>
      )
    },
  }

  const timezoneFooter = (
    <div className={cn("mt-4 border-t pt-3 text-xs", BT.borderSubtle, BT.textMuted)}>
      {profile.timezone.replace("_", " ")} ({istNow})
    </div>
  )

  const dayPicker = (
    <DayPicker
      mode="single"
      selected={selectedDateObj}
      onSelect={handleDateSelect}
      disabled={dayPickerDisabled}
      startMonth={new Date(todayMidnight.getFullYear(), todayMidnight.getMonth(), 1)}
      endMonth={new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1)}
      showOutsideDays={false}
      className="mx-auto w-full"
      classNames={dayPickerClassNames}
      components={dayPickerComponents}
    />
  )

  const showMobileCompactDate = view === "combined" && selectedDate && !mobileCalendarExpanded

  const compactDateNav = selectedDate ? (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => stepSelectedDate(-1)}
        disabled={!canStepDate(-1)}
        aria-label="Previous day"
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30",
          BT.textSecondary,
          BT.hoverAccentSoft
        )}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => {
          if (view === "combined") setMobileCalendarExpanded(true)
        }}
        className={cn(
          "min-w-0 flex-1 rounded-lg px-2 py-2 text-center text-sm font-semibold leading-snug transition-colors",
          BT.textPrimary,
          BT.hoverAccentSoft
        )}
      >
        {formatSelectedDateLabel(selectedDate)}
      </button>
      <button
        type="button"
        onClick={() => stepSelectedDate(1)}
        disabled={!canStepDate(1)}
        aria-label="Next day"
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30",
          BT.textSecondary,
          BT.hoverAccentSoft
        )}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  ) : null

  const slotsPanel = (
    <>
      {!selectedDate ? (
        <div className={cn("flex min-h-[220px] flex-col items-center justify-center text-center text-sm", BT.textMuted)}>
          Select a date to see available slots.
        </div>
      ) : slotsLoading ? (
        <div className={cn("flex min-h-[220px] flex-col items-center justify-center gap-2 text-sm", BT.textMuted)}>
          <Loader2 className={cn("h-5 w-5 animate-spin", BT.textAccent)} />
          Loading slots…
        </div>
      ) : closedDay ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
          <p className={cn("text-sm font-semibold", BT.textPrimary)}>Closed on this day</p>
          <p className={cn("mt-1 text-xs", BT.textMuted)}>Please choose another date.</p>
        </div>
      ) : slots.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
          <p className={cn("text-sm font-semibold", BT.textPrimary)}>No slots available</p>
          <p className={cn("mt-1 text-xs", BT.textMuted)}>Try another date.</p>
        </div>
      ) : (
        <div>
          {view === "combined" ? (
            <p className={cn("mb-3 text-sm font-semibold lg:sr-only", BT.textPrimary)}>Select a time</p>
          ) : null}
          <div
            className={cn(
              "grid grid-cols-2 gap-2 sm:grid-cols-3",
              view === "combined" ? "max-h-[320px] overflow-y-auto" : "max-h-none"
            )}
          >
            {slots.map((slot) => {
              const isSelected =
                selectedTime === slot.time ||
                (selectedStartAt != null && selectedStartAt === slot.startAt)
              const isAvailable = slot.status === "available" || isSelected
              const isBooked = !isSelected && !isAvailable
              const isPastSlot = slot.reason === "past"

              return (
                <div
                  key={slot.startAt}
                  className={cn(
                    "flex flex-col items-center rounded-xl border-2 px-2 py-2.5 text-center transition-colors",
                    isSelected && cn("shadow-sm", BT.borderAccent, BT.bgAccentSoft),
                    !isSelected &&
                      isAvailable &&
                      cn(BT.borderDefault, BT.bgSurface, BT.hoverAccentBorder, BT.hoverAccentSoft),
                    isBooked && cn(BT.borderSubtle, BT.bgSurfaceMuted, BT.textSubtle)
                  )}
                >
                  <button
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => slot.status === "available" && onSlotSelect(slot)}
                    className={cn(
                      "flex w-full flex-col items-center",
                      isAvailable && "cursor-pointer",
                      isBooked && "cursor-not-allowed"
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        isSelected ? BT.textAccent : isAvailable ? BT.textPrimary : BT.textSubtle
                      )}
                    >
                      {formatSlotTimeDisplay(slot.time)}
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide">
                      {isSelected ? (
                        <span className={BT.textAccent}>Selected</span>
                      ) : slot.status === "available" ? (
                        <span className="text-emerald-600">Available</span>
                      ) : (
                        <span className={BT.textSubtle}>Booked</span>
                      )}
                    </span>
                  </button>
                  {isBooked && !isPastSlot && onChangeStaff && (
                    <button
                      type="button"
                      onClick={onChangeStaff}
                      className={cn(
                        "mt-1 text-[10px] font-normal normal-case tracking-normal hover:underline",
                        BT.textAccent
                      )}
                    >
                      Change Staff
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )

  if (view === "date") {
    return (
      <section className="space-y-4">
        {!hideHeader && (
          <div>
            <h2 className={cn("text-lg font-semibold", BT.textPrimary)}>Pick a date</h2>
            <p className={cn("mt-1 text-sm", BT.textMuted)}>Select a day for your appointment.</p>
          </div>
        )}
        <div className={cn("overflow-hidden rounded-2xl border p-5 shadow-sm sm:p-6", BT.borderDefault, BT.bgSurface)}>
          {dayPicker}
          {timezoneFooter}
        </div>
      </section>
    )
  }

  if (view === "slots") {
    return (
      <section className="space-y-4">
        {!hideHeader && (
          <div>
            <h2 className={cn("text-lg font-semibold", BT.textPrimary)}>Pick a time</h2>
            <p className={cn("mt-1 text-sm", BT.textMuted)}>Choose an available slot.</p>
          </div>
        )}
        <div className={cn("overflow-hidden rounded-2xl border p-5 shadow-sm sm:p-6", BT.borderDefault, BT.bgSurface)}>
          {compactDateNav ? <div className="mb-4">{compactDateNav}</div> : null}
          {slotsPanel}
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      {!hideHeader && (
        <div>
          <h2 className={cn("text-lg font-semibold", BT.textPrimary)}>Pick a convenient time</h2>
          <p className={cn("mt-1 text-sm", BT.textMuted)}>Select a date and available time slot.</p>
        </div>
      )}

      <div className={cn("overflow-hidden rounded-2xl border shadow-sm", BT.borderDefault, BT.bgSurface)}>
        <div className="grid lg:grid-cols-2">
          <div className={cn("border-b p-5 lg:border-b-0 lg:border-r lg:p-6", BT.borderSubtle)}>
            {showMobileCompactDate ? (
              <div className="lg:hidden">
                {compactDateNav}
                <p className={cn("mt-2 text-center text-xs", BT.textMuted)}>Tap date to open calendar</p>
              </div>
            ) : null}

            <div className={cn(showMobileCompactDate ? "hidden lg:block" : "block")}>
              {dayPicker}
              {timezoneFooter}
            </div>
          </div>

          <div ref={timeSlotsRef} className="scroll-mt-4 p-5 lg:p-6">
            {slotsPanel}
          </div>
        </div>
      </div>
    </section>
  )
}

export { slotLabel }
