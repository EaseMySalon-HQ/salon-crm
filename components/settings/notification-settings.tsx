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
import { Settings, Mail, Users, Clock, Calendar, Receipt, Download, AlertTriangle, TestTube, CheckCircle2, XCircle } from "lucide-react"
import { StaffEmailPreferencesModal } from "./staff-email-preferences-modal"

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
                <h2 className="text-2xl font-bold text-slate-800">Email Notification Settings</h2>
                <p className="text-slate-600">Configure email notifications for your business. Only admin/manager can manage these settings.</p>
              </div>
            </div>
            <Button onClick={handleTestEmail} variant="outline" className="flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              Send Test Email
            </Button>
          </div>
        </div>
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
    </div>
  )
}
