"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Building2,
  Users,
  Calendar,
  Shield,
  Ban,
  CreditCard,
  RefreshCw,
  Download,
  LogIn,
  Key,
  FileText,
  Copy,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { PlanEditDialog } from "./plan-edit-dialog"
import { BusinessActivityLogsDialog } from "./business-activity-logs-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { adminRequestHeaders } from "@/lib/admin-request-headers"
import { cn } from "@/lib/utils"

interface Business {
  _id: string
  name: string
  code: string
  businessType: string
  status: string
  address?: { city?: string; state?: string; street?: string }
  contact?: { email?: string }
  subscription?: { plan?: string }
  plan?: {
    planId: string
    planName: string
    billingPeriod: string
    renewalDate: string | null
    isTrial: boolean
  } | null
  owner: {
    firstName?: string
    lastName?: string
    name?: string
    email?: string
    lastLoginAt?: string | null
  } | null
  createdAt: string
  deletedAt?: string
  deletedBy?: { name?: string; email?: string } | null
  usersCount?: number
  invoicesCount?: number
  revenue?: number
  nextBillingDate?: string | null
}

interface Stats {
  total: number
  active: number
  suspended: number
  inactive: number
  deleted?: number
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

function formatRelative(date: string | null | undefined): string {
  if (!date) return "—"
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hr ago`
  if (diffDays < 30) return `${diffDays} days ago`
  return d.toLocaleDateString()
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatCurrency(amount: number | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—"
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount)
}

function formatNextBilling(date: string | null | undefined): string {
  if (!date) return "N/A"
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
    suspended: { label: "Suspended", className: "bg-red-500/10 text-red-700 border-red-200" },
    inactive: { label: "Inactive", className: "bg-amber-500/10 text-amber-700 border-amber-200" },
    deleted: { label: "Deleted", className: "bg-slate-200 text-slate-600 border-slate-300" },
  }
  const s = map[status] || { label: status, className: "bg-slate-100 text-slate-600 border-slate-200" }
  return <Badge variant="outline" className={cn("font-medium", s.className)}>{s.label}</Badge>
}

export function BusinessManagement() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [planFilter, setPlanFilter] = useState("all")
  const [billingFilter, setBillingFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedBusinessForPlan, setSelectedBusinessForPlan] = useState<Business | null>(null)
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false)
  const [activityLogsBusiness, setActivityLogsBusiness] = useState<Business | null>(null)
  const [isActivityLogsOpen, setIsActivityLogsOpen] = useState(false)
  const [ownerPasswordResetDialog, setOwnerPasswordResetDialog] = useState<{
    password: string
    businessName: string
    ownerEmail?: string
    emailSent: boolean
  } | null>(null)
  const [resetPasswordCopyButtonDone, setResetPasswordCopyButtonDone] = useState(false)
  const limit = 20
  const { toast } = useToast()
  const router = useRouter()

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/businesses/stats`, { headers: adminRequestHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setStats(data.data)
      }
    } catch (_) {}
  }

  const fetchBusinesses = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
        ...(searchTerm && { search: searchTerm }),
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(planFilter !== "all" && { plan: planFilter }),
      })
      const [businessesRes, plansRes] = await Promise.all([
        fetch(`${API_URL}/admin/businesses?${params}`, { headers: adminRequestHeaders({ "Content-Type": "application/json" }) }),
        fetch(`${API_URL}/admin/plans/businesses?${params}`, { headers: adminRequestHeaders() }),
      ])

      if (businessesRes.ok && plansRes.ok) {
        const businessesData = await businessesRes.json()
        const plansData = await plansRes.json()
        if (businessesData.success) {
          const list: Business[] = (businessesData.data || []).map((b: Business) => {
            const planInfo = plansData.success && plansData.data?.businesses
              ? plansData.data.businesses.find((x: { _id: string }) => x._id === b._id)
              : null
            const owner = b.owner as any
            return {
              ...b,
              owner: owner ? {
                ...owner,
                name: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.name || "—",
              } : null,
              plan: planInfo?.plan || null,
            }
          })
          setBusinesses(list)
          setTotalPages(businessesData.pagination?.totalPages ?? 1)
          setTotalCount(businessesData.pagination?.total ?? 0)
        }
      }
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "Failed to fetch businesses", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    fetchBusinesses()
  }, [currentPage, searchTerm, statusFilter, planFilter])

  const handleRefresh = () => {
    fetchStats()
    fetchBusinesses()
    toast({ title: "Refreshed", description: "Data updated" })
  }

  const handleExport = () => {
    toast({ title: "Export", description: "Export will download selected businesses. Bulk export can be wired here." })
  }

  const handleStatusChange = async (businessId: string, newStatus: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/businesses/${businessId}/status`, {
        method: "PATCH",
        headers: adminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        toast({ title: "Success", description: `Business ${newStatus} successfully` })
        fetchStats()
        fetchBusinesses()
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed")
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to update status", variant: "destructive" })
    }
  }

  const handleDeleteBusiness = async (businessId: string, businessName: string, status: string) => {
    const isSoft = status !== "deleted"
    if (!confirm(isSoft ? `Delete "${businessName}"? It will be marked as deleted.` : `Permanently delete "${businessName}"?`)) return
    try {
      const res = await fetch(`${API_URL}/admin/businesses/${businessId}`, {
        method: "DELETE",
        headers: adminRequestHeaders({ "Content-Type": "application/json" }),
      })
      if (res.ok) {
        toast({ title: "Business deleted", description: isSoft ? `"${businessName}" marked as deleted.` : `"${businessName}" permanently deleted.` })
        fetchStats()
        fetchBusinesses()
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Delete failed")
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Delete failed", variant: "destructive" })
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === businesses.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(businesses.map((b) => b._id)))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkSuspend = () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Suspend ${selectedIds.size} selected business(es)?`)) return
    Promise.all(Array.from(selectedIds).map((id) => fetch(`${API_URL}/admin/businesses/${id}/status`, {
      method: "PATCH",
      headers: adminRequestHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "suspended" }),
    }))).then(() => {
      toast({ title: "Done", description: "Selected businesses suspended." })
      setSelectedIds(new Set())
      fetchStats()
      fetchBusinesses()
    })
  }

  const handleImpersonate = async (business: Business) => {
    try {
      const res = await fetch(`${API_URL}/admin/businesses/${business._id}/impersonate`, {
        method: "POST",
        credentials: "include",
        headers: adminRequestHeaders({ "Content-Type": "application/json" }),
      })
      // #region agent log
      console.log('[DBG-d9251f] impersonate-response', {status:res.status,ok:res.ok,headers:[...res.headers.entries()]});
      // #endregion
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Impersonation failed")
      }
      const data = await res.json()
      // #region agent log
      console.log('[DBG-d9251f] impersonate-data', {success:data.success,cookies:document.cookie,localStorage_salonAuth:!!localStorage.getItem('salon-auth-user')});
      // #endregion
      if (data.success) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("admin-impersonation-origin", window.location.pathname + window.location.search)
          window.location.href = "/dashboard"
        }
      }
    } catch (e: unknown) {
      // #region agent log
      console.log('[DBG-d9251f] impersonate-error', e instanceof Error ? e.message : String(e));
      // #endregion
      toast({ title: "Error", description: e instanceof Error ? e.message : "Impersonation failed", variant: "destructive" })
    }
  }

  const copyTextToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      try {
        const ta = document.createElement("textarea")
        ta.value = text
        ta.style.position = "fixed"
        ta.style.left = "-9999px"
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand("copy")
        document.body.removeChild(ta)
        return ok
      } catch {
        return false
      }
    }
  }

  const handleResetOwnerPassword = async (business: Business) => {
    if (!confirm(`Reset password for owner of "${business.name}"? A temporary password will be generated.`)) return
    try {
      const res = await fetch(`${API_URL}/admin/businesses/${business._id}/reset-owner-password`, {
        method: "POST",
        headers: adminRequestHeaders({ "Content-Type": "application/json" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Reset failed")
      }
      const tempPassword =
        typeof (data as { data?: { tempPassword?: string } }).data?.tempPassword === "string"
          ? (data as { data: { tempPassword: string } }).data.tempPassword
          : typeof (data as { tempPassword?: string }).tempPassword === "string"
            ? (data as { tempPassword: string }).tempPassword
            : ""
      const emailSent = Boolean((data as { data?: { emailSent?: boolean } }).data?.emailSent)
      if (!(data as { success?: boolean }).success || !tempPassword) {
        toast({
          title: "Error",
          description: (data as { error?: string }).error || "No temporary password returned from the server.",
          variant: "destructive",
        })
        return
      }
      const copied = await copyTextToClipboard(tempPassword)
      const ownerEmailAddr = (business.owner as { email?: string } | null)?.email
      setResetPasswordCopyButtonDone(false)
      setOwnerPasswordResetDialog({
        password: tempPassword,
        businessName: business.name,
        ownerEmail: ownerEmailAddr,
        emailSent,
      })
      const emailPart = emailSent
        ? ownerEmailAddr
          ? `Email sent to ${ownerEmailAddr}.`
          : "Email sent to the owner."
        : ownerEmailAddr
          ? "Email could not be sent (check admin email settings)."
          : "Owner has no email on file; share the password manually."
      toast({
        title: "Password reset",
        description: [copied ? "Temporary password copied to clipboard." : "Use Copy in the dialog to copy the password.", emailPart]
          .filter(Boolean)
          .join(" "),
      })
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Reset failed", variant: "destructive" })
    }
  }

  const viewActivityLogs = (business: Business) => {
    setActivityLogsBusiness(business)
    setIsActivityLogsOpen(true)
  }

  const location = (b: Business) => {
    const a = b.address
    if (!a) return "—"
    return [a.city, a.state].filter(Boolean).join(", ") || "—"
  }

  const ownerName = (b: Business) => b.owner?.name ?? (b.owner as any)?.firstName ? [(b.owner as any).firstName, (b.owner as any).lastName].filter(Boolean).join(" ") : "—"
  const ownerEmail = (b: Business) => (b.owner as any)?.email ?? "—"

  if (loading && !businesses.length) {
    return (
      <div className="space-y-8">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="h-8 w-56 bg-slate-200 rounded-lg animate-pulse mb-2" />
            <div className="h-4 w-96 bg-slate-100 rounded animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 bg-slate-200 rounded-md animate-pulse" />
            <div className="h-9 w-32 bg-slate-200 rounded-md animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="rounded-xl border-slate-200/80 shadow-sm">
              <CardContent className="pt-6">
                <div className="h-4 w-24 bg-slate-100 rounded animate-pulse mb-4" />
                <div className="h-8 w-16 bg-slate-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="rounded-xl border-slate-200/80 shadow-sm">
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-14 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Business Management</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor, manage, and control all salon businesses on the platform.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="border-slate-200">
            <Download className="h-4 w-4 mr-2" />
            Export Businesses
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="border-slate-200">
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh Data
          </Button>
          <Button onClick={() => router.push("/admin/businesses/new")} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4 mr-2" />
            Create Business
          </Button>
        </div>
      </div>

      {/* Platform metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-xl border-slate-200/80 shadow-sm bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Businesses</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{stats?.total ?? totalCount ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-0.5">All registered salons</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200/80 shadow-sm bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Active Businesses</p>
                <p className="text-2xl font-semibold text-emerald-600 mt-1">{stats?.active ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-0.5">Currently active</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200/80 shadow-sm bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Suspended</p>
                <p className="text-2xl font-semibold text-red-600 mt-1">{stats?.suspended ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-0.5">Access disabled</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-slate-200/80 shadow-sm bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Inactive</p>
                <p className="text-2xl font-semibold text-amber-600 mt-1">{stats?.inactive ?? "—"}</p>
                <p className="text-xs text-slate-400 mt-0.5">No login for 7+ days</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and table */}
      <Card className="rounded-xl border-slate-200/80 shadow-sm bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search businesses by name, owner, email, or business code"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="pl-9 border-slate-200"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-full sm:w-[140px] border-slate-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-full sm:w-[140px] border-slate-200">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <Select value={billingFilter} onValueChange={setBillingFilter}>
              <SelectTrigger className="w-full sm:w-[140px] border-slate-200">
                <SelectValue placeholder="Billing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <span className="text-sm text-slate-600">{selectedIds.size} selected</span>
            <Button variant="outline" size="sm" onClick={handleBulkSuspend} className="border-slate-200">
              Suspend selected
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        )}

        <CardContent className="p-0">
          {businesses.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 className="h-14 w-14 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No businesses registered yet</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                {searchTerm || statusFilter !== "all" || planFilter !== "all"
                  ? "Try adjusting your filters."
                  : "Create your first business to get started."}
              </p>
              <Button onClick={() => router.push("/admin/businesses/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Create Business
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={businesses.length > 0 && selectedIds.size === businesses.length}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead className="text-slate-500 font-medium">Business</TableHead>
                      <TableHead className="text-slate-500 font-medium">Owner</TableHead>
                      <TableHead className="text-slate-500 font-medium">Plan</TableHead>
                      <TableHead className="text-slate-500 font-medium">Users</TableHead>
                      <TableHead className="text-slate-500 font-medium">Revenue</TableHead>
                      <TableHead className="text-slate-500 font-medium">Invoices</TableHead>
                      <TableHead className="text-slate-500 font-medium">Status</TableHead>
                      <TableHead className="text-slate-500 font-medium">Last Active</TableHead>
                      <TableHead className="text-slate-500 font-medium">Next Billing</TableHead>
                      <TableHead className="text-slate-500 font-medium">Created</TableHead>
                      <TableHead className="text-slate-500 font-medium text-right w-[72px] sticky right-0 bg-white shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.05)]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {businesses.map((b) => (
                      <TableRow key={b._id} className="border-slate-100">
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(b._id)}
                            onCheckedChange={() => toggleSelect(b._id)}
                            aria-label={`Select ${b.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{b.name}</p>
                            <p className="text-xs text-slate-500">#{b.code}</p>
                            <p className="text-xs text-slate-400">{location(b)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{ownerName(b)}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[180px]">{ownerEmail(b)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {b.plan ? (
                            <div className="space-y-0.5">
                              <Badge variant="secondary" className="font-medium">
                                {b.plan.planName}
                              </Badge>
                              <p className="text-xs text-slate-500 capitalize">{b.plan.billingPeriod}{b.plan.isTrial ? " · Trial" : ""}</p>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono font-medium tabular-nums">
                            {b.usersCount != null ? b.usersCount : "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-emerald-700 tabular-nums whitespace-nowrap">
                          {b.revenue != null ? formatCurrency(b.revenue) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 text-muted-foreground tabular-nums">
                          {b.invoicesCount != null ? `${b.invoicesCount} invoices` : "—"}
                        </TableCell>
                        <TableCell>{getStatusBadge(b.status)}</TableCell>
                        <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                          {formatRelative((b.owner as any)?.lastLoginAt)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            {formatNextBilling(b.nextBillingDate ?? b.plan?.renewalDate ?? null)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">{formatDate(b.createdAt)}</TableCell>
                        <TableCell className="sticky right-0 bg-white text-right w-[72px] shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.05)]">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => router.push(`/admin/businesses/${b._id}`)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Business
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleImpersonate(b)}>
                                <LogIn className="h-4 w-4 mr-2" />
                                Impersonate Login
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/admin/businesses/${b._id}/edit`)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Business
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedBusinessForPlan(b); setIsPlanDialogOpen(true); }}>
                                <CreditCard className="h-4 w-4 mr-2" />
                                Manage Plan
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {b.status === "active" && (
                                <DropdownMenuItem onClick={() => handleStatusChange(b._id, "suspended")} className="text-amber-600">
                                  <Ban className="h-4 w-4 mr-2" />
                                  Suspend Business
                                </DropdownMenuItem>
                              )}
                              {b.status === "suspended" && (
                                <DropdownMenuItem onClick={() => handleStatusChange(b._id, "active")} className="text-emerald-600">
                                  <Users className="h-4 w-4 mr-2" />
                                  Activate Business
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleResetOwnerPassword(b)}>
                                <Key className="h-4 w-4 mr-2" />
                                Reset Owner Password
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => viewActivityLogs(b)}>
                                <FileText className="h-4 w-4 mr-2" />
                                View Activity Logs
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteBusiness(b._id, b.name, b.status)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {b.status === "deleted" ? "Permanently Delete" : "Delete Business"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                  <p className="text-sm text-slate-500">
                    Showing page {currentPage} of {totalPages} · {totalCount} total
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="border-slate-200"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="border-slate-200"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedBusinessForPlan && (
        <PlanEditDialog
          businessId={selectedBusinessForPlan._id}
          businessName={selectedBusinessForPlan.name}
          open={isPlanDialogOpen}
          onOpenChange={setIsPlanDialogOpen}
          onSuccess={() => {
            fetchStats()
            fetchBusinesses()
            setSelectedBusinessForPlan(null)
          }}
        />
      )}

      {activityLogsBusiness && (
        <BusinessActivityLogsDialog
          businessId={activityLogsBusiness._id}
          businessName={activityLogsBusiness.name}
          open={isActivityLogsOpen}
          onOpenChange={(open) => {
            setIsActivityLogsOpen(open)
            if (!open) setActivityLogsBusiness(null)
          }}
        />
      )}

      <Dialog
        open={ownerPasswordResetDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setOwnerPasswordResetDialog(null)
            setResetPasswordCopyButtonDone(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Temporary owner password</DialogTitle>
            <DialogDescription>
              {ownerPasswordResetDialog
                ? `For "${ownerPasswordResetDialog.businessName}". Share this only with the business owner.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {ownerPasswordResetDialog && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  readOnly
                  className="font-mono text-sm"
                  value={ownerPasswordResetDialog.password}
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-[99px] shrink-0"
                  onClick={async () => {
                    const ok = await copyTextToClipboard(ownerPasswordResetDialog.password)
                    if (ok) setResetPasswordCopyButtonDone(true)
                    toast({
                      title: ok ? "Copied" : "Copy failed",
                      description: ok ? "Password copied to clipboard." : "Select the field and copy manually.",
                      variant: ok ? "default" : "destructive",
                    })
                  }}
                >
                  {resetPasswordCopyButtonDone ? (
                    <>
                      <Check className="h-4 w-4 mr-1.5 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1.5" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {ownerPasswordResetDialog.emailSent
                  ? `A message with this password was sent${ownerPasswordResetDialog.ownerEmail ? ` to ${ownerPasswordResetDialog.ownerEmail}` : ""}.`
                  : "No email was delivered. Give this password to the owner through a secure channel."}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                setOwnerPasswordResetDialog(null)
                setResetPasswordCopyButtonDone(false)
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
