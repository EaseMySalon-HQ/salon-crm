"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface MembershipServiceSearchComboboxProps {
  value: string
  onValueChange: (serviceId: string) => void
  services: any[]
  getSymbol: () => string
  placeholder?: string
  disabled?: boolean
  /**
   * Render the popover inside this node (e.g. the membership form).
   * Required when this combobox is used inside a Radix Sheet/Dialog so focus trap does not steal
   * focus from the search field (portaling only to `document.body` breaks keyboard input).
   */
  portalContainer?: HTMLElement | null
}

export function MembershipServiceSearchCombobox({
  value,
  onValueChange,
  services,
  getSymbol,
  placeholder = "Search service to exclude…",
  disabled,
  portalContainer,
}: MembershipServiceSearchComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(id)
  }, [open])

  const selected = React.useMemo(
    () => services.find((s) => String(s._id || s.id) === value),
    [services, value],
  )

  const selectedLabel = selected
    ? `${selected.name} (${getSymbol()}${selected.price})`
    : null

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return services
    return services.filter((s) => {
      const name = String(s.name ?? "").toLowerCase()
      const id = String(s._id ?? s.id ?? "").toLowerCase()
      const price = String(s.price ?? "")
      const label = `${name} ${id} ${getSymbol()}${price}`.toLowerCase()
      return name.includes(q) || id.includes(q) || price.includes(q) || label.includes(q)
    })
  }, [services, query, getSymbol])

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
            "h-10 flex-1 justify-between border-border/70 px-3 font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate text-left">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer ?? undefined}
        className="min-w-[var(--radix-popover-trigger-width)] w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,22rem)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          className="flex flex-col"
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services…"
              className="h-9 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              autoComplete="off"
            />
          </div>
          <div className="max-h-[min(280px,45vh)] overflow-y-auto overscroll-contain p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No service found.</p>
            ) : (
              filtered.map((s) => {
                const id = String(s._id || s.id)
                const label = `${s.name} (${getSymbol()}${s.price})`
                return (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      "flex w-full cursor-pointer items-center rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                    )}
                    onClick={() => {
                      onValueChange(id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 truncate">{label}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
