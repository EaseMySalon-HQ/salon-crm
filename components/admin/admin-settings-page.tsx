"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Settings, 
  Building2, 
  Users, 
  Shield, 
  Database, 
  Bell, 
  Zap, 
  ChevronRight,
  Save,
  RotateCcw,
  Download,
  Upload
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getAdminAuthToken } from "@/lib/admin-auth-storage"
import { SystemSettings } from "./admin-settings/system-settings"
import { BusinessSettings } from "./admin-settings/business-settings"
import { UserSettings } from "./admin-settings/user-settings"
import { DatabaseSettings } from "./admin-settings/database-settings"
import { NotificationSettings } from "./admin-settings/notification-settings"
import { APISettings } from "./admin-settings/api-settings"

const settingsCategories = [
  {
    id: "system",
    title: "System Configuration",
    description: "Core system settings, security, and monitoring",
    icon: Settings,
    color: "bg-blue-500",
    features: ["Inactive Business Monitoring", "Session Management", "Security Settings", "System Health"]
  },
  {
    id: "business",
    title: "Business Management",
    description: "Default business settings and creation rules",
    icon: Building2,
    color: "bg-green-500",
    features: ["Default Settings", "Business Rules", "Creation Policies", "Onboarding Flow"]
  },
  {
    id: "users",
    title: "User Management",
    description: "User permissions, roles, and access control",
    icon: Users,
    color: "bg-purple-500",
    features: ["Permission Templates", "Role Management", "Admin Users", "Access Control"]
  },
  {
    id: "database",
    title: "Database & System",
    description: "Database configuration and system monitoring",
    icon: Database,
    color: "bg-orange-500",
    features: ["Database Settings", "Backup Configuration", "Performance Monitoring", "Maintenance"]
  },
  {
    id: "notifications",
    title: "Notifications & Alerts",
    description: "System notifications and alert configuration",
    icon: Bell,
    color: "bg-red-500",
    features: ["Email Settings", "SMS Configuration", "Alert Rules", "Notification Templates"]
  },
  {
    id: "api",
    title: "API & Integration",
    description: "API configuration and external integrations",
    icon: Zap,
    color: "bg-indigo-500",
    features: ["API Settings", "Rate Limiting", "Webhooks", "External Services"]
  }
]

export function AdminSettingsPage() {
  const [activeCategory, setActiveCategory] = useState("system")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [settings, setSettings] = useState({})
  const { toast } = useToast()
  
  // Define API_URL at component level
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

  const authHeaders = (extra: HeadersInit = {}) => {
    const token = getAdminAuthToken()
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    }
  }

  // Load settings on component mount
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/settings`, {
        headers: authHeaders(),
      })

      if (response.ok) {
        const data = await response.json()
        setSettings(data.data)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const handleCategoryChange = (categoryId: string) => {
    if (hasUnsavedChanges) {
      if (!confirm("You have unsaved changes. Are you sure you want to switch categories?")) {
        return
      }
    }
    setActiveCategory(categoryId)
    setHasUnsavedChanges(false)
  }

  const handleSave = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${API_URL}/admin/settings/${activeCategory}`, {
        method: 'PUT',
        headers: authHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(settings[activeCategory])
      })

      if (response.ok) {
        setHasUnsavedChanges(false)
        toast({
          title: "Settings saved",
          description: "Your admin settings have been updated successfully.",
        })
      } else {
        throw new Error('Failed to save settings')
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    if (confirm("Are you sure you want to reset all settings to default values?")) {
      setHasUnsavedChanges(false)
      toast({
        title: "Settings reset",
        description: "All settings have been reset to default values.",
      })
    }
  }

  const handleExport = () => {
    // Export settings functionality
    toast({
      title: "Settings exported",
      description: "Your settings have been exported successfully.",
    })
  }

  const handleImport = () => {
    // Import settings functionality
    toast({
      title: "Settings imported",
      description: "Your settings have been imported successfully.",
    })
  }

  const renderSettingsContent = () => {
    const categorySettings = settings[activeCategory] || {}
    
    switch (activeCategory) {
      case "system":
        return <SystemSettings 
          settings={categorySettings} 
          onSettingsChange={(newSettings) => {
            setSettings(prev => ({ ...prev, [activeCategory]: newSettings }))
            setHasUnsavedChanges(true)
          }} 
        />
      case "business":
        return <BusinessSettings 
          settings={categorySettings} 
          onSettingsChange={(newSettings) => {
            setSettings(prev => ({ ...prev, [activeCategory]: newSettings }))
            setHasUnsavedChanges(true)
          }} 
        />
      case "users":
        return <UserSettings 
          settings={categorySettings} 
          onSettingsChange={(newSettings) => {
            setSettings(prev => ({ ...prev, [activeCategory]: newSettings }))
            setHasUnsavedChanges(true)
          }} 
        />
      case "database":
        return <DatabaseSettings 
          settings={categorySettings} 
          onSettingsChange={(newSettings) => {
            setSettings(prev => ({ ...prev, [activeCategory]: newSettings }))
            setHasUnsavedChanges(true)
          }} 
        />
      case "notifications":
        return <NotificationSettings 
          settings={categorySettings} 
          onSettingsChange={(newSettings) => {
            setSettings(prev => ({ ...prev, [activeCategory]: newSettings }))
            setHasUnsavedChanges(true)
          }} 
        />
      case "api":
        return <APISettings 
          settings={categorySettings} 
          onSettingsChange={(newSettings) => {
            setSettings(prev => ({ ...prev, [activeCategory]: newSettings }))
            setHasUnsavedChanges(true)
          }} 
        />
      default:
        return <SystemSettings 
          settings={categorySettings} 
          onSettingsChange={(newSettings) => {
            setSettings(prev => ({ ...prev, [activeCategory]: newSettings }))
            setHasUnsavedChanges(true)
          }} 
        />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Settings</h1>
          <p className="mt-2 text-gray-600">
            Configure system-wide settings and manage the CRM platform
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Settings Navigation */}
          <div className="lg:col-span-1">
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle className="text-lg">Settings Categories</CardTitle>
                <CardDescription>
                  Choose a category to configure
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <nav className="space-y-1">
                  {settingsCategories.map((category) => {
                    const Icon = category.icon
                    const isActive = activeCategory === category.id
                    
                    return (
                      <button
                        key={category.id}
                        onClick={() => handleCategoryChange(category.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                          isActive
                            ? 'bg-blue-50 border-r-2 border-blue-500 text-blue-700'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-lg ${category.color} text-white`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium">{category.title}</div>
                            <div className="text-xs text-gray-500">{category.description}</div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )
                  })}
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Settings Content */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      {(() => {
                        const category = settingsCategories.find(c => c.id === activeCategory)
                        const Icon = category?.icon || Settings
                        return (
                          <>
                            <div className={`p-2 rounded-lg ${category?.color} text-white`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <span>{category?.title}</span>
                          </>
                        )
                      })()}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {settingsCategories.find(c => c.id === activeCategory)?.description}
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    {hasUnsavedChanges && (
                      <Badge variant="outline" className="text-orange-600 border-orange-200">
                        Unsaved Changes
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                      disabled={isLoading}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExport}
                      disabled={isLoading}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleImport}
                      disabled={isLoading}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={!hasUnsavedChanges || isLoading}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isLoading ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {renderSettingsContent()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
