"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  CheckCircle2,
  AlertTriangle,
  Save,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
  Globe,
  Trash2,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

interface PublicConfig {
  appId: string | null
  configId: string | null
  graphVersion: string | null
  webhookCallbackUrl: string | null
  appSecretSet: boolean
  verifyTokenSet: boolean
  source: "db" | "env" | "mixed"
  updatedAt: string | null
}

export function WhatsAppMetaConfigSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [config, setConfig] = useState<PublicConfig | null>(null)

  // Form state — secrets are write-only (we never receive plaintext from the API).
  const [form, setForm] = useState({
    appId: "",
    configId: "",
    webhookCallbackUrl: "",
    appSecret: "",
    verifyToken: "",
  })
  const [showSecret, setShowSecret] = useState(false)
  const [showVerify, setShowVerify] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/admin/whatsapp-meta-config`, {
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Load failed")
      const data: PublicConfig = json.data
      setConfig(data)
      setForm((f) => ({
        ...f,
        appId: data.appId || "",
        configId: data.configId || "",
        webhookCallbackUrl: data.webhookCallbackUrl || "",
        // secrets stay blank — empty string means "don't change"
        appSecret: "",
        verifyToken: "",
      }))
    } catch (err: any) {
      toast({
        title: "Failed to load Meta config",
        description: err?.message || "",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const onSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        appId: form.appId.trim() || null,
        configId: form.configId.trim() || null,
        webhookCallbackUrl: form.webhookCallbackUrl.trim() || null,
      }
      // Empty secret strings mean "leave unchanged". Sending null would clear.
      if (form.appSecret.trim()) body.appSecret = form.appSecret.trim()
      if (form.verifyToken.trim()) body.verifyToken = form.verifyToken.trim()

      const res = await fetch(`${API_URL}/admin/whatsapp-meta-config`, {
        method: "PUT",
        credentials: "include",
        headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Save failed")
      setConfig(json.data)
      setForm((f) => ({ ...f, appSecret: "", verifyToken: "" }))
      toast({
        title: "Meta configuration saved",
        description: "Secrets are encrypted at rest with AES-256-GCM.",
      })
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.message || "",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const onClearSecret = async (field: "appSecret" | "verifyToken") => {
    if (!confirm(`Clear stored ${field}? You will need to paste it again.`)) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/admin/whatsapp-meta-config`, {
        method: "PUT",
        credentials: "include",
        headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: null }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Clear failed")
      setConfig(json.data)
      toast({ title: `${field} cleared` })
    } catch (err: any) {
      toast({
        title: "Clear failed",
        description: err?.message || "",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const onVerify = async () => {
    setVerifying(true)
    try {
      const res = await fetch(`${API_URL}/admin/whatsapp-meta-config/verify`, {
        method: "POST",
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Verification failed")
      const app = json.data?.app
      toast({
        title: "Verified with Meta",
        description: app
          ? `Connected to "${app.name || app.id}" (id ${app.id})`
          : "App credentials valid.",
      })
    } catch (err: any) {
      toast({
        title: "Meta rejected the credentials",
        description: err?.message || "",
        variant: "destructive",
      })
    } finally {
      setVerifying(false)
    }
  }

  const ready =
    Boolean(config?.appId) &&
    Boolean(config?.appSecretSet) &&
    Boolean(config?.verifyTokenSet)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-600" />
              WhatsApp / Meta Cloud API
            </CardTitle>
            <CardDescription>
              Platform credentials for the WhatsApp Business module. Secrets are encrypted
              with AES-256-GCM before being written to the database. The encryption key
              itself stays in the server&apos;s <code>WHATSAPP_TOKEN_ENC_KEY</code> env var.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {ready ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Ready</Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200">Incomplete</Badge>
            )}
            {config?.source && (
              <Badge variant="secondary" className="capitalize">
                source: {config.source}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <Alert>
              <Globe className="h-4 w-4" />
              <AlertTitle>Where these come from</AlertTitle>
              <AlertDescription className="text-sm space-y-1">
                <div>
                  <strong>App ID</strong> &amp; <strong>App Secret</strong>: Meta App
                  Dashboard → App Settings → Basic.
                </div>
                <div>
                  <strong>Embedded Signup Config ID</strong>: Meta App Dashboard →
                  WhatsApp → Embedded Signup Builder → Create configuration.
                </div>
                <div>
                  <strong>Webhook verify token</strong>: any random string you make up.
                  Paste the same value in the Meta App Dashboard → WhatsApp →
                  Configuration → Webhooks → Verify token.
                </div>
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="appId">App ID</Label>
                <Input
                  id="appId"
                  inputMode="numeric"
                  placeholder="1234567890123456"
                  value={form.appId}
                  onChange={(e) => setForm({ ...form, appId: e.target.value.replace(/\D/g, "") })}
                />
                <p className="text-xs text-slate-500">Numeric, 15–16 digits. Public.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="configId">Embedded Signup Config ID (optional)</Label>
                <Input
                  id="configId"
                  inputMode="numeric"
                  placeholder="987654321098765"
                  value={form.configId}
                  onChange={(e) => setForm({ ...form, configId: e.target.value.replace(/\D/g, "") })}
                />
                <p className="text-xs text-slate-500">
                  Only needed for the Embedded Signup popup. Leave blank to use the manual
                  &quot;paste access token&quot; flow.
                </p>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="appSecret">App Secret</Label>
                <div className="flex gap-2">
                  <Input
                    id="appSecret"
                    type={showSecret ? "text" : "password"}
                    placeholder={
                      config?.appSecretSet
                        ? "•••••••••••••••• (saved — leave blank to keep)"
                        : "Paste your Meta App Secret"
                    }
                    value={form.appSecret}
                    onChange={(e) => setForm({ ...form, appSecret: e.target.value })}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSecret((v) => !v)}
                    title={showSecret ? "Hide" : "Show"}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {config?.appSecretSet && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => onClearSecret("appSecret")}
                      title="Clear stored App Secret"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {config?.appSecretSet ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Currently saved (encrypted).
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> Not yet saved.
                    </span>
                  )}{" "}
                  Required to verify webhook signatures and exchange Embedded Signup
                  codes for long-lived tokens.
                </p>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="verifyToken">Webhook verify token</Label>
                <div className="flex gap-2">
                  <Input
                    id="verifyToken"
                    type={showVerify ? "text" : "password"}
                    placeholder={
                      config?.verifyTokenSet
                        ? "•••••••••••••••• (saved — leave blank to keep)"
                        : "e.g. easemysalon-webhook-verify-2026"
                    }
                    value={form.verifyToken}
                    onChange={(e) => setForm({ ...form, verifyToken: e.target.value })}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowVerify((v) => !v)}
                    title={showVerify ? "Hide" : "Show"}
                  >
                    {showVerify ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {config?.verifyTokenSet && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => onClearSecret("verifyToken")}
                      title="Clear stored verify token"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Pick any random string. Paste the same value into Meta&apos;s Webhook →
                  Verify token field.
                </p>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="webhookCallbackUrl">Webhook callback URL (informational)</Label>
                <Input
                  id="webhookCallbackUrl"
                  placeholder="https://yourdomain.com/api/webhooks/whatsapp/meta"
                  value={form.webhookCallbackUrl}
                  onChange={(e) =>
                    setForm({ ...form, webhookCallbackUrl: e.target.value })
                  }
                />
                <p className="text-xs text-slate-500">
                  Display-only — paste the same URL into Meta&apos;s Webhooks →{" "}
                  <em>Callback URL</em> field.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={onSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save configuration
              </Button>
              <Button onClick={onVerify} disabled={!ready || verifying} variant="outline">
                {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Verify with Meta
              </Button>
              {config?.updatedAt && (
                <span className="text-xs text-slate-500 ml-auto">
                  Last updated {new Date(config.updatedAt).toLocaleString()}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
