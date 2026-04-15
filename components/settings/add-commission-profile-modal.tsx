"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Target, Package, HelpCircle, Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  CommissionProfileFormData,
  CALCULATION_INTERVALS,
  QUALIFYING_ITEMS,
  ServiceCommissionRule,
  ProductCommissionRule
} from "@/lib/commission-profile-types"
import { ProductsAPI, ServicesAPI } from "@/lib/api"

interface AddCommissionProfileModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (profile: CommissionProfileFormData) => Promise<void>
}

const defaultTier = {
  from: 0,
  to: 0,
  calculateBy: "percent" as const,
  value: 0
}

const emptyServiceRule = (): ServiceCommissionRule => ({
  serviceId: "",
  calculateBy: "percent",
  value: 0
})

const emptyProductRule = (): ProductCommissionRule => ({
  productId: "",
  calculateBy: "percent",
  value: 0
})

export function AddCommissionProfileModal({ isOpen, onClose, onSave }: AddCommissionProfileModalProps) {
  const [formData, setFormData] = useState<CommissionProfileFormData>({
    name: "",
    type: "target_based",
    description: "",
    calculationInterval: "monthly",
    qualifyingItems: [],
    includeTax: false,
    cascadingCommission: false,
    targetTiers: [defaultTier]
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [services, setServices] = useState<Array<{ _id?: string; id?: string; name: string }>>([])
  const [products, setProducts] = useState<Array<{ _id?: string; id?: string; name: string }>>([])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      try {
        const [svcRes, prodRes] = await Promise.all([
          ServicesAPI.getAll({ limit: 2000 }),
          ProductsAPI.getAll({ limit: 2000 })
        ])
        if (!cancelled && svcRes?.success && Array.isArray(svcRes.data)) {
          setServices(svcRes.data)
        }
        if (!cancelled && prodRes?.success && Array.isArray(prodRes.data)) {
          setProducts(prodRes.data)
        }
      } catch {
        if (!cancelled) {
          setServices([])
          setProducts([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const handleInputChange = (field: keyof CommissionProfileFormData, value: unknown) => {
    if (field === "type") {
      const nextType = value as CommissionProfileFormData["type"]
      if (nextType === "service_based") {
        setFormData((prev) => ({
          ...prev,
          type: "service_based",
          qualifyingItems: [],
          productRules: undefined,
          serviceRules: prev.serviceRules?.length ? prev.serviceRules : [emptyServiceRule()]
        }))
      } else if (nextType === "item_based") {
        setFormData((prev) => ({
          ...prev,
          type: "item_based",
          qualifyingItems: [],
          serviceRules: undefined,
          productRules: prev.productRules?.length ? prev.productRules : [emptyProductRule()]
        }))
      } else {
        setFormData((prev) => ({
          ...prev,
          type: "target_based",
          serviceRules: undefined,
          productRules: undefined,
          targetTiers: prev.targetTiers?.length ? prev.targetTiers : [defaultTier]
        }))
      }
      return
    }
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field as string]) {
      setErrors((prev) => ({ ...prev, [field as string]: "" }))
    }
  }

  const handleQualifyingItemToggle = (item: string) => {
    setFormData((prev) => ({
      ...prev,
      qualifyingItems: prev.qualifyingItems.includes(item)
        ? prev.qualifyingItems.filter((i) => i !== item)
        : [...prev.qualifyingItems, item]
    }))
  }

  const addTargetTier = () => {
    setFormData((prev) => ({
      ...prev,
      targetTiers: [...(prev.targetTiers || []), { ...defaultTier }]
    }))
  }

  const removeTargetTier = (index: number) => {
    if (formData.targetTiers && formData.targetTiers.length > 1) {
      setFormData((prev) => ({
        ...prev,
        targetTiers: prev.targetTiers?.filter((_, i) => i !== index)
      }))
    }
  }

  const updateTargetTier = (index: number, field: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      targetTiers: prev.targetTiers?.map((tier, i) => (i === index ? { ...tier, [field]: value } : tier))
    }))
  }

  const addServiceRule = () => {
    setFormData((prev) => ({
      ...prev,
      serviceRules: [...(prev.serviceRules ?? []), emptyServiceRule()]
    }))
  }

  const removeServiceRule = (index: number) => {
    const rules = formData.serviceRules ?? []
    if (rules.length <= 1) return
    setFormData((prev) => ({
      ...prev,
      serviceRules: rules.filter((_, i) => i !== index)
    }))
  }

  const updateServiceRule = (index: number, field: keyof ServiceCommissionRule, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      serviceRules: (prev.serviceRules ?? []).map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      )
    }))
  }

  const addProductRule = () => {
    setFormData((prev) => ({
      ...prev,
      productRules: [...(prev.productRules ?? []), emptyProductRule()]
    }))
  }

  const removeProductRule = (index: number) => {
    const rules = formData.productRules ?? []
    if (rules.length <= 1) return
    setFormData((prev) => ({
      ...prev,
      productRules: rules.filter((_, i) => i !== index)
    }))
  }

  const updateProductRule = (index: number, field: keyof ProductCommissionRule, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      productRules: (prev.productRules ?? []).map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      )
    }))
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "Profile name is required"
    }

    if (formData.type === "service_based") {
      const rules = formData.serviceRules ?? []
      if (rules.length === 0) {
        newErrors.serviceRules = "Add at least one service"
      }
      const ids = rules.map((r) => r.serviceId).filter((id) => id && String(id).trim())
      if (new Set(ids).size !== ids.length) {
        newErrors.serviceRules = "Each service can only appear once"
      }
      rules.forEach((rule, index) => {
        if (!rule.serviceId || !String(rule.serviceId).trim()) {
          newErrors[`service_${index}`] = "Select a service"
        }
        const v = Number(rule.value)
        if (!Number.isFinite(v) || v <= 0) {
          newErrors[`service_${index}_value`] = "Commission value must be greater than 0"
        }
        if (rule.calculateBy === "percent" && v > 100) {
          newErrors[`service_${index}_value`] = "Percentage cannot exceed 100"
        }
      })
    } else if (formData.type === "item_based") {
      const rules = formData.productRules ?? []
      if (rules.length === 0) {
        newErrors.productRules = "Add at least one product"
      }
      const ids = rules.map((r) => r.productId).filter((id) => id && String(id).trim())
      if (new Set(ids).size !== ids.length) {
        newErrors.productRules = "Each product can only appear once"
      }
      rules.forEach((rule, index) => {
        if (!rule.productId || !String(rule.productId).trim()) {
          newErrors[`product_${index}`] = "Select a product"
        }
        const v = Number(rule.value)
        if (!Number.isFinite(v) || v <= 0) {
          newErrors[`product_${index}_value`] = "Commission value must be greater than 0"
        }
        if (rule.calculateBy === "percent" && v > 100) {
          newErrors[`product_${index}_value`] = "Percentage cannot exceed 100"
        }
      })
    } else {
      if (formData.qualifyingItems.length === 0) {
        newErrors.qualifyingItems = "At least one qualifying item is required"
      }

      if (formData.targetTiers) {
        formData.targetTiers.forEach((tier, index) => {
          if (tier.from < 0) {
            newErrors[`tier_${index}_from`] = "From amount cannot be negative"
          }
          if (tier.to <= tier.from) {
            newErrors[`tier_${index}_to`] = "To amount must be greater than From amount"
          }
          if (tier.value < 0) {
            newErrors[`tier_${index}_value`] = "Value cannot be negative"
          }
        })
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) {
      return
    }

    try {
      setIsSaving(true)
      await onSave(formData)
      handleClose()
    } catch (error) {
      console.error("Failed to save commission profile", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    setFormData({
      name: "",
      type: "target_based",
      description: "",
      calculationInterval: "monthly",
      qualifyingItems: [],
      includeTax: false,
      cascadingCommission: false,
      targetTiers: [defaultTier]
    })
    setErrors({})
    onClose()
  }

  const serviceIdOptions = (rowIndex: number) => {
    const rules = formData.serviceRules ?? []
    const otherSelected = new Set(
      rules
        .map((r, i) => (i !== rowIndex && r.serviceId ? String(r.serviceId) : null))
        .filter((x): x is string => x != null && x !== "")
    )
    return services.filter((s) => {
      const sid = String(s._id ?? s.id ?? "")
      if (!sid) return false
      const current = rules[rowIndex]?.serviceId
      if (current && String(current) === sid) return true
      return !otherSelected.has(sid)
    })
  }

  const productIdOptions = (rowIndex: number) => {
    const rules = formData.productRules ?? []
    const otherSelected = new Set(
      rules
        .map((r, i) => (i !== rowIndex && r.productId ? String(r.productId) : null))
        .filter((x): x is string => x != null && x !== "")
    )
    return products.filter((p) => {
      const pid = String(p._id ?? p.id ?? "")
      if (!pid) return false
      const current = rules[rowIndex]?.productId
      if (current && String(current) === pid) return true
      return !otherSelected.has(pid)
    })
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
    >
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add Commission Profile</DialogTitle>
          <DialogDescription>
            Create a commission profile: target-based tiers, per-service rules, or per-product rules
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="target_based"
                name="type"
                value="target_based"
                checked={formData.type === "target_based"}
                onChange={(e) => handleInputChange("type", e.target.value)}
                className="w-4 h-4 text-blue-600"
                aria-label="Commission by Target"
              />
              <Label htmlFor="target_based" className="flex items-center space-x-2 cursor-pointer">
                <Target className="h-4 w-4" />
                <span>Commission by Target</span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="service_based"
                name="type"
                value="service_based"
                checked={formData.type === "service_based"}
                onChange={(e) => handleInputChange("type", e.target.value)}
                className="w-4 h-4 text-blue-600"
                aria-label="Commission by Service"
              />
              <Label htmlFor="service_based" className="flex items-center space-x-2 cursor-pointer">
                <Scissors className="h-4 w-4" />
                <span>Commission by Service</span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="item_based"
                name="type"
                value="item_based"
                checked={formData.type === "item_based"}
                onChange={(e) => handleInputChange("type", e.target.value)}
                className="w-4 h-4 text-blue-600"
                aria-label="Commission by Item"
              />
              <Label htmlFor="item_based" className="flex items-center space-x-2 cursor-pointer">
                <Package className="h-4 w-4" />
                <span>Commission by Item</span>
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Profile Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Enter profile name"
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="interval">Calculation Interval *</Label>
              <Select
                modal={false}
                value={formData.calculationInterval}
                onValueChange={(value) => handleInputChange("calculationInterval", value)}
              >
                <SelectTrigger id="interval">
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CALCULATION_INTERVALS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.type === "service_based" || formData.type === "item_based" ? (
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) => handleInputChange("description", e.target.value)}
                placeholder="Optional notes for this profile"
                rows={3}
                className="resize-y min-h-[80px]"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description || ""}
                onChange={(e) => handleInputChange("description", e.target.value)}
                placeholder="Enter profile description (optional)"
              />
            </div>
          )}

          {formData.type === "target_based" && (
            <>
              <div className="space-y-2">
                <Label>Qualifying Items *</Label>
                <div className="flex flex-wrap gap-2">
                  {QUALIFYING_ITEMS.map((item) => (
                    <div
                      key={item}
                      onClick={() => handleQualifyingItemToggle(item)}
                      className={`px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                        formData.qualifyingItems.includes(item)
                          ? "bg-blue-100 border-blue-500 text-blue-700"
                          : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
                {errors.qualifyingItems && <p className="text-sm text-red-500">{errors.qualifyingItems}</p>}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeTax"
                  checked={formData.includeTax}
                  onCheckedChange={(checked) => handleInputChange("includeTax", checked)}
                />
                <Label htmlFor="includeTax">Include tax amount in incentive calculation</Label>
              </div>
            </>
          )}

          {formData.type === "service_based" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Service commission rules</h3>
                <Button type="button" variant="outline" size="sm" onClick={addServiceRule} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Service
                </Button>
              </div>
              {errors.serviceRules && <p className="text-sm text-red-500">{errors.serviceRules}</p>}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[38%]">Service</TableHead>
                      <TableHead className="w-[28%]">Commission type</TableHead>
                      <TableHead className="w-[28%]">Value</TableHead>
                      <TableHead className="w-14 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(formData.serviceRules ?? [emptyServiceRule()]).map((rule, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Select
                            modal={false}
                            value={rule.serviceId || ""}
                            onValueChange={(v) => updateServiceRule(index, "serviceId", v)}
                          >
                            <SelectTrigger
                              className={errors[`service_${index}`] ? "border-red-500" : ""}
                            >
                              <SelectValue placeholder="Select service" />
                            </SelectTrigger>
                            <SelectContent>
                              {serviceIdOptions(index).map((s) => {
                                const sid = String(s._id ?? s.id)
                                return (
                                  <SelectItem key={sid} value={sid}>
                                    {s.name}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                          {errors[`service_${index}`] && (
                            <p className="text-xs text-red-500 mt-1">{errors[`service_${index}`]}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            modal={false}
                            value={rule.calculateBy}
                            onValueChange={(v) =>
                              updateServiceRule(index, "calculateBy", v as ServiceCommissionRule["calculateBy"])
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percent">Percentage (%)</SelectItem>
                              <SelectItem value="fixed">Fixed amount (₹)</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              step={rule.calculateBy === "percent" ? 0.01 : 1}
                              value={rule.value === 0 ? "" : rule.value}
                              onChange={(e) => {
                                const raw = e.target.value
                                updateServiceRule(
                                  index,
                                  "value",
                                  raw === "" ? 0 : parseFloat(raw) || 0
                                )
                              }}
                              className={errors[`service_${index}_value`] ? "border-red-500" : ""}
                            />
                            <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
                              {rule.calculateBy === "percent" ? "%" : "₹"}
                            </span>
                          </div>
                          {errors[`service_${index}_value`] && (
                            <p className="text-xs text-red-500 mt-1">{errors[`service_${index}_value`]}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeServiceRule(index)}
                            disabled={(formData.serviceRules ?? []).length <= 1}
                            className="text-red-600 hover:text-red-700"
                            aria-label="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {formData.type === "item_based" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Product commission rules</h3>
                <Button type="button" variant="outline" size="sm" onClick={addProductRule} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Product
                </Button>
              </div>
              {errors.productRules && <p className="text-sm text-red-500">{errors.productRules}</p>}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[38%]">Product</TableHead>
                      <TableHead className="w-[28%]">Commission type</TableHead>
                      <TableHead className="w-[28%]">Value</TableHead>
                      <TableHead className="w-14 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(formData.productRules ?? [emptyProductRule()]).map((rule, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Select
                            modal={false}
                            value={rule.productId || ""}
                            onValueChange={(v) => updateProductRule(index, "productId", v)}
                          >
                            <SelectTrigger
                              className={errors[`product_${index}`] ? "border-red-500" : ""}
                            >
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {productIdOptions(index).map((p) => {
                                const pid = String(p._id ?? p.id)
                                return (
                                  <SelectItem key={pid} value={pid}>
                                    {p.name}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                          {errors[`product_${index}`] && (
                            <p className="text-xs text-red-500 mt-1">{errors[`product_${index}`]}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            modal={false}
                            value={rule.calculateBy}
                            onValueChange={(v) =>
                              updateProductRule(index, "calculateBy", v as ProductCommissionRule["calculateBy"])
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percent">Percentage (%)</SelectItem>
                              <SelectItem value="fixed">Fixed amount (₹)</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              step={rule.calculateBy === "percent" ? 0.01 : 1}
                              value={rule.value === 0 ? "" : rule.value}
                              onChange={(e) => {
                                const raw = e.target.value
                                updateProductRule(
                                  index,
                                  "value",
                                  raw === "" ? 0 : parseFloat(raw) || 0
                                )
                              }}
                              className={errors[`product_${index}_value`] ? "border-red-500" : ""}
                            />
                            <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
                              {rule.calculateBy === "percent" ? "%" : "₹"}
                            </span>
                          </div>
                          {errors[`product_${index}_value`] && (
                            <p className="text-xs text-red-500 mt-1">{errors[`product_${index}_value`]}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeProductRule(index)}
                            disabled={(formData.productRules ?? []).length <= 1}
                            className="text-red-600 hover:text-red-700"
                            aria-label="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {formData.type === "target_based" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Target Tier Section</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTargetTier}
                  className="flex items-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Target Tier</span>
                </Button>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="cascadingCommission"
                  checked={formData.cascadingCommission}
                  onCheckedChange={(checked) => handleInputChange("cascadingCommission", checked)}
                />
                <Label htmlFor="cascadingCommission">Cascading Commission</Label>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground focus:outline-none"
                        aria-label="Cascading Commission help"
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm p-3 text-sm">
                      <p className="font-medium mb-1">Cascading Commission (enabled):</p>
                      <p className="text-muted-foreground mb-2">
                        Commission is calculated slab-wise. Each target slab applies its own commission percentage
                        only to the revenue within that slab.
                      </p>
                      <p className="font-medium mb-1">Non-Cascading Commission (disabled):</p>
                      <p className="text-muted-foreground">
                        The commission percentage of the highest target slab achieved is applied to the entire
                        eligible amount.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="space-y-4">
                {formData.targetTiers?.map((tier, index) => (
                  <div key={index} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium">Tier {index + 1}</h4>
                      {formData.targetTiers && formData.targetTiers.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTargetTier(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>From (₹)</Label>
                        <Input
                          type="number"
                          value={tier.from}
                          onChange={(e) => updateTargetTier(index, "from", parseFloat(e.target.value) || 0)}
                          className={errors[`tier_${index}_from`] ? "border-red-500" : ""}
                        />
                        {errors[`tier_${index}_from`] && (
                          <p className="text-sm text-red-500">{errors[`tier_${index}_from`]}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>To (₹)</Label>
                        <Input
                          type="number"
                          value={tier.to}
                          onChange={(e) => updateTargetTier(index, "to", parseFloat(e.target.value) || 0)}
                          className={errors[`tier_${index}_to`] ? "border-red-500" : ""}
                        />
                        {errors[`tier_${index}_to`] && (
                          <p className="text-sm text-red-500">{errors[`tier_${index}_to`]}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Calculate By</Label>
                        <Select
                          modal={false}
                          value={tier.calculateBy}
                          onValueChange={(value) => updateTargetTier(index, "calculateBy", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">By Percent</SelectItem>
                            <SelectItem value="fixed">By Fixed Value</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Value {tier.calculateBy === "percent" ? "(%)" : "(₹)"}</Label>
                        <Input
                          type="number"
                          value={tier.value}
                          onChange={(e) => updateTargetTier(index, "value", parseFloat(e.target.value) || 0)}
                          className={errors[`tier_${index}_value`] ? "border-red-500" : ""}
                        />
                        {errors[`tier_${index}_value`] && (
                          <p className="text-sm text-red-500">{errors[`tier_${index}_value`]}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
