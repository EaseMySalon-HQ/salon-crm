"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  MessageCircle,
  Info,
  Receipt,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { EmailNotificationsAPI } from "@/lib/api"
import { useAddon } from "@/hooks/use-entitlements"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

export function WhatsAppBusinessSettings() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { canUse: addonCanUse, status: addonStatus, isLoading: addonLoading } = useAddon('whatsapp')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [adminConfig, setAdminConfig] = useState<{
    adminConfigured: boolean
    adminEnabled: boolean
    addonEnabled: boolean
    canUse: boolean
    provider: string
  } | null>(null)
  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  const [settings, setSettings] = useState({
    enabled: false,
    receiptNotifications: {
      enabled: true,
      autoSendToClients: true,
      highValueThreshold: 0
    },
    appointmentNotifications: {
      enabled: false,
      newAppointments: false,
      confirmations: false,
      reminders: false,
      reschedule: true,
      cancellations: false
    },
    systemAlerts: {
      enabled: false,
      lowInventory: false,
      paymentFailures: false
    }
  })

  useEffect(() => {
    loadStatus()
    loadSettings()
  }, [])

  const loadStatus = async () => {
    try {
      setIsLoadingStatus(true)
      const response = await fetch(`${API_URL}/email-notifications/whatsapp/status`, {
        credentials: 'include',
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAdminConfig(data.data)
        }
      }
    } catch (error) {
      console.error('Error loading WhatsApp status:', error)
    } finally {
      setIsLoadingStatus(false)
    }
  }

  const loadSettings = async () => {
    try {
      const response = await EmailNotificationsAPI.getSettings()
      if (response.success && response.data) {
        const whatsappSettings = response.data.whatsappNotificationSettings
        if (whatsappSettings) {
          // Ensure we preserve the enabled value even if it's false
          // Merge with current state to preserve any nested defaults
          setSettings(prev => ({
            ...prev,
            ...whatsappSettings,
            // Explicitly set enabled to preserve false values
            enabled: whatsappSettings.enabled !== undefined ? whatsappSettings.enabled : prev.enabled,
            // Merge nested objects while preserving their enabled states
            receiptNotifications: {
              ...prev.receiptNotifications,
              ...whatsappSettings.receiptNotifications,
              enabled: whatsappSettings.receiptNotifications?.enabled !== undefined 
                ? whatsappSettings.receiptNotifications.enabled 
                : prev.receiptNotifications.enabled
            },
            appointmentNotifications: {
              ...prev.appointmentNotifications,
              ...whatsappSettings.appointmentNotifications,
              enabled: whatsappSettings.appointmentNotifications?.enabled !== undefined 
                ? whatsappSettings.appointmentNotifications.enabled 
                : prev.appointmentNotifications.enabled
            },
            systemAlerts: {
              ...prev.systemAlerts,
              ...whatsappSettings.systemAlerts,
              enabled: whatsappSettings.systemAlerts?.enabled !== undefined 
                ? whatsappSettings.systemAlerts.enabled 
                : prev.systemAlerts.enabled
            }
          }))
        }
      }
    } catch (error) {
      console.error('Error loading WhatsApp settings:', error)
    }
  }

  const handleSave = async () => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Only admin/manager can save settings",
        variant: "destructive"
      })
      return
    }

    // Allow saving settings even if WhatsApp isn't fully configured
    // The settings determine IF WhatsApp should be used when it IS configured
    // Removed the adminConfig.canUse check to allow toggling the setting

    try {
      setIsLoading(true)
      const response = await EmailNotificationsAPI.updateSettings({
        whatsappNotificationSettings: settings
      })

      if (response.success) {
        toast({
          title: "Settings Saved",
          description: "WhatsApp notification settings have been updated successfully",
        })
      } else {
        throw new Error(response.error || 'Failed to save settings')
      }
    } catch (error: any) {
      console.error('Error saving WhatsApp settings:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to save WhatsApp settings",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const canUseWhatsApp = adminConfig?.canUse && !isLoadingStatus

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {!isLoadingStatus && (
        <Card className={adminConfig?.adminConfigured ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}>
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              {adminConfig?.adminConfigured ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {adminConfig?.adminConfigured 
                    ? "WhatsApp is configured by the system administrator."
                    : "WhatsApp is not configured. Please contact your administrator."}
                </p>
                {adminConfig && (
                  <div className="mt-2 space-y-1 text-xs text-gray-600">
                    <p>Admin Configuration: {adminConfig.adminEnabled ? "✅ Enabled" : "❌ Disabled"}</p>
                    <p>Business Addon: {adminConfig.addonEnabled ? "✅ Enabled" : "❌ Disabled"}</p>
                    {adminConfig.addonEnabled && (
                      <p>Quota: {addonStatus.used || 0} / {addonStatus.quota === Infinity ? "Unlimited" : addonStatus.quota} messages used</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!canUseWhatsApp && !isLoadingStatus && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <XCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium mb-2 text-gray-600">WhatsApp Not Available</p>
              <p className="text-sm text-gray-500">
                {!adminConfig?.adminConfigured 
                  ? "WhatsApp must be configured by the system administrator before you can use it."
                  : !adminConfig?.addonEnabled
                  ? "WhatsApp addon is not enabled for your business. Please contact support to enable it."
                  : "WhatsApp quota has been exhausted. Please contact support."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {canUseWhatsApp && (
        <>
          {/* Enable WhatsApp Notifications */}
          <Card className={settings.enabled ? "" : "border-gray-200 bg-gray-50"}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MessageCircle className={`h-5 w-5 ${settings.enabled ? "text-green-600" : "text-gray-400"}`} />
                <span>WhatsApp Notifications</span>
                {!settings.enabled && (
                  <Badge variant="secondary" className="ml-2">Disabled</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {settings.enabled 
                  ? "WhatsApp notifications are currently enabled for this business."
                  : "Turn on WhatsApp notifications to send receipts, appointment updates, and system alerts via WhatsApp."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable WhatsApp Notifications</Label>
                  <p className="text-sm text-gray-500">
                    {settings.enabled 
                      ? "WhatsApp notifications are active. Toggle off to disable all WhatsApp notifications."
                      : "Toggle on to enable WhatsApp notifications for your business."}
                  </p>
                </div>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(checked) => 
                    setSettings(prev => ({ ...prev, enabled: checked }))
                  }
                  disabled={!isAdmin}
                />
              </div>
              {!settings.enabled && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> When WhatsApp notifications are disabled, no WhatsApp messages will be sent, even if individual notification types are configured below.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receipt Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Receipt className="h-5 w-5 text-blue-600" />
                <span>Receipt Notifications</span>
              </CardTitle>
              <CardDescription>
                Send receipt links via WhatsApp to clients.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable Receipt Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Enable WhatsApp notifications for receipts and bills.
                  </p>
                </div>
                <Switch
                  checked={settings.receiptNotifications.enabled}
                  onCheckedChange={(checked) => 
                    setSettings(prev => ({
                      ...prev,
                      receiptNotifications: {
                        ...prev.receiptNotifications,
                        enabled: checked
                      }
                    }))
                  }
                  disabled={!isAdmin || !settings.enabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Auto-send to Clients</Label>
                  <p className="text-sm text-gray-500">
                    Automatically send receipts when created.
                  </p>
                </div>
                <Switch
                  checked={settings.receiptNotifications.autoSendToClients}
                  onCheckedChange={(checked) => 
                    setSettings(prev => ({
                      ...prev,
                      receiptNotifications: {
                        ...prev.receiptNotifications,
                        autoSendToClients: checked
                      }
                    }))
                  }
                  disabled={!isAdmin || !settings.enabled || !settings.receiptNotifications.enabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="highValueThreshold">High Value Threshold (₹)</Label>
                <Input
                  id="highValueThreshold"
                  type="number"
                  value={settings.receiptNotifications.highValueThreshold}
                  onChange={(e) => 
                    setSettings(prev => ({
                      ...prev,
                      receiptNotifications: {
                        ...prev.receiptNotifications,
                        highValueThreshold: parseFloat(e.target.value) || 0
                      }
                    }))
                  }
                  disabled={!isAdmin || !settings.enabled}
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-gray-500">
                  Only send WhatsApp for receipts above this amount (0 = all receipts).
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Appointment Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <span>Appointment Notifications</span>
              </CardTitle>
              <CardDescription>
                Send appointment updates via WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable Appointment Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Master toggle for all appointment-related WhatsApp messages.
                  </p>
                </div>
                <Switch
                  checked={settings.appointmentNotifications.enabled}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      appointmentNotifications: {
                        ...prev.appointmentNotifications,
                        enabled: checked,
                        ...(checked
                          ? { confirmations: true, newAppointments: true, reminders: true, cancellations: true }
                          : {}),
                      },
                    }))
                  }
                  disabled={!isAdmin || !settings.enabled}
                />
              </div>

              {settings.appointmentNotifications.enabled && (
                <div className="space-y-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Individual Templates</p>

                  <div className="flex items-center justify-between py-1.5">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Confirmation</Label>
                      <p className="text-xs text-gray-500">Sent when a new appointment is booked.</p>
                    </div>
                    <Switch
                      checked={settings.appointmentNotifications.confirmations}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({
                          ...prev,
                          appointmentNotifications: { ...prev.appointmentNotifications, confirmations: checked },
                        }))
                      }
                      disabled={!isAdmin || !settings.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between py-1.5">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Reminder</Label>
                      <p className="text-xs text-gray-500">Sent automatically 2–24 hours before the appointment.</p>
                    </div>
                    <Switch
                      checked={settings.appointmentNotifications.reminders}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({
                          ...prev,
                          appointmentNotifications: { ...prev.appointmentNotifications, reminders: checked },
                        }))
                      }
                      disabled={!isAdmin || !settings.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between py-1.5">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Reschedule</Label>
                      <p className="text-xs text-gray-500">Sent when an appointment date or time is changed.</p>
                    </div>
                    <Switch
                      checked={settings.appointmentNotifications.reschedule !== false}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({
                          ...prev,
                          appointmentNotifications: { ...prev.appointmentNotifications, reschedule: checked },
                        }))
                      }
                      disabled={!isAdmin || !settings.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between py-1.5">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Cancellation</Label>
                      <p className="text-xs text-gray-500">Sent when an appointment is cancelled.</p>
                    </div>
                    <Switch
                      checked={settings.appointmentNotifications.cancellations}
                      onCheckedChange={(checked) =>
                        setSettings((prev) => ({
                          ...prev,
                          appointmentNotifications: { ...prev.appointmentNotifications, cancellations: checked },
                        }))
                      }
                      disabled={!isAdmin || !settings.enabled}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* System Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span>System Alerts</span>
              </CardTitle>
              <CardDescription>
                Receive system alerts via WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable System Alerts</Label>
                  <p className="text-sm text-gray-500">
                    Receive alerts for low inventory, payment failures, and system errors.
                  </p>
                </div>
                <Switch
                  checked={settings.systemAlerts.enabled}
                  onCheckedChange={(checked) => 
                    setSettings(prev => ({
                      ...prev,
                      systemAlerts: {
                        ...prev.systemAlerts,
                        enabled: checked
                      }
                    }))
                  }
                  disabled={!isAdmin || !settings.enabled}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          {isAdmin && (
            <div className="flex justify-end">
              <Button 
                onClick={handleSave} 
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {isLoading ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

