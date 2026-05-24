"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { Settings, Lock } from "lucide-react"

export function AppointmentSettings() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission("appointment_settings", "edit")
  const [settings, setSettings] = useState({
    bookingWindow: "30",
    slotDuration: "30",
    bufferTime: "15",
    maxAdvanceBooking: "60",
    allowOnlineBooking: true,
    requireDeposit: false,
    sendReminders: true,
    reminderTime: "24",
    allowCancellation: true,
    cancellationWindow: "24",
  })
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSave = async () => {
    setIsLoading(true)
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      toast({
        title: "Appointment settings saved",
        description: "Your appointment configuration has been updated.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save appointment settings. Please try again.",
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
              <h2 className="text-2xl font-bold text-slate-800">Appointment Settings</h2>
              <p className="text-slate-600">Configure booking rules, time slots, and availability</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Booking Configuration Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center">
                <Settings className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Booking Configuration</h3>
                <p className="text-slate-600 text-sm">Set up your appointment booking parameters</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="slotDuration" className="text-sm font-medium text-slate-700">Default Slot Duration (minutes)</Label>
                  <Select
                    value={settings.slotDuration}
                    onValueChange={(value) => setSettings({ ...settings, slotDuration: value })}
                  >
                    <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="bufferTime" className="text-sm font-medium text-slate-700">Buffer Time (minutes)</Label>
                  <Select
                    value={settings.bufferTime}
                    onValueChange={(value) => setSettings({ ...settings, bufferTime: value })}
                  >
                    <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No buffer</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="bookingWindow" className="text-sm font-medium text-slate-700">Booking Window (days)</Label>
                  <Input
                    id="bookingWindow"
                    type="number"
                    value={settings.bookingWindow}
                    onChange={(e) => setSettings({ ...settings, bookingWindow: e.target.value })}
                    className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="maxAdvanceBooking" className="text-sm font-medium text-slate-700">Max Advance Booking (days)</Label>
                  <Input
                    id="maxAdvanceBooking"
                    type="number"
                    value={settings.maxAdvanceBooking}
                    onChange={(e) => setSettings({ ...settings, maxAdvanceBooking: e.target.value })}
                    className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Online Booking Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-lg flex items-center justify-center">
                <Settings className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Online Booking</h3>
                <p className="text-slate-600 text-sm">Configure online booking preferences</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-700">Allow Online Booking</Label>
                  <p className="text-sm text-slate-600">Enable customers to book online</p>
                </div>
                <Switch
                  checked={settings.allowOnlineBooking}
                  onCheckedChange={(checked) => setSettings({ ...settings, allowOnlineBooking: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-700">Require Deposit</Label>
                  <p className="text-sm text-slate-600">Require payment for online bookings</p>
                </div>
                <Switch
                  checked={settings.requireDeposit}
                  onCheckedChange={(checked) => setSettings({ ...settings, requireDeposit: checked })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Reminders & Cancellations Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-emerald-100 to-teal-100 rounded-lg flex items-center justify-center">
                <Settings className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Reminders & Cancellations</h3>
                <p className="text-slate-600 text-sm">Configure reminder and cancellation policies</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-700">Send Reminders</Label>
                  <p className="text-sm text-slate-600">Automatically send appointment reminders</p>
                </div>
                <Switch
                  checked={settings.sendReminders}
                  onCheckedChange={(checked) => setSettings({ ...settings, sendReminders: checked })}
                />
              </div>
              
              {settings.sendReminders && (
                <div className="space-y-3">
                  <Label htmlFor="reminderTime" className="text-sm font-medium text-slate-700">Reminder Time (hours before)</Label>
                  <Select
                    value={settings.reminderTime}
                    onValueChange={(value) => setSettings({ ...settings, reminderTime: value })}
                  >
                    <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="2">2 hours</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="48">48 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-700">Allow Cancellation</Label>
                  <p className="text-sm text-slate-600">Allow customers to cancel appointments</p>
                </div>
                <Switch
                  checked={settings.allowCancellation}
                  onCheckedChange={(checked) => setSettings({ ...settings, allowCancellation: checked })}
                />
              </div>
              
              {settings.allowCancellation && (
                <div className="space-y-3">
                  <Label htmlFor="cancellationWindow" className="text-sm font-medium text-slate-700">Cancellation Window (hours)</Label>
                  <Input
                    id="cancellationWindow"
                    type="number"
                    value={settings.cancellationWindow}
                    onChange={(e) => setSettings({ ...settings, cancellationWindow: e.target.value })}
                    className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end items-center gap-3">
        {!canEdit && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> You don't have permission to edit appointment settings
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
