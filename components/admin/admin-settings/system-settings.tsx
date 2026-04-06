"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { 
  Shield, 
  Clock, 
  AlertTriangle, 
  Database, 
  Users, 
  Bell,
  Info
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface SystemSettingsProps {
  settings?: any
  onSettingsChange: (settings: any) => void
  jwtSecretConfigured?: boolean | null
}

export function SystemSettings({ settings: propSettings, onSettingsChange, jwtSecretConfigured }: SystemSettingsProps) {
  const [settings, setSettings] = useState(propSettings || {
    // Inactive Business Monitoring
    inactiveBusiness: {
      daysThreshold: 7,
      enabled: true,
      notificationEnabled: true,
      notificationRecipients: ["admin@salon.com"],
      autoReactivation: true
    },
    
    // Session Management
    session: {
      timeoutMinutes: 30,
      jwtExpirationHours: 24,
      rememberMeDays: 7,
      maxConcurrentSessions: 3
    },
    
    // Security Settings (JWT signing uses server JWT_SECRET — not stored here)
    security: {
      passwordMinLength: 8,
      passwordRequireSpecialChars: true,
      maxLoginAttempts: 5,
      lockoutDurationMinutes: 15,
      adminEmail: "admin@salon.com",
      requireTwoFactor: false
    },
    
    // System Health
    systemHealth: {
      healthCheckInterval: 5, // minutes
      errorLogLevel: "error",
      performanceMonitoring: true,
      alertThresholds: {
        cpuUsage: 80,
        memoryUsage: 85,
        diskUsage: 90
      }
    }
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

  return (
    <div className="space-y-6">
      {/* Inactive Business Monitoring */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-blue-600" />
            <span>Inactive Business Monitoring</span>
          </CardTitle>
          <CardDescription>
            Configure automatic detection and management of inactive businesses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Enable Inactive Detection</Label>
              <p className="text-xs text-gray-500">
                Automatically mark businesses as inactive after specified days
              </p>
            </div>
            <Switch
              checked={settings.inactiveBusiness?.enabled || false}
              onCheckedChange={(checked) => handleSettingChange('inactiveBusiness.enabled', checked)}
            />
          </div>

          {settings.inactiveBusiness?.enabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="daysThreshold">Days Threshold</Label>
                  <Input
                    id="daysThreshold"
                    type="number"
                    min="1"
                    max="365"
                    value={settings.inactiveBusiness?.daysThreshold || 7}
                    onChange={(e) => handleSettingChange('inactiveBusiness.daysThreshold', parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">
                    Number of days without login to mark as inactive
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notificationRecipients">Notification Recipients</Label>
                  <Input
                    id="notificationRecipients"
                    value={settings.inactiveBusiness?.notificationRecipients?.join(', ') || ''}
                    onChange={(e) => handleSettingChange('inactiveBusiness.notificationRecipients', e.target.value.split(',').map(email => email.trim()))}
                    placeholder="admin@salon.com, support@salon.com"
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">
                    Comma-separated email addresses
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Send Notifications</Label>
                  <p className="text-xs text-gray-500">
                    Send email alerts when businesses become inactive
                  </p>
                </div>
                <Switch
                  checked={settings.inactiveBusiness?.notificationEnabled || false}
                  onCheckedChange={(checked) => handleSettingChange('inactiveBusiness.notificationEnabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Auto-Reactivation</Label>
                  <p className="text-xs text-gray-500">
                    Automatically reactivate when owner logs in
                  </p>
                </div>
                <Switch
                  checked={settings.inactiveBusiness?.autoReactivation || false}
                  onCheckedChange={(checked) => handleSettingChange('inactiveBusiness.autoReactivation', checked)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Session Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-green-600" />
            <span>Session Management</span>
          </CardTitle>
          <CardDescription>
            Configure user session timeouts and security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeoutMinutes">Session Timeout (minutes)</Label>
              <Input
                id="timeoutMinutes"
                type="number"
                min="5"
                max="480"
                    value={settings.session?.timeoutMinutes || 30}
                onChange={(e) => handleSettingChange('session.timeoutMinutes', parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                Auto-logout after inactivity
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jwtExpirationHours">JWT Token Expiration (hours)</Label>
              <Input
                id="jwtExpirationHours"
                type="number"
                min="1"
                max="168"
                    value={settings.session?.jwtExpirationHours || 24}
                onChange={(e) => handleSettingChange('session.jwtExpirationHours', parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                Token validity duration
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rememberMeDays">Remember Me Duration (days)</Label>
              <Input
                id="rememberMeDays"
                type="number"
                min="1"
                max="30"
                    value={settings.session?.rememberMeDays || 7}
                onChange={(e) => handleSettingChange('session.rememberMeDays', parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                How long to remember login
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxConcurrentSessions">Max Concurrent Sessions</Label>
              <Input
                id="maxConcurrentSessions"
                type="number"
                min="1"
                max="10"
                    value={settings.session?.maxConcurrentSessions || 3}
                onChange={(e) => handleSettingChange('session.maxConcurrentSessions', parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                Maximum simultaneous logins per user
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-red-600" />
            <span>Security Settings</span>
          </CardTitle>
          <CardDescription>
            Configure security policies and authentication settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="border-blue-200 bg-blue-50/50">
            <Info className="h-4 w-4 text-blue-700" />
            <AlertTitle className="text-blue-900">JWT signing secret</AlertTitle>
            <AlertDescription className="text-blue-900/90 text-sm space-y-1">
              <p>
                Session tokens are signed with <code className="rounded bg-blue-100/80 px-1 py-0.5 text-xs">JWT_SECRET</code> on the API server only — not in this panel.
              </p>
              <p className="font-medium">
                {jwtSecretConfigured === null
                  ? 'Checking server configuration…'
                  : jwtSecretConfigured
                    ? 'Server reports JWT_SECRET is configured.'
                    : 'Server reports JWT_SECRET is not set — configure it in the API environment for production.'}
              </p>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="adminEmail">Admin Email</Label>
            <Input
              id="adminEmail"
              type="email"
              value={settings.security?.adminEmail || ''}
              onChange={(e) => handleSettingChange('security.adminEmail', e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-gray-500">
              Primary admin email address
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="passwordMinLength">Minimum Password Length</Label>
              <Input
                id="passwordMinLength"
                type="number"
                min="6"
                max="32"
                    value={settings.security?.passwordMinLength || 8}
                onChange={(e) => handleSettingChange('security.passwordMinLength', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxLoginAttempts">Max Login Attempts</Label>
              <Input
                id="maxLoginAttempts"
                type="number"
                min="3"
                max="10"
                    value={settings.security?.maxLoginAttempts || 5}
                onChange={(e) => handleSettingChange('security.maxLoginAttempts', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lockoutDurationMinutes">Lockout Duration (minutes)</Label>
              <Input
                id="lockoutDurationMinutes"
                type="number"
                min="5"
                max="60"
                    value={settings.security?.lockoutDurationMinutes || 15}
                onChange={(e) => handleSettingChange('security.lockoutDurationMinutes', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Require Special Characters</Label>
              <p className="text-xs text-gray-500">
                Passwords must contain special characters
              </p>
            </div>
              <Switch
                checked={settings.security?.passwordRequireSpecialChars || false}
                onCheckedChange={(checked) => handleSettingChange('security.passwordRequireSpecialChars', checked)}
              />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Two-Factor Authentication</Label>
              <p className="text-xs text-gray-500">
                Require 2FA for admin accounts
              </p>
            </div>
              <Switch
                checked={settings.security?.requireTwoFactor || false}
                onCheckedChange={(checked) => handleSettingChange('security.requireTwoFactor', checked)}
              />
          </div>
        </CardContent>
      </Card>

      {/* System Health Monitoring */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5 text-purple-600" />
            <span>System Health Monitoring</span>
          </CardTitle>
          <CardDescription>
            Configure system monitoring and alert thresholds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="healthCheckInterval">Health Check Interval (minutes)</Label>
              <Input
                id="healthCheckInterval"
                type="number"
                min="1"
                max="60"
                    value={settings.systemHealth?.healthCheckInterval || 5}
                onChange={(e) => handleSettingChange('systemHealth.healthCheckInterval', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="errorLogLevel">Error Log Level</Label>
              <Select
                value={settings.systemHealth?.errorLogLevel || 'error'}
                onValueChange={(value) => handleSettingChange('systemHealth.errorLogLevel', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Performance Monitoring</Label>
              <p className="text-xs text-gray-500">
                Monitor system performance metrics
              </p>
            </div>
              <Switch
                checked={settings.systemHealth?.performanceMonitoring || false}
                onCheckedChange={(checked) => handleSettingChange('systemHealth.performanceMonitoring', checked)}
              />
          </div>

          {settings.systemHealth?.performanceMonitoring && (
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Alert Thresholds</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cpuThreshold">CPU Usage (%)</Label>
                  <Input
                    id="cpuThreshold"
                    type="number"
                    min="50"
                    max="100"
                    value={settings.systemHealth?.alertThresholds?.cpuUsage || 80}
                    onChange={(e) => handleSettingChange('systemHealth.alertThresholds.cpuUsage', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="memoryThreshold">Memory Usage (%)</Label>
                  <Input
                    id="memoryThreshold"
                    type="number"
                    min="50"
                    max="100"
                    value={settings.systemHealth?.alertThresholds?.memoryUsage || 85}
                    onChange={(e) => handleSettingChange('systemHealth.alertThresholds.memoryUsage', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diskThreshold">Disk Usage (%)</Label>
                  <Input
                    id="diskThreshold"
                    type="number"
                    min="50"
                    max="100"
                    value={settings.systemHealth?.alertThresholds?.diskUsage || 90}
                    onChange={(e) => handleSettingChange('systemHealth.alertThresholds.diskUsage', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
