"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DayPicker } from "react-day-picker"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
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
    button_previous:
      "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30",
    button_next:
      "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30",
    month_caption: "flex h-8 items-center justify-center text-base font-semibold text-slate-900",
    table: "w-full border-collapse",
    weekdays: "flex",
    weekday:
      "flex-1 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500",
    week: "flex",
    day: "flex-1 aspect-square p-0.5",
    outside: "text-slate-300",
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
            isDisabled && "cursor-not-allowed text-slate-300",
            !isDisabled && !isSelected && !isToday && "font-medium text-slate-700 hover:bg-purple-50",
            !isDisabled && isToday && !isSelected && "font-semibold text-slate-900 ring-1 ring-inset ring-slate-400",
            isSelected && "bg-[#7C3AED] font-semibold text-white shadow-sm hover:bg-[#6D28D9]"
          )}
        >
          {day.date.getDate()}
        </button>
      )
    },
  }

  const timezoneFooter = (
    <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
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
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => {
          if (view === "combined") setMobileCalendarExpanded(true)
        }}
        className="min-w-0 flex-1 rounded-lg px-2 py-2 text-center text-sm font-semibold leading-snug text-slate-900 transition-colors hover:bg-purple-50"
      >
        {formatSelectedDateLabel(selectedDate)}
      </button>
      <button
        type="button"
        onClick={() => stepSelectedDate(1)}
        disabled={!canStepDate(1)}
        aria-label="Next day"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  ) : null

  const slotsPanel = (
    <>
      {!selectedDate ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center text-center text-sm text-slate-500">
          Select a date to see available slots.
        </div>
      ) : slotsLoading ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#7C3AED]" />
          Loading slots…
        </div>
      ) : closedDay ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold text-slate-900">Closed on this day</p>
          <p className="mt-1 text-xs text-slate-500">Please choose another date.</p>
        </div>
      ) : slots.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold text-slate-900">No slots available</p>
          <p className="mt-1 text-xs text-slate-500">Try another date.</p>
        </div>
      ) : (
        <div>
          {view === "combined" ? (
            <p className="mb-3 text-sm font-semibold text-slate-900 lg:sr-only">Select a time</p>
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
                    isSelected && "border-[#7C3AED] bg-purple-50 shadow-sm",
                    !isSelected &&
                      isAvailable &&
                      "border-slate-200 bg-white hover:border-[#7C3AED]/50 hover:bg-purple-50/50",
                    isBooked && "border-slate-100 bg-slate-50 text-slate-400"
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
                        isSelected ? "text-[#7C3AED]" : isAvailable ? "text-slate-900" : "text-slate-400"
                      )}
                    >
                      {formatSlotTimeDisplay(slot.time)}
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide">
                      {isSelected ? (
                        <span className="text-[#7C3AED]">Selected</span>
                      ) : slot.status === "available" ? (
                        <span className="text-emerald-600">Available</span>
                      ) : (
                        <span className="text-slate-400">Booked</span>
                      )}
                    </span>
                  </button>
                  {isBooked && !isPastSlot && onChangeStaff && (
                    <button
                      type="button"
                      onClick={onChangeStaff}
                      className="mt-1 text-[10px] font-normal normal-case tracking-normal text-[#7C3AED] hover:underline"
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
            <h2 className="text-lg font-semibold text-slate-900">Pick a date</h2>
            <p className="mt-1 text-sm text-slate-500">Select a day for your appointment.</p>
          </div>
        )}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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
            <h2 className="text-lg font-semibold text-slate-900">Pick a time</h2>
            <p className="mt-1 text-sm text-slate-500">Choose an available slot.</p>
          </div>
        )}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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
          <h2 className="text-lg font-semibold text-slate-900">Pick a convenient time</h2>
          <p className="mt-1 text-sm text-slate-500">Select a date and available time slot.</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid lg:grid-cols-2">
          <div className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r lg:p-6">
            {showMobileCompactDate ? (
              <div className="lg:hidden">
                {compactDateNav}
                <p className="mt-2 text-center text-xs text-slate-500">Tap date to open calendar</p>
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
