"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { Settings, Lock } from "lucide-react"

export function GeneralSettings() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission("general_settings", "edit")
  const [settings, setSettings] = useState({
    language: "en",
    timezone: "America/New_York",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    currency: "USD",
    darkMode: false,
    notifications: true,
    autoSave: true,
  })
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSave = async () => {
    setIsLoading(true)
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      toast({
        title: "Settings saved",
        description: "Your general settings have been updated successfully.",
      })
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Settings className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">General Settings</h2>
              <p className="text-slate-600">Basic application preferences and configurations</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Localization Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center">
                <Settings className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Localization</h3>
                <p className="text-slate-600 text-sm">Configure language, timezone, and format preferences</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="language" className="text-sm font-medium text-slate-700">Language</Label>
                  <Select
                    value={settings.language}
                    onValueChange={(value) => setSettings({ ...settings, language: value })}
                  >
                    <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="timezone" className="text-sm font-medium text-slate-700">Timezone</Label>
                  <Select
                    value={settings.timezone}
                    onValueChange={(value) => setSettings({ ...settings, timezone: value })}
                  >
                    <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="dateFormat" className="text-sm font-medium text-slate-700">Date Format</Label>
                  <Select
                    value={settings.dateFormat}
                    onValueChange={(value) => setSettings({ ...settings, dateFormat: value })}
                  >
                    <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="timeFormat" className="text-sm font-medium text-slate-700">Time Format</Label>
                  <Select
                    value={settings.timeFormat}
                    onValueChange={(value) => setSettings({ ...settings, timeFormat: value })}
                  >
                    <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12h">12-hour</SelectItem>
                      <SelectItem value="24h">24-hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Preferences Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-lg flex items-center justify-center">
                <Settings className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Application Preferences</h3>
                <p className="text-slate-600 text-sm">Customize your application experience</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-700">Dark Mode</Label>
                  <p className="text-sm text-slate-600">Enable dark theme</p>
                </div>
                <Switch
                  checked={settings.darkMode}
                  onCheckedChange={(checked) => setSettings({ ...settings, darkMode: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-700">Notifications</Label>
                  <p className="text-sm text-slate-600">Receive system notifications</p>
                </div>
                <Switch
                  checked={settings.notifications}
                  onCheckedChange={(checked) => setSettings({ ...settings, notifications: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-700">Auto Save</Label>
                  <p className="text-sm text-slate-600">Automatically save changes</p>
                </div>
                <Switch
                  checked={settings.autoSave}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoSave: checked })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end items-center gap-3">
        {!canEdit && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> You don't have permission to edit general settings
          </span>
        )}
        <Button
          onClick={handleSave}
          disabled={isLoading || !canEdit}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium disabled:opacity-60"
        >
          {isLoading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
