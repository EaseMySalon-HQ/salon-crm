"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { FormControl, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { parseLocalYmd, toLocalYmd } from "@/lib/local-date"
import { cn } from "@/lib/utils"

type FollowUpDateFieldProps = {
  label?: string
  value: string
  onChange: (ymd: string) => void
}

/**
 * Follow-up date inside admin dialogs.
 * Uses an inline calendar (no Popover portal) so day clicks are not blocked by Dialog layers.
 */
export function FollowUpDateField({
  label = "Follow-up date",
  value,
  onChange,
}: FollowUpDateFieldProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const selected = parseLocalYmd(value)

  const handleSelect = (d: Date | undefined) => {
    if (!d) return
    onChange(toLocalYmd(d))
    setCalendarOpen(false)
  }

  return (
    <FormItem>
      <FormLabel className="flex items-center gap-2">
        <CalendarIcon className="h-4 w-4" />
        {label}
      </FormLabel>
      <FormControl>
        <Button
          type="button"
          variant="outline"
          aria-expanded={calendarOpen}
          onClick={() => setCalendarOpen((open) => !open)}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, "PPP") : "Pick date"}
        </Button>
      </FormControl>
      {calendarOpen ? (
        <div className="relative z-10 w-fit rounded-lg border bg-card shadow-md">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={handleSelect}
          />
        </div>
      ) : null}
      <FormMessage />
    </FormItem>
  )
}
