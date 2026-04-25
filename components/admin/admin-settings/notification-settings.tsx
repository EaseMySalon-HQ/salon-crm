"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  AlertTriangle,
  Settings,
  TestTube,
  Send,
  MessageCircle
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { getAdminAuthToken } from "@/lib/admin-auth-storage"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, HelpCircle } from "lucide-react"
import { WhatsAppAdminSettings, EMPTY_WHATSAPP_TEMPLATE_SLOTS } from "./whatsapp-admin-settings"

const TEMPLATE_VARIABLES = [
  "{businessCode}", "{days}", "{alertType}", "{message}", "{clientName}", "{receiptNumber}",
  "{date}", "{time}", "{serviceName}", "{staffName}", "{businessName}", "{businessPhone}",
  "{items}", "{subtotal}", "{tax}", "{discount}", "{total}", "{paymentMethod}", "{notes}"
]

const DEFAULT_NOTIFICATION_SETTINGS = {
    // Email Configuration
    email: {
      enabled: true,
      provider: "smtp",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "",
      smtpPassword: "",
      fromEmail: "noreply@easemysalon.in",
      fromName: "EaseMySalon",
      replyTo: "support@easemysalon.in",
      maxRetries: 3,
      retryDelay: 5000
    },
    
    // SMS Configuration (MSG91)
    sms: {
      enabled: false,
      provider: "msg91",
      msg91AuthKey: "",
      templates: {
        receipt: "",
        appointmentConfirmation: "",
        appointmentCancellation: "",
        test: ""
      },
      maxRetries: 3,
      retryDelay: 5000
    },
    
    // Notification Templates
    templates: {
      businessCreated: {
        subject: "Welcome to EaseMySalon - Business Account Created",
        body: "Your business account has been successfully created. Business Code: {businessCode}",
        enabled: true
      },
      businessInactive: {
        subject: "Business Account Inactive - Action Required",
        body: "Your business account has been marked as inactive due to no login activity for {days} days.",
        enabled: true
      },
      systemAlert: {
        subject: "System Alert - {alertType}",
        body: "System alert: {message}. Please check the admin panel for details.",
        enabled: true
      },
      userCreated: {
        subject: "Welcome to EaseMySalon - User Account Created",
        body: "Your user account has been created. Please log in to access the system.",
        enabled: true
      }
    },
    
    // Alert Rules
    alerts: {
      systemHealth: {
        enabled: true,
        cpuThreshold: 80,
        memoryThreshold: 85,
        diskThreshold: 90,
        recipients: ["admin@salon.com"]
      },
      businessInactive: {
        enabled: true,
        daysThreshold: 7,
        recipients: ["admin@salon.com", "support@salon.com"]
      },
      errorAlerts: {
        enabled: true,
        errorLevel: "error",
        recipients: ["admin@salon.com", "dev@salon.com"]
      },
      securityAlerts: {
        enabled: true,
        failedLoginThreshold: 5,
        recipients: ["admin@salon.com", "security@salon.com"]
      }
    },
    
    // Notification Preferences
    preferences: {
      realTimeNotifications: true,
      digestNotifications: false,
      digestFrequency: "daily",
      quietHours: {
        enabled: false,
        start: "22:00",
        end: "08:00"
      },
      channels: {
        email: true,
        sms: false,
        inApp: true
      }
    },
    whatsapp: {
    enabled: false,
    provider: "msg91",
    msg91ApiKey: "",
    msg91SenderId: "",
    templates: { ...EMPTY_WHATSAPP_TEMPLATE_SLOTS },
    templateVariables: {},
    templateJavaScriptCodes: {}
  }
}

function mergeWithDefaults(prop?: any) {
  const def = JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS))
  if (!prop || typeof prop !== "object") return def
  return JSON.parse(JSON.stringify({
    email: { ...def.email, ...(prop.email || {}) },
    sms: { ...def.sms, ...(prop.sms || {}), templates: { ...def.sms.templates, ...(prop.sms?.templates || {}) } },
    templates: { ...def.templates, ...(prop.templates || {}) },
    alerts: {
      systemHealth: { ...def.alerts.systemHealth, ...(prop.alerts?.systemHealth || {}) },
      businessInactive: { ...def.alerts.businessInactive, ...(prop.alerts?.businessInactive || {}) },
      errorAlerts: { ...def.alerts.errorAlerts, ...(prop.alerts?.errorAlerts || {}) },
      securityAlerts: { ...def.alerts.securityAlerts, ...(prop.alerts?.securityAlerts || {}) }
    },
    preferences: {
      ...def.preferences,
      ...(prop.preferences || {}),
      quietHours: { ...def.preferences.quietHours, ...(prop.preferences?.quietHours || {}) },
      channels: { ...def.preferences.channels, ...(prop.preferences?.channels || {}) }
    },
    whatsapp: prop.whatsapp
      ? {
          ...def.whatsapp,
          ...prop.whatsapp,
          templates: {
            ...EMPTY_WHATSAPP_TEMPLATE_SLOTS,
            ...(def.whatsapp.templates || {}),
            ...(prop.whatsapp.templates || {}),
          },
          templateVariables: {
            ...(def.whatsapp.templateVariables || {}),
            ...(prop.whatsapp.templateVariables || {}),
          },
          templateJavaScriptCodes: {
            ...(def.whatsapp.templateJavaScriptCodes || {}),
            ...(prop.whatsapp.templateJavaScriptCodes || {}),
          },
        }
      : def.whatsapp
  }))
}

interface NotificationSettingsProps {
  settings?: any
  onSettingsChange: (settings: any) => void
}

export function NotificationSettings({ settings: propSettings, onSettingsChange }: NotificationSettingsProps) {
  const { toast } = useToast()
  const [testEmail, setTestEmail] = useState('')
  const [isTestingEmail, setIsTestingEmail] = useState(false)
  const [testSmsPhone, setTestSmsPhone] = useState('')
  const [testSmsMessage, setTestSmsMessage] = useState('Test message from EaseMySalon')
  const [isTestingSms, setIsTestingSms] = useState(false)
  const [receiptTemplateVariables, setReceiptTemplateVariables] = useState<string[]>([])
  const [receiptTemplateBodyPaste, setReceiptTemplateBodyPaste] = useState('')
  const [isFetchingTemplate, setIsFetchingTemplate] = useState(false)
  const isInitialMount = useRef(true)
  const [settings, setSettings] = useState(() => mergeWithDefaults(propSettings))

  // Update settings when propSettings change
  useEffect(() => {
    if (propSettings && Object.keys(propSettings).length > 0) {
      setSettings(mergeWithDefaults(propSettings))
      isInitialMount.current = true
    }
  }, [propSettings])

  // Notify parent of settings changes (deferred to avoid render issues)
  useEffect(() => {
    // Skip the initial mount to avoid calling onSettingsChange on first render
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    
    if (settings && Object.keys(settings).length > 0) {
      // Use setTimeout to defer the update until after render
      const timeoutId = setTimeout(() => {
        onSettingsChange(settings)
      }, 0)
      return () => clearTimeout(timeoutId)
    }
  }, [settings])

  const handleSettingChange = (path: string, value: any) => {
    setSettings((prev: typeof settings) => {
      const newSettings = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let current = newSettings
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i]
        if (current[key] == null || typeof current[key] !== 'object') {
          current[key] = {}
        }
        current = current[key]
      }
      current[keys[keys.length - 1]] = value
      return newSettings
    })
  }

  const handleTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast({
        title: "Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      })
      return
    }

    setIsTestingEmail(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const token = getAdminAuthToken()
      
      const response = await fetch(`${API_URL}/admin/settings/test/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          email: testEmail,
          settings: settings.email // Send current email settings for testing
        })
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success",
          description: `Test email sent to ${testEmail}`,
        })
      } else {
        throw new Error(data.error || 'Failed to send test email')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send test email",
        variant: "destructive",
      })
    } finally {
      setIsTestingEmail(false)
    }
  }

  const handleTestSMS = async () => {
    if (!testSmsPhone || testSmsPhone.replace(/\D/g, '').length < 10) {
      toast({
        title: "Error",
        description: "Please enter a valid phone number with country code",
        variant: "destructive",
      })
      return
    }
    setIsTestingSms(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const token = getAdminAuthToken()
      const response = await fetch(`${API_URL}/admin/settings/test/sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          phone: testSmsPhone,
          message: testSmsMessage || 'Test message from EaseMySalon'
        })
      })
      const data = await response.json()
      if (data.success) {
        toast({
          title: "Success",
          description: "Test SMS sent successfully",
        })
      } else {
        throw new Error(data.error || 'Failed to send test SMS')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send test SMS",
        variant: "destructive",
      })
    } finally {
      setIsTestingSms(false)
    }
  }

  const handleFetchReceiptTemplateVariables = async () => {
    const templateId = settings?.sms?.templates?.receipt?.trim()
    const templateBody = receiptTemplateBodyPaste?.trim()
    if (!templateId && !templateBody) {
      toast({
        title: "Missing input",
        description: "Enter a Receipt template ID above and click Fetch, or paste your template body below (e.g. Hi {{VAR1}}, amount {{VAR2}}) and click Fetch.",
        variant: "destructive",
      })
      return
    }
    setIsFetchingTemplate(true)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const token = getAdminAuthToken()
      const response = await fetch(`${API_URL}/admin/settings/sms/template-details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          templateId: templateId || undefined,
          templateBody: templateBody || undefined
        })
      })
      const data = await response.json()
      if (data.success && Array.isArray(data.data?.variables)) {
        setReceiptTemplateVariables(data.data.variables)
        if (data.data.templateBody) setReceiptTemplateBodyPaste(data.data.templateBody)
        toast({
          title: "Variables loaded",
          description: `Found ${data.data.variables.length} variable(s): ${data.data.variables.join(', ')}. Assign data for each below.`,
        })
      } else {
        throw new Error(data.error || data.hint || 'Could not fetch template variables')
      }
    } catch (error: any) {
      toast({
        title: "Could not fetch variables",
        description: error.message || "Save your MSG91 auth key and try again, or paste your template body and click Fetch.",
        variant: "destructive",
      })
    } finally {
      setIsFetchingTemplate(false)
    }
  }

  const handleSendTestNotification = () => {
    // Send test notification
    console.log("Sending test notification...")
  }

  return (
    <Tabs defaultValue="email" className="w-full">
      {/* Segmented control: Email | WhatsApp | SMS */}
      <div className="inline-flex p-1 rounded-lg bg-slate-100 border border-slate-200/80 mb-6">
        <TabsList className="grid w-full grid-cols-3 h-auto p-0 bg-transparent border-0 rounded-lg gap-0 min-w-[240px]">
          <TabsTrigger
            value="email"
            className="rounded-md px-4 py-2.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm border-0"
          >
            <Mail className="h-4 w-4 mr-2" />
            Email
          </TabsTrigger>
          <TabsTrigger
            value="whatsapp"
            className="rounded-md px-4 py-2.5 text-sm font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm border-0"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger
            value="sms"
            className="rounded-md px-4 py-2.5 text-sm font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm border-0"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            SMS
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="email" className="space-y-6 mt-6">
      {/* Email Configuration */}
      <Card className="rounded-xl border-slate-200/80 shadow-sm">
        <CardContent className="space-y-6 pt-6">
          <div className="flex items-center justify-between py-1">
            <div>
              <Label className="text-sm font-medium text-slate-900">Enable Email Notifications</Label>
              <p className="text-xs text-slate-500 mt-0.5">Send notifications via email</p>
            </div>
            <Switch
              checked={settings.email.enabled}
              onCheckedChange={(checked) => handleSettingChange('email.enabled', checked)}
            />
          </div>

          {settings.email.enabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="provider">Email Provider</Label>
                  <Select
                    value={settings.email.provider}
                    onValueChange={(value) => handleSettingChange('email.provider', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="resend">Resend</SelectItem>
                      <SelectItem value="smtp">SMTP</SelectItem>
                      <SelectItem value="sendgrid">SendGrid</SelectItem>
                      <SelectItem value="ses">AWS SES</SelectItem>
                      <SelectItem value="mailgun">Mailgun</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Resend Configuration */}
                {settings.email.provider === 'resend' && (
                  <div className="space-y-2">
                    <Label htmlFor="resendApiKey">Resend API Key</Label>
                    <Input
                      id="resendApiKey"
                      type="password"
                      value={settings.email.resendApiKey || ''}
                      onChange={(e) => handleSettingChange('email.resendApiKey', e.target.value)}
                      className="w-full"
                      placeholder="re_xxxxxxxxxxxxx"
                    />
                  </div>
                )}

                {/* SMTP Configuration */}
                {settings.email.provider === 'smtp' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="smtpHost">SMTP Host</Label>
                      <Input
                        id="smtpHost"
                        value={settings.email.smtpHost}
                        onChange={(e) => handleSettingChange('email.smtpHost', e.target.value)}
                        className="w-full"
                        placeholder="smtp.gmail.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smtpPort">SMTP Port</Label>
                      <Input
                        id="smtpPort"
                        type="number"
                        min="1"
                        max="65535"
                        value={settings.email.smtpPort}
                        onChange={(e) => handleSettingChange('email.smtpPort', parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smtpUser">SMTP Username</Label>
                      <Input
                        id="smtpUser"
                        type="email"
                        value={settings.email.smtpUser}
                        onChange={(e) => handleSettingChange('email.smtpUser', e.target.value)}
                        className="w-full"
                        placeholder="your-email@gmail.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="smtpPassword">SMTP Password</Label>
                      <Input
                        id="smtpPassword"
                        type="password"
                        value={settings.email.smtpPassword}
                        onChange={(e) => handleSettingChange('email.smtpPassword', e.target.value)}
                        className="w-full"
                        placeholder="App password or API key"
                      />
                    </div>
                  </>
                )}

                {/* SendGrid Configuration */}
                {settings.email.provider === 'sendgrid' && (
                  <div className="space-y-2">
                    <Label htmlFor="sendgridApiKey">SendGrid API Key</Label>
                    <Input
                      id="sendgridApiKey"
                      type="password"
                      value={settings.email.sendgridApiKey || ''}
                      onChange={(e) => handleSettingChange('email.sendgridApiKey', e.target.value)}
                      className="w-full"
                      placeholder="SG.xxxxxxxxxxxxx"
                    />
                  </div>
                )}

                {/* AWS SES Configuration */}
                {settings.email.provider === 'ses' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="sesAccessKeyId">AWS SES Access Key ID</Label>
                      <Input
                        id="sesAccessKeyId"
                        value={settings.email.sesAccessKeyId || ''}
                        onChange={(e) => handleSettingChange('email.sesAccessKeyId', e.target.value)}
                        className="w-full"
                        placeholder="AKIAIOSFODNN7EXAMPLE"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sesSecretAccessKey">AWS SES Secret Access Key</Label>
                      <Input
                        id="sesSecretAccessKey"
                        type="password"
                        value={settings.email.sesSecretAccessKey || ''}
                        onChange={(e) => handleSettingChange('email.sesSecretAccessKey', e.target.value)}
                        className="w-full"
                        placeholder="Your secret key"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sesRegion">AWS SES Region</Label>
                      <Input
                        id="sesRegion"
                        value={settings.email.sesRegion || 'us-east-1'}
                        onChange={(e) => handleSettingChange('email.sesRegion', e.target.value)}
                        className="w-full"
                        placeholder="us-east-1"
                      />
                    </div>
                  </>
                )}

                {/* Mailgun Configuration */}
                {settings.email.provider === 'mailgun' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="mailgunApiKey">Mailgun API Key</Label>
                      <Input
                        id="mailgunApiKey"
                        type="password"
                        value={settings.email.mailgunApiKey || ''}
                        onChange={(e) => handleSettingChange('email.mailgunApiKey', e.target.value)}
                        className="w-full"
                        placeholder="Your Mailgun API key"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mailgunDomain">Mailgun Domain</Label>
                      <Input
                        id="mailgunDomain"
                        value={settings.email.mailgunDomain || ''}
                        onChange={(e) => handleSettingChange('email.mailgunDomain', e.target.value)}
                        className="w-full"
                        placeholder="mg.yourdomain.com"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="fromEmail">From Email</Label>
                  <Input
                    id="fromEmail"
                    type="email"
                    value={settings.email.fromEmail}
                    onChange={(e) => handleSettingChange('email.fromEmail', e.target.value)}
                    className="w-full"
                    placeholder="noreply@easemysalon.in"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fromName">From Name</Label>
                  <Input
                    id="fromName"
                    value={settings.email.fromName}
                    onChange={(e) => handleSettingChange('email.fromName', e.target.value)}
                    className="w-full"
                    placeholder="EaseMySalon"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="replyTo">Reply To</Label>
                  <Input
                    id="replyTo"
                    type="email"
                    value={settings.email.replyTo}
                    onChange={(e) => handleSettingChange('email.replyTo', e.target.value)}
                    className="w-full"
                    placeholder="support@easemysalon.in"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">SMTP Secure</Label>
                  <p className="text-xs text-gray-500">
                    Use SSL/TLS encryption
                  </p>
                </div>
                <Switch
                  checked={settings.email.smtpSecure}
                  onCheckedChange={(checked) => handleSettingChange('email.smtpSecure', checked)}
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <Label className="text-sm font-medium text-slate-700">Test email</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="email"
                    placeholder="Enter email address to test"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="flex-1 min-w-[200px]"
                  />
                  <Button
                    onClick={handleTestEmail}
                    variant="outline"
                    disabled={isTestingEmail || !testEmail}
                    className="border-slate-200"
                  >
                    <TestTube className="h-4 w-4 mr-2" />
                    {isTestingEmail ? "Sending…" : "Send test"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Send a test email to verify configuration</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Email Templates - each as a card */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Email Templates</h3>
          <p className="text-sm text-slate-500">Customize notification templates and messages</p>
        </div>

        <Collapsible className="group mb-4">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            <HelpCircle className="h-4 w-4" />
            Available variables
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-100 flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES.map((v) => (
                <code key={v} className="text-xs px-2 py-1 rounded bg-white border border-slate-200 text-slate-700">{v}</code>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {Object.entries(settings.templates).map(([key, template]) => {
          const t = template as { enabled?: boolean; subject?: string; body?: string }
          return (
            <Card key={key} className="rounded-xl border-slate-200/80 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold capitalize">{key.replace(/([A-Z])/g, " $1")}</CardTitle>
                  <Switch
                    checked={t.enabled ?? false}
                    onCheckedChange={(checked) => handleSettingChange(`templates.${key}.enabled`, checked)}
                  />
                </div>
              </CardHeader>
              {t.enabled && (
                <CardContent className="space-y-4 pt-0">
                  <div className="space-y-2">
                    <Label htmlFor={`${key}-subject`}>Subject</Label>
                    <Input
                      id={`${key}-subject`}
                      value={t.subject ?? ""}
                      onChange={(e) => handleSettingChange(`templates.${key}.subject`, e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${key}-body`}>Message body</Label>
                    <Textarea
                      id={`${key}-body`}
                      value={t.body ?? ""}
                      onChange={(e) => handleSettingChange(`templates.${key}.body`, e.target.value)}
                      className="w-full min-h-[100px]"
                      rows={4}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-slate-200"
                      onClick={() => toast({ title: "Preview", description: "Subject: " + (t.subject ?? "") + ". Body preview: " + (t.body ?? "").slice(0, 120) + "…" })}
                    >
                      Preview template
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-slate-200"
                      onClick={() => toast({ title: "Send test", description: "Test email would be sent for this template. Use the test field in Email Configuration to send a test." })}
                    >
                      Send test
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* Alert Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span>Alert Rules</span>
          </CardTitle>
          <CardDescription>
            Configure alert conditions and recipients
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* System Health Alerts */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">System Health Alerts</h4>
              <Switch
                checked={settings.alerts.systemHealth.enabled}
                onCheckedChange={(checked) => handleSettingChange('alerts.systemHealth.enabled', checked)}
              />
            </div>

            {settings.alerts.systemHealth.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cpuThreshold">CPU Threshold (%)</Label>
                  <Input
                    id="cpuThreshold"
                    type="number"
                    min="50"
                    max="100"
                    value={settings.alerts.systemHealth.cpuThreshold}
                    onChange={(e) => handleSettingChange('alerts.systemHealth.cpuThreshold', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="memoryThreshold">Memory Threshold (%)</Label>
                  <Input
                    id="memoryThreshold"
                    type="number"
                    min="50"
                    max="100"
                    value={settings.alerts.systemHealth.memoryThreshold}
                    onChange={(e) => handleSettingChange('alerts.systemHealth.memoryThreshold', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diskThreshold">Disk Threshold (%)</Label>
                  <Input
                    id="diskThreshold"
                    type="number"
                    min="50"
                    max="100"
                    value={settings.alerts.systemHealth.diskThreshold}
                    onChange={(e) => handleSettingChange('alerts.systemHealth.diskThreshold', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="systemHealthRecipients">Recipients</Label>
                  <Input
                    id="systemHealthRecipients"
                    value={settings.alerts.systemHealth.recipients.join(', ')}
                    onChange={(e) => handleSettingChange('alerts.systemHealth.recipients', e.target.value.split(',').map(email => email.trim()))}
                    className="w-full"
                    placeholder="admin@salon.com, support@salon.com"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Business Inactive Alerts */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Business Inactive Alerts</h4>
              <Switch
                checked={settings.alerts.businessInactive.enabled}
                onCheckedChange={(checked) => handleSettingChange('alerts.businessInactive.enabled', checked)}
              />
            </div>

            {settings.alerts.businessInactive.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="inactiveDaysThreshold">Days Threshold</Label>
                  <Input
                    id="inactiveDaysThreshold"
                    type="number"
                    min="1"
                    max="30"
                    value={settings.alerts.businessInactive.daysThreshold}
                    onChange={(e) => handleSettingChange('alerts.businessInactive.daysThreshold', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inactiveRecipients">Recipients</Label>
                  <Input
                    id="inactiveRecipients"
                    value={settings.alerts.businessInactive.recipients.join(', ')}
                    onChange={(e) => handleSettingChange('alerts.businessInactive.recipients', e.target.value.split(',').map(email => email.trim()))}
                    className="w-full"
                    placeholder="admin@salon.com, support@salon.com"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error Alerts */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Error Alerts</h4>
              <Switch
                checked={settings.alerts.errorAlerts.enabled}
                onCheckedChange={(checked) => handleSettingChange('alerts.errorAlerts.enabled', checked)}
              />
            </div>

            {settings.alerts.errorAlerts.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="errorLevel">Error Level</Label>
                  <Select
                    value={settings.alerts.errorAlerts.errorLevel}
                    onValueChange={(value) => handleSettingChange('alerts.errorAlerts.errorLevel', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="warn">Warning</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="errorRecipients">Recipients</Label>
                  <Input
                    id="errorRecipients"
                    value={settings.alerts.errorAlerts.recipients.join(', ')}
                    onChange={(e) => handleSettingChange('alerts.errorAlerts.recipients', e.target.value.split(',').map(email => email.trim()))}
                    className="w-full"
                    placeholder="admin@salon.com, dev@salon.com"
                  />
                </div>
              </div>
            )}
          </div>
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
            Configure global notification preferences and delivery channels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Real-time Notifications</Label>
                <p className="text-xs text-gray-500">
                  Send notifications immediately when events occur
                </p>
              </div>
              <Switch
                checked={settings.preferences.realTimeNotifications}
                onCheckedChange={(checked) => handleSettingChange('preferences.realTimeNotifications', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Digest Notifications</Label>
                <p className="text-xs text-gray-500">
                  Send periodic digest of notifications
                </p>
              </div>
              <Switch
                checked={settings.preferences.digestNotifications}
                onCheckedChange={(checked) => handleSettingChange('preferences.digestNotifications', checked)}
              />
            </div>

            {settings.preferences.digestNotifications && (
              <div className="space-y-2">
                <Label htmlFor="digestFrequency">Digest Frequency</Label>
                <Select
                  value={settings.preferences.digestFrequency}
                  onValueChange={(value) => handleSettingChange('preferences.digestFrequency', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Quiet Hours</Label>
                <p className="text-xs text-gray-500">
                  Disable notifications during specified hours
                </p>
              </div>
              <Switch
                checked={settings.preferences.quietHours.enabled}
                onCheckedChange={(checked) => handleSettingChange('preferences.quietHours.enabled', checked)}
              />
            </div>

            {settings.preferences.quietHours.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quietStart">Start Time</Label>
                  <Input
                    id="quietStart"
                    type="time"
                    value={settings.preferences.quietHours.start}
                    onChange={(e) => handleSettingChange('preferences.quietHours.start', e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quietEnd">End Time</Label>
                  <Input
                    id="quietEnd"
                    type="time"
                    value={settings.preferences.quietHours.end}
                    onChange={(e) => handleSettingChange('preferences.quietHours.end', e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="font-medium">Delivery Channels</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Email</Label>
                  <p className="text-xs text-gray-500">
                    Send notifications via email
                  </p>
                </div>
                <Switch
                  checked={settings.preferences.channels.email}
                  onCheckedChange={(checked) => handleSettingChange('preferences.channels.email', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">SMS</Label>
                  <p className="text-xs text-gray-500">
                    Send notifications via SMS
                  </p>
                </div>
                <Switch
                  checked={settings.preferences.channels.sms}
                  onCheckedChange={(checked) => handleSettingChange('preferences.channels.sms', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">In-App</Label>
                  <p className="text-xs text-gray-500">
                    Show notifications in the application
                  </p>
                </div>
                <Switch
                  checked={settings.preferences.channels.inApp}
                  onCheckedChange={(checked) => handleSettingChange('preferences.channels.inApp', checked)}
                />
              </div>
            </div>
          </div>

          <div className="flex space-x-2">
            <Button onClick={handleSendTestNotification} className="bg-indigo-600 hover:bg-indigo-700">
              <Send className="h-4 w-4 mr-2" />
              Send Test Notification
            </Button>
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="whatsapp" className="mt-6">
        <WhatsAppAdminSettings 
          settings={settings?.whatsapp}
          onSettingsChange={(whatsappSettings) => {
            // settings is already the notifications object, so just merge whatsapp into it
            const newSettings = {
              ...settings,
              whatsapp: whatsappSettings
            };
            onSettingsChange(newSettings);
          }}
        />
      </TabsContent>

      <TabsContent value="sms" className="mt-6 space-y-6">
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="sms-enabled">Enable SMS notifications</Label>
              <Switch
                id="sms-enabled"
                checked={settings?.sms?.enabled ?? false}
                onCheckedChange={(checked) => handleSettingChange('sms.enabled', checked)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sms-authkey">MSG91 Auth Key</Label>
              <Input
                id="sms-authkey"
                type="password"
                placeholder="Your MSG91 auth key"
                value={settings?.sms?.msg91AuthKey ?? ''}
                onChange={(e) => handleSettingChange('sms.msg91AuthKey', e.target.value)}
              />
            </div>
            <div className="space-y-4">
              <Label>Template IDs (from MSG91 dashboard)</Label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sms-template-receipt" className="text-muted-foreground text-sm">Receipt</Label>
                  <div className="flex gap-2">
                    <Input
                      id="sms-template-receipt"
                      placeholder="Template ID for receipts"
                      className="flex-1"
                      value={settings?.sms?.templates?.receipt ?? ''}
                      onChange={(e) => handleSettingChange('sms.templates.receipt', e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isFetchingTemplate}
                      onClick={handleFetchReceiptTemplateVariables}
                    >
                      {isFetchingTemplate ? 'Fetching…' : 'Fetch variables'}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">Optional: paste template body below if Fetch fails (e.g. &quot;Hi {`{{VAR1}}`}, amount {`{{VAR2}}`}&quot;).</p>
                  <Textarea
                    placeholder="Paste template body to extract variables (e.g. Hi {{VAR1}}, your total is {{VAR2}})"
                    value={receiptTemplateBodyPaste}
                    onChange={(e) => setReceiptTemplateBodyPaste(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sms-template-appointmentConfirmation" className="text-muted-foreground text-sm">Appointment confirmation</Label>
                  <Input
                    id="sms-template-appointmentConfirmation"
                    placeholder="Template ID for appointment confirmation"
                    value={settings?.sms?.templates?.appointmentConfirmation ?? ''}
                    onChange={(e) => handleSettingChange('sms.templates.appointmentConfirmation', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sms-template-appointmentCancellation" className="text-muted-foreground text-sm">Appointment cancellation</Label>
                  <Input
                    id="sms-template-appointmentCancellation"
                    placeholder="Template ID for cancellation"
                    value={settings?.sms?.templates?.appointmentCancellation ?? ''}
                    onChange={(e) => handleSettingChange('sms.templates.appointmentCancellation', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sms-template-test" className="text-muted-foreground text-sm">Test (optional)</Label>
                  <Input
                    id="sms-template-test"
                    placeholder="Template ID for test SMS"
                    value={settings?.sms?.templates?.test ?? ''}
                    onChange={(e) => handleSettingChange('sms.templates.test', e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-4 pt-4 border-t">
              <Label className="text-sm font-medium">Receipt template variables (MSG91)</Label>
              <p className="text-muted-foreground text-sm">
                Use &quot;Fetch variables&quot; above to load variables from your template, then assign data for each.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {(receiptTemplateVariables.length > 0 ? receiptTemplateVariables : ['VAR1', 'VAR2', 'VAR3', 'VAR4', 'VAR5']).map((varKey) => {
                  const raw = settings?.sms?.receiptVariableMapping?.[varKey];
                  const selectValue = (raw === '' || raw === undefined || raw === '__none__') ? '__none__' : raw;
                  return (
                  <div key={varKey} className="space-y-2">
                    <Label htmlFor={`sms-receipt-${varKey}`} className="text-muted-foreground text-sm">{varKey}</Label>
                    <Select
                      value={selectValue}
                      onValueChange={(value) => handleSettingChange(`sms.receiptVariableMapping.${varKey}`, value === '__none__' ? undefined : value)}
                    >
                      <SelectTrigger id={`sms-receipt-${varKey}`}>
                        <SelectValue placeholder="— Don't use" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Don't use</SelectItem>
                        <SelectItem value="clientName">Client name</SelectItem>
                        <SelectItem value="businessName">Business name</SelectItem>
                        <SelectItem value="total">Total amount</SelectItem>
                        <SelectItem value="receiptNumber">Receipt / Bill number</SelectItem>
                        <SelectItem value="receiptLink">Receipt link</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TestTube className="h-5 w-5" />
              <span>Test SMS</span>
            </CardTitle>
            <CardDescription>
              Send a test SMS to verify your MSG91 configuration. Requires a test template ID above (with VAR1 for message).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-sms-phone">Phone number (with country code, e.g. 919876543210)</Label>
              <Input
                id="test-sms-phone"
                placeholder="919876543210"
                value={testSmsPhone}
                onChange={(e) => setTestSmsPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-sms-message">Message (VAR1 in test template)</Label>
              <Input
                id="test-sms-message"
                placeholder="Test message from EaseMySalon"
                value={testSmsMessage}
                onChange={(e) => setTestSmsMessage(e.target.value)}
              />
            </div>
            <Button onClick={handleTestSMS} disabled={isTestingSms}>
              {isTestingSms ? "Sending..." : "Send test SMS"}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
