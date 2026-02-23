"use client"

import * as React from "react"
import { ChevronsUpDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { CategoriesAPI, ProductsAPI, ServicesAPI } from "@/lib/api"
import { cn } from "@/lib/utils"

interface MultiCategorySelectProps {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

export function MultiCategorySelect({ value, onChange, disabled }: MultiCategorySelectProps) {
  const [open, setOpen] = React.useState(false)
  const [categories, setCategories] = React.useState<{ name: string }[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      setLoading(true)
      const uniqueCategories = new Set<string>()
      const categoryMap = new Map<string, { name: string }>()

      try {
        const response = await CategoriesAPI.getAll({ activeOnly: true })
        if (response.success && response.data) {
          response.data.forEach((c: any) => {
            if (c.name?.trim()) {
              uniqueCategories.add(c.name.trim())
              categoryMap.set(c.name.trim(), { name: c.name.trim() })
            }
          })
        }
      } catch (_) {}

      try {
        const response = await ProductsAPI.getAll({ limit: 10000 })
        if (response.success && response.data) {
          const products = Array.isArray(response.data) ? response.data : (response.data?.data || [])
          products.forEach((p: any) => {
            if (p.category?.trim() && !uniqueCategories.has(p.category.trim())) {
              uniqueCategories.add(p.category.trim())
              categoryMap.set(p.category.trim(), { name: p.category.trim() })
            }
          })
        }
      } catch (_) {}

      try {
        const response = await ServicesAPI.getAll({ limit: 10000 })
        if (response.success && response.data) {
          const services = Array.isArray(response.data) ? response.data : (response.data?.data || [])
          services.forEach((s: any) => {
            if (s.category?.trim() && !uniqueCategories.has(s.category.trim())) {
              uniqueCategories.add(s.category.trim())
              categoryMap.set(s.category.trim(), { name: s.category.trim() })
            }
          })
        }
      } catch (_) {}

      setCategories(Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name)))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = (name: string) => {
    if (value.includes(name)) {
      onChange(value.filter((c) => c !== name))
    } else {
      onChange([...value, name])
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-10 h-auto py-2"
          disabled={disabled || loading}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {value.length === 0 ? (
              <span className="text-muted-foreground">Select categories...</span>
            ) : (
              value.map((c) => (
                <Badge
                  key={c}
                  variant="secondary"
                  className="mr-1 gap-0.5"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(value.filter((x) => x !== c))
                  }}
                >
                  {c}
                  {!disabled && <X className="h-3 w-3 ml-0.5 cursor-pointer" />}
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories..." />
          <CommandList>
            <CommandEmpty>No categories found.</CommandEmpty>
            <CommandGroup>
              {categories.map((cat) => (
                <CommandItem
                  key={cat.name}
                  value={cat.name}
                  onSelect={() => toggleCategory(cat.name)}
                >
                  <div
                    className={cn(
                      "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                      value.includes(cat.name) ? "bg-primary text-primary-foreground" : "opacity-50"
                    )}
                  >
                    {value.includes(cat.name) ? "✓" : ""}
                  </div>
                  {cat.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
