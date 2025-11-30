"use client"

import { useState, useEffect } from "react"
import { Plus, Save, Trash2, Settings, CheckCircle2, XCircle } from "lucide-react"

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
import { getAdminAuthToken } from "@/lib/admin-auth-storage"

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

export function PlanTemplateManager() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
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
        headers: authHeaders(),
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
        headers: authHeaders({
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
          <p className="text-gray-600">Create and manage pricing plan templates with granular feature control</p>
        </div>
        <Button onClick={handleCreatePlan}>
          <Plus className="h-4 w-4 mr-2" />
          Create Plan
        </Button>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeletePlan(plan.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="text-2xl font-bold">
                    {plan.monthlyPrice ? `₹${plan.monthlyPrice.toLocaleString()}` : 'Custom'}
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
                    placeholder="e.g., premium"
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
                    value={formData.monthlyPrice || ''}
                    onChange={(e) => setFormData({ ...formData, monthlyPrice: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Leave empty for custom pricing"
                  />
                </div>
                <div>
                  <Label>Yearly Price (₹)</Label>
                  <Input
                    type="number"
                    value={formData.yearlyPrice || ''}
                    onChange={(e) => setFormData({ ...formData, yearlyPrice: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Leave empty for custom pricing"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="features" className="space-y-4">
              <div>
                <Label>Select Features for this Plan</Label>
                <p className="text-sm text-gray-500 mb-4">
                  Toggle features to include in this plan template
                </p>
                <div className="space-y-4 max-h-96 overflow-y-auto border rounded p-4">
                  {Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
                    <div key={category} className="space-y-2">
                      <div className="font-semibold text-sm text-gray-700 capitalize">{category}</div>
                      <div className="grid grid-cols-2 gap-2">
                        {categoryFeatures.map((feature) => (
                          <div key={feature.id} className="flex items-center space-x-2">
                            <Switch
                              checked={formData.features.includes(feature.id)}
                              onCheckedChange={() => toggleFeature(feature.id)}
                            />
                            <Label className="text-sm cursor-pointer">
                              {feature.name}
                            </Label>
                          </div>
                        ))}
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
                <div>
                  <Label>WhatsApp Messages (monthly)</Label>
                  <Input
                    type="number"
                    value={formData.limits.whatsappMessages === Infinity ? 'Unlimited' : formData.limits.whatsappMessages}
                    onChange={(e) => setFormData({
                      ...formData,
                      limits: {
                        ...formData.limits,
                        whatsappMessages: e.target.value === 'Unlimited' ? Infinity : parseInt(e.target.value) || 0,
                      },
                    })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>SMS Messages (monthly)</Label>
                  <Input
                    type="number"
                    value={formData.limits.smsMessages === Infinity ? 'Unlimited' : formData.limits.smsMessages}
                    onChange={(e) => setFormData({
                      ...formData,
                      limits: {
                        ...formData.limits,
                        smsMessages: e.target.value === 'Unlimited' ? Infinity : parseInt(e.target.value) || 0,
                      },
                    })}
                    placeholder="0"
                  />
                </div>
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

