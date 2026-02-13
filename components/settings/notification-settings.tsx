"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { EmailNotificationsAPI } from "@/lib/api"
import { Settings, Mail, Users, Clock, Calendar, Receipt, Download, AlertTriangle, TestTube, CheckCircle2, XCircle, MessageCircle } from "lucide-react"
import { StaffEmailPreferencesModal } from "./staff-email-preferences-modal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WhatsAppBusinessSettings } from "./whatsapp-business-settings"

interface StaffMember {
  _id: string
  name: string
  email: string
  role: string
  hasLoginAccess: boolean
  emailNotifications?: {
    enabled: boolean
    preferences?: {
      dailySummary?: boolean
      weeklySummary?: boolean
      appointmentAlerts?: boolean
      receiptAlerts?: boolean
      exportAlerts?: boolean
      systemAlerts?: boolean
      lowInventory?: boolean
    }
  }
}

export function NotificationSettings() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingStaff, setIsLoadingStaff] = useState(false)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false)
  
  // Filter to only show staff members with email notifications enabled
  const staffWithEmailNotifications = staffMembers.filter(staff => 
    staff.emailNotifications?.enabled === true
  )
  
  const [settings, setSettings] = useState({
    enabled: false,
    recipientStaffIds: [] as string[],
    dailySummary: {
      enabled: false,
      mode: "fixedTime" as "fixedTime" | "afterClosing",
      time: "21:00",
      recipientStaffIds: [] as string[]
    },
    weeklySummary: {
      enabled: false,
      day: "sunday",
      time: "20:00",
      recipientStaffIds: [] as string[]
    },
    appointmentNotifications: {
      enabled: false,
      newAppointments: false,
      cancellations: false,
      noShows: false,
      reminders: false,
      reminderHoursBefore: 24,
      recipientStaffIds: [] as string[]
    },
    receiptNotifications: {
      enabled: false,
      sendToClients: true,
      sendToStaff: false,
      highValueThreshold: 0,
      recipientStaffIds: [] as string[]
    },
    exportNotifications: {
      enabled: false,
      recipientStaffIds: [] as string[]
    },
    systemAlerts: {
      enabled: false,
      lowInventory: false,
      paymentFailures: false,
      systemErrors: false,
      recipientStaffIds: [] as string[]
    }
  })

  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  // Load settings and staff on mount
  useEffect(() => {
    loadSettings()
    loadStaff()
  }, [])
  
  // Sync recipient lists with staff individual preferences
  useEffect(() => {
    if (staffMembers.length > 0) {
      setSettings(prev => {
        const newSettings = { ...prev }
        
        // For Daily Summary - only include staff who have dailySummary preference enabled
        const dailySummaryRecipients = staffMembers
          .filter(staff => 
            staff.emailNotifications?.enabled === true && 
            staff.emailNotifications?.preferences?.dailySummary === true
          )
          .map(staff => staff._id)
        
        // For Weekly Summary - only include staff who have weeklySummary preference enabled
        const weeklySummaryRecipients = staffMembers
          .filter(staff => 
            staff.emailNotifications?.enabled === true && 
            staff.emailNotifications?.preferences?.weeklySummary === true
          )
          .map(staff => staff._id)
        
        // General recipients - all staff with email notifications enabled
        const generalRecipients = staffMembers
          .filter(staff => staff.emailNotifications?.enabled === true)
          .map(staff => staff._id)
        
        newSettings.recipientStaffIds = generalRecipients
        newSettings.dailySummary.recipientStaffIds = dailySummaryRecipients
        newSettings.weeklySummary.recipientStaffIds = weeklySummaryRecipients
        
        return newSettings
      })
    }
  }, [staffMembers])

  const loadSettings = async () => {
    try {
      const response = await EmailNotificationsAPI.getSettings()
      if (response.success && response.data) {
        setSettings({
          enabled: response.data.enabled || false,
          recipientStaffIds: response.data.recipientStaffIds || [],
          dailySummary: {
            enabled: response.data.dailySummary?.enabled || false,
            mode: (response.data.dailySummary?.mode as "fixedTime" | "afterClosing") || "fixedTime",
            time: response.data.dailySummary?.time || "21:00",
            recipientStaffIds: response.data.dailySummary?.recipientStaffIds || []
          },
          weeklySummary: {
            enabled: response.data.weeklySummary?.enabled || false,
            day: response.data.weeklySummary?.day || "sunday",
            time: response.data.weeklySummary?.time || "20:00",
            recipientStaffIds: response.data.weeklySummary?.recipientStaffIds || []
          },
          appointmentNotifications: {
            enabled: response.data.appointmentNotifications?.enabled || false,
            newAppointments: response.data.appointmentNotifications?.newAppointments || false,
            cancellations: response.data.appointmentNotifications?.cancellations || false,
            noShows: response.data.appointmentNotifications?.noShows || false,
            reminders: response.data.appointmentNotifications?.reminders || false,
            reminderHoursBefore: response.data.appointmentNotifications?.reminderHoursBefore || 24,
            recipientStaffIds: response.data.appointmentNotifications?.recipientStaffIds || []
          },
          receiptNotifications: {
            enabled: response.data.receiptNotifications?.enabled || false,
            sendToClients: response.data.receiptNotifications?.sendToClients !== false,
            sendToStaff: response.data.receiptNotifications?.sendToStaff || false,
            highValueThreshold: response.data.receiptNotifications?.highValueThreshold || 0,
            recipientStaffIds: response.data.receiptNotifications?.recipientStaffIds || []
          },
          exportNotifications: {
            enabled: response.data.exportNotifications?.enabled || false,
            recipientStaffIds: response.data.exportNotifications?.recipientStaffIds || []
          },
          systemAlerts: {
            enabled: response.data.systemAlerts?.enabled || false,
            lowInventory: response.data.systemAlerts?.lowInventory || false,
            paymentFailures: response.data.systemAlerts?.paymentFailures || false,
            systemErrors: response.data.systemAlerts?.systemErrors || false,
            recipientStaffIds: response.data.systemAlerts?.recipientStaffIds || []
          }
        })
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const loadStaff = async () => {
    setIsLoadingStaff(true)
    try {
      const response = await EmailNotificationsAPI.getStaff()
      console.log('📧 Staff API Response:', response)
      if (response.success && response.data) {
        console.log('📧 Staff Members Data:', response.data)
        console.log('📧 Staff Count:', response.data.length)
        setStaffMembers(response.data)
      } else {
        console.warn('📧 No staff data in response:', response)
      }
    } catch (error) {
      console.error('Error loading staff:', error)
      toast({
        title: "Error",
        description: "Failed to load staff members",
        variant: "destructive",
      })
    } finally {
      setIsLoadingStaff(false)
    }
  }

  const handleSave = async () => {
    if (!isAdmin) {
      toast({
        title: "Unauthorized",
        description: "Only admin/manager can manage email notifications",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await EmailNotificationsAPI.updateSettings(settings)
      if (response.success) {
        toast({
          title: "Settings saved",
          description: "Email notification settings have been updated successfully.",
        })
      } else {
        throw new Error(response.error || 'Failed to save settings')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save notification settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestEmail = async () => {
    if (!user?.email) {
      toast({
        title: "Error",
        description: "No email address found",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await EmailNotificationsAPI.sendTestEmail(user.email)
      if (response.success) {
        toast({
          title: "Test email sent",
          description: `Test email sent to ${user.email}`,
        })
      } else {
        throw new Error(response.error || 'Failed to send test email')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send test email",
        variant: "destructive",
      })
    }
  }

  const toggleStaffSelection = (staffId: string, notificationType: 'general' | 'dailySummary' | 'weeklySummary' | 'appointmentNotifications' | 'receiptNotifications' | 'exportNotifications' | 'systemAlerts') => {
    setSettings(prev => {
      const newSettings = { ...prev }
      const key = notificationType === 'general' ? 'recipientStaffIds' : `${notificationType}.recipientStaffIds`
      const currentIds = notificationType === 'general' 
        ? prev.recipientStaffIds 
        : (prev[notificationType] as any).recipientStaffIds || []
      
      const newIds = currentIds.includes(staffId)
        ? currentIds.filter((id: string) => id !== staffId)
        : [...currentIds, staffId]
      
      if (notificationType === 'general') {
        newSettings.recipientStaffIds = newIds
      } else {
        (newSettings[notificationType] as any).recipientStaffIds = newIds
      }
      
      return newSettings
    })
  }

  const openPreferencesModal = (staffId: string) => {
    setSelectedStaffId(staffId)
    setIsPreferencesModalOpen(true)
  }

  const handleStaffPreferencesUpdate = async () => {
    await loadStaff()
    // Sync recipient lists with staff preferences after update
    await loadSettings()
    setIsPreferencesModalOpen(false)
    setSelectedStaffId(null)
  }

  if (!isAdmin) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-600">Only admin/manager can manage email notifications</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Notification Settings</h2>
                <p className="text-slate-600">Configure notifications for your business. Only admin/manager can manage these settings.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="email" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="sms" className="flex items-center gap-2" disabled>
            <AlertTriangle className="h-4 w-4" />
            SMS
            <Badge variant="secondary" className="ml-2">Coming Soon</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="space-y-6 mt-6">
          <div className="flex justify-end">
            <Button onClick={handleTestEmail} variant="outline" className="flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              Send Test Email
            </Button>
          </div>

      {/* Email Notification Types Configuration */}
      <div className="space-y-4">
        {/* Daily Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <CardTitle>Daily Summary</CardTitle>
              </div>
              <Switch
                checked={settings.dailySummary.enabled}
                onCheckedChange={(checked) =>
                  setSettings(prev => ({
                    ...prev,
                    dailySummary: { ...prev.dailySummary, enabled: checked }
                  }))
                }
              />
            </div>
            <CardDescription>
              Receive daily summary emails with sales, appointments, and new clients
            </CardDescription>
          </CardHeader>
          {settings.dailySummary.enabled && (
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label>When to send</Label>
                <Select
                  value={settings.dailySummary.mode}
                  onValueChange={(value) =>
                    setSettings(prev => ({
                      ...prev,
                      dailySummary: { ...prev.dailySummary, mode: value as "fixedTime" | "afterClosing" }
                    }))
                  }
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixedTime">At a fixed time every day</SelectItem>
                    <SelectItem value="afterClosing">After status is verified for that day</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {settings.dailySummary.mode === "fixedTime" && (
                <div className="flex items-center justify-between">
                  <Label>Send Time</Label>
                  <Select
                    value={settings.dailySummary.time}
                    onValueChange={(value) =>
                      setSettings(prev => ({
                        ...prev,
                        dailySummary: { ...prev.dailySummary, time: value }
                      }))
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => {
                        const hour = i.toString().padStart(2, '0');
                        return (
                          <SelectItem key={hour} value={`${hour}:00`}>
                            {hour}:00
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {settings.dailySummary.mode === "afterClosing" && (
                <p className="text-sm text-slate-500">
                  Daily summary will be sent when the day&apos;s cash registry status is verified.
                </p>
              )}
            </CardContent>
          )}
        </Card>

        {/* Weekly Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <CardTitle>Weekly Summary</CardTitle>
              </div>
              <Switch
                checked={settings.weeklySummary.enabled}
                onCheckedChange={(checked) =>
                  setSettings(prev => ({
                    ...prev,
                    weeklySummary: { ...prev.weeklySummary, enabled: checked }
                  }))
                }
              />
            </div>
            <CardDescription>
              Receive weekly summary emails with revenue, growth, and performance metrics
            </CardDescription>
          </CardHeader>
          {settings.weeklySummary.enabled && (
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Day of Week</Label>
                <Select
                  value={settings.weeklySummary.day}
                  onValueChange={(value) =>
                    setSettings(prev => ({
                      ...prev,
                      weeklySummary: { ...prev.weeklySummary, day: value }
                    }))
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sunday">Sunday</SelectItem>
                    <SelectItem value="monday">Monday</SelectItem>
                    <SelectItem value="tuesday">Tuesday</SelectItem>
                    <SelectItem value="wednesday">Wednesday</SelectItem>
                    <SelectItem value="thursday">Thursday</SelectItem>
                    <SelectItem value="friday">Friday</SelectItem>
                    <SelectItem value="saturday">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Send Time</Label>
                <Select
                  value={settings.weeklySummary.time}
                  onValueChange={(value) =>
                    setSettings(prev => ({
                      ...prev,
                      weeklySummary: { ...prev.weeklySummary, time: value }
                    }))
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => {
                      const hour = i.toString().padStart(2, '0');
                      return (
                        <SelectItem key={hour} value={`${hour}:00`}>
                          {hour}:00
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Appointment Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-green-600" />
                <CardTitle>Appointment Notifications</CardTitle>
              </div>
              <Switch
                checked={settings.appointmentNotifications.enabled}
                onCheckedChange={(checked) =>
                  setSettings(prev => ({
                    ...prev,
                    appointmentNotifications: { ...prev.appointmentNotifications, enabled: checked }
                  }))
                }
              />
            </div>
            <CardDescription>
              Receive alerts for new appointments, cancellations, and reminders
            </CardDescription>
          </CardHeader>
          {settings.appointmentNotifications.enabled && (
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>New Appointments</Label>
                  <p className="text-xs text-slate-500">Alert when a new appointment is created</p>
                </div>
                <Switch
                  checked={settings.appointmentNotifications.newAppointments}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      appointmentNotifications: {
                        ...prev.appointmentNotifications,
                        newAppointments: checked
                      }
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>Cancellations</Label>
                  <p className="text-xs text-slate-500">Alert when an appointment is cancelled</p>
                </div>
                <Switch
                  checked={settings.appointmentNotifications.cancellations}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      appointmentNotifications: {
                        ...prev.appointmentNotifications,
                        cancellations: checked
                      }
                    }))
                  }
                />
              </div>
            </CardContent>
          )}
        </Card>

        {/* Receipt Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-purple-600" />
                <CardTitle>Receipt Notifications</CardTitle>
              </div>
              <Switch
                checked={settings.receiptNotifications.enabled}
                onCheckedChange={(checked) =>
                  setSettings(prev => ({
                    ...prev,
                    receiptNotifications: { ...prev.receiptNotifications, enabled: checked }
                  }))
                }
              />
            </div>
            <CardDescription>
              Configure receipt email notifications for clients and staff
            </CardDescription>
          </CardHeader>
          {settings.receiptNotifications.enabled && (
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>Send to Clients</Label>
                  <p className="text-xs text-slate-500">Automatically email receipts to clients</p>
                </div>
                <Switch
                  checked={settings.receiptNotifications.sendToClients}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      receiptNotifications: {
                        ...prev.receiptNotifications,
                        sendToClients: checked
                      }
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>Send to Staff</Label>
                  <p className="text-xs text-slate-500">Notify staff when receipts are generated</p>
                </div>
                <Switch
                  checked={settings.receiptNotifications.sendToStaff}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      receiptNotifications: {
                        ...prev.receiptNotifications,
                        sendToStaff: checked
                      }
                    }))
                  }
                />
              </div>
            </CardContent>
          )}
        </Card>

        {/* Export Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-orange-600" />
                <CardTitle>Export Notifications</CardTitle>
              </div>
              <Switch
                checked={settings.exportNotifications.enabled}
                onCheckedChange={(checked) =>
                  setSettings(prev => ({
                    ...prev,
                    exportNotifications: { ...prev.exportNotifications, enabled: checked }
                  }))
                }
              />
            </div>
            <CardDescription>
              Receive notifications when data exports are ready
            </CardDescription>
          </CardHeader>
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
                  setSettings(prev => ({
                    ...prev,
                    systemAlerts: { ...prev.systemAlerts, enabled: checked }
                  }))
                }
              />
            </div>
            <CardDescription>
              Receive alerts for system errors, low inventory, and payment failures
            </CardDescription>
          </CardHeader>
          {settings.systemAlerts.enabled && (
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <Label>Low Inventory</Label>
                  <p className="text-xs text-slate-500">Alert when product stock is low</p>
                </div>
                <Switch
                  checked={settings.systemAlerts.lowInventory}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      systemAlerts: {
                        ...prev.systemAlerts,
                        lowInventory: checked
                      }
                    }))
                  }
                />
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Staff Recipients Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Select Email Recipients
          </CardTitle>
          <CardDescription>
            Choose which staff members should receive email notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingStaff ? (
            <div className="text-center py-8">Loading staff members...</div>
          ) : staffWithEmailNotifications.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No staff members with email notifications enabled</div>
          ) : (
            <div className="space-y-3">
              {staffWithEmailNotifications.map((staff) => (
                <div
                  key={staff._id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-slate-900">{staff.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {staff.role}
                      </Badge>
                      {staff.hasLoginAccess ? (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                          Has Login
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">
                          No Login
                        </Badge>
                      )}
                      {staff.emailNotifications?.enabled ? (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Notifications ON
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600">
                          <XCircle className="h-3 w-3 mr-1" />
                          Notifications OFF
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{staff.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={settings.recipientStaffIds.includes(staff._id)}
                      onCheckedChange={() => toggleStaffSelection(staff._id, 'general')}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openPreferencesModal(staff._id)}
                      disabled={!settings.recipientStaffIds.includes(staff._id)}
                    >
                      Configure
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>


      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button
          onClick={handleSave}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium"
        >
          {isLoading ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Staff Preferences Modal */}
      {selectedStaffId && (
        <StaffEmailPreferencesModal
          isOpen={isPreferencesModalOpen}
          onClose={() => {
            setIsPreferencesModalOpen(false)
            setSelectedStaffId(null)
          }}
          staff={staffMembers.find(s => s._id === selectedStaffId)}
          onUpdate={handleStaffPreferencesUpdate}
        />
      )}
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-6">
          <WhatsAppBusinessSettings />
        </TabsContent>

        <TabsContent value="sms" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-green-600" />
                <span>SMS Configuration</span>
              </CardTitle>
              <CardDescription>
                SMS notifications are coming soon
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">SMS Notifications Coming Soon</p>
                <p className="text-sm">We're working on adding SMS notification support. Stay tuned!</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
