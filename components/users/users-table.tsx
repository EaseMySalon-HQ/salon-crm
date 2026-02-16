"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  MoreHorizontal, 
  Plus, 
  Edit, 
  Trash2, 
  Lock, 
  Unlock,
  User,
  Users,
  Crown,
  Eye,
  EyeOff,
  Search,
  HelpCircle
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { UsersAPI } from "@/lib/api"
import { UserForm } from "./user-form"
import { UserAccessControlDialog } from "./user-access-control-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
  mobile?: string
  role: 'admin' | 'manager' | 'staff'
  hasLoginAccess: boolean
  allowAppointmentScheduling: boolean
  isActive: boolean
  permissions: Array<{
    module: string
    feature: string
    enabled: boolean
  }>
  specialties?: string[]
  hourlyRate?: number
  commissionRate?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export function UsersTable() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isAccessControlDialogOpen, setIsAccessControlDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await UsersAPI.getAll({ search: searchTerm })
      setUsers(response.data || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async (userData: any) => {
    try {
      const response = await UsersAPI.create(userData)
      if (response.success) {
        toast({
          title: "Success",
          description: "Staff member added successfully",
        })
        setIsAddDialogOpen(false)
        fetchUsers()
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to add staff member",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error adding user:', error)
      toast({
        title: "Error",
        description: "Failed to add staff member",
        variant: "destructive",
      })
    }
  }

  const handleEditUser = async (userData: any) => {
    if (!selectedUser) return
    
    try {
      const response = await UsersAPI.update(selectedUser._id, userData)
      if (response.success) {
        toast({
          title: "Success",
          description: "Staff member updated successfully",
        })
        setIsEditDialogOpen(false)
        setSelectedUser(null)
        fetchUsers()
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to update staff member",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error updating user:', error)
      toast({
        title: "Error",
        description: "Failed to update staff member",
        variant: "destructive",
      })
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return
    
    try {
      const response = await UsersAPI.delete(selectedUser._id)
      if (response.success) {
        toast({
          title: "Success",
          description: "Staff member deleted successfully",
        })
        setIsDeleteDialogOpen(false)
        setSelectedUser(null)
        fetchUsers()
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to delete staff member",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      toast({
        title: "Error",
        description: "Failed to delete staff member",
        variant: "destructive",
      })
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Crown className="h-4 w-4 text-yellow-600" />
      case 'manager':
        return <Users className="h-4 w-4 text-blue-600" />
      case 'staff':
        return <User className="h-4 w-4 text-green-600" />
      default:
        return <User className="h-4 w-4 text-gray-600" />
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'manager':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'staff':
        return 'bg-green-100 text-green-800 border-green-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const filteredUsers = users.filter(user =>
    (user.firstName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.lastName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.mobile?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Enhanced Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-1">Staff Management</h3>
          <p className="text-sm text-slate-600">Manage your salon staff and their permissions</p>
        </div>
        <Button 
          onClick={() => setIsAddDialogOpen(true)} 
          className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Staff
        </Button>
      </div>

      {/* Enhanced Search Section */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <Input
          placeholder="Search staff by name, email, or mobile..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-4 py-3 border-slate-200 focus:border-blue-500 focus:ring-blue-500 rounded-lg bg-white shadow-sm"
        />
      </div>

      {/* Enhanced Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-200">
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Staff Name</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Mobile</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Email</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Appointment</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Login Access</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1.5 cursor-help">
                        Access Control (Beta)
                        <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs p-3">
                      <p className="text-sm">Configure granular permissions for user roles, pages, and features. This feature is in beta.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-right font-semibold text-slate-700 py-4 px-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="text-slate-600 font-medium">Loading staff members...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                      <Users className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-medium">No staff members found</p>
                    <p className="text-slate-500 text-sm">Try adjusting your search criteria</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user._id} className="hover:bg-slate-50/50 border-b border-slate-100 transition-colors duration-200">
                  <TableCell className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center shadow-sm">
                        <User className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">
                          {user.firstName || 'N/A'} {user.lastName || 'N/A'}
                        </div>
                        <Badge 
                          variant={user.role === 'admin' ? 'destructive' : user.role === 'manager' ? 'default' : 'secondary'} 
                          className="text-xs mt-1.5 px-2 py-1 font-medium"
                        >
                          {user.role === 'admin' ? 'Admin' : user.role === 'manager' ? 'Manager' : 'Staff'}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-slate-700 font-medium">{user.mobile || "-"}</TableCell>
                  <TableCell className="py-4 px-6 text-slate-700">{user.email}</TableCell>
                  <TableCell className="py-4 px-6">
                    <Badge 
                      variant={user.allowAppointmentScheduling ? "default" : "secondary"} 
                      className="text-xs px-3 py-1.5 font-medium"
                    >
                      {user.allowAppointmentScheduling ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 px-6">
                    <Badge 
                      variant={user.hasLoginAccess ? "default" : "secondary"} 
                      className="text-xs px-3 py-1.5 font-medium"
                    >
                      {user.hasLoginAccess ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 px-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user)
                        setIsAccessControlDialogOpen(true)
                      }}
                      disabled={!user.hasLoginAccess}
                      className={`p-2 rounded-lg transition-all duration-200 ${
                        user.hasLoginAccess 
                          ? "hover:bg-blue-50 hover:text-blue-700" 
                          : "cursor-not-allowed opacity-50"
                      }`}
                      title={user.hasLoginAccess ? "Configure granular permissions for user roles, pages, and features (Beta)" : "Login access must be enabled to configure permissions"}
                    >
                      {user.hasLoginAccess ? (
                        <Unlock className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Lock className="h-5 w-5 text-slate-400" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right py-4 px-6">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          className="h-9 w-9 p-0 hover:bg-slate-100 rounded-lg transition-all duration-200"
                        >
                          <MoreHorizontal className="h-4 w-4 text-slate-600" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedUser(user)
                            setIsEditDialogOpen(true)
                          }}
                          className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 cursor-pointer"
                        >
                          <Edit className="h-4 w-4 text-slate-600" />
                          <span className="font-medium">Edit</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedUser(user)
                            setIsAccessControlDialogOpen(true)
                          }}
                          disabled={!user.hasLoginAccess}
                          className={`flex items-center gap-2 px-3 py-2.5 ${
                            !user.hasLoginAccess 
                              ? "text-gray-400 cursor-not-allowed" 
                              : "hover:bg-slate-50 cursor-pointer"
                          }`}
                          title={user.hasLoginAccess ? "Configure granular permissions for user roles, pages, and features (Beta)" : "Login access must be enabled to configure permissions"}
                        >
                          <Eye className="h-4 w-4 text-slate-600" />
                          <span className="font-medium">Access Control (Beta)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedUser(user)
                            setIsDeleteDialogOpen(true)
                          }}
                          className={`flex items-center gap-2 px-3 py-2.5 ${
                            user.role === 'admin' 
                              ? "text-gray-400 cursor-not-allowed" 
                              : "text-red-600 hover:bg-red-50 cursor-pointer"
                          }`}
                          disabled={user.role === 'admin'}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="font-medium">
                            {user.role === 'admin' ? 'Delete (Protected)' : 'Delete'}
                          </span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Enhanced Add User Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-6">
            <DialogTitle className="text-xl font-semibold text-slate-800">Add Staff Member</DialogTitle>
            <DialogDescription className="text-slate-600">
              Create a new staff account with custom permissions and access controls
            </DialogDescription>
          </DialogHeader>
          <UserForm onSubmit={handleAddUser} />
        </DialogContent>
      </Dialog>

      {/* Enhanced Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-6">
            <DialogTitle className="text-xl font-semibold text-slate-800">Edit Staff Member</DialogTitle>
            <DialogDescription className="text-slate-600">
              Update staff information and permissions
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <UserForm 
              user={selectedUser} 
              onSubmit={handleEditUser}
              mode="edit"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Enhanced Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-800">Delete Staff Member</DialogTitle>
            <DialogDescription className="text-slate-600">
              {selectedUser?.role === 'admin' ? (
                <div className="text-red-600 font-medium bg-red-50 p-3 rounded-lg border border-red-200">
                  Cannot delete admin user. Admin account is protected and cannot be removed from the system.
                </div>
              ) : (
                <>
                  Are you sure you want to delete <span className="font-semibold">{selectedUser?.firstName} {selectedUser?.lastName}</span>? 
                  This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="px-6 py-2.5 border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </Button>
            {selectedUser?.role !== 'admin' && (
              <Button
                variant="destructive"
                onClick={handleDeleteUser}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700"
              >
                Delete
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Access Control Dialog */}
      {selectedUser && (
        <UserAccessControlDialog
          user={selectedUser}
          open={isAccessControlDialogOpen}
          onOpenChange={setIsAccessControlDialogOpen}
          onClose={() => {
            setIsAccessControlDialogOpen(false)
            setSelectedUser(null)
          }}
          onUserUpdated={fetchUsers}
        />
      )}
    </div>
  )
} 