"use client"

import { useState, useEffect } from "react"
import { Save, History } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { getAdminAuthToken } from "@/lib/admin-auth-storage"

interface PlanEditDialogProps {
  businessId: string
  businessName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function PlanEditDialog({ businessId, businessName, open, onOpenChange, onSuccess }: PlanEditDialogProps) {
  const [loading, setLoading] = useState(false)
  const [plans, setPlans] = useState<any[]>([])
  const [features, setFeatures] = useState<any[]>([])
  const [planInfo, setPlanInfo] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const { toast } = useToast()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

  const authHeaders = (extra: HeadersInit = {}) => {
    const token = getAdminAuthToken()
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    }
  }

  const [formData, setFormData] = useState({
    planId: 'starter',
    billingPeriod: 'monthly',
    renewalDate: '',
    isTrial: false,
    trialEndsAt: '',
    overrides: {
      features: [] as string[],
      expiresAt: '',
      notes: '',
    },
    addons: {
      whatsapp: { enabled: false, quota: 0 },
      sms: { enabled: false, quota: 0 },
    },
  })

  useEffect(() => {
    if (open && businessId) {
      fetchConfig()
      fetchBusinessPlan()
    }
  }, [open, businessId])

  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/plans/config`, {
        headers: authHeaders(),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setPlans(data.data.plans)
          setFeatures(data.data.features)
        }
      }
    } catch (error) {
      console.error('Error fetching config:', error)
    }
  }

  const fetchBusinessPlan = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/admin/plans/business/${businessId}`, {
        headers: authHeaders(),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const business = data.data.business
          setPlanInfo(business.plan)
          setFormData({
            planId: business.plan.planId,
            billingPeriod: business.plan.billingPeriod,
            renewalDate: business.plan.renewalDate ? new Date(business.plan.renewalDate).toISOString().split('T')[0] : '',
            isTrial: business.plan.isTrial,
            trialEndsAt: business.plan.trialEndsAt ? new Date(business.plan.trialEndsAt).toISOString().split('T')[0] : '',
            overrides: {
              features: business.plan.hasOverrides && business.features
                ? business.features.filter((f: any) => f.enabled && !(plans.find((p: any) => p.id === business.plan.planId)?.features || []).includes(f.id)).map((f: any) => f.id)
                : [],
              expiresAt: business.plan.overridesExpiresAt ? new Date(business.plan.overridesExpiresAt).toISOString().split('T')[0] : '',
              notes: '',
            },
            addons: {
              whatsapp: {
                enabled: business.plan.addons?.whatsapp?.enabled || false,
                quota: business.plan.addons?.whatsapp?.quota || 0,
              },
              sms: {
                enabled: business.plan.addons?.sms?.enabled || false,
                quota: business.plan.addons?.sms?.quota || 0,
              },
            },
          })
        }
      }
    } catch (error) {
      console.error('Error fetching business plan:', error)
      toast({
        title: "Error",
        description: "Failed to fetch plan information",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleViewHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/plans/business/${businessId}/history`, {
        headers: authHeaders(),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setHistory(data.data.history)
          setIsHistoryOpen(true)
        }
      }
    } catch (error) {
      console.error('Error fetching history:', error)
    }
  }

  const handleSave = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/admin/plans/business/${businessId}`, {
        method: 'PUT',
        headers: authHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          ...formData,
          reason: formData.overrides.notes || 'Plan updated by admin',
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          toast({
            title: "Success",
            description: "Plan updated successfully",
          })
          onOpenChange(false)
          onSuccess?.()
        }
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || "Failed to update plan",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error updating plan:', error)
      toast({
        title: "Error",
        description: "Failed to update plan",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleFeatureOverride = (featureId: string) => {
    const currentFeatures = formData.overrides.features
    if (currentFeatures.includes(featureId)) {
      setFormData({
        ...formData,
        overrides: {
          ...formData.overrides,
          features: currentFeatures.filter(f => f !== featureId),
        },
      })
    } else {
      setFormData({
        ...formData,
        overrides: {
          ...formData.overrides,
          features: [...currentFeatures, featureId],
        },
      })
    }
  }

  const planFeatures = plans.find(p => p.id === formData.planId)?.features || []

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Plan: {businessName}</DialogTitle>
            <DialogDescription>
              Update plan, billing period, and feature access
            </DialogDescription>
          </DialogHeader>

          {loading && !planInfo ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <Tabs defaultValue="plan" className="w-full">
              <TabsList>
                <TabsTrigger value="plan">Plan & Billing</TabsTrigger>
                <TabsTrigger value="features">Feature Overrides</TabsTrigger>
                <TabsTrigger value="addons">Add-ons</TabsTrigger>
              </TabsList>

              <TabsContent value="plan" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Plan</Label>
                    <Select value={formData.planId} onValueChange={(value) => setFormData({ ...formData, planId: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Billing Period</Label>
                    <Select value={formData.billingPeriod} onValueChange={(value) => setFormData({ ...formData, billingPeriod: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Renewal Date</Label>
                    <Input
                      type="date"
                      value={formData.renewalDate}
                      onChange={(e) => setFormData({ ...formData, renewalDate: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      checked={formData.isTrial}
                      onCheckedChange={(checked) => setFormData({ ...formData, isTrial: checked })}
                    />
                    <Label>Is Trial</Label>
                  </div>

                  {formData.isTrial && (
                    <div>
                      <Label>Trial Ends At</Label>
                      <Input
                        type="date"
                        value={formData.trialEndsAt}
                        onChange={(e) => setFormData({ ...formData, trialEndsAt: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="features" className="space-y-4">
                <div>
                  <Label>Promotional Feature Overrides</Label>
                  <p className="text-sm text-gray-500 mb-4">
                    Features marked "(in plan)" are already included and enabled. Toggle additional features below to grant promotional access beyond the plan defaults.
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto border rounded p-4">
                    {features.map((feature) => {
                      const isInPlan = planFeatures.includes(feature.id)
                      const isOverride = formData.overrides.features.includes(feature.id)
                      const isEnabled = isInPlan || isOverride

                      return (
                        <div key={feature.id} className="flex items-center space-x-2">
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => toggleFeatureOverride(feature.id)}
                            disabled={isInPlan}
                          />
                          <Label className={`text-sm ${isInPlan ? 'text-gray-600' : ''}`}>
                            {feature.name}
                            {isInPlan && <span className="text-gray-400 ml-1">(in plan)</span>}
                            {!isInPlan && isOverride && <span className="text-blue-600 ml-1">(override)</span>}
                          </Label>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <Label>Override Expiry Date (Optional)</Label>
                  <Input
                    type="date"
                    value={formData.overrides.expiresAt}
                    onChange={(e) => setFormData({
                      ...formData,
                      overrides: { ...formData.overrides, expiresAt: e.target.value },
                    })}
                  />
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.overrides.notes}
                    onChange={(e) => setFormData({
                      ...formData,
                      overrides: { ...formData.overrides, notes: e.target.value },
                    })}
                    placeholder="Reason for override..."
                  />
                </div>
              </TabsContent>

              <TabsContent value="addons" className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded">
                    <div>
                      <Label className="text-base font-semibold">WhatsApp Receipts</Label>
                      <p className="text-sm text-gray-500">Send receipts via WhatsApp</p>
                    </div>
                    <Switch
                      checked={formData.addons.whatsapp.enabled}
                      onCheckedChange={(checked) => setFormData({
                        ...formData,
                        addons: {
                          ...formData.addons,
                          whatsapp: { ...formData.addons.whatsapp, enabled: checked },
                        },
                      })}
                    />
                  </div>
                  {formData.addons.whatsapp.enabled && (
                    <div>
                      <Label>Monthly Quota</Label>
                      <Input
                        type="number"
                        value={formData.addons.whatsapp.quota}
                        onChange={(e) => setFormData({
                          ...formData,
                          addons: {
                            ...formData.addons,
                            whatsapp: { ...formData.addons.whatsapp, quota: parseInt(e.target.value) || 0 },
                          },
                        })}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between p-4 border rounded">
                    <div>
                      <Label className="text-base font-semibold">SMS Notifications</Label>
                      <p className="text-sm text-gray-500">Send SMS notifications</p>
                    </div>
                    <Switch
                      checked={formData.addons.sms.enabled}
                      onCheckedChange={(checked) => setFormData({
                        ...formData,
                        addons: {
                          ...formData.addons,
                          sms: { ...formData.addons.sms, enabled: checked },
                        },
                      })}
                    />
                  </div>
                  {formData.addons.sms.enabled && (
                    <div>
                      <Label>Monthly Quota</Label>
                      <Input
                        type="number"
                        value={formData.addons.sms.quota}
                        onChange={(e) => setFormData({
                          ...formData,
                          addons: {
                            ...formData.addons,
                            sms: { ...formData.addons.sms, quota: parseInt(e.target.value) || 0 },
                          },
                        })}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleViewHistory}>
              <History className="h-4 w-4 mr-2" />
              View History
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Plan Change History</DialogTitle>
            <DialogDescription>
              Audit trail of all plan changes for {businessName}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {history.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No history available</div>
            ) : (
              <div className="space-y-2">
                {history.map((entry) => (
                  <div key={entry._id} className="border rounded p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-sm">{entry.changeType}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {entry.reason || 'No reason provided'}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(entry.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      Changed by: {entry.changedBy?.email || 'Unknown'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

