"use client"

import * as React from "react"
import { createPortal } from "react-dom"
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

export type ProductFilterExtraOption = { value: string; label: string }

export interface ProductFilterComboboxProps {
  value: string
  onValueChange: (v: string) => void
  products: { _id: string; name: string }[]
  /** Names (or ids) that should appear but are not in `products`, e.g. legacy sale lines */
  extraOptions?: ProductFilterExtraOption[]
  disabled?: boolean
  triggerClassName?: string
}

type Row = { key: string; filterValue: string; selectValue: string; label: string }

type HoverTip = { label: string; top: number; left: number }

function ProductNameLabel({ label, className }: { label: string; className?: string }) {
  return (
    <span data-product-filter-label className={cn("block min-w-0 truncate", className)}>
      {label}
    </span>
  )
}

function ProductHoverTip({ tip }: { tip: HoverTip | null }) {
  if (!tip || typeof document === "undefined") return null
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[300] max-w-sm rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-md"
      style={{
        top: tip.top,
        left: tip.left,
        transform: "translateY(-50%)",
      }}
    >
      {tip.label}
    </div>,
    document.body
  )
}

export function ProductFilterCombobox({
  value,
  onValueChange,
  products,
  extraOptions = [],
  disabled,
  triggerClassName,
}: ProductFilterComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [hoverTip, setHoverTip] = React.useState<HoverTip | null>(null)

  const showHoverTip = React.useCallback((label: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setHoverTip({
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    })
  }, [])

  const selectedLabel = React.useMemo(() => {
    if (value === "all") return "All products"
    const fromCatalog = products.find((p) => p._id === value)
    if (fromCatalog) return fromCatalog.name
    const extra = extraOptions.find((o) => o.value === value)
    if (extra) return extra.label
    return "Product"
  }, [value, products, extraOptions])

  const allRows = React.useMemo((): Row[] => {
    const rows: Row[] = [
      { key: "all", filterValue: "all All products", selectValue: "all", label: "All products" },
    ]
    for (const p of products) {
      rows.push({
        key: `id:${p._id}`,
        filterValue: `${p.name} ${p._id}`,
        selectValue: p._id,
        label: p.name,
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
  }, [products, extraOptions])

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setHoverTip(null)
        }}
      >
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
            onMouseEnter={(e) => {
              if (value === "all") return
              showHoverTip(selectedLabel, e.currentTarget)
            }}
            onMouseLeave={() => setHoverTip(null)}
          >
            <ProductNameLabel label={selectedLabel} className="flex-1 text-left" />
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="!z-[120] min-w-[var(--radix-popover-trigger-width)] w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,28rem)] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search products..." />
            <CommandList>
              <CommandEmpty>No product found.</CommandEmpty>
              <CommandGroup>
                {allRows.map((row) => (
                  <CommandItem
                    key={row.key}
                    value={row.filterValue}
                    onSelect={() => {
                      onValueChange(row.selectValue)
                      setOpen(false)
                      setHoverTip(null)
                    }}
                    className="min-w-0"
                    onMouseEnter={(e) => {
                      if (row.selectValue === "all") return
                      showHoverTip(row.label, e.currentTarget)
                    }}
                    onMouseLeave={() => setHoverTip(null)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === row.selectValue ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <ProductNameLabel label={row.label} className="flex-1" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <ProductHoverTip tip={hoverTip} />
    </>
  )
}
