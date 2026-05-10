"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { ServicesAPI } from "@/lib/api"
import { useCurrency } from "@/hooks/use-currency"
import { CategoryCombobox } from "../products/category-combobox"
import type { BundlePricingType, BundleScheduleType } from "@/lib/bundle-service"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChevronDown, Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react"

interface BundleServiceFormProps {
  onClose?: () => void
  service?: any
}

function isSimpleServiceRow(s: any): boolean {
  return s?.serviceKind !== "bundle"
}

export function BundleServiceForm({ onClose, service }: BundleServiceFormProps) {
  const { getSymbol } = useCurrency()
  const { toast } = useToast()
  const [catalog, setCatalog] = useState<any[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)

  const initialChildIds = useMemo(() => {
    if (!service?.bundleItems?.length) return [] as string[]
    return [...service.bundleItems]
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((row: any) => String(row.serviceId?._id || row.serviceId))
      .filter(Boolean)
  }, [service])

  const [name, setName] = useState(service?.name || "")
  const [category, setCategory] = useState(service?.category || "")
  const [description, setDescription] = useState(service?.description || "")
  const [childIds, setChildIds] = useState<string[]>(initialChildIds)
  const [scheduleType, setScheduleType] = useState<BundleScheduleType>(
    service?.bundleScheduleType === "parallel" ? "parallel" : "sequence"
  )
  const [pricingType, setPricingType] = useState<BundlePricingType>(
    (service?.bundlePricingType as BundlePricingType) || "full_price"
  )
  const [percentOff, setPercentOff] = useState(
    service?.bundlePercentOff != null ? String(service.bundlePercentOff) : ""
  )
  const [retailPrice, setRetailPrice] = useState(
    service?.bundleRetailPrice != null
      ? String(service.bundleRetailPrice)
      : service?.bundlePricingType === "custom"
        ? String(service?.price ?? "")
        : ""
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [popoverPortalEl, setPopoverPortalEl] = useState<HTMLDivElement | null>(null)
  const [serviceSearch, setServiceSearch] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await ServicesAPI.getAll({ limit: 1000 })
        if (cancelled) return
        if (res.success) {
          setCatalog(res.data || [])
        }
      } catch {
        if (!cancelled) toast({ title: "Error", description: "Failed to load services.", variant: "destructive" })
      } finally {
        if (!cancelled) setLoadingCatalog(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  const simpleOptions = useMemo(() => {
    const selfId = service ? String(service._id || service.id) : ""
    return catalog.filter((s) => {
      if (!isSimpleServiceRow(s)) return false
      const sid = String(s._id || s.id)
      if (!sid || sid === selfId) return false
      return true
    })
  }, [catalog, service])

  const filteredSimpleOptions = useMemo(() => {
    const q = serviceSearch.toLowerCase().trim()
    if (!q) return simpleOptions
    return simpleOptions.filter((s) => {
      const name = (s.name || "").toLowerCase()
      const sid = String(s._id || s.id).toLowerCase()
      return name.includes(q) || sid.includes(q)
    })
  }, [simpleOptions, serviceSearch])

  const childRows = useMemo(() => {
    return childIds
      .map((id) => {
        const s = catalog.find((c) => String(c._id || c.id) === id)
        return s ? { id, name: s.name || id, duration: s.duration } : { id, name: id, duration: 0 }
      })
      .filter(Boolean)
  }, [childIds, catalog])

  const addChild = (serviceId: string) => {
    if (!serviceId || childIds.includes(serviceId)) return
    setChildIds((prev) => [...prev, serviceId])
    setServiceSearch("")
    setPickerOpen(false)
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= childIds.length) return
    setChildIds((prev) => {
      const copy = [...prev]
      const t = copy[index]!
      copy[index] = copy[next]!
      copy[next] = t
      return copy
    })
  }

  const removeAt = (index: number) => {
    setChildIds((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !category.trim()) {
      toast({ title: "Missing fields", description: "Name and category are required.", variant: "destructive" })
      return
    }
    if (childIds.length < 2) {
      toast({ title: "Bundle services", description: "Add at least two services to the bundle.", variant: "destructive" })
      return
    }
    if (pricingType === "percent_discount") {
      const p = parseFloat(percentOff)
      if (Number.isNaN(p) || p < 0 || p > 100) {
        toast({
          title: "Invalid discount",
          description: "Percentage must be between 0 and 100.",
          variant: "destructive",
        })
        return
      }
    }
    if (pricingType === "custom") {
      const r = parseFloat(retailPrice)
      if (Number.isNaN(r) || r < 0) {
        toast({ title: "Retail price", description: "Enter a valid retail price.", variant: "destructive" })
        return
      }
    }

    const bundleItems = childIds.map((serviceId, sortOrder) => ({ serviceId, sortOrder }))
    const body: Record<string, unknown> = {
      serviceKind: "bundle",
      name: name.trim(),
      category: category.trim(),
      description: description.trim(),
      bundleItems,
      bundleScheduleType: scheduleType,
      bundlePricingType: pricingType,
    }
    if (pricingType === "percent_discount") body.bundlePercentOff = parseFloat(percentOff)
    if (pricingType === "custom") body.bundleRetailPrice = parseFloat(retailPrice)

    setSubmitting(true)
    try {
      let res
      if (service) {
        res = await ServicesAPI.update(service._id || service.id, body)
      } else {
        res = await ServicesAPI.create(body)
      }
      if (res.success) {
        toast({
          title: service ? "Bundle updated" : "Bundle created",
          description: service ? "The bundle has been updated." : "The bundle has been added to your directory.",
        })
        onClose?.()
        window.dispatchEvent(new CustomEvent("service-added"))
      } else {
        throw new Error(res.error || "Request failed")
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Could not save bundle.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const sym = getSymbol()

  return (
    <>
      {/* Portal target in-tree: Popover must render inside Dialog focus scope or clicks won't register. */}
      <div ref={setPopoverPortalEl} />
      <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="bundle-name">Bundle name</Label>
        <Input
          id="bundle-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cut and blow-dry"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Category</Label>
        <CategoryCombobox type="service" value={category} onChange={setCategory} />
        <p className="text-xs text-muted-foreground">The category displayed to you and to clients online.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="bundle-desc">Description (optional)</Label>
          <span className="text-xs text-muted-foreground">{description.length}/1000</span>
        </div>
        <Textarea
          id="bundle-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
          placeholder="Add a description about this bundle"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Services</Label>
        <p className="text-xs text-muted-foreground">
          Select services to include and order them for how they should be sequenced when booked.
        </p>
        <Popover
          open={pickerOpen}
          onOpenChange={(open) => {
            setPickerOpen(open)
            if (!open) setServiceSearch("")
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between font-normal"
              disabled={loadingCatalog}
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add service
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
            container={popoverPortalEl ?? undefined}
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search services..."
                value={serviceSearch}
                onValueChange={setServiceSearch}
              />
              <CommandList>
                <CommandEmpty>No service found.</CommandEmpty>
                <CommandGroup>
                  {filteredSimpleOptions.map((s) => {
                    const sid = String(s._id || s.id)
                    return (
                      <CommandItem
                        key={sid}
                        value={sid}
                        keywords={[String(s.name || ""), String(s.category || ""), sid]}
                        onSelect={() => addChild(sid)}
                      >
                        <span className="truncate">{s.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{s.duration} min</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {childRows.length > 0 ? (
          <ul className="rounded-md border divide-y bg-muted/30">
            {childRows.map((row, idx) => (
              <li key={`${row.id}-${idx}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1 truncate font-medium">{row.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{row.duration} min</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => move(idx, 1)}
                  disabled={idx === childRows.length - 1}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive"
                  onClick={() => removeAt(idx)}
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No services added yet.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Schedule type</Label>
        <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as BundleScheduleType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sequence">Booked in sequence</SelectItem>
            <SelectItem value="parallel">Booked in parallel</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Sequence: one after another. Parallel: same start time (custom scheduling).
        </p>
      </div>

      <div className="space-y-2">
        <Label>Pricing</Label>
        <Select value={pricingType} onValueChange={(v) => setPricingType(v as BundlePricingType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full_price">Service pricing (full price)</SelectItem>
            <SelectItem value="custom">Custom price</SelectItem>
            <SelectItem value="percent_discount">Percentage discount</SelectItem>
            <SelectItem value="free">Free</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {pricingType === "percent_discount" ? (
        <div className="space-y-2">
          <Label htmlFor="pct-off">Percent off</Label>
          <Input
            id="pct-off"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={percentOff}
            onChange={(e) => setPercentOff(e.target.value)}
            placeholder="0"
          />
        </div>
      ) : null}

      {pricingType === "custom" ? (
        <div className="space-y-2">
          <Label htmlFor="retail">Retail price</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{sym}</span>
            <Input
              id="retail"
              type="number"
              min={0}
              step={0.01}
              className="pl-8"
              value={retailPrice}
              onChange={(e) => setRetailPrice(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => onClose?.()} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
          {service ? "Save bundle" : "Create bundle"}
        </Button>
      </div>
    </form>
    </>
  )
}
