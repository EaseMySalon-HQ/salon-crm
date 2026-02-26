"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { ServicesAPI, ConsumptionRulesAPI, SettingsAPI } from "@/lib/api"
import { useCurrency } from "@/hooks/use-currency"
import { CategoryCombobox } from "../products/category-combobox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { HelpCircle } from "lucide-react"
import {
  ServiceConsumptionRulesSection,
  type PendingConsumptionRule,
} from "./service-consumption-rules-section"

interface ServiceFormProps {
  onClose?: () => void
  service?: any // For edit mode
}

export function ServiceForm({ onClose, service }: ServiceFormProps) {
  const { getSymbol } = useCurrency()
  const [formData, setFormData] = useState({
    name: service?.name || "",
    description: service?.description || "",
    category: service?.category || "",
    duration: service?.duration?.toString() || "",
    fullPrice: (service?.fullPrice ?? service?.price)?.toString() ?? "",
    offerPrice: service?.offerPrice?.toString() ?? "",
    taxApplicable: !!service?.taxApplicable,
    hsnSacCode: service?.hsnSacCode ?? "",
    isAutoConsumptionEnabled: !!service?.isAutoConsumptionEnabled,
  })
  const [taxEnabled, setTaxEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    if (service) return
    SettingsAPI.getPaymentSettings()
      .then((res) => {
        const enabled = res.success && res.data?.enableTax !== false
        setTaxEnabled(enabled)
        if (enabled) setFormData((prev) => ({ ...prev, taxApplicable: true }))
      })
      .catch(() => setTaxEnabled(false))
  }, [service])
  const [pendingConsumptionRules, setPendingConsumptionRules] = useState<PendingConsumptionRule[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const effectivePrice = formData.offerPrice
    ? parseFloat(formData.offerPrice)
    : formData.fullPrice
      ? parseFloat(formData.fullPrice)
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.category || !formData.duration || effectivePrice == null || isNaN(effectivePrice)) {
      toast({
        title: "Missing fields",
        description: "Name, category, duration, and full price are required.",
        variant: "destructive",
      })
      return
    }
    setIsLoading(true)

    try {
      const serviceData = {
        name: formData.name,
        description: formData.description,
        category: formData.category,
        duration: parseInt(formData.duration),
        price: effectivePrice,
        fullPrice: formData.fullPrice ? parseFloat(formData.fullPrice) : undefined,
        offerPrice: formData.offerPrice ? parseFloat(formData.offerPrice) : undefined,
        taxApplicable: formData.taxApplicable,
        hsnSacCode: formData.hsnSacCode || undefined,
        isActive: true,
        isAutoConsumptionEnabled: formData.isAutoConsumptionEnabled,
      }

      let response
      if (service) {
        response = await ServicesAPI.update(service._id || service.id, serviceData)
        if (response.success) {
          toast({
            title: "Service updated",
            description: "The service has been updated successfully.",
          })
        }
      } else {
        response = await ServicesAPI.create(serviceData)
        if (response.success) {
          toast({
            title: "Service created",
            description: "The service has been added successfully.",
          })
          const newId = response.data?._id || response.data?.id
          if (newId && pendingConsumptionRules.length > 0) {
            const bulkRes = await ConsumptionRulesAPI.bulkCreate(
              newId,
              pendingConsumptionRules.map((r) => ({
                productId: r.productId,
                quantityUsed: r.quantityUsed,
                unit: r.unit,
                isAdjustable: r.isAdjustable,
                maxAdjustmentPercent: r.maxAdjustmentPercent,
              }))
            )
            if (bulkRes.success) {
              toast({ title: "Consumption rules added", description: `${pendingConsumptionRules.length} rule(s) created.` })
            }
          }
          setFormData({
            name: "",
            description: "",
            category: "",
            duration: "",
            fullPrice: "",
            offerPrice: "",
            taxApplicable: taxEnabled === true,
            hsnSacCode: "",
            isAutoConsumptionEnabled: false,
          })
          setPendingConsumptionRules([])
        }
      }

      if (response?.success) {
        onClose?.()
        window.dispatchEvent(new CustomEvent("service-added"))
      } else {
        throw new Error(response?.error || `Failed to ${service ? "update" : "create"} service`)
      }
    } catch (error) {
      console.error(`Error ${service ? "updating" : "creating"} service:`, error)
      toast({
        title: "Error",
        description: `Failed to ${service ? "update" : "create"} service. Please try again.`,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const serviceId = service ? (service._id || service.id) : null

  return (
    <TooltipProvider delayDuration={300}>
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Service Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter service name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Enter service description"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <CategoryCombobox
            type="service"
            value={formData.category}
            onChange={(value) => setFormData({ ...formData, category: value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">Service Duration (minutes)</Label>
          <Input
            id="duration"
            type="number"
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
            placeholder="60"
            min="1"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fullPrice">Full Price ({getSymbol()})</Label>
          <Input
            id="fullPrice"
            type="number"
            step="0.01"
            value={formData.fullPrice}
            onChange={(e) => setFormData({ ...formData, fullPrice: e.target.value })}
            placeholder="0.00"
            min="0"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="offerPrice">Offer Price ({getSymbol()})</Label>
          <Input
            id="offerPrice"
            type="number"
            step="0.01"
            value={formData.offerPrice}
            onChange={(e) => setFormData({ ...formData, offerPrice: e.target.value })}
            placeholder="Optional"
            min="0"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="tax-applicable">Tax Applicable</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p>Whether tax applies to this service.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <Switch
          id="tax-applicable"
          checked={formData.taxApplicable}
          onCheckedChange={(checked) => setFormData({ ...formData, taxApplicable: !!checked })}
        />
      </div>

      {formData.taxApplicable && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="hsnSacCode">HSN/SAC Code</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none">
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p>Tax code for invoicing (optional).</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            id="hsnSacCode"
            value={formData.hsnSacCode}
            onChange={(e) => setFormData({ ...formData, hsnSacCode: e.target.value })}
            placeholder="e.g. 998313 (optional)"
          />
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="auto-consumption">Auto Consumption</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p>Deduct inventory when this service is completed.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <Switch
          id="auto-consumption"
          checked={formData.isAutoConsumptionEnabled}
          onCheckedChange={(checked) => setFormData({ ...formData, isAutoConsumptionEnabled: !!checked })}
        />
      </div>

      {formData.isAutoConsumptionEnabled && (
        <ServiceConsumptionRulesSection
          serviceId={serviceId}
          pendingRules={pendingConsumptionRules}
          onPendingRulesChange={setPendingConsumptionRules}
          disabled={isLoading}
        />
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (service ? "Updating..." : "Creating...") : (service ? "Update Service" : "Create Service")}
        </Button>
      </div>
    </form>
    </TooltipProvider>
  )
}
