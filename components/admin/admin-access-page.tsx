"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAdminAuth } from "@/lib/admin-auth-context"
import { adminRequestHeaders } from "@/lib/admin-request-headers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { AlertTriangle, CheckCircle2, Edit, KeyRound, Loader2, RefreshCcw, Shield, Trash2, UserPlus, Users, Key, Settings2 } from "lucide-react"

type Permission = {
  module: string
  actions: string[]
}

type PermissionOverrides = {
  add: Permission[]
  remove: Permission[]
}

type AccessRole = {
  id: string
  key: string
  name: string
  description: string
  color: string
  isSystem: boolean
  permissions: Permission[]
  assignedAdmins: number
}

type AdminUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  roleKey: string
  roleName: string
  roleId?: string
  isActive: boolean
  lastLogin?: string
  permissions: Permission[]
  permissionOverrides?: PermissionOverrides
  createdAt: string
  updatedAt: string
  isCurrentUser?: boolean
}

type AccessModule = {
  id: string
  label: string
  description?: string
  actions: string[]
}

type OverviewResponse = {
  modules: AccessModule[]
  roles: AccessRole[]
  admins: AdminUser[]
  stats: {
    totalAdmins: number
    activeAdmins: number
    superAdmins: number
  }
  creationRules: Record<string, unknown>
}

type RoleFormState = {
  name: string
  description: string
  color: string
  permissions: Record<string, string[]>
}

type AdminFormState = {
  firstName: string
  lastName: string
  email: string
  password: string
  roleId: string
}

const defaultStats = {
  totalAdmins: 0,
  activeAdmins: 0,
  superAdmins: 0
}

const getDefaultRoleForm = (modules: AccessModule[]): RoleFormState => {
  const permissions: Record<string, string[]> = {}
  modules.forEach((module) => {
    permissions[module.id] = []
  })
  return {
    name: "",
    description: "",
    color: "gray",
    permissions
  }
}

const defaultAdminForm: AdminFormState = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  roleId: ""
}

const emptyOverrides: PermissionOverrides = {
  add: [],
  remove: []
}

const removeActionFromList = (list: Permission[], moduleId: string, action: string): Permission[] => {
  return list.reduce<Permission[]>((acc, permission) => {
    if (permission.module !== moduleId) {
      acc.push(permission)
      return acc
    }
    const remaining = permission.actions.filter((item) => item !== action)
    if (remaining.length) {
      acc.push({ module: permission.module, actions: remaining })
    }
    return acc
  }, [])
}

const addActionToList = (list: Permission[], moduleId: string, action: string): Permission[] => {
  let found = false
  const updated = list.map((permission) => {
    if (permission.module !== moduleId) {
      return permission
    }
    found = true
    if (permission.actions.includes(action)) {
      return permission
    }
    return { module: permission.module, actions: [...permission.actions, action] }
  })

  if (!found) {
    updated.push({ module: moduleId, actions: [action] })
  }

  return updated
}

const permissionExists = (list: Permission[], moduleId: string, action: string) => {
  return list.some((permission) => permission.module === moduleId && permission.actions.includes(action))
}

const formatDate = (value?: string) => {
  if (!value) return "Never"
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

// Helper function to check if admin has permission
const hasPermission = (admin: AdminUser | null | undefined, module: string, action: string): boolean => {
  if (!admin) return false
  
  // Super admin has all permissions
  if (admin.roleKey === 'super_admin') return true
  
  // Check if admin has the required permission
  return admin.permissions?.some(
    (permission) => permission.module === module && permission.actions?.includes(action)
  ) ?? false
}

export function AdminAccessPage() {
  const { toast } = useToast()
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"
  const { admin: currentAdmin } = useAdminAuth()

  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [roleForm, setRoleForm] = useState<RoleFormState>(getDefaultRoleForm([]))
  const [editingRole, setEditingRole] = useState<AccessRole | null>(null)
  const [savingRole, setSavingRole] = useState(false)

  const [adminDialogOpen, setAdminDialogOpen] = useState(false)
  const [adminForm, setAdminForm] = useState<AdminFormState>(defaultAdminForm)
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null)
  const [savingAdmin, setSavingAdmin] = useState(false)

  const [passwordResetDialogOpen, setPasswordResetDialogOpen] = useState(false)
  const [resettingAdmin, setResettingAdmin] = useState<AdminUser | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resettingPassword, setResettingPassword] = useState(false)
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false)
  const [permissionDialogAdmin, setPermissionDialogAdmin] = useState<AdminUser | null>(null)
  const [permissionOverridesState, setPermissionOverridesState] = useState<PermissionOverrides>(emptyOverrides)
  const [savingOverrides, setSavingOverrides] = useState(false)
  useEffect(() => {
    if (!permissionDialogOpen) {
      setPermissionDialogAdmin(null)
      setPermissionOverridesState(emptyOverrides)
      setSavingOverrides(false)
    }
  }, [permissionDialogOpen])

  const modules = overview?.modules ?? []
  const roles = overview?.roles ?? []
  const adminsFromOverview = overview?.admins ?? []
  const stats = overview?.stats ?? defaultStats
  const moduleActionsLookup = useMemo(() => {
    const map = new Map<string, Set<string>>()
    modules.forEach((module) => {
      map.set(module.id, new Set(module.actions))
    })
    return map
  }, [modules])
  const roleLookup = useMemo(() => {
    const map = new Map<string, AccessRole>()
    roles.forEach((role) => {
      map.set(role.key, role)
      map.set(role.id, role)
    })
    return map
  }, [roles])
  const sanitizeOverrides = useCallback(
    (overrides: PermissionOverrides): PermissionOverrides => {
      const sanitizeList = (list: Permission[]) => {
        const map = new Map<string, Set<string>>()
        list.forEach((permission) => {
          const actionsSet = moduleActionsLookup.get(permission.module)
          if (!actionsSet) {
            return
          }
          const validActions = permission.actions.filter((action) => actionsSet.has(action))
          if (!validActions.length) {
            return
          }
          if (!map.has(permission.module)) {
            map.set(permission.module, new Set())
          }
          validActions.forEach((action) => map.get(permission.module)!.add(action))
        })
        return Array.from(map.entries()).map(([module, actions]) => ({
          module,
          actions: Array.from(actions).sort()
        }))
      }
      return {
        add: sanitizeList(overrides.add),
        remove: sanitizeList(overrides.remove)
      }
    },
    [moduleActionsLookup]
  )
  const getRolePermissions = useCallback(
    (admin: AdminUser | null | undefined) => {
      if (!admin) return []
      const role =
        roleLookup.get(admin.roleId ?? "") ||
        roleLookup.get(admin.roleKey) ||
        null
      return role?.permissions || []
    },
    [roleLookup]
  )
  const updateOverrideState = useCallback(
    (updater: (prev: PermissionOverrides) => PermissionOverrides) => {
      setPermissionOverridesState((prev) => sanitizeOverrides(updater(prev)))
    },
    [sanitizeOverrides]
  )

  const roleOptions = useMemo(
    () =>
      roles.map((role) => ({
        value: role.id,
        label: role.name,
        badge: role.isSystem ? "System" : undefined
      })),
    [roles]
  )

  const adminsWithCurrent: AdminUser[] = useMemo(() => {
    if (!currentAdmin) {
      return adminsFromOverview
    }

    const existing = adminsFromOverview.find(
      (item) =>
        item.id === currentAdmin.id ||
        (item.email?.toLowerCase() === currentAdmin.email?.toLowerCase())
    )

    if (existing) {
      return adminsFromOverview.map((item) =>
        item.id === existing.id ? { ...item, isCurrentUser: true } : item
      )
    }

    const [firstName, ...rest] = (currentAdmin.name || "").split(" ")
    // Convert permissions to the expected format
    const permissions: Permission[] = Array.isArray(currentAdmin.permissions) 
      ? currentAdmin.permissions.map((p: any) => ({
          module: p.module || '',
          actions: Array.isArray(p.actions) ? p.actions : (Array.isArray(p) ? [] : [])
        }))
      : []

    const fallbackAdmin: AdminUser & { isCurrentUser?: boolean } = {
      id: currentAdmin.id,
      firstName: firstName || currentAdmin.name || "Current",
      lastName: rest.join(" "),
      email: currentAdmin.email,
      roleKey: currentAdmin.role,
      roleName: currentAdmin.role,
      roleId: undefined,
      isActive: true,
      lastLogin: new Date().toISOString(),
      permissions,
      permissionOverrides: emptyOverrides,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isCurrentUser: true
    }

    return [fallbackAdmin, ...adminsFromOverview]
  }, [adminsFromOverview, currentAdmin])

  // Get current admin user from the admins list for permission checking
  const currentAdminUser = useMemo(() => {
    return adminsWithCurrent.find(a => a.isCurrentUser) || null
  }, [adminsWithCurrent])

  const fetchOverview = async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch(`${API_URL}/admin/access/overview`, {
        headers: adminRequestHeaders({ "Content-Type": "application/json" })
      })
      if (!response.ok) {
        throw new Error("Failed to load overview")
      }
      const payload = await response.json()
      setOverview(payload.data)
      setRoleForm(getDefaultRoleForm(payload.data.modules))
    } catch (error) {
      console.error(error)
      toast({
        title: "Unable to load access data",
        description: "Please try refreshing the page.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openRoleDialog = (role?: AccessRole) => {
    if (!overview) return
    if (role) {
      const permissions: Record<string, string[]> = {}
      modules.forEach((module) => {
        const modulePermission = role.permissions.find((perm) => perm.module === module.id)
        permissions[module.id] = modulePermission ? [...modulePermission.actions] : []
      })
      setRoleForm({
        name: role.name,
        description: role.description,
        color: role.color || "gray",
        permissions
      })
      setEditingRole(role)
    } else {
      setRoleForm(getDefaultRoleForm(modules))
      setEditingRole(null)
    }
    setRoleDialogOpen(true)
  }

  const togglePermission = (moduleId: string, action: string) => {
    setRoleForm((prev) => {
      const current = prev.permissions[moduleId] || []
      const exists = current.includes(action)
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [moduleId]: exists ? current.filter((item) => item !== action) : [...current, action]
        }
      }
    })
  }

  const saveRole = async () => {
    if (!overview) return
    const selectedPermissions = Object.entries(roleForm.permissions)
      .filter(([, actions]) => actions.length)
      .map(([module, actions]) => ({ module, actions }))

    if (!roleForm.name.trim()) {
      toast({
        title: "Role name required",
        description: "Please provide a name for this role."
      })
      return
    }

    if (!selectedPermissions.length) {
      toast({
        title: "Select permissions",
        description: "Choose at least one permission for the role."
      })
      return
    }

    setSavingRole(true)
    try {
      const payload = {
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
        color: roleForm.color,
        permissions: selectedPermissions
      }

      const response = await fetch(
        editingRole ? `${API_URL}/admin/access/roles/${editingRole.id}` : `${API_URL}/admin/access/roles`,
        {
          method: editingRole ? "PUT" : "POST",
          headers: adminRequestHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload)
        }
      )

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save role")
      }

      toast({
        title: editingRole ? "Role updated" : "Role created",
        description: "Changes have been saved successfully."
      })
      setRoleDialogOpen(false)
      await fetchOverview()
    } catch (error) {
      console.error(error)
      toast({
        title: "Unable to save role",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive"
      })
    } finally {
      setSavingRole(false)
    }
  }

  const deleteRole = async (role: AccessRole) => {
    if (role.isSystem) return
    if (role.assignedAdmins > 0) {
      toast({
        title: "Role in use",
        description: "Reassign admins before deleting this role."
      })
      return
    }

    const confirmed = confirm(`Delete role "${role.name}"? This cannot be undone.`)
    if (!confirmed) return

    try {
      const response = await fetch(`${API_URL}/admin/access/roles/${role.id}`, {
        method: "DELETE",
        headers: adminRequestHeaders({ "Content-Type": "application/json" })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete role")
      }

      toast({
        title: "Role deleted",
        description: `${role.name} has been removed.`
      })
      await fetchOverview()
    } catch (error) {
      console.error(error)
      toast({
        title: "Unable to delete role",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive"
      })
    }
  }

  const openAdminDialog = (admin?: AdminUser) => {
    const isCurrentUserSuperAdmin = currentAdminUser?.roleKey === 'super_admin'

    // Prevent non-super admins from editing super admin accounts
    if (
      admin &&
      admin.roleKey === 'super_admin' &&
      !isCurrentUserSuperAdmin &&
      !admin.isCurrentUser
    ) {
      toast({
        title: "Action not allowed",
        description: "Only super admins can modify other super admin accounts.",
        variant: "destructive"
      })
      return
    }

    if (admin) {
      setAdminForm({
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        password: "",
        roleId: admin.roleId || ""
      })
      setEditingAdmin(admin)
    } else {
      setAdminForm(defaultAdminForm)
      setEditingAdmin(null)
    }
    setAdminDialogOpen(true)
  }

  const saveAdmin = async () => {
    if (!adminForm.firstName.trim() || !adminForm.lastName.trim() || !adminForm.email.trim()) {
      toast({
        title: "Missing details",
        description: "Please fill in all required fields."
      })
      return
    }

    if (!adminForm.roleId) {
      toast({
        title: "Select a role",
        description: "Assign a role to this admin."
      })
      return
    }

    if (!editingAdmin && !adminForm.password.trim()) {
      toast({
        title: "Password required",
        description: "Set an initial password for the admin user."
      })
      return
    }

    setSavingAdmin(true)
    try {
      const payload: Record<string, string> = {
        firstName: adminForm.firstName.trim(),
        lastName: adminForm.lastName.trim(),
        email: adminForm.email.trim().toLowerCase(),
        roleId: adminForm.roleId
      }

      if (!editingAdmin) {
        payload.password = adminForm.password.trim()
      }

      const response = await fetch(
        editingAdmin ? `${API_URL}/admin/access/users/${editingAdmin.id}` : `${API_URL}/admin/access/users`,
        {
          method: editingAdmin ? "PUT" : "POST",
          headers: adminRequestHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload)
        }
      )

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save admin user")
      }

      toast({
        title: editingAdmin ? "Admin updated" : "Admin created",
        description: "Changes have been saved successfully."
      })
      setAdminDialogOpen(false)
      await fetchOverview()
    } catch (error) {
      console.error(error)
      toast({
        title: "Unable to save admin",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive"
      })
    } finally {
      setSavingAdmin(false)
    }
  }

  const toggleAdminStatus = async (admin: AdminUser, nextStatus: boolean) => {
    const isCurrentUserSuperAdmin = currentAdminUser?.roleKey === 'super_admin'
    if (admin.roleKey === 'super_admin' && !isCurrentUserSuperAdmin && !admin.isCurrentUser) {
      toast({
        title: "Action not allowed",
        description: "Only super admins can change another super admin's status.",
        variant: "destructive"
      })
      return
    }

    try {
      const response = await fetch(`${API_URL}/admin/access/users/${admin.id}/status`, {
        method: "PATCH",
        headers: adminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ isActive: nextStatus })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update status")
      }

      toast({
        title: "Status updated",
        description: `${admin.firstName} ${admin.lastName} is now ${nextStatus ? "active" : "inactive"}.`
      })
      await fetchOverview()
    } catch (error) {
      console.error(error)
      toast({
        title: "Unable to update status",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive"
      })
    }
  }

  const adminHasCustomPermissions = (admin: AdminUser | null | undefined) => {
    const overrides = admin?.permissionOverrides
    return Boolean(overrides && (overrides.add.length || overrides.remove.length))
  }

  const openPermissionDialog = (admin: AdminUser) => {
    setPermissionDialogAdmin(admin)
    setPermissionOverridesState(sanitizeOverrides(admin.permissionOverrides ?? emptyOverrides))
    setPermissionDialogOpen(true)
  }

  const getPermissionStateDetails = (moduleId: string, action: string) => {
    if (!permissionDialogAdmin) {
      return { baseEnabled: false, effectiveEnabled: false, source: "role" as const }
    }
    const basePermissions = getRolePermissions(permissionDialogAdmin)
    const baseEnabled = basePermissions.some(
      (permission) => permission.module === moduleId && permission.actions.includes(action)
    )
    const added = permissionExists(permissionOverridesState.add, moduleId, action)
    const removed = permissionExists(permissionOverridesState.remove, moduleId, action)
    const effectiveEnabled = added ? true : removed ? false : baseEnabled
    const source: "added" | "removed" | "role" = added ? "added" : removed ? "removed" : "role"
    return { baseEnabled, effectiveEnabled, source }
  }

  const handlePermissionToggle = (moduleId: string, action: string, desiredEnabled: boolean) => {
    if (!permissionDialogAdmin) return
    const moduleActions = moduleActionsLookup.get(moduleId)
    if (!moduleActions || !moduleActions.has(action)) return
    const basePermissions = getRolePermissions(permissionDialogAdmin)
    const baseEnabled = basePermissions.some(
      (permission) => permission.module === moduleId && permission.actions.includes(action)
    )
    updateOverrideState((prev) => {
      let nextAdd = prev.add
      let nextRemove = prev.remove

      if (desiredEnabled === baseEnabled) {
        nextAdd = removeActionFromList(nextAdd, moduleId, action)
        nextRemove = removeActionFromList(nextRemove, moduleId, action)
      } else if (desiredEnabled) {
        nextAdd = addActionToList(nextAdd, moduleId, action)
        nextRemove = removeActionFromList(nextRemove, moduleId, action)
      } else {
        nextRemove = addActionToList(nextRemove, moduleId, action)
        nextAdd = removeActionFromList(nextAdd, moduleId, action)
      }

      return { add: nextAdd, remove: nextRemove }
    })
  }

  const resetPermissionOverrides = () => {
    setPermissionOverridesState(emptyOverrides)
  }

  const savePermissionOverrides = async () => {
    if (!permissionDialogAdmin) return
    setSavingOverrides(true)
    try {
      const response = await fetch(`${API_URL}/admin/access/users/${permissionDialogAdmin.id}/permissions`, {
        method: "PATCH",
        headers: adminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ permissionOverrides: permissionOverridesState })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update permissions")
      }

      toast({
        title: "Permissions updated",
        description: "Custom permissions have been saved."
      })
      setPermissionDialogOpen(false)
      await fetchOverview()
    } catch (error) {
      console.error(error)
      toast({
        title: "Unable to update permissions",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive"
      })
    } finally {
      setSavingOverrides(false)
    }
  }

  const openPasswordResetDialog = (admin: AdminUser) => {
    setResettingAdmin(admin)
    setNewPassword("")
    setConfirmPassword("")
    setPasswordResetDialogOpen(true)
  }

  const resetPassword = async () => {
    if (!resettingAdmin) return

    if (!newPassword.trim()) {
      toast({
        title: "Password required",
        description: "Please enter a new password.",
        variant: "destructive"
      })
      return
    }

    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters long.",
        variant: "destructive"
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please ensure both password fields match.",
        variant: "destructive"
      })
      return
    }

    setResettingPassword(true)
    try {
      const response = await fetch(`${API_URL}/admin/access/users/${resettingAdmin.id}/password`, {
        method: "PATCH",
        headers: adminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ password: newPassword })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to reset password")
      }

      toast({
        title: resettingAdmin.isCurrentUser ? "Password changed" : "Password reset",
        description: resettingAdmin.isCurrentUser
          ? "Your password has been changed successfully. Please use your new password to log in."
          : `Password for ${resettingAdmin.firstName} ${resettingAdmin.lastName} has been reset successfully.`
      })
      setPasswordResetDialogOpen(false)
      setNewPassword("")
      setConfirmPassword("")
      setResettingAdmin(null)
    } catch (error) {
      console.error(error)
      toast({
        title: "Unable to reset password",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive"
      })
    } finally {
      setResettingPassword(false)
    }
  }

  if (isLoading && !overview) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center space-y-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>Loading admin access data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Access Management</h1>
          <p className="text-muted-foreground">
            Control who can access the admin panel and what actions they can perform.
          </p>
        </div>
        <Button variant="outline" onClick={fetchOverview} disabled={isRefreshing}>
          {isRefreshing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Refreshing
            </>
          ) : (
            <>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Admins</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAdmins}</div>
            <p className="text-xs text-muted-foreground">All admins with panel access</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Admins</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeAdmins}</div>
            <p className="text-xs text-muted-foreground">Currently allowed to log in</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Super Admins</CardTitle>
            <Shield className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.superAdmins}</div>
            <p className="text-xs text-muted-foreground">Full access guardians</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-indigo-600" />
              <span>Roles & Permissions</span>
            </CardTitle>
            <CardDescription>Design reusable permission templates for admin users.</CardDescription>
          </div>
          <Button 
            onClick={() => openRoleDialog()}
            disabled={
              // Super admins can always create roles, others need permission
              currentAdminUser?.roleKey !== 'super_admin' && !hasPermission(currentAdminUser, 'roles', 'create')
            }
          >
            <KeyRound className="mr-2 h-4 w-4" />
            New Role
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {roles.length === 0 ? (
            <div className="flex items-center justify-center rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              No roles configured yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {roles.map((role) => (
                <div key={role.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-lg font-semibold">{role.name}</h3>
                        {role.isSystem && (
                          <Badge variant="outline" className="text-xs">
                            System
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{role.description}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => openRoleDialog(role)}
                        disabled={
                          // Only super admins can edit roles (including system roles)
                          currentAdminUser?.roleKey !== 'super_admin' && !hasPermission(currentAdminUser, 'roles', 'update')
                        }
                        title="Edit role"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {!role.isSystem && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => deleteRole(role)}
                          disabled={
                            currentAdminUser?.roleKey !== 'super_admin' && !hasPermission(currentAdminUser, 'roles', 'delete')
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{role.assignedAdmins} Admins</Badge>
                    {role.permissions.slice(0, 3).map((permission) => (
                      <Badge key={`${role.id}-${permission.module}`} variant="outline" className="text-xs">
                        {permission.module}
                      </Badge>
                    ))}
                    {role.permissions.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{role.permissions.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-600" />
              <span>Admin Directory</span>
            </CardTitle>
            <CardDescription>Invite and manage platform admin accounts.</CardDescription>
          </div>
          <Button 
            onClick={() => openAdminDialog()}
            disabled={!hasPermission(currentAdminUser, 'users', 'create')}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Add Admin
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adminsWithCurrent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No admin users found.
                  </TableCell>
                </TableRow>
              )}
              {adminsWithCurrent.map((admin) => (
                <TableRow key={admin.id} className={admin.isCurrentUser ? "bg-slate-50" : undefined}>
                  <TableCell className="font-medium">
                    {admin.firstName} {admin.lastName}
                    {admin.isCurrentUser && (
                      <Badge variant="secondary" className="ml-2">
                        You
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{admin.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{admin.roleName}</Badge>
                      {admin.roleKey === "super_admin" && (
                        <Shield className="h-3.5 w-3.5 text-indigo-500" />
                      )}
                      {adminHasCustomPermissions(admin) && (
                        <Badge variant="secondary" className="text-xs">
                          Custom
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(admin.lastLogin)}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={admin.isActive} 
                        onCheckedChange={(checked) => toggleAdminStatus(admin, checked)}
                        disabled={
                          // Only super admins can change other users' status, and super admins can only be changed by super admins
                          (!admin.isCurrentUser && !hasPermission(currentAdminUser, 'users', 'update')) ||
                          (admin.roleKey === 'super_admin' && currentAdminUser?.roleKey !== 'super_admin')
                        }
                        title={
                          !admin.isCurrentUser && !hasPermission(currentAdminUser, 'users', 'update')
                            ? "Only super admins can change user status"
                            : admin.roleKey === 'super_admin' && currentAdminUser?.roleKey !== 'super_admin'
                            ? "Super admin status can only be changed by another super admin"
                            : undefined
                        }
                      />
                      <span className="text-sm text-muted-foreground">
                        {admin.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => openPasswordResetDialog(admin)} 
                        title={admin.isCurrentUser ? "Change Password" : "Reset Password"}
                        disabled={
                          // Allow if it's their own password, or if they're a super admin
                          (!admin.isCurrentUser && !hasPermission(currentAdminUser, 'users', 'reset_password')) ||
                          (admin.roleKey === 'super_admin' && currentAdminUser?.roleKey !== 'super_admin')
                        }
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openPermissionDialog(admin)}
                        title="Manage Permissions"
                        disabled={
                          (!admin.isCurrentUser && !hasPermission(currentAdminUser, 'users', 'update')) ||
                          (admin.roleKey === 'super_admin' && currentAdminUser?.roleKey !== 'super_admin')
                        }
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => openAdminDialog(admin)} 
                        title={admin.isCurrentUser ? "Edit Your Account" : "Edit Admin"}
                        disabled={
                          // Allow if it's their own account, or if they're a super admin
                          (!admin.isCurrentUser && !hasPermission(currentAdminUser, 'users', 'update')) ||
                          (admin.roleKey === 'super_admin' && currentAdminUser?.roleKey !== 'super_admin')
                        }
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Create Role"}</DialogTitle>
            <DialogDescription>
              Configure the name and permissions for this role. Changes apply to all assigned admins.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={roleForm.name}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. Customer Success"
                  disabled={editingRole?.isSystem === true}
                />
                {editingRole?.isSystem && (
                  <p className="text-xs text-muted-foreground">
                    System role names cannot be changed. You can update description, color, and permissions.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Color Tag</Label>
                <Select
                  value={roleForm.color}
                  onValueChange={(value) => setRoleForm((prev) => ({ ...prev, color: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gray">Gray</SelectItem>
                    <SelectItem value="blue">Blue</SelectItem>
                    <SelectItem value="green">Green</SelectItem>
                    <SelectItem value="orange">Orange</SelectItem>
                    <SelectItem value="purple">Purple</SelectItem>
                    <SelectItem value="red">Red</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={roleForm.description}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Describe how this role should be used."
              />
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold">Permissions</h4>
                <p className="text-sm text-muted-foreground">
                  Toggle the actions this role can perform for each module.
                </p>
              </div>
              <div className="space-y-4">
                {modules.map((module) => (
                  <div key={module.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{module.label}</p>
                        <p className="text-xs text-muted-foreground">{module.description}</p>
                      </div>
                      <Badge variant="secondary">{module.actions.length} Actions</Badge>
                    </div>
                    <Separator className="my-3" />
                    <div className="flex flex-wrap gap-3">
                      {module.actions.map((action) => {
                        const selected = roleForm.permissions[module.id]?.includes(action)
                        return (
                          <Button
                            key={action}
                            variant={selected ? "default" : "outline"}
                            size="sm"
                            onClick={() => togglePermission(module.id, action)}
                          >
                            {selected ? "✓" : ""} {action.replace(/_/g, " ")}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveRole} disabled={savingRole}>
              {savingRole && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Dialog */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAdmin 
                ? (editingAdmin.isCurrentUser ? "Edit Your Account" : "Edit Admin")
                : "Invite Admin"
              }
            </DialogTitle>
            <DialogDescription>
              {editingAdmin && editingAdmin.isCurrentUser
                ? "Update your account details. You cannot change your role."
                : editingAdmin
                ? "Update admin details and assign a role."
                : "Provide contact details and assign a role. Invited admins can log in immediately."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={adminForm.firstName}
                  onChange={(event) => setAdminForm((prev) => ({ ...prev, firstName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={adminForm.lastName}
                  onChange={(event) => setAdminForm((prev) => ({ ...prev, lastName: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={adminForm.email}
                onChange={(event) => setAdminForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            {!editingAdmin && (
              <div className="space-y-2">
                <Label>Temporary Password</Label>
                <Input
                  type="password"
                  value={adminForm.password}
                  onChange={(event) => setAdminForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={adminForm.roleId}
                onValueChange={(value) => setAdminForm((prev) => ({ ...prev, roleId: value }))}
                disabled={
                  // Disable if editing own account (non-super admin) or if editing super admin
                  (editingAdmin && editingAdmin.isCurrentUser && currentAdminUser?.roleKey !== 'super_admin') ||
                  (editingAdmin && editingAdmin.roleKey === 'super_admin')
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => {
                    const roleData = roles.find(r => r.id === role.value)
                    // Prevent selecting super_admin role for new users or changing existing super_admin's role
                    const isSuperAdminRole = roleData?.key === 'super_admin'
                    const isEditingSuperAdmin = editingAdmin && editingAdmin.roleKey === 'super_admin'
                    const isEditingOwnAccount = editingAdmin && editingAdmin.isCurrentUser
                    const isCurrentUserSuperAdmin = currentAdminUser?.roleKey === 'super_admin'
                    const canSelectSuperAdmin = isEditingSuperAdmin && isSuperAdminRole
                    const cannotSelectSuperAdmin = isSuperAdminRole && !canSelectSuperAdmin
                    
                    return (
                      <SelectItem 
                        key={role.value} 
                        value={role.value}
                        disabled={cannotSelectSuperAdmin}
                      >
                        {role.label}
                        {role.badge && <Badge className="ml-2 text-[0.6rem]">{role.badge}</Badge>}
                        {cannotSelectSuperAdmin && (
                          <span className="ml-2 text-xs text-muted-foreground">(Cannot assign)</span>
                        )}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {editingAdmin && editingAdmin.isCurrentUser && currentAdminUser?.roleKey !== 'super_admin' && (
                <p className="text-xs text-muted-foreground">
                  You cannot change your own role. Contact a super admin to change your role.
                </p>
              )}
              {editingAdmin && editingAdmin.roleKey === 'super_admin' && (
                <p className="text-xs text-muted-foreground">
                  Super admin role cannot be changed. Super admin privileges are permanent.
                </p>
              )}
              {!editingAdmin && (
                <p className="text-xs text-muted-foreground">
                  Note: Super admin role cannot be assigned through this interface.
                </p>
              )}
            </div>
            <div className="flex items-start space-x-3 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <p>
                Super admins have unrestricted access. Assign this role sparingly and review access regularly.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdminDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAdmin} disabled={savingAdmin}>
              {savingAdmin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingAdmin ? "Save Changes" : "Invite Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permission Overrides Dialog */}
      <Dialog open={permissionDialogOpen} onOpenChange={setPermissionDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Manage Permissions</DialogTitle>
            <DialogDescription>
              Customize permissions for {permissionDialogAdmin?.firstName} {permissionDialogAdmin?.lastName}. Changes here override the assigned role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                Role: <span className="font-medium text-foreground">{permissionDialogAdmin?.roleName}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Role permissions provide the default access. Add or remove actions below to tailor this admin&apos;s access.
              </p>
            </div>
            <div className="space-y-4">
              {modules.map((module) => (
                <div key={module.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{module.label}</p>
                      <p className="text-xs text-muted-foreground">{module.description}</p>
                    </div>
                    <Badge variant="secondary">{module.actions.length} Actions</Badge>
                  </div>
                  <Separator className="my-3" />
                  <div className="flex flex-wrap gap-3">
                    {module.actions.map((action) => {
                      const { effectiveEnabled, source } = getPermissionStateDetails(module.id, action)
                      const displayName = action.replace(/_/g, " ")
                      return (
                        <Button
                          key={action}
                          variant={effectiveEnabled ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePermissionToggle(module.id, action, !effectiveEnabled)}
                          className="flex items-center gap-2"
                        >
                          {effectiveEnabled ? "✓" : ""} {displayName}
                          {source !== "role" && (
                            <Badge
                              variant={source === "added" ? "secondary" : "destructive"}
                              className="text-[0.6rem] uppercase"
                            >
                              {source === "added" ? "Custom +" : "Custom -"}
                            </Badge>
                          )}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetPermissionOverrides}>
              Reset to Role Defaults
            </Button>
            <Button onClick={savePermissionOverrides} disabled={savingOverrides || !permissionDialogAdmin}>
              {savingOverrides && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Overrides
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={passwordResetDialogOpen} onOpenChange={setPasswordResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resettingAdmin?.isCurrentUser ? "Change Your Password" : "Reset Password"}
            </DialogTitle>
            <DialogDescription>
              {resettingAdmin?.isCurrentUser 
                ? "Enter your new password. You'll need to use this password to log in."
                : `Set a new password for ${resettingAdmin?.firstName} ${resettingAdmin?.lastName}. They will need to use this password to log in.`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Enter new password (min 8 characters)"
              />
              <p className="text-xs text-muted-foreground">Password must be at least 8 characters long</p>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <div className="flex items-start space-x-3 rounded-md bg-blue-50 p-3 text-sm text-blue-700">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <p>
                The admin user will be notified to use this new password on their next login attempt.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => {
              setPasswordResetDialogOpen(false)
              setNewPassword("")
              setConfirmPassword("")
              setResettingAdmin(null)
            }}>
              Cancel
            </Button>
            <Button onClick={resetPassword} disabled={resettingPassword || !newPassword || !confirmPassword}>
              {resettingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

