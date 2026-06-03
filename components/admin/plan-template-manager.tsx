"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Save, Trash2, Settings, TableProperties } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"
import { formatAdminPlanMonthlyPrice, parseAdminPlanPriceInput } from "@/lib/admin-plan-price"
import { isCanonicalPlanId } from "@/lib/plan-ids"

interface Plan {
  id: string
  name: string
  description: string
  monthlyPrice: number | null
  yearlyPrice: number | null
  features: string[]
  limits: {
    locations: number
    staff: number
    whatsappMessages: number
    smsMessages: number
  }
  support: {
    email: boolean
    phone: boolean
    priority: boolean
  }
}

interface Feature {
  id: string
  name: string
  description: string
  category: string
}

/**
 * How each feature toggle is enforced in the product today. Surfaced as a badge
 * so admins know which toggles actually gate access vs. which are not yet wired.
 *  - "gated": enforced at API + UI (toggling changes tenant access)
 *  - "core": always-on for every plan; included for completeness
 *  - "partial": enforced where surfaces exist, product split is partial
 *  - "planned": defined but no product surface yet (no-op if toggled)
 */
const FEATURE_ENFORCEMENT: Record<string, "gated" | "core" | "partial" | "planned"> = {
  pos: "core",
  appointments: "core",
  crm: "core",
  service_management: "core",
  product_management: "core",
  basic_inventory: "core",
  receipts: "core",
  cash_register: "core",
  staff_management: "core",
  basic_reports: "core",
  incentive_management: "gated",
  reward_points: "gated",
  feedback_management: "gated",
  analytics: "gated",
  advanced_inventory: "gated",
  advanced_reports: "gated",
  data_export: "gated",
  custom_receipt_templates: "gated",
  multi_location: "planned",
  centralized_reporting: "planned",
  api_access: "planned",
  custom_integrations: "planned",
  approval_workflows: "planned",
}

const ENFORCEMENT_BADGE: Record<string, { label: string; className: string }> = {
  gated: { label: "Gated", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  core: { label: "Core", className: "bg-slate-100 text-slate-600 border-slate-200" },
  partial: { label: "Partial", className: "bg-amber-100 text-amber-700 border-amber-200" },
  planned: { label: "Planned", className: "bg-gray-100 text-gray-500 border-gray-200" },
}

export function PlanTemplateManager() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const { toast } = useToast()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    description: '',
    monthlyPrice: null as number | null,
    yearlyPrice: null as number | null,
    features: [] as string[],
    limits: {
      locations: 1,
      staff: Infinity,
      whatsappMessages: 0,
      smsMessages: 0,
    },
    support: {
      email: true,
      phone: false,
      priority: false,
    },
  })

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/admin/plans/config`, {
        headers: adminRequestHeaders(),
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
      toast({
        title: "Error",
        description: "Failed to fetch plan configuration",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePlan = () => {
    setFormData({
      id: '',
      name: '',
      description: '',
      monthlyPrice: null,
      yearlyPrice: null,
      features: [],
      limits: {
        locations: 1,
        staff: Infinity,
        whatsappMessages: 0,
        smsMessages: 0,
      },
      support: {
        email: true,
        phone: false,
        priority: false,
      },
    })
    setIsCreateDialogOpen(true)
  }

  const handleEditPlan = (plan: Plan) => {
    setSelectedPlan(plan)
    setFormData({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      features: [...plan.features],
      limits: { ...plan.limits },
      support: { ...plan.support },
    })
    setIsEditDialogOpen(true)
  }

  const handleDeletePlan = async (planId: string) => {
    if (!confirm(`Are you sure you want to delete the plan "${planId}"? This will deactivate it if businesses are using it.`)) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/admin/plans/templates/${planId}`, {
        method: 'DELETE',
        headers: adminRequestHeaders(),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          toast({
            title: "Success",
            description: data.message || "Plan template deleted successfully",
          })
          fetchConfig() // Refresh the list
        }
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || "Failed to delete plan template",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error deleting plan:', error)
      toast({
        title: "Error",
        description: "Failed to delete plan template",
        variant: "destructive",
      })
    }
  }

  const toggleFeature = (featureId: string) => {
    const currentFeatures = formData.features
    if (currentFeatures.includes(featureId)) {
      setFormData({
        ...formData,
        features: currentFeatures.filter(f => f !== featureId),
      })
    } else {
      setFormData({
        ...formData,
        features: [...currentFeatures, featureId],
      })
    }
  }

  const handleSavePlan = async () => {
    try {
      const isCreating = isCreateDialogOpen
      const url = isCreating 
        ? `${API_URL}/admin/plans/templates`
        : `${API_URL}/admin/plans/templates/${formData.id}`
      
      const method = isCreating ? 'POST' : 'PUT'
      
      const response = await fetch(url, {
        method,
        headers: adminRequestHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          id: formData.id,
          name: formData.name,
          description: formData.description,
          monthlyPrice: formData.monthlyPrice,
          yearlyPrice: formData.yearlyPrice,
          features: formData.features,
          limits: formData.limits,
          support: formData.support,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          toast({
            title: "Success",
            description: isCreating ? "Plan template created successfully" : "Plan template updated successfully",
          })
          setIsEditDialogOpen(false)
          setIsCreateDialogOpen(false)
          fetchConfig() // Refresh the list
        }
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || "Failed to save plan template",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error saving plan:', error)
      toast({
        title: "Error",
        description: "Failed to save plan template",
        variant: "destructive",
      })
    }
  }

  const groupedFeatures = features.reduce((acc, feature) => {
    const category = feature.category || 'other'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(feature)
    return acc
  }, {} as Record<string, Feature[]>)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading plans...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Plan Templates</h1>
          <p className="text-gray-600">
            Manage the three subscription tiers — Starter, Growth, and Pro — and their feature sets
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/plans/pricing-matrix">
              <TableProperties className="h-4 w-4 mr-2" />
              Manage Pricing Matrix on Pricing Page
            </Link>
          </Button>
        </div>
      </div>

      {/* Plans List */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className="relative">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription className="mt-1">{plan.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditPlan(plan)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  {!isCanonicalPlanId(plan.id) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeletePlan(plan.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="text-2xl font-bold">
                    {formatAdminPlanMonthlyPrice(plan.monthlyPrice)}
                  </div>
                  <div className="text-sm text-gray-500">per month</div>
                </div>
                <div>
                  <div className="text-sm font-semibold mb-2">Features ({plan.features.length})</div>
                  <div className="text-xs text-gray-600">
                    {plan.features.slice(0, 3).join(', ')}
                    {plan.features.length > 3 && ` +${plan.features.length - 3} more`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">{plan.limits.locations === Infinity ? 'Unlimited' : plan.limits.locations} locations</Badge>
                  <Badge variant="outline">{plan.support.email ? 'Email' : ''} {plan.support.phone ? 'Phone' : ''}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit/Create Plan Dialog */}
      <Dialog open={isEditDialogOpen || isCreateDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open)
        setIsCreateDialogOpen(open)
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isCreateDialogOpen ? 'Create New Plan' : `Edit Plan: ${selectedPlan?.name}`}</DialogTitle>
            <DialogDescription>
              Configure plan details, pricing, features, and limits
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList>
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="limits">Limits & Support</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Plan ID (unique identifier)</Label>
                  <Input
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    placeholder="e.g., starter, growth, pro"
                    disabled={!isCreateDialogOpen}
                  />
                  {!isCreateDialogOpen && (
                    <p className="text-xs text-gray-500 mt-1">Plan ID cannot be changed</p>
                  )}
                </div>
                <div>
                  <Label>Plan Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Premium Plan"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Plan description..."
                  />
                </div>
                <div>
                  <Label>Monthly Price (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.monthlyPrice ?? ''}
                    onChange={(e) =>
                      setFormData({ ...formData, monthlyPrice: parseAdminPlanPriceInput(e.target.value) })
                    }
                    placeholder="0 for free plan, empty for custom pricing"
                  />
                </div>
                <div>
                  <Label>Yearly Price (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.yearlyPrice ?? ''}
                    onChange={(e) =>
                      setFormData({ ...formData, yearlyPrice: parseAdminPlanPriceInput(e.target.value) })
                    }
                    placeholder="0 for free plan, empty for custom pricing"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="features" className="space-y-4">
              <div>
                <Label>Select Features for this Plan</Label>
                <p className="text-sm text-gray-500 mb-2">
                  Toggle features to include in this plan template
                </p>
                <div className="flex flex-wrap items-center gap-3 mb-4 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">Gated</Badge>
                    Enforced at API + UI
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 border-slate-200">Core</Badge>
                    Always on for every plan
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-500 border-gray-200">Planned</Badge>
                    No product surface yet
                  </span>
                </div>
                <div className="space-y-4 max-h-96 overflow-y-auto border rounded p-4">
                  {Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
                    <div key={category} className="space-y-2">
                      <div className="font-semibold text-sm text-gray-700 capitalize">{category}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {categoryFeatures.map((feature) => {
                          const enforcement = FEATURE_ENFORCEMENT[feature.id] || "planned"
                          const badge = ENFORCEMENT_BADGE[enforcement]
                          return (
                            <div key={feature.id} className="flex items-center space-x-2">
                              <Switch
                                checked={formData.features.includes(feature.id)}
                                onCheckedChange={() => toggleFeature(feature.id)}
                              />
                              <Label className="text-sm cursor-pointer flex items-center gap-1.5">
                                {feature.name}
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${badge.className}`}>
                                  {badge.label}
                                </Badge>
                              </Label>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-sm text-gray-600">
                  Selected: {formData.features.length} features
                </div>
              </div>
            </TabsContent>

            <TabsContent value="limits" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Locations Limit</Label>
                  <Input
                    type="number"
                    value={formData.limits.locations === Infinity ? 'Unlimited' : formData.limits.locations}
                    onChange={(e) => setFormData({
                      ...formData,
                      limits: {
                        ...formData.limits,
                        locations: e.target.value === 'Unlimited' ? Infinity : parseInt(e.target.value) || 1,
                      },
                    })}
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label>Staff Limit</Label>
                  <Input
                    type="text"
                    value={formData.limits.staff === Infinity ? 'Unlimited' : formData.limits.staff}
                    onChange={(e) => setFormData({
                      ...formData,
                      limits: {
                        ...formData.limits,
                        staff: e.target.value === 'Unlimited' ? Infinity : parseInt(e.target.value) || Infinity,
                      },
                    })}
                    placeholder="Unlimited"
                  />
                </div>
              </div>
              <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
                WhatsApp and SMS messages are billed per message from the
                business wallet (₹0.20 SMS / ₹0.20 transactional WhatsApp /
                ₹1.20 campaign WhatsApp). No free plan quota.
              </div>

              <div className="space-y-3 pt-4 border-t">
                <Label>Support Options</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Email Support</Label>
                    <Switch
                      checked={formData.support.email}
                      onCheckedChange={(checked) => setFormData({
                        ...formData,
                        support: { ...formData.support, email: checked },
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Phone Support</Label>
                    <Switch
                      checked={formData.support.phone}
                      onCheckedChange={(checked) => setFormData({
                        ...formData,
                        support: { ...formData.support, phone: checked },
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Priority Support</Label>
                    <Switch
                      checked={formData.support.priority}
                      onCheckedChange={(checked) => setFormData({
                        ...formData,
                        support: { ...formData.support, priority: checked },
                      })}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditDialogOpen(false)
              setIsCreateDialogOpen(false)
            }}>
              Cancel
            </Button>
            <Button onClick={handleSavePlan}>
              <Save className="h-4 w-4 mr-2" />
              Save Plan Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

