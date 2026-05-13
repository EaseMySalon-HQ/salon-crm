"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
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
  Mail,
  Plus,
  Trash2,
  Key,
  LinkIcon,
  Info,
  Sparkles,
  Server,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * Stored shape is Mongoose doc `api`: { version, baseUrl, integrations, … }.
 * Legacy UI mistakenly nested primitives under `.api`; hoist for binding.
 */
function normalizeMongoApiCategory(raw: Record<string, unknown> | null | undefined): Record<string, any> {
  if (!raw || typeof raw !== "object") return {}
  const nested = raw.api
  if (nested && typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
    const { api: _omit, ...rest } = raw as Record<string, unknown>
    return { ...(nested as Record<string, any>), ...rest }
  }
  return { ...(raw as Record<string, any>) }
}

function defaultPaymentGatewayShape() {
  return {
    enabled: false,
    provider: "stripe",
    stripePublishableKey: "",
    stripeSecretKey: "",
    stripeWebhookSecret: "",
    razorpayKeyId: "",
    razorpayKeySecret: "",
    razorpayWebhookSecret: "",
    zohoClientId: "",
    zohoClientSecret: "",
    zohoRefreshToken: "",
    zohoOrganizationId: "",
    zohoReturnUrl: "",
  }
}

function defaultOpenAiFeedbackShape() {
  return {
    enabled: false,
    provider: "openai",
    apiKey: "",
    model: "gpt-4o-mini",
    timeoutMs: 18000,
  }
}

/** Full state for Settings → API & Integration save payload (`api` category). */
function buildApiCategoryState(
  incoming: Record<string, unknown> | undefined,
  prev: Record<string, any>
): Record<string, any> {
  const next = normalizeMongoApiCategory(incoming)
  const mergedRoot = { ...prev, ...next }

  mergedRoot.version = mergedRoot.version ?? "v1"
  mergedRoot.baseUrl = mergedRoot.baseUrl ?? "https://api.ease-my-salon.com"
  mergedRoot.timeout =
    mergedRoot.timeout !== undefined ? Number(mergedRoot.timeout) || 30000 : 30000
  mergedRoot.maxRequestsPerMinute =
    mergedRoot.maxRequestsPerMinute !== undefined
      ? Number(mergedRoot.maxRequestsPerMinute) || 100
      : 100
  mergedRoot.enableCORS = mergedRoot.enableCORS !== false
  mergedRoot.allowedOrigins = Array.isArray(mergedRoot.allowedOrigins) ? mergedRoot.allowedOrigins : []
  mergedRoot.enableRateLimiting = mergedRoot.enableRateLimiting !== false
  mergedRoot.enableLogging = mergedRoot.enableLogging !== false
  mergedRoot.enableMetrics = mergedRoot.enableMetrics !== false

  const defaultAuth = {
    jwtExpiration: "24h",
    refreshTokenExpiration: "7d",
    enableRefreshTokens: true,
    enableApiKeys: true,
    apiKeyLength: 32,
    enableOAuth: false,
    oauthProviders: [],
  }
  mergedRoot.authentication =
    typeof mergedRoot.authentication === "object" && mergedRoot.authentication != null
      ? { ...defaultAuth, ...(prev.authentication || {}), ...mergedRoot.authentication }
      : { ...defaultAuth, ...(prev.authentication || {}) }

  mergedRoot.rateLimiting =
    typeof mergedRoot.rateLimiting === "object" && mergedRoot.rateLimiting != null
      ? { ...prev.rateLimiting, ...mergedRoot.rateLimiting }
      : prev.rateLimiting || {
          enabled: true,
          windowMs: 60000,
          maxRequests: 100,
          skipSuccessfulRequests: false,
          skipFailedRequests: false,
          keyGenerator: "ip",
          customKeyGenerator: "",
          message: "Too many requests, please try again later.",
          statusCode: 429,
        }

  mergedRoot.webhooks = Array.isArray(mergedRoot.webhooks) ? mergedRoot.webhooks : prev.webhooks || []

  const pi = mergedRoot.integrations?.paymentGateway
  const poi = mergedRoot.integrations?.openAiFeedback
  mergedRoot.integrations = {
    ...(mergedRoot.integrations || {}),
    paymentGateway: { ...defaultPaymentGatewayShape(), ...(prev.integrations?.paymentGateway || {}), ...pi },
    openAiFeedback: {
      ...defaultOpenAiFeedbackShape(),
      ...(prev.integrations?.openAiFeedback || {}),
      ...poi,
      timeoutMs:
        poi?.timeoutMs != null
          ? Math.min(Math.max(Number(poi.timeoutMs) || 18000, 5000), 55000)
          : prev.integrations?.openAiFeedback?.timeoutMs ??
            defaultOpenAiFeedbackShape().timeoutMs,
    },
  }

  const defaultSecurity = {
    enableHTTPS: true,
    enableHSTS: true,
    enableCSRF: true,
    enableXSSProtection: true,
    enableContentSecurityPolicy: true,
    allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxRequestSize: "10mb",
    enableRequestValidation: true,
    enableResponseValidation: true,
  }
  mergedRoot.security =
    typeof mergedRoot.security === "object" && mergedRoot.security != null
      ? { ...defaultSecurity, ...(prev.security || {}), ...mergedRoot.security }
      : { ...defaultSecurity, ...(prev.security || {}) }

  return mergedRoot
}

/** Admin UI row for Saved `api.webhooks[]` documents. */
interface WebhookEndpoint {
  id: number
  name: string
  url: string
  events: string[]
  secret: string
  enabled: boolean
  retryCount: number
  timeout: number
}

interface APISettingsProps {
  settings?: any
  onSettingsChange: (settings: any) => void
  /** From GET /api/admin/settings/meta/security — never a secret value */
  jwtSecretConfigured?: boolean | null
}

export function APISettings({ settings: propSettings, onSettingsChange, jwtSecretConfigured }: APISettingsProps) {
  const [settings, setSettings] = useState<Record<string, any>>(() => buildApiCategoryState(undefined, {}))

  useEffect(() => {
    setSettings((prev) => buildApiCategoryState(propSettings as Record<string, unknown> | undefined, prev))
  }, [propSettings])

  const handleSettingChange = (path: string, value: any) => {
    const newSettings: any = { ...settings }
    const keys = path.split('.')
    let current: any = newSettings
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (current[k] == null || typeof current[k] !== 'object') current[k] = { ...(current[k] || {}) }
      else current[k] = { ...current[k] }
      current = current[k]
    }
    current[keys[keys.length - 1]] = value
    setSettings(newSettings)
    onSettingsChange(newSettings)
  }

  const handleWebhookChange = (id: number, field: string, value: any) => {
    const newSettings = {
      ...settings,
      webhooks: (settings.webhooks ?? []).map((webhook: WebhookEndpoint) =>
        webhook.id === id ? { ...webhook, [field]: value } : webhook
      ),
    }
    setSettings(newSettings)
    onSettingsChange(newSettings)
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
      timeout: 5000,
    }
    const newSettings = {
      ...settings,
      webhooks: [...(settings.webhooks ?? []), newWebhook],
    }
    setSettings(newSettings)
    onSettingsChange(newSettings)
  }

  const handleDeleteWebhook = (id: number) => {
    const newSettings = {
      ...settings,
      webhooks: (settings.webhooks ?? []).filter((webhook: WebhookEndpoint) => webhook.id !== id),
    }
    setSettings(newSettings)
    onSettingsChange(newSettings)
  }

  const handleTestWebhook = (webhook: WebhookEndpoint) => {
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
                value={settings?.version ?? 'v1'}
                onChange={(e) => handleSettingChange('version', e.target.value)}
                className="w-full"
                placeholder="v1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                value={settings?.baseUrl ?? ''}
                onChange={(e) => handleSettingChange('baseUrl', e.target.value)}
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
                value={settings?.timeout ?? 30000}
                onChange={(e) => handleSettingChange('timeout', parseInt(e.target.value))}
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
                value={settings?.maxRequestsPerMinute ?? 100}
                onChange={(e) => handleSettingChange('maxRequestsPerMinute', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allowedOrigins">Allowed Origins</Label>
            <Textarea
              id="allowedOrigins"
              value={(settings?.allowedOrigins ?? []).join('\n')}
              onChange={(e) =>
                handleSettingChange(
                  'allowedOrigins',
                  e.target.value.split('\n').filter((origin) => origin.trim())
                )
              }
              className="w-full"
              rows={3}
              placeholder="https://easemysalon.com&#10;https://admin.easemysalon.com"
            />
            <p className="text-xs text-gray-500">
              One origin per line (reference for admins). Production CORS is usually driven by the API server{" "}
              <code className="rounded bg-slate-100 px-1">CORS_ORIGINS</code> environment variable — align those hosts with app and admin URLs.
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
                checked={settings?.enableCORS ?? true}
                onCheckedChange={(checked) => handleSettingChange('enableCORS', checked)}
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
                checked={settings?.enableRateLimiting ?? true}
                onCheckedChange={(checked) => handleSettingChange('enableRateLimiting', checked)}
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
                checked={settings?.enableLogging ?? true}
                onCheckedChange={(checked) => handleSettingChange('enableLogging', checked)}
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
                checked={settings?.enableMetrics ?? true}
                onCheckedChange={(checked) => handleSettingChange('enableMetrics', checked)}
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
          <Alert className="border-blue-200 bg-blue-50/50">
            <Info className="h-4 w-4 text-blue-700" />
            <AlertTitle className="text-blue-900">JWT signing secret</AlertTitle>
            <AlertDescription className="text-blue-900/90 text-sm space-y-1">
              <p>
                Access tokens are signed on the API server using the <code className="rounded bg-blue-100/80 px-1 py-0.5 text-xs">JWT_SECRET</code> environment variable.
                It is never sent to the browser or stored in these settings.
              </p>
              <p className="font-medium">
                {jwtSecretConfigured === null
                  ? 'Checking server configuration…'
                  : jwtSecretConfigured
                    ? 'Server reports JWT_SECRET is configured.'
                    : 'Server reports JWT_SECRET is not set — set it in your API environment before production.'}
              </p>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <LinkIcon className="h-5 w-5 text-orange-600" />
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
            {(settings.webhooks ?? []).map((webhook: WebhookEndpoint) => (
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
                      placeholder="https://your-server.example/webhooks/salon"
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
                      placeholder="Enter a strong signing secret"
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
            Payments, receipt AI drafts, and where to configure messaging integrations
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
                      <SelectItem value="zoho">Zoho Pay</SelectItem>
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

                {settings.integrations?.paymentGateway?.provider === "zoho" && (
                  <div className="space-y-4">
                    <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
                      Zoho Pay uses OAuth 2.0. Create a Self Client at
                      {' '}<a className="underline" href="https://api-console.zoho.in/" target="_blank" rel="noreferrer">api-console.zoho.in</a>{' '}
                      with scope <code>ZohoPay.payments.ALL</code>, then generate a refresh token.
                      Grab your Organization ID from the Zoho Payments dashboard.
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="zohoClientId">Zoho Client ID</Label>
                        <Input
                          id="zohoClientId"
                          value={settings.integrations?.paymentGateway?.zohoClientId ?? ''}
                          onChange={(e) => handleSettingChange('integrations.paymentGateway.zohoClientId', e.target.value)}
                          className="w-full"
                          placeholder="1000.XXXXXXXXXXXXXXXX"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="zohoClientSecret">Zoho Client Secret</Label>
                        <Input
                          id="zohoClientSecret"
                          type="password"
                          value={settings.integrations?.paymentGateway?.zohoClientSecret ?? ''}
                          onChange={(e) => handleSettingChange('integrations.paymentGateway.zohoClientSecret', e.target.value)}
                          className="w-full"
                          placeholder="Client secret from Zoho API Console"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="zohoRefreshToken">Zoho Refresh Token</Label>
                        <Input
                          id="zohoRefreshToken"
                          type="password"
                          value={settings.integrations?.paymentGateway?.zohoRefreshToken ?? ''}
                          onChange={(e) => handleSettingChange('integrations.paymentGateway.zohoRefreshToken', e.target.value)}
                          className="w-full"
                          placeholder="1000.xxxxx.yyyyy"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="zohoOrganizationId">Zoho Organization ID</Label>
                        <Input
                          id="zohoOrganizationId"
                          value={settings.integrations?.paymentGateway?.zohoOrganizationId ?? ''}
                          onChange={(e) => handleSettingChange('integrations.paymentGateway.zohoOrganizationId', e.target.value)}
                          className="w-full"
                          placeholder="60000000"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="zohoReturnUrl">Return URL (redirect after payment)</Label>
                        <Input
                          id="zohoReturnUrl"
                          value={settings.integrations?.paymentGateway?.zohoReturnUrl ?? ''}
                          onChange={(e) => handleSettingChange('integrations.paymentGateway.zohoReturnUrl', e.target.value)}
                          className="w-full"
                          placeholder="https://yourdomain.com/settings?section=recharge&zoho_redirect=1"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {(settings.integrations?.paymentGateway?.provider === "paypal" ||
                  settings.integrations?.paymentGateway?.provider === "square") && (
                  <p className="text-sm text-amber-800 rounded-md bg-amber-50 border border-amber-100 px-3 py-2">
                    PayPal and Square are not wired in the backend yet. Use Stripe, Razorpay, or Zoho Pay for wallet and plan checkout.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
              <h4 className="font-medium">Public receipt feedback (AI)</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              With <strong>Use admin credentials</strong> on, the API uses this provider/key; otherwise env fallbacks apply (
              <code className="rounded bg-slate-100 px-1">OPENAI_API_KEY</code>, or{" "}
              <code className="rounded bg-slate-100 px-1">PUBLIC_FEEDBACK_AI_PROVIDER</code>=<code className="rounded bg-slate-100 px-1">anthropic</code>
              {" + "}
              <code className="rounded bg-slate-100 px-1">ANTHROPIC_API_KEY</code>
              ).
            </p>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="openAiEnabled">Use admin credentials (skip env fallback)</Label>
              <Switch
                id="openAiEnabled"
                checked={settings.integrations?.openAiFeedback?.enabled ?? false}
                onCheckedChange={(checked) =>
                  handleSettingChange("integrations.openAiFeedback.enabled", checked)
                }
              />
            </div>
            {(settings.integrations?.openAiFeedback?.enabled ?? false) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="feedbackAiProvider">AI provider</Label>
                  <Select
                    value={settings.integrations?.openAiFeedback?.provider ?? "openai"}
                    onValueChange={(v) =>
                      handleSettingChange("integrations.openAiFeedback.provider", v)
                    }
                  >
                    <SelectTrigger id="feedbackAiProvider">
                      <SelectValue placeholder="Choose provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Add Gemini or other backends in the API layer only—never ship provider keys to the browser.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="openAiKey">
                    API key ({(settings.integrations?.openAiFeedback?.provider ?? "openai") === "anthropic" ? "Anthropic" : "OpenAI"})
                  </Label>
                  <Input
                    id="openAiKey"
                    type="password"
                    autoComplete="off"
                    value={settings.integrations?.openAiFeedback?.apiKey ?? ""}
                    onChange={(e) =>
                      handleSettingChange("integrations.openAiFeedback.apiKey", e.target.value)
                    }
                    placeholder={
                      (settings.integrations?.openAiFeedback?.provider ?? "openai") === "anthropic"
                        ? "sk-ant-api03-…"
                        : "sk-…"
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="openAiModel">Model ID</Label>
                  <Input
                    id="openAiModel"
                    value={
                      settings.integrations?.openAiFeedback?.model ??
                      ((settings.integrations?.openAiFeedback?.provider ?? "openai") === "anthropic"
                        ? "claude-3-5-haiku-20241022"
                        : "gpt-4o-mini")
                    }
                    onChange={(e) =>
                      handleSettingChange("integrations.openAiFeedback.model", e.target.value)
                    }
                    placeholder={
                      (settings.integrations?.openAiFeedback?.provider ?? "openai") === "anthropic"
                        ? "e.g. claude-3-5-haiku-20241022"
                        : "e.g. gpt-4o-mini"
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openAiTimeout">Timeout (ms)</Label>
                  <Input
                    id="openAiTimeout"
                    type="number"
                    min={5000}
                    max={55000}
                    value={settings.integrations?.openAiFeedback?.timeoutMs ?? 18000}
                    onChange={(e) =>
                      handleSettingChange(
                        "integrations.openAiFeedback.timeoutMs",
                        parseInt(e.target.value, 10)
                      )
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 p-4 border rounded-lg bg-slate-50/60">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-600 shrink-0" />
              <h4 className="font-medium">Email, SMS &amp; WhatsApp</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              The live email stack (SMTP, Resend, SendGrid, SES, Mailgun), SMS, and WhatsApp credentials are edited under{" "}
              <strong>Settings → Notifications &amp; Alerts</strong>.
            </p>
            <Button variant="outline" size="sm" asChild className="w-fit">
              <Link href="/admin/settings?tab=notifications">Open Notifications settings</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="h-5 w-5 text-slate-600" />
            <span>Database &amp; server secrets</span>
          </CardTitle>
          <CardDescription>
            Set these as environment variables on the API host (Railway, VM, Docker). Values are never stored in MongoDB via this UI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <code className="rounded bg-slate-100 px-1">MONGODB_URI</code> — MongoDB Atlas or self-hosted URI for the platform database
            </li>
            <li>
              <code className="rounded bg-slate-100 px-1">JWT_SECRET</code> — tenant access-token signing ({jwtSecretConfigured === null ? 'status unknown' : jwtSecretConfigured ? 'server reports configured' : 'server reports missing'})
            </li>
            <li>
              <code className="rounded bg-slate-100 px-1">REDIS_URL</code> or <code className="rounded bg-slate-100 px-1">RATE_LIMIT_REDIS_URL</code> — shared rate limiting across instances
            </li>
            <li>
              <code className="rounded bg-slate-100 px-1">CORS_ORIGINS</code> — comma-separated allowed browser origins for the API
            </li>
            <li>
              <code className="rounded bg-slate-100 px-1">CSRF_ENABLED</code>, cookie / SameSite overrides — cross-origin SPA auth (
              <code className="rounded bg-slate-100 px-1">COOKIE_SECURE</code>,{" "}
              <code className="rounded bg-slate-100 px-1">COOKIE_SAME_SITE</code>)
            </li>
          </ul>
          <Alert className="border-amber-200 bg-amber-50/70">
            <Info className="h-4 w-4 text-amber-900" />
            <AlertTitle className="text-amber-950">Operational note</AlertTitle>
            <AlertDescription className="text-amber-950/90 text-sm">
              After changing Redis, Mongo URI, JWT, or CORS, redeploy or restart the API process so loaders pick them up.
            </AlertDescription>
          </Alert>
          <p className="text-xs text-muted-foreground">
            Receipt AI fallback when no admin key:{" "}
            <code className="rounded bg-slate-100 px-1">OPENAI_API_KEY</code>, or{" "}
            <code className="rounded bg-slate-100 px-1">PUBLIC_FEEDBACK_AI_PROVIDER</code>=<code className="rounded bg-slate-100 px-1">anthropic</code>
            {" "}with <code className="rounded bg-slate-100 px-1">ANTHROPIC_API_KEY</code> (optional{" "}
            <code className="rounded bg-slate-100 px-1">ANTHROPIC_FEEDBACK_MODEL</code>).
          </p>
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
