"use client"

import { useState, useEffect } from "react"
import { Calendar, Globe, Lock, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { useEntitlements } from "@/hooks/use-entitlements"
import { SettingsAPI, type AppointmentSettingsData, type WeekDay, type DayHours } from "@/lib/api"
import { PublicBookingLink } from "@/components/settings/public-booking-link"

const DAYS: { key: WeekDay; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
]

const defaultHours = (): Record<WeekDay, DayHours> => ({
  monday: { open: "09:00", close: "18:00", closed: false },
  tuesday: { open: "09:00", close: "18:00", closed: false },
  wednesday: { open: "09:00", close: "18:00", closed: false },
  thursday: { open: "09:00", close: "18:00", closed: false },
  friday: { open: "09:00", close: "18:00", closed: false },
  saturday: { open: "09:00", close: "18:00", closed: false },
  sunday: { open: "09:00", close: "18:00", closed: true },
})

export function AppointmentSettings({ embedded = false }: { embedded?: boolean }) {
  const { hasPermission } = useAuth()
  const { hasFeature } = useEntitlements()
  const canEdit = hasPermission("appointment_settings", "edit")
  const onlineBookingOnPlan = hasFeature("online_booking")
  const [settings, setSettings] = useState<AppointmentSettingsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    void loadSettings()
  }, [])

  const loadSettings = async () => {
    setIsLoading(true)
    try {
      const response = await SettingsAPI.getAppointmentSettings()
      if (response.success && response.data) {
        setSettings({
          ...response.data,
          operatingHours: { ...defaultHours(), ...response.data.operatingHours },
        })
      } else {
        throw new Error(response.error || "Failed to load settings")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load appointment settings",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const update = (patch: Partial<AppointmentSettingsData>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const updateDay = (day: WeekDay, patch: Partial<DayHours>) => {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            operatingHours: {
              ...prev.operatingHours,
              [day]: { ...prev.operatingHours[day], ...patch },
            },
          }
        : prev
    )
  }

  const handleSave = async () => {
    if (!settings) return
    setIsSaving(true)
    try {
      const response = await SettingsAPI.updateAppointmentSettings({
        allowOnlineBooking: settings.allowOnlineBooking,
        slotDuration: settings.slotDuration,
        advanceBookingDays: settings.advanceBookingDays,
        bufferTime: settings.bufferTime,
        cancellationWindowHours: settings.cancellationWindowHours,
        operatingHours: settings.operatingHours,
      })
      if (!response.success) {
        throw new Error(response.error || "Failed to save")
      }
      setSettings(response.data)
      toast({
        title: "Appointment settings saved",
        description: settings.allowOnlineBooking
          ? "Online booking is live — share your booking link with clients."
          : "Your appointment configuration has been updated.",
      })
    } catch (error) {
      type FieldErrors = { fieldErrors?: Record<string, Array<string>> }
      const err = error as Error & { response?: { data?: { details?: FieldErrors } } }
      const fieldErrors = err.response?.data?.details?.fieldErrors
      const firstFieldMsg =
        fieldErrors &&
        Object.values(fieldErrors)
          .flat()
          .find(Boolean)
      toast({
        title: "Error",
        description:
          firstFieldMsg ||
          (error instanceof Error ? error.message : "Failed to save appointment settings"),
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading || !settings) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Loading appointment settings…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="p-6">
            <div className="mb-2 flex items-center gap-4">
              <div className="rounded-lg bg-violet-50 p-2">
                <Calendar className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Appointment settings</h2>
                <p className="text-slate-600">Online booking, scheduling rules, and working hours</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Online booking */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-100 to-purple-100">
              <Globe className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Online booking</h3>
              <p className="text-sm text-slate-600">Let clients book services from your public page</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <div className="space-y-1 pr-4">
                <Label className="text-sm font-medium text-slate-700">Allow online booking</Label>
                <p className="text-sm text-slate-600">
                  {onlineBookingOnPlan
                    ? "Enable your public booking page for this salon"
                    : "Upgrade to Growth or Pro to enable the public booking page"}
                </p>
              </div>
              <Switch
                checked={settings.allowOnlineBooking}
                onCheckedChange={(checked) => update({ allowOnlineBooking: checked })}
                disabled={!canEdit || !onlineBookingOnPlan}
              />
            </div>

            {!onlineBookingOnPlan && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Online Booking is not included in your current plan. Contact support or upgrade to unlock the shareable booking link.
              </p>
            )}

            {settings.allowOnlineBooking && settings.code && onlineBookingOnPlan && (
              <PublicBookingLink
                code={settings.code}
                websiteEnabled={settings.websiteEnabled}
                miniSiteBookPath={settings.miniSiteBookPath}
              />
            )}
          </div>
        </div>
      </div>


      {/* Booking rules */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-blue-100 to-indigo-100">
              <Settings className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Booking rules</h3>
              <p className="text-sm text-slate-600">Slot intervals and how far ahead clients can book</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-slate-700">Time slot interval</Label>
              <Select
                value={String(settings.slotDuration)}
                onValueChange={(value) => update({ slotDuration: Number(value) as 15 | 30 })}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label htmlFor="advanceBookingDays" className="text-sm font-medium text-slate-700">
                Advance booking window (days)
              </Label>
              <Input
                id="advanceBookingDays"
                type="number"
                min={1}
                max={365}
                value={settings.advanceBookingDays}
                onChange={(e) =>
                  update({ advanceBookingDays: Math.max(1, Number(e.target.value) || 30) })
                }
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="bufferTime" className="text-sm font-medium text-slate-700">
                Buffer between appointments (minutes)
              </Label>
              <Select
                value={String(settings.bufferTime)}
                onValueChange={(value) => update({ bufferTime: Number(value) })}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No buffer</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label htmlFor="cancellationWindow" className="text-sm font-medium text-slate-700">
                Cancellation window (hours before appointment)
              </Label>
              <Input
                id="cancellationWindow"
                type="number"
                min={0}
                value={settings.cancellationWindowHours}
                onChange={(e) =>
                  update({ cancellationWindowHours: Math.max(0, Number(e.target.value) || 0) })
                }
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Operating hours */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-100 to-teal-100">
              <Calendar className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Working hours</h3>
              <p className="text-sm text-slate-600">
                Used for online booking availability and client-facing slots
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {DAYS.map(({ key, label }) => {
              const day = settings.operatingHours[key]
              return (
                <div key={key} className="flex flex-wrap items-center gap-3">
                  <span className="w-24 text-sm font-medium text-slate-700">{label}</span>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    <Switch
                      checked={!day.closed}
                      onCheckedChange={(v) => updateDay(key, { closed: !v })}
                      disabled={!canEdit}
                    />
                    {day.closed ? "Closed" : "Open"}
                  </label>
                  {!day.closed && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={day.open}
                        onChange={(e) => updateDay(key, { open: e.target.value })}
                        className="h-8 w-28 text-xs"
                        disabled={!canEdit}
                      />
                      <span className="text-xs text-slate-400">to</span>
                      <Input
                        type="time"
                        value={day.close}
                        onChange={(e) => updateDay(key, { close: e.target.value })}
                        className="h-8 w-28 text-xs"
                        disabled={!canEdit}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Timezone: {settings.timezone.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {!canEdit && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> You don&apos;t have permission to edit appointment settings
          </span>
        )}
        <Button
          onClick={handleSave}
          disabled={isSaving || !canEdit}
          className="rounded-lg bg-violet-600 px-8 font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  )
}
