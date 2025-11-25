"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Target, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { CommissionProfile, CommissionProfileFormData, CALCULATION_INTERVALS, QUALIFYING_ITEMS } from "@/lib/commission-profile-types"

interface EditCommissionProfileModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (profileId: string, profile: CommissionProfileFormData) => Promise<void>
  profile: CommissionProfile | null
}

export function EditCommissionProfileModal({ isOpen, onClose, onSave, profile }: EditCommissionProfileModalProps) {
  const [formData, setFormData] = useState<CommissionProfileFormData>({
    name: "",
    type: "target_based",
    description: "",
    calculationInterval: "monthly",
    qualifyingItems: [],
    includeTax: false,
    cascadingCommission: false,
    targetTiers: [
      {
        from: 0,
        to: 0,
        calculateBy: "percent",
        value: 0
      }
    ]
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Populate form data when profile changes
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name,
        type: profile.type,
        description: profile.description || "",
        calculationInterval: profile.calculationInterval,
        qualifyingItems: profile.qualifyingItems,
        includeTax: profile.includeTax,
        cascadingCommission: profile.cascadingCommission || false,
        targetTiers: profile.targetTiers || [
          {
            from: 0,
            to: 0,
            calculateBy: "percent",
            value: 0
          }
        ]
      })
    }
  }, [profile])

  const handleInputChange = (field: keyof CommissionProfileFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }))
    }
  }

  const handleQualifyingItemToggle = (item: string) => {
    setFormData(prev => ({
      ...prev,
      qualifyingItems: prev.qualifyingItems.includes(item)
        ? prev.qualifyingItems.filter(i => i !== item)
        : [...prev.qualifyingItems, item]
    }))
  }

  const addTargetTier = () => {
    setFormData(prev => ({
      ...prev,
      targetTiers: [
        ...(prev.targetTiers || []),
        {
          from: 0,
          to: 0,
          calculateBy: "percent",
          value: 0
        }
      ]
    }))
  }

  const removeTargetTier = (index: number) => {
    if (formData.targetTiers && formData.targetTiers.length > 1) {
      setFormData(prev => ({
        ...prev,
        targetTiers: prev.targetTiers?.filter((_, i) => i !== index)
      }))
    }
  }

  const updateTargetTier = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      targetTiers: prev.targetTiers?.map((tier, i) => 
        i === index ? { ...tier, [field]: value } : tier
      )
    }))
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "Profile name is required"
    }

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
        if (tier.value <= 0) {
          newErrors[`tier_${index}_value`] = "Value must be greater than 0"
        }
      })
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm() || !profile) {
      return
    }

    try {
      setIsSaving(true)
      const profileId = profile.id || profile._id || ""
      await onSave(profileId, formData)
      handleClose()
    } catch (error) {
      console.error("Failed to update commission profile", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    setErrors({})
    onClose()
  }

  if (!profile) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Commission Profile</DialogTitle>
          <DialogDescription>
            Update the commission profile settings and target tiers
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Commission Type Toggle */}
          <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="edit_target_based"
                name="edit_type"
                value="target_based"
                checked={formData.type === "target_based"}
                onChange={(e) => handleInputChange("type", e.target.value)}
                className="w-4 h-4 text-blue-600"
                aria-label="Commission by Target"
              />
              <Label htmlFor="edit_target_based" className="flex items-center space-x-2 cursor-pointer">
                <Target className="h-4 w-4" />
                <span>Commission by Target</span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="edit_item_based"
                name="edit_type"
                value="item_based"
                checked={formData.type === "item_based"}
                onChange={(e) => handleInputChange("type", e.target.value)}
                disabled
                className="w-4 h-4 text-gray-400"
                aria-label="Commission by Item (Coming Soon)"
              />
              <Label htmlFor="edit_item_based" className="flex items-center space-x-2 cursor-not-allowed text-gray-400">
                <Package className="h-4 w-4" />
                <span>Commission by Item</span>
                <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
              </Label>
            </div>
          </div>

          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit_name">Profile Name *</Label>
              <Input
                id="edit_name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Enter profile name"
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_interval">Calculation Interval *</Label>
              <Select
                value={formData.calculationInterval}
                onValueChange={(value) => handleInputChange("calculationInterval", value)}
              >
                <SelectTrigger>
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

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit_description">Description</Label>
            <Input
              id="edit_description"
              value={formData.description || ""}
              onChange={(e) => handleInputChange("description", e.target.value)}
              placeholder="Enter profile description (optional)"
            />
          </div>

          {/* Qualifying Items */}
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

          {/* Tax Inclusion Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="edit_includeTax"
              checked={formData.includeTax}
              onCheckedChange={(checked) => handleInputChange("includeTax", checked)}
            />
            <Label htmlFor="edit_includeTax">Include tax amount in incentive calculation</Label>
          </div>

          {/* Target Tier Section */}
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

              {/* Cascading Commission Checkbox */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit_cascadingCommission"
                  checked={formData.cascadingCommission}
                  onCheckedChange={(checked) => handleInputChange("cascadingCommission", checked)}
                />
                <Label htmlFor="edit_cascadingCommission">Cascading Commission</Label>
              </div>

              {/* Target Tiers */}
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
                        <Label>
                          Value {tier.calculateBy === "percent" ? "(%)" : "(₹)"}
                        </Label>
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
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
