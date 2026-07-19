"use client"

import { useEffect, useMemo, useState } from "react"
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
import { useToast } from "@/components/ui/use-toast"
import { WhatsAppCampaignsAPI, WhatsAppGupshupAPI, WhatsAppTemplatesAPI, ClientSegmentRulesAPI, ServicesAPI, ProductsAPI } from "@/lib/api"
import {
  CampaignAudienceFiltersPanel,
  DEFAULT_CAMPAIGN_AUDIENCE_FILTERS,
  campaignAudienceFiltersToPayload,
  normalizeCampaignAudienceFilters,
  type CampaignAudienceFilters,
  type CatalogOption,
} from "@/components/whatsapp/campaigns/campaign-audience-filters"
import {
  DEFAULT_CLIENT_SEGMENT_RULES,
  type ClientSegmentRules,
} from "@/lib/client-segments"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Megaphone,
  PlusCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
  Users,
  XCircle,
} from "lucide-react"
import { format } from "date-fns"

/* ----------------------------- types ----------------------------- */

type Template = {
  _id: string
  name: string
  status: string
  language: string
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION"
  components?: any
}

type Campaign = {
  _id: string
  name: string
  description?: string
  status: string
  recipientCount?: number
  counts?: { queued: number; sent: number; delivered: number; read: number; failed: number }
  templateId?: string
  scheduledAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  failureReason?: string | null
  createdAt?: string
}

type CampaignType = "marketing" | "utility"

const TYPE_OPTIONS: Array<{
  id: CampaignType
  label: string
  description: string
  templateCategory: Template["category"]
  icon: any
}> = [
  {
    id: "marketing",
    label: "Marketing campaign",
    description: "Promotional offers, announcements, re-engagement.",
    templateCategory: "MARKETING",
    icon: Megaphone,
  },
  {
    id: "utility",
    label: "Utility broadcast",
    description: "Non-promotional updates (e.g. policy, holidays, schedule changes).",
    templateCategory: "UTILITY",
    icon: ShieldCheck,
  },
]

const STEPS = ["Type", "Audience", "Template", "Variables", "Preview", "Send"] as const

/* ----------------------------- status visuals ----------------------------- */

const STATUS_LOOK: Record<string, { label: string; cls: string; icon: any }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700", icon: FileText },
  scheduled: { label: "Scheduled", cls: "bg-indigo-100 text-indigo-700", icon: CalendarClock },
  queued: { label: "Queued", cls: "bg-amber-100 text-amber-700", icon: Clock },
  sending: { label: "Sending", cls: "bg-amber-100 text-amber-700", icon: Loader2 },
  sent: { label: "Completed", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700", icon: XCircle },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600", icon: Square },
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LOOK[status] || STATUS_LOOK.draft
  const Icon = meta.icon
  const spin = status === "sending"
  return (
    <Badge className={`${meta.cls} border border-transparent`}>
      <Icon className={`h-3 w-3 mr-1 ${spin ? "animate-spin" : ""}`} />
      {meta.label}
    </Badge>
  )
}

/* ----------------------------- variable detection ----------------------------- */

function findPlaceholders(text: string | undefined | null): number[] {
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

/* ----------------------------- main page ----------------------------- */

export function WhatsAppCampaignsPage() {
  const { toast } = useToast()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showBuilder, setShowBuilder] = useState(false)
  /**
   * If the backend returns 403 with `code === 'WABA_ADDON_DISABLED'`, the
   * salon's plan doesn't include the new Meta module yet. We render a
   * dedicated empty state instead of letting the table look empty/broken.
   */
  const [addonDisabled, setAddonDisabled] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const res = await WhatsAppCampaignsAPI.list()
      if (res.success) {
        setCampaigns(res.data || [])
        setAddonDisabled(false)
      }
    } catch (err: any) {
      const status = err?.response?.status
      const code = err?.response?.data?.code
      if (status === 403 && code === "WABA_ADDON_DISABLED") {
        setAddonDisabled(true)
        setCampaigns([])
      } else {
        console.error("[whatsapp-campaigns] list failed:", err)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  /**
   * Lightweight live polling for campaigns that are actively sending or
   * scheduled to fire soon. This refreshes the table every 8s so the
   * sent/delivered/read counters move in near-real-time without a
   * websocket. Polling stops automatically when nothing is in-flight.
   */
  useEffect(() => {
    const inFlight = campaigns.some((c) =>
      ["queued", "sending", "scheduled"].includes(c.status)
    )
    if (!inFlight) return
    const t = setInterval(() => refresh(), 8000)
    return () => clearInterval(t)
  }, [campaigns])

  const handleCancel = async (c: Campaign) => {
    if (!confirm(`Cancel "${c.name}"? In-flight messages already sent to Meta cannot be recalled.`)) return
    setBusy(`cancel-${c._id}`)
    try {
      const res = await WhatsAppCampaignsAPI.cancel(c._id)
      if (res.success) {
        toast({ title: "Campaign cancelled" })
        refresh()
      } else {
        toast({ title: "Cancel failed", description: String(res.error || ""), variant: "destructive" })
      }
    } catch (err: any) {
      toast({
        title: "Cancel failed",
        description: err?.response?.data?.error || err?.message || "",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="bg-gradient-to-r from-emerald-50 via-indigo-50 to-purple-50 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <Megaphone className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800 mb-1">WhatsApp Campaigns</h1>
              <p className="text-slate-600 text-base">
                Step-by-step builder. Sends are limited to opted-in clients and approved templates.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={refresh} className="border-slate-200">
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <Button
              onClick={() => setShowBuilder(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={addonDisabled}
              title={addonDisabled ? "Enable the WABA Integration add-on first" : undefined}
            >
              <PlusCircle className="h-4 w-4 mr-2" /> New Campaign
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All campaigns</CardTitle>
          <CardDescription>
            Counters update live as Meta delivery webhooks come in. The list refreshes every 8 seconds while a campaign is in-flight.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={6} columns={5} />
          ) : addonDisabled ? (
            <div className="py-12 px-4 text-center">
              <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-slate-50/60 p-6">
                <Megaphone className="h-10 w-10 mx-auto text-slate-400 mb-3" />
                <p className="text-base font-semibold text-slate-800">
                  WABA Integration add-on is not enabled
                </p>
                <p className="text-sm text-slate-600 mt-2">
                  WhatsApp Campaigns require the <span className="font-medium">WABA Integration</span> add-on.
                  Ask your platform admin to enable it under <span className="font-medium">Admin → Plan Management</span>{" "}
                  for this business. Until then, the new campaign builder, templates, and inbox stay locked.
                </p>
              </div>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Megaphone className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              No campaigns yet. Click <em>New Campaign</em> to send your first WhatsApp blast.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Read</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const totalSent = c.counts?.sent ?? 0
                  const delivered = c.counts?.delivered ?? 0
                  const read = c.counts?.read ?? 0
                  const failed = c.counts?.failed ?? 0
                  const deliveryRate =
                    totalSent > 0 ? Math.round((delivered / totalSent) * 100) : null
                  const readRate =
                    delivered > 0 ? Math.round((read / delivered) * 100) : null
                  const cancellable = ["draft", "scheduled", "queued", "sending"].includes(c.status)
                  return (
                    <TableRow key={c._id}>
                      <TableCell>
                        <div className="font-medium text-slate-800">{c.name}</div>
                        {c.description && (
                          <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                            {c.description}
                          </div>
                        )}
                        {c.failureReason && (
                          <div className="text-xs text-red-600 mt-0.5">
                            {c.failureReason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell>
                        {c.scheduledAt ? (
                          <span className="text-xs text-slate-600">
                            {format(new Date(c.scheduledAt), "dd MMM, HH:mm")}
                          </span>
                        ) : c.completedAt ? (
                          <span className="text-xs text-slate-400">
                            done {format(new Date(c.completedAt), "dd MMM, HH:mm")}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>{c.recipientCount ?? 0}</TableCell>
                      <TableCell>{totalSent}</TableCell>
                      <TableCell>
                        <div className="flex items-baseline gap-1">
                          <span>{delivered}</span>
                          {deliveryRate !== null && (
                            <span className="text-[10px] text-slate-400">{deliveryRate}%</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-baseline gap-1">
                          <span>{read}</span>
                          {readRate !== null && (
                            <span className="text-[10px] text-slate-400">{readRate}%</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={failed ? "text-red-600 font-medium" : ""}>
                        {failed}
                      </TableCell>
                      <TableCell className="text-right">
                        {cancellable && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            disabled={busy === `cancel-${c._id}`}
                            onClick={() => handleCancel(c)}
                          >
                            {busy === `cancel-${c._id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Square className="h-3 w-3" />
                            )}
                            <span className="ml-1">Cancel</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CampaignBuilder
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        onCreated={refresh}
      />
    </div>
  )
}

/* ----------------------------- builder dialog ----------------------------- */

function CampaignBuilder({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { toast } = useToast()
  const [step, setStep] = useState(0)

  // Step 0
  const [campaignType, setCampaignType] = useState<CampaignType>("marketing")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  // Step 1
  const [audienceType, setAudienceType] = useState<"all_optin" | "segment" | "custom">("all_optin")
  const [filters, setFilters] = useState<CampaignAudienceFilters>(DEFAULT_CAMPAIGN_AUDIENCE_FILTERS)
  const [segmentRules, setSegmentRules] = useState<ClientSegmentRules>(DEFAULT_CLIENT_SEGMENT_RULES)
  const [catalogServices, setCatalogServices] = useState<CatalogOption[]>([])
  const [catalogProducts, setCatalogProducts] = useState<CatalogOption[]>([])
  const [customPhones, setCustomPhones] = useState("")

  // Step 2
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState("")

  // Step 3
  const [variableMapping, setVariableMapping] = useState<
    Record<string, { source: string; value?: string }>
  >({})

  // Step 4
  const [preview, setPreview] = useState<{ count: number; excludedOptOut?: number; sample: any[] } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Step 5
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now")
  const [scheduleAt, setScheduleAt] = useState<string>("") // datetime-local string

  // Compliance
  const [compliance, setCompliance] = useState<any>(null)

  // Persisted draft
  const [savedCampaign, setSavedCampaign] = useState<Campaign | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setCampaignType("marketing")
    setName("")
    setDescription("")
    setAudienceType("all_optin")
    setFilters(DEFAULT_CAMPAIGN_AUDIENCE_FILTERS)
    setCustomPhones("")
    setTemplateId("")
    setVariableMapping({})
    setPreview(null)
    setSavedCampaign(null)
    setSendMode("now")
    setScheduleAt("")
    WhatsAppGupshupAPI.getCompliance()
      .then((r) => r.success && setCompliance(r.data))
      .catch(() => {})
    ClientSegmentRulesAPI.get()
      .then((r) => {
        if (r.success && r.data) setSegmentRules(r.data)
      })
      .catch(() => {})
    Promise.all([
      ServicesAPI.getAll({ limit: 2000 }),
      ProductsAPI.getAll({ limit: 2000 }),
    ])
      .then(([servicesRes, productsRes]) => {
        if (servicesRes.success && Array.isArray(servicesRes.data)) {
          setCatalogServices(
            servicesRes.data
              .map((s: any) => ({ _id: String(s._id), name: String(s.name || "").trim() }))
              .filter((s: CatalogOption) => s._id && s.name)
              .sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
        if (productsRes.success && Array.isArray(productsRes.data)) {
          setCatalogProducts(
            productsRes.data
              .map((p: any) => ({ _id: String(p._id), name: String(p.name || "").trim() }))
              .filter((p: CatalogOption) => p._id && p.name)
              .sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
      })
      .catch(() => {})
  }, [open])

  // Re-fetch templates each time the campaign type changes so the picker
  // only shows templates that match the campaign type's required category.
  useEffect(() => {
    if (!open) return
    const cat = TYPE_OPTIONS.find((t) => t.id === campaignType)?.templateCategory
    WhatsAppTemplatesAPI.list({ status: "approved" })
      .then((r) => {
        if (!r.success) return
        const filtered = (r.data || []).filter((t: Template) => !cat || t.category === cat)
        setTemplates(filtered)
        // Clear template selection if it no longer matches the type filter.
        if (templateId && !filtered.find((t: Template) => t._id === templateId)) {
          setTemplateId("")
          setVariableMapping({})
        }
      })
      .catch(() => {})
  }, [open, campaignType])

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === templateId) || null,
    [templates, templateId]
  )

  const headerPlaceholders = useMemo(() => {
    const h = selectedTemplate?.components?.header
    if (!h || h.format !== "TEXT") return []
    return findPlaceholders(h.text)
  }, [selectedTemplate])

  const bodyPlaceholders = useMemo(
    () => findPlaceholders(selectedTemplate?.components?.body?.text),
    [selectedTemplate]
  )

  /**
   * Persist (or update) the draft on the backend BEFORE preview, so the
   * /preview endpoint has a real campaign id to resolve audience for. We
   * keep the campaign in `draft` status until the operator hits send.
   */
  const ensureSavedCampaign = async () => {
    const audienceFilters: Record<string, unknown> =
      audienceType === "segment" ? campaignAudienceFiltersToPayload(filters) : {}
    if (audienceType === "custom") {
      const list = customPhones
        .split(/[\n,]+/)
        .map((p) => p.trim())
        .filter(Boolean)
      audienceFilters.phoneList = list
    }
    const payload = {
      name,
      description,
      templateId,
      audienceType,
      audienceFilters,
      variableMapping,
    }
    if (savedCampaign) {
      const res = await WhatsAppCampaignsAPI.update(savedCampaign._id, payload)
      if (!res.success) throw new Error(typeof res.error === "string" ? res.error : "Failed to update campaign")
      setSavedCampaign(res.data)
      return res.data
    }
    const res = await WhatsAppCampaignsAPI.create(payload)
    if (!res.success) throw new Error(typeof res.error === "string" ? res.error : "Failed to save campaign")
    setSavedCampaign(res.data)
    return res.data
  }

  const goNext = async () => {
    if (step === STEPS.length - 1) return
    if (step === 3) {
      // Save draft + preview before showing the preview step.
      try {
        setLoadingPreview(true)
        const campaign = await ensureSavedCampaign()
        const p = await WhatsAppCampaignsAPI.preview(campaign._id)
        if (!p.success) throw new Error(typeof p.error === "string" ? p.error : "Preview failed")
        setPreview(p.data)
      } catch (e: any) {
        toast({
          title: "Could not preview audience",
          description: e?.response?.data?.error || e?.message || "",
          variant: "destructive",
        })
        return
      } finally {
        setLoadingPreview(false)
      }
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const goPrev = () => setStep((s) => Math.max(0, s - 1))

  const handleFinalize = async () => {
    if (!savedCampaign) return
    setSubmitting(true)
    try {
      if (sendMode === "schedule") {
        if (!scheduleAt) throw new Error("Pick a date/time")
        const when = new Date(scheduleAt)
        if (when.getTime() <= Date.now() + 30_000) {
          throw new Error("Schedule time must be at least 30 seconds in the future")
        }
        const res = await WhatsAppCampaignsAPI.schedule(savedCampaign._id, when.toISOString())
        if (!res.success) throw new Error(typeof res.error === "string" ? res.error : "Schedule failed")
        toast({
          title: "Campaign scheduled",
          description: `Will fire at ${format(when, "dd MMM, HH:mm")}`,
        })
      } else {
        const res = await WhatsAppCampaignsAPI.send(savedCampaign._id)
        if (!res.success) throw new Error(typeof res.error === "string" ? res.error : "Send failed")
        toast({ title: "Campaign queued", description: `${res.data?.recipientCount} recipients` })
      }
      onClose()
      onCreated()
    } catch (e: any) {
      toast({
        title: "Action failed",
        description: e?.response?.data?.error || e?.message || "",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  /* ----- per-step gates ----- */
  const canNext = (() => {
    if (step === 0) return Boolean(name.trim())
    if (step === 1) {
      if (audienceType === "custom") {
        return customPhones.split(/[\n,]+/).filter((p) => p.trim()).length > 0
      }
      return true
    }
    if (step === 2) return Boolean(templateId)
    if (step === 3) {
      // Every variable needs either a non-empty literal or a non-literal source.
      const allKeys = [
        ...headerPlaceholders.map((n) => `h${n}`),
        ...bodyPlaceholders.map(String),
      ]
      return allKeys.every((k) => {
        const m = variableMapping[k]
        if (!m) return false
        if (m.source === "literal") return Boolean((m.value || "").trim())
        return true
      })
    }
    if (step === 4) return Boolean(preview && preview.count > 0)
    return true
  })()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New WhatsApp Campaign</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-2 text-xs px-3 py-1 rounded-full whitespace-nowrap ${
                i === step
                  ? "bg-emerald-600 text-white"
                  : i < step
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {i < step && <CheckCircle2 className="h-3 w-3" />} {s}
            </div>
          ))}
        </div>

        {/* Step 0 — Type + name */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <Label>Campaign type</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                {TYPE_OPTIONS.map((t) => {
                  const Icon = t.icon
                  const active = campaignType === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCampaignType(t.id)}
                      className={`text-left p-4 rounded-xl border transition ${
                        active
                          ? "border-emerald-500 bg-emerald-50/60 shadow-sm"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          className={`h-4 w-4 ${active ? "text-emerald-600" : "text-slate-400"}`}
                        />
                        <span className="font-medium text-slate-800">{t.label}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{t.description}</p>
                      <p className="text-[10px] text-slate-400 mt-2">
                        Picks templates with category {t.templateCategory}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <Label>Campaign name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Diwali offer 2026"
              />
            </div>
            <div>
              <Label>Internal description (optional)</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Visible only to staff."
              />
            </div>
            {compliance && Array.isArray(compliance.items) && (
              <Card className="bg-emerald-50/40 border-emerald-100">
                <CardContent className="pt-4 text-sm space-y-2">
                  <p className="flex items-center gap-2 font-medium text-emerald-800">
                    <ShieldCheck className="h-4 w-4" /> Pre-flight checks
                  </p>
                  <ul className="space-y-1">
                    {compliance.items.map((it: any, idx: number) => (
                      <li
                        key={idx}
                        className={`flex items-start gap-2 ${
                          it.ok ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        <span>{it.ok ? "✔" : "•"}</span>
                        {it.label}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Step 1 — Audience */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Audience source</Label>
              <Select
                value={audienceType}
                onValueChange={(v: "all_optin" | "segment" | "custom") => {
                  setAudienceType(v)
                  if (v === "segment") {
                    setFilters((prev) => normalizeCampaignAudienceFilters(prev))
                  } else {
                    setFilters(DEFAULT_CAMPAIGN_AUDIENCE_FILTERS)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_optin">All opted-in clients</SelectItem>
                  <SelectItem value="segment">Filtered segment</SelectItem>
                  <SelectItem value="custom">Custom phone list</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                {audienceType === "all_optin"
                  ? "Every client with WhatsApp promo enabled and no marketing opt-out."
                  : audienceType === "segment"
                  ? "Narrow the list with CRM filters — segments, spend, visits, purchase history, and more."
                  : "Upload a specific list of phone numbers."}
              </p>
            </div>

            {audienceType === "segment" && (
              <CampaignAudienceFiltersPanel
                filters={filters}
                onChange={setFilters}
                segmentRules={segmentRules}
                services={catalogServices}
                products={catalogProducts}
              />
            )}

            {audienceType === "custom" && (
              <div>
                <Label>Phone numbers (one per line, or comma-separated)</Label>
                <Textarea
                  rows={5}
                  value={customPhones}
                  onChange={(e) => setCustomPhones(e.target.value)}
                  placeholder={`9876543210\n9988776655\n…`}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Numbers must match how they're stored on client records. Numbers without
                  matching opted-in clients will be skipped.
                </p>
              </div>
            )}

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
              <Users className="h-4 w-4 mt-0.5" />
              <div>
                <strong>Compliance:</strong> only clients with{" "}
                <code>whatsappConsent.optedIn = true</code> AND no Meta-level marketing
                opt-out will receive this campaign. Anyone who replied <code>STOP</code>{" "}
                or hit "Stop promotions" inside WhatsApp is excluded automatically.
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Template */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Showing approved templates with category{" "}
              <code>{TYPE_OPTIONS.find((t) => t.id === campaignType)?.templateCategory}</code>.
            </p>
            {templates.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                No approved templates match this type. Submit a template under category{" "}
                <code>{TYPE_OPTIONS.find((t) => t.id === campaignType)?.templateCategory}</code>{" "}
                and wait for Meta approval, or change the campaign type.
              </div>
            ) : (
              templates.map((t) => (
                <div
                  key={t._id}
                  className={`p-3 rounded-lg border cursor-pointer transition ${
                    templateId === t._id
                      ? "border-emerald-500 bg-emerald-50/50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() => setTemplateId(t._id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-800">{t.name}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{t.category}</Badge>
                      <Badge variant="outline" className="text-xs">
                        {t.language}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                    {t.components?.body?.text || ""}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Step 3 — Variables */}
        {step === 3 && (
          <div className="space-y-4">
            {headerPlaceholders.length === 0 && bodyPlaceholders.length === 0 ? (
              <p className="text-sm text-slate-600">
                This template has no variables. Click Next to preview the audience.
              </p>
            ) : (
              <>
                {headerPlaceholders.length > 0 && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-slate-500">
                      Header variables
                    </Label>
                    <div className="space-y-2 mt-1">
                      {headerPlaceholders.map((n) => (
                        <VariableRow
                          key={`h${n}`}
                          mappingKey={`h${n}`}
                          label={`Header {{${n}}}`}
                          value={variableMapping[`h${n}`]}
                          onChange={(v) =>
                            setVariableMapping({ ...variableMapping, [`h${n}`]: v })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
                {bodyPlaceholders.length > 0 && (
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-slate-500">
                      Body variables
                    </Label>
                    <div className="space-y-2 mt-1">
                      {bodyPlaceholders.map((n) => (
                        <VariableRow
                          key={String(n)}
                          mappingKey={String(n)}
                          label={`Body {{${n}}}`}
                          value={variableMapping[String(n)]}
                          onChange={(v) =>
                            setVariableMapping({ ...variableMapping, [String(n)]: v })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 4 — Preview */}
        {step === 4 && (
          <div className="space-y-3">
            {loadingPreview && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Resolving audience…
              </div>
            )}
            {preview && (
              <>
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-baseline gap-3">
                      <p className="text-3xl font-bold text-emerald-700">
                        {preview.count}
                      </p>
                      <p className="text-sm text-slate-600">
                        opted-in clients will receive this campaign
                      </p>
                    </div>
                    {(preview.excludedOptOut || 0) > 0 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 flex items-start gap-2">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
                        <span>
                          {preview.excludedOptOut} client(s) excluded because they hit
                          "Stop promotions" inside WhatsApp.
                        </span>
                      </div>
                    )}
                    <div className="rounded-md border border-slate-200 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sample recipients</TableHead>
                            <TableHead>Phone</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.sample.slice(0, 10).map((r, i) => (
                            <TableRow key={i}>
                              <TableCell>{r.name || "—"}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {r.phone}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
                {selectedTemplate && (
                  <Card>
                    <CardContent className="pt-4">
                      <Label className="text-xs text-slate-500 mb-2 block">
                        Rendered preview (first sample recipient)
                      </Label>
                      <RenderedTemplatePreview
                        template={selectedTemplate}
                        variableMapping={variableMapping}
                        sampleRecipient={preview.sample[0] || { name: "Asha", phone: "9876543210" }}
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 5 — Send / Schedule */}
        {step === 5 && (
          <div className="space-y-4">
            <Card className="bg-emerald-50/40 border-emerald-100">
              <CardContent className="pt-4 space-y-2 text-sm">
                <p>
                  <span className="text-slate-500">Campaign:</span>{" "}
                  <span className="font-medium">{name}</span>
                </p>
                <p>
                  <span className="text-slate-500">Type:</span>{" "}
                  <span className="font-medium">
                    {TYPE_OPTIONS.find((t) => t.id === campaignType)?.label}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Recipients:</span>{" "}
                  <span className="font-medium">{preview?.count ?? 0}</span>
                </p>
                <p>
                  <span className="text-slate-500">Template:</span>{" "}
                  <span className="font-medium">{selectedTemplate?.name}</span>
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSendMode("now")}
                className={`text-left p-4 rounded-xl border transition ${
                  sendMode === "now"
                    ? "border-emerald-500 bg-emerald-50/60"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Send
                    className={`h-4 w-4 ${
                      sendMode === "now" ? "text-emerald-600" : "text-slate-400"
                    }`}
                  />
                  <span className="font-medium">Send now</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Starts dispatch immediately. Wallet is debited per delivered recipient.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSendMode("schedule")}
                className={`text-left p-4 rounded-xl border transition ${
                  sendMode === "schedule"
                    ? "border-emerald-500 bg-emerald-50/60"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CalendarClock
                    className={`h-4 w-4 ${
                      sendMode === "schedule" ? "text-emerald-600" : "text-slate-400"
                    }`}
                  />
                  <span className="font-medium">Schedule for later</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Cron picks it up at the chosen time. Cancellable until then.
                </p>
              </button>
            </div>

            {sendMode === "schedule" && (
              <div>
                <Label>Run at</Label>
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Times are in your local timezone. Schedule must be at least 30 seconds
                  in the future.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {step > 0 && (
            <Button variant="outline" onClick={goPrev}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {step < STEPS.length - 1 && (
            <Button
              onClick={goNext}
              disabled={!canNext || loadingPreview}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {loadingPreview ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 ml-1" />
              )}
              Next
            </Button>
          )}
          {step === STEPS.length - 1 && (
            <Button
              onClick={handleFinalize}
              disabled={
                submitting || !savedCampaign || (sendMode === "schedule" && !scheduleAt)
              }
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : sendMode === "schedule" ? (
                <CalendarClock className="h-4 w-4 mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {sendMode === "schedule" ? "Schedule" : "Send now"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------- variable row ----------------------------- */

function VariableRow({
  mappingKey,
  label,
  value,
  onChange,
}: {
  mappingKey: string
  label: string
  value?: { source: string; value?: string }
  onChange: (v: { source: string; value?: string }) => void
}) {
  const current = value || { source: "client_name" }
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
      <div className="md:col-span-1">
        <Label className="text-xs">{label}</Label>
        <Select
          value={current.source}
          onValueChange={(v) => onChange({ ...current, source: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="client_name">Client name</SelectItem>
            <SelectItem value="client_phone">Client phone</SelectItem>
            <SelectItem value="literal">Static value</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {current.source === "literal" ? (
        <div className="md:col-span-2">
          <Label className="text-xs">Value</Label>
          <Input
            value={current.value || ""}
            onChange={(e) => onChange({ ...current, value: e.target.value })}
            placeholder="e.g. 25% off"
          />
        </div>
      ) : (
        <div className="md:col-span-2 text-xs text-slate-500 pb-2">
          Substituted per recipient at send time.
        </div>
      )}
    </div>
  )
}

/* ----------------------------- rendered preview ----------------------------- */

function RenderedTemplatePreview({
  template,
  variableMapping,
  sampleRecipient,
}: {
  template: Template
  variableMapping: Record<string, { source: string; value?: string }>
  sampleRecipient: { name?: string; phone?: string }
}) {
  function resolve(map: { source: string; value?: string } | undefined) {
    if (!map) return sampleRecipient.name || ""
    if (map.source === "literal") return map.value || ""
    if (map.source === "client_phone") return sampleRecipient.phone || ""
    return sampleRecipient.name || ""
  }

  function substitute(text: string | undefined, prefix = "") {
    if (!text) return ""
    return text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
      const key = prefix ? `${prefix}${n}` : String(n)
      return resolve(variableMapping[key]) || `{{${n}}}`
    })
  }

  const headerText = substitute(template.components?.header?.text, "h")
  const bodyText = substitute(template.components?.body?.text)
  const footerText = template.components?.footer?.text || ""
  const buttons = template.components?.buttons || []

  return (
    <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 p-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {template.components?.header && (
          <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-800">
            {template.components.header.format === "TEXT"
              ? headerText
              : `${String(template.components.header.format || "").toLowerCase()} header`}
          </div>
        )}
        <div className="px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap">
          {bodyText || <span className="text-slate-400">Empty body</span>}
        </div>
        {footerText && <div className="px-4 pb-3 text-xs text-slate-500">{footerText}</div>}
        {buttons.length > 0 && (
          <div className="border-t border-slate-100 divide-y divide-slate-100">
            {buttons.map((b: any, i: number) => (
              <div key={i} className="px-4 py-2.5 text-sm text-emerald-700 text-center font-medium">
                {b.text || `Button ${i + 1}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
