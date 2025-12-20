"use client"

import { useState, useEffect } from "react"
import { PlusCircle, Search, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LeadsTable } from "@/components/leads/leads-table"
import { LeadForm } from "@/components/leads/lead-form"
import { ConvertToAppointmentDialog } from "@/components/leads/convert-to-appointment-dialog"
import { LeadsAPI } from "@/lib/api"
import { StaffAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

// Helper function to check permissions
const hasPermission = (user: any, module: string, feature: string): boolean => {
  if (!user) return false
  // Admin has all permissions
  if (user.role === 'admin') return true
  // Check if user has login access
  if (!user.hasLoginAccess) return false
  // Check specific permission
  return user.permissions?.some((p: any) => 
    p.module === module && p.feature === feature && p.enabled
  ) || false
}

export function LeadsListPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [leads, setLeads] = useState<any[]>([])
  const [filteredLeads, setFilteredLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [assignedStaffFilter, setAssignedStaffFilter] = useState<string>("all")
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [staff, setStaff] = useState<any[]>([])

  useEffect(() => {
    loadLeads()
    loadStaff()
  }, [])

  useEffect(() => {
    filterLeads()
  }, [leads, searchQuery, statusFilter, sourceFilter, assignedStaffFilter])

  const loadLeads = async () => {
    try {
      setLoading(true)
      const params: any = {
        page: 1,
        limit: 1000, // Get all leads for now
      }

      if (statusFilter !== "all") {
        params.status = statusFilter
      }
      if (sourceFilter !== "all") {
        params.source = sourceFilter
      }
      if (assignedStaffFilter !== "all") {
        params.assignedStaffId = assignedStaffFilter
      }

      const response = await LeadsAPI.getAll(params)
      if (response.success && response.data) {
        const leadsList = Array.isArray(response.data) ? response.data : (response.data?.data || [])
        setLeads(leadsList)
      }
    } catch (error: any) {
      console.error('Error loading leads:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to load leads. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const loadStaff = async () => {
    try {
      const response = await StaffAPI.getAll({ limit: 1000 })
      if (response.success && response.data) {
        const staffList = Array.isArray(response.data) ? response.data : (response.data?.data || [])
        setStaff(staffList)
      }
    } catch (error) {
      console.error('Error loading staff:', error)
    }
  }

  const filterLeads = () => {
    let filtered = [...leads]

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((lead) => {
        const name = lead.name?.toLowerCase() || ""
        const phone = lead.phone?.toLowerCase() || ""
        const email = lead.email?.toLowerCase() || ""
        return name.includes(query) || phone.includes(query) || email.includes(query)
      })
    }

    setFilteredLeads(filtered)
  }

  const handleRefresh = () => {
    loadLeads()
  }

  const handleFormSuccess = () => {
    setIsFormOpen(false)
    setSelectedLead(null)
    loadLeads()
  }

  const handleEdit = (lead: any) => {
    setSelectedLead(lead)
    setIsFormOpen(true)
  }

  const handleConvert = (lead: any) => {
    setSelectedLead(lead)
    setIsConvertDialogOpen(true)
  }

  const handleConvertSuccess = () => {
    setIsConvertDialogOpen(false)
    setSelectedLead(null)
    loadLeads()
  }

  const handleNewLead = () => {
    setSelectedLead(null)
    setIsFormOpen(true)
  }

  // Calculate stats
  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    followUp: leads.filter(l => l.status === 'follow-up').length,
    converted: leads.filter(l => l.status === 'converted').length,
    lost: leads.filter(l => l.status === 'lost').length,
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lead Management</h1>
          <p className="text-muted-foreground">Track and manage your leads</p>
        </div>
        {hasPermission(user, 'lead_management', 'create') && (
          <Button onClick={handleNewLead}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Lead
          </Button>
        )}
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
            <CardTitle className="text-sm font-medium">New</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.new}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Follow-up</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.followUp}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Converted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.converted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Lost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats.lost}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="follow-up">Follow-up</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="walk-in">Walk-in</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="social">Social Media</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignedStaffFilter} onValueChange={setAssignedStaffFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s._id || s.id} value={s._id || s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      {loading ? (
        <div className="text-center py-8">Loading leads...</div>
      ) : (
        <LeadsTable
          leads={filteredLeads}
          onRefresh={handleRefresh}
          onEdit={handleEdit}
          onConvert={handleConvert}
        />
      )}

      {/* Lead Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedLead ? "Edit Lead" : "New Lead"}</DialogTitle>
            <DialogDescription>
              Use this form to create or update a lead.
            </DialogDescription>
          </DialogHeader>
          <LeadForm
            lead={selectedLead}
            isEditMode={!!selectedLead}
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setIsFormOpen(false)
              setSelectedLead(null)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Convert Dialog */}
      {selectedLead && (
        <ConvertToAppointmentDialog
          lead={selectedLead}
          open={isConvertDialogOpen}
          onOpenChange={setIsConvertDialogOpen}
          onSuccess={handleConvertSuccess}
        />
      )}
    </div>
  )
}

