"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Settings, 
  Building2, 
  Users, 
  Database, 
  Bell, 
  Zap, 
  Save,
  RotateCcw
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
      // Log what we're sending for debugging
      if (activeCategory === 'notifications' && settings[activeCategory]?.whatsapp) {
        console.log('📤 [Save] Sending WhatsApp settings:', {
          hasTemplateJavaScriptCodes: !!settings[activeCategory].whatsapp.templateJavaScriptCodes,
          hasTemplateVariables: !!settings[activeCategory].whatsapp.templateVariables,
          templateJavaScriptCodesKeys: Object.keys(settings[activeCategory].whatsapp.templateJavaScriptCodes || {}),
          templateVariablesKeys: Object.keys(settings[activeCategory].whatsapp.templateVariables || {}),
          fullWhatsapp: JSON.stringify(settings[activeCategory].whatsapp, null, 2)
        })
      }
      
      const response = await fetch(`${API_URL}/admin/settings/${activeCategory}`, {
        method: 'PUT',
        headers: authHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(settings[activeCategory])
      })

      if (response.ok) {
        const data = await response.json()
        // Update local settings with saved data to ensure consistency
        // Use deep merge to preserve nested objects like templateJavaScriptCodes and templateVariables
        if (data.data) {
          // Log what we received for debugging
          if (activeCategory === 'notifications' && data.data.whatsapp) {
            console.log('📥 Received WhatsApp settings from server:', {
              hasTemplateJavaScriptCodes: !!data.data.whatsapp.templateJavaScriptCodes,
              hasTemplateVariables: !!data.data.whatsapp.templateVariables,
              templateJavaScriptCodesKeys: Object.keys(data.data.whatsapp.templateJavaScriptCodes || {}),
              templateVariablesKeys: Object.keys(data.data.whatsapp.templateVariables || {})
            })
          }
          
          setSettings(prev => {
            const updated = { ...prev }
            // Deep merge for nested objects (especially notifications.whatsapp)
            if (activeCategory === 'notifications' && data.data.whatsapp) {
              updated[activeCategory] = {
                ...(prev[activeCategory] || {}),
                ...data.data,
                whatsapp: {
                  ...(prev[activeCategory]?.whatsapp || {}),
                  ...data.data.whatsapp,
                  // Explicitly preserve nested objects
                  templateJavaScriptCodes: {
                    ...(prev[activeCategory]?.whatsapp?.templateJavaScriptCodes || {}),
                    ...(data.data.whatsapp.templateJavaScriptCodes || {})
                  },
                  templateVariables: {
                    ...(prev[activeCategory]?.whatsapp?.templateVariables || {}),
                    ...(data.data.whatsapp.templateVariables || {})
                  }
                }
              }
            } else {
              updated[activeCategory] = data.data
            }
            return updated
          })
        }
        setHasUnsavedChanges(false)
        toast({
          title: "Settings saved",
          description: "Your admin settings have been updated successfully.",
        })
        // Don't reload all settings - we already have the updated data from the save response
      } else {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save settings')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings. Please try again.",
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

  // Memoize the settings change handler to prevent unnecessary re-renders
  const handleCategorySettingsChange = useCallback((newSettings: any) => {
    setSettings(prev => ({ ...prev, [activeCategory]: newSettings }))
    setHasUnsavedChanges(true)
  }, [activeCategory])

  const renderSettingsContent = (categoryId: string) => {
    const categorySettings = settings[categoryId] || {}

    switch (categoryId) {
      case "system":
        return <SystemSettings settings={categorySettings} onSettingsChange={handleCategorySettingsChange} />
      case "business":
        return <BusinessSettings settings={categorySettings} onSettingsChange={handleCategorySettingsChange} />
      case "users":
        return <UserSettings settings={categorySettings} onSettingsChange={handleCategorySettingsChange} />
      case "database":
        return <DatabaseSettings settings={categorySettings} onSettingsChange={handleCategorySettingsChange} />
      case "notifications":
        return <NotificationSettings settings={categorySettings} onSettingsChange={handleCategorySettingsChange} />
      case "api":
        return <APISettings settings={categorySettings} onSettingsChange={handleCategorySettingsChange} />
      default:
        return <SystemSettings settings={categorySettings} onSettingsChange={handleCategorySettingsChange} />
    }
  }

  return (
    <div className="space-y-8 pb-24">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Platform Settings</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-xl">
            Manage global platform configuration, integrations, and notifications
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 w-fit px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-600 border-0">
          Platform Control Center
        </Badge>
      </div>

      {/* Tabbed navigation - pill style */}
      <Tabs value={activeCategory} onValueChange={(v) => handleCategoryChange(v)} className="w-full">
        <div className="overflow-x-auto -mx-1">
          <TabsList className="inline-flex h-auto p-1 rounded-lg bg-slate-100 border-0 w-full sm:w-auto min-w-max">
            {settingsCategories.map((category) => {
              const Icon = category.icon
              return (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className="rounded-md px-4 py-2.5 text-sm font-medium text-slate-600 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm transition-colors"
                >
                  <Icon className="h-4 w-4 mr-2 shrink-0" />
                  {category.title}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        {settingsCategories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="mt-6 focus-visible:outline-none">
            <div className="space-y-6">
              <Card className="rounded-xl border-slate-200/80 shadow-sm bg-white overflow-hidden">
                <CardHeader className="border-b border-slate-100 bg-slate-50/30 px-6 py-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg font-semibold text-slate-900">{category.title}</CardTitle>
                      <CardDescription className="text-sm text-slate-500 mt-1">{category.description}</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {hasUnsavedChanges && activeCategory === category.id && (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                          Unsaved changes
                        </Badge>
                      )}
                      <Button variant="outline" size="sm" onClick={handleReset} disabled={isLoading} className="border-slate-200">
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {renderSettingsContent(category.id)}
                </CardContent>
                {/* Per-section action bar */}
                <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/30 flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { loadSettings().then(() => setHasUnsavedChanges(false)); }}
                    disabled={isLoading}
                    className="border-slate-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!hasUnsavedChanges || isLoading}
                    className="bg-slate-900 hover:bg-slate-800 text-white"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isLoading ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
