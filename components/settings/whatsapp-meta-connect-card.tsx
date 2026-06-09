"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CheckCircle2,
  AlertTriangle,
  Plug,
  RefreshCw,
  Send,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Sparkles,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { csrfHeadersObject, getCsrfToken } from "@/lib/csrf"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

/**
 * Bootstraps the SPA's CSRF token on first mount when the cross-origin
 * `ems_csrf` cookie isn't readable from `document.cookie`. Mirrors what
 * `lib/api.ts#ensureCsrfTokenForMutatingRequest` does for the axios client.
 */
async function ensureCsrfBootstrapped() {
  if (typeof window === "undefined") return
  if (getCsrfToken()) return
  try {
    await fetch(`${API_URL}/auth/csrf`, { credentials: "include" })
  } catch {
    /* ignore — caller may still hit 403 */
  }
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...csrfHeadersObject() }
}

interface ComplianceItem {
  ok: boolean
  label: string
  hint?: string | null
  fixHref?: string | null
}

interface ComplianceState {
  allOk: boolean
  items: ComplianceItem[]
}

interface MetaStatus {
  status?: "connected" | "disconnected" | "error"
  mode?: "test" | "live"
  connected?: boolean
  wabaId?: string | null
  metaBusinessId?: string | null
  phoneNumberId?: string | null
  phoneE164?: string | null
  displayName?: string | null
  qualityRating?: string | null
  messagingLimitTier?: string | null
  webhookVerified?: boolean
  connectedAt?: string | null
  disconnectedAt?: string | null
  lastSyncAt?: string | null
  tokenExpiresAt?: string | null
  tokenLastUsedAt?: string | null
  lastErrorMessage?: string | null
  compliance?: ComplianceState | null
  /**
   * Reflects per-business add-on flags so the UI can render a "disabled"
   * empty state when the platform admin hasn't enabled WABA yet (since
   * every write endpoint will 403). `legacyWhatsapp` is shown as context
   * — businesses on the MSG91 path still see the legacy settings card
   * elsewhere.
   */
  addon?: {
    waba: boolean
    legacyWhatsapp: boolean
  }
}

declare global {
  interface Window {
    FB?: any
    fbAsyncInit?: () => void
  }
}

interface PublicMetaConfig {
  appId: string | null
  configId: string | null
  graphVersion: string | null
  hasMetaConfig: boolean
}

function loadFacebookSdk(appId: string, graphVersion: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("SSR"))
    if (window.FB) return resolve()
    const id = "facebook-jssdk"
    if (document.getElementById(id)) {
      const interval = setInterval(() => {
        if (window.FB) {
          clearInterval(interval)
          resolve()
        }
      }, 200)
      setTimeout(() => {
        clearInterval(interval)
        reject(new Error("Facebook SDK timeout"))
      }, 8000)
      return
    }
    window.fbAsyncInit = function () {
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: graphVersion || "v23.0",
      })
      resolve()
    }
    const script = document.createElement("script")
    script.id = id
    script.async = true
    script.defer = true
    script.crossOrigin = "anonymous"
    script.src = "https://connect.facebook.net/en_US/sdk.js"
    script.onerror = () => reject(new Error("Failed to load Facebook SDK"))
    document.body.appendChild(script)
  })
}

function fmt(d?: string | null) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleString()
  } catch {
    return "—"
  }
}

function qualityBadge(q?: string | null) {
  if (!q) return <Badge variant="secondary">unknown</Badge>
  if (/green/i.test(q)) return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{q}</Badge>
  if (/yellow/i.test(q)) return <Badge className="bg-amber-100 text-amber-700 border-amber-200">{q}</Badge>
  if (/red/i.test(q)) return <Badge className="bg-red-100 text-red-700 border-red-200">{q}</Badge>
  return <Badge variant="secondary">{q}</Badge>
}

export function WhatsAppMetaConnectCard() {
  const { toast } = useToast()
  const [status, setStatus] = useState<MetaStatus | null>(null)
  const [publicCfg, setPublicCfg] = useState<PublicMetaConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showTest, setShowTest] = useState(false)
  const [testTo, setTestTo] = useState("")
  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManualForm] = useState({
    accessToken: "",
    wabaId: "",
    phoneNumberId: "",
    phoneE164: "",
    displayName: "",
    expiresInSeconds: "",
  })

  const refreshStatus = async () => {
    try {
      setLoading(true)
      const [statusRes, cfgRes] = await Promise.all([
        fetch(`${API_URL}/whatsapp/meta/status`, { credentials: "include" }),
        fetch(`${API_URL}/whatsapp/meta/public-config`, { credentials: "include" }),
      ])
      const statusJson = await statusRes.json()
      if (statusJson.success) setStatus(statusJson.data)
      const cfgJson = await cfgRes.json()
      if (cfgJson.success) setPublicCfg(cfgJson.data)
    } catch (err) {
      console.error("status load failed", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    ensureCsrfBootstrapped().then(refreshStatus)
  }, [])

  const handleConnect = async () => {
    if (!publicCfg?.appId || !publicCfg?.configId) {
      toast({
        title: "Embedded Signup not configured",
        description:
          "Ask a platform admin to fill in App ID and Embedded Signup Config ID under Admin → Settings → API & Integration → WhatsApp. Or use the dev-mode token paste.",
        variant: "destructive",
      })
      return
    }
    setBusy("connect")
    try {
      await loadFacebookSdk(publicCfg.appId, publicCfg.graphVersion || "v23.0")
      const fb = window.FB
      if (!fb) throw new Error("Facebook SDK unavailable")

      const code: string = await new Promise((resolve, reject) => {
        fb.login(
          (response: any) => {
            if (response?.authResponse?.code) resolve(response.authResponse.code)
            else if (response?.authResponse?.accessToken) resolve(response.authResponse.accessToken)
            else reject(new Error("Embedded Signup cancelled"))
          },
          {
            config_id: publicCfg.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: 3 },
          }
        )
      })

      // The Embedded Signup widget posts the WABA / phone number IDs via
      // postMessage. For a first-pass implementation we ask the user to confirm
      // the values returned.
      const wabaId = window.prompt("Enter the WABA ID returned by Meta")?.trim()
      const phoneNumberId = window.prompt("Enter the Phone Number ID returned by Meta")?.trim()
      const phoneE164 = window.prompt("Enter the WhatsApp business phone number (E.164, optional)")?.trim()
      const displayName = window.prompt("Enter the verified display name (optional)")?.trim()

      if (!wabaId || !phoneNumberId) {
        toast({ title: "Connect cancelled", description: "WABA ID and Phone Number ID are required", variant: "destructive" })
        return
      }

      await ensureCsrfBootstrapped()
      const exchange = await fetch(`${API_URL}/whatsapp/meta/connect/exchange`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ code, wabaId, phoneNumberId, phoneE164, displayName, mode: "test" }),
      })
      const data = await exchange.json()
      if (!exchange.ok || !data.success) throw new Error(data.error || "Exchange failed")
      toast({ title: "WhatsApp connected", description: "Meta WABA linked to this business" })
      setStatus(data.data)
    } catch (err: any) {
      console.error(err)
      toast({ title: "Connect failed", description: err?.message || "Unknown error", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const handleManualConnect = async () => {
    const accessToken = manualForm.accessToken.trim()
    const wabaId = manualForm.wabaId.trim()
    const phoneNumberId = manualForm.phoneNumberId.trim()
    if (!accessToken || !wabaId || !phoneNumberId) {
      toast({
        title: "Missing fields",
        description: "Access token, WABA ID and Phone Number ID are required.",
        variant: "destructive",
      })
      return
    }
    setBusy("manual-connect")
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/meta/connect/manual`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({
          accessToken,
          wabaId,
          phoneNumberId,
          phoneE164: manualForm.phoneE164.trim() || undefined,
          displayName: manualForm.displayName.trim() || undefined,
          expiresInSeconds: manualForm.expiresInSeconds
            ? Number(manualForm.expiresInSeconds)
            : undefined,
          mode: "test",
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) throw new Error(data?.error || "Connect failed")
      toast({
        title: "WhatsApp connected (manual)",
        description: "Token encrypted and saved. Webhook subscription attempted.",
      })
      setStatus(data.data)
      setShowManual(false)
      setManualForm({
        accessToken: "",
        wabaId: "",
        phoneNumberId: "",
        phoneE164: "",
        displayName: "",
        expiresInSeconds: "",
      })
    } catch (err: any) {
      toast({ title: "Connect failed", description: err?.message || "", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm("Disconnect WhatsApp? Outbound sends will fall back to MSG91 until you reconnect.")) return
    setBusy("disconnect")
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/meta/disconnect`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Disconnect failed")
      toast({ title: "Disconnected", description: "WhatsApp Business account disconnected." })
      setStatus(data.data)
    } catch (err: any) {
      toast({ title: "Disconnect failed", description: err?.message || "", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const handleRefresh = async () => {
    setBusy("refresh")
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/meta/refresh`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Refresh failed")
      toast({ title: "Refreshed", description: "Latest WhatsApp metadata pulled from Meta." })
      setStatus(data.data)
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err?.message || "", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const handleToggleMode = async () => {
    const next = status?.mode === "live" ? "test" : "live"
    setBusy("mode")
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/meta/mode`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ mode: next }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Mode change failed")
      toast({ title: `Mode: ${next}`, description: next === "test" ? "Wallet debits skipped; whitelist enforced." : "Live mode active. Sends now bill the wallet." })
      setStatus(data.data)
    } catch (err: any) {
      toast({ title: "Mode change failed", description: err?.message || "", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const handleSendTest = async () => {
    if (!testTo) return
    setBusy("test")
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/meta/test-message`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ to: testTo, templateName: "hello_world", language: "en_US" }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Test send failed")
      toast({ title: "Test message queued", description: "Watch the WhatsApp app on the recipient phone." })
      setShowTest(false)
      setTestTo("")
    } catch (err: any) {
      toast({ title: "Test send failed", description: err?.message || "", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const connected = Boolean(status?.connected)
  const compliance = status?.compliance
  /**
   * If `addon.waba` is missing on the response (older deploys), default to
   * `true` so we don't render a "disabled" state for previously-working
   * businesses. The backend gate is still authoritative — write attempts
   * still 403 if the flag is actually off server-side.
   */
  const wabaAddonEnabled = status?.addon?.waba !== false

  return (
    <Card className="border-2 border-emerald-100 bg-gradient-to-br from-white to-emerald-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-emerald-900">
              <Sparkles className="h-5 w-5" />
              WhatsApp Business (Meta Cloud API)
            </CardTitle>
            <CardDescription className="text-slate-600">
              Connect your salon&apos;s WhatsApp Business Account through Meta Embedded Signup. Marketing campaigns and high-volume sends use this connection; legacy MSG91 stays as a transactional fallback.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {!wabaAddonEnabled ? (
              <Badge className="bg-slate-200 text-slate-700 border-slate-300">Add-on disabled</Badge>
            ) : connected ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Connected</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-600 border-slate-200">Not connected</Badge>
            )}
            {status?.mode === "test" && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200">Test mode</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading WhatsApp status…
          </div>
        ) : !wabaAddonEnabled ? (
          <div className="rounded-xl border border-slate-200 bg-white/70 p-6 flex flex-col items-center text-center">
            <ShieldAlert className="h-10 w-10 text-slate-500 mb-3" />
            <p className="text-base font-medium text-slate-800">
              WABA Integration add-on is not enabled
            </p>
            <p className="text-sm text-slate-500 mt-1 max-w-lg">
              The native Meta WhatsApp module (templates, campaigns, inbox, opt-out
              webhooks) is gated behind the &quot;WABA Integration&quot; add-on. Ask your
              platform admin to enable it under <span className="font-medium">Admin → Plan Management</span>{" "}
              for this business. Your existing WhatsApp setup
              {status?.addon?.legacyWhatsapp ? " (MSG91)" : ""} is unaffected.
            </p>
            {status?.addon?.legacyWhatsapp && (
              <div className="mt-4 rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-blue-900 max-w-lg">
                Legacy WhatsApp (MSG91) is currently ON. Receipts and reminders
                continue to flow through MSG91 until WABA is enabled and
                connected.
              </div>
            )}
          </div>
        ) : connected ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 bg-white rounded-xl border border-emerald-100 p-4">
              <div>
                <p className="text-xs uppercase text-slate-500 tracking-wide">Display name</p>
                <p className="text-sm font-medium text-slate-800">{status?.displayName || "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 tracking-wide">Phone</p>
                <p className="text-sm font-medium text-slate-800">{status?.phoneE164 || status?.phoneNumberId}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 tracking-wide">Quality</p>
                <div>{qualityBadge(status?.qualityRating)}</div>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 tracking-wide">Tier</p>
                <p className="text-sm font-medium text-slate-800">{status?.messagingLimitTier || "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 tracking-wide">Webhook</p>
                <div className="flex items-center gap-1 text-sm">
                  {status?.webhookVerified ? (
                    <>
                      <ShieldCheck className="h-4 w-4 text-emerald-600" /> Verified
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-4 w-4 text-amber-600" /> Pending
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 tracking-wide">Connected</p>
                <p className="text-sm font-medium text-slate-800">{fmt(status?.connectedAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 tracking-wide">Last sync</p>
                <p className="text-sm font-medium text-slate-800">{fmt(status?.lastSyncAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 tracking-wide">Token expires</p>
                <p className="text-sm font-medium text-slate-800">{fmt(status?.tokenExpiresAt) || "long-lived"}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setShowTest(true)} disabled={busy !== null} variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                <Send className="mr-2 h-4 w-4" /> Send test message
              </Button>
              <Button onClick={handleRefresh} disabled={busy !== null} variant="outline">
                <RefreshCw className={`mr-2 h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} /> Refresh metadata
              </Button>
              <Button onClick={handleToggleMode} disabled={busy !== null} variant="outline">
                {status?.mode === "live" ? "Switch to Test mode" : "Promote to Live mode"}
              </Button>
              <Button onClick={handleDisconnect} disabled={busy !== null} variant="ghost" className="text-red-600 hover:bg-red-50">
                <XCircle className="mr-2 h-4 w-4" /> Disconnect
              </Button>
            </div>

            {status?.lastErrorMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 mt-0.5" /> {status.lastErrorMessage}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-emerald-200 bg-white/60 p-6 flex flex-col items-center text-center">
            <Plug className="h-10 w-10 text-emerald-600 mb-3" />
            <p className="text-base font-medium text-slate-800">No WhatsApp Business account connected</p>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              Connect via Meta Embedded Signup to unlock approved templates, campaigns, and direct delivery webhooks. We never store your raw access token — it&apos;s encrypted with AES-256-GCM at rest.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                onClick={handleConnect}
                disabled={busy !== null || !publicCfg?.configId}
                className="bg-emerald-600 hover:bg-emerald-700"
                title={
                  publicCfg?.configId
                    ? "Open Meta Embedded Signup"
                    : "Embedded Signup config not set — ask a platform admin"
                }
              >
                {busy === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
                Connect WhatsApp
              </Button>
              <Button
                onClick={() => setShowManual(true)}
                disabled={busy !== null}
                variant="outline"
                title="Paste an access token from the Meta API Setup page (test number / dev mode)"
              >
                Connect via access token (dev / test)
              </Button>
            </div>
            {!publicCfg?.hasMetaConfig && (
              <p className="mt-3 text-xs text-amber-700 max-w-md">
                A platform admin still needs to fill in App ID + App Secret under{" "}
                <strong>Admin → Settings → API &amp; Integration → WhatsApp</strong> before
                webhook signature verification will work.
              </p>
            )}
          </div>
        )}

        {compliance && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Meta approval booster
            </p>
            <ul className="space-y-2">
              {compliance.items.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  {item.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                  )}
                  <div>
                    <span className={item.ok ? "text-slate-800" : "text-slate-700 font-medium"}>{item.label}</span>
                    {item.hint && <p className="text-xs text-slate-500 mt-0.5">{item.hint}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <Dialog open={showManual} onOpenChange={setShowManual}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect via access token</DialogTitle>
            <DialogDescription>
              Use this for the free Meta-provided test number, or for any token you
              generated from the Meta App Dashboard → API Setup page. The token is
              encrypted with AES-256-GCM before being written to MongoDB.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-token">Access token</Label>
              <Input
                id="m-token"
                type="password"
                placeholder="EAAJZ..."
                value={manualForm.accessToken}
                onChange={(e) => setManualForm({ ...manualForm, accessToken: e.target.value })}
                autoComplete="off"
              />
              <p className="text-xs text-slate-500">
                From <em>Meta App Dashboard → WhatsApp → API Setup → Generate access
                token</em>.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-waba">WABA ID</Label>
                <Input
                  id="m-waba"
                  placeholder="813413768485540"
                  value={manualForm.wabaId}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, wabaId: e.target.value.replace(/\D/g, "") })
                  }
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-phone-id">Phone Number ID</Label>
                <Input
                  id="m-phone-id"
                  placeholder="1862177820317475"
                  value={manualForm.phoneNumberId}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      phoneNumberId: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-e164">Phone (E.164, optional)</Label>
                <Input
                  id="m-e164"
                  placeholder="+15556552954"
                  value={manualForm.phoneE164}
                  onChange={(e) => setManualForm({ ...manualForm, phoneE164: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-display">Display name (optional)</Label>
                <Input
                  id="m-display"
                  placeholder="Test number"
                  value={manualForm.displayName}
                  onChange={(e) => setManualForm({ ...manualForm, displayName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-expires">Token expires-in seconds (optional)</Label>
              <Input
                id="m-expires"
                inputMode="numeric"
                placeholder="86400 (24h test tokens)"
                value={manualForm.expiresInSeconds}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    expiresInSeconds: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
              <p className="text-xs text-slate-500">
                Leave blank for long-lived tokens. Test-number tokens are typically 24
                hours.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManual(false)}>Cancel</Button>
            <Button
              onClick={handleManualConnect}
              disabled={busy === "manual-connect"}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {busy === "manual-connect" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-2 h-4 w-4" />
              )}
              Save & connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTest} onOpenChange={setShowTest}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a hello_world test message</DialogTitle>
            <DialogDescription>
              Useful for verifying the connection and webhook handshake. Cost is suppressed in test mode; live mode debits the wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="test-to">Recipient phone (digits only, with country code)</Label>
            <Input id="test-to" placeholder="919876543210" value={testTo} onChange={(e) => setTestTo(e.target.value.replace(/\D/g, ""))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTest(false)}>Cancel</Button>
            <Button onClick={handleSendTest} disabled={busy === "test" || testTo.length < 10} className="bg-emerald-600 hover:bg-emerald-700">
              {busy === "test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
