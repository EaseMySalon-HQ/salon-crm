"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Zap, 
  Shield, 
  Globe, 
  Settings,
  Plus,
  Trash2,
  Edit,
  Key,
  Link
} from "lucide-react"

interface APISettingsProps {
  settings?: any
  onSettingsChange: (settings: any) => void
}

export function APISettings({ settings: propSettings, onSettingsChange }: APISettingsProps) {
  const [settings, setSettings] = useState(propSettings || {
    // API Configuration
    api: {
      version: "v1",
      baseUrl: "https://api.easemysalon.com",
      timeout: 30000,
      maxRequestsPerMinute: 100,
      enableCORS: true,
      allowedOrigins: ["https://easemysalon.com", "https://admin.easemysalon.com"],
      enableRateLimiting: true,
      enableLogging: true,
      enableMetrics: true
    },
    
    // Rate Limiting
    rateLimiting: {
      enabled: true,
      windowMs: 60000, // 1 minute
      maxRequests: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: "ip", // ip, user, custom
      customKeyGenerator: "",
      message: "Too many requests, please try again later.",
      statusCode: 429
    },
    
    // Authentication
    authentication: {
      jwtSecret: "your-super-secret-jwt-key-change-this-in-production",
      jwtExpiration: "24h",
      refreshTokenExpiration: "7d",
      enableRefreshTokens: true,
      enableApiKeys: true,
      apiKeyLength: 32,
      enableOAuth: false,
      oauthProviders: []
    },
    
    // Webhooks
    webhooks: [
      {
        id: 1,
        name: "Business Created",
        url: "https://webhook.site/unique-id",
        events: ["business.created"],
        secret: "webhook-secret-key",
        enabled: true,
        retryCount: 3,
        timeout: 5000
      },
      {
        id: 2,
        name: "User Created",
        url: "https://webhook.site/unique-id-2",
        events: ["user.created", "user.updated"],
        secret: "webhook-secret-key-2",
        enabled: false,
        retryCount: 3,
        timeout: 5000
      }
    ],
    
    // External Integrations
    integrations: {
      paymentGateway: {
        enabled: false,
        provider: "stripe",
        stripePublishableKey: "",
        stripeSecretKey: "",
        stripeWebhookSecret: "",
        razorpayKeyId: "",
        razorpayKeySecret: "",
        razorpayWebhookSecret: ""
      },
      emailService: {
        enabled: true,
        provider: "smtp",
        sendgridApiKey: "",
        awsSesAccessKey: "",
        awsSesSecretKey: "",
        awsSesRegion: "us-east-1"
      },
      smsService: {
        enabled: false,
        provider: "twilio",
        twilioAccountSid: "",
        twilioAuthToken: "",
        twilioFromNumber: ""
      },
      analytics: {
        enabled: false,
        provider: "google",
        googleAnalyticsId: "",
        mixpanelToken: "",
        amplitudeApiKey: ""
      }
    },
    
    // Security
    security: {
      enableHTTPS: true,
      enableHSTS: true,
      enableCSRF: true,
      enableXSSProtection: true,
      enableContentSecurityPolicy: true,
      allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      maxRequestSize: "10mb",
      enableRequestValidation: true,
      enableResponseValidation: true
    }
  })

  // Update settings when propSettings change (merge so nested objects always exist)
  useEffect(() => {
    if (propSettings) {
      setSettings(prev => {
        const next = { ...prev, ...propSettings }
        if (!next.api || typeof next.api !== 'object') next.api = { version: 'v1', baseUrl: 'https://api.easemysalon.com', timeout: 30000, maxRequestsPerMinute: 100, enableCORS: true, allowedOrigins: [], enableRateLimiting: true, enableLogging: true, enableMetrics: true, ...(prev?.api || {}), ...(propSettings?.api || {}) }
        if (!next.rateLimiting || typeof next.rateLimiting !== 'object') next.rateLimiting = prev?.rateLimiting || {}
        const defaultAuth = { jwtSecret: '', jwtExpiration: '24h', refreshTokenExpiration: '7d', enableRefreshTokens: true, enableApiKeys: true, apiKeyLength: 32, enableOAuth: false, oauthProviders: [] }
        if (!next.authentication || typeof next.authentication !== 'object') next.authentication = { ...defaultAuth, ...(prev?.authentication || {}), ...(propSettings?.authentication || {}) }
        if (!Array.isArray(next.webhooks)) next.webhooks = prev?.webhooks ?? []
        const defaultIntegrations = { paymentGateway: { enabled: false, provider: 'stripe' }, emailService: { enabled: true, provider: 'smtp' }, smsService: { enabled: false }, analytics: {} }
        if (!next.integrations || typeof next.integrations !== 'object') next.integrations = { ...defaultIntegrations, ...(prev?.integrations || {}), ...(propSettings?.integrations || {}) }
        const defaultSecurity = { enableHTTPS: true, enableHSTS: true, enableCSRF: true, enableXSSProtection: true, enableContentSecurityPolicy: true, allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'], maxRequestSize: '10mb', enableRequestValidation: true, enableResponseValidation: true }
        if (!next.security || typeof next.security !== 'object') next.security = { ...defaultSecurity, ...(prev?.security || {}), ...(propSettings?.security || {}) }
        return next
      })
    }
  }, [propSettings])

  const handleSettingChange = (path: string, value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev }
      const keys = path.split('.')
      let current: any = newSettings
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]
        if (current[k] == null || typeof current[k] !== 'object') current[k] = {}
        current = current[k]
      }
      current[keys[keys.length - 1]] = value
      onSettingsChange(newSettings)
      return newSettings
    })
  }

  const handleWebhookChange = (id: number, field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      webhooks: (prev.webhooks ?? []).map(webhook => 
        webhook.id === id ? { ...webhook, [field]: value } : webhook
      )
    }))
    onSettingsChange()
  }

  const handleAddWebhook = () => {
    const newWebhook = {
      id: Date.now(),
      name: "New Webhook",
      url: "",
      events: [],
      secret: "",
      enabled: false,
      retryCount: 3,
      timeout: 5000
    }
    setSettings(prev => ({
      ...prev,
      webhooks: [...(prev.webhooks ?? []), newWebhook]
    }))
    onSettingsChange()
  }

  const handleDeleteWebhook = (id: number) => {
    setSettings(prev => ({
      ...prev,
      webhooks: (prev.webhooks ?? []).filter(webhook => webhook.id !== id)
    }))
    onSettingsChange()
  }

  const handleTestWebhook = (webhook: any) => {
    console.log("Testing webhook:", webhook)
  }

  const handleGenerateApiKey = () => {
    const apiKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => 
      byte.toString(16).padStart(2, '0')
    ).join('')
    console.log("Generated API Key:", apiKey)
  }

  return (
    <div className="space-y-6">
      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5 text-blue-600" />
            <span>API Configuration</span>
          </CardTitle>
          <CardDescription>
            Configure API endpoints, versioning, and basic settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="apiVersion">API Version</Label>
              <Input
                id="apiVersion"
                value={settings.api?.version ?? 'v1'}
                onChange={(e) => handleSettingChange('api.version', e.target.value)}
                className="w-full"
                placeholder="v1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                value={settings?.api?.baseUrl ?? ''}
                onChange={(e) => handleSettingChange('api.baseUrl', e.target.value)}
                className="w-full"
                placeholder="https://api.easemysalon.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (ms)</Label>
              <Input
                id="timeout"
                type="number"
                min="1000"
                max="300000"
                value={settings?.api?.timeout ?? 30000}
                onChange={(e) => handleSettingChange('api.timeout', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxRequestsPerMinute">Max Requests/Minute</Label>
              <Input
                id="maxRequestsPerMinute"
                type="number"
                min="1"
                max="10000"
                value={settings?.api?.maxRequestsPerMinute ?? 100}
                onChange={(e) => handleSettingChange('api.maxRequestsPerMinute', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allowedOrigins">Allowed Origins</Label>
            <Textarea
              id="allowedOrigins"
              value={(settings?.api?.allowedOrigins ?? []).join('\n')}
              onChange={(e) => handleSettingChange('api.allowedOrigins', e.target.value.split('\n').filter(origin => origin.trim()))}
              className="w-full"
              rows={3}
              placeholder="https://easemysalon.com&#10;https://admin.easemysalon.com"
            />
            <p className="text-xs text-gray-500">
              One origin per line
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable CORS</Label>
                <p className="text-xs text-gray-500">
                  Allow cross-origin requests
                </p>
              </div>
              <Switch
                checked={settings?.api?.enableCORS ?? true}
                onCheckedChange={(checked) => handleSettingChange('api.enableCORS', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable Rate Limiting</Label>
                <p className="text-xs text-gray-500">
                  Limit API requests per time window
                </p>
              </div>
              <Switch
                checked={settings?.api?.enableRateLimiting ?? true}
                onCheckedChange={(checked) => handleSettingChange('api.enableRateLimiting', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable Logging</Label>
                <p className="text-xs text-gray-500">
                  Log all API requests and responses
                </p>
              </div>
              <Switch
                checked={settings?.api?.enableLogging ?? true}
                onCheckedChange={(checked) => handleSettingChange('api.enableLogging', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable Metrics</Label>
                <p className="text-xs text-gray-500">
                  Collect API usage metrics
                </p>
              </div>
              <Switch
                checked={settings?.api?.enableMetrics ?? true}
                onCheckedChange={(checked) => handleSettingChange('api.enableMetrics', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rate Limiting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-green-600" />
            <span>Rate Limiting</span>
          </CardTitle>
          <CardDescription>
            Configure rate limiting rules and policies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Enable Rate Limiting</Label>
              <p className="text-xs text-gray-500">
                Limit the number of requests per time window
              </p>
            </div>
            <Switch
              checked={settings?.rateLimiting?.enabled ?? true}
              onCheckedChange={(checked) => handleSettingChange('rateLimiting.enabled', checked)}
            />
          </div>

          {settings?.rateLimiting?.enabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="windowMs">Time Window (ms)</Label>
                  <Input
                    id="windowMs"
                    type="number"
                    min="1000"
                    max="3600000"
                    value={settings?.rateLimiting?.windowMs ?? 60000}
                    onChange={(e) => handleSettingChange('rateLimiting.windowMs', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxRequests">Max Requests</Label>
                  <Input
                    id="maxRequests"
                    type="number"
                    min="1"
                    max="10000"
                    value={settings?.rateLimiting?.maxRequests ?? 100}
                    onChange={(e) => handleSettingChange('rateLimiting.maxRequests', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="keyGenerator">Key Generator</Label>
                  <Select
                    value={settings?.rateLimiting?.keyGenerator ?? 'ip'}
                    onValueChange={(value) => handleSettingChange('rateLimiting.keyGenerator', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ip">IP Address</SelectItem>
                      <SelectItem value="user">User ID</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="statusCode">Status Code</Label>
                  <Input
                    id="statusCode"
                    type="number"
                    min="400"
                    max="599"
                    value={settings?.rateLimiting?.statusCode ?? 429}
                    onChange={(e) => handleSettingChange('rateLimiting.statusCode', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              {settings?.rateLimiting?.keyGenerator === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="customKeyGenerator">Custom Key Generator Function</Label>
                  <Textarea
                    id="customKeyGenerator"
                    value={settings?.rateLimiting?.customKeyGenerator ?? ''}
                    onChange={(e) => handleSettingChange('rateLimiting.customKeyGenerator', e.target.value)}
                    className="w-full"
                    rows={3}
                    placeholder="function(req) { return req.user.id; }"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="rateLimitMessage">Rate Limit Message</Label>
                <Input
                  id="rateLimitMessage"
                  value={settings?.rateLimiting?.message ?? ''}
                  onChange={(e) => handleSettingChange('rateLimiting.message', e.target.value)}
                  className="w-full"
                  placeholder="Too many requests, please try again later."
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Skip Successful Requests</Label>
                    <p className="text-xs text-gray-500">
                      Don't count successful requests towards rate limit
                    </p>
                  </div>
                  <Switch
                    checked={settings?.rateLimiting?.skipSuccessfulRequests ?? false}
                    onCheckedChange={(checked) => handleSettingChange('rateLimiting.skipSuccessfulRequests', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Skip Failed Requests</Label>
                    <p className="text-xs text-gray-500">
                      Don't count failed requests towards rate limit
                    </p>
                  </div>
                  <Switch
                    checked={settings?.rateLimiting?.skipFailedRequests ?? false}
                    onCheckedChange={(checked) => handleSettingChange('rateLimiting.skipFailedRequests', checked)}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Key className="h-5 w-5 text-purple-600" />
            <span>Authentication</span>
          </CardTitle>
          <CardDescription>
            Configure authentication methods and security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="jwtSecret">JWT Secret</Label>
              <Input
                id="jwtSecret"
                type="password"
                value={settings.authentication?.jwtSecret ?? ''}
                onChange={(e) => handleSettingChange('authentication.jwtSecret', e.target.value)}
                className="w-full"
                placeholder="your-super-secret-jwt-key"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jwtExpiration">JWT Expiration</Label>
              <Input
                id="jwtExpiration"
                value={settings.authentication?.jwtExpiration ?? '24h'}
                onChange={(e) => handleSettingChange('authentication.jwtExpiration', e.target.value)}
                className="w-full"
                placeholder="24h"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="refreshTokenExpiration">Refresh Token Expiration</Label>
              <Input
                id="refreshTokenExpiration"
                value={settings.authentication?.refreshTokenExpiration ?? '7d'}
                onChange={(e) => handleSettingChange('authentication.refreshTokenExpiration', e.target.value)}
                className="w-full"
                placeholder="7d"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKeyLength">API Key Length</Label>
              <Input
                id="apiKeyLength"
                type="number"
                min="16"
                max="64"
                value={settings.authentication?.apiKeyLength ?? 32}
                onChange={(e) => handleSettingChange('authentication.apiKeyLength', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable Refresh Tokens</Label>
                <p className="text-xs text-gray-500">
                  Allow token refresh for extended sessions
                </p>
              </div>
              <Switch
                checked={settings.authentication?.enableRefreshTokens ?? true}
                onCheckedChange={(checked) => handleSettingChange('authentication.enableRefreshTokens', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable API Keys</Label>
                <p className="text-xs text-gray-500">
                  Allow API key authentication
                </p>
              </div>
              <Switch
                checked={settings.authentication?.enableApiKeys ?? true}
                onCheckedChange={(checked) => handleSettingChange('authentication.enableApiKeys', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable OAuth</Label>
                <p className="text-xs text-gray-500">
                  Allow OAuth authentication
                </p>
              </div>
              <Switch
                checked={settings.authentication?.enableOAuth ?? false}
                onCheckedChange={(checked) => handleSettingChange('authentication.enableOAuth', checked)}
              />
            </div>
          </div>

          {settings.authentication?.enableApiKeys && (
            <div className="flex space-x-2">
              <Button onClick={handleGenerateApiKey} variant="outline">
                <Key className="h-4 w-4 mr-2" />
                Generate API Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Link className="h-5 w-5 text-orange-600" />
            <span>Webhooks</span>
          </CardTitle>
          <CardDescription>
            Configure webhook endpoints for real-time notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-between items-center">
            <h4 className="font-medium">Webhook Endpoints</h4>
            <Button onClick={handleAddWebhook} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Webhook
            </Button>
          </div>

          <div className="space-y-4">
            {(settings.webhooks ?? []).map(webhook => (
              <div key={webhook.id} className="p-4 border rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <h5 className="font-medium">{webhook.name}</h5>
                    <Badge variant={webhook.enabled ? "default" : "secondary"}>
                      {webhook.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestWebhook(webhook)}
                    >
                      Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteWebhook(webhook.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`webhook-name-${webhook.id}`}>Name</Label>
                    <Input
                      id={`webhook-name-${webhook.id}`}
                      value={webhook.name}
                      onChange={(e) => handleWebhookChange(webhook.id, 'name', e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`webhook-url-${webhook.id}`}>URL</Label>
                    <Input
                      id={`webhook-url-${webhook.id}`}
                      value={webhook.url}
                      onChange={(e) => handleWebhookChange(webhook.id, 'url', e.target.value)}
                      className="w-full"
                      placeholder="https://webhook.site/unique-id"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`webhook-secret-${webhook.id}`}>Secret</Label>
                    <Input
                      id={`webhook-secret-${webhook.id}`}
                      type="password"
                      value={webhook.secret}
                      onChange={(e) => handleWebhookChange(webhook.id, 'secret', e.target.value)}
                      className="w-full"
                      placeholder="webhook-secret-key"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`webhook-retry-${webhook.id}`}>Retry Count</Label>
                    <Input
                      id={`webhook-retry-${webhook.id}`}
                      type="number"
                      min="0"
                      max="10"
                      value={webhook.retryCount}
                      onChange={(e) => handleWebhookChange(webhook.id, 'retryCount', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`webhook-events-${webhook.id}`}>Events</Label>
                  <Textarea
                    id={`webhook-events-${webhook.id}`}
                    value={webhook.events.join(', ')}
                    onChange={(e) => handleWebhookChange(webhook.id, 'events', e.target.value.split(',').map(event => event.trim()))}
                    className="w-full"
                    rows={2}
                    placeholder="business.created, user.updated, payment.completed"
                  />
                  <p className="text-xs text-gray-500">
                    Comma-separated list of events to listen for
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Enabled</Label>
                    <p className="text-xs text-gray-500">
                      Enable this webhook endpoint
                    </p>
                  </div>
                  <Switch
                    checked={webhook.enabled}
                    onCheckedChange={(checked) => handleWebhookChange(webhook.id, 'enabled', checked)}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* External Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Globe className="h-5 w-5 text-indigo-600" />
            <span>External Integrations</span>
          </CardTitle>
          <CardDescription>
            Configure third-party service integrations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Payment Gateway */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Payment Gateway</h4>
              <Switch
                checked={settings.integrations?.paymentGateway?.enabled ?? false}
                onCheckedChange={(checked) => handleSettingChange('integrations.paymentGateway.enabled', checked)}
              />
            </div>

            {settings.integrations?.paymentGateway?.enabled && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentProvider">Provider</Label>
                  <Select
                    value={settings.integrations?.paymentGateway?.provider ?? 'stripe'}
                    onValueChange={(value) => handleSettingChange('integrations.paymentGateway.provider', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stripe">Stripe</SelectItem>
                      <SelectItem value="razorpay">Razorpay</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="square">Square</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {settings.integrations?.paymentGateway?.provider === "stripe" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="stripePublishableKey">Stripe Publishable Key</Label>
                      <Input
                        id="stripePublishableKey"
                        value={settings.integrations?.paymentGateway?.stripePublishableKey ?? ''}
                        onChange={(e) => handleSettingChange('integrations.paymentGateway.stripePublishableKey', e.target.value)}
                        className="w-full"
                        placeholder="pk_test_..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="stripeSecretKey">Stripe Secret Key</Label>
                      <Input
                        id="stripeSecretKey"
                        type="password"
                        value={settings.integrations?.paymentGateway?.stripeSecretKey ?? ''}
                        onChange={(e) => handleSettingChange('integrations.paymentGateway.stripeSecretKey', e.target.value)}
                        className="w-full"
                        placeholder="sk_test_..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="stripeWebhookSecret">Stripe Webhook Secret</Label>
                      <Input
                        id="stripeWebhookSecret"
                        type="password"
                        value={settings.integrations?.paymentGateway?.stripeWebhookSecret ?? ''}
                        onChange={(e) => handleSettingChange('integrations.paymentGateway.stripeWebhookSecret', e.target.value)}
                        className="w-full"
                        placeholder="whsec_..."
                      />
                    </div>
                  </div>
                )}

                {settings.integrations?.paymentGateway?.provider === "razorpay" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="razorpayKeyId">Razorpay Key ID</Label>
                      <Input
                        id="razorpayKeyId"
                        value={settings.integrations?.paymentGateway?.razorpayKeyId ?? ''}
                        onChange={(e) => handleSettingChange('integrations.paymentGateway.razorpayKeyId', e.target.value)}
                        className="w-full"
                        placeholder="rzp_test_..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="razorpayKeySecret">Razorpay Key Secret</Label>
                      <Input
                        id="razorpayKeySecret"
                        type="password"
                        value={settings.integrations?.paymentGateway?.razorpayKeySecret ?? ''}
                        onChange={(e) => handleSettingChange('integrations.paymentGateway.razorpayKeySecret', e.target.value)}
                        className="w-full"
                        placeholder="Your key secret"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="razorpayWebhookSecret">Razorpay Webhook Secret</Label>
                      <Input
                        id="razorpayWebhookSecret"
                        type="password"
                        value={settings.integrations?.paymentGateway?.razorpayWebhookSecret ?? ''}
                        onChange={(e) => handleSettingChange('integrations.paymentGateway.razorpayWebhookSecret', e.target.value)}
                        className="w-full"
                        placeholder="Your webhook secret"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Email Service */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Email Service</h4>
              <Switch
                checked={settings.integrations?.emailService?.enabled ?? true}
                onCheckedChange={(checked) => handleSettingChange('integrations.emailService.enabled', checked)}
              />
            </div>

            {settings.integrations?.emailService?.enabled && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="emailProvider">Provider</Label>
                  <Select
                    value={settings.integrations?.emailService?.provider ?? 'smtp'}
                    onValueChange={(value) => handleSettingChange('integrations.emailService.provider', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smtp">SMTP</SelectItem>
                      <SelectItem value="sendgrid">SendGrid</SelectItem>
                      <SelectItem value="ses">AWS SES</SelectItem>
                      <SelectItem value="mailgun">Mailgun</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {settings.integrations?.emailService?.provider === "sendgrid" && (
                  <div className="space-y-2">
                    <Label htmlFor="sendgridApiKey">SendGrid API Key</Label>
                    <Input
                      id="sendgridApiKey"
                      type="password"
                      value={settings.integrations?.emailService?.sendgridApiKey ?? ''}
                      onChange={(e) => handleSettingChange('integrations.emailService.sendgridApiKey', e.target.value)}
                      className="w-full"
                      placeholder="SG.xxx..."
                    />
                  </div>
                )}

                {settings.integrations?.emailService?.provider === "ses" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sesAccessKey">AWS Access Key ID</Label>
                      <Input
                        id="sesAccessKey"
                        value={settings.integrations?.emailService?.awsSesAccessKey ?? ''}
                        onChange={(e) => handleSettingChange('integrations.emailService.awsSesAccessKey', e.target.value)}
                        className="w-full"
                        placeholder="AKIAIOSFODNN7EXAMPLE"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sesSecretKey">AWS Secret Access Key</Label>
                      <Input
                        id="sesSecretKey"
                        type="password"
                        value={settings.integrations?.emailService?.awsSesSecretKey ?? ''}
                        onChange={(e) => handleSettingChange('integrations.emailService.awsSesSecretKey', e.target.value)}
                        className="w-full"
                        placeholder="Your secret key"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sesRegion">AWS Region</Label>
                      <Input
                        id="sesRegion"
                        value={settings.integrations?.emailService?.awsSesRegion ?? 'us-east-1'}
                        onChange={(e) => handleSettingChange('integrations.emailService.awsSesRegion', e.target.value)}
                        className="w-full"
                        placeholder="us-east-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-red-600" />
            <span>Security</span>
          </CardTitle>
          <CardDescription>
            Configure security headers and protection mechanisms
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable HTTPS</Label>
                <p className="text-xs text-gray-500">
                  Force HTTPS connections
                </p>
              </div>
              <Switch
                checked={settings.security?.enableHTTPS ?? true}
                onCheckedChange={(checked) => handleSettingChange('security.enableHTTPS', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable HSTS</Label>
                <p className="text-xs text-gray-500">
                  HTTP Strict Transport Security
                </p>
              </div>
              <Switch
                checked={settings.security?.enableHSTS ?? true}
                onCheckedChange={(checked) => handleSettingChange('security.enableHSTS', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable CSRF Protection</Label>
                <p className="text-xs text-gray-500">
                  Cross-Site Request Forgery protection
                </p>
              </div>
              <Switch
                checked={settings.security?.enableCSRF ?? true}
                onCheckedChange={(checked) => handleSettingChange('security.enableCSRF', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable XSS Protection</Label>
                <p className="text-xs text-gray-500">
                  Cross-Site Scripting protection
                </p>
              </div>
              <Switch
                checked={settings.security?.enableXSSProtection ?? true}
                onCheckedChange={(checked) => handleSettingChange('security.enableXSSProtection', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable Content Security Policy</Label>
                <p className="text-xs text-gray-500">
                  Content Security Policy headers
                </p>
              </div>
              <Switch
                checked={settings.security?.enableContentSecurityPolicy ?? true}
                onCheckedChange={(checked) => handleSettingChange('security.enableContentSecurityPolicy', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable Request Validation</Label>
                <p className="text-xs text-gray-500">
                  Validate incoming requests
                </p>
              </div>
              <Switch
                checked={settings.security?.enableRequestValidation ?? true}
                onCheckedChange={(checked) => handleSettingChange('security.enableRequestValidation', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Enable Response Validation</Label>
                <p className="text-xs text-gray-500">
                  Validate outgoing responses
                </p>
              </div>
              <Switch
                checked={settings.security?.enableResponseValidation ?? true}
                onCheckedChange={(checked) => handleSettingChange('security.enableResponseValidation', checked)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxRequestSize">Max Request Size</Label>
              <Input
                id="maxRequestSize"
                value={settings.security?.maxRequestSize ?? '10mb'}
                onChange={(e) => handleSettingChange('security.maxRequestSize', e.target.value)}
                className="w-full"
                placeholder="10mb"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="allowedMethods">Allowed Methods</Label>
              <Input
                id="allowedMethods"
                value={(settings.security?.allowedMethods ?? []).join(', ')}
                onChange={(e) => handleSettingChange('security.allowedMethods', e.target.value.split(',').map(method => method.trim()))}
                className="w-full"
                placeholder="GET, POST, PUT, PATCH, DELETE"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allowedHeaders">Allowed Headers</Label>
            <Textarea
              id="allowedHeaders"
              value={(settings.security?.allowedHeaders ?? []).join('\n')}
              onChange={(e) => handleSettingChange('security.allowedHeaders', e.target.value.split('\n').filter(header => header.trim()))}
              className="w-full"
              rows={3}
              placeholder="Content-Type&#10;Authorization&#10;X-Requested-With"
            />
            <p className="text-xs text-gray-500">
              One header per line
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
