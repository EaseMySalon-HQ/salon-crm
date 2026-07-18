"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { TableSkeleton } from "@/components/loading"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import {
  AdminPlatformWhatsAppCampaignsAPI,
  AdminPlatformWhatsAppInboxAPI,
  type PlatformCampaignsSummaryReport,
  type PlatformWhatsAppCampaign,
  type PlatformWhatsAppTemplate,
} from "@/lib/admin-platform-whatsapp-api"
import { PlatformWhatsAppCampaignReportDialog } from "@/components/admin/platform/platform-whatsapp-campaign-report-dialog"
import {
  BarChart3,
  Loader2,
  Megaphone,
  PlusCircle,
  RefreshCw,
  Send,
  Settings,
  Square,
  Users,
} from "lucide-react"
import { format } from "date-fns"

const LEAD_STATUSES = ["new", "follow-up", "trial", "converted", "lost"] as const

const FIELD_OPTIONS = [
  { value: "firstName", label: "First name" },
  { value: "name", label: "Full name" },
  { value: "salonName", label: "Salon name" },
  { value: "city", label: "City" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "source", label: "Source" },
  { value: "status", label: "Status" },
]

function findPlaceholders(text?: string | null) {
  if (!text) return []
  const set = new Set<number>()
  const re = /\{\{(\d+)\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > 0) set.add(n)
  }
  return Array.from(set).sort((a, b) => a - b)
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    scheduled: "bg-indigo-100 text-indigo-700",
    queued: "bg-amber-100 text-amber-800",
    sending: "bg-amber-100 text-amber-800",
    sent: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-700",
    cancelled: "bg-slate-100 text-slate-600",
  }
  return <Badge className={map[status] || map.draft}>{status}</Badge>
}

function progressSummary(c: PlatformWhatsAppCampaign) {
  const counts = c.counts || {}
  const delivered = (counts.delivered ?? 0) + (counts.read ?? 0)
  return `sent ${counts.sent ?? 0} · delivered ${delivered} · read ${counts.read ?? 0} · failed ${counts.failed ?? 0}`
}

export function PlatformWhatsAppCampaignsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [platformReady, setPlatformReady] = useState<boolean | null>(null)
  const [campaigns, setCampaigns] = useState<PlatformWhatsAppCampaign[]>([])
  const [summary, setSummary] = useState<PlatformCampaignsSummaryReport | null>(null)
  const [templates, setTemplates] = useState<PlatformWhatsAppTemplate[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reportCampaign, setReportCampaign] = useState<PlatformWhatsAppCampaign | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [audiencePreviewLoading, setAudiencePreviewLoading] = useState(false)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [excludeOptOut, setExcludeOptOut] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string[]>(["new", "follow-up"])
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({})

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === templateId) || null,
    [templates, templateId]
  )

  const placeholders = useMemo(
    () => findPlaceholders(selectedTemplate?.components?.body?.text),
    [selectedTemplate]
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [status, list, tpls, summaryReport] = await Promise.all([
        AdminPlatformWhatsAppInboxAPI.status(),
        AdminPlatformWhatsAppCampaignsAPI.list(),
        AdminPlatformWhatsAppCampaignsAPI.templates(),
        AdminPlatformWhatsAppCampaignsAPI.summaryReport().catch(() => null),
      ])
      setPlatformReady(status.platformConfigured)
      setCampaigns(list)
      setTemplates(tpls)
      setSummary(summaryReport)
    } catch (err) {
      toast({
        title: "Could not load campaigns",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 10000)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!dialogOpen) {
      setAudienceCount(null)
      setAudiencePreviewLoading(false)
      return
    }
    if (statusFilter.length === 0) {
      setAudienceCount(null)
      setAudiencePreviewLoading(false)
      return
    }

    setAudiencePreviewLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const data = await AdminPlatformWhatsAppCampaignsAPI.previewAudienceFilters(
          {
            statuses: statusFilter,
            excludeMarketingOptOut: excludeOptOut,
          },
          "segment"
        )
        setAudienceCount(data.count)
      } catch {
        setAudienceCount(null)
      } finally {
        setAudiencePreviewLoading(false)
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [dialogOpen, statusFilter, excludeOptOut])

  useEffect(() => {
    const next: Record<string, string> = {}
    placeholders.forEach((idx) => {
      const key = `body_${idx}`
      next[key] = variableMapping[key] || (idx === 1 ? "firstName" : "name")
    })
    setVariableMapping(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, placeholders.join(",")])

  function resetForm() {
    setName("")
    setDescription("")
    setTemplateId("")
    setExcludeOptOut(true)
    setStatusFilter(["new", "follow-up"])
    setVariableMapping({})
    setPreviewCount(null)
    setAudienceCount(null)
  }

  async function handleCreate() {
    if (!name.trim() || !templateId) {
      toast({ title: "Name and template are required", variant: "destructive" })
      return
    }
    if (statusFilter.length === 0) {
      toast({ title: "Select at least one lead status", variant: "destructive" })
      return
    }
    setBusy("create")
    try {
      const campaign = await AdminPlatformWhatsAppCampaignsAPI.create({
        name: name.trim(),
        description,
        templateId,
        audienceType: "segment",
        audienceFilters: {
          statuses: statusFilter,
          excludeMarketingOptOut: excludeOptOut,
        },
        variableMapping,
      })
      toast({ title: "Campaign created" })
      setDialogOpen(false)
      resetForm()
      await refresh()
      return campaign
    } catch (err) {
      toast({
        title: "Create failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  async function previewAudience(campaignId: string) {
    setBusy(`preview-${campaignId}`)
    try {
      const data = await AdminPlatformWhatsAppCampaignsAPI.previewRecipients(campaignId)
      setPreviewCount(data.count)
      toast({ title: "Audience preview", description: `${data.count} lead(s) matched` })
    } catch (err) {
      toast({
        title: "Preview failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  async function sendCampaign(campaignId: string) {
    setBusy(`send-${campaignId}`)
    try {
      await AdminPlatformWhatsAppCampaignsAPI.send(campaignId)
      toast({ title: "Campaign started", description: "Sending in the background." })
      await refresh()
    } catch (err) {
      toast({
        title: "Send failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  async function cancelCampaign(campaignId: string) {
    setBusy(`cancel-${campaignId}`)
    try {
      await AdminPlatformWhatsAppCampaignsAPI.cancel(campaignId)
      toast({ title: "Campaign cancelled" })
      await refresh()
    } catch (err) {
      toast({
        title: "Cancel failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  if (platformReady === false) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <Megaphone className="h-10 w-10 mx-auto text-slate-400" />
          <div>
            <h2 className="text-lg font-semibold">Platform WhatsApp not configured</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Configure the shared Gupshup app and approve marketing templates before sending campaigns.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin/settings?tab=system">
              <Settings className="h-4 w-4 mr-2" />
              Open settings
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Bulk messaging to platform leads using approved templates on the shared WhatsApp number.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            New campaign
          </Button>
        </div>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Campaigns</p>
              <p className="text-2xl font-semibold">{summary.totals.campaigns}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Messages sent</p>
              <p className="text-2xl font-semibold">{summary.totals.attempted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Delivered</p>
              <p className="text-2xl font-semibold">
                {summary.totals.delivered + summary.totals.read}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.totals.deliveryRate.toFixed(1)}% rate
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Read</p>
              <p className="text-2xl font-semibold">{summary.totals.read}</p>
              <p className="text-xs text-muted-foreground">
                {summary.totals.readRate.toFixed(1)}% of delivered
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-2xl font-semibold">{summary.totals.failed}</p>
              <p className="text-xs text-muted-foreground">
                {summary.totals.failureRate.toFixed(1)}% rate
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaigns</CardTitle>
          <CardDescription>
            Audience is drawn from Lead Management. Use Chat to handle replies in parallel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No campaigns yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => setReportCampaign(c)}
                      >
                        {c.name}
                      </button>
                      {c.failureReason ? (
                        <p className="text-xs text-red-600 font-normal mt-0.5 max-w-[220px] truncate" title={c.failureReason}>
                          {c.failureReason}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell>{c.recipientCount ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {progressSummary(c)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.createdAt ? format(new Date(c.createdAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Performance report"
                        onClick={() => setReportCampaign(c)}
                        disabled={!!busy}
                      >
                        <BarChart3 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => previewAudience(c._id)}
                        disabled={!!busy}
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                      {["draft", "scheduled"].includes(c.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => sendCampaign(c._id)}
                          disabled={!!busy}
                        >
                          {busy === `send-${c._id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      {["queued", "sending", "scheduled"].includes(c.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelCampaign(c._id)}
                          disabled={!!busy}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New platform campaign</DialogTitle>
            <DialogDescription>
              Target platform leads with an approved template. Replies appear in WhatsApp Chat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Campaign name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="March demo follow-up" />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Approved platform template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name} · {t.category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Lead statuses</Label>
                {statusFilter.length > 0 && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    {audiencePreviewLoading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Counting…
                      </>
                    ) : audienceCount != null ? (
                      <>
                        <Users className="h-3 w-3" />
                        <span className="font-medium text-foreground">{audienceCount}</span>
                        lead{audienceCount === 1 ? "" : "s"} with a valid phone
                      </>
                    ) : null}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {LEAD_STATUSES.map((s) => {
                  const active = statusFilter.includes(s)
                  return (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() =>
                        setStatusFilter((prev) =>
                          active ? prev.filter((x) => x !== s) : [...prev, s]
                        )
                      }
                    >
                      {s}
                    </Button>
                  )
                })}
              </div>
              {statusFilter.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5">
                  Select at least one lead status to define your audience.
                </p>
              ) : audienceCount === 0 && !audiencePreviewLoading ? (
                <p className="text-xs text-muted-foreground">
                  No leads match these filters (or none have a valid phone number).
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Exclude marketing opt-outs</p>
                <p className="text-xs text-muted-foreground">Leads who replied STOP</p>
              </div>
              <Switch checked={excludeOptOut} onCheckedChange={setExcludeOptOut} />
            </div>

            {placeholders.length > 0 && (
              <div className="space-y-2">
                <Label>Template variables</Label>
                {placeholders.map((idx) => (
                  <div key={idx} className="grid grid-cols-[80px_1fr] gap-2 items-center">
                    <span className="text-xs text-muted-foreground">{`{{${idx}}}`}</span>
                    <Select
                      value={variableMapping[`body_${idx}`] || "firstName"}
                      onValueChange={(v) =>
                        setVariableMapping((prev) => ({ ...prev, [`body_${idx}`]: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_OPTIONS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            {previewCount != null && (
              <p className="text-sm text-muted-foreground">Last preview: {previewCount} recipients</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={busy === "create"}>
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlatformWhatsAppCampaignReportDialog
        campaignId={reportCampaign?._id ?? null}
        campaignName={reportCampaign?.name}
        open={!!reportCampaign}
        onOpenChange={(open) => {
          if (!open) setReportCampaign(null)
        }}
      />
    </div>
  )
}
