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

function entityIdStr(raw: unknown): string {
  if (raw == null || raw === "") return ""
  if (typeof raw === "string") return raw.trim()
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw))
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>
    if (typeof o.$oid === "string") return o.$oid.trim()
    if (o._id != null) return entityIdStr(o._id)
    const ts = (raw as { toString?: () => string }).toString?.call(raw)
    if (typeof ts === "string") {
      const t = ts.trim()
      if (/^[a-f0-9]{24}$/i.test(t)) return t
      const m = t.match(/ObjectId\s*\(\s*['"]?([a-f0-9]{24})['"]?\s*\)/i)
      if (m?.[1]) return m[1]
    }
  }
  return ""
}

function productDocIdStr(p: { _id?: unknown; id?: unknown }): string {
  return entityIdStr(p._id ?? p.id)
}

export type PurchaseInvoiceProductRow = {
  _id?: unknown
  id?: unknown
  name?: string
  sku?: string | number | null
  productType?: string
}

export interface PurchaseInvoiceProductComboboxProps {
  /** Selected product Mongo id (empty when none) */
  value: string
  onValueChange: (productId: string) => void
  products: PurchaseInvoiceProductRow[]
  /** Trigger text — computed by parent (e.g. catalog name vs PO hint) */
  buttonLabel: string
  placeholder?: string
  triggerTitle?: string
  disabled?: boolean
  triggerClassName?: string
  /** Portal target for popover (e.g. `DialogContent` node) so menus work inside a Radix Dialog. */
  portalContainer?: HTMLElement | null
}

export function PurchaseInvoiceProductCombobox({
  value,
  onValueChange,
  products,
  buttonLabel,
  placeholder = "Search by name or SKU…",
  triggerTitle,
  disabled,
  triggerClassName,
  portalContainer,
}: PurchaseInvoiceProductComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const rows = React.useMemo(() => {
    return products.map((p) => {
      const id = productDocIdStr(p)
      const name = (p.name ?? "").trim() || "Unnamed"
      const sku = p.sku != null && String(p.sku).trim() !== "" ? String(p.sku).trim() : ""
      const pType = p.productType != null ? String(p.productType) : ""
      const filterValue = [name, sku, id, pType].filter(Boolean).join(" ")
      return { id, filterValue, name, sku, pType }
    })
  }, [products])

  const valueNorm = value.trim().toLowerCase()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          title={triggerTitle}
          className={cn(
            "h-9 w-full min-w-0 max-w-full justify-between font-normal text-xs [&>span]:min-w-0 [&>span]:truncate",
            triggerClassName
          )}
        >
          <span className="min-w-0 truncate text-left">{buttonLabel}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-pi-combobox="1"
        container={portalContainer ?? undefined}
        className="p-0 w-[min(22rem,calc(100vw-1.5rem))]"
        align="start"
        sideOffset={4}
      >
        <Command>
          <CommandInput placeholder={placeholder} className="h-9 text-sm" />
          <CommandList>
            <CommandEmpty>No product matches.</CommandEmpty>
            <CommandGroup className="max-h-[280px] overflow-y-auto">
              {rows.map((row) => (
                <CommandItem
                  key={row.id}
                  value={row.filterValue}
                  onSelect={() => {
                    onValueChange(row.id)
                    setOpen(false)
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      valueNorm && valueNorm === row.id.toLowerCase() ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium leading-tight">{row.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {[row.sku && `SKU ${row.sku}`, row.pType].filter(Boolean).join(" · ") || row.id}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
