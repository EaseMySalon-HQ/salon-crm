"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle2, AlertTriangle, Loader2, Link2, MessageCircle, Save, ChevronDown } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

interface GupshupConfig {
  activeProvider: string
  partnerConfigured: boolean
  partnerSource?: "env" | "admin" | null
  gupshupPartnerEmail?: string
  hasPartnerSecret?: boolean
  platformAppId: string | null
  platformAppName: string | null
  platformSourceNumber: string | null
  platformSource?: "env" | "admin" | null
  gupshupAppId?: string
  gupshupAppName?: string
  gupshupSourceNumber?: string
  webhookUrl: string | null
  webhookSource?: "env" | "admin" | "computed"
  gupshupWebhookUrl?: string
}

type SubscriptionStatus = {
  configured?: boolean
  webhookUrl?: string | null
  registered?: boolean
  checkError?: string
  activeSubscription?: { url?: string; tag?: string }
  subscriptions?: Array<{ url?: string; active?: boolean; tag?: string }>
}

/**
 * Admin-managed Gupshup Partner Portal onboarding.
 */
export function GupshupConfigSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<GupshupConfig | null>(null)
  const [linking, setLinking] = useState(false)
  const [savingWebhook, setSavingWebhook] = useState(false)
  const [registeringWebhook, setRegisteringWebhook] = useState(false)
  const [savingPlatform, setSavingPlatform] = useState(false)
  const [savingPartner, setSavingPartner] = useState(false)
  const [webhookOverride, setWebhookOverride] = useState("")
  const [partnerForm, setPartnerForm] = useState({ email: "", clientSecret: "" })
  const [platformForm, setPlatformForm] = useState({ appId: "", appName: "", sourceNumber: "" })
  const [form, setForm] = useState({ businessId: "", appId: "", appName: "", sourceNumber: "" })
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
  const [registerCooldownSec, setRegisterCooldownSec] = useState(0)

  const loadSubscriptionStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/platform/subscription-status`, {
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (res.ok && json?.success) setSubscriptionStatus(json.data)
    } catch {
      // non-blocking
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/config`, {
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Load failed")
      setConfig(json.data)
      setWebhookOverride(json.data?.gupshupWebhookUrl || "")
      setPartnerForm({
        email: json.data?.gupshupPartnerEmail || "",
        clientSecret: "",
      })
      setPlatformForm({
        appId: json.data?.gupshupAppId || "",
        appName: json.data?.gupshupAppName || "",
        sourceNumber: json.data?.gupshupSourceNumber || "",
      })
      await loadSubscriptionStatus()
    } catch (err: any) {
      toast({ title: "Failed to load Gupshup config", description: err?.message || "", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (registerCooldownSec <= 0) return
    const timer = setInterval(() => {
      setRegisterCooldownSec((sec) => (sec <= 1 ? 0 : sec - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [registerCooldownSec])

  const registerMismatch =
    subscriptionStatus?.registered === false &&
    subscriptionStatus?.subscriptions?.some((s) => s.active !== false && s.url)
  const staleSubscriptionUrl = subscriptionStatus?.subscriptions?.find((s) => s.active !== false)?.url

  const onSavePartner = async () => {
    if (!partnerForm.email.trim()) {
      toast({ title: "Missing email", description: "Partner account email is required.", variant: "destructive" })
      return
    }
    if (!partnerForm.clientSecret.trim() && !config?.hasPartnerSecret && config?.partnerSource !== "env") {
      toast({ title: "Missing secret", description: "Client secret is required for first-time setup.", variant: "destructive" })
      return
    }
    setSavingPartner(true)
    try {
      const body: Record<string, string> = { gupshupPartnerEmail: partnerForm.email.trim() }
      if (partnerForm.clientSecret.trim()) {
        body.gupshupClientSecret = partnerForm.clientSecret.trim()
      }
      const res = await fetch(`${API_URL}/admin/gupshup/config`, {
        method: "PUT",
        credentials: "include",
        headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Save failed")
      setConfig((c) =>
        c
          ? {
              ...c,
              partnerConfigured: json.data.partnerConfigured,
              partnerSource: json.data.partnerSource,
              gupshupPartnerEmail: json.data.gupshupPartnerEmail,
              hasPartnerSecret: json.data.hasPartnerSecret,
            }
          : c
      )
      setPartnerForm((f) => ({ ...f, clientSecret: "" }))
      toast({
        title: "Partner credentials saved",
        description:
          json.data.partnerSource === "env"
            ? "Env vars take precedence over saved values when set."
            : "Gupshup Partner Portal login is configured.",
      })
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message || "", variant: "destructive" })
    } finally {
      setSavingPartner(false)
    }
  }

  const onSaveWebhook = async () => {
    setSavingWebhook(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/config`, {
        method: "PUT",
        credentials: "include",
        headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ gupshupWebhookUrl: webhookOverride.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Save failed")
      setConfig((c) =>
        c
          ? {
              ...c,
              webhookUrl: json.data.webhookUrl,
              webhookSource: json.data.webhookSource,
              gupshupWebhookUrl: json.data.gupshupWebhookUrl,
            }
          : c
      )
      toast({ title: "Webhook URL saved", description: "Used when registering Gupshup delivery subscriptions." })
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message || "", variant: "destructive" })
    } finally {
      setSavingWebhook(false)
    }
  }

  const onRegisterPlatformWebhook = async () => {
    if (registerCooldownSec > 0) {
      toast({
        title: "Please wait",
        description: `Gupshup allows 5 subscription calls per minute. Try again in ${registerCooldownSec}s.`,
        variant: "destructive",
      })
      return
    }
    setRegisteringWebhook(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/platform/register-webhook`, {
        method: "POST",
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        if (res.status === 429) setRegisterCooldownSec(60)
        const details =
          typeof json?.message === "string"
            ? json.message
            : typeof json?.details === "string"
              ? json.details
              : json?.details?.message ||
                json?.details?.error ||
                (json?.details ? JSON.stringify(json.details) : "")
        const webhookUrl = json?.webhookUrl || json?.data?.webhookUrl || config?.webhookUrl || ""
        throw new Error(
          [json?.error, details, webhookUrl ? `Webhook URL: ${webhookUrl}` : ""].filter(Boolean).join("\n") ||
            "Registration failed"
        )
      }
      await loadSubscriptionStatus()
      toast({
        title: json.data?.alreadyRegistered
          ? "Webhook already registered"
          : json.data?.updated
            ? "Webhook URL updated on Gupshup"
            : "Webhook registered on platform app",
        description: webhookUrlDescription(
          json.data?.webhookUrl || config?.webhookUrl || "your URL",
          json.data?.alreadyRegistered,
          json.data?.updated
        ),
      })
    } catch (err: any) {
      toast({
        title: "Webhook registration failed",
        description: err?.message || "",
        variant: "destructive",
      })
    } finally {
      setRegisteringWebhook(false)
    }
  }

  function webhookUrlDescription(url: string, alreadyRegistered?: boolean, updated?: boolean) {
    if (alreadyRegistered) {
      return `Gupshup already has this URL active:\n${url}\nReply from a contact's phone to open CSW in WhatsApp Chat.`
    }
    if (updated) {
      return `Gupshup subscription updated to:\n${url}\nReply from a contact's phone to open CSW in WhatsApp Chat.`
    }
    return `Gupshup will POST inbound messages to:\n${url}`
  }

  const onSavePlatform = async () => {
    if (!platformForm.appId.trim() || !platformForm.sourceNumber.trim()) {
      toast({
        title: "Missing fields",
        description: "Shared platform App ID and sender number are required.",
        variant: "destructive",
      })
      return
    }
    setSavingPlatform(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/config`, {
        method: "PUT",
        credentials: "include",
        headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          gupshupAppId: platformForm.appId.trim(),
          gupshupAppName: platformForm.appName.trim(),
          gupshupSourceNumber: platformForm.sourceNumber.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Save failed")
      setConfig((c) =>
        c
          ? {
              ...c,
              platformAppId: json.data.platformAppId,
              platformAppName: json.data.platformAppName,
              platformSourceNumber: json.data.platformSourceNumber,
              platformSource: json.data.platformSource,
              gupshupAppId: json.data.gupshupAppId,
              gupshupAppName: json.data.gupshupAppName,
              gupshupSourceNumber: json.data.gupshupSourceNumber,
            }
          : c
      )
      toast({
        title: "Shared platform app saved",
        description:
          json.data.platformSource === "env"
            ? "Env vars take precedence over these values when set."
            : "Salons without their own app will send from this number.",
      })
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message || "", variant: "destructive" })
    } finally {
      setSavingPlatform(false)
    }
  }

  const onLink = async () => {
    if (!form.businessId.trim() || !form.appId.trim() || !form.sourceNumber.trim()) {
      toast({ title: "Missing fields", description: "Business ID, App ID and Sender number are required.", variant: "destructive" })
      return
    }
    setLinking(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/link`, {
        method: "POST",
        credentials: "include",
        headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: form.businessId.trim(),
          appId: form.appId.trim(),
          appName: form.appName.trim() || undefined,
          sourceNumber: form.sourceNumber.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Link failed")
      const sub = json.data?.subscription
      toast({
        title: "Gupshup app linked",
        description: sub?.ok
          ? "App connected and webhook subscription registered."
          : "App connected. Webhook subscription could not be set — verify the webhook URL below.",
      })
      setForm({ businessId: "", appId: "", appName: "", sourceNumber: "" })
    } catch (err: any) {
      toast({ title: "Link failed", description: err?.message || "", variant: "destructive" })
    } finally {
      setLinking(false)
    }
  }

  return (
    <Card>
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-start justify-between gap-4 p-6 text-left transition-colors hover:bg-muted/40"
          >
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-5 w-5" />
                Gupshup WhatsApp (Partner Portal)
              </CardTitle>
              <CardDescription>
                Configure your Gupshup Partner Portal account, shared platform sender, webhook URL, and per-salon app
                links. Environment variables override saved values when set.
              </CardDescription>
            </div>
            <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-5 pt-0">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={config?.activeProvider === "gupshup" ? "default" : "secondary"}>
                Active provider: {config?.activeProvider || "gupshup"}
              </Badge>
              <Badge variant={config?.partnerConfigured ? "default" : "destructive"}>
                {config?.partnerConfigured ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Partner creds set
                    {config.partnerSource ? ` (${config.partnerSource})` : ""}
                  </span>
                ) : (
                  <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Partner creds missing</span>
                )}
              </Badge>
              {config?.platformAppId ? (
                <Badge variant="outline">
                  Platform app: {config.platformAppName || config.platformAppId}
                  {config.platformSource ? ` (${config.platformSource})` : ""}
                </Badge>
              ) : (
                <Badge variant="destructive">No platform app</Badge>
              )}
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="text-sm font-medium">Partner credentials</div>
              <p className="text-xs text-muted-foreground">
                From Gupshup Partner Portal → Settings → API client details. Stored encrypted; the secret is never
                shown again after saving. Env vars <code className="text-xs">GUPSHUP_EMAIL</code> /{" "}
                <code className="text-xs">GUPSHUP_CLIENT_SECRET</code> override these when set.
              </p>
              {config?.partnerSource === "env" ? (
                <Alert>
                  <AlertTitle>Using environment variables</AlertTitle>
                  <AlertDescription className="text-xs">
                    Partner credentials are loaded from backend env vars. Saved values below are ignored until env
                    vars are removed.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="gs-partner-email">Partner email</Label>
                  <Input
                    id="gs-partner-email"
                    type="email"
                    value={partnerForm.email}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="partner-account@example.com"
                    disabled={config?.partnerSource === "env"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gs-partner-secret">Client secret</Label>
                  <Input
                    id="gs-partner-secret"
                    type="password"
                    value={partnerForm.clientSecret}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, clientSecret: e.target.value }))}
                    placeholder={
                      config?.hasPartnerSecret ? "Leave blank to keep existing secret" : "From API client details"
                    }
                    disabled={config?.partnerSource === "env"}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={onSavePartner}
                disabled={savingPartner || config?.partnerSource === "env"}
              >
                {savingPartner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save partner credentials
              </Button>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="text-sm font-medium">Shared platform app (fallback sender)</div>
              <p className="text-xs text-muted-foreground">
                Used for transactional messages, campaigns, and inbox when a salon has not connected their own
                Gupshup app. Env vars <code className="text-xs">GUPSHUP_PLATFORM_*</code> override these values.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="plat-app">App ID</Label>
                  <Input
                    id="plat-app"
                    value={platformForm.appId}
                    onChange={(e) => setPlatformForm((f) => ({ ...f, appId: e.target.value }))}
                    placeholder="Gupshup app id"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="plat-name">App name (src.name)</Label>
                  <Input
                    id="plat-name"
                    value={platformForm.appName}
                    onChange={(e) => setPlatformForm((f) => ({ ...f, appName: e.target.value }))}
                    placeholder="optional"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="plat-src">Sender number</Label>
                  <Input
                    id="plat-src"
                    value={platformForm.sourceNumber}
                    onChange={(e) => setPlatformForm((f) => ({ ...f, sourceNumber: e.target.value }))}
                    placeholder="91XXXXXXXXXX"
                  />
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={onSavePlatform} disabled={savingPlatform}>
                {savingPlatform ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save shared platform app
              </Button>
            </div>

            <div className="rounded-md border p-4 text-sm">
              <p className="font-medium">WhatsApp templates</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create and submit platform templates for Meta approval in{" "}
                <Link href="/admin/platform/template-manager" className="text-indigo-600 hover:underline font-medium">
                  Communication → Template Manager
                </Link>
                .
              </p>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">Delivery webhook URL</div>
                <div className="flex flex-wrap gap-2">
                  {subscriptionStatus?.registered ? (
                    <Badge className="bg-emerald-600">Registered on Gupshup</Badge>
                  ) : subscriptionStatus?.configured ? (
                    <Badge variant="secondary">Not registered yet</Badge>
                  ) : null}
                  {config?.webhookSource ? (
                    <Badge variant="outline">Source: {config.webhookSource}</Badge>
                  ) : null}
                </div>
              </div>
              {subscriptionStatus?.checkError ? (
                <p className="text-xs text-amber-700">{subscriptionStatus.checkError}</p>
              ) : null}
              {subscriptionStatus?.subscriptions?.length ? (
                <p className="text-xs text-muted-foreground">
                  Gupshup subscriptions:{" "}
                  {subscriptionStatus.subscriptions
                    .map((s) => `${s.active === false ? "(inactive) " : ""}${s.url}`)
                    .join(" · ")}
                </p>
              ) : null}
              {config?.webhookUrl ? (
                <p className="break-all text-xs text-muted-foreground">{config.webhookUrl}</p>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="gs-webhook">Override URL (optional)</Label>
                <Input
                  id="gs-webhook"
                  value={webhookOverride}
                  onChange={(e) => setWebhookOverride(e.target.value)}
                  placeholder="https://your-tunnel.trycloudflare.com/api/webhooks/whatsapp/gupshup"
                />
                <p className="text-xs text-muted-foreground">
                  Paste your Cloudflare tunnel or public backend host. The path{" "}
                  <code className="text-xs">/api/webhooks/whatsapp/gupshup</code> is added automatically if
                  omitted. Leave empty to auto-detect from BACKEND_PUBLIC_URL or Railway.
                </p>
              </div>
              {registerMismatch && staleSubscriptionUrl ? (
                <Alert variant="destructive">
                  <AlertTitle>Webhook URL mismatch</AlertTitle>
                  <AlertDescription className="text-xs space-y-2">
                    <p>
                      Gupshup is still sending inbound messages to an older URL (likely a previous Cloudflare
                      tunnel):
                    </p>
                    <p className="break-all font-mono">{staleSubscriptionUrl}</p>
                    <p>
                      Your saved URL is{" "}
                      <span className="break-all font-mono">{config?.webhookUrl || webhookOverride}</span>. Wait 60
                      seconds, then click Register once to update Gupshup.
                    </p>
                  </AlertDescription>
                </Alert>
              ) : null}
              {config?.webhookUrl?.includes("localhost") ? (
                <Alert>
                  <AlertTitle>Local development</AlertTitle>
                  <AlertDescription className="text-xs">
                    Gupshup cannot reach localhost directly. Use a public tunnel (Cloudflare Tunnel, ngrok,
                    etc.), set <code className="text-xs">GUPSHUP_WEBHOOK_URL</code> or the override below to{" "}
                    <code className="text-xs">https://your-tunnel-host/api/webhooks/whatsapp/gupshup</code>,
                    then click Register webhook. For tunnel dev, leave{" "}
                    <code className="text-xs">GUPSHUP_WEBHOOK_IPS</code> unset in{" "}
                    <code className="text-xs">.env</code> — requests arrive from the tunnel, not Gupshup IPs.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Button variant="secondary" size="sm" onClick={onSaveWebhook} disabled={savingWebhook}>
                {savingWebhook ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save webhook URL
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={onRegisterPlatformWebhook}
                disabled={registeringWebhook || registerCooldownSec > 0 || !config?.platformAppId}
              >
                {registeringWebhook ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" />
                )}
                {registerCooldownSec > 0
                  ? `Wait ${registerCooldownSec}s`
                  : subscriptionStatus?.registered
                    ? "Refresh webhook registration"
                    : "Register webhook on platform app"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Inbound WhatsApp replies require this step after saving the webhook URL and platform app. Gupshup
                limits subscription API to <strong>5 calls per minute</strong> — wait 60s if you see &quot;Too Many
                Requests&quot;. Outbound templates work without it; the inbox does not.
              </p>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div className="text-sm font-medium">Link a salon&apos;s Gupshup app</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="gs-biz">Business ID</Label>
                  <Input id="gs-biz" value={form.businessId} onChange={(e) => setForm((f) => ({ ...f, businessId: e.target.value }))} placeholder="Mongo business _id" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gs-app">Gupshup App ID</Label>
                  <Input id="gs-app" value={form.appId} onChange={(e) => setForm((f) => ({ ...f, appId: e.target.value }))} placeholder="app id" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gs-name">App Name (src.name)</Label>
                  <Input id="gs-name" value={form.appName} onChange={(e) => setForm((f) => ({ ...f, appName: e.target.value }))} placeholder="optional" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gs-src">Sender number</Label>
                  <Input id="gs-src" value={form.sourceNumber} onChange={(e) => setForm((f) => ({ ...f, sourceNumber: e.target.value }))} placeholder="91XXXXXXXXXX" />
                </div>
              </div>
              <Button onClick={onLink} disabled={linking}>
                {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                Link app
              </Button>
            </div>
          </>
        )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
