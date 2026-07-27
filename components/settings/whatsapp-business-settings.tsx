"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  MessageCircle,
  Receipt,
  AlertTriangle,
  XCircle,
  Bell,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { EmailNotificationsAPI } from "@/lib/api"
import { useEntitlements } from "@/hooks/use-entitlements"
import { WhatsAppGupshupConnectCard } from "./whatsapp-gupshup-connect-card"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

type WhatsAppAdminConfig = {
  adminConfigured: boolean
  adminEnabled: boolean
  platformAvailable?: boolean
  platformTemplatesReady?: boolean
  salonConnected?: boolean
  senderMode?: "none" | "platform" | "business"
  wabaAddonEnabled?: boolean
  legacyWhatsappAddonEnabled?: boolean
  messagingAddonEnabled?: boolean
  addonEnabled: boolean
  canConfigure?: boolean
  canUse: boolean
  provider: string
}

type TemplateSlot = {
  slotKey: string
  templateName: string
  category: string
  language: string
  label: string
  description: string
  enabled: boolean
}

type WhatsAppNotificationState = {
  enabled: boolean
  templateNotifications?: Record<string, { enabled: boolean }>
  receiptNotifications: {
    enabled: boolean
    autoSendToClients: boolean
    highValueThreshold: number
    includeFeedbackLink: boolean
  }
  appointmentNotifications: {
    enabled: boolean
    newAppointments: boolean
    confirmations: boolean
    reminders: boolean
    reschedule: boolean
    cancellations: boolean
  }
  systemAlerts: {
    enabled: boolean
    lowInventory: boolean
    paymentFailures: boolean
  }
  clientWalletTransactionNotifications: {
    enabled: boolean
  }
  clientWalletExpiryReminderNotifications: {
    enabled: boolean
  }
  clientDuesReminderNotifications: {
    enabled: boolean
  }
  clientBirthdayReminderNotifications: {
    enabled: boolean
  }
}

const DEFAULT_WHATSAPP_NOTIFICATIONS: WhatsAppNotificationState = {
  enabled: false,
  receiptNotifications: {
    enabled: true,
    autoSendToClients: true,
    highValueThreshold: 0,
    includeFeedbackLink: false,
  },
  appointmentNotifications: {
    enabled: false,
    newAppointments: false,
    confirmations: false,
    reminders: false,
    reschedule: true,
    cancellations: false,
  },
  systemAlerts: {
    enabled: false,
    lowInventory: false,
    paymentFailures: false,
  },
  clientWalletTransactionNotifications: {
    enabled: true,
  },
  clientWalletExpiryReminderNotifications: {
    enabled: true,
  },
  clientDuesReminderNotifications: {
    enabled: true,
  },
  clientBirthdayReminderNotifications: {
    enabled: true,
  },
}

function useWhatsAppAdminStatus() {
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [adminConfig, setAdminConfig] = useState<WhatsAppAdminConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setIsLoadingStatus(true)
        const response = await fetch(`${API_URL}/email-notifications/whatsapp/status`, {
          credentials: "include",
        })
        if (response.ok) {
          const data = await response.json()
          if (!cancelled && data.success) {
            setAdminConfig(data.data)
          }
        }
      } catch (error) {
        console.error("Error loading WhatsApp status:", error)
      } finally {
        if (!cancelled) setIsLoadingStatus(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { adminConfig, isLoadingStatus, canUseWhatsApp: adminConfig?.canConfigure && !isLoadingStatus }
}

/** Settings → WhatsApp Integration: connect own Gupshup app (optional). */
export function WhatsAppIntegrationSettings() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-green-50 rounded-lg">
              <MessageCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">WhatsApp Integration</h2>
              <p className="text-slate-600">
                Connect your own WhatsApp Business app to send from your business number.
              </p>
            </div>
          </div>
        </div>
      </div>

      <WhatsAppGupshupConnectCard />
    </div>
  )
}

const RECEIPT_SLOT_KEYS = new Set(["receipt", "receiptWithFeedback"])

function isTemplateSlotEnabled(
  settings: WhatsAppNotificationState,
  slotKey: string,
  fallback = true
): boolean {
  const entry = settings.templateNotifications?.[slotKey]
  if (entry && typeof entry.enabled === "boolean") return entry.enabled
  return fallback
}

/** Settings → Notifications → WhatsApp: which messages to send after integration is connected. */
export function WhatsAppNotificationSettings() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { hasFeature, isLoading: entitlementsLoading } = useEntitlements()
  const canUseReceiptFeedbackLink = hasFeature("feedback_management")
  const { adminConfig, isLoadingStatus, canUseWhatsApp } = useWhatsAppAdminStatus()
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSlots, setIsLoadingSlots] = useState(true)
  const [templateSlots, setTemplateSlots] = useState<TemplateSlot[]>([])
  const [settings, setSettings] = useState<WhatsAppNotificationState>(DEFAULT_WHATSAPP_NOTIFICATIONS)
  const isAdmin = user?.role === "admin" || user?.role === "manager"

  const receiptTemplateSlots = templateSlots.filter((slot) => RECEIPT_SLOT_KEYS.has(slot.slotKey))
  const nonReceiptTemplateSlots = templateSlots.filter((slot) => !RECEIPT_SLOT_KEYS.has(slot.slotKey))
  const hasReceiptWithFeedbackSlot = templateSlots.some((slot) => slot.slotKey === "receiptWithFeedback")

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (entitlementsLoading || canUseReceiptFeedbackLink) return
    setSettings((prev) => {
      if (prev.receiptNotifications.includeFeedbackLink !== true) return prev
      return {
        ...prev,
        receiptNotifications: {
          ...prev.receiptNotifications,
          includeFeedbackLink: false,
        },
      }
    })
  }, [canUseReceiptFeedbackLink, entitlementsLoading])

  const setTemplateSlotEnabled = (slotKey: string, enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      templateNotifications: {
        ...(prev.templateNotifications || {}),
        [slotKey]: { enabled },
      },
    }))
    setTemplateSlots((prev) =>
      prev.map((slot) => (slot.slotKey === slotKey ? { ...slot, enabled } : slot))
    )
  }

  const loadSettings = async () => {
    try {
      setIsLoadingSlots(true)
      const [settingsResponse, slotsResponse] = await Promise.all([
        EmailNotificationsAPI.getSettings(),
        EmailNotificationsAPI.getWhatsappTemplateSlots(),
      ])

      if (slotsResponse.success && slotsResponse.data?.slots) {
        setTemplateSlots(slotsResponse.data.slots)
      } else {
        setTemplateSlots([])
      }

      if (settingsResponse.success && settingsResponse.data) {
        const whatsappSettings = settingsResponse.data.whatsappNotificationSettings
        if (whatsappSettings) {
          setSettings((prev) => ({
            ...prev,
            ...whatsappSettings,
            enabled: whatsappSettings.enabled !== undefined ? whatsappSettings.enabled : prev.enabled,
            templateNotifications: {
              ...(prev.templateNotifications || {}),
              ...(whatsappSettings.templateNotifications || {}),
            },
            receiptNotifications: {
              ...prev.receiptNotifications,
              ...whatsappSettings.receiptNotifications,
              enabled:
                whatsappSettings.receiptNotifications?.enabled !== undefined
                  ? whatsappSettings.receiptNotifications.enabled
                  : prev.receiptNotifications.enabled,
              includeFeedbackLink:
                whatsappSettings.receiptNotifications?.includeFeedbackLink !== undefined
                  ? whatsappSettings.receiptNotifications.includeFeedbackLink
                  : prev.receiptNotifications.includeFeedbackLink,
            },
            appointmentNotifications: {
              ...prev.appointmentNotifications,
              ...whatsappSettings.appointmentNotifications,
              enabled:
                whatsappSettings.appointmentNotifications?.enabled !== undefined
                  ? whatsappSettings.appointmentNotifications.enabled
                  : prev.appointmentNotifications.enabled,
            },
            systemAlerts: {
              ...prev.systemAlerts,
              ...whatsappSettings.systemAlerts,
              enabled:
                whatsappSettings.systemAlerts?.enabled !== undefined
                  ? whatsappSettings.systemAlerts.enabled
                  : prev.systemAlerts.enabled,
            },
            clientWalletTransactionNotifications: {
              ...prev.clientWalletTransactionNotifications,
              ...whatsappSettings.clientWalletTransactionNotifications,
              enabled:
                whatsappSettings.clientWalletTransactionNotifications?.enabled !== undefined
                  ? whatsappSettings.clientWalletTransactionNotifications.enabled
                  : prev.clientWalletTransactionNotifications.enabled,
            },
            clientWalletExpiryReminderNotifications: {
              ...prev.clientWalletExpiryReminderNotifications,
              ...whatsappSettings.clientWalletExpiryReminderNotifications,
              enabled:
                whatsappSettings.clientWalletExpiryReminderNotifications?.enabled !== undefined
                  ? whatsappSettings.clientWalletExpiryReminderNotifications.enabled
                  : prev.clientWalletExpiryReminderNotifications.enabled,
            },
            clientDuesReminderNotifications: {
              ...prev.clientDuesReminderNotifications,
              ...whatsappSettings.clientDuesReminderNotifications,
              enabled:
                whatsappSettings.clientDuesReminderNotifications?.enabled !== undefined
                  ? whatsappSettings.clientDuesReminderNotifications.enabled
                  : prev.clientDuesReminderNotifications.enabled,
            },
            clientBirthdayReminderNotifications: {
              ...prev.clientBirthdayReminderNotifications,
              ...whatsappSettings.clientBirthdayReminderNotifications,
              enabled:
                whatsappSettings.clientBirthdayReminderNotifications?.enabled !== undefined
                  ? whatsappSettings.clientBirthdayReminderNotifications.enabled
                  : prev.clientBirthdayReminderNotifications.enabled,
            },
          }))
        }
      }
    } catch (error) {
      console.error("Error loading WhatsApp settings:", error)
    } finally {
      setIsLoadingSlots(false)
    }
  }

  const handleSave = async () => {
    if (!isAdmin) {
      toast({
        title: "Access Denied",
        description: "Only admin/manager can save settings",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)
      const response = await EmailNotificationsAPI.updateSettings({
        whatsappNotificationSettings: settings,
      })

      if (response.success) {
        toast({
          title: "Settings Saved",
          description: "WhatsApp notification settings have been updated successfully",
        })
      } else {
        throw new Error(response.error || "Failed to save settings")
      }
    } catch (error: unknown) {
      console.error("Error saving WhatsApp settings:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save WhatsApp settings",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
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
      {!canUseWhatsApp && !isLoadingStatus && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <XCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium mb-2 text-gray-600">WhatsApp Not Available</p>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                {!adminConfig?.adminConfigured
                  ? "The platform administrator must configure shared WhatsApp templates (Admin → Template Manager) before transactional messages can be sent."
                  : !adminConfig?.messagingAddonEnabled && !adminConfig?.addonEnabled
                    ? "Enable WABA Integration (Gupshup) or legacy WhatsApp messaging on your plan in Plan Management. WABA uses the shared platform number — no Gupshup app connection required."
                    : "Your wallet balance is too low to send WhatsApp messages. Please top up from Settings → Recharge."}
              </p>
              {adminConfig?.messagingAddonEnabled && !adminConfig?.salonConnected && (
                <p className="text-sm text-gray-500 mt-4 max-w-md mx-auto">
                  Optional:{" "}
                  <Link href="/settings?section=whatsapp-integration" className="text-indigo-600 hover:underline font-medium">
                    connect your own Gupshup app
                  </Link>{" "}
                  to send from your business number instead of the shared platform number.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {canUseWhatsApp && (
        <>
          {adminConfig?.senderMode === "platform" && !adminConfig?.salonConnected && (
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="pt-6 pb-6">
                <p className="text-sm text-green-900">
                  <strong>Shared platform number.</strong> Receipts, appointment updates, and other
                  notifications send from the EaseMySalon WhatsApp number. No app connection is
                  required for your salon.
                </p>
              </CardContent>
            </Card>
          )}
          <Card className={settings.enabled ? "" : "border-gray-200 bg-gray-50"}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MessageCircle className={`h-5 w-5 ${settings.enabled ? "text-green-600" : "text-gray-400"}`} />
                <span>WhatsApp Notifications</span>
                {!settings.enabled && <Badge variant="secondary" className="ml-2">Disabled</Badge>}
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
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, enabled: checked }))}
                />
              </div>
              {!settings.enabled && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> When WhatsApp notifications are disabled, no WhatsApp messages will be sent,
                    even if individual notification types are configured below.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bell className="h-5 w-5 text-indigo-600" />
                <span>Message templates</span>
              </CardTitle>
              <CardDescription>
                Enable or disable each approved WhatsApp template published for your salon. New templates appear here
                automatically after your administrator publishes them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingSlots ? (
                <p className="text-sm text-gray-500">Loading published templates…</p>
              ) : templateSlots.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No templates are published yet. Your administrator must approve and publish templates in Admin →
                  Template Manager before you can configure them here.
                </p>
              ) : (
                <>
                  {receiptTemplateSlots.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Receipts & bills</p>
                      {receiptTemplateSlots.map((slot) => (
                        <div key={slot.slotKey} className="flex items-center justify-between py-1.5">
                          <div className="space-y-0.5 pr-4">
                            <Label className="text-sm">{slot.label}</Label>
                            <p className="text-xs text-gray-500">{slot.description}</p>
                            <p className="text-xs text-gray-400">Template: {slot.templateName}</p>
                          </div>
                          <Switch
                            checked={isTemplateSlotEnabled(settings, slot.slotKey, slot.enabled)}
                            onCheckedChange={(checked) => setTemplateSlotEnabled(slot.slotKey, checked)}
                            disabled={!settings.enabled}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {nonReceiptTemplateSlots.length > 0 && (
                    <div className={`space-y-3 ${receiptTemplateSlots.length > 0 ? "pt-3 border-t border-gray-100" : ""}`}>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Other notifications</p>
                      {nonReceiptTemplateSlots.map((slot) => (
                        <div key={slot.slotKey} className="flex items-center justify-between py-1.5">
                          <div className="space-y-0.5 pr-4">
                            <Label className="text-sm">{slot.label}</Label>
                            <p className="text-xs text-gray-500">{slot.description}</p>
                            <p className="text-xs text-gray-400">Template: {slot.templateName}</p>
                          </div>
                          <Switch
                            checked={isTemplateSlotEnabled(settings, slot.slotKey, slot.enabled)}
                            onCheckedChange={(checked) => setTemplateSlotEnabled(slot.slotKey, checked)}
                            disabled={!settings.enabled}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {receiptTemplateSlots.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Receipt className="h-5 w-5 text-blue-600" />
                <span>Receipt delivery options</span>
              </CardTitle>
              <CardDescription>Configure how and when receipt WhatsApp messages are sent.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Auto-send to Clients</Label>
                  <p className="text-sm text-gray-500">Automatically send receipts when created.</p>
                </div>
                <Switch
                  checked={settings.receiptNotifications.autoSendToClients}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({
                      ...prev,
                      receiptNotifications: { ...prev.receiptNotifications, autoSendToClients: checked },
                    }))
                  }
                  disabled={
                    !settings.enabled ||
                    !receiptTemplateSlots.some((slot) =>
                      isTemplateSlotEnabled(settings, slot.slotKey, slot.enabled)
                    )
                  }
                />
              </div>

              {hasReceiptWithFeedbackSlot && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="space-y-1">
                  <Label>Receipt template preference</Label>
                  <p className="text-sm text-gray-500">
                    Choose which receipt template to use when both are enabled above.
                    {!canUseReceiptFeedbackLink &&
                      " Starter plan uses the standard receipt only; upgrade to Growth or Pro for the feedback option."}
                  </p>
                </div>
                <RadioGroup
                  value={settings.receiptNotifications.includeFeedbackLink === true ? "with_feedback" : "standard"}
                  onValueChange={(value) =>
                    setSettings((prev) => ({
                      ...prev,
                      receiptNotifications: {
                        ...prev.receiptNotifications,
                        includeFeedbackLink: value === "with_feedback",
                      },
                    }))
                  }
                  disabled={
                    !settings.enabled ||
                    entitlementsLoading ||
                    !receiptTemplateSlots.some((slot) =>
                      isTemplateSlotEnabled(settings, slot.slotKey, slot.enabled)
                    )
                  }
                  className="space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="standard" id="receipt-template-standard" className="mt-1" />
                    <div className="space-y-0.5">
                      <Label htmlFor="receipt-template-standard" className="font-medium cursor-pointer">
                        Standard receipt
                      </Label>
                      <p className="text-sm text-gray-500">View Bill button only.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem
                      value="with_feedback"
                      id="receipt-template-feedback"
                      className="mt-1"
                      disabled={!canUseReceiptFeedbackLink}
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="receipt-template-feedback"
                        className={`font-medium ${canUseReceiptFeedbackLink ? "cursor-pointer" : "text-gray-400"}`}
                      >
                        Receipt with Feedback Link
                      </Label>
                      <p className="text-sm text-gray-500">View Bill and Share Feedback buttons (Growth / Pro).</p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="highValueThreshold">High Value Threshold (₹)</Label>
                <Input
                  id="highValueThreshold"
                  type="number"
                  value={settings.receiptNotifications.highValueThreshold}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      receiptNotifications: {
                        ...prev.receiptNotifications,
                        highValueThreshold: parseFloat(e.target.value) || 0,
                      },
                    }))
                  }
                  disabled={!settings.enabled}
                  min="0"
                  step="0.01"
                />
                <p className="text-xs text-gray-500">
                  Only send WhatsApp for receipts above this amount (0 = all receipts).
                </p>
              </div>
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span>System Alerts</span>
              </CardTitle>
              <CardDescription>Receive system alerts via WhatsApp.</CardDescription>
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
                    setSettings((prev) => ({
                      ...prev,
                      systemAlerts: { ...prev.systemAlerts, enabled: checked },
                    }))
                  }
                  disabled={!settings.enabled}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isLoading} className="bg-indigo-600 hover:bg-indigo-700">
              {isLoading ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
