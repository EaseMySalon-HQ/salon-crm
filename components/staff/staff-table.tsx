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
  Shield,
  CheckCircle2,
  XCircle
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
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
import { StaffAPI, StaffDirectoryAPI, UsersAPI, EmailNotificationsAPI } from "@/lib/api"
import { StaffForm } from "./staff-form"
import { StaffPermissionsModal } from "./staff-permissions-modal"
import { PasswordChangeForm } from "./password-change-form"
import { PasswordSetupForm } from "./password-setup-form"
import { StaffEmailPreferencesModal } from "@/components/settings/staff-email-preferences-modal"
import { useAuth } from "@/lib/auth-context"

interface Staff {
  _id: string
  name: string
  email: string
  phone: string
  role: 'admin' | 'manager' | 'staff'
  specialties: string[]
  salary: number
  commissionProfileIds: string[]
  notes?: string
  isActive: boolean
  hasLoginAccess?: boolean
  allowAppointmentScheduling?: boolean
  permissions?: Array<{
    module: string
    feature: string
    enabled: boolean
  }>
  createdAt: string
  updatedAt: string
  isOwner?: boolean
  source?: 'user' | 'staff' // user = main DB owner (edit via profile); staff = business DB
}

export function StaffTable() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false)
  const [isAccessControlDialogOpen, setIsAccessControlDialogOpen] = useState(false)
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [isPasswordSetupDialogOpen, setIsPasswordSetupDialogOpen] = useState(false)
  const [isEmailPreferencesDialogOpen, setIsEmailPreferencesDialogOpen] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
  const { toast } = useToast()
  const { user } = useAuth()
  const router = useRouter()
  
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager'
  const isOwner = user?.isOwner === true

  useEffect(() => {
    fetchStaff()
  }, [])

  const fetchStaff = async () => {
    try {
      setLoading(true)
      const response = await StaffDirectoryAPI.getAll({ search: searchTerm })
      setStaff(response.data || [])
    } catch (error) {
      console.error('Error fetching staff directory:', error)
      toast({
        title: "Error",
        description: "Failed to fetch staff directory",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    fetchStaff()
  }

  const handleToggleEmailNotifications = async (staff: Staff, enabled: boolean) => {
    if (!isAdminOrManager) {
      toast({
        title: "Unauthorized",
        description: "Only admin/manager can manage email notifications",
        variant: "destructive",
      })
      return
    }

    // Admin users always have email notifications ON and cannot be changed
    if (staff.role === 'admin') {
      toast({
        title: "Cannot Modify",
        description: "Admin email notifications are always enabled and cannot be changed",
        variant: "destructive",
      })
      return
    }

    if (!staff.email) {
      toast({
        title: "Error",
        description: "Staff member must have an email address to enable notifications",
        variant: "destructive",
      })
      return
    }

    if (!staff._id) {
      toast({
        title: "Error",
        description: "Staff ID is missing",
        variant: "destructive",
      })
      return
    }

    try {
      console.log('Toggling email notifications for staff:', staff._id, 'enabled:', enabled)
      const response = await EmailNotificationsAPI.updateStaffPreferences(staff._id, {
        enabled,
        preferences: staff.emailNotifications?.preferences || {
          dailySummary: false,
          weeklySummary: false,
          appointmentAlerts: false,
          receiptAlerts: false,
          exportAlerts: false,
          systemAlerts: false,
          lowInventory: false
        }
      })

      console.log('Email notification update response:', response)

      if (response.success) {
        toast({
          title: "Success",
          description: `Email notifications ${enabled ? 'enabled' : 'disabled'} for ${staff.name}`,
        })
        try {
          await fetchStaff()
        } catch (refetchError) {
          // Toggle succeeded; refetch failure is non-fatal — avoid error toast and unhandled rejection
          console.warn('Staff list refetch after notification toggle failed:', refetchError)
        }
      } else {
        throw new Error(response.error || 'Failed to update email notifications')
      }
    } catch (error: any) {
      console.error('Error toggling email notifications:', error)
      const errorMessage = error.response?.data?.error || error.message || "Failed to update email notifications"
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
      // Re-fetch staff to reset toggle state on error
      fetchStaff()
    }
  }

  const handleToggleAppointmentScheduling = async (staff: Staff, enabled: boolean) => {
    if (!isAdminOrManager) {
      toast({
        title: "Unauthorized",
        description: "Only admin/manager can manage appointment scheduling",
        variant: "destructive",
      })
      return
    }

    // Business owner lives in main User DB; update via UsersAPI with required user fields.
    if (staff.isOwner) {
      try {
        const nameParts = (staff.name || "").trim().split(/\s+/)
        const firstName = nameParts[0] || staff.name || ""
        const lastName = nameParts.slice(1).join(" ") || ""
        const response = await UsersAPI.update(staff._id, {
          firstName,
          lastName,
          email: staff.email || "",
          mobile: staff.phone || (staff as any).mobile || "",
          hasLoginAccess: staff.hasLoginAccess !== false,
          allowAppointmentScheduling: enabled,
        })
        if (response.success) {
          toast({
            title: "Success",
            description: `Appointment scheduling ${enabled ? "enabled" : "disabled"} for ${staff.name}`,
          })
          fetchStaff()
        } else {
          throw new Error(response.error || "Failed to update")
        }
      } catch (error: any) {
        console.error("Error toggling owner appointment scheduling:", error)
        toast({
          title: "Error",
          description: error.response?.data?.error || error.message || "Failed to update appointment scheduling",
          variant: "destructive",
        })
        fetchStaff()
      }
      return
    }

    try {
      // Backend requires name, email, phone, and role for updates
      // So we need to send all existing staff data along with the updated field
      const response = await StaffAPI.update(staff._id, {
        name: staff.name,
        email: staff.email,
        phone: staff.phone || '',
        role: staff.role,
        hasLoginAccess: staff.hasLoginAccess,
        allowAppointmentScheduling: enabled,
        specialties: staff.specialties || [],
        salary: staff.salary || 0,
        commissionProfileIds: staff.commissionProfileIds || [],
        notes: staff.notes || '',
        isActive: staff.isActive !== undefined ? staff.isActive : true
      })

      if (response.success) {
        toast({
          title: "Success",
          description: `Appointment scheduling ${enabled ? 'enabled' : 'disabled'} for ${staff.name}`,
        })
        fetchStaff()
      } else {
        throw new Error(response.error || 'Failed to update appointment scheduling')
      }
    } catch (error: any) {
      console.error('Error toggling appointment scheduling:', error)
      toast({
        title: "Error",
        description: error.response?.data?.error || error.message || "Failed to update appointment scheduling",
        variant: "destructive",
      })
    }
  }

  const handleToggleLoginAccess = async (staff: Staff, enabled: boolean) => {
    if (!isAdminOrManager) {
      toast({
        title: "Unauthorized",
        description: "Only admin/manager can manage login access",
        variant: "destructive",
      })
      return
    }

    // Business owner is in main User DB; StaffAPI.update only works for business Staff collection.
    if (staff.isOwner) {
      toast({
        title: "Cannot Modify",
        description: "Business owner settings are managed in profile or account settings.",
        variant: "destructive",
      })
      return
    }

    // Protect admin role users - their login access cannot be modified
    if (staff.role === 'admin') {
      toast({
        title: "Cannot Modify",
        description: "Admin login access cannot be modified",
        variant: "destructive",
      })
      return
    }

    // If enabling login access and staff doesn't currently have it, show password setup modal
    if (enabled && !staff.hasLoginAccess) {
      setSelectedStaff(staff)
      setIsPasswordSetupDialogOpen(true)
      return
    }

    // If disabling login access, proceed directly
    try {
      // Backend requires name, email, phone, and role for updates
      // So we need to send all existing staff data along with the updated field
      const response = await StaffAPI.update(staff._id, {
        name: staff.name,
        email: staff.email,
        phone: staff.phone || '',
        role: staff.role,
        hasLoginAccess: enabled,
        allowAppointmentScheduling: staff.allowAppointmentScheduling,
        specialties: staff.specialties || [],
        salary: staff.salary || 0,
        commissionProfileIds: staff.commissionProfileIds || [],
        notes: staff.notes || '',
        isActive: staff.isActive !== undefined ? staff.isActive : true
      })

      if (response.success) {
        toast({
          title: "Success",
          description: `Login access ${enabled ? 'enabled' : 'disabled'} for ${staff.name}`,
        })
        fetchStaff()
      } else {
        throw new Error(response.error || 'Failed to update login access')
      }
    } catch (error: any) {
      console.error('Error toggling login access:', error)
      const errorMessage = error.response?.data?.error || error.message || "Failed to update login access"
      
      // If error indicates password is required, show password setup modal
      if (errorMessage.toLowerCase().includes('password') && errorMessage.toLowerCase().includes('required')) {
        setSelectedStaff(staff)
        setIsPasswordSetupDialogOpen(true)
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        })
      }
    }
  }

  const handleAddStaff = () => {
    setSelectedStaff(null)
    setIsAddDialogOpen(true)
  }

  const handleEditStaff = (staff: Staff) => {
    // User owner (main DB) - edit via profile
    if (staff.isOwner && staff.source === 'user') {
      router.push('/profile')
      return
    }
    // Non-owner admin cannot edit other admins
    if (staff.role === 'admin' && !isOwner && staff._id !== user?._id) {
      toast({
        title: "Cannot Edit",
        description: "Only the business owner can edit other admins",
        variant: "destructive",
      })
      return
    }
    setSelectedStaff(staff)
    setIsEditDialogOpen(true)
  }

  const handleDeleteStaff = (staff: Staff) => {
    if (staff.isOwner) {
      toast({
        title: "Cannot Delete",
        description: "Business owner cannot be deleted",
        variant: "destructive",
      })
      return
    }
    // Non-owner admin cannot delete other admins
    if (staff.role === 'admin' && !isOwner) {
      toast({
        title: "Cannot Delete",
        description: "Only the business owner can delete other admins",
        variant: "destructive",
      })
      return
    }
    setSelectedStaff(staff)
    setIsDeleteDialogOpen(true)
  }

  const handleChangePassword = (staff: Staff) => {
    setSelectedStaff(staff)
    setIsPasswordDialogOpen(true)
  }

  const handleToggleStatus = async (staff: Staff) => {
    if (staff.isOwner) {
      toast({
        title: "Cannot Modify",
        description: "Business owner status cannot be modified",
        variant: "destructive",
      })
      return
    }
    
    try {
      await StaffAPI.update(staff._id, { isActive: !staff.isActive })
      toast({
        title: "Success",
        description: `Staff ${staff.isActive ? 'disabled' : 'enabled'} successfully`,
      })
      fetchStaff()
    } catch (error) {
      console.error('Error updating staff status:', error)
      toast({
        title: "Error",
        description: "Failed to update staff status",
        variant: "destructive",
      })
    }
  }


  const handleDeleteConfirm = async () => {
    if (!selectedStaff) return

    try {
      await StaffAPI.delete(selectedStaff._id)
      toast({
        title: "Success",
        description: "Staff deleted successfully",
      })
      fetchStaff()
      setIsDeleteDialogOpen(false)
      setSelectedStaff(null)
    } catch (error) {
      console.error('Error deleting staff:', error)
      toast({
        title: "Error",
        description: "Failed to delete staff",
        variant: "destructive",
      })
    }
  }

  const getRoleIcon = (role: string, isOwner: boolean = false) => {
    if (isOwner) {
      return <Crown className="h-4 w-4 text-purple-600" />
    }
    switch (role) {
      case 'admin':
        return <Crown className="h-4 w-4 text-purple-600" />
      case 'manager':
        return <User className="h-4 w-4 text-blue-600" />
      default:
        return <Users className="h-4 w-4 text-gray-600" />
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'default'
      case 'manager':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search + Add Staff in one row */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search staff by name, email, or role..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={handleAddStaff} className="bg-blue-600 hover:bg-blue-700 shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Add Staff
        </Button>
      </div>

      {/* Staff Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-200">
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Staff Name</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Mobile</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Email</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Appointment</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Login Access</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Email Notifications</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Access Control</TableHead>
              <TableHead className="text-right font-semibold text-slate-700 py-4 px-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
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
              staff.map((member) => (
                <TableRow key={member._id} className={`hover:bg-slate-50/50 border-b border-slate-100 transition-colors duration-200 ${member.isOwner ? "bg-purple-50" : ""}`}>
                  <TableCell className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
                        member.isOwner ? "bg-gradient-to-br from-purple-100 to-indigo-100" : "bg-gradient-to-br from-blue-100 to-indigo-100"
                      }`}>
                        <User className={`h-5 w-5 ${member.isOwner ? "text-purple-600" : "text-blue-600"}`} />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                          {member.name}
                          {member.isOwner && (
                            <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                              Owner
                            </Badge>
                          )}
                        </div>
                        <Badge 
                          variant={member.role === 'admin' ? 'destructive' : member.role === 'manager' ? 'default' : 'secondary'} 
                          className="text-xs mt-1.5 px-2 py-1 font-medium"
                        >
                          {member.role === 'admin' ? 'Admin' : member.role === 'manager' ? 'Manager' : 'Staff'}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-slate-700 font-medium">{member.phone || "-"}</TableCell>
                  <TableCell className="py-4 px-6 text-slate-700">{member.email}</TableCell>
                  <TableCell className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      {isAdminOrManager ? (
                        <Switch
                          checked={member.allowAppointmentScheduling || false}
                          onCheckedChange={(checked) => handleToggleAppointmentScheduling(member, checked)}
                          disabled={member.isOwner && member.role !== 'admin'}
                        />
                      ) : (
                        <Badge 
                          variant={member.allowAppointmentScheduling ? "default" : "secondary"} 
                          className="text-xs px-3 py-1.5 font-medium"
                        >
                          {member.allowAppointmentScheduling ? "Enabled" : "Disabled"}
                        </Badge>
                      )}
                      {member.isOwner && member.role !== 'admin' && (
                        <p className="text-xs text-slate-500">(Protected)</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      {isAdminOrManager ? (
                        <Switch
                          checked={member.hasLoginAccess || false}
                          onCheckedChange={(checked) => handleToggleLoginAccess(member, checked)}
                          disabled={member.role === 'admin'}
                        />
                      ) : (
                        <Badge 
                          variant={member.hasLoginAccess ? "default" : "secondary"} 
                          className="text-xs px-3 py-1.5 font-medium"
                        >
                          {member.hasLoginAccess ? "Enabled" : "Disabled"}
                        </Badge>
                      )}
                      {member.role === 'admin' && (
                        <p className="text-xs text-slate-500">(Protected)</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      {isAdminOrManager ? (
                        <Switch
                          checked={member.role === 'admin' ? true : (member.emailNotifications?.enabled || false)}
                          onCheckedChange={(checked) => handleToggleEmailNotifications(member, checked)}
                          disabled={member.role === 'admin' || !member.email}
                        />
                      ) : (
                        <Badge 
                          variant={member.emailNotifications?.enabled ? "default" : "secondary"} 
                          className="text-xs px-3 py-1.5 font-medium"
                        >
                          {member.emailNotifications?.enabled ? (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              ON
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <XCircle className="h-3 w-3" />
                              OFF
                            </span>
                          )}
                        </Badge>
                      )}
                      <div className="flex flex-col">
                        <p className="text-xs text-slate-500">(Admin Only)</p>
                        {member.role === 'admin' && (
                          <p className="text-xs text-blue-500 mt-0.5">Always ON</p>
                        )}
                        {!member.email && member.role !== 'admin' && (
                          <p className="text-xs text-red-500 mt-0.5">No email</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 px-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedStaff(member)
                        setIsAccessControlDialogOpen(true)
                      }}
                      disabled={!member.hasLoginAccess || (member.isOwner && member.source === 'user')}
                      className={`p-2 rounded-lg transition-all duration-200 ${
                        member.hasLoginAccess && !(member.isOwner && member.source === 'user')
                          ? "hover:bg-blue-50 hover:text-blue-700" 
                          : "cursor-not-allowed opacity-50"
                      }`}
                      title={member.isOwner && member.source === 'user' ? "Business owner permissions cannot be modified" : member.hasLoginAccess ? "Configure access permissions" : "Login access must be enabled to configure permissions"}
                    >
                      {member.hasLoginAccess && !(member.isOwner && member.source === 'user') ? (
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
                          onClick={() => handleEditStaff(member)}
                          disabled={member.role === 'admin' && !isOwner && member._id !== user?._id}
                          className={`flex items-center gap-2 px-3 py-2.5 ${
                            member.role === 'admin' && !isOwner && member._id !== user?._id
                              ? "text-gray-400 cursor-not-allowed"
                              : "hover:bg-slate-50 cursor-pointer"
                          }`}
                          title={member.role === 'admin' && !isOwner && member._id !== user?._id ? "Only the business owner can edit other admins" : undefined}
                        >
                          <Edit className="h-4 w-4 text-slate-600" />
                          <span className="font-medium">{member.isOwner && member.source === 'user' ? "View Profile" : "Edit"}</span>
                        </DropdownMenuItem>
                        {member.isOwner && (
                          <DropdownMenuItem
                            onClick={() => handleChangePassword(member)}
                            className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 cursor-pointer"
                          >
                            <Lock className="h-4 w-4 text-slate-600" />
                            <span className="font-medium">Reset password</span>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedStaff(member)
                            setIsPermissionsDialogOpen(true)
                          }}
                          disabled={member.isOwner && member.source === 'user'}
                          className={`flex items-center gap-2 px-3 py-2.5 ${
                            member.isOwner && member.source === 'user'
                              ? "text-gray-400 cursor-not-allowed" 
                              : "hover:bg-slate-50 cursor-pointer"
                          }`}
                          title={member.isOwner && member.source === 'user' ? "Business owner permissions cannot be modified" : "Configure detailed permissions"}
                        >
                          <Shield className="h-4 w-4 text-slate-600" />
                          <span className="font-medium">Permissions</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedStaff(member)
                            setIsAccessControlDialogOpen(true)
                          }}
                          disabled={!member.hasLoginAccess || (member.isOwner && member.source === 'user')}
                          className={`flex items-center gap-2 px-3 py-2.5 ${
                            !member.hasLoginAccess || (member.isOwner && member.source === 'user')
                              ? "text-gray-400 cursor-not-allowed" 
                              : "hover:bg-slate-50 cursor-pointer"
                          }`}
                          title={member.isOwner && member.source === 'user' ? "Business owner permissions cannot be modified" : member.hasLoginAccess ? "Configure access permissions" : "Login access must be enabled to configure permissions"}
                        >
                          <Eye className="h-4 w-4 text-slate-600" />
                          <span className="font-medium">Access Control</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteStaff(member)}
                          disabled={member.isOwner || (member.role === 'admin' && !isOwner)}
                          className={`flex items-center gap-2 px-3 py-2.5 ${
                            member.isOwner || (member.role === 'admin' && !isOwner)
                              ? "text-gray-400 cursor-not-allowed" 
                              : "text-red-600 hover:bg-red-50 cursor-pointer"
                          }`}
                          title={member.role === 'admin' && !isOwner ? "Only the business owner can delete other admins" : undefined}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="font-medium">
                            {member.isOwner ? 'Delete (Protected)' : member.role === 'admin' && !isOwner ? 'Delete (Owner Only)' : 'Delete'}
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

      {/* Add/Edit Staff Dialog */}
      <Dialog open={isAddDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
        setIsAddDialogOpen(open)
        setIsEditDialogOpen(open)
        if (!open) setSelectedStaff(null)
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {selectedStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
            </DialogTitle>
            <DialogDescription>
              {selectedStaff ? 'Update staff member information' : 'Add a new staff member to your team'}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto min-h-0 flex-1 pr-2 -mr-2">
          <StaffForm 
            staff={selectedStaff}
            onSuccess={() => {
              fetchStaff()
              setIsAddDialogOpen(false)
              setIsEditDialogOpen(false)
              setSelectedStaff(null)
            }}
            onResetPassword={selectedStaff?.hasLoginAccess ? () => {
              setIsAddDialogOpen(false)
              setIsEditDialogOpen(false)
              setIsPasswordDialogOpen(true)
            } : undefined}
          />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Staff Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedStaff?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Access Control Dialog */}
      <Dialog open={isAccessControlDialogOpen} onOpenChange={setIsAccessControlDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-6">
            <DialogTitle className="text-xl font-semibold text-slate-800">Access Control</DialogTitle>
            <DialogDescription className="text-slate-600">
              Configure permissions and access controls for {selectedStaff?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Access Controls Section */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-slate-800">Access Controls</h4>
              <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
                {/* Login Access */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-slate-700 mb-1">Login Access</label>
                    <p className="text-xs text-slate-500">
                      {selectedStaff?.role === 'admin' 
                        ? "Admin login access cannot be modified" 
                        : "Allow this staff member to log in to the system"}
                    </p>
                  </div>
                  <Switch
                    checked={selectedStaff?.hasLoginAccess || false}
                    onCheckedChange={(checked) => {
                      if (selectedStaff) {
                        handleToggleLoginAccess(selectedStaff, checked)
                      }
                    }}
                    disabled={selectedStaff?.role === 'admin' || selectedStaff?.isOwner}
                  />
                </div>

                {/* Appointment Scheduling */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-slate-700 mb-1">Appointment Scheduling</label>
                    <p className="text-xs text-slate-500">
                      {selectedStaff?.isOwner && selectedStaff?.role !== 'admin'
                        ? "Business owner appointment scheduling cannot be modified"
                        : "Allow this staff member to schedule appointments"}
                    </p>
                  </div>
                  <Switch
                    checked={selectedStaff?.allowAppointmentScheduling || false}
                    onCheckedChange={(checked) => {
                      if (selectedStaff) {
                        handleToggleAppointmentScheduling(selectedStaff, checked)
                      }
                    }}
                    disabled={(selectedStaff?.isOwner && selectedStaff?.role !== 'admin')}
                  />
                </div>

                {/* Email Notifications */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-slate-700 mb-1">Email Notifications</label>
                    <p className="text-xs text-slate-500">
                      {selectedStaff?.role === 'admin'
                        ? "Admin email notifications are always enabled"
                        : !selectedStaff?.email
                        ? "Email address required to enable notifications"
                        : "Enable email notifications for this staff member"}
                    </p>
                  </div>
                  <Switch
                    checked={selectedStaff?.role === 'admin' ? true : (selectedStaff?.emailNotifications?.enabled || false)}
                    onCheckedChange={(checked) => {
                      if (selectedStaff) {
                        handleToggleEmailNotifications(selectedStaff, checked)
                      }
                    }}
                    disabled={selectedStaff?.role === 'admin' || !selectedStaff?.email}
                  />
                </div>
              </div>
            </div>
            
            {/* Permissions - Edit button opens full modal */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <Button 
                variant="outline" 
                onClick={() => setIsAccessControlDialogOpen(false)}
              >
                Close
              </Button>
              <Button 
                onClick={() => {
                  if (selectedStaff) {
                    setIsAccessControlDialogOpen(false)
                    setSelectedStaff(selectedStaff)
                    setIsPermissionsDialogOpen(true)
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Edit Permissions
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Staff Permissions Modal */}
      <StaffPermissionsModal
        isOpen={isPermissionsDialogOpen}
        onClose={() => setIsPermissionsDialogOpen(false)}
        staff={selectedStaff}
        onUpdate={fetchStaff}
      />

      {/* Password Change Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {selectedStaff?.name}
            </DialogDescription>
          </DialogHeader>
          <PasswordChangeForm 
            staff={selectedStaff}
            onSuccess={() => {
              setIsPasswordDialogOpen(false)
              toast({
                title: "Success",
                description: "Password changed successfully",
              })
            }}
            onCancel={() => setIsPasswordDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Password Setup Dialog */}
      <Dialog open={isPasswordSetupDialogOpen} onOpenChange={setIsPasswordSetupDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Up Password</DialogTitle>
            <DialogDescription>
              Set up a password to enable login access for {selectedStaff?.name}
            </DialogDescription>
          </DialogHeader>
          <PasswordSetupForm 
            staff={selectedStaff}
            onSuccess={() => {
              setIsPasswordSetupDialogOpen(false)
              setSelectedStaff(null)
              fetchStaff()
            }}
            onCancel={() => {
              setIsPasswordSetupDialogOpen(false)
              setSelectedStaff(null)
              // Reset the toggle since password setup was cancelled
              fetchStaff()
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Email Preferences Modal */}
      {selectedStaff && (
        <StaffEmailPreferencesModal
          isOpen={isEmailPreferencesDialogOpen}
          onClose={() => {
            setIsEmailPreferencesDialogOpen(false)
            setSelectedStaff(null)
          }}
          staff={{
            _id: selectedStaff._id,
            name: selectedStaff.name,
            email: selectedStaff.email,
            role: selectedStaff.role,
            hasLoginAccess: selectedStaff.hasLoginAccess || false,
            emailNotifications: selectedStaff.emailNotifications
          }}
          onUpdate={() => {
            fetchStaff()
            setIsEmailPreferencesDialogOpen(false)
            toast({
              title: "Success",
              description: "Email notification preferences updated",
            })
          }}
        />
      )}
    </div>
  )
}
