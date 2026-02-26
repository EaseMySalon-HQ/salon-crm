"use client"

import type React from "react"
import { useState, useEffect } from "react"
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
import { Plus, Trash2 } from "lucide-react"

interface IncludedService {
  serviceId: string
  usageLimit: number
}

interface MembershipPlanFormProps {
  plan?: any
  onSuccess?: () => void
  onClose?: () => void
}

export function MembershipPlanForm({ plan, onSuccess, onClose }: MembershipPlanFormProps) {
  const { getSymbol } = useCurrency()
  const { toast } = useToast()
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    planName: plan?.planName || "",
    price: plan?.price?.toString() || "",
    durationInDays: plan?.durationInDays?.toString() || "",
    discountPercentage: plan?.discountPercentage?.toString() || "0",
    isActive: plan?.isActive ?? true,
  })
  const [includedServices, setIncludedServices] = useState<IncludedService[]>(
    plan?.includedServices?.map((s: any) => ({
      serviceId: (s.serviceId?._id || s.serviceId)?.toString() || "",
      usageLimit: s.usageLimit ?? 0,
    })) || []
  )

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const price = parseFloat(formData.price)
    const duration = parseInt(formData.durationInDays)
    const discount = parseFloat(formData.discountPercentage) || 0

    if (!formData.planName || isNaN(price) || price < 0 || isNaN(duration) || duration < 1) {
      toast({
        title: "Missing fields",
        description: "Plan name, price, and duration (days) are required.",
        variant: "destructive",
      })
      return
    }

    const validIncluded = includedServices.filter((s) => s.serviceId && s.usageLimit >= 0)
    const payload = {
      planName: formData.planName.trim(),
      price,
      durationInDays: duration,
      discountPercentage: discount,
      includedServices: validIncluded.map((s) => ({
        serviceId: s.serviceId,
        usageLimit: s.usageLimit,
      })),
      isActive: formData.isActive,
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4">
        <div>
          <Label htmlFor="planName">Plan Name</Label>
          <Input
            id="planName"
            value={formData.planName}
            onChange={(e) => setFormData((p) => ({ ...p, planName: e.target.value }))}
            placeholder="e.g. Gold Monthly"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="price">Price ({getSymbol()})</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step={0.01}
              value={formData.price}
              onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
              placeholder="0"
              required
            />
          </div>
          <div>
            <Label htmlFor="durationInDays">Duration (days)</Label>
            <Input
              id="durationInDays"
              type="number"
              min={1}
              value={formData.durationInDays}
              onChange={(e) => setFormData((p) => ({ ...p, durationInDays: e.target.value }))}
              placeholder="30"
              required
            />
          </div>
        </div>
        <div>
          <Label htmlFor="discountPercentage">Discount % (for non-included services)</Label>
          <Input
            id="discountPercentage"
            type="number"
            min={0}
            max={100}
            step={1}
            value={formData.discountPercentage}
            onChange={(e) => setFormData((p) => ({ ...p, discountPercentage: e.target.value }))}
            placeholder="0"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.isActive}
            onCheckedChange={(v) => setFormData((p) => ({ ...p, isActive: v }))}
          />
          <Label>Active</Label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Included Services (with usage limit)</Label>
          <Button type="button" variant="outline" size="sm" onClick={addService}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
        <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
          {includedServices.map((inc, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Select
                value={inc.serviceId}
                onValueChange={(v) => updateIncludedService(idx, "serviceId", v)}
              >
                <SelectTrigger className="flex-1">
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
              <Input
                type="number"
                min={0}
                placeholder="Limit"
                value={inc.usageLimit}
                onChange={(e) => updateIncludedService(idx, "usageLimit", e.target.value)}
                className="w-24"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeService(idx)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : plan ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  )
}
