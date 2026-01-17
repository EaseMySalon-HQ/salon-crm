"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/hooks/use-toast"
import { CampaignsAPI, MarketingTemplatesAPI } from "@/lib/api"

export function CampaignForm({ 
  open, 
  onOpenChange, 
  onSuccess,
  campaign 
}: { 
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  campaign?: any
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])
  const [recipientCount, setRecipientCount] = useState(0)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    templateId: '',
    recipientType: 'all_clients' as 'all_clients' | 'segment' | 'custom',
    recipientFilters: {} as any,
    templateVariables: {} as any,
    scheduledAt: ''
  })

  useEffect(() => {
    if (open) {
      loadTemplates()
      if (campaign) {
        setFormData({
          name: campaign.name || '',
          description: campaign.description || '',
          templateId: campaign.templateId || '',
          recipientType: campaign.recipientType || 'all_clients',
          recipientFilters: campaign.recipientFilters || {},
          templateVariables: campaign.templateVariables || {},
          scheduledAt: campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : ''
        })
      } else {
        setFormData({
          name: '',
          description: '',
          templateId: '',
          recipientType: 'all_clients',
          recipientFilters: {},
          templateVariables: {},
          scheduledAt: ''
        })
      }
    }
  }, [open, campaign])

  const loadTemplates = async () => {
    try {
      const response = await MarketingTemplatesAPI.getAll({ status: 'approved' })
      if (response.success && response.data) {
        const templatesList = Array.isArray(response.data) ? response.data : (response.data?.data || [])
        setTemplates(templatesList.filter((t: any) => t.status === 'approved'))
      }
    } catch (error) {
      console.error('Error loading templates:', error)
    }
  }

  const handlePreviewRecipients = async () => {
    if (!formData.templateId) {
      toast({
        title: "Error",
        description: "Please select a template first",
        variant: "destructive",
      })
      return
    }

    try {
      // Create a temporary campaign to get recipient count
      const tempCampaign = {
        ...formData,
        name: 'temp',
        templateId: formData.templateId
      }
      const response = await CampaignsAPI.create(tempCampaign)
      if (response.success) {
        setRecipientCount(response.data?.recipientCount || 0)
        // Delete the temp campaign
        // Note: In production, you might want a dedicated preview endpoint
      }
    } catch (error: any) {
      console.error('Error previewing recipients:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.templateId) {
      toast({
        title: "Error",
        description: "Campaign name and template are required",
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)

      const response = await CampaignsAPI.create({
        name: formData.name,
        description: formData.description,
        templateId: formData.templateId,
        recipientType: formData.recipientType,
        recipientFilters: formData.recipientFilters,
        templateVariables: formData.templateVariables,
        scheduledAt: formData.scheduledAt || undefined
      })

      if (response.success) {
        toast({
          title: "Success",
          description: "Campaign created successfully!",
        })
        onSuccess()
      } else {
        throw new Error(response.error || 'Failed to create campaign')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create campaign",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{campaign ? 'Edit Campaign' : 'Create Campaign'}</DialogTitle>
            <DialogDescription>
              Create a new marketing campaign using an approved template
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Campaign Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Summer Sale 2024"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Campaign description"
                rows={2}
              />
            </div>

            {/* Template Selection */}
            <div className="space-y-2">
              <Label htmlFor="templateId">Template *</Label>
              <Select
                value={formData.templateId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, templateId: value }))}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an approved template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template._id} value={template._id}>
                      {template.templateName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No approved templates available. Create and get a template approved first.
                </p>
              )}
            </div>

            {/* Recipient Type */}
            <div className="space-y-2">
              <Label>Recipient Type *</Label>
              <RadioGroup
                value={formData.recipientType}
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, recipientType: value }))}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all_clients" id="all_clients" />
                  <Label htmlFor="all_clients" className="cursor-pointer">All Clients</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="segment" id="segment" />
                  <Label htmlFor="segment" className="cursor-pointer">Segment</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom" className="cursor-pointer">Custom List</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Segment Filters */}
            {formData.recipientType === 'segment' && (
              <div className="space-y-4 p-4 border rounded-lg">
                <Label>Segment Filters</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lastVisitFrom">Last Visit From</Label>
                    <Input
                      id="lastVisitFrom"
                      type="date"
                      value={formData.recipientFilters?.lastVisitDateFrom || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        recipientFilters: {
                          ...prev.recipientFilters,
                          lastVisitDateFrom: e.target.value
                        }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastVisitTo">Last Visit To</Label>
                    <Input
                      id="lastVisitTo"
                      type="date"
                      value={formData.recipientFilters?.lastVisitDateTo || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        recipientFilters: {
                          ...prev.recipientFilters,
                          lastVisitDateTo: e.target.value
                        }
                      }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Custom List */}
            {formData.recipientType === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="customPhones">Phone Numbers (one per line)</Label>
                <Textarea
                  id="customPhones"
                  value={formData.recipientFilters?.phoneList?.join('\n') || ''}
                  onChange={(e) => {
                    const phones = e.target.value.split('\n').filter(p => p.trim())
                    setFormData(prev => ({
                      ...prev,
                      recipientFilters: {
                        ...prev.recipientFilters,
                        phoneList: phones
                      }
                    }))
                  }}
                  placeholder="919876543210&#10;919876543211"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Enter phone numbers in format: 91XXXXXXXXXX (one per line)
                </p>
              </div>
            )}

            {/* Schedule */}
            <div className="space-y-2">
              <Label htmlFor="scheduledAt">Schedule (Optional)</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={formData.scheduledAt}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduledAt: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to send immediately when campaign is sent
              </p>
            </div>

            {/* Recipient Count Preview */}
            {recipientCount > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">
                  Estimated Recipients: {recipientCount}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={handlePreviewRecipients}>
              Preview Recipients
            </Button>
            <Button type="submit" disabled={loading || !formData.name || !formData.templateId}>
              {loading ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

