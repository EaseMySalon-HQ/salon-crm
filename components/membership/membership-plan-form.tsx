"use client"

import type React from "react"
import { useState, useEffect } from "react"
import type { LucideIcon } from "lucide-react"
import {
  CalendarDays,
  Layers,
  ListFilter,
  PackagePlus,
  Percent,
  Plus,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { MembershipAPI, ServicesAPI } from "@/lib/api"
import { useCurrency } from "@/hooks/use-currency"
import { cn } from "@/lib/utils"
import { MembershipServiceSearchCombobox } from "@/components/membership/membership-service-search-combobox"

interface IncludedService {
  serviceId: string
  usageLimit: number
}

interface MembershipPlanFormProps {
  plan?: any
  onSuccess?: () => void
  onClose?: () => void
}

function FormSection({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string
  icon?: LucideIcon
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/30 px-4 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-primary/80" aria-hidden /> : null}
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function MembershipPlanForm({ plan, onSuccess, onClose }: MembershipPlanFormProps) {
  const { getSymbol } = useCurrency()
  const { toast } = useToast()
  const [formPortalHost, setFormPortalHost] = useState<HTMLFormElement | null>(null)
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    planName: plan?.planName || "",
    price: plan?.price?.toString() || "",
    durationInDays: plan?.durationInDays?.toString() || "",
    discountPercentage: plan?.discountPercentage?.toString() || "0",
    isActive: plan?.isActive ?? true,
    appliesToAllClients: plan?.appliesToAllClients ?? false,
    unlimitedDuration: plan?.unlimitedDuration ?? false,
  })
  const [includedServices, setIncludedServices] = useState<IncludedService[]>(
    plan?.includedServices?.map((s: any) => ({
      serviceId: (s.serviceId?._id || s.serviceId)?.toString() || "",
      usageLimit: s.usageLimit ?? 0,
    })) || [],
  )
  const [excludedServiceIds, setExcludedServiceIds] = useState<string[]>(() => {
    const raw = plan?.excludedServiceIds
    if (!Array.isArray(raw)) return []
    return raw.map((id: any) => String(id?._id || id || "").trim()).filter(Boolean)
  })

  useEffect(() => {
    ServicesAPI.getAll({ limit: 500 })
      .then((res) => {
        if (res.success && res.data) setServices(res.data)
      })
      .catch(() => setServices([]))
  }, [])

  const addService = () => {
    setIncludedServices((prev) => [...prev, { serviceId: "", usageLimit: 0 }])
  }

  const removeService = (idx: number) => {
    setIncludedServices((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateIncludedService = (idx: number, field: "serviceId" | "usageLimit", value: string | number) => {
    setIncludedServices((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: field === "usageLimit" ? Number(value) || 0 : value }
      return next
    })
  }

  const removeExcludedService = (idx: number) => {
    setExcludedServiceIds((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateExcludedService = (idx: number, serviceId: string) => {
    setExcludedServiceIds((prev) => {
      const next = [...prev]
      next[idx] = serviceId
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const price = parseFloat(formData.price)
    const durationRaw = parseInt(formData.durationInDays, 10)
    const discount = parseFloat(formData.discountPercentage) || 0

    if (!formData.planName || isNaN(price) || price < 0) {
      toast({
        title: "Missing fields",
        description: "Plan name and price are required.",
        variant: "destructive",
      })
      return
    }

    if (!formData.unlimitedDuration && (isNaN(durationRaw) || durationRaw < 1)) {
      toast({
        title: "Missing fields",
        description: "Duration (days) is required when an end date applies.",
        variant: "destructive",
      })
      return
    }

    const durationInDays = formData.unlimitedDuration
      ? Math.max(1, Number.isFinite(durationRaw) && durationRaw >= 1 ? durationRaw : 365)
      : durationRaw

    const validIncluded = includedServices.filter((s) => s.serviceId && s.usageLimit >= 0)
    const validExcludedIds = [...new Set(excludedServiceIds.map((id) => id.trim()).filter(Boolean))]
    const payload = {
      planName: formData.planName.trim(),
      price,
      durationInDays,
      discountPercentage: discount,
      includedServices: validIncluded.map((s) => ({
        serviceId: s.serviceId,
        usageLimit: s.usageLimit,
      })),
      excludedServiceIds: validExcludedIds,
      isActive: formData.isActive,
      appliesToAllClients: formData.appliesToAllClients,
      unlimitedDuration: formData.unlimitedDuration,
    }

    setLoading(true)
    try {
      if (plan) {
        const res = await MembershipAPI.updatePlan(plan._id || plan.id, payload)
        if (res.success) {
          toast({ title: "Plan updated", description: "Membership plan has been updated." })
          onSuccess?.()
          onClose?.()
        } else {
          toast({ title: "Error", description: res.error || "Failed to update", variant: "destructive" })
        }
      } else {
        const res = await MembershipAPI.createPlan(payload)
        if (res.success) {
          toast({ title: "Plan created", description: "Membership plan has been created." })
          window.dispatchEvent(new CustomEvent("membership-plan-added"))
          onSuccess?.()
          onClose?.()
        } else {
          toast({ title: "Error", description: res.error || "Failed to create", variant: "destructive" })
        }
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      ref={setFormPortalHost}
      onSubmit={handleSubmit}
      className="flex flex-col gap-7"
    >
      <FormSection title="Plan identity" icon={Tag}>
        <div className="space-y-2">
          <Label htmlFor="planName" className="text-xs font-medium text-muted-foreground">
            Plan Name
          </Label>
          <Input
            id="planName"
            value={formData.planName}
            onChange={(e) => setFormData((p) => ({ ...p, planName: e.target.value }))}
            placeholder="e.g. Gold Monthly"
            className="h-10"
            required
          />
        </div>
      </FormSection>

      <FormSection title="Pricing & perks" icon={Wallet}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="price" className="text-xs font-medium text-muted-foreground">
              Price ({getSymbol()})
            </Label>
            <Input
              id="price"
              type="number"
              min={0}
              step={0.01}
              value={formData.price}
              onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
              placeholder="0"
              className="h-10"
              required
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="durationInDays"
              className={cn(
                "text-xs font-medium text-muted-foreground",
                formData.unlimitedDuration && "opacity-60",
              )}
            >
              Duration (days)
            </Label>
            <div className="relative">
              <CalendarDays
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70",
                  formData.unlimitedDuration && "opacity-40",
                )}
              />
              <Input
                id="durationInDays"
                type="number"
                min={1}
                value={formData.durationInDays}
                onChange={(e) => setFormData((p) => ({ ...p, durationInDays: e.target.value }))}
                placeholder="30"
                className={cn("h-10 pl-9", formData.unlimitedDuration && "opacity-70")}
                required={!formData.unlimitedDuration}
                disabled={formData.unlimitedDuration}
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="discountPercentage" className="text-xs font-medium text-muted-foreground">
            Discount % (for non-included services)
          </Label>
          <div className="relative">
            <Percent className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              id="discountPercentage"
              type="number"
              min={0}
              max={100}
              step={1}
              value={formData.discountPercentage}
              onChange={(e) => setFormData((p) => ({ ...p, discountPercentage: e.target.value }))}
              placeholder="0"
              className="h-10 pl-9"
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Who & how long" icon={Layers}>
        <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/10">
          <div className="flex items-start justify-between gap-4 p-3.5 sm:p-4">
            <Label
              htmlFor="appliesToAllClients"
              className="cursor-pointer text-sm font-normal leading-snug text-foreground"
            >
              Apply to all clients (auto-assign when missing another active membership)
            </Label>
            <Switch
              id="appliesToAllClients"
              checked={formData.appliesToAllClients}
              onCheckedChange={(v) => setFormData((p) => ({ ...p, appliesToAllClients: v }))}
              className="shrink-0"
            />
          </div>
          <div className="flex items-start justify-between gap-4 p-3.5 sm:p-4">
            <Label
              htmlFor="unlimitedDuration"
              className="cursor-pointer text-sm font-normal leading-snug text-foreground"
            >
              No end date (membership does not expire)
            </Label>
            <Switch
              id="unlimitedDuration"
              checked={formData.unlimitedDuration}
              onCheckedChange={(v) => setFormData((p) => ({ ...p, unlimitedDuration: v }))}
              className="shrink-0"
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Included Services (with usage limit)"
        icon={PackagePlus}
        action={
          <Button type="button" variant="secondary" size="sm" className="h-8 gap-1" onClick={addService}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        }
      >
        <div className="space-y-2 rounded-lg border border-dashed border-border/80 bg-muted/10 p-3 sm:p-4">
          {includedServices.map((inc, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-2 rounded-md border border-border/50 bg-background p-2 sm:flex-row sm:items-center sm:gap-2"
            >
              <Select
                value={inc.serviceId}
                onValueChange={(v) => updateIncludedService(idx, "serviceId", v)}
              >
                <SelectTrigger className="h-10 flex-1 border-border/70">
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s._id || s.id} value={(s._id || s.id).toString()}>
                      {s.name} ({getSymbol()}{s.price})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 sm:w-auto">
                <Input
                  type="number"
                  min={0}
                  placeholder="Limit"
                  value={inc.usageLimit}
                  onChange={(e) => updateIncludedService(idx, "usageLimit", e.target.value)}
                  className="h-10 w-full sm:w-24"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeService(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Exclude services from plan discount"
        icon={ListFilter}
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setExcludedServiceIds((prev) => [...prev, ""])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        }
      >
        <div className="space-y-2 rounded-lg border border-dashed border-border/80 bg-muted/10 p-3 sm:p-4">
          {excludedServiceIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No excluded services — discount applies to all non-included services.
            </p>
          ) : null}
          {excludedServiceIds.map((excId, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-background p-2"
            >
              <MembershipServiceSearchCombobox
                value={excId}
                onValueChange={(v) => updateExcludedService(idx, v)}
                services={services}
                getSymbol={getSymbol}
                placeholder="Search service to exclude…"
                portalContainer={formPortalHost}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeExcludedService(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </FormSection>

      <div className="sticky bottom-0 z-[1] -mx-1 flex flex-wrap items-center justify-end gap-2 border-t border-border/80 bg-background/95 py-4 pt-5 backdrop-blur-sm">
        {onClose ? (
          <Button type="button" variant="outline" className="min-w-[6rem]" onClick={onClose}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" className="min-w-[6rem]" disabled={loading}>
          {loading ? "Saving..." : plan ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  )
}
