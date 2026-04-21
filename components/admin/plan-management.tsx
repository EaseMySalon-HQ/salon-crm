"use client"

import { useState, useEffect } from "react"
import { Search, Filter, Building2, CreditCard, Calendar, CheckCircle2, XCircle, Settings, History, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"

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
}

interface Feature {
  id: string
  name: string
  description: string
  category: string
}

interface Business {
  _id: string
  name: string
  code: string
  contact: {
    email: string
    phone: string
  }
  status: string
  plan: {
    planId: string
    planName: string
    billingPeriod: string
    renewalDate: string | null
    isTrial: boolean
    trialEndsAt: string | null
    features: string[]
    hasOverrides: boolean
    overridesExpiresAt: string | null
    addons: {
      whatsapp?: { enabled: boolean; quota: number; used: number }
      sms?: { enabled: boolean; quota: number; used: number }
    }
  }
  owner: {
    name: string
    email: string
  } | null
  createdAt: string
}

export function PlanManagement() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [planFilter, setPlanFilter] = useState("all")
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const { toast } = useToast()

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

  // Form state
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
    fetchConfig()
    fetchBusinesses()
  }, [currentPage, searchTerm, planFilter])

  const fetchConfig = async () => {
    try {
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
    }
  }

  const fetchBusinesses = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "20",
        ...(searchTerm && { search: searchTerm }),
        ...(planFilter !== "all" && { planId: planFilter }),
      })

      const response = await fetch(`${API_URL}/admin/plans/businesses?${params}`, {
        headers: adminRequestHeaders(),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setBusinesses(data.data.businesses)
          setTotalPages(data.data.pagination.pages)
        }
      }
    } catch (error) {
      console.error('Error fetching businesses:', error)
      toast({
        title: "Error",
        description: "Failed to fetch businesses",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEditPlan = (business: Business) => {
    setSelectedBusiness(business)
    setFormData({
      planId: business.plan.planId,
      billingPeriod: business.plan.billingPeriod,
      renewalDate: business.plan.renewalDate ? new Date(business.plan.renewalDate).toISOString().split('T')[0] : '',
      isTrial: business.plan.isTrial,
      trialEndsAt: business.plan.trialEndsAt ? new Date(business.plan.trialEndsAt).toISOString().split('T')[0] : '',
      overrides: {
        features: business.plan.hasOverrides ? business.plan.features.filter(f => !plans.find(p => p.id === business.plan.planId)?.features.includes(f)) : [],
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
    setIsEditDialogOpen(true)
  }

  const handleViewHistory = async (businessId: string) => {
    try {
      const response = await fetch(`${API_URL}/admin/plans/business/${businessId}/history`, {
        headers: adminRequestHeaders(),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setHistory(data.data.history)
          setIsHistoryDialogOpen(true)
        }
      }
    } catch (error) {
      console.error('Error fetching history:', error)
      toast({
        title: "Error",
        description: "Failed to fetch plan history",
        variant: "destructive",
      })
    }
  }

  const handleSavePlan = async () => {
    if (!selectedBusiness) return

    try {
      const response = await fetch(`${API_URL}/admin/plans/business/${selectedBusiness._id}`, {
        method: 'PUT',
        headers: adminRequestHeaders({
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
          setIsEditDialogOpen(false)
          fetchBusinesses()
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

  const getPlanBadgeColor = (planId: string) => {
    switch (planId) {
      case 'starter':
        return 'bg-blue-100 text-blue-800'
      case 'professional':
        return 'bg-purple-100 text-purple-800'
      case 'enterprise':
        return 'bg-amber-100 text-amber-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading && businesses.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading businesses...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Plan Management</h1>
          <p className="text-gray-600">Manage pricing plans and feature access for businesses</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search businesses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Businesses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Businesses</CardTitle>
          <CardDescription>Manage plan assignments and feature access</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Features</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {businesses.map((business) => (
                <TableRow key={business._id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{business.name}</div>
                      <div className="text-sm text-gray-500">{business.code}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getPlanBadgeColor(business.plan.planId)}>
                      {business.plan.planName}
                    </Badge>
                    {business.plan.isTrial && (
                      <Badge variant="outline" className="ml-2">
                        Trial
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="capitalize">{business.plan.billingPeriod}</div>
                      {business.plan.renewalDate && (
                        <div className="text-gray-500">
                          Renews: {new Date(business.plan.renewalDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={business.status === 'active' ? 'default' : 'secondary'}>
                      {business.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{business.plan.features.length} features</div>
                      {business.plan.hasOverrides && (
                        <Badge variant="outline" className="mt-1">
                          Promo Active
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditPlan(business)}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewHistory(business._id)}
                      >
                        <History className="h-4 w-4 mr-1" />
                        History
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4">
              <Button
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Plan Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Plan: {selectedBusiness?.name}</DialogTitle>
            <DialogDescription>
              Update plan, billing period, and feature access
            </DialogDescription>
          </DialogHeader>

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
                  Select additional features to grant beyond the plan defaults
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto border rounded p-4">
                  {features.map((feature) => {
                    const planFeatures = plans.find(p => p.id === formData.planId)?.features || []
                    const isInPlan = planFeatures.includes(feature.id)
                    const isOverride = formData.overrides.features.includes(feature.id)

                    return (
                      <div key={feature.id} className="flex items-center space-x-2">
                        <Switch
                          checked={isOverride}
                          onCheckedChange={() => toggleFeatureOverride(feature.id)}
                          disabled={isInPlan}
                        />
                        <Label className="text-sm">
                          {feature.name}
                          {isInPlan && <span className="text-gray-400 ml-1">(in plan)</span>}
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
                  <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
                    WhatsApp messages are billed per message from the business
                    wallet (₹0.20 transactional, ₹1.20 campaign). No free quota.
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
                  <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
                    SMS messages are billed per message from the business
                    wallet (₹0.20 per message). No free quota.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePlan}>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Plan Change History</DialogTitle>
            <DialogDescription>
              Audit trail of all plan changes for {selectedBusiness?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Changed By</TableHead>
                  <TableHead>Change Type</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((entry) => (
                  <TableRow key={entry._id}>
                    <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {entry.changedBy?.email || entry.changedBy?.name || 'Unknown'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.changeType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.reason || 'No reason provided'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

