"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { EmailNotificationsAPI } from "@/lib/api"
import { Mail, CheckCircle2, XCircle } from "lucide-react"
import { useFeature } from "@/hooks/use-entitlements"

interface StaffMember {
  _id: string
  name: string
  email: string
  role: string
  hasLoginAccess: boolean
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
      systemAlerts?: boolean
      lowInventory?: boolean
      allowReportsDelivery?: boolean
    }
  }
}

interface StaffEmailPreferencesModalProps {
  isOpen: boolean
  onClose: () => void
  staff: StaffMember | undefined
  onUpdate: () => void
}

export function StaffEmailPreferencesModal({
  isOpen,
  onClose,
  staff,
  onUpdate
}: StaffEmailPreferencesModalProps) {
  const { toast } = useToast()
  const { hasAccess: canPayroll } = useFeature("payroll")
  const { hasAccess: canIncentive } = useFeature("incentive_management")
  const [isLoading, setIsLoading] = useState(false)
  const [preferences, setPreferences] = useState({
    enabled: false,
    allowReportsDelivery: false,
    dailySummary: false,
    weeklySummary: false,
    monthlySummary: false,
    staffIncentiveSummary: false,
    payrollSlip: false,
    timesheetReport: false,
    appointmentAlerts: false,
    receiptAlerts: false,
    systemAlerts: false,
    lowInventory: false
  })

  useEffect(() => {
    const isAdmin = staff?.role === "admin"
    if (staff?.emailNotifications) {
      const prefs = staff.emailNotifications.preferences || {}
      setPreferences({
        enabled: isAdmin ? true : staff.emailNotifications.enabled || false,
        allowReportsDelivery: isAdmin ? prefs.allowReportsDelivery !== false : prefs.allowReportsDelivery || false,
        dailySummary: isAdmin ? prefs.dailySummary !== false : prefs.dailySummary || false,
        weeklySummary: isAdmin ? prefs.weeklySummary !== false : prefs.weeklySummary || false,
        monthlySummary: isAdmin ? prefs.monthlySummary !== false : prefs.monthlySummary || false,
        staffIncentiveSummary: isAdmin
          ? canIncentive && prefs.staffIncentiveSummary !== false
          : prefs.staffIncentiveSummary || false,
        payrollSlip: isAdmin ? canPayroll && prefs.payrollSlip !== false : prefs.payrollSlip || false,
        timesheetReport: isAdmin ? prefs.timesheetReport !== false : prefs.timesheetReport || false,
        appointmentAlerts: isAdmin ? prefs.appointmentAlerts !== false : prefs.appointmentAlerts || false,
        receiptAlerts: isAdmin ? prefs.receiptAlerts !== false : prefs.receiptAlerts || false,
        systemAlerts: isAdmin ? prefs.systemAlerts !== false : prefs.systemAlerts || false,
        lowInventory: isAdmin ? prefs.lowInventory !== false : prefs.lowInventory || false,
      })
    } else if (isAdmin) {
      setPreferences({
        enabled: true,
        allowReportsDelivery: true,
        dailySummary: true,
        weeklySummary: true,
        monthlySummary: true,
        staffIncentiveSummary: canIncentive,
        payrollSlip: canPayroll,
        timesheetReport: true,
        appointmentAlerts: true,
        receiptAlerts: true,
        systemAlerts: true,
        lowInventory: true,
      })
    } else {
      setPreferences({
        enabled: false,
        allowReportsDelivery: false,
        dailySummary: false,
        weeklySummary: false,
        monthlySummary: false,
        staffIncentiveSummary: false,
        payrollSlip: false,
        timesheetReport: false,
        appointmentAlerts: false,
        receiptAlerts: false,
        systemAlerts: false,
        lowInventory: false
      })
    }
  }, [staff, canPayroll, canIncentive])

  const isAdminStaff = staff?.role === "admin"
  const readOnlyAdmin = isAdminStaff && !staff?.isOwner
  const prefSwitchDisabled = readOnlyAdmin

  const handleSave = async () => {
    if (!staff?._id) return
    if (readOnlyAdmin) {
      onClose()
      return
    }

    setIsLoading(true)
    try {
      const response = await EmailNotificationsAPI.updateStaffPreferences(staff._id, {
        enabled: preferences.enabled,
        preferences: {
          dailySummary: preferences.dailySummary,
          weeklySummary: preferences.weeklySummary,
          monthlySummary: preferences.monthlySummary,
          ...(canIncentive ? { staffIncentiveSummary: preferences.staffIncentiveSummary } : {}),
          ...(canPayroll ? { payrollSlip: preferences.payrollSlip } : {}),
          timesheetReport: preferences.timesheetReport,
          appointmentAlerts: preferences.appointmentAlerts,
          receiptAlerts: preferences.receiptAlerts,
          systemAlerts: preferences.systemAlerts,
          lowInventory: preferences.lowInventory,
          allowReportsDelivery: preferences.allowReportsDelivery,
        }
      })

      if (response.success) {
        toast({
          title: "Preferences updated",
          description: `Email notification preferences for ${staff.name} have been updated.`,
        })
        onUpdate()
        onClose()
      } else {
        throw new Error(response.error || 'Failed to update preferences')
      }
    } catch (error: any) {
      console.error('Error updating staff preferences:', error);
      const errorMessage = error?.response?.data?.error || error?.message || "Failed to update preferences";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (!staff) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            {staff.name} - Email Notification Preferences
          </DialogTitle>
          <DialogDescription>
            Manage email notification preferences for this staff member (Admin Only)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isAdminStaff && (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-900">
              {staff.isOwner
                ? "Business owner admins receive all email notification types by default. You can turn individual types off below."
                : "Admin users receive all email notification types by default and cannot be disabled from this screen."}
            </div>
          )}
          {/* Staff Info */}
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium">{staff.email}</span>
              {staff.hasLoginAccess ? (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                  Has Login Access
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">
                  No Login Access
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-600">Managed by Admin</p>
          </div>

          {/* Master Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <Label className="text-base font-semibold">Enable Email Notifications</Label>
              <p className="text-sm text-slate-600">Master toggle for all email notifications</p>
            </div>
            <Switch
              checked={preferences.enabled}
              disabled={isAdminStaff}
              onCheckedChange={(checked) =>
                setPreferences(prev => ({
                  ...prev,
                  enabled: checked,
                  ...(checked ? {} : { allowReportsDelivery: false }),
                }))
              }
            />
          </div>

          {(!isAdminStaff || staff.isOwner) && (
            <div
              className={`flex items-center justify-between p-4 border rounded-lg ${!preferences.enabled && !isAdminStaff ? "opacity-60" : ""}`}
            >
              <div>
                <Label className="text-base font-semibold">Allow Reports Delivery</Label>
                <p className="text-sm text-slate-600">
                  Receive exported reports (Excel/PDF) by email when a user runs a report export
                </p>
              </div>
              <Switch
                checked={preferences.allowReportsDelivery}
                disabled={prefSwitchDisabled || (!preferences.enabled && !isAdminStaff)}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, allowReportsDelivery: checked }))
                }
              />
            </div>
          )}

          {preferences.enabled && (
            <div className="space-y-4">
              {/* Business Reports */}
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-800">Business Reports</h3>
                <div className="space-y-2 pl-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Daily Summary</Label>
                    <Switch
                      checked={preferences.dailySummary}
                      disabled={prefSwitchDisabled}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, dailySummary: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Weekly Summary</Label>
                    <Switch
                      checked={preferences.weeklySummary}
                      disabled={prefSwitchDisabled}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, weeklySummary: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Monthly Summary</Label>
                      <p className="text-xs text-slate-500 mt-1">Sent on the 1st of each month for the previous calendar month</p>
                    </div>
                    <Switch
                      checked={preferences.monthlySummary}
                      disabled={prefSwitchDisabled}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, monthlySummary: checked }))
                      }
                    />
                  </div>
                  {canIncentive && (
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Staff Incentive Summary</Label>
                      <p className="text-xs text-slate-500 mt-1">Sent on the 1st of each month for the previous month</p>
                    </div>
                    <Switch
                      checked={preferences.staffIncentiveSummary}
                      disabled={prefSwitchDisabled}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, staffIncentiveSummary: checked }))
                      }
                    />
                  </div>
                  )}
                  {canPayroll && (
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Payroll / Salary slip</Label>
                      <p className="text-xs text-slate-500 mt-1">Sent on the 1st of each month — one email with all staff payslips attached</p>
                    </div>
                    <Switch
                      checked={preferences.payrollSlip}
                      disabled={prefSwitchDisabled}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, payrollSlip: checked }))
                      }
                    />
                  </div>
                  )}
                </div>
              </div>

              {/* Personal */}
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-800">Personal Reports</h3>
                <div className="space-y-2 pl-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Timesheet report</Label>
                      <p className="text-xs text-slate-500 mt-1">Sent on the 1st of each month to this staff member&apos;s email</p>
                    </div>
                    <Switch
                      checked={preferences.timesheetReport}
                      disabled={prefSwitchDisabled}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, timesheetReport: checked }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Appointments */}
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-800">Appointments</h3>
                <div className="space-y-2 pl-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Appointment Alerts</Label>
                    <Switch
                      checked={preferences.appointmentAlerts}
                      disabled={prefSwitchDisabled}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, appointmentAlerts: checked }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* System Alerts */}
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-800">System Alerts</h3>
                <div className="space-y-2 pl-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>System Alerts</Label>
                    <Switch
                      checked={preferences.systemAlerts}
                      disabled={prefSwitchDisabled}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, systemAlerts: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Low Inventory Alerts</Label>
                    <Switch
                      checked={preferences.lowInventory}
                      disabled={prefSwitchDisabled}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, lowInventory: checked }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          {readOnlyAdmin ? (
            <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700">
              Close
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? "Saving..." : "Save Preferences"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

