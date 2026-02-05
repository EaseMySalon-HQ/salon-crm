"use client"

import { useState, useEffect } from "react"
import { PlusCircle, Search, Filter, Send, Eye, X, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { CampaignsAPI } from "@/lib/api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CampaignForm } from "./campaign-form"
import { CampaignSendDialog } from "./campaign-send-dialog"
import { CampaignStats } from "./campaign-stats"
import { MarketingTemplateManager } from "./marketing-template-manager"

// Helper function to check permissions
const hasPermission = (user: any, module: string, feature: string): boolean => {
  if (!user) return false
  if (user.role === 'admin') return true
  if (!user.hasLoginAccess) return false
  return user.permissions?.some((p: any) => 
    p.module === module && p.feature === feature && p.enabled
  ) || false
}

export function CampaignsListPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSendDialogOpen, setIsSendDialogOpen] = useState(false)
  const [isStatsDialogOpen, setIsStatsDialogOpen] = useState(false)
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null)

  useEffect(() => {
    loadCampaigns()
  }, [statusFilter])

  const loadCampaigns = async () => {
    try {
      setLoading(true)
      const params: any = {
        page: 1,
        limit: 100,
      }

      if (statusFilter !== "all") {
        params.status = statusFilter
      }

      const response = await CampaignsAPI.getAll(params)
      if (response.success && response.data) {
        const campaignsList = Array.isArray(response.data) ? response.data : (response.data?.data || [])
        setCampaigns(campaignsList)
      }
    } catch (error: any) {
      console.error('Error loading campaigns:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to load campaigns. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleNewCampaign = () => {
    setSelectedCampaign(null)
    setIsFormOpen(true)
  }

  const handleFormSuccess = () => {
    setIsFormOpen(false)
    setSelectedCampaign(null)
    loadCampaigns()
  }

  const handleSend = (campaign: any) => {
    setSelectedCampaign(campaign)
    setIsSendDialogOpen(true)
  }

  const handleSendSuccess = () => {
    setIsSendDialogOpen(false)
    setSelectedCampaign(null)
    loadCampaigns()
  }

  const handleViewStats = (campaign: any) => {
    setSelectedCampaign(campaign)
    setIsStatsDialogOpen(true)
  }

  const handleCancel = async (campaign: any) => {
    if (!confirm(`Are you sure you want to cancel campaign "${campaign.name}"?`)) {
      return
    }

    try {
      const response = await CampaignsAPI.cancel(campaign._id)
      if (response.success) {
        toast({
          title: "Success",
          description: "Campaign cancelled successfully",
        })
        loadCampaigns()
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel campaign",
        variant: "destructive",
      })
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      draft: { label: "Draft", variant: "outline" },
      scheduled: { label: "Scheduled", variant: "secondary" },
      sending: { label: "Sending", variant: "default" },
      completed: { label: "Completed", variant: "default" },
      cancelled: { label: "Cancelled", variant: "destructive" },
    }

    const config = statusConfig[status] || { label: status, variant: "outline" as const }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const filteredCampaigns = campaigns.filter((campaign) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const name = campaign.name?.toLowerCase() || ""
      const templateName = campaign.templateName?.toLowerCase() || ""
      return name.includes(query) || templateName.includes(query)
    }
    return true
  })

  // Calculate stats
  const stats = {
    total: campaigns.length,
    draft: campaigns.filter(c => c.status === 'draft').length,
    scheduled: campaigns.filter(c => c.status === 'scheduled').length,
    sending: campaigns.filter(c => c.status === 'sending').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground">Manage your WhatsApp marketing campaigns</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsTemplateManagerOpen(true)}>
            Templates
          </Button>
          {hasPermission(user, 'campaigns', 'create') && (
            <Button onClick={handleNewCampaign}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Draft</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats.draft}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.scheduled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.sending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search campaigns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="sending">Sending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Campaigns</CardTitle>
          <CardDescription>Manage and track your marketing campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading campaigns...</div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No campaigns found. Create your first campaign to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  <TableHead>Name</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Sent/Failed</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map((campaign) => (
                  <TableRow key={campaign._id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>{campaign.templateName || 'N/A'}</TableCell>
                    <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell>{campaign.recipientCount || 0}</TableCell>
                    <TableCell>
                      {campaign.sentCount || 0} / {campaign.failedCount || 0}
                    </TableCell>
                    <TableCell>
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {hasPermission(user, 'campaigns', 'view') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewStats(campaign)}
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                        )}
                        {campaign.status === 'draft' && hasPermission(user, 'campaigns', 'edit') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSend(campaign)}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {(campaign.status === 'sending' || campaign.status === 'scheduled') && 
                         hasPermission(user, 'campaigns', 'delete') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(campaign)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      {isFormOpen && (
        <CampaignForm
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          onSuccess={handleFormSuccess}
          campaign={selectedCampaign}
        />
      )}

      {isSendDialogOpen && selectedCampaign && (
        <CampaignSendDialog
          open={isSendDialogOpen}
          onOpenChange={setIsSendDialogOpen}
          campaign={selectedCampaign}
          onSuccess={handleSendSuccess}
        />
      )}

      {isStatsDialogOpen && selectedCampaign && (
        <CampaignStats
          open={isStatsDialogOpen}
          onOpenChange={setIsStatsDialogOpen}
          campaign={selectedCampaign}
        />
      )}

      {isTemplateManagerOpen && (
        <MarketingTemplateManager
          open={isTemplateManagerOpen}
          onOpenChange={setIsTemplateManagerOpen}
        />
      )}
    </div>
  )
}

