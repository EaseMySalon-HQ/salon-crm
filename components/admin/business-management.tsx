"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, Filter, MoreHorizontal, Eye, Edit, Trash2, Building2, Users, Calendar, Shield, Ban, CreditCard } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { PlanEditDialog } from "./plan-edit-dialog"

interface Business {
  _id: string
  name: string
  code: string
  businessType: string
  status: string
  subscription: {
    plan: string
    status: string
  }
  plan?: {
    planId: string
    planName: string
    billingPeriod: string
    renewalDate: string | null
    isTrial: boolean
  }
  owner: {
    name: string
    email: string
  } | null
  createdAt: string
  address: {
    city: string
    state: string
  }
  deletedAt?: string
  deletedBy?: {
    name: string
    email: string
  } | null
}

export function BusinessManagement() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedBusinessForPlan, setSelectedBusinessForPlan] = useState<Business | null>(null)
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  
  // Define API_URL at component level
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

  useEffect(() => {
    fetchBusinesses()
  }, [currentPage, searchTerm, statusFilter])

  const fetchBusinesses = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "10",
        ...(searchTerm && { search: searchTerm }),
        ...(statusFilter !== "all" && { status: statusFilter }),
      })

      // Fetch businesses with plan info
      const [businessesResponse, plansResponse] = await Promise.all([
        fetch(`${API_URL}/admin/businesses?${params}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('admin-auth-token')}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${API_URL}/admin/plans/businesses?${params}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('admin-auth-token')}`,
          }
        })
      ])

      if (businessesResponse.ok && plansResponse.ok) {
        const businessesData = await businessesResponse.json()
        const plansData = await plansResponse.json()
        
        if (businessesData.success && plansData.success) {
          // Merge plan info with businesses
          const businessesWithPlans = businessesData.data.map((business: Business) => {
            const planInfo = plansData.data.businesses.find((b: any) => b._id === business._id)
            return {
              ...business,
              plan: planInfo?.plan || null,
            }
          })
          
          setBusinesses(businessesWithPlans)
          setTotalPages(businessesData.pagination?.totalPages || 1)
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

  const handleManagePlan = (business: Business) => {
    setSelectedBusinessForPlan(business)
    setIsPlanDialogOpen(true)
  }

  const handleStatusChange = async (businessId: string, newStatus: string) => {
    try {
      const response = await fetch(`${API_URL}/admin/businesses/${businessId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin-auth-token')}`
        },
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          toast({
            title: "Success",
            description: `Business ${newStatus} successfully`,
          })
          fetchBusinesses() // Refresh the list
        }
      }
    } catch (error) {
      console.error('Error updating business status:', error)
      toast({
        title: "Error",
        description: "Failed to update business status",
        variant: "destructive",
      })
    }
  }

  const handleDeleteBusiness = async (businessId: string, businessName: string, status: string) => {
    if (!businessId) {
      toast({
        title: "Error",
        description: "Business ID is missing. Cannot delete business.",
        variant: "destructive",
      })
      return
    }

    const isSoftDelete = status !== 'deleted'
    const confirmMessage = isSoftDelete
      ? `Are you sure you want to delete "${businessName}"? This will mark the business as deleted and remove its data, but you can still see it in the list for audit.`
      : `This business is already marked as deleted. Permanently delete "${businessName}"? This will remove it from the list and free the business code for reuse.`

    if (!confirm(confirmMessage)) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/admin/businesses/${businessId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin-auth-token')}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const successMessage = isSoftDelete
          ? `"${businessName}" has been marked as deleted.`
          : `"${businessName}" has been permanently deleted and the code can now be reused.`

        toast({
          title: "Business Deleted",
          description: successMessage,
        })
        // Refresh the businesses list
        fetchBusinesses()
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'inactive':
        return 'bg-gray-100 text-gray-800'
      case 'suspended':
        return 'bg-red-100 text-red-800'
      case 'deleted':
        return 'bg-gray-200 text-gray-600'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Business Management</h1>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Business Management</h1>
          <p className="text-gray-600">Manage all salon businesses on the platform</p>
        </div>
        <Button onClick={() => router.push('/admin/businesses/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Create Business
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Businesses</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{businesses.length}</div>
            <p className="text-xs text-muted-foreground">
              All registered businesses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Businesses</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {businesses.filter(b => b.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended Businesses</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {businesses.filter(b => b.status === 'suspended').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently suspended
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Businesses</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {businesses.filter(b => b.status === 'inactive').length}
            </div>
            <p className="text-xs text-muted-foreground">
              No login for 7+ days (indicator only)
            </p>
          </CardContent>
        </Card>

      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Businesses</CardTitle>
          <CardDescription>
            Manage and monitor all salon businesses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search businesses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Business Table */}
          {businesses.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No businesses found</h3>
              <p className="text-gray-500 mb-4">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Create your first business to get started'
                }
              </p>
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
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businesses.map((business) => (
                  <TableRow key={business._id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{business.name}</div>
                        <div className="text-sm text-gray-500">
                          #{business.code} • {business.businessType}
                        </div>
                        <div className="text-xs text-gray-400">
                          {business.address.city}, {business.address.state}
                        </div>
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
                      {business.plan ? (
                        <div className="space-y-1">
                          <Badge className={
                            business.plan.planId === 'starter' ? 'bg-blue-100 text-blue-800' :
                            business.plan.planId === 'professional' ? 'bg-purple-100 text-purple-800' :
                            'bg-amber-100 text-amber-800'
                          }>
                            {business.plan.planName}
                          </Badge>
                          <div className="text-xs text-gray-500 capitalize">
                            {business.plan.billingPeriod}
                            {business.plan.isTrial && ' • Trial'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">No plan</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge className={getStatusColor(business.status)}>
                          {business.status}
                        </Badge>
                        {business.status === 'deleted' && business.deletedAt && (
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDate(business.deletedAt)}
                            {business.deletedBy && (
                              <span className="ml-1">by {business.deletedBy.name}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="h-4 w-4 mr-1" />
                        {formatDate(business.createdAt)}
                      </div>
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
                            onClick={() => handleManagePlan(business)}
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            Manage Plan
                          </DropdownMenuItem>
                          {business.status === 'active' ? (
                            <DropdownMenuItem 
                              onClick={() => handleStatusChange(business._id, 'suspended')}
                              className="text-orange-600"
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Suspend Business
                            </DropdownMenuItem>
                          ) : business.status === 'suspended' ? (
                            <DropdownMenuItem 
                              onClick={() => handleStatusChange(business._id, 'active')}
                              className="text-green-600"
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Activate Business
                            </DropdownMenuItem>
                          ) : business.status === 'inactive' ? (
                            <DropdownMenuItem disabled className="text-gray-400">
                              <Calendar className="h-4 w-4 mr-2" />
                              Inactive (Auto-reactivates on login)
                            </DropdownMenuItem>
                          ) : null}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center space-x-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Edit Dialog */}
      {selectedBusinessForPlan && (
        <PlanEditDialog
          businessId={selectedBusinessForPlan._id}
          businessName={selectedBusinessForPlan.name}
          open={isPlanDialogOpen}
          onOpenChange={setIsPlanDialogOpen}
          onSuccess={() => {
            fetchBusinesses()
            setSelectedBusinessForPlan(null)
          }}
        />
      )}
    </div>
  )
}
