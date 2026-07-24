"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  MessageCircle,
  TestTube,
  Settings,
  BarChart3,
  Clock,
  Trash2,
  Edit2,
  X,
  RefreshCw,
  ExternalLink,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { getAdminAuthToken } from "@/lib/admin-auth-storage"
import { AdminPlatformWhatsAppInboxAPI } from "@/lib/admin-platform-whatsapp-api"
import {
  buildDefaultWhatsAppVariableMapping,
} from "@/lib/whatsapp-template-slot-defaults"
import { WhatsAppVariableMappingEditor } from "@/components/admin/whatsapp-variable-mapping-editor"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/** WhatsApp template types that support Business Settings → Google Maps link on buttons */
const APPOINTMENT_WHATSAPP_TEMPLATE_TYPES = [
  'appointmentScheduling',
  'appointmentConfirmation',
  'appointmentCancellation',
  'appointmentReminder',
  'appointmentReschedule',
] as const

/** Receipt + feedback template: button_1 = View Bill, button_2 = Share Feedback */
function receiptWithFeedbackButtonDataField(varName: string): string {
  const idx = parseInt(varName.replace('button_', ''), 10)
  if (idx === 1) return 'receiptLink'
  if (idx === 2) return 'feedbackLink'
  return `button_${varName.replace('button_', '')}`
}

function mapReceiptTemplateButton(templateType: string, varName: string): string {
  if (templateType === 'receiptWithFeedback') {
    return receiptWithFeedbackButtonDataField(varName)
  }
  if (templateType === 'receipt') {
    return 'receiptLink'
  }
  return `button_${varName.replace('button_', '')}`
}

interface WhatsAppAdminSettingsProps {
  settings?: any
  onSettingsChange: (settings: any) => void
}

/** Shape of WhatsApp settings state */
interface WhatsAppSettingsState {
  enabled: boolean
  provider: string
  templates: Record<string, string>
  templateVariables: Record<string, Record<string, string>>
  /** @deprecated Legacy MSG91 paste storage — no longer edited in UI */
  templateJavaScriptCodes?: Record<string, string>
  /** Legacy admin saves used bare booleans; API now returns nested { enabled, ... } */
  receiptNotifications?: boolean | { enabled?: boolean; autoSendToClients?: boolean; highValueThreshold?: number }
  appointmentNotifications?:
    | boolean
    | { enabled?: boolean; confirmations?: boolean; newAppointments?: boolean; reminders?: boolean; cancellations?: boolean }
  systemAlerts?: boolean | { enabled?: boolean; lowInventory?: boolean; paymentFailures?: boolean }
  clientWalletTransactionNotifications?: boolean | { enabled?: boolean }
  clientWalletExpiryReminderNotifications?: boolean | { enabled?: boolean }
  clientDuesReminderNotifications?: boolean | { enabled?: boolean }
  clientBirthdayReminderNotifications?: boolean | { enabled?: boolean }
  platformLeadWelcomeNotifications?: boolean | { enabled?: boolean }
  quietHours?: { enabled: boolean; start: string; end: string }
  [key: string]: unknown
}

/** All Gupshup notification slot keys (admin table rows). */
export const EMPTY_WHATSAPP_TEMPLATE_SLOTS: Record<string, string> = {
  welcomeMessage: "",
  platformLeadWelcome: "",
  businessAccountCreated: "",
  receipt: "",
  receiptWithFeedback: "",
  receiptCancellation: "",
  appointmentScheduling: "",
  appointmentConfirmation: "",
  appointmentCancellation: "",
  appointmentReminder: "",
  appointmentReschedule: "",
  clientWalletTransaction: "",
  clientWalletExpiryReminder: "",
  clientDuesReminder: "",
  clientBirthdayReminder: "",
  default: "",
}

const WHATSAPP_TEMPLATE_LABELS: Record<string, string> = {
  receiptWithFeedback: "Receipt with Feedback Link",
  platformLeadWelcome: "Platform Lead Welcome",
}

function whatsappTemplateLabel(templateType: string): string {
  if (WHATSAPP_TEMPLATE_LABELS[templateType]) {
    return WHATSAPP_TEMPLATE_LABELS[templateType]
  }
  return templateType.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())
}

export function WhatsAppAdminSettings({ settings: propSettings, onSettingsChange }: WhatsAppAdminSettingsProps) {
  const { toast } = useToast()
  const [testPhone, setTestPhone] = useState('')
  const [testTemplateType, setTestTemplateType] = useState('default')
  const [isTesting, setIsTesting] = useState(false)
  const [trackingData, setTrackingData] = useState<any>(null)
  const [isLoadingTracking, setIsLoadingTracking] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [editTemplateId, setEditTemplateId] = useState('')
  const [editVariableMapping, setEditVariableMapping] = useState<Record<string, string>>({})
  const isInitialMount = useRef(true)

  const [settings, setSettings] = useState<WhatsAppSettingsState>(propSettings || {
    enabled: false,
    provider: "gupshup",
    templates: { ...EMPTY_WHATSAPP_TEMPLATE_SLOTS },
    templateVariables: {},
    receiptNotifications: { enabled: true, autoSendToClients: true, highValueThreshold: 0 },
    appointmentNotifications: {
      enabled: true,
      confirmations: true,
      newAppointments: true,
      reminders: false,
      cancellations: false,
    },
    systemAlerts: { enabled: false, lowInventory: false, paymentFailures: false },
    clientWalletTransactionNotifications: { enabled: true },
    clientWalletExpiryReminderNotifications: { enabled: true },
    clientDuesReminderNotifications: { enabled: true },
    clientBirthdayReminderNotifications: { enabled: true },
    quietHours: {
      enabled: false,
      start: "22:00",
      end: "08:00"
    }
  })

  useEffect(() => {
    // Only update settings if propSettings is defined (not undefined/null)
    // This prevents resetting to defaults when data is still loading
    if (propSettings !== undefined && propSettings !== null) {
      console.log('📥 [WhatsAppAdminSettings] Received propSettings:', {
        enabled: propSettings.enabled,
        enabledType: typeof propSettings.enabled,
        hasEnabled: propSettings.hasOwnProperty('enabled'),
        fullSettings: JSON.stringify(propSettings, null, 2)
      });
      
      // Deep merge to preserve existing state when propSettings updates
      setSettings(prev => {
        // Always use propSettings.enabled if it exists (even if false)
        // This ensures saved state from server is preserved
        const newSettings = {
          ...prev,
          ...propSettings,
          // Explicitly set enabled from propSettings if it exists
          enabled: propSettings.hasOwnProperty('enabled') ? propSettings.enabled : prev.enabled,
          // Preserve nested objects
          templates: {
            ...EMPTY_WHATSAPP_TEMPLATE_SLOTS,
            ...prev.templates,
            ...(propSettings.templates || {}),
          },
          templateVariables: {
            ...prev.templateVariables,
            ...(propSettings.templateVariables || {})
          },
          clientWalletTransactionNotifications:
            propSettings.clientWalletTransactionNotifications !== undefined
              ? propSettings.clientWalletTransactionNotifications
              : prev.clientWalletTransactionNotifications,
          clientWalletExpiryReminderNotifications:
            propSettings.clientWalletExpiryReminderNotifications !== undefined
              ? propSettings.clientWalletExpiryReminderNotifications
              : prev.clientWalletExpiryReminderNotifications
        };
        
        console.log('📥 [WhatsAppAdminSettings] Setting new settings with enabled:', newSettings.enabled);
        return newSettings;
      })
      isInitialMount.current = true
    }
  }, [propSettings])

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    
    if (settings && Object.keys(settings).length > 0) {
      const timeoutId = setTimeout(() => {
        onSettingsChange(settings)
      }, 0)
      return () => clearTimeout(timeoutId)
    }
  }, [settings])

  useEffect(() => {
    // Only load tracking data if we have an admin token
    const token = getAdminAuthToken()
    if (token) {
      loadTrackingData()
    }
  }, [])

  const handleSettingChange = (path: string, value: any) => {
    setSettings(prev => {
      const newSettings = JSON.parse(JSON.stringify(prev)) // Deep clone
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

  const handleApplyDefaultMapping = (templateType: string) => {
    const newMapping = buildDefaultWhatsAppVariableMapping(templateType)
    handleSettingChange(`templateVariables.${templateType}`, newMapping)
    toast({
      title: "Default mapping applied",
      description: `${Object.keys(newMapping).length} variable(s) configured for ${whatsappTemplateLabel(templateType)}.`,
    })
  }

  const handleEditTemplate = (templateType: string) => {
    setEditingTemplate(templateType)
    setEditTemplateId(settings.templates?.[templateType] || '')
    setEditVariableMapping({ ...(settings.templateVariables?.[templateType] || {}) })
  }

  const handleSaveEdit = () => {
    if (!editingTemplate) return

    const trimmedId = editTemplateId.trim()
    const mappingKeys = Object.keys(editVariableMapping).filter(
      (k) => editVariableMapping[k]?.trim()
    )

    if (trimmedId && mappingKeys.length === 0) {
      toast({
        title: "Map template variables",
        description: "Add at least one variable mapping ({{1}}, {{2}}, …) matching your approved Gupshup template.",
        variant: "destructive",
      })
      return
    }

    const cleanedMapping: Record<string, string> = {}
    for (const key of mappingKeys) {
      cleanedMapping[key] = editVariableMapping[key]
    }

    const finalSettings: WhatsAppSettingsState = {
      ...settings,
      templates: {
        ...(settings.templates || {}),
        [editingTemplate]: trimmedId,
      },
      templateVariables: {
        ...(settings.templateVariables || {}),
        [editingTemplate]: trimmedId ? cleanedMapping : {},
      },
    }

    setSettings(finalSettings)
    onSettingsChange(finalSettings)
    setEditingTemplate(null)
    setEditTemplateId('')
    setEditVariableMapping({})

    toast({
      title: "Saved",
      description: trimmedId
        ? `Template ID and ${mappingKeys.length} variable mapping(s) saved.`
        : "Template cleared.",
    })
  }

  const handleDeleteTemplate = (templateType: string) => {
    if (confirm(`Are you sure you want to delete the ${templateType} template configuration?`)) {
      handleSettingChange(`templates.${templateType}`, '')
      handleSettingChange(`templateVariables.${templateType}`, {})
      toast({
        title: "Success",
        description: "Template deleted successfully",
      })
    }
  }


  /**
   * Toggle template enabled status
   */
  const handleToggleTemplateStatus = (templateType: string, enabled: boolean) => {
    // Store status in a separate field or use template presence as status
    // For now, we'll use whether template ID exists as status
    if (!enabled) {
      handleSettingChange(`templates.${templateType}`, '')
    }
    // If enabling, user needs to configure via edit
  }

  const handleTestWhatsApp = async () => {
    if (!testPhone || testPhone.length < 10) {
      toast({
        title: "Error",
        description: "Please enter a valid phone number",
        variant: "destructive",
      })
      return
    }

    const token = getAdminAuthToken()
    if (!token) {
      toast({
        title: "Error",
        description: "Admin authentication required. Please log in again.",
        variant: "destructive",
      })
      return
    }

    setIsTesting(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const testUrl = `${API_URL}/admin/settings/test/whatsapp`
      
      console.log('🔔 Calling WhatsApp test endpoint:', testUrl)
      
      // Send test settings along with phone number
      const testSettings = {
        enabled: true,
        provider: 'gupshup',
        templates: settings.templates || {},
        templateVariables: settings.templateVariables || {},
      }
      
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: testPhone,
          templateType: testTemplateType,
          settings: testSettings
        })
      })

      if (!response.ok) {
        // Handle 404 specifically
        if (response.status === 404) {
          throw new Error('Test endpoint not found. Please ensure the backend server is running and has been restarted.')
        }
        // Try to parse error response
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success",
          description: `Test WhatsApp message sent to ${testPhone}`,
        })
      } else {
        throw new Error(data.error || 'Failed to send test WhatsApp message')
      }
    } catch (error: any) {
      console.error('WhatsApp test error:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to send test WhatsApp message",
        variant: "destructive",
      })
    } finally {
      setIsTesting(false)
    }
  }

  const loadTrackingData = async () => {
    setIsLoadingTracking(true)
    try {
      if (!getAdminAuthToken()) {
        console.warn('No admin token found, skipping tracking data load')
        setTrackingData(null)
        return
      }

      const data = await AdminPlatformWhatsAppInboxAPI.messagesTracking()
      setTrackingData(data)
    } catch (error) {
      console.error('Error loading tracking data:', error)
      setTrackingData(null)
    } finally {
      setIsLoadingTracking(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Enable WhatsApp Notifications</Label>
              <p className="text-xs text-gray-500">
                Send notifications via WhatsApp
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
            />
          </div>

          {settings.enabled && (
            <p className="text-xs text-muted-foreground rounded-lg border bg-slate-50 px-3 py-2">
              WhatsApp sends via Gupshup. Configure templates in{" "}
              <Link href="/admin/platform/template-manager" className="font-medium text-indigo-600 hover:underline">
                Platform Template Manager
              </Link>
              , or connect a salon app under Settings → WhatsApp Integration.
            </p>
          )}

          {/* Template Configuration — visible even when WhatsApp is disabled so IDs can be set up first */}
          <div className="space-y-4 pt-4 border-t">
            {!settings.enabled && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                WhatsApp is off — you can still configure template IDs below. Turn on WhatsApp above when you are ready to send.
              </p>
            )}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">WhatsApp Templates Configuration</Label>
                  <p className="text-xs text-muted-foreground">
                    Prefer{" "}
                    <Link
                      href="/admin/platform/template-manager"
                      className="font-medium text-indigo-600 hover:underline inline-flex items-center gap-1"
                    >
                      Platform Template Manager
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    {" "}to submit Gupshup templates, map notification slots, and auto-configure variable mapping. Use this table only to review IDs or enter a template ID manually.
                  </p>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 border-b border-slate-200">
                        <TableHead className="w-[200px]">Template Name</TableHead>
                        <TableHead className="w-[220px]">Template ID</TableHead>
                        <TableHead className="w-[140px]">Variables</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[150px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.keys(settings.templates || {}).filter(key => key !== 'default').map((templateType) => {
                        const templateName = whatsappTemplateLabel(templateType)
                        const templateId = settings.templates?.[templateType] || ''
                        const variableMapping = settings.templateVariables?.[templateType] || {}
                        const mappedCount = Object.keys(variableMapping).length
                        const isActive = !!templateId
                        
                        return (
                          <TableRow key={templateType}>
                            <TableCell className="font-medium">{templateName}</TableCell>
                            <TableCell>
                              <span className="text-sm text-gray-600 font-mono">{templateId || '-'}</span>
                            </TableCell>
                            <TableCell>
                              {mappedCount > 0 ? (
                                <Badge variant="outline" className="text-xs">{mappedCount} mapped</Badge>
                              ) : templateId ? (
                                <span className="text-xs text-amber-600">Not mapped</span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={isActive}
                                onCheckedChange={(checked) => {
                                  if (checked && !templateId) {
                                    handleEditTemplate(templateType)
                                  } else if (!checked) {
                                    handleToggleTemplateStatus(templateType, false)
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditTemplate(templateType)}
                                  className="h-7 w-7 p-0"
                                  title="Edit"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteTemplate(templateType)}
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title="Delete"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Template Variable Mapping — shown when a template ID is configured */}
                {Object.keys(settings.templates || {}).some(
                  (key) => key !== 'default' && Boolean(settings.templates?.[key]?.trim())
                ) && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Template Variable Mapping</Label>
                      <p className="text-xs text-gray-500">
                        Maps Gupshup placeholders (body_1 → {"{{1}}"}, body_2 → {"{{2}}"}, …) to CRM data fields. Usually filled automatically when you map a slot in Platform Template Manager.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {Object.keys(settings.templates || {}).filter(key => key !== 'default').map((templateType) => {
                        const templateName = whatsappTemplateLabel(templateType)
                        const templateId = settings.templates?.[templateType] || ''
                        const variableMapping = settings.templateVariables?.[templateType] || {};

                        if (!templateId.trim()) {
                          return null;
                        }

                        return (
                          <div key={templateType} className="p-4 border rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium text-sm">{templateName} Template Variables</h4>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleApplyDefaultMapping(templateType)}
                                className="text-xs h-7"
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Apply suggested mapping
                              </Button>
                            </div>
                            
                            <WhatsAppVariableMappingEditor
                              mapping={variableMapping}
                              onChange={(newMapping) =>
                                handleSettingChange(`templateVariables.${templateType}`, newMapping)
                              }
                              hint="Match the number of rows to placeholders in your approved template (e.g. 5 rows for {{1}}–{{5}})."
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

          </div>

          {settings.enabled && (
            <>
              <div className="space-y-2 pt-4 border-t">
                <Label>Test WhatsApp Configuration</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Select value={testTemplateType} onValueChange={setTestTemplateType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select template type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default Template</SelectItem>
                      <SelectItem value="welcomeMessage">Welcome Message</SelectItem>
                      <SelectItem value="businessAccountCreated">Business Account Created</SelectItem>
                      <SelectItem value="receipt">Receipt/Bill</SelectItem>
                      <SelectItem value="receiptWithFeedback">Receipt with Feedback Link</SelectItem>
                      <SelectItem value="receiptCancellation">Bill Cancellation</SelectItem>
                      <SelectItem value="appointmentScheduling">Appointment Scheduling</SelectItem>
                      <SelectItem value="appointmentConfirmation">Appointment Confirmation</SelectItem>
                      <SelectItem value="appointmentCancellation">Appointment Cancellation</SelectItem>
                      <SelectItem value="appointmentReminder">Appointment Reminder</SelectItem>
                      <SelectItem value="appointmentReschedule">Appointment Reschedule</SelectItem>
                      <SelectItem value="clientWalletTransaction">Prepaid wallet transaction</SelectItem>
                      <SelectItem value="clientWalletExpiryReminder">Prepaid wallet expiry reminder</SelectItem>
                      <SelectItem value="clientDuesReminder">Outstanding dues reminder</SelectItem>
                      <SelectItem value="clientBirthdayReminder">Birthday wish</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="tel"
                    placeholder="Phone number (e.g., 919876543210)"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleTestWhatsApp} 
                    variant="outline"
                    disabled={isTesting || !testPhone}
                    className="w-full"
                  >
                    <TestTube className="h-4 w-4 mr-2" />
                    {isTesting ? 'Sending...' : 'Test WhatsApp'}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Select a template type and enter a phone number to test. The template must be configured above.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-indigo-600" />
            <span>Notification Preferences</span>
          </CardTitle>
          <CardDescription>
            Configure which notifications to send via WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Receipt Notifications</Label>
              <p className="text-xs text-gray-500">
                Send receipt links via WhatsApp
              </p>
            </div>
            <Switch
              checked={
                typeof settings.receiptNotifications === 'boolean'
                  ? settings.receiptNotifications
                  : (settings.receiptNotifications?.enabled ?? false)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.receiptNotifications === 'object' && settings.receiptNotifications !== null
                    ? settings.receiptNotifications
                    : { autoSendToClients: true as boolean, highValueThreshold: 0 };
                handleSettingChange('receiptNotifications', { ...prev, enabled: checked });
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Appointment Notifications</Label>
              <p className="text-xs text-gray-500">
                Send appointment confirmations via WhatsApp
              </p>
            </div>
            <Switch
              checked={
                typeof settings.appointmentNotifications === 'boolean'
                  ? settings.appointmentNotifications
                  : (settings.appointmentNotifications?.enabled ?? false)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.appointmentNotifications === 'object' &&
                  settings.appointmentNotifications !== null
                    ? settings.appointmentNotifications
                    : { reminders: false, cancellations: false };
                handleSettingChange('appointmentNotifications', {
                  ...prev,
                  enabled: checked,
                  ...(checked
                    ? { confirmations: true, newAppointments: true }
                    : { confirmations: false, newAppointments: false }),
                });
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">System Alerts</Label>
              <p className="text-xs text-gray-500">
                Send system alerts via WhatsApp
              </p>
            </div>
            <Switch
              checked={
                typeof settings.systemAlerts === 'boolean'
                  ? settings.systemAlerts
                  : (settings.systemAlerts?.enabled ?? false)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.systemAlerts === 'object' && settings.systemAlerts !== null
                    ? settings.systemAlerts
                    : { lowInventory: false, paymentFailures: false };
                handleSettingChange('systemAlerts', { ...prev, enabled: checked });
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Prepaid wallet activity WhatsApp</Label>
              <p className="text-xs text-gray-500">
                When enabled, salons may send approved template messages for wallet credits, debits, adjustments, and
                refunds (per-salon toggle in business WhatsApp settings).
              </p>
            </div>
            <Switch
              checked={
                typeof settings.clientWalletTransactionNotifications === "boolean"
                  ? settings.clientWalletTransactionNotifications
                  : (settings.clientWalletTransactionNotifications?.enabled ?? true)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.clientWalletTransactionNotifications === "object" &&
                  settings.clientWalletTransactionNotifications !== null
                    ? settings.clientWalletTransactionNotifications
                    : { enabled: true }
                handleSettingChange("clientWalletTransactionNotifications", { ...prev, enabled: checked })
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Prepaid wallet expiry reminder WhatsApp</Label>
              <p className="text-xs text-gray-500">
                When enabled, salons may send the approved 30/15/7-day expiry template (also requires salon WhatsApp
                settings and Prepaid wallet expiry alerts).
              </p>
            </div>
            <Switch
              checked={
                typeof settings.clientWalletExpiryReminderNotifications === "boolean"
                  ? settings.clientWalletExpiryReminderNotifications
                  : (settings.clientWalletExpiryReminderNotifications?.enabled ?? true)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.clientWalletExpiryReminderNotifications === "object" &&
                  settings.clientWalletExpiryReminderNotifications !== null
                    ? settings.clientWalletExpiryReminderNotifications
                    : { enabled: true }
                handleSettingChange("clientWalletExpiryReminderNotifications", { ...prev, enabled: checked })
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Outstanding dues reminder WhatsApp</Label>
              <p className="text-xs text-gray-500">
                Every 7 days at 12:00 PM IST for clients with unpaid bill balance. Requires approved
                clientDuesReminder template.
              </p>
            </div>
            <Switch
              checked={
                typeof settings.clientDuesReminderNotifications === "boolean"
                  ? settings.clientDuesReminderNotifications
                  : (settings.clientDuesReminderNotifications?.enabled ?? true)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.clientDuesReminderNotifications === "object" &&
                  settings.clientDuesReminderNotifications !== null
                    ? settings.clientDuesReminderNotifications
                    : { enabled: true }
                handleSettingChange("clientDuesReminderNotifications", { ...prev, enabled: checked })
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Birthday wish WhatsApp</Label>
              <p className="text-xs text-gray-500">
                Once per year on the client&apos;s birthday at 12:00 PM IST. Requires DOB on client profile and
                approved clientBirthdayReminder template.
              </p>
            </div>
            <Switch
              checked={
                typeof settings.clientBirthdayReminderNotifications === "boolean"
                  ? settings.clientBirthdayReminderNotifications
                  : (settings.clientBirthdayReminderNotifications?.enabled ?? true)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.clientBirthdayReminderNotifications === "object" &&
                  settings.clientBirthdayReminderNotifications !== null
                    ? settings.clientBirthdayReminderNotifications
                    : { enabled: true }
                handleSettingChange("clientBirthdayReminderNotifications", { ...prev, enabled: checked })
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Platform lead welcome WhatsApp</Label>
              <p className="text-xs text-gray-500">
                Automatically send the welcome template to new platform leads (website demo form and admin Lead
                Management). Requires the shared Gupshup app and an approved Platform lead welcome template.
              </p>
            </div>
            <Switch
              checked={
                typeof settings.platformLeadWelcomeNotifications === "boolean"
                  ? settings.platformLeadWelcomeNotifications
                  : (settings.platformLeadWelcomeNotifications?.enabled ?? true)
              }
              onCheckedChange={(checked) => {
                const prev =
                  typeof settings.platformLeadWelcomeNotifications === "object" &&
                  settings.platformLeadWelcomeNotifications !== null
                    ? settings.platformLeadWelcomeNotifications
                    : { enabled: true }
                handleSettingChange("platformLeadWelcomeNotifications", { ...prev, enabled: checked })
              }}
            />
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Quiet Hours</Label>
                <p className="text-xs text-gray-500">
                  Disable WhatsApp messages during specified hours
                </p>
              </div>
              <Switch
                checked={settings.quietHours?.enabled}
                onCheckedChange={(checked) => handleSettingChange('quietHours.enabled', checked)}
              />
            </div>

            {settings.quietHours?.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quietStart">Start Time</Label>
                  <Input
                    id="quietStart"
                    type="time"
                    value={settings.quietHours?.start || '22:00'}
                    onChange={(e) => handleSettingChange('quietHours.start', e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quietEnd">End Time</Label>
                  <Input
                    id="quietEnd"
                    type="time"
                    value={settings.quietHours?.end || '08:00'}
                    onChange={(e) => handleSettingChange('quietHours.end', e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            <span>WhatsApp Usage & Tracking</span>
          </CardTitle>
          <CardDescription>
            View system-wide WhatsApp message statistics
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
                  <p className="text-sm text-gray-600">Total Messages</p>
                  <p className="text-2xl font-bold text-blue-600">{trackingData.totalMessages || 0}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600">Success Rate</p>
                  <p className="text-2xl font-bold text-green-600">{trackingData.successRate || 0}%</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-gray-600">Failed Messages</p>
                  <p className="text-2xl font-bold text-red-600">{trackingData.failedMessages || 0}</p>
                </div>
              </div>

              {trackingData.businessStats && trackingData.businessStats.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold mb-3">Messages by Business</h4>
                  <div className="space-y-2">
                    {trackingData.businessStats.slice(0, 10).map((stat: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium">{stat.businessName}</span>
                        <div className="flex items-center gap-4">
                          <Badge variant="outline">{stat.sent} sent</Badge>
                          <Badge variant="destructive">{stat.failed} failed</Badge>
                        </div>
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

      {/* Edit Template Modal */}
      <Dialog
        key={editingTemplate ?? "closed"}
        open={!!editingTemplate}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
      >
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit {editingTemplate ? whatsappTemplateLabel(editingTemplate) : ''} Template
            </DialogTitle>
            <DialogDescription>
              Enter the approved Gupshup template ID, then map each {"{{n}}"} placeholder to a CRM data field.
              Mapping from Platform Template Manager also works — use this dialog to adjust manually.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editTemplateId">Gupshup Template ID</Label>
              <Input
                id="editTemplateId"
                value={editTemplateId}
                onChange={(e) => setEditTemplateId(e.target.value)}
                placeholder="e.g. abc123-def456-..."
                className="font-mono text-sm"
              />
            </div>
            {editingTemplate ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Variable mapping</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      setEditVariableMapping(buildDefaultWhatsAppVariableMapping(editingTemplate))
                      toast({
                        title: "Suggested mapping applied",
                        description: "Review and remove extra rows if your template has fewer placeholders.",
                      })
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Use suggested mapping
                  </Button>
                </div>
                <WhatsAppVariableMappingEditor
                  mapping={editVariableMapping}
                  onChange={setEditVariableMapping}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

