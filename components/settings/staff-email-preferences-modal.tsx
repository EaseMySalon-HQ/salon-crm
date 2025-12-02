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
  const [isLoading, setIsLoading] = useState(false)
  const [preferences, setPreferences] = useState({
    enabled: false,
    dailySummary: false,
    weeklySummary: false,
    appointmentAlerts: false,
    receiptAlerts: false,
    exportAlerts: false,
    systemAlerts: false,
    lowInventory: false
  })

  useEffect(() => {
    if (staff?.emailNotifications) {
      setPreferences({
        enabled: staff.emailNotifications.enabled || false,
        dailySummary: staff.emailNotifications.preferences?.dailySummary || false,
        weeklySummary: staff.emailNotifications.preferences?.weeklySummary || false,
        appointmentAlerts: staff.emailNotifications.preferences?.appointmentAlerts || false,
        receiptAlerts: staff.emailNotifications.preferences?.receiptAlerts || false,
        exportAlerts: staff.emailNotifications.preferences?.exportAlerts || false,
        systemAlerts: staff.emailNotifications.preferences?.systemAlerts || false,
        lowInventory: staff.emailNotifications.preferences?.lowInventory || false
      })
    } else {
      setPreferences({
        enabled: false,
        dailySummary: false,
        weeklySummary: false,
        appointmentAlerts: false,
        receiptAlerts: false,
        exportAlerts: false,
        systemAlerts: false,
        lowInventory: false
      })
    }
  }, [staff])

  const handleSave = async () => {
    if (!staff?._id) return

    setIsLoading(true)
    try {
      const response = await EmailNotificationsAPI.updateStaffPreferences(staff._id, {
        enabled: preferences.enabled,
        preferences: {
          dailySummary: preferences.dailySummary,
          weeklySummary: preferences.weeklySummary,
          appointmentAlerts: preferences.appointmentAlerts,
          receiptAlerts: preferences.receiptAlerts,
          exportAlerts: preferences.exportAlerts,
          systemAlerts: preferences.systemAlerts,
          lowInventory: preferences.lowInventory
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
      toast({
        title: "Error",
        description: error.message || "Failed to update preferences",
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
              onCheckedChange={(checked) =>
                setPreferences(prev => ({ ...prev, enabled: checked }))
              }
            />
          </div>

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
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, dailySummary: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Weekly Summary</Label>
                    <Switch
                      checked={preferences.weeklySummary}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, weeklySummary: checked }))
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
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, appointmentAlerts: checked }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Transactions */}
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-800">Transactions</h3>
                <div className="space-y-2 pl-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Receipt Alerts</Label>
                    <Switch
                      checked={preferences.receiptAlerts}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, receiptAlerts: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Export Alerts</Label>
                    <Switch
                      checked={preferences.exportAlerts}
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, exportAlerts: checked }))
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
                      onCheckedChange={(checked) =>
                        setPreferences(prev => ({ ...prev, systemAlerts: checked }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Low Inventory Alerts</Label>
                    <Switch
                      checked={preferences.lowInventory}
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
          <Button onClick={handleSave} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
            {isLoading ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

