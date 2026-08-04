"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  sortStaffByName,
  staffNamePrefixCommandFilter,
} from "@/lib/staff-name-search"

export type StaffSearchOption = { id: string; name: string }

export type StaffSearchComboboxProps = {
  value: string
  onValueChange: (value: string) => void
  staff: StaffSearchOption[]
  disabled?: boolean
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  triggerClassName?: string
  contentClassName?: string
  id?: string
  /** Portal target for popovers inside dialogs/sheets */
  portalContainer?: HTMLElement | null
}

export function StaffSearchCombobox({
  value,
  onValueChange,
  staff,
  disabled = false,
  placeholder = "Select staff",
  searchPlaceholder = "Search staff…",
  emptyMessage = "No staff found.",
  triggerClassName,
  contentClassName,
  id,
  portalContainer,
}: StaffSearchComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedName = React.useMemo(() => {
    if (!value) return null
    return staff.find((s) => s.id === value)?.name ?? null
  }, [value, staff])

  const sortedStaff = React.useMemo(() => sortStaffByName(staff), [staff])

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || staff.length === 0}
          className={cn(
            "h-8 w-full justify-between gap-2 border-input bg-background px-2 py-1.5 text-left font-normal shadow-sm",
            triggerClassName
          )}
        >
          <span className="min-w-0 flex-1 truncate text-xs">
            {selectedName ?? placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer ?? undefined}
        className={cn("w-[min(100vw-2rem,280px)] p-0 !z-[9999]", contentClassName)}
        align="start"
        side="bottom"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter filter={staffNamePrefixCommandFilter}>
          <CommandInput placeholder={searchPlaceholder} className="h-9 text-sm" />
          <CommandList className="max-h-56">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {sortedStaff.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onSelect={() => {
                    onValueChange(s.id)
                    setOpen(false)
                  }}
                  className="text-sm"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === s.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{s.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
