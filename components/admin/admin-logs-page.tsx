"use client"

import { useEffect, useState } from "react"
import { useAdminAuth } from "@/lib/admin-auth-context"
import { getAdminAuthToken } from "@/lib/admin-auth-storage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { FileText, Filter, Search, Download, RefreshCw, Loader2, Calendar } from "lucide-react"

type ActivityLog = {
  id: string
  adminId: string
  adminName: string
  adminEmail: string
  action: string
  module: string
  resourceId?: string
  resourceType?: string
  details: any
  ipAddress?: string
  userAgent?: string
  timestamp: string
}

type LogFilters = {
  adminId?: string
  action?: string
  module?: string
  search?: string
  startDate?: string
  endDate?: string
}

type FilterOptions = {
  actions: string[]
  modules: string[]
  admins: Array<{ id: string; name: string; email: string }>
}

const actionColors: Record<string, string> = {
  create: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  login: "bg-purple-100 text-purple-800",
  logout: "bg-gray-100 text-gray-800",
  password_reset: "bg-orange-100 text-orange-800",
  status_change: "bg-yellow-100 text-yellow-800",
  permission_change: "bg-indigo-100 text-indigo-800",
  role_assigned: "bg-cyan-100 text-cyan-800",
  role_removed: "bg-pink-100 text-pink-800",
  export: "bg-teal-100 text-teal-800",
  assign: "bg-amber-100 text-amber-800",
  activate: "bg-emerald-100 text-emerald-800",
  deactivate: "bg-rose-100 text-rose-800"
}

const formatDate = (dateString: string) => {
  try {
    return new Date(dateString).toLocaleString()
  } catch {
    return dateString
  }
}

const formatAction = (action: string) => {
  return action.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export function AdminLogsPage() {
  const { toast } = useToast()
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"
  const { admin: currentAdmin } = useAdminAuth()

  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filters, setFilters] = useState<LogFilters>({})
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ actions: [], modules: [], admins: [] })
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [showFilters, setShowFilters] = useState(false)

  const authHeaders = () => {
    const token = getAdminAuthToken()
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  }

  const fetchLogs = async () => {
    try {
      setIsRefreshing(true)
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== undefined && v !== "")
        )
      })

      const response = await fetch(`${API_URL}/admin/logs?${params}`, {
        headers: authHeaders()
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(errorData.error || `Failed to fetch logs: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      if (data.success) {
        setLogs(data.data || [])
        setPagination(data.pagination || pagination)
      } else {
        throw new Error(data.error || "Failed to fetch logs")
      }
    } catch (error: any) {
      console.error("Failed to fetch logs:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to load activity logs",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  const fetchFilterOptions = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/logs/filters`, {
        headers: authHeaders()
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(errorData.error || `Failed to fetch filter options: ${response.status}`)
      }

      const data = await response.json()
      if (data.success) {
        setFilterOptions(data.data)
      } else {
        throw new Error(data.error || "Failed to fetch filter options")
      }
    } catch (error: any) {
      console.error("Failed to fetch filter options:", error)
      // Don't show toast for filter options - it's not critical
      // Just set empty defaults
      setFilterOptions({ actions: [], modules: [], admins: [] })
    }
  }

  useEffect(() => {
    fetchFilterOptions()
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [pagination.page, filters])

  const handleFilterChange = (key: keyof LogFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }))
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const clearFilters = () => {
    setFilters({})
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const exportLogs = async () => {
    try {
      const params = new URLSearchParams({
        limit: "10000", // Export more logs
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== undefined && v !== "")
        )
      })

      const response = await fetch(`${API_URL}/admin/logs?${params}`, {
        headers: authHeaders()
      })

      if (!response.ok) {
        throw new Error("Failed to export logs")
      }

      const data = await response.json()
      if (data.success) {
        const csv = [
          ["Timestamp", "Admin", "Email", "Action", "Module", "Resource ID", "Details", "IP Address"].join(","),
          ...data.data.map((log: ActivityLog) => [
            formatDate(log.timestamp),
            log.adminName,
            log.adminEmail,
            log.action,
            log.module,
            log.resourceId || "",
            JSON.stringify(log.details).replace(/"/g, '""'),
            log.ipAddress || ""
          ].map(field => `"${field}"`).join(","))
        ].join("\n")

        const blob = new Blob([csv], { type: "text/csv" })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `admin-logs-${new Date().toISOString().split("T")[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)

        toast({
          title: "Success",
          description: "Logs exported successfully"
        })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to export logs",
        variant: "destructive"
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Activity Logs</h1>
          <p className="text-gray-600 mt-1">Audit trail of all admin activities</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button
            variant="outline"
            onClick={exportLogs}
            disabled={isLoading}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            variant="outline"
            onClick={fetchLogs}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Filter activity logs by various criteria</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  placeholder="Search logs..."
                  value={filters.search || ""}
                  onChange={(e) => handleFilterChange("search", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="admin">Admin</Label>
                <Select
                  value={filters.adminId || ""}
                  onValueChange={(value) => handleFilterChange("adminId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All admins" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All admins</SelectItem>
                    {filterOptions.admins.map((admin) => (
                      <SelectItem key={admin.id} value={admin.id}>
                        {admin.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="action">Action</Label>
                <Select
                  value={filters.action || ""}
                  onValueChange={(value) => handleFilterChange("action", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All actions</SelectItem>
                    {filterOptions.actions.map((action) => (
                      <SelectItem key={action} value={action}>
                        {formatAction(action)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="module">Module</Label>
                <Select
                  value={filters.module || ""}
                  onValueChange={(value) => handleFilterChange("module", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All modules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All modules</SelectItem>
                    {filterOptions.modules.map((module) => (
                      <SelectItem key={module} value={module}>
                        {module.charAt(0).toUpperCase() + module.slice(1).replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={filters.startDate || ""}
                  onChange={(e) => handleFilterChange("startDate", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={filters.endDate || ""}
                  onChange={(e) => handleFilterChange("endDate", e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Activity Logs</CardTitle>
          <CardDescription>
            Showing {logs.length} of {pagination.total} logs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No activity logs found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(log.timestamp)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{log.adminName}</div>
                            <div className="text-sm text-gray-500">{log.adminEmail}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={actionColors[log.action] || "bg-gray-100 text-gray-800"}>
                            {formatAction(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {log.module.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.resourceId ? (
                            <div>
                              <div className="text-sm font-mono">{log.resourceId}</div>
                              {log.resourceType && (
                                <div className="text-xs text-gray-500">{log.resourceType}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.details && Object.keys(log.details).length > 0 ? (
                            <div className="text-sm max-w-xs">
                              {JSON.stringify(log.details, null, 2).slice(0, 100)}
                              {JSON.stringify(log.details).length > 100 && "..."}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {log.ipAddress || <span className="text-gray-400">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      disabled={pagination.page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      disabled={pagination.page === pagination.totalPages}
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
    </div>
  )
}

