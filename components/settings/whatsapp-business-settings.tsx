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
  BarChart3,
  Clock,
  Receipt,
  Calendar,
  AlertTriangle
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { WhatsAppAPI } from "@/lib/api"
import { EmailNotificationsAPI } from "@/lib/api"

export function WhatsAppBusinessSettings() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [trackingData, setTrackingData] = useState<any>(null)
  const [isLoadingTracking, setIsLoadingTracking] = useState(false)
  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  const [settings, setSettings] = useState({
    enabled: true,
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
      cancellations: false
    },
    systemAlerts: {
      enabled: false,
      lowInventory: false,
      paymentFailures: false
    }
  })

  useEffect(() => {
    loadSettings()
    loadTrackingData()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await EmailNotificationsAPI.getSettings()
      console.log('📥 [Frontend] Loaded settings response:', response)
      if (response.success && response.data) {
        // Map email notification settings structure to WhatsApp
        // WhatsApp settings are stored in the same structure
        const whatsappSettings = response.data.whatsappNotificationSettings || settings
        console.log('📥 [Frontend] WhatsApp settings from response:', {
          enabled: whatsappSettings?.enabled,
          receiptNotificationsEnabled: whatsappSettings?.receiptNotifications?.enabled,
          fullSettings: JSON.stringify(whatsappSettings, null, 2)
        })
        setSettings(whatsappSettings)
      } else {
        console.warn('📥 [Frontend] No WhatsApp settings in response, using defaults')
      }
    } catch (error) {
      console.error('Error loading WhatsApp settings:', error)
    }
  }

  const loadTrackingData = async () => {
    setIsLoadingTracking(true)
    try {
      const result = await WhatsAppAPI.getBusinessTracking()
      if (result.success) {
        setTrackingData(result.data)
      } else {
        // If API returns error, set empty data instead of showing error
        setTrackingData(null)
      }
    } catch (error: any) {
      console.error('Error loading tracking data:', error)
      // Don't show error toast for 404 - route might not be available yet
      if (error?.response?.status !== 404) {
        toast({
          title: "Error",
          description: "Failed to load WhatsApp tracking data",
          variant: "destructive",
        })
      }
      setTrackingData(null)
    } finally {
      setIsLoadingTracking(false)
    }
  }

  const handleSave = async () => {
    if (!isAdmin) {
      toast({
        title: "Unauthorized",
        description: "Only admin/manager can manage WhatsApp notifications",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      console.log('📤 [Frontend] Sending WhatsApp settings to save:', {
        enabled: settings.enabled,
        receiptNotificationsEnabled: settings.receiptNotifications?.enabled,
        fullSettings: JSON.stringify(settings, null, 2)
      });
      
      // Update via email notifications API (same endpoint structure)
      const response = await EmailNotificationsAPI.updateSettings({
        whatsappNotificationSettings: settings
      })
      
      console.log('📥 [Frontend] Save response:', {
        success: response.success,
        hasData: !!response.data?.whatsappNotificationSettings,
        enabled: response.data?.whatsappNotificationSettings?.enabled,
        receiptNotificationsEnabled: response.data?.whatsappNotificationSettings?.receiptNotifications?.enabled
      });
      
      if (response.success) {
        // Update local state with the saved data from server
        if (response.data?.whatsappNotificationSettings) {
          console.log('📥 Received saved WhatsApp settings from server:', response.data.whatsappNotificationSettings)
          setSettings(response.data.whatsappNotificationSettings)
        } else {
          // If response doesn't include the data, reload from server
          console.log('📥 No data in response, reloading from server...')
          await loadSettings()
        }
        toast({
          title: "Settings saved",
          description: "WhatsApp notification settings have been updated successfully.",
        })
      } else {
        throw new Error(response.error || 'Failed to save settings')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save WhatsApp notification settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSettingChange = (path: string, value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev }
      const keys = path.split('.')
      let current = newSettings
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {}
        }
        current = current[keys[i]]
      }
      
      current[keys[keys.length - 1]] = value
      return newSettings
    })
  }

  if (!isAdmin) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-600">Only admin/manager can manage WhatsApp notifications</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">WhatsApp Configuration</p>
              <p className="text-xs text-blue-700 mt-1">
                WhatsApp is configured by the system administrator. You can enable or disable notifications for your business here.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enable WhatsApp */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <span>Enable WhatsApp Notifications</span>
          </CardTitle>
          <CardDescription>
            Enable WhatsApp notifications for this business
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Enable WhatsApp</Label>
              <p className="text-xs text-gray-500">
                Turn on WhatsApp notifications for your business
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {settings.enabled && (
        <>
          {/* Receipt Notifications */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-blue-600" />
                  <CardTitle>Receipt Notifications</CardTitle>
                </div>
                <Switch
                  checked={settings.receiptNotifications.enabled}
                  onCheckedChange={(checked) =>
                    handleSettingChange('receiptNotifications.enabled', checked)
                  }
                />
              </div>
              <CardDescription>
                Send receipt links via WhatsApp to clients
              </CardDescription>
            </CardHeader>
            {settings.receiptNotifications.enabled && (
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Auto-send to Clients</Label>
                    <p className="text-xs text-gray-500">
                      Automatically send receipts when created
                    </p>
                  </div>
                  <Switch
                    checked={settings.receiptNotifications.autoSendToClients}
                    onCheckedChange={(checked) =>
                      handleSettingChange('receiptNotifications.autoSendToClients', checked)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="highValueThreshold">High Value Threshold (₹)</Label>
                  <Input
                    id="highValueThreshold"
                    type="number"
                    min="0"
                    value={settings.receiptNotifications.highValueThreshold}
                    onChange={(e) =>
                      handleSettingChange('receiptNotifications.highValueThreshold', parseFloat(e.target.value) || 0)
                    }
                    className="w-full"
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-500">
                    Only send WhatsApp for receipts above this amount (0 = all receipts)
                  </p>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Appointment Notifications */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <CardTitle>Appointment Notifications</CardTitle>
                </div>
                <Switch
                  checked={settings.appointmentNotifications.enabled}
                  onCheckedChange={(checked) =>
                    handleSettingChange('appointmentNotifications.enabled', checked)
                  }
                />
              </div>
              <CardDescription>
                Send appointment updates via WhatsApp
              </CardDescription>
            </CardHeader>
            {settings.appointmentNotifications.enabled && (
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>New Appointments</Label>
                    <p className="text-xs text-gray-500">
                      Notify when new appointments are created
                    </p>
                  </div>
                  <Switch
                    checked={settings.appointmentNotifications.newAppointments}
                    onCheckedChange={(checked) =>
                      handleSettingChange('appointmentNotifications.newAppointments', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Confirmations</Label>
                    <p className="text-xs text-gray-500">
                      Send appointment confirmation messages
                    </p>
                  </div>
                  <Switch
                    checked={settings.appointmentNotifications.confirmations}
                    onCheckedChange={(checked) =>
                      handleSettingChange('appointmentNotifications.confirmations', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Reminders</Label>
                    <p className="text-xs text-gray-500">
                      Send appointment reminders
                    </p>
                  </div>
                  <Switch
                    checked={settings.appointmentNotifications.reminders}
                    onCheckedChange={(checked) =>
                      handleSettingChange('appointmentNotifications.reminders', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Cancellations</Label>
                    <p className="text-xs text-gray-500">
                      Notify when appointments are cancelled
                    </p>
                  </div>
                  <Switch
                    checked={settings.appointmentNotifications.cancellations}
                    onCheckedChange={(checked) =>
                      handleSettingChange('appointmentNotifications.cancellations', checked)
                    }
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* System Alerts */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <CardTitle>System Alerts</CardTitle>
                </div>
                <Switch
                  checked={settings.systemAlerts.enabled}
                  onCheckedChange={(checked) =>
                    handleSettingChange('systemAlerts.enabled', checked)
                  }
                />
              </div>
              <CardDescription>
                Receive system alerts via WhatsApp
              </CardDescription>
            </CardHeader>
            {settings.systemAlerts.enabled && (
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Low Inventory</Label>
                    <p className="text-xs text-gray-500">
                      Alert when inventory is low
                    </p>
                  </div>
                  <Switch
                    checked={settings.systemAlerts.lowInventory}
                    onCheckedChange={(checked) =>
                      handleSettingChange('systemAlerts.lowInventory', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Payment Failures</Label>
                    <p className="text-xs text-gray-500">
                      Alert on payment processing failures
                    </p>
                  </div>
                  <Switch
                    checked={settings.systemAlerts.paymentFailures}
                    onCheckedChange={(checked) =>
                      handleSettingChange('systemAlerts.paymentFailures', checked)
                    }
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Activity Tracking */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-purple-600" />
                <span>WhatsApp Activity</span>
              </CardTitle>
              <CardDescription>
                View WhatsApp message statistics for this business
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTracking ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-8 w-8 mx-auto mb-2 animate-spin" />
                  <p>Loading tracking data...</p>
                </div>
              ) : trackingData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-600">Messages Sent</p>
                      <p className="text-2xl font-bold text-blue-600">{trackingData.totalMessages || 0}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-gray-600">Success Rate</p>
                      <p className="text-2xl font-bold text-green-600">{trackingData.successRate || 0}%</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-sm text-gray-600">Failed</p>
                      <p className="text-2xl font-bold text-red-600">{trackingData.failedMessages || 0}</p>
                    </div>
                  </div>

                  {trackingData.recentMessages && trackingData.recentMessages.length > 0 && (
                    <div className="mt-6">
                      <h4 className="font-semibold mb-3">Recent Activity</h4>
                      <div className="space-y-2">
                        {trackingData.recentMessages.slice(0, 10).map((msg: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">{msg.recipientPhone}</span>
                              <Badge variant={msg.status === 'sent' ? 'default' : 'destructive'}>
                                {msg.status}
                              </Badge>
                              <span className="text-xs text-gray-500">{msg.messageType}</span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(msg.timestamp).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No tracking data available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

