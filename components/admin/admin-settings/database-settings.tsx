"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Database, 
  HardDrive, 
  Clock, 
  AlertTriangle,
  Download,
  Upload,
  Trash2,
  Settings
} from "lucide-react"

interface DatabaseSettingsProps {
  settings?: any
  onSettingsChange: (settings: any) => void
}

export function DatabaseSettings({ settings: propSettings, onSettingsChange }: DatabaseSettingsProps) {
  const [settings, setSettings] = useState(propSettings || {
    // Database Configuration
    database: {
      connectionString: "mongodb://localhost:27017/ease_my_salon_main",
      maxConnections: 10,
      connectionTimeout: 30000,
      socketTimeout: 30000,
      retryWrites: true,
      readPreference: "primary",
      writeConcern: "majority"
    },
    
    // Backup Configuration
    backup: {
      enabled: true,
      frequency: "daily",
      retentionDays: 30,
      compressionEnabled: true,
      encryptionEnabled: false,
      backupLocation: "/backups",
      cloudBackup: false,
      cloudProvider: "aws"
    },
    
    // Data Retention
    dataRetention: {
      userDataRetentionDays: 365,
      businessDataRetentionDays: 2555, // 7 years
      logRetentionDays: 90,
      auditLogRetentionDays: 2555,
      tempDataRetentionDays: 7,
      autoCleanup: true
    },
    
    // Performance Monitoring
    performance: {
      slowQueryThreshold: 100, // milliseconds
      enableQueryLogging: true,
      enableIndexMonitoring: true,
      enableConnectionPooling: true,
      maxQueryTime: 30, // seconds
      enableProfiling: false
    },
    
    // Maintenance
    maintenance: {
      maintenanceWindow: "02:00-04:00",
      timezone: "Asia/Kolkata",
      enableAutoOptimization: true,
      enableIndexRebuilding: true,
      enableDataCompression: true,
      maintenanceFrequency: "weekly"
    }
  })

  // Update settings when propSettings change (merge so nested objects always exist)
  useEffect(() => {
    if (propSettings) {
      setSettings(prev => {
        const next = { ...prev, ...propSettings }
        if (!next.database || typeof next.database !== 'object') next.database = { connectionString: 'mongodb://localhost:27017/ease_my_salon_main', maxConnections: 10, connectionTimeout: 30000, socketTimeout: 30000, retryWrites: true, readPreference: 'primary', writeConcern: 'majority', ...(prev?.database || {}), ...(propSettings?.database || {}) }
        if (!next.backup || typeof next.backup !== 'object') next.backup = prev?.backup || {}
        return next
      })
    }
  }, [propSettings])

  const handleSettingChange = (path: string, value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev }
      const keys = path.split('.')
      let current: any = newSettings
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]
        if (current[k] == null || typeof current[k] !== 'object') current[k] = {}
        current = current[k]
      }
      current[keys[keys.length - 1]] = value
      onSettingsChange(newSettings)
      return newSettings
    })
  }

  const handleBackupNow = () => {
    // Backup functionality
    console.log("Starting backup...")
  }

  const handleRestore = () => {
    // Restore functionality
    console.log("Starting restore...")
  }

  const handleOptimize = () => {
    // Optimization functionality
    console.log("Starting optimization...")
  }

  return (
    <div className="space-y-6">
      {/* Database Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5 text-blue-600" />
            <span>Database Configuration</span>
          </CardTitle>
          <CardDescription>
            Configure database connection and performance settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="connectionString">Connection String</Label>
            <Input
              id="connectionString"
              value={settings?.database?.connectionString ?? ''}
              onChange={(e) => handleSettingChange('database.connectionString', e.target.value)}
              className="w-full"
              placeholder="mongodb://localhost:27017/ease_my_salon_main"
            />
            <p className="text-xs text-gray-500">
              MongoDB connection string
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxConnections">Max Connections</Label>
              <Input
                id="maxConnections"
                type="number"
                min="1"
                max="100"
                value={settings?.database?.maxConnections ?? 10}
                onChange={(e) => handleSettingChange('database.maxConnections', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="connectionTimeout">Connection Timeout (ms)</Label>
              <Input
                id="connectionTimeout"
                type="number"
                min="1000"
                max="60000"
                value={settings?.database?.connectionTimeout ?? 30000}
                onChange={(e) => handleSettingChange('database.connectionTimeout', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="socketTimeout">Socket Timeout (ms)</Label>
              <Input
                id="socketTimeout"
                type="number"
                min="1000"
                max="60000"
                value={settings?.database?.socketTimeout ?? 30000}
                onChange={(e) => handleSettingChange('database.socketTimeout', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="readPreference">Read Preference</Label>
              <Select
                value={settings?.database?.readPreference ?? 'primary'}
                onValueChange={(value) => handleSettingChange('database.readPreference', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="primaryPreferred">Primary Preferred</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                  <SelectItem value="secondaryPreferred">Secondary Preferred</SelectItem>
                  <SelectItem value="nearest">Nearest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Retry Writes</Label>
                <p className="text-xs text-gray-500">
                  Automatically retry failed write operations
                </p>
              </div>
              <Switch
                checked={settings?.database?.retryWrites ?? true}
                onCheckedChange={(checked) => handleSettingChange('database.retryWrites', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <HardDrive className="h-5 w-5 text-green-600" />
            <span>Backup Configuration</span>
          </CardTitle>
          <CardDescription>
            Configure automated backup settings and retention policies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Enable Backups</Label>
              <p className="text-xs text-gray-500">
                Automatically backup database
              </p>
            </div>
            <Switch
              checked={settings?.backup?.enabled ?? true}
              onCheckedChange={(checked) => handleSettingChange('backup.enabled', checked)}
            />
          </div>

          {settings?.backup?.enabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="frequency">Backup Frequency</Label>
                  <Select
                    value={settings?.backup?.frequency ?? 'daily'}
                    onValueChange={(value) => handleSettingChange('backup.frequency', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retentionDays">Retention (days)</Label>
                  <Input
                    id="retentionDays"
                    type="number"
                    min="1"
                    max="3650"
                    value={settings?.backup?.retentionDays ?? 30}
                    onChange={(e) => handleSettingChange('backup.retentionDays', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backupLocation">Backup Location</Label>
                  <Input
                    id="backupLocation"
                    value={settings?.backup?.backupLocation ?? '/backups'}
                    onChange={(e) => handleSettingChange('backup.backupLocation', e.target.value)}
                    className="w-full"
                    placeholder="/backups"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cloudProvider">Cloud Provider</Label>
                  <Select
                    value={settings?.backup?.cloudProvider ?? 'aws'}
                    onValueChange={(value) => handleSettingChange('backup.cloudProvider', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aws">AWS S3</SelectItem>
                      <SelectItem value="gcp">Google Cloud</SelectItem>
                      <SelectItem value="azure">Azure Blob</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Compression</Label>
                    <p className="text-xs text-gray-500">
                      Compress backup files to save space
                    </p>
                  </div>
                  <Switch
                    checked={settings?.backup?.compressionEnabled ?? true}
                    onCheckedChange={(checked) => handleSettingChange('backup.compressionEnabled', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Encryption</Label>
                    <p className="text-xs text-gray-500">
                      Encrypt backup files for security
                    </p>
                  </div>
                  <Switch
                    checked={settings?.backup?.encryptionEnabled ?? false}
                    onCheckedChange={(checked) => handleSettingChange('backup.encryptionEnabled', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Cloud Backup</Label>
                    <p className="text-xs text-gray-500">
                      Upload backups to cloud storage
                    </p>
                  </div>
                  <Switch
                    checked={settings?.backup?.cloudBackup ?? false}
                    onCheckedChange={(checked) => handleSettingChange('backup.cloudBackup', checked)}
                  />
                </div>
              </div>

              <div className="flex space-x-2">
                <Button onClick={handleBackupNow} className="bg-green-600 hover:bg-green-700">
                  <Download className="h-4 w-4 mr-2" />
                  Backup Now
                </Button>
                <Button variant="outline" onClick={handleRestore}>
                  <Upload className="h-4 w-4 mr-2" />
                  Restore
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Data Retention */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-orange-600" />
            <span>Data Retention</span>
          </CardTitle>
          <CardDescription>
            Configure data retention policies and cleanup schedules
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="userDataRetention">User Data (days)</Label>
              <Input
                id="userDataRetention"
                type="number"
                min="30"
                max="3650"
                value={settings.dataRetention.userDataRetentionDays}
                onChange={(e) => handleSettingChange('dataRetention.userDataRetentionDays', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessDataRetention">Business Data (days)</Label>
              <Input
                id="businessDataRetention"
                type="number"
                min="365"
                max="3650"
                value={settings.dataRetention.businessDataRetentionDays}
                onChange={(e) => handleSettingChange('dataRetention.businessDataRetentionDays', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="logRetention">Log Data (days)</Label>
              <Input
                id="logRetention"
                type="number"
                min="7"
                max="365"
                value={settings.dataRetention.logRetentionDays}
                onChange={(e) => handleSettingChange('dataRetention.logRetentionDays', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="auditLogRetention">Audit Logs (days)</Label>
              <Input
                id="auditLogRetention"
                type="number"
                min="90"
                max="3650"
                value={settings.dataRetention.auditLogRetentionDays}
                onChange={(e) => handleSettingChange('dataRetention.auditLogRetentionDays', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tempDataRetention">Temp Data (days)</Label>
              <Input
                id="tempDataRetention"
                type="number"
                min="1"
                max="30"
                value={settings.dataRetention.tempDataRetentionDays}
                onChange={(e) => handleSettingChange('dataRetention.tempDataRetentionDays', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Auto Cleanup</Label>
              <p className="text-xs text-gray-500">
                Automatically clean up expired data
              </p>
            </div>
            <Switch
              checked={settings.dataRetention.autoCleanup}
              onCheckedChange={(checked) => handleSettingChange('dataRetention.autoCleanup', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Performance Monitoring */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-purple-600" />
            <span>Performance Monitoring</span>
          </CardTitle>
          <CardDescription>
            Monitor database performance and optimize queries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="slowQueryThreshold">Slow Query Threshold (ms)</Label>
              <Input
                id="slowQueryThreshold"
                type="number"
                min="10"
                max="10000"
                value={settings.performance.slowQueryThreshold}
                onChange={(e) => handleSettingChange('performance.slowQueryThreshold', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxQueryTime">Max Query Time (seconds)</Label>
              <Input
                id="maxQueryTime"
                type="number"
                min="1"
                max="300"
                value={settings.performance.maxQueryTime}
                onChange={(e) => handleSettingChange('performance.maxQueryTime', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Query Logging</Label>
                <p className="text-xs text-gray-500">
                  Log all database queries
                </p>
              </div>
              <Switch
                checked={settings.performance.enableQueryLogging}
                onCheckedChange={(checked) => handleSettingChange('performance.enableQueryLogging', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Index Monitoring</Label>
                <p className="text-xs text-gray-500">
                  Monitor index usage and performance
                </p>
              </div>
              <Switch
                checked={settings.performance.enableIndexMonitoring}
                onCheckedChange={(checked) => handleSettingChange('performance.enableIndexMonitoring', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Connection Pooling</Label>
                <p className="text-xs text-gray-500">
                  Enable connection pooling for better performance
                </p>
              </div>
              <Switch
                checked={settings.performance.enableConnectionPooling}
                onCheckedChange={(checked) => handleSettingChange('performance.enableConnectionPooling', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Profiling</Label>
                <p className="text-xs text-gray-500">
                  Enable database profiling for analysis
                </p>
              </div>
              <Switch
                checked={settings.performance.enableProfiling}
                onCheckedChange={(checked) => handleSettingChange('performance.enableProfiling', checked)}
              />
            </div>
          </div>

          <Button onClick={handleOptimize} className="bg-purple-600 hover:bg-purple-700">
            <Settings className="h-4 w-4 mr-2" />
            Optimize Database
          </Button>
        </CardContent>
      </Card>

      {/* Maintenance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-indigo-600" />
            <span>Maintenance</span>
          </CardTitle>
          <CardDescription>
            Configure maintenance windows and optimization schedules
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maintenanceWindow">Maintenance Window</Label>
              <Input
                id="maintenanceWindow"
                value={settings.maintenance.maintenanceWindow}
                onChange={(e) => handleSettingChange('maintenance.maintenanceWindow', e.target.value)}
                className="w-full"
                placeholder="02:00-04:00"
              />
              <p className="text-xs text-gray-500">
                Format: HH:MM-HH:MM (24-hour format)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={settings.maintenance.timezone}
                onValueChange={(value) => handleSettingChange('maintenance.timezone', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                  <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maintenanceFrequency">Frequency</Label>
              <Select
                value={settings.maintenance.maintenanceFrequency}
                onValueChange={(value) => handleSettingChange('maintenance.maintenanceFrequency', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Auto Optimization</Label>
                <p className="text-xs text-gray-500">
                  Automatically optimize database performance
                </p>
              </div>
              <Switch
                checked={settings.maintenance.enableAutoOptimization}
                onCheckedChange={(checked) => handleSettingChange('maintenance.enableAutoOptimization', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Index Rebuilding</Label>
                <p className="text-xs text-gray-500">
                  Rebuild indexes during maintenance
                </p>
              </div>
              <Switch
                checked={settings.maintenance.enableIndexRebuilding}
                onCheckedChange={(checked) => handleSettingChange('maintenance.enableIndexRebuilding', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Data Compression</Label>
                <p className="text-xs text-gray-500">
                  Compress data during maintenance
                </p>
              </div>
              <Switch
                checked={settings.maintenance.enableDataCompression}
                onCheckedChange={(checked) => handleSettingChange('maintenance.enableDataCompression', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
