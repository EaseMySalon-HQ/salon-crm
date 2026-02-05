"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Users, 
  Shield, 
  Settings, 
  Plus,
  Trash2,
  Edit
} from "lucide-react"

interface UserSettingsProps {
  settings?: any
  onSettingsChange: (settings: any) => void
}

export function UserSettings({ settings: propSettings, onSettingsChange }: UserSettingsProps) {
  const [settings, setSettings] = useState(propSettings || {
    // Default User Permissions
    defaultPermissions: {
      admin: [
        { module: 'dashboard', feature: 'view', enabled: true },
        { module: 'dashboard', feature: 'edit', enabled: true },
        { module: 'appointments', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'create', enabled: true },
        { module: 'appointments', feature: 'edit', enabled: true },
        { module: 'appointments', feature: 'delete', enabled: true },
        { module: 'clients', feature: 'view', enabled: true },
        { module: 'clients', feature: 'create', enabled: true },
        { module: 'clients', feature: 'edit', enabled: true },
        { module: 'clients', feature: 'delete', enabled: true },
        { module: 'services', feature: 'view', enabled: true },
        { module: 'services', feature: 'create', enabled: true },
        { module: 'services', feature: 'edit', enabled: true },
        { module: 'services', feature: 'delete', enabled: true },
        { module: 'products', feature: 'view', enabled: true },
        { module: 'products', feature: 'create', enabled: true },
        { module: 'products', feature: 'edit', enabled: true },
        { module: 'products', feature: 'delete', enabled: true },
        { module: 'staff', feature: 'view', enabled: true },
        { module: 'staff', feature: 'create', enabled: true },
        { module: 'staff', feature: 'edit', enabled: true },
        { module: 'staff', feature: 'delete', enabled: true },
        { module: 'sales', feature: 'view', enabled: true },
        { module: 'sales', feature: 'create', enabled: true },
        { module: 'sales', feature: 'edit', enabled: true },
        { module: 'sales', feature: 'delete', enabled: true },
        { module: 'reports', feature: 'view', enabled: true },
        { module: 'reports', feature: 'create', enabled: true },
        { module: 'settings', feature: 'view', enabled: true },
        { module: 'settings', feature: 'edit', enabled: true }
      ],
      manager: [
        { module: 'dashboard', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'create', enabled: true },
        { module: 'appointments', feature: 'edit', enabled: true },
        { module: 'clients', feature: 'view', enabled: true },
        { module: 'clients', feature: 'create', enabled: true },
        { module: 'clients', feature: 'edit', enabled: true },
        { module: 'services', feature: 'view', enabled: true },
        { module: 'services', feature: 'create', enabled: true },
        { module: 'services', feature: 'edit', enabled: true },
        { module: 'products', feature: 'view', enabled: true },
        { module: 'products', feature: 'create', enabled: true },
        { module: 'products', feature: 'edit', enabled: true },
        { module: 'staff', feature: 'view', enabled: true },
        { module: 'staff', feature: 'create', enabled: true },
        { module: 'staff', feature: 'edit', enabled: true },
        { module: 'sales', feature: 'view', enabled: true },
        { module: 'sales', feature: 'create', enabled: true },
        { module: 'reports', feature: 'view', enabled: true }
      ],
      staff: [
        { module: 'dashboard', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'view', enabled: true },
        { module: 'appointments', feature: 'create', enabled: true },
        { module: 'appointments', feature: 'edit', enabled: true },
        { module: 'clients', feature: 'view', enabled: true },
        { module: 'clients', feature: 'create', enabled: true },
        { module: 'clients', feature: 'edit', enabled: true },
        { module: 'services', feature: 'view', enabled: true },
        { module: 'products', feature: 'view', enabled: true },
        { module: 'sales', feature: 'view', enabled: true },
        { module: 'sales', feature: 'create', enabled: true }
      ]
    },
    
    // User Creation Rules
    creationRules: {
      requirePassword: true,
      requireEmailVerification: false,
      requirePhoneVerification: false,
      allowSelfRegistration: false,
      requireAdminApproval: true,
      defaultRole: "staff",
      autoActivate: false,
      sendWelcomeEmail: true
    },
    
    // Admin Users
    adminUsers: [
      {
        id: 1,
        firstName: "Admin",
        lastName: "User",
        email: "admin@salon.com",
        role: "super_admin",
        isActive: true,
        lastLogin: "2024-01-15T10:30:00Z"
      }
    ],
    
    // Role Management
    roles: [
      {
        id: "super_admin",
        name: "Super Admin",
        description: "Full system access",
        permissions: ["all"],
        isSystem: true
      },
      {
        id: "admin",
        name: "Admin",
        description: "Business administration",
        permissions: ["business_management", "user_management"],
        isSystem: false
      },
      {
        id: "manager",
        name: "Manager",
        description: "Business operations management",
        permissions: ["appointments", "clients", "staff", "reports"],
        isSystem: false
      },
      {
        id: "staff",
        name: "Staff",
        description: "Basic operational access",
        permissions: ["appointments", "clients", "sales"],
        isSystem: false
      }
    ]
  })

  // Update settings when propSettings change
  useEffect(() => {
    if (propSettings) {
      setSettings(propSettings)
    }
  }, [propSettings])

  const handleSettingChange = (path: string, value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev }
      const keys = path.split('.')
      let current = newSettings
      
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]]
      }
      
      current[keys[keys.length - 1]] = value
      onSettingsChange(newSettings)
      return newSettings
    })
  }

  const handlePermissionChange = (role: string, module: string, feature: string, enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      defaultPermissions: {
        ...prev.defaultPermissions,
        [role]: prev.defaultPermissions[role].map(permission => 
          permission.module === module && permission.feature === feature
            ? { ...permission, enabled }
            : permission
        )
      }
    }))
    onSettingsChange()
  }

  const modules = [
    { id: 'dashboard', name: 'Dashboard' },
    { id: 'appointments', name: 'Appointments' },
    { id: 'clients', name: 'Clients' },
    { id: 'services', name: 'Services' },
    { id: 'products', name: 'Products' },
    { id: 'staff', name: 'Staff' },
    { id: 'sales', name: 'Sales' },
    { id: 'reports', name: 'Reports' },
    { id: 'settings', name: 'Settings' }
  ]

  const features = [
    { id: 'view', name: 'View' },
    { id: 'create', name: 'Create' },
    { id: 'edit', name: 'Edit' },
    { id: 'delete', name: 'Delete' },
    { id: 'manage', name: 'Manage' }
  ]

  return (
    <div className="space-y-6">
      {/* User Creation Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-blue-600" />
            <span>User Creation Rules</span>
          </CardTitle>
          <CardDescription>
            Configure rules for user creation and registration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="defaultRole">Default Role</Label>
              <Select
                value={settings.creationRules.defaultRole}
                onValueChange={(value) => handleSettingChange('creationRules.defaultRole', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Require Password</Label>
                <p className="text-xs text-gray-500">
                  Users must set a password during creation
                </p>
              </div>
              <Switch
                checked={settings.creationRules.requirePassword}
                onCheckedChange={(checked) => handleSettingChange('creationRules.requirePassword', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Require Email Verification</Label>
                <p className="text-xs text-gray-500">
                  Users must verify their email address
                </p>
              </div>
              <Switch
                checked={settings.creationRules.requireEmailVerification}
                onCheckedChange={(checked) => handleSettingChange('creationRules.requireEmailVerification', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Require Phone Verification</Label>
                <p className="text-xs text-gray-500">
                  Users must verify their phone number
                </p>
              </div>
              <Switch
                checked={settings.creationRules.requirePhoneVerification}
                onCheckedChange={(checked) => handleSettingChange('creationRules.requirePhoneVerification', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Allow Self Registration</Label>
                <p className="text-xs text-gray-500">
                  Allow users to register themselves
                </p>
              </div>
              <Switch
                checked={settings.creationRules.allowSelfRegistration}
                onCheckedChange={(checked) => handleSettingChange('creationRules.allowSelfRegistration', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Require Admin Approval</Label>
                <p className="text-xs text-gray-500">
                  New users require admin approval
                </p>
              </div>
              <Switch
                checked={settings.creationRules.requireAdminApproval}
                onCheckedChange={(checked) => handleSettingChange('creationRules.requireAdminApproval', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Auto-Activate Users</Label>
                <p className="text-xs text-gray-500">
                  Automatically activate new users
                </p>
              </div>
              <Switch
                checked={settings.creationRules.autoActivate}
                onCheckedChange={(checked) => handleSettingChange('creationRules.autoActivate', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Send Welcome Email</Label>
                <p className="text-xs text-gray-500">
                  Send welcome email to new users
                </p>
              </div>
              <Switch
                checked={settings.creationRules.sendWelcomeEmail}
                onCheckedChange={(checked) => handleSettingChange('creationRules.sendWelcomeEmail', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-green-600" />
            <span>Default Permissions</span>
          </CardTitle>
          <CardDescription>
            Configure default permissions for each role
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(settings.defaultPermissions).map(([role, permissions]) => (
            <div key={role} className="space-y-4">
              <h4 className="font-medium text-sm capitalize">{role} Permissions</h4>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left p-2 font-medium">Module</th>
                      {features.map(feature => (
                        <th key={feature.id} className="text-center p-2 font-medium text-xs">
                          {feature.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map(module => (
                      <tr key={module.id} className="border-b">
                        <td className="p-2 font-medium text-sm">{module.name}</td>
                        {features.map(feature => {
                          const permission = permissions.find(p => p.module === module.id && p.feature === feature.id)
                          return (
                            <td key={feature.id} className="p-2 text-center">
                              <Switch
                                checked={permission?.enabled || false}
                                onCheckedChange={(checked) => handlePermissionChange(role, module.id, feature.id, checked)}
                                size="sm"
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Role Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-purple-600" />
            <span>Role Management</span>
          </CardTitle>
          <CardDescription>
            Manage user roles and their permissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-medium">Available Roles</h4>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Role
            </Button>
          </div>
          
          <div className="space-y-3">
            {settings.roles.map(role => (
              <div key={role.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h5 className="font-medium">{role.name}</h5>
                    {role.isSystem && (
                      <Badge variant="outline" className="text-xs">System</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{role.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {role.permissions.slice(0, 3).map(permission => (
                      <Badge key={permission} variant="secondary" className="text-xs">
                        {permission}
                      </Badge>
                    ))}
                    {role.permissions.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{role.permissions.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm">
                    <Edit className="h-4 w-4" />
                  </Button>
                  {!role.isSystem && (
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Admin Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-red-600" />
            <span>Admin Users</span>
          </CardTitle>
          <CardDescription>
            Manage admin users and their access levels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-medium">System Administrators</h4>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Admin
            </Button>
          </div>
          
          <div className="space-y-3">
            {settings.adminUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h5 className="font-medium">{user.firstName} {user.lastName}</h5>
                    <Badge variant="outline" className="text-xs capitalize">
                      {user.role.replace('_', ' ')}
                    </Badge>
                    <Badge variant={user.isActive ? "default" : "secondary"} className="text-xs">
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500">{user.email}</p>
                  <p className="text-xs text-gray-400">
                    Last login: {new Date(user.lastLogin).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
