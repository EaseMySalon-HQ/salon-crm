"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, RotateCcw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getAdminAuthToken } from "@/lib/admin-auth-storage"
import { NotificationSettings } from "./admin-settings/notification-settings"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

function authHeaders(extra: HeadersInit = {}) {
  const token = getAdminAuthToken()
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }
}

export function AdminNotificationsPage() {
  const [settings, setSettings] = useState({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/settings/notifications`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setSettings(data.data ?? {})
      }
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "Failed to load settings", variant: "destructive" })
    }
  }

  const handleSettingsChange = (newSettings: any) => {
    setSettings(newSettings)
    setHasUnsavedChanges(true)
  }

  const handleSave = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}/admin/settings/notifications`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        setHasUnsavedChanges(false)
        toast({ title: "Saved", description: "Notification settings updated successfully." })
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to save")
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to save", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    if (confirm("Reset notification settings to defaults?")) {
      setHasUnsavedChanges(false)
      loadSettings()
      toast({ title: "Reset", description: "Settings reloaded." })
    }
  }

  return (
    <div className="space-y-8 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Notifications & Alerts</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-xl">
            Email, SMS, and WhatsApp notification configuration for business alerts
          </p>
        </div>
      </div>

      <Card className="rounded-xl border-slate-200/80 shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/30 px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900">Notifications & Alerts</CardTitle>
              <CardDescription className="text-sm text-slate-500 mt-1">
                System notifications and alert configuration
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleReset} disabled={isLoading} className="border-slate-200">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <NotificationSettings settings={settings} onSettingsChange={handleSettingsChange} />
        </CardContent>
        <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/30 flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={() => loadSettings().then(() => setHasUnsavedChanges(false))} disabled={isLoading} className="border-slate-200">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasUnsavedChanges || isLoading} className="bg-slate-900 hover:bg-slate-800 text-white">
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
