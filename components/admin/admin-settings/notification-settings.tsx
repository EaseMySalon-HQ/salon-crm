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
import { WhatsAppAdminSettings } from "./whatsapp-admin-settings"

interface NotificationSettingsProps {
  settings?: any
  onSettingsChange: (settings: any) => void
}

export function NotificationSettings({ settings: propSettings, onSettingsChange }: NotificationSettingsProps) {
  const { toast } = useToast()
  const [testEmail, setTestEmail] = useState('')
  const [isTestingEmail, setIsTestingEmail] = useState(false)
  const isInitialMount = useRef(true)
  const [settings, setSettings] = useState(propSettings || {
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
      fromName: "Ease My Salon",
      replyTo: "support@easemysalon.in",
      maxRetries: 3,
      retryDelay: 5000
    },
    
    // SMS Configuration
    sms: {
      enabled: false,
      provider: "twilio",
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioFromNumber: "",
      awsAccessKeyId: "",
      awsSecretAccessKey: "",
      awsRegion: "us-east-1",
      maxRetries: 3,
      retryDelay: 5000
    },
    
    // Notification Templates
    templates: {
      businessCreated: {
        subject: "Welcome to Ease My Salon - Business Account Created",
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
        subject: "Welcome to Ease My Salon - User Account Created",
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
    }
  })

  // Update settings when propSettings change
  useEffect(() => {
    if (propSettings) {
      setSettings(propSettings)
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
    setSettings(prev => {
      const newSettings = { ...prev }
      const keys = path.split('.')
      let current = newSettings
      
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]]
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

  const handleTestSMS = () => {
    // Test SMS functionality
    console.log("Testing SMS...")
  }

  const handleSendTestNotification = () => {
    // Send test notification
    console.log("Sending test notification...")
  }

  return (
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
          <MessageSquare className="h-4 w-4" />
          SMS
          <Badge variant="secondary" className="ml-2">Coming Soon</Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="email" className="space-y-6 mt-6">
      {/* Email Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Mail className="h-5 w-5 text-blue-600" />
            <span>Email Configuration</span>
          </CardTitle>
          <CardDescription>
            Configure email service provider and settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Enable Email Notifications</Label>
              <p className="text-xs text-gray-500">
                Send notifications via email
              </p>
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
                    placeholder="Ease My Salon"
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

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    placeholder="Enter email address to test"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleTestEmail} 
                    variant="outline"
                    disabled={isTestingEmail || !testEmail}
                  >
                    <TestTube className="h-4 w-4 mr-2" />
                    {isTestingEmail ? 'Sending...' : 'Test Email'}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Enter an email address to test the current email configuration
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* SMS Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5 text-green-600" />
            <span>SMS Configuration</span>
          </CardTitle>
          <CardDescription>
            Configure SMS service provider and settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Enable SMS Notifications</Label>
              <p className="text-xs text-gray-500">
                Send notifications via SMS
              </p>
            </div>
            <Switch
              checked={settings.sms.enabled}
              onCheckedChange={(checked) => handleSettingChange('sms.enabled', checked)}
            />
          </div>

          {settings.sms.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="smsProvider">SMS Provider</Label>
                <Select
                  value={settings.sms.provider}
                  onValueChange={(value) => handleSettingChange('sms.provider', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="twilio">Twilio</SelectItem>
                    <SelectItem value="aws">AWS SNS</SelectItem>
                    <SelectItem value="nexmo">Nexmo</SelectItem>
                    <SelectItem value="textlocal">TextLocal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {settings.sms.provider === "twilio" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="twilioAccountSid">Twilio Account SID</Label>
                    <Input
                      id="twilioAccountSid"
                      value={settings.sms.twilioAccountSid}
                      onChange={(e) => handleSettingChange('sms.twilioAccountSid', e.target.value)}
                      className="w-full"
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="twilioAuthToken">Twilio Auth Token</Label>
                    <Input
                      id="twilioAuthToken"
                      type="password"
                      value={settings.sms.twilioAuthToken}
                      onChange={(e) => handleSettingChange('sms.twilioAuthToken', e.target.value)}
                      className="w-full"
                      placeholder="Your auth token"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="twilioFromNumber">From Number</Label>
                    <Input
                      id="twilioFromNumber"
                      value={settings.sms.twilioFromNumber}
                      onChange={(e) => handleSettingChange('sms.twilioFromNumber', e.target.value)}
                      className="w-full"
                      placeholder="+1234567890"
                    />
                  </div>
                </div>
              )}

              {settings.sms.provider === "aws" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="awsAccessKeyId">AWS Access Key ID</Label>
                    <Input
                      id="awsAccessKeyId"
                      value={settings.sms.awsAccessKeyId}
                      onChange={(e) => handleSettingChange('sms.awsAccessKeyId', e.target.value)}
                      className="w-full"
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="awsSecretAccessKey">AWS Secret Access Key</Label>
                    <Input
                      id="awsSecretAccessKey"
                      type="password"
                      value={settings.sms.awsSecretAccessKey}
                      onChange={(e) => handleSettingChange('sms.awsSecretAccessKey', e.target.value)}
                      className="w-full"
                      placeholder="Your secret key"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="awsRegion">AWS Region</Label>
                    <Input
                      id="awsRegion"
                      value={settings.sms.awsRegion}
                      onChange={(e) => handleSettingChange('sms.awsRegion', e.target.value)}
                      className="w-full"
                      placeholder="us-east-1"
                    />
                  </div>
                </div>
              )}

              <div className="flex space-x-2">
                <Button onClick={handleTestSMS} variant="outline">
                  <TestTube className="h-4 w-4 mr-2" />
                  Test SMS
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Notification Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bell className="h-5 w-5 text-purple-600" />
            <span>Notification Templates</span>
          </CardTitle>
          <CardDescription>
            Customize notification templates and messages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(settings.templates).map(([key, template]) => (
            <div key={key} className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <h4 className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</h4>
                <Switch
                  checked={template.enabled}
                  onCheckedChange={(checked) => handleSettingChange(`templates.${key}.enabled`, checked)}
                />
              </div>

              {template.enabled && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${key}-subject`}>Subject</Label>
                    <Input
                      id={`${key}-subject`}
                      value={template.subject}
                      onChange={(e) => handleSettingChange(`templates.${key}.subject`, e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${key}-body`}>Message Body</Label>
                    <Textarea
                      id={`${key}-body`}
                      value={template.body}
                      onChange={(e) => handleSettingChange(`templates.${key}.body`, e.target.value)}
                      className="w-full"
                      rows={3}
                    />
                    <p className="text-xs text-gray-500">
                      Use variables like {`{businessCode}`, `{days}`, `{alertType}`, `{message}`, `{clientName}`, `{receiptNumber}`, `{date}`, `{time}`, `{serviceName}`, `{staffName}`, `{businessName}`, `{businessPhone}`, `{items}`, `{subtotal}`, `{tax}`, `{discount}`, `{total}`, `{paymentMethod}`, `{notes}`} in your templates
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

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

      <TabsContent value="sms" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              <span>SMS Configuration</span>
            </CardTitle>
            <CardDescription>
              SMS notifications are coming soon
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">SMS Notifications Coming Soon</p>
              <p className="text-sm">We're working on adding SMS notification support. Stay tuned!</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
