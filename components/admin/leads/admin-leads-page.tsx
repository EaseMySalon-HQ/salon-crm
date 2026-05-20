"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { PlusCircle, Search } from "lucide-react"
import { AdminLeadsAPI, type PlatformLeadRow } from "@/lib/admin-api"
import type { AdminLeadAssignee } from "@/lib/admin-api"
import { hasAdminLeadPermission } from "@/lib/admin-lead-permissions"
import { useAdminAuth } from "@/lib/admin-auth-context"
import { AdminLeadsTable } from "@/components/admin/leads/admin-leads-table"
import { AdminLeadForm } from "@/components/admin/leads/admin-lead-form"
import { ConvertToBusinessDialog } from "@/components/admin/leads/convert-to-business-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useToast } from "@/hooks/use-toast"

export function AdminLeadsPage() {
  const { admin } = useAdminAuth()
  const { toast } = useToast()
  const [leads, setLeads] = useState<PlatformLeadRow[]>([])
  const [assignees, setAssignees] = useState<AdminLeadAssignee[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [assignedFilter, setAssignedFilter] = useState("all")
  const [formOpen, setFormOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<PlatformLeadRow | null>(null)

  const canView = hasAdminLeadPermission(admin, "view")
  const canCreate = hasAdminLeadPermission(admin, "create")

  const loadLeads = useCallback(async () => {
    if (!canView) return
    try {
      setLoading(true)
      const params: Record<string, string | number> = { page: 1, limit: 500 }
      if (statusFilter !== "all") params.status = statusFilter
      if (sourceFilter !== "all") params.source = sourceFilter
      if (assignedFilter !== "all") params.assignedAdminId = assignedFilter
      const res = await AdminLeadsAPI.list(params)
      setLeads(res.data)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load leads."
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [canView, statusFilter, sourceFilter, assignedFilter, toast])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  useEffect(() => {
    if (!canView) return
    AdminLeadsAPI.listAssignees()
      .then(setAssignees)
      .catch(() => {})
  }, [canView])

  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim()) return leads
    const q = searchQuery.toLowerCase()
    return leads.filter((lead) => {
      const salon = lead.salonName?.toLowerCase() || ""
      const name = lead.name?.toLowerCase() || ""
      const phone = lead.phone?.toLowerCase() || ""
      const email = lead.email?.toLowerCase() || ""
      return name.includes(q) || salon.includes(q) || phone.includes(q) || email.includes(q)
    })
  }, [leads, searchQuery])

  const stats = useMemo(
    () => ({
      total: leads.length,
      new: leads.filter((l) => l.status === "new").length,
      followUp: leads.filter((l) => l.status === "follow-up").length,
      converted: leads.filter((l) => l.status === "converted").length,
      lost: leads.filter((l) => l.status === "lost").length,
    }),
    [leads]
  )

  if (!canView) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-500">
          You do not have permission to view leads. Ask a super admin to grant the Leads module.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Lead Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track prospective salons and platform sales follow-ups
          </p>
        </div>
        {canCreate && (
          <Button
            className="bg-slate-900 hover:bg-slate-800"
            onClick={() => {
              setSelectedLead(null)
              setFormOpen(true)
            }}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            New Lead
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total", value: stats.total, className: "" },
          { label: "New", value: stats.new, className: "text-blue-600" },
          { label: "Follow-up", value: stats.followUp, className: "text-orange-600" },
          { label: "Converted", value: stats.converted, className: "text-green-600" },
          { label: "Lost", value: stats.lost, className: "text-slate-600" },
        ].map((s) => (
          <Card key={s.label} className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${s.className}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search leads…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="follow-up">Follow-up</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="walk-in">Walk-in</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="social">Social Media</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-center py-8 text-slate-500">Loading leads…</p>
      ) : (
        <AdminLeadsTable
          leads={filteredLeads}
          onRefresh={loadLeads}
          onEdit={(lead) => {
            setSelectedLead(lead)
            setFormOpen(true)
          }}
          onConvert={(lead) => {
            setSelectedLead(lead)
            setConvertOpen(true)
          }}
        />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedLead ? "Edit lead" : "New lead"}</DialogTitle>
            <DialogDescription>Lead form</DialogDescription>
          </DialogHeader>
          <AdminLeadForm
            lead={selectedLead}
            isEditMode={!!selectedLead}
            assignees={assignees}
            onSuccess={() => {
              setFormOpen(false)
              setSelectedLead(null)
              loadLeads()
            }}
            onCancel={() => {
              setFormOpen(false)
              setSelectedLead(null)
            }}
          />
        </DialogContent>
      </Dialog>

      {selectedLead && (
        <ConvertToBusinessDialog
          lead={selectedLead}
          open={convertOpen}
          onOpenChange={setConvertOpen}
          onSuccess={() => {
            setConvertOpen(false)
            setSelectedLead(null)
            loadLeads()
          }}
        />
      )}
    </div>
  )
}
