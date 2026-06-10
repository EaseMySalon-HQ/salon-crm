"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { WhatsAppTemplatesAPI } from "@/lib/api"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CloudDownload,
  FileText,
  Image as ImageIcon,
  Loader2,
  PlusCircle,
  RefreshCw,
  Send,
  Star,
  Trash2,
  XCircle,
} from "lucide-react"
import { format } from "date-fns"

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const
type Category = (typeof CATEGORIES)[number]

const HEADER_FORMATS = ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"] as const
type HeaderFormat = (typeof HEADER_FORMATS)[number]

const BUTTON_TYPES = ["QUICK_REPLY", "URL", "PHONE_NUMBER"] as const
type ButtonType = (typeof BUTTON_TYPES)[number]

/**
 * Curated locales — Meta accepts ~70 but these are the ones a salon CRM is
 * realistically going to need. Use a free-form Input fallback for the rest.
 */
const LOCALES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi" },
  { code: "hi_IN", label: "Hindi (India)" },
  { code: "mr_IN", label: "Marathi (India)" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "gu", label: "Gujarati" },
  { code: "bn", label: "Bengali" },
  { code: "pa", label: "Punjabi" },
  { code: "ar", label: "Arabic" },
  { code: "id", label: "Indonesian" },
  { code: "es", label: "Spanish" },
  { code: "es_ES", label: "Spanish (Spain)" },
  { code: "es_MX", label: "Spanish (Mexico)" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
] as const

/* ---------- types matching the backend's WhatsAppTemplate shape ---------- */

type WAButton = {
  type: ButtonType
  text: string
  url?: string | null
  phone?: string | null
}

type WAComponents = {
  header?: {
    format?: HeaderFormat | null
    text?: string | null
    mediaSampleUrl?: string | null
    examples?: string[]
  } | null
  body?: { text: string; examples?: string[][] } | null
  footer?: { text: string } | null
  buttons?: WAButton[]
}

type Template = {
  _id: string
  name: string
  language: string
  category: Category
  status: string
  rejectionReason?: string | null
  metaTemplateId?: string | null
  metaTemplateName?: string | null
  components?: WAComponents
  variables?: Record<string, any>
  samples?: Record<string, any>
  qualityScore?: string | null
  previousCategory?: string | null
  submittedAt?: string | null
  approvedAt?: string | null
  lastSyncedAt?: string | null
  updatedAt?: string
}

const STATUS_LOOK: Record<string, { label: string; cls: string; icon: any }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700", icon: FileText },
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-700", icon: Clock },
  in_appeal: { label: "In appeal", cls: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700", icon: XCircle },
  paused: { label: "Paused", cls: "bg-amber-100 text-amber-700", icon: AlertCircle },
  flagged: { label: "Flagged", cls: "bg-red-100 text-red-700", icon: AlertCircle },
  disabled: { label: "Disabled", cls: "bg-slate-100 text-slate-600", icon: XCircle },
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LOOK[status] || STATUS_LOOK.draft
  const Icon = meta.icon
  return (
    <Badge className={`${meta.cls} border border-transparent`}>
      <Icon className="h-3 w-3 mr-1" />
      {meta.label}
    </Badge>
  )
}

function QualityPill({ score }: { score?: string | null }) {
  if (!score) return null
  const s = String(score).toLowerCase()
  const cls =
    s === "green" || s === "high"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "yellow" || s === "medium"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200"
  return (
    <Badge variant="outline" className={`${cls} text-[10px]`}>
      <Star className="h-2.5 w-2.5 mr-0.5" /> {score}
    </Badge>
  )
}

/* ---------- variable detection helpers ---------- */

function findPlaceholders(text: string): number[] {
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

export function WhatsAppTemplatesPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  /**
   * Mirrors the WABA add-on gate from the backend. When 403/WABA_ADDON_DISABLED
   * is returned by `/api/whatsapp/v2/templates`, we render an empty-state card
   * so the table doesn't look mysteriously broken.
   */
  const [addonDisabled, setAddonDisabled] = useState(false)

  async function refresh() {
    try {
      setLoading(true)
      const params: any = {}
      if (statusFilter !== "all") params.status = statusFilter
      if (search.trim()) params.search = search.trim()
      const res = await WhatsAppTemplatesAPI.list(params)
      if (res.success) {
        setItems(res.data || [])
        setAddonDisabled(false)
      }
    } catch (e: any) {
      const status = e?.response?.status
      const code = e?.response?.data?.code
      if (status === 403 && code === "WABA_ADDON_DISABLED") {
        setAddonDisabled(true)
        setItems([])
      } else {
        console.error(e)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [statusFilter])

  const handleSubmit = async (id: string) => {
    setBusy(`submit-${id}`)
    try {
      const res = await WhatsAppTemplatesAPI.submit(id)
      if (res.success) {
        toast({
          title: "Submitted to Meta",
          description: "Status will update once Meta reviews the template.",
        })
        refresh()
      } else {
        const err = typeof res.error === "string" ? res.error : JSON.stringify(res.error)
        toast({ title: "Submission failed", description: err, variant: "destructive" })
      }
    } catch (err: any) {
      const apiErr = err?.response?.data
      const description =
        (typeof apiErr?.error === "string" ? apiErr.error : "") ||
        err?.message ||
        "Submission failed"
      toast({ title: "Submission failed", description, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const handleSync = async (id: string) => {
    setBusy(`sync-${id}`)
    try {
      const res = await WhatsAppTemplatesAPI.sync(id)
      if (res.success) {
        toast({ title: "Synced", description: `Status: ${res.data?.status}` })
        refresh()
      } else {
        toast({ title: "Sync failed", description: String(res.error || ""), variant: "destructive" })
      }
    } finally {
      setBusy(null)
    }
  }

  const handleSyncAll = async () => {
    setBusy("sync-all")
    try {
      const res = await WhatsAppTemplatesAPI.syncAll()
      if (res.success) {
        toast({
          title: "Synced from Meta",
          description: `${res.data?.imported || 0} imported, ${res.data?.updated || 0} updated`,
        })
        refresh()
      } else {
        toast({ title: "Sync failed", description: String(res.error || ""), variant: "destructive" })
      }
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (t: Template) => {
    const msg =
      t.status === "draft"
        ? "Delete this draft? It has not been sent to Meta."
        : `Delete "${t.name}" from Meta and locally? This cannot be undone.`
    if (!confirm(msg)) return
    setBusy(`delete-${t._id}`)
    try {
      try {
        const res = await WhatsAppTemplatesAPI.remove(t._id)
        if (res.success) {
          toast({ title: "Template deleted" })
        }
      } catch (err: any) {
        /**
         * Backend returns 400 when Meta refuses to delete the template
         * (e.g. system-owned `hello_world`, or templates currently in
         * pending_deletion). Axios throws on 4xx, so we read the error
         * message off the response and offer the operator a local-only
         * cleanup as a fallback.
         */
        const backend = err?.response?.data
        const reason =
          (typeof backend?.error === "string" && backend.error) ||
          (typeof backend?.details === "string" && backend.details) ||
          (backend?.details?.error?.message) ||
          err?.message ||
          "Unknown error"
        if (
          confirm(
            `Meta refused to delete this template:\n\n${reason}\n\nRemove the local row only? (Meta will still have it.)`
          )
        ) {
          await WhatsAppTemplatesAPI.remove(t._id, { force: true })
          toast({ title: "Removed locally", description: "Meta still has the template." })
        }
      }
      refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <FileText className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800 mb-1">WhatsApp Templates</h1>
              <p className="text-slate-600 text-base">
                Build, submit, and track Meta-approved templates for transactional and marketing sends.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleSyncAll}
              disabled={busy === "sync-all" || addonDisabled}
              title={addonDisabled ? "Enable the WABA Integration add-on first" : undefined}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              {busy === "sync-all" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CloudDownload className="h-4 w-4 mr-2" />
              )}
              Sync from Meta
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setShowForm(true)
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={addonDisabled}
              title={addonDisabled ? "Enable the WABA Integration add-on first" : undefined}
            >
              <PlusCircle className="h-4 w-4 mr-2" /> New Template
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>All templates</CardTitle>
              <CardDescription>
                Submitted templates lock in name, language, and category. Edit drafts and rejected
                templates only.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && refresh()}
                className="w-56"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
            </div>
          ) : addonDisabled ? (
            <div className="py-12 px-4 text-center">
              <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-slate-50/60 p-6">
                <FileText className="h-10 w-10 mx-auto text-slate-400 mb-3" />
                <p className="text-base font-semibold text-slate-800">
                  WABA Integration add-on is not enabled
                </p>
                <p className="text-sm text-slate-600 mt-2">
                  Templates are part of the Meta WhatsApp module. Ask your platform admin
                  to enable the <span className="font-medium">WABA Integration</span> add-on
                  under <span className="font-medium">Admin → Plan Management</span> for
                  this business.
                </p>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              No templates yet. Create one or click <em>Sync from Meta</em> to import existing
              templates.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Synced</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell>
                      <div className="font-medium text-slate-800">{t.name}</div>
                      {t.metaTemplateId && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          id: {t.metaTemplateId}
                        </div>
                      )}
                      {t.rejectionReason && (
                        <div className="text-xs text-red-600 mt-0.5">Reason: {t.rejectionReason}</div>
                      )}
                      {t.previousCategory && t.previousCategory !== t.category && (
                        <div className="text-[10px] text-amber-700 mt-0.5">
                          Meta moved: {t.previousCategory} → {t.category}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-600">{t.language}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                    <TableCell>
                      <QualityPill score={t.qualityScore} />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-500">
                        {t.lastSyncedAt
                          ? format(new Date(t.lastSyncedAt), "dd MMM, HH:mm")
                          : t.updatedAt
                          ? format(new Date(t.updatedAt), "dd MMM, HH:mm")
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {(t.status === "draft" || t.status === "rejected") && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditing(t)
                              setShowForm(true)
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            disabled={busy === `submit-${t._id}`}
                            onClick={() => handleSubmit(t._id)}
                          >
                            {busy === `submit-${t._id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            <span className="ml-1">Submit</span>
                          </Button>
                        </>
                      )}
                      {(t.status === "pending" ||
                        t.status === "approved" ||
                        t.status === "paused" ||
                        t.status === "in_appeal" ||
                        t.status === "flagged") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === `sync-${t._id}`}
                          onClick={() => handleSync(t._id)}
                        >
                          {busy === `sync-${t._id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          <span className="ml-1">Sync</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        disabled={busy === `delete-${t._id}`}
                        onClick={() => handleDelete(t)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TemplateForm
        open={showForm}
        onClose={() => setShowForm(false)}
        editing={editing}
        onSaved={refresh}
      />
    </div>
  )
}

/* ----------------------------- form dialog ----------------------------- */

function TemplateForm({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editing: Template | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState("")
  const [language, setLanguage] = useState("en_US")
  const [category, setCategory] = useState<Category>("MARKETING")
  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>("NONE")
  const [headerText, setHeaderText] = useState("")
  const [headerMediaUrl, setHeaderMediaUrl] = useState("")
  const [body, setBody] = useState("")
  const [bodySamples, setBodySamples] = useState<string[]>([])
  const [footer, setFooter] = useState("")
  const [buttons, setButtons] = useState<WAButton[]>([])

  // Auto-detect placeholders in body and resize the sample inputs to match.
  const placeholders = useMemo(() => findPlaceholders(body), [body])
  useEffect(() => {
    setBodySamples((prev) => {
      const next = [...prev]
      while (next.length < placeholders.length) next.push("")
      next.length = placeholders.length
      return next
    })
  }, [placeholders.length])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setLanguage(editing.language || "en_US")
      setCategory((editing.category as Category) || "MARKETING")
      const h = editing.components?.header
      const fmt: HeaderFormat = h?.format || (h?.text ? "TEXT" : "NONE")
      setHeaderFormat(fmt)
      setHeaderText(h?.text || "")
      setHeaderMediaUrl(h?.mediaSampleUrl || "")
      setBody(editing.components?.body?.text || "")
      const ex = editing.components?.body?.examples?.[0] || []
      setBodySamples(Array.isArray(ex) ? ex.slice() : [])
      setFooter(editing.components?.footer?.text || "")
      setButtons((editing.components?.buttons as WAButton[]) || [])
    } else {
      setName("")
      setLanguage("en_US")
      setCategory("MARKETING")
      setHeaderFormat("NONE")
      setHeaderText("")
      setHeaderMediaUrl("")
      setBody("")
      setBodySamples([])
      setFooter("")
      setButtons([])
    }
  }, [editing, open])

  function addButton(type: ButtonType) {
    if (buttons.length >= 10) {
      toast({ title: "Max 10 buttons", variant: "destructive" })
      return
    }
    setButtons((prev) => [...prev, { type, text: "", url: "", phone: "" }])
  }

  function updateButton(idx: number, patch: Partial<WAButton>) {
    setButtons((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  }

  function removeButton(idx: number) {
    setButtons((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!name) {
      toast({ title: "Template name is required", variant: "destructive" })
      return
    }
    if (!body) {
      toast({ title: "Body text is required", variant: "destructive" })
      return
    }
    if (placeholders.length > 0 && bodySamples.some((s) => !s.trim())) {
      toast({
        title: "Sample values required",
        description: "Fill in a sample value for every {{N}} placeholder so Meta can review.",
        variant: "destructive",
      })
      return
    }
    if (headerFormat !== "NONE" && headerFormat !== "TEXT" && !headerMediaUrl) {
      toast({
        title: "Header media URL required",
        description: "Meta needs a publicly accessible sample URL for media headers.",
        variant: "destructive",
      })
      return
    }
    for (const b of buttons) {
      if (!b.text) {
        toast({ title: "Every button needs a label", variant: "destructive" })
        return
      }
      if (b.type === "URL" && !b.url) {
        toast({ title: "URL button needs a URL", variant: "destructive" })
        return
      }
      if (b.type === "PHONE_NUMBER" && !b.phone) {
        toast({ title: "Phone button needs a phone number", variant: "destructive" })
        return
      }
    }

    setSubmitting(true)
    try {
      const components: WAComponents = {
        header:
          headerFormat === "NONE"
            ? null
            : {
                format: headerFormat,
                text: headerFormat === "TEXT" ? headerText : null,
                mediaSampleUrl: headerFormat !== "TEXT" ? headerMediaUrl : null,
                examples: [],
              },
        body: {
          text: body,
          examples: bodySamples.length > 0 ? [bodySamples] : [],
        },
        footer: footer ? { text: footer } : null,
        buttons,
      }
      // Build a variables map so reports / campaign mappers have a structured
      // record of every {{N}} placeholder.
      const variables: Record<string, any> = {}
      placeholders.forEach((n, i) => {
        variables[`v${n}`] = { index: n, sample: bodySamples[i] || "" }
      })

      const payload: any = {
        name: name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        language,
        category,
        components,
        variables,
        samples: { body: bodySamples },
      }
      let res
      try {
        if (editing) res = await WhatsAppTemplatesAPI.update(editing._id, payload)
        else res = await WhatsAppTemplatesAPI.create(payload)
      } catch (err: any) {
        const apiErr = err?.response?.data
        const detailStr = Array.isArray(apiErr?.details)
          ? apiErr.details
              .map((d: any) => `${Array.isArray(d.path) ? d.path.join('.') : d.path || ''}: ${d.message}`)
              .filter(Boolean)
              .join('; ')
          : ''
        const description =
          detailStr ||
          (typeof apiErr?.error === 'string' ? apiErr.error : '') ||
          err?.message ||
          'Could not save template'
        toast({ title: 'Save failed', description, variant: 'destructive' })
        return
      }
      if (res.success) {
        toast({ title: editing ? "Template updated" : "Template created" })
        onClose()
        onSaved()
      } else {
        toast({
          title: "Save failed",
          description: typeof res.error === "string" ? res.error : JSON.stringify(res.error),
          variant: "destructive",
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit template" : "New WhatsApp template"}</DialogTitle>
          <DialogDescription>
            Use {"{{1}}"}, {"{{2}}"}… for variables in the body. Provide example values so Meta can
            review the template.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label>Template name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="appointment_confirmation_v1"
              disabled={!!editing}
            />
            <p className="text-xs text-slate-500 mt-1">
              Lowercase, snake_case. Cannot be changed after submission.
            </p>
          </div>
          <div>
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {LOCALES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label} ({l.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-1">
              {category === "MARKETING"
                ? "Promotional sends. Requires opt-in."
                : category === "UTILITY"
                ? "Transactional updates (bookings, receipts)."
                : "OTPs and authentication codes only."}
            </p>
          </div>

          <div className="md:col-span-2">
            <Label>Header format</Label>
            <Select value={headerFormat} onValueChange={(v) => setHeaderFormat(v as HeaderFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEADER_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f === "NONE" ? "No header" : f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {headerFormat === "TEXT" && (
            <div className="md:col-span-3">
              <Label>Header text</Label>
              <Input
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="Booking confirmed"
                maxLength={60}
              />
              <p className="text-xs text-slate-500 mt-1">Up to 60 characters.</p>
            </div>
          )}

          {headerFormat !== "NONE" && headerFormat !== "TEXT" && (
            <div className="md:col-span-3">
              <Label>Header sample URL ({headerFormat.toLowerCase()})</Label>
              <Input
                value={headerMediaUrl}
                onChange={(e) => setHeaderMediaUrl(e.target.value)}
                placeholder="https://example.com/sample.jpg"
              />
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> Public URL Meta can fetch during template review.
              </p>
            </div>
          )}

          <div className="md:col-span-3">
            <Label>Body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{1}}, your appointment for {{2}} on {{3}} is confirmed."
              rows={4}
              maxLength={1024}
            />
            <p className="text-xs text-slate-500 mt-1">Up to 1024 characters.</p>
          </div>

          {placeholders.length > 0 && (
            <div className="md:col-span-3 rounded-lg bg-slate-50 border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-700 mb-2">Sample values</div>
              <p className="text-xs text-slate-500 mb-3">
                Meta uses these to validate your template. Provide one sample per placeholder.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {placeholders.map((n, i) => (
                  <div key={n}>
                    <Label className="text-xs text-slate-600">{`{{${n}}}`}</Label>
                    <Input
                      value={bodySamples[i] || ""}
                      onChange={(e) =>
                        setBodySamples((prev) => {
                          const next = [...prev]
                          next[i] = e.target.value
                          return next
                        })
                      }
                      placeholder={n === 1 ? "Asha" : n === 2 ? "Hair Spa" : "15 May 4:30 PM"}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="md:col-span-3">
            <Label>Footer (optional)</Label>
            <Input
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              placeholder="EaseMySalon"
              maxLength={60}
            />
          </div>

          <div className="md:col-span-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="mb-0">Buttons (optional)</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addButton("QUICK_REPLY")}
                  disabled={buttons.length >= 10}
                >
                  + Quick reply
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addButton("URL")}
                  disabled={buttons.length >= 10}
                >
                  + URL
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addButton("PHONE_NUMBER")}
                  disabled={buttons.length >= 10}
                >
                  + Phone
                </Button>
              </div>
            </div>
            {buttons.length === 0 ? (
              <p className="text-xs text-slate-500">No buttons. Up to 10 allowed.</p>
            ) : (
              <div className="space-y-2">
                {buttons.map((b, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-slate-200 rounded-md p-2"
                  >
                    <div className="md:col-span-3">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={b.type}
                        onValueChange={(v) => updateButton(i, { type: v as ButtonType })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUTTON_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-3">
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={b.text}
                        onChange={(e) => updateButton(i, { text: e.target.value })}
                        placeholder="View booking"
                        maxLength={25}
                      />
                    </div>
                    {b.type === "URL" && (
                      <div className="md:col-span-5">
                        <Label className="text-xs">URL</Label>
                        <Input
                          value={b.url || ""}
                          onChange={(e) => updateButton(i, { url: e.target.value })}
                          placeholder="https://easemysalon.com/booking/{{1}}"
                        />
                      </div>
                    )}
                    {b.type === "PHONE_NUMBER" && (
                      <div className="md:col-span-5">
                        <Label className="text-xs">Phone</Label>
                        <Input
                          value={b.phone || ""}
                          onChange={(e) => updateButton(i, { phone: e.target.value })}
                          placeholder="+919999999999"
                        />
                      </div>
                    )}
                    {b.type === "QUICK_REPLY" && <div className="md:col-span-5" />}
                    <div className="md:col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-500"
                        onClick={() => removeButton(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live preview */}
          <div className="md:col-span-3">
            <Label className="text-xs text-slate-600">Preview</Label>
            <Preview
              headerFormat={headerFormat}
              headerText={headerText}
              headerMediaUrl={headerMediaUrl}
              body={body}
              footer={footer}
              buttons={buttons}
              samples={bodySamples}
              placeholders={placeholders}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {editing ? "Save changes" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------- preview ----------------------------- */

function Preview({
  headerFormat,
  headerText,
  headerMediaUrl,
  body,
  footer,
  buttons,
  samples,
  placeholders,
}: {
  headerFormat: HeaderFormat
  headerText: string
  headerMediaUrl: string
  body: string
  footer: string
  buttons: WAButton[]
  samples: string[]
  placeholders: number[]
}) {
  /**
   * Replace each {{N}} with the matching sample value (falling back to the
   * literal placeholder when no sample is provided yet) so the operator
   * sees what Meta will see during review.
   */
  const rendered = useMemo(() => {
    let out = body
    placeholders.forEach((n, i) => {
      const v = samples[i] || `{{${n}}}`
      out = out.replaceAll(`{{${n}}}`, v)
    })
    return out
  }, [body, placeholders, samples])

  return (
    <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 p-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {headerFormat !== "NONE" && (
          <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
            {headerFormat === "TEXT" ? (
              <div className="text-sm font-semibold text-slate-800">{headerText || "Header text"}</div>
            ) : (
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <ImageIcon className="h-3.5 w-3.5" /> {headerFormat.toLowerCase()} header
                {headerMediaUrl ? " (sample provided)" : " (no sample yet)"}
              </div>
            )}
          </div>
        )}
        <div className="px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap">
          {rendered || <span className="text-slate-400">Body text will appear here…</span>}
        </div>
        {footer && (
          <div className="px-4 pb-3 text-xs text-slate-500">{footer}</div>
        )}
        {buttons.length > 0 && (
          <div className="border-t border-slate-100 divide-y divide-slate-100">
            {buttons.map((b, i) => (
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
