"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { EmailNotificationsAPI } from "@/lib/api"
import { Mail, Users, TestTube, CheckCircle2, XCircle, MessageCircle, Lock, Banknote, BarChart3, Loader2, TrendingUp, CalendarDays } from "lucide-react"
import { StaffEmailPreferencesModal } from "./staff-email-preferences-modal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WhatsAppNotificationSettings } from "./whatsapp-business-settings"
import { useFeature } from "@/hooks/use-entitlements"

interface StaffMember {
  _id: string
  name: string
  email: string
  role: string
  hasLoginAccess: boolean
  /** True when this row is a main-DB User injected for display (not a Staff document) */
  isOwner?: boolean
  emailNotifications?: {
    enabled: boolean
    preferences?: {
      dailySummary?: boolean
      weeklySummary?: boolean
      monthlySummary?: boolean
      staffIncentiveSummary?: boolean
      payrollSlip?: boolean
      timesheetReport?: boolean
      appointmentAlerts?: boolean
      receiptAlerts?: boolean
      exportAlerts?: boolean
      systemAlerts?: boolean
      lowInventory?: boolean
      allowReportsDelivery?: boolean
    }
  }
}

function idInRecipientList(staffId: string, recipientStaffIds: string[]) {
  return recipientStaffIds.some((id) => String(id) === String(staffId))
}

function isAdminStaffMember(staff: StaffMember): boolean {
  return staff.role === "admin"
}

function staffEmailNotificationsOn(staff: StaffMember): boolean {
  if (isAdminStaffMember(staff)) return !!staff.email
  return staff.emailNotifications?.enabled === true
}

type EmailPrefKey = keyof NonNullable<NonNullable<StaffMember["emailNotifications"]>["preferences"]>

function staffWantsEmailPref(
  staff: StaffMember,
  pref: EmailPrefKey,
  plan: { canPayroll: boolean; canIncentive: boolean }
): boolean {
  if (staff.isOwner) return false
  if (!staff.email) return false
  if (isAdminStaffMember(staff)) {
    if (pref === "payrollSlip" && !plan.canPayroll) return false
    if (pref === "staffIncentiveSummary" && !plan.canIncentive) return false
    return staff.emailNotifications?.preferences?.[pref] !== false
  }
  return (
    staff.emailNotifications?.enabled === true &&
    staff.emailNotifications?.preferences?.[pref] === true
  )
}

export function NotificationSettings() {
  const { user, hasPermission } = useAuth()
  const { hasAccess: canPayroll } = useFeature("payroll")
  const { hasAccess: canIncentive } = useFeature("incentive_management")
  const canEdit = hasPermission("notification_settings", "edit")
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isSendingDailySummary, setIsSendingDailySummary] = useState(false)
  const [isSendingWeeklySummary, setIsSendingWeeklySummary] = useState(false)
  const [isSendingMonthlySummary, setIsSendingMonthlySummary] = useState(false)
  const [isLoadingStaff, setIsLoadingStaff] = useState(false)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false)
  
  const staffWithEmailNotifications = staffMembers.filter((staff) => staffEmailNotificationsOn(staff))
  
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
      day: "monday",
      time: "09:00",
      recipientStaffIds: [] as string[]
    },
    monthlySummary: {
      enabled: false,
      time: "09:00",
      recipientStaffIds: [] as string[]
    },
    staffIncentiveSummary: {
      enabled: false,
      time: "12:00",
      recipientStaffIds: [] as string[]
    },
    payrollNotifications: {
      enabled: true,
      time: "12:00",
      attachSalarySlip: true,
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
  /** Local dev only — not shown in production builds */
  const showDevEmailTest = process.env.NODE_ENV === "development"

  // Load settings and staff on mount
  useEffect(() => {
    loadSettings()
    loadStaff()
  }, [])
  
  // Sync recipient lists from staff — only real Staff IDs belong in settings (server jobs use Staff.find).
  // Exclude synthetic User rows (isOwner) from merged IDs so loadSettings() does not fight the UI for admins.
  useEffect(() => {
    if (staffMembers.length > 0) {
      setSettings((prev) => {
        const newSettings = { ...prev }
        const plan = { canPayroll, canIncentive }

        const generalRecipients = staffMembers
          .filter((staff) => !staff.isOwner && staffEmailNotificationsOn(staff))
          .map((staff) => staff._id)

        const dailySummaryRecipients = staffMembers
          .filter((staff) => staffWantsEmailPref(staff, "dailySummary", plan))
          .map((staff) => staff._id)

        const weeklySummaryRecipients = staffMembers
          .filter((staff) => staffWantsEmailPref(staff, "weeklySummary", plan))
          .map((staff) => staff._id)

        const monthlySummaryRecipients = staffMembers
          .filter((staff) => staffWantsEmailPref(staff, "monthlySummary", plan))
          .map((staff) => staff._id)

        const staffIncentiveRecipients = staffMembers
          .filter((staff) => staffWantsEmailPref(staff, "staffIncentiveSummary", plan))
          .map((staff) => staff._id)

        const payrollRecipients = staffMembers
          .filter((staff) => staffWantsEmailPref(staff, "payrollSlip", plan))
          .map((staff) => staff._id)

        newSettings.recipientStaffIds = generalRecipients
        newSettings.dailySummary.recipientStaffIds = dailySummaryRecipients
        newSettings.weeklySummary.recipientStaffIds = weeklySummaryRecipients
        newSettings.monthlySummary.recipientStaffIds = monthlySummaryRecipients
        newSettings.staffIncentiveSummary.recipientStaffIds = staffIncentiveRecipients
        newSettings.payrollNotifications.recipientStaffIds = payrollRecipients

        return newSettings
      })
    }
  }, [staffMembers, canPayroll, canIncentive])

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
            day: response.data.weeklySummary?.day || "monday",
            time: response.data.weeklySummary?.time || "09:00",
            recipientStaffIds: response.data.weeklySummary?.recipientStaffIds || []
          },
          monthlySummary: {
            enabled: response.data.monthlySummary?.enabled || false,
            time: response.data.monthlySummary?.time || "09:00",
            recipientStaffIds: response.data.monthlySummary?.recipientStaffIds || []
          },
          staffIncentiveSummary: {
            enabled: response.data.staffIncentiveSummary?.enabled || false,
            time: response.data.staffIncentiveSummary?.time || "12:00",
            recipientStaffIds: response.data.staffIncentiveSummary?.recipientStaffIds || []
          },
          payrollNotifications: {
            enabled: response.data.payrollNotifications?.enabled !== false,
            time: response.data.payrollNotifications?.time || "12:00",
            attachSalarySlip: response.data.payrollNotifications?.attachSalarySlip !== false,
            recipientStaffIds: response.data.payrollNotifications?.recipientStaffIds || []
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
      if (response.success && response.data) {
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

  const handleSendDailySummaryNow = async () => {
    if (!isAdmin) {
      toast({
        title: "Unauthorized",
        description: "Only admin or manager can send the daily summary",
        variant: "destructive",
      })
      return
    }
    if (!settings.dailySummary.enabled) {
      toast({
        title: "Daily summary disabled",
        description: "Enable daily summary below, then try again",
        variant: "destructive",
      })
      return
    }

    setIsSendingDailySummary(true)
    try {
      const response = await EmailNotificationsAPI.sendDailySummary()
      if (response.success) {
        toast({
          title: "Daily summary sent",
          description: response.message || "Check inboxes for recipients with Daily Summary enabled",
        })
      } else {
        throw new Error(response.error || "Failed to send daily summary")
      }
    } catch (error: any) {
      toast({
        title: "Could not send daily summary",
        description: error?.response?.data?.error || error.message || "Failed to send daily summary",
        variant: "destructive",
      })
    } finally {
      setIsSendingDailySummary(false)
    }
  }

  const handleSendWeeklySummaryNow = async () => {
    if (!isAdmin) {
      toast({
        title: "Unauthorized",
        description: "Only admin or manager can send the weekly summary",
        variant: "destructive",
      })
      return
    }
    if (!settings.weeklySummary.enabled) {
      toast({
        title: "Weekly summary disabled",
        description: "Enable weekly summary below, then try again",
        variant: "destructive",
      })
      return
    }

    setIsSendingWeeklySummary(true)
    try {
      const response = await EmailNotificationsAPI.sendWeeklySummary()
      if (response.success) {
        toast({
          title: "Weekly summary sent",
          description: response.message || "Check inboxes for recipients with Weekly Summary enabled",
        })
      } else {
        throw new Error(response.error || "Failed to send weekly summary")
      }
    } catch (error: any) {
      toast({
        title: "Could not send weekly summary",
        description: error?.response?.data?.error || error.message || "Failed to send weekly summary",
        variant: "destructive",
      })
    } finally {
      setIsSendingWeeklySummary(false)
    }
  }

  const handleSendMonthlySummaryNow = async () => {
    if (!isAdmin) {
      toast({
        title: "Unauthorized",
        description: "Only admin or manager can send the monthly summary",
        variant: "destructive",
      })
      return
    }
    if (!settings.monthlySummary.enabled) {
      toast({
        title: "Monthly summary disabled",
        description: "Enable monthly summary below, then try again",
        variant: "destructive",
      })
      return
    }

    setIsSendingMonthlySummary(true)
    try {
      const response = await EmailNotificationsAPI.sendMonthlySummary()
      if (response.success) {
        toast({
          title: "Monthly summary sent",
          description: response.message || "Check inboxes for recipients with Monthly Summary enabled",
        })
      } else {
        throw new Error(response.error || "Failed to send monthly summary")
      }
    } catch (error: any) {
      toast({
        title: "Could not send monthly summary",
        description: error?.response?.data?.error || error.message || "Failed to send monthly summary",
        variant: "destructive",
      })
    } finally {
      setIsSendingMonthlySummary(false)
    }
  }

  const handleTestEmail = async () => {
    if (process.env.NODE_ENV !== "development") return
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
                <p className="text-slate-600">
                  Configure email and WhatsApp notifications for your business. WhatsApp uses the shared
                  platform number by default; connect your own app under{" "}
                  <span className="font-medium text-slate-700">Settings → WhatsApp Integration</span>{" "}
                  if you prefer your business number.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="email" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="space-y-6 mt-6">
          {showDevEmailTest ? (
            <div className="flex justify-end">
              <Button onClick={handleTestEmail} variant="outline" className="flex items-center gap-2">
                <TestTube className="h-4 w-4" />
                Send test email (dev)
              </Button>
            </div>
          ) : null}

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
              {staffWithEmailNotifications.map((staff) => {
                const isTenantAdmin = staff.role === "admin"
                const inRecipients = idInRecipientList(staff._id, settings.recipientStaffIds)
                const recipientSwitchOn = isTenantAdmin || inRecipients
                return (
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
                      {staffEmailNotificationsOn(staff) ? (
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
                      checked={recipientSwitchOn}
                      disabled={isTenantAdmin}
                      onCheckedChange={() => {
                        if (!isTenantAdmin) toggleStaffSelection(staff._id, "general")
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openPreferencesModal(staff._id)}
                      disabled={!isTenantAdmin && !recipientSwitchOn}
                    >
                      Configure
                    </Button>
                  </div>
                </div>
              )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            Daily Summary Report
          </CardTitle>
          <CardDescription>
            End-of-day business snapshot with revenue, charts, and key stats — emailed to owners and
            staff who opt in under Configure above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Enable daily summary emails</p>
              <p className="text-sm text-slate-600">Send the summary report automatically or on demand</p>
            </div>
            <Switch
              checked={settings.dailySummary.enabled}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  dailySummary: { ...prev.dailySummary, enabled: checked },
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
            <div>
              <p className="font-medium text-slate-900">Schedule</p>
              <p className="text-sm text-slate-600">
                {settings.dailySummary.mode === "afterClosing"
                  ? "Sent after you verify & lock the cash registry day"
                  : `Sent every day at ${settings.dailySummary.time} IST`}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Send now</p>
              <p className="text-sm text-slate-600">
                Email today&apos;s summary immediately to all recipients with Daily Summary enabled
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              disabled={!isAdmin || !settings.dailySummary.enabled || isSendingDailySummary}
              onClick={() => void handleSendDailySummaryNow()}
            >
              {isSendingDailySummary ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send today&apos;s summary
                </>
              )}
            </Button>
          </div>
          <p className="text-sm text-slate-500">
            Recipients: enable <span className="font-medium">Daily Summary</span> under each staff
            member&apos;s Configure preferences. Admin login emails are always included when enabled.
          </p>
        </CardContent>
      </Card>

      {/* Weekly Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-violet-600" />
            Weekly Summary Report
          </CardTitle>
          <CardDescription>
            Monday-morning recap of the previous Mon–Sun week — revenue trend, top services,
            customer mix, appointment funnel, and staff leaderboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Enable weekly summary emails</p>
              <p className="text-sm text-slate-600">Send the report automatically or on demand</p>
            </div>
            <Switch
              checked={settings.weeklySummary.enabled}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  weeklySummary: { ...prev.weeklySummary, enabled: checked },
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
            <div>
              <p className="font-medium text-slate-900">Schedule</p>
              <p className="text-sm text-slate-600">
                Sent every {settings.weeklySummary.day} at {settings.weeklySummary.time} IST (previous Mon–Sun week)
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Send now</p>
              <p className="text-sm text-slate-600">
                Email last week&apos;s summary immediately to all recipients with Weekly Summary enabled
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 border-violet-200 text-violet-700 hover:bg-violet-50"
              disabled={!isAdmin || !settings.weeklySummary.enabled || isSendingWeeklySummary}
              onClick={() => void handleSendWeeklySummaryNow()}
            >
              {isSendingWeeklySummary ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send last week&apos;s summary
                </>
              )}
            </Button>
          </div>
          <p className="text-sm text-slate-500">
            Recipients: enable <span className="font-medium">Weekly Summary</span> under each staff
            member&apos;s Configure preferences. Admin login emails are always included when enabled.
          </p>
        </CardContent>
      </Card>

      {/* Monthly Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-indigo-600" />
            Monthly Summary Report
          </CardTitle>
          <CardDescription>
            Sent on the 1st of each month at 9 AM IST — full calendar-month recap with revenue vs goal,
            category breakdown, 6-month trend, VIP clients, customer health, milestones, and forecast.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Enable monthly summary emails</p>
              <p className="text-sm text-slate-600">Send the report automatically or on demand</p>
            </div>
            <Switch
              checked={settings.monthlySummary.enabled}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  monthlySummary: { ...prev.monthlySummary, enabled: checked },
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
            <div>
              <p className="font-medium text-slate-900">Schedule</p>
              <p className="text-sm text-slate-600">
                Sent on the 1st of each month at {settings.monthlySummary.time} IST (previous calendar month)
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Send now</p>
              <p className="text-sm text-slate-600">
                Email last month&apos;s summary immediately to all recipients with Monthly Summary enabled
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              disabled={!isAdmin || !settings.monthlySummary.enabled || isSendingMonthlySummary}
              onClick={() => void handleSendMonthlySummaryNow()}
            >
              {isSendingMonthlySummary ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send last month&apos;s summary
                </>
              )}
            </Button>
          </div>
          <p className="text-sm text-slate-500">
            Recipients: enable <span className="font-medium">Monthly Summary</span> under each staff
            member&apos;s Configure preferences. Admin login emails are always included when enabled.
          </p>
        </CardContent>
      </Card>

      {/* Payroll / Salary Slip — Pro only */}
      {canPayroll && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" />
            Payroll & Salary Slip
          </CardTitle>
          <CardDescription>
            Salary slips are emailed to admin recipients on the 1st of each month for the previous
            month&apos;s payroll (e.g. July payroll on 1 August). One email includes all staff with
            base, commission, deductions, net pay, and all salary slip PDFs attached.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Enable payroll emails</p>
              <p className="text-sm text-slate-600">Send salary slip notifications on the 1st of each month</p>
            </div>
            <Switch
              checked={settings.payrollNotifications.enabled}
              disabled={!canEdit}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  payrollNotifications: { ...prev.payrollNotifications, enabled: checked },
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
            <div>
              <p className="font-medium text-slate-900">Schedule</p>
              <p className="text-sm text-slate-600">
                Sent on the 1st of each month at {settings.payrollNotifications.time} IST for the previous month&apos;s payroll
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Attach salary slip PDF</p>
              <p className="text-sm text-slate-600">Include the PDF salary slip as an email attachment</p>
            </div>
            <Switch
              checked={settings.payrollNotifications.attachSalarySlip}
              disabled={!canEdit || !settings.payrollNotifications.enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  payrollNotifications: { ...prev.payrollNotifications, attachSalarySlip: checked },
                }))
              }
            />
          </div>
          <p className="text-sm text-slate-500">
            Recipients: enable <span className="font-medium">Payroll / Salary slip</span> under each staff member&apos;s
            Configure preferences above. Admin login emails are always included when enabled.
          </p>
        </CardContent>
      </Card>
      )}

      {/* Save Button */}
      <div className="flex justify-end items-center gap-3">
        {!canEdit && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> You don't have permission to edit notification settings
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
          <WhatsAppNotificationSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
