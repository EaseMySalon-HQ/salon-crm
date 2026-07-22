"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertTriangle,
  Plug,
  RefreshCw,
  Send,
  XCircle,
  Loader2,
  Phone,
  Info,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { csrfHeadersObject, getCsrfToken } from "@/lib/csrf"

interface ApprovedTemplateOption {
  id: string
  name: string
  language: string
  gupshupTemplateId: string
  category: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

async function ensureCsrfBootstrapped() {
  if (typeof window === "undefined") return
  if (getCsrfToken()) return
  try {
    await fetch(`${API_URL}/auth/csrf`, { credentials: "include" })
  } catch {
    /* ignore */
  }
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...csrfHeadersObject() }
}

interface GupshupStatus {
  status?: "connected" | "platform_shared" | "disconnected"
  connected?: boolean
  usingSharedPlatform?: boolean
  ownAppConnected?: boolean
  platformConfigured?: boolean
  gupshupAppId?: string | null
  gupshupAppName?: string | null
  sourceNumber?: string | null
  displayName?: string | null
  qualityRating?: string | null
  messagingLimitTier?: string | null
  connectedAt?: string | null
  lastSyncAt?: string | null
  lastErrorMessage?: string | null
  platformSourceNumber?: string | null
  addon?: {
    waba: boolean
    legacyWhatsapp: boolean
  }
}

export function WhatsAppGupshupConnectCard() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<GupshupStatus | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [appId, setAppId] = useState("")
  const [appName, setAppName] = useState("")
  const [sourceNumber, setSourceNumber] = useState("")
  const [testTo, setTestTo] = useState("")
  const [testTemplateId, setTestTemplateId] = useState("")
  const [approvedTemplates, setApprovedTemplates] = useState<ApprovedTemplateOption[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/gupshup/status`, { credentials: "include" })
      const data = await res.json()
      if (data.success) {
        setStatus(data.data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const wabaEnabled = Boolean(status?.addon?.waba)
  const ownConnected = Boolean(status?.ownAppConnected)

  async function handleConnect() {
    if (!appId.trim() || !sourceNumber.trim()) {
      toast({ title: "Missing fields", description: "App ID and sender number are required.", variant: "destructive" })
      return
    }
    setBusy(true)
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/gupshup/connect`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({
          appId: appId.trim(),
          appName: appName.trim() || undefined,
          sourceNumber: sourceNumber.trim(),
        }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Connect failed")
      }
      setStatus(data.data)
      setConnectOpen(false)
      const resetCount = Number(data.data?.templatesReset?.templatesReset || 0)
      toast({
        title: "WhatsApp connected",
        description:
          resetCount > 0
            ? `Your Gupshup app is linked. ${resetCount} template(s) were reset to draft — re-submit them on your new number.`
            : "Your Gupshup app is now linked to this business.",
      })
    } catch (err: unknown) {
      toast({
        title: "Connect failed",
        description: err instanceof Error ? err.message : "Could not connect Gupshup app",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect your WhatsApp app? Messages will use the shared platform number if configured.")) return
    setBusy(true)
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/gupshup/disconnect`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "Disconnect failed")
      setStatus(data.data)
      toast({ title: "Disconnected", description: "Your own app has been disconnected." })
    } catch (err: unknown) {
      toast({
        title: "Disconnect failed",
        description: err instanceof Error ? err.message : "Could not disconnect",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleRefresh() {
    setBusy(true)
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/gupshup/refresh`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "Refresh failed")
      setStatus(data.data)
      toast({ title: "Refreshed", description: "Health and quality ratings updated." })
    } catch (err: unknown) {
      toast({
        title: "Refresh failed",
        description: err instanceof Error ? err.message : "Could not refresh",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const loadApprovedTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/gupshup/templates?origin=own`, {
        credentials: "include",
      })
      const data = await res.json()
      if (!data.success) return
      const rows = Array.isArray(data.data) ? data.data : []
      const approved: ApprovedTemplateOption[] = rows
        .filter((t: { status?: string; gupshupTemplateId?: string | null }) =>
          t.status === "approved" && t.gupshupTemplateId
        )
        .map((t: {
          _id: string
          name: string
          language: string
          gupshupTemplateId: string
          category?: string
        }) => ({
          id: String(t._id),
          name: t.name,
          language: t.language,
          gupshupTemplateId: t.gupshupTemplateId,
          category: t.category || "",
        }))
      setApprovedTemplates(approved)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  async function openTestDialog() {
    setTestOpen(true)
    await loadApprovedTemplates()
  }

  async function handleTestSend() {
    if (!testTo.trim() || !testTemplateId.trim()) {
      toast({ title: "Missing fields", description: "Recipient and template are required.", variant: "destructive" })
      return
    }
    setBusy(true)
    try {
      await ensureCsrfBootstrapped()
      const res = await fetch(`${API_URL}/whatsapp/gupshup/test-message`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ to: testTo.trim(), gupshupTemplateId: testTemplateId.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "Test send failed")
      setTestOpen(false)
      const finalStatus = String(data.finalStatus || data.data?.status || "sent")
      if (finalStatus === "delivered" || finalStatus === "read") {
        toast({
          title: "Test delivered",
          description: `WhatsApp confirmed delivery to ${testTo.trim()}.`,
        })
      } else if (finalStatus === "sent") {
        toast({
          title: "Test sent",
          description:
            "Submitted to Gupshup. Delivery confirmation will arrive via webhook — refresh the inbox in a moment.",
        })
      } else {
        toast({
          title: "Test submitted",
          description: `Current status: ${finalStatus}.`,
        })
      }
    } catch (err: unknown) {
      toast({
        title: "Test failed",
        description: err instanceof Error ? err.message : "Could not send test message",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    )
  }

  if (!wabaEnabled) {
    return (
      <Card className="border-yellow-200 bg-yellow-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            WABA add-on required
          </CardTitle>
          <CardDescription>
            WhatsApp Business (templates, campaigns, inbox) requires the WABA add-on. Contact support to enable it.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!ownConnected) {
    return (
      <>
        <Card>
          <CardContent className="py-10 flex flex-col items-center justify-center text-center gap-4">
            <Button size="lg" onClick={() => setConnectOpen(true)} disabled={busy}>
              <Plug className="h-4 w-4 mr-2" />
              Connect your WhatsApp app
            </Button>
          </CardContent>
        </Card>

        <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect WhatsApp app</DialogTitle>
              <DialogDescription>
                Enter the app details from your Gupshup Partner Portal. Once connected, all WhatsApp messages for this
                business will send from your number.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="gupshup-app-id">App ID *</Label>
                <Input id="gupshup-app-id" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="e.g. abc123-def456" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gupshup-app-name">App name (optional)</Label>
                <Input id="gupshup-app-name" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="My Salon WhatsApp" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gupshup-source">Sender number *</Label>
                <Input
                  id="gupshup-source"
                  value={sourceNumber}
                  onChange={(e) => setSourceNumber(e.target.value)}
                  placeholder="91XXXXXXXXXX"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConnectOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConnect} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-green-600" />
                WhatsApp connected
              </CardTitle>
              <CardDescription className="mt-1">
                Messages for this business send from your connected WhatsApp number.
              </CardDescription>
            </div>
            <Badge className="bg-green-600">Connected</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.lastErrorMessage &&
            !/debug_token|oauth|meta rejected|access token.*expired/i.test(status.lastErrorMessage) && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {status.lastErrorMessage}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <span className="text-slate-500">Sender number</span>
              <p className="font-medium">{status?.sourceNumber || "—"}</p>
            </div>
            <div>
              <span className="text-slate-500">App name</span>
              <p className="font-medium">{status?.gupshupAppName || status?.displayName || "—"}</p>
            </div>
            <div>
              <span className="text-slate-500">App ID</span>
              <p className="font-mono text-xs">{status?.gupshupAppId || "—"}</p>
            </div>
            <div>
              <span className="text-slate-500">Quality / limit</span>
              <p className="font-medium">
                {[status?.qualityRating, status?.messagingLimitTier].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            {status?.connectedAt && (
              <div>
                <span className="text-slate-500">Connected</span>
                <p className="font-medium">{new Date(status.connectedAt).toLocaleString()}</p>
              </div>
            )}
            {status?.lastSyncAt && (
              <div>
                <span className="text-slate-500">Last synced</span>
                <p className="font-medium">{new Date(status.lastSyncAt).toLocaleString()}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" onClick={handleRefresh} disabled={busy}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => void openTestDialog()} disabled={busy}>
              <Send className="h-4 w-4 mr-2" />
              Test message
            </Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={busy}>
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send test message</DialogTitle>
            <DialogDescription>
              Send one of your approved WhatsApp templates from your connected number to verify delivery.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="test-to">Recipient phone</Label>
              <Input id="test-to" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="91XXXXXXXXXX" />
              <p className="text-xs text-slate-500">Include country code, no spaces or +.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-template">Approved template</Label>
              {loadingTemplates ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
                </div>
              ) : approvedTemplates.length > 0 ? (
                <Select value={testTemplateId} onValueChange={setTestTemplateId}>
                  <SelectTrigger id="test-template">
                    <SelectValue placeholder="Pick an approved template" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.gupshupTemplateId}>
                        {t.name} · {t.language}
                        {t.category ? ` · ${t.category}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    You don&apos;t have any approved templates on this app yet. Meta approval usually takes 15 minutes to a few hours after submitting.
                    <div className="mt-2">
                      <Link
                        href="/whatsapp/templates"
                        className="text-primary underline underline-offset-2"
                      >
                        Manage templates →
                      </Link>
                    </div>
                  </div>
                </div>
              )}
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer select-none">Paste a Gupshup template ID instead</summary>
                <Input
                  className="mt-2"
                  value={testTemplateId}
                  onChange={(e) => setTestTemplateId(e.target.value)}
                  placeholder="Approved Gupshup template id"
                />
              </details>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTestSend}
              disabled={busy || !testTemplateId.trim() || !testTo.trim()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
