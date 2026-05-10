"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

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

export type ServiceFilterExtraOption = { value: string; label: string }

export interface ServiceFilterComboboxProps {
  value: string
  onValueChange: (v: string) => void
  services: { _id: string; name: string }[]
  /** Names from sale lines not present in catalog */
  extraOptions?: ServiceFilterExtraOption[]
  disabled?: boolean
  triggerClassName?: string
}

type Row = { key: string; filterValue: string; selectValue: string; label: string }

export function ServiceFilterCombobox({
  value,
  onValueChange,
  services,
  extraOptions = [],
  disabled,
  triggerClassName,
}: ServiceFilterComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedLabel = React.useMemo(() => {
    if (value === "all") return "All services"
    const fromCatalog = services.find((s) => s._id === value)
    if (fromCatalog) return fromCatalog.name
    const extra = extraOptions.find((o) => o.value === value)
    if (extra) return extra.label
    return "Service"
  }, [value, services, extraOptions])

  const allRows = React.useMemo((): Row[] => {
    const rows: Row[] = [
      { key: "all", filterValue: "all All services", selectValue: "all", label: "All services" },
    ]
    for (const s of services) {
      rows.push({
        key: `id:${s._id}`,
        filterValue: `${s.name} ${s._id}`,
        selectValue: s._id,
        label: s.name,
      })
    }
    for (const e of extraOptions) {
      rows.push({
        key: `extra:${e.value}`,
        filterValue: `${e.label} ${e.value}`,
        selectValue: e.value,
        label: e.label,
      })
    }
    return rows
  }, [services, extraOptions])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          type="button"
          className={cn(
            "flex h-10 cursor-pointer items-center justify-between rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
            triggerClassName ?? "w-44 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="min-w-[var(--radix-popover-trigger-width)] w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,22rem)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search services..." />
          <CommandList>
            <CommandEmpty>No service found.</CommandEmpty>
            <CommandGroup>
              {allRows.map((row) => (
                <CommandItem
                  key={row.key}
                  value={row.filterValue}
                  onSelect={() => {
                    onValueChange(row.selectValue)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === row.selectValue ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{row.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
