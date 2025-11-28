"use client"

import { useState, useEffect } from "react"
import { Building2, Users, CreditCard, TrendingUp, Plus, Eye, Edit, MoreHorizontal, Trash2, X } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { getAdminAuthToken } from "@/lib/admin-auth-storage"

interface DashboardStats {
  totalBusinesses: number
  activeBusinesses: number
  totalUsers: number
  recentBusinesses: Array<{
    _id: string
    name: string
    code: string
    status: string
    owner: {
      name: string
      email: string
    } | null
    createdAt: string
  }>
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: string
  status: string
  branchId: string
  businessName?: string
  createdAt: string
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalBusinesses: 0,
    activeBusinesses: 0,
    totalUsers: 0,
    recentBusinesses: []
  })
  const [loading, setLoading] = useState(true)
  const [showUsersModal, setShowUsersModal] = useState(false)
  
  // Define API_URL at component level
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

  const authHeaders = (extra: HeadersInit = {}) => {
    const token = getAdminAuthToken()
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    }
  }
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersSearch, setUsersSearch] = useState("")
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/dashboard/stats`, {
        headers: authHeaders({
          'Content-Type': 'application/json'
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setStats(data.data)
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllUsers = async () => {
    try {
      setUsersLoading(true)
      const token = getAdminAuthToken()
      console.log('Admin token:', token ? 'Present' : 'Missing')
      
      const response = await fetch(`${API_URL}/admin/users`, {
        headers: authHeaders({
          'Content-Type': 'application/json'
        })
      })

      console.log('Users API response status:', response.status)
      const responseText = await response.text()
      console.log('Users API response:', responseText)

      if (response.ok) {
        const data = JSON.parse(responseText)
        if (data.success) {
          console.log('Users data:', data.data)
          setUsers(data.data)
        } else {
          console.error('API returned error:', data.error)
          toast({
            title: "Error",
            description: data.error || "Failed to fetch users",
            variant: "destructive",
          })
        }
      } else {
        console.error('HTTP error:', response.status, responseText)
        toast({
          title: "Error",
          description: `HTTP ${response.status}: ${responseText}`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      })
    } finally {
      setUsersLoading(false)
    }
  }

  const handleUsersCardClick = () => {
    setShowUsersModal(true)
    fetchAllUsers()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'inactive':
        return 'bg-gray-100 text-gray-800'
      case 'suspended':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const handleDeleteBusiness = async (businessId: string, businessName: string, status: string) => {
    const isSoftDelete = status !== 'deleted'
    const confirmMessage = isSoftDelete
      ? `Delete "${businessName}"? This will mark the business as deleted and remove its data, but keep it visible for audit.`
      : `Permanently delete "${businessName}"? This will remove it from the list and free the business code for reuse.`

    if (!confirm(confirmMessage)) {
      return
    }

    try {
        const response = await fetch(`${API_URL}/admin/businesses/${businessId}`, {
          method: 'DELETE',
          headers: authHeaders({
            'Content-Type': 'application/json'
          })
        })

      if (response.ok) {
        toast({
          title: "Business Deleted",
          description: isSoftDelete
            ? `"${businessName}" has been marked as deleted.`
            : `"${businessName}" has been permanently deleted.`,
        })
        // Refresh the dashboard stats
        fetchDashboardStats()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete business')
      }
    } catch (error) {
      console.error('Error deleting business:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete business. Please try again.",
        variant: "destructive",
      })
    }
  }


  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mb-2" />
                <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Businesses</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalBusinesses}</div>
            <p className="text-xs text-muted-foreground">
              All registered businesses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Businesses</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeBusinesses}</div>
            <p className="text-xs text-muted-foreground">
              Currently active
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow duration-200"
          onClick={handleUsersCardClick}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              Across all businesses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push('/admin/businesses/new')}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Business
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Businesses */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Businesses</CardTitle>
              <CardDescription>
                Latest businesses created in the system
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              onClick={() => router.push('/admin/businesses')}
            >
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stats.recentBusinesses.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No businesses yet</h3>
              <p className="text-gray-500 mb-4">Create your first business to get started</p>
              <Button onClick={() => router.push('/admin/businesses/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Business
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentBusinesses.map((business) => (
                  <TableRow key={business._id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{business.name}</div>
                        <div className="text-sm text-gray-500">#{business.code}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {business.owner ? (
                          <>
                            <div className="font-medium">{business.owner.name || 'N/A'}</div>
                            <div className="text-sm text-gray-500">{business.owner.email || 'N/A'}</div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium text-gray-400">Owner Deleted</div>
                            <div className="text-sm text-gray-400">N/A</div>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(business.status)}>
                        {business.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(business.createdAt), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => router.push(`/admin/businesses/${business._id}`)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => router.push(`/admin/businesses/${business._id}/edit`)}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Business
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteBusiness(business._id, business.name, business.status)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {business.status === 'deleted' ? 'Permanently Delete' : 'Delete Business'}
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

      {/* Users Modal */}
      <Dialog open={showUsersModal} onOpenChange={setShowUsersModal}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              All Users ({users.length})
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Search */}
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Search users by name, email, or business..."
                value={usersSearch}
                onChange={(e) => setUsersSearch(e.target.value)}
                className="flex-1"
              />
            </div>

            {/* Users Table */}
            {usersLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Loading users...</div>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                      .filter(user => {
                        if (!usersSearch) return true
                        const searchLower = usersSearch.toLowerCase()
                        return (
                          user.firstName?.toLowerCase().includes(searchLower) ||
                          user.lastName?.toLowerCase().includes(searchLower) ||
                          user.email?.toLowerCase().includes(searchLower) ||
                          user.businessName?.toLowerCase().includes(searchLower)
                        )
                      })
                      .map((user) => (
                        <TableRow key={user._id}>
                          <TableCell className="font-medium">
                            {user.firstName} {user.lastName}
                          </TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={user.status === 'active' ? 'default' : 'destructive'}
                              className={user.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                            >
                              {user.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.businessName || 'No Business'}
                          </TableCell>
                          <TableCell>
                            {format(new Date(user.createdAt), 'MMM dd, yyyy')}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
