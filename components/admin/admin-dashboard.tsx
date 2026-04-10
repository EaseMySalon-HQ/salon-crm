"use client"

import { useState, useEffect } from "react"
import {
  Building2,
  Users,
  Activity,
  TrendingUp,
  Plus,
  Eye,
  Edit,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
  Loader2,
  ArrowUpRight,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"
import { cn } from "@/lib/utils"

interface DashboardStats {
  totalBusinesses: number
  activeBusinesses: number
  totalUsers: number
  totalRevenue?: number
  recentBusinesses: Array<{
    _id: string
    name: string
    code: string
    status: string
    owner: { name: string; email: string } | null
    createdAt: string
  }>
  systemStatus?: {
    api: string
    database: string
    uptime: number
  }
}

interface ActivityLog {
  id: string
  adminName: string
  action: string
  module: string
  details?: { description?: string }
  timestamp: string
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: string
  status: string
  businessName?: string
  createdAt: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)
  const [showUsersModal, setShowUsersModal] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersSearch, setUsersSearch] = useState("")
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  useEffect(() => {
    fetchRecentActivity()
  }, [])

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/dashboard/stats`, { headers: adminRequestHeaders({ "Content-Type": "application/json" }) })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setStats(data.data)
      }
    } catch (e) {
      console.error("Dashboard stats:", e)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentActivity = async () => {
    setActivityLoading(true)
    try {
      const res = await fetch(`${API_URL}/admin/logs?limit=8&sortBy=timestamp&sortOrder=desc`, { headers: adminRequestHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) setActivity(data.data)
      }
    } catch (e) {
      console.error("Activity logs:", e)
    } finally {
      setActivityLoading(false)
    }
  }

  const fetchAllUsers = async () => {
    setUsersLoading(true)
    try {
      const res = await fetch(`${API_URL}/admin/users`, { headers: adminRequestHeaders({ "Content-Type": "application/json" }) })
      const text = await res.text()
      if (res.ok) {
        const data = JSON.parse(text)
        if (data.success) setUsers(data.data || [])
        else toast({ title: "Error", description: data.error || "Failed to fetch users", variant: "destructive" })
      } else toast({ title: "Error", description: `Failed to load users`, variant: "destructive" })
    } catch (e) {
      toast({ title: "Error", description: "Failed to fetch users", variant: "destructive" })
    } finally {
      setUsersLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-emerald-500/10 text-emerald-700 border-emerald-200"
      case "inactive": return "bg-slate-100 text-slate-600 border-slate-200"
      case "suspended": return "bg-amber-500/10 text-amber-700 border-amber-200"
      case "deleted": return "bg-red-500/10 text-red-700 border-red-200"
      default: return "bg-slate-100 text-slate-600 border-slate-200"
    }
  }

  const handleDeleteBusiness = async (businessId: string, businessName: string, status: string) => {
    const isSoft = status !== "deleted"
    if (!confirm(isSoft ? `Delete "${businessName}"? It will be marked as deleted.` : `Permanently delete "${businessName}"?`)) return
    try {
      const res = await fetch(`${API_URL}/admin/businesses/${businessId}`, { method: "DELETE", headers: adminRequestHeaders({ "Content-Type": "application/json" }) })
      if (res.ok) {
        toast({ title: "Business deleted", description: isSoft ? `"${businessName}" marked as deleted.` : `"${businessName}" permanently deleted.` })
        fetchDashboardStats()
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Delete failed")
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to delete.", variant: "destructive" })
    }
  }

  const handleUsersCardClick = () => {
    setShowUsersModal(true)
    fetchAllUsers()
  }

  const formatAction = (action: string, module: string) => {
    if (action && module) return `${action} · ${module}`
    return action || module || "Activity"
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-64 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-slate-200/80 shadow-sm">
              <CardContent className="pt-6">
                <div className="h-4 w-24 bg-slate-100 rounded animate-pulse mb-4" />
                <div className="h-8 w-16 bg-slate-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="border-slate-200/80 shadow-sm"><CardContent className="pt-6 h-64 bg-slate-50 rounded-lg animate-pulse" /></Card>
          <Card className="border-slate-200/80 shadow-sm"><CardContent className="pt-6 h-64 bg-slate-50 rounded-lg animate-pulse" /></Card>
        </div>
      </div>
    )
  }

  const s = stats || {
    totalBusinesses: 0,
    activeBusinesses: 0,
    totalUsers: 0,
    totalRevenue: 0,
    recentBusinesses: [],
    systemStatus: { api: "operational", database: "operational", uptime: 99.9 },
  }
  const status = s.systemStatus || { api: "operational", database: "operational", uptime: 99.9 }

  return (
    <div className="space-y-8">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Platform overview and key metrics</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total businesses</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{s.totalBusinesses}</p>
                <p className="text-xs text-slate-400 mt-0.5">All registered</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Revenue</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">
                  {typeof s.totalRevenue === "number" && s.totalRevenue > 0 ? `₹${s.totalRevenue.toLocaleString()}` : "—"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">MRR / total</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow bg-white cursor-pointer"
          onClick={handleUsersCardClick}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Users</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{s.totalUsers}</p>
                <p className="text-xs text-slate-400 mt-0.5">Across businesses</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow bg-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Uptime</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{status.uptime ?? "99.9"}%</p>
                <p className="text-xs text-slate-400 mt-0.5">Last 30 days</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System status + Recent activity */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* System status */}
        <Card className="border-slate-200/80 shadow-sm bg-white lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">System status</CardTitle>
            <CardDescription className="text-xs">Core services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">API</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {status.api === "operational" ? "Operational" : status.api}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Database</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {status.database === "operational" ? "Operational" : status.database}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-600">Uptime</span>
              <span className="text-xs font-medium text-slate-700">{status.uptime ?? "99.9"}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="border-slate-200/80 shadow-sm bg-white lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-medium">Recent activity</CardTitle>
              <CardDescription className="text-xs">Latest admin actions</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => router.push("/admin/logs")}>
              View all
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : activity.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">No recent activity</div>
            ) : (
              <ul className="space-y-0 divide-y divide-slate-100">
                {activity.slice(0, 6).map((log) => (
                  <li key={log.id} className="py-3 first:pt-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {formatAction(log.action, log.module)}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{log.adminName}</p>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">
                        {format(new Date(log.timestamp), "MMM d, HH:mm")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent businesses */}
      <Card className="border-slate-200/80 shadow-sm bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-medium">Recent businesses</CardTitle>
            <CardDescription className="text-xs">Latest registered businesses</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="border-slate-200" onClick={() => router.push("/admin/businesses")}>
            View all
            <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {s.recentBusinesses.length === 0 ? (
            <div className="py-12 text-center">
              <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">No businesses yet</p>
              <p className="text-xs text-slate-500 mb-4">Create your first business to get started</p>
              <Button size="sm" onClick={() => router.push("/admin/businesses/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Create business
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="text-slate-500 font-medium">Business</TableHead>
                  <TableHead className="text-slate-500 font-medium">Owner</TableHead>
                  <TableHead className="text-slate-500 font-medium">Status</TableHead>
                  <TableHead className="text-slate-500 font-medium">Created</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.recentBusinesses.map((b) => (
                  <TableRow key={b._id} className="border-slate-100">
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{b.name}</p>
                        <p className="text-xs text-slate-500">#{b.code}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm text-slate-700">{b.owner?.name ?? "—"}</p>
                        <p className="text-xs text-slate-500">{b.owner?.email ?? "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs font-medium", getStatusColor(b.status))}>
                        {b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{format(new Date(b.createdAt), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => router.push(`/admin/businesses/${b._id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/admin/businesses/${b._id}/edit`)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => handleDeleteBusiness(b._id, b.name, b.status)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {b.status === "deleted" ? "Permanently delete" : "Delete"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Users modal */}
      <Dialog open={showUsersModal} onOpenChange={setShowUsersModal}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-left">
              <Users className="h-5 w-5 text-slate-600" />
              All users ({users.length})
            </DialogTitle>
            <DialogDescription>
              Search and browse all platform users. Filter by name, email, business, or role.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search by name, email, or business..."
            value={usersSearch}
            onChange={(e) => setUsersSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="flex-1 overflow-auto border rounded-lg">
            {usersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100">
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users
                    .filter((u) => {
                      if (!usersSearch) return true
                      const q = usersSearch.toLowerCase()
                      return (
                        [u.firstName, u.lastName, u.email, u.businessName].some((v) =>
                          String(v || "").toLowerCase().includes(q)
                        )
                      )
                    })
                    .map((u) => (
                      <TableRow key={u._id} className="border-slate-100">
                        <TableCell className="font-medium">{u.firstName} {u.lastName}</TableCell>
                        <TableCell className="text-slate-600">{u.email}</TableCell>
                        <TableCell><Badge variant="secondary">{u.role}</Badge></TableCell>
                        <TableCell><Badge className={u.status === "active" ? "bg-emerald-500/10 text-emerald-700" : ""}>{u.status}</Badge></TableCell>
                        <TableCell className="text-slate-600">{u.businessName || "—"}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{format(new Date(u.createdAt), "MMM d, yyyy")}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
