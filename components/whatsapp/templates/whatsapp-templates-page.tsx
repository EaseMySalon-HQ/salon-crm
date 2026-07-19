"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { WhatsAppTemplatesAPI } from "@/lib/api"
import { compressImageFile } from "@/lib/compress-showcase-image"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CloudDownload,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  PlusCircle,
  RefreshCw,
  Send,
  Star,
  Trash2,
  Upload,
  X,
  XCircle,
  ExternalLink,
  Megaphone,
  Phone,
  Receipt,
} from "lucide-react"
import { format } from "date-fns"

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const
type Category = (typeof CATEGORIES)[number]

const HEADER_FORMATS = ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"] as const
type HeaderFormat = (typeof HEADER_FORMATS)[number]

type MediaHeaderFormat = Extract<HeaderFormat, "IMAGE" | "VIDEO" | "DOCUMENT">

const HEADER_MEDIA_CONFIG: Record<
  MediaHeaderFormat,
  {
    label: string
    accept: string
    typePattern: RegExp
    typeHint: string
    maxBytes: number
    placeholder: string
  }
> = {
  IMAGE: {
    label: "image",
    accept: "image/png,image/jpeg,image/jpg,image/webp",
    typePattern: /^image\/(png|jpe?g|webp)$/i,
    typeHint: "PNG, JPG, or WebP",
    maxBytes: 5 * 1024 * 1024,
    placeholder: "https://example.com/sample.jpg",
  },
  VIDEO: {
    label: "video",
    accept: "video/mp4,video/3gpp,.mp4,.3gp",
    typePattern: /^video\/(mp4|3gpp)$/i,
    typeHint: "MP4 or 3GP",
    maxBytes: 16 * 1024 * 1024,
    placeholder: "https://example.com/sample.mp4",
  },
  DOCUMENT: {
    label: "document",
    accept: "application/pdf,.pdf",
    typePattern: /^application\/pdf$/i,
    typeHint: "PDF",
    maxBytes: 15 * 1024 * 1024,
    placeholder: "https://example.com/sample.pdf",
  },
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"))
    reader.readAsDataURL(file)
  })
}

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

const NOTIFICATION_SLOT_LABELS: Record<string, string> = {
  appointmentConfirmation: "Appointment confirmation",
  appointmentReminder: "Appointment reminder",
  appointmentCancellation: "Appointment cancellation",
  appointmentReschedule: "Appointment reschedule",
  appointmentScheduling: "Appointment scheduling",
  receipt: "Receipt / bill",
  receiptWithFeedback: "Receipt with feedback link",
  receiptCancellation: "Bill cancellation",
  clientWalletTransaction: "Prepaid wallet transaction",
  clientWalletExpiryReminder: "Prepaid wallet expiry reminder",
  welcomeMessage: "Welcome message",
  businessAccountCreated: "Business account created",
  default: "Default / fallback",
}

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
  slotKey?: string | null
  gupshupTemplateId?: string | null
}

type LibraryEntry = {
  platformTemplateId: string
  slotKey: string | null
  elementName: string
  category: string
  language: string
  content: string
  localTemplateId?: string | null
  localStatus?: string | null
  mappedSlotKey?: string | null
  localTemplate?: {
    _id: string
    name: string
    status: string
    slotKey?: string | null
    gupshupTemplateId?: string | null
    category?: string
  } | null
}

type TemplatesTab = "your" | "promotional" | "transactional"

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
  const [activeTab, setActiveTab] = useState<TemplatesTab>("your")
  const [slotKeys, setSlotKeys] = useState<string[]>([])
  const [promotionalLibrary, setPromotionalLibrary] = useState<LibraryEntry[]>([])
  const [transactionalLibrary, setTransactionalLibrary] = useState<LibraryEntry[]>([])
  const [promoLibraryLoading, setPromoLibraryLoading] = useState(false)
  const [txnLibraryLoading, setTxnLibraryLoading] = useState(false)
  const [mapDialogOpen, setMapDialogOpen] = useState(false)
  const [mappingTemplate, setMappingTemplate] = useState<Template | null>(null)
  const [mapSlotKey, setMapSlotKey] = useState("")

  async function loadMeta() {
    try {
      const res = await WhatsAppTemplatesAPI.meta()
      if (res.success) setSlotKeys(res.data?.slotKeys || [])
    } catch {
      /* non-fatal */
    }
  }

  async function loadLibrary(scope: "promotional" | "transactional") {
    const setLoading = scope === "promotional" ? setPromoLibraryLoading : setTxnLibraryLoading
    const setItems = scope === "promotional" ? setPromotionalLibrary : setTransactionalLibrary
    try {
      setLoading(true)
      const res = await WhatsAppTemplatesAPI.library(scope)
      if (res.success) setItems(res.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function reloadLibraries() {
    await Promise.all([loadLibrary("promotional"), loadLibrary("transactional")])
  }

  async function refresh() {
    try {
      setLoading(true)
      const params: any = { origin: "own" }
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
    loadMeta()
    reloadLibraries()
  }, [statusFilter])

  const handleSubmit = async (id: string) => {
    setBusy(`submit-${id}`)
    try {
      const res = await WhatsAppTemplatesAPI.submit(id)
      if (res.success) {
        const status = res.data?.status
        toast({
          title: status === "approved" ? "Template approved" : "Submitted to Meta",
          description:
            status === "approved"
              ? "This template is ready to use."
              : "Status will update once Meta reviews the template.",
        })
        refresh()
      } else {
        const err = typeof res.error === "string" ? res.error : JSON.stringify(res.error)
        toast({
          title: res.code === "WHATSAPP_APP_NOT_CONNECTED" ? "WhatsApp not connected" : "Submission failed",
          description: err,
          variant: "destructive",
        })
        refresh()
      }
    } catch (err: any) {
      const apiErr = err?.response?.data
      const description =
        (typeof apiErr?.error === "string" ? apiErr.error : "") ||
        err?.message ||
        "Submission failed"
      toast({
        title: apiErr?.code === "WHATSAPP_APP_NOT_CONNECTED" ? "WhatsApp not connected" : "Submission failed",
        description,
        variant: "destructive",
      })
      refresh()
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

  const handleImportCatalog = async (scope: "promotional" | "transactional") => {
    setBusy(`import-catalog-${scope}`)
    try {
      const res = await WhatsAppTemplatesAPI.importCatalog(scope)
      if (res.success) {
        toast({
          title: "Templates added",
          description: `${res.data?.imported || 0} draft template(s) added from the library.`,
        })
        await Promise.all([refresh(), reloadLibraries()])
      } else {
        toast({ title: "Add failed", description: String(res.error || ""), variant: "destructive" })
      }
    } finally {
      setBusy(null)
    }
  }

  const handleImportOne = async (entry: LibraryEntry) => {
    setBusy(`import-${entry.platformTemplateId}`)
    try {
      const res = await WhatsAppTemplatesAPI.importFromLibrary(entry.platformTemplateId)
      if (res.success) {
        toast({
          title: "Template added",
          description: `${entry.elementName} is ready to submit for Meta approval.`,
        })
        await Promise.all([refresh(), reloadLibraries()])
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Failed to add template"
      toast({ title: "Add failed", description: msg, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const handleSyncSlots = async () => {
    setBusy("sync-slots")
    try {
      const res = await WhatsAppTemplatesAPI.syncSlots()
      if (res.success) {
        toast({
          title: "Notification slots updated",
          description: `${res.data?.linked?.length || 0} approved template(s) linked.`,
        })
        await Promise.all([refresh(), reloadLibraries()])
      } else {
        toast({ title: "Sync slots failed", description: String(res.error || ""), variant: "destructive" })
      }
    } finally {
      setBusy(null)
    }
  }

  const openMap = (tpl: Template) => {
    setMappingTemplate(tpl)
    setMapSlotKey(tpl.slotKey || "")
    setMapDialogOpen(true)
  }

  const onSaveMap = async () => {
    if (!mappingTemplate) return
    setBusy("map")
    try {
      const res = await WhatsAppTemplatesAPI.map(
        mappingTemplate._id,
        mapSlotKey.trim() || null
      )
      if (!res.success) throw new Error(res.error || "Map failed")
      setMapDialogOpen(false)
      const link = res.notificationLink as
        | { applied?: boolean; reason?: string; variableMapping?: Record<string, string> }
        | undefined
      const varCount = link?.variableMapping ? Object.keys(link.variableMapping).length : 0
      if (mapSlotKey.trim() && link?.applied) {
        toast({
          title: "Notification mapped",
          description: `${mappingTemplate.name} → ${NOTIFICATION_SLOT_LABELS[mapSlotKey] || mapSlotKey}. Template ID and ${varCount} variable mapping(s) saved.`,
        })
      } else if (mapSlotKey.trim()) {
        toast({
          title: "Slot saved",
          description:
            link?.reason ||
            `${mappingTemplate.name} is linked to ${NOTIFICATION_SLOT_LABELS[mapSlotKey] || mapSlotKey}. Sync approval, then map again to update notification settings.`,
        })
      } else {
        toast({
          title: "Mapping cleared",
          description: `${mappingTemplate.name} is no longer linked to a notification type.`,
        })
      }
      await Promise.all([refresh(), loadLibrary()])
    } catch (err: unknown) {
      toast({
        title: "Map failed",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  const openMapFromLibrary = (entry: LibraryEntry) => {
    const lt = entry.localTemplate
    if (!lt) return
    openMap({
      _id: lt._id,
      name: lt.name,
      language: entry.language,
      category: (lt.category as Category) || "UTILITY",
      status: lt.status,
      slotKey: lt.slotKey,
      gupshupTemplateId: lt.gupshupTemplateId,
    })
  }

  const renderLibraryTable = (
    scope: "promotional" | "transactional",
    entries: LibraryEntry[],
    loading: boolean
  ) => {
    const isTransactional = scope === "transactional"
    const emptyMsg = isTransactional
      ? "No transactional templates published yet. Your platform admin must approve UTILITY templates in Admin → Platform → Template Manager."
      : "No promotional templates published yet. Your platform admin must approve MARKETING templates in Admin → Platform → Template Manager."

    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              {isTransactional ? (
                <Receipt className="h-5 w-5 text-emerald-600" />
              ) : (
                <Megaphone className="h-5 w-5 text-violet-600" />
              )}
              {isTransactional ? "Transactional Template Library" : "Promotional Templates Library"}
            </CardTitle>
            <CardDescription>
              {isTransactional
                ? "Platform-approved utility templates for receipts, appointments, and wallet notifications. Add, submit to Meta, then Map once approved."
                : "Platform-approved marketing templates for campaigns and promotional sends. Add and submit to Meta on your number."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleImportCatalog(scope)}
              disabled={busy === `import-catalog-${scope}`}
              className="border-emerald-200 text-emerald-700"
            >
              {busy === `import-catalog-${scope}` ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Import all
            </Button>
            {isTransactional && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncSlots}
                disabled={busy === "sync-slots"}
              >
                {busy === "sync-slots" ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Sync approved → slots
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} columns={5} />
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">{emptyMsg}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isTransactional && <TableHead>Notification</TableHead>}
                  <TableHead>Template name</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Your copy</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const lt = entry.localTemplate
                  return (
                    <TableRow key={entry.platformTemplateId}>
                      {isTransactional && (
                        <TableCell className="text-sm">
                          {entry.slotKey
                            ? NOTIFICATION_SLOT_LABELS[entry.slotKey] || entry.slotKey
                            : "—"}
                        </TableCell>
                      )}
                      <TableCell>
                        <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                          {entry.elementName}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="text-xs text-slate-600 line-clamp-2">{entry.content}</p>
                      </TableCell>
                      <TableCell>
                        {entry.localStatus ? (
                          <StatusBadge status={entry.localStatus} />
                        ) : (
                          <Badge variant="outline" className="text-slate-500">
                            Not added
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {!lt ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy === `import-${entry.platformTemplateId}`}
                            onClick={() => handleImportOne(entry)}
                          >
                            {busy === `import-${entry.platformTemplateId}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Add"
                            )}
                          </Button>
                        ) : (
                          <>
                            {(lt.status === "draft" || lt.status === "rejected") && (
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                disabled={busy === `submit-${lt._id}`}
                                onClick={() => handleSubmit(lt._id)}
                              >
                                {busy === `submit-${lt._id}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Send className="h-3 w-3" />
                                )}
                                <span className="ml-1">Submit</span>
                              </Button>
                            )}
                            {(lt.status === "pending" ||
                              lt.status === "approved" ||
                              lt.status === "paused" ||
                              lt.status === "in_appeal" ||
                              lt.status === "flagged") && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === `sync-${lt._id}`}
                                onClick={() => handleSync(lt._id)}
                              >
                                {busy === `sync-${lt._id}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                <span className="ml-1">Sync</span>
                              </Button>
                            )}
                            {isTransactional &&
                              (lt.status === "approved" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openMapFromLibrary(entry)}
                                  disabled={busy === "map"}
                                >
                                  Map
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" disabled title="Approve first">
                                  Map
                                </Button>
                              ))}
                          </>
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
    )
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

      {!addonDisabled && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TemplatesTab)} className="space-y-4">
          <TabsList className="bg-slate-100">
            <TabsTrigger value="your" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Your Templates
            </TabsTrigger>
            <TabsTrigger value="promotional" className="gap-1.5">
              <Megaphone className="h-4 w-4" />
              Promotional Templates Library
            </TabsTrigger>
            <TabsTrigger value="transactional" className="gap-1.5">
              <Receipt className="h-4 w-4" />
              Transactional Template Library
            </TabsTrigger>
          </TabsList>

          <TabsContent value="your">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle>Your Templates</CardTitle>
                    <CardDescription>
                      Templates you created yourself. Submitted templates lock name, language, and
                      category. Edit drafts and rejected templates only.
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
                  <TableSkeleton rows={6} columns={5} />
                ) : items.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                    No templates yet. Create one with <em>New Template</em> or sync from Meta.
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
                              <div className="text-xs text-red-600 mt-0.5">
                                Reason: {t.rejectionReason}
                              </div>
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
          </TabsContent>

          <TabsContent value="promotional">
            {renderLibraryTable("promotional", promotionalLibrary, promoLibraryLoading)}
          </TabsContent>

          <TabsContent value="transactional">
            {renderLibraryTable("transactional", transactionalLibrary, txnLibraryLoading)}
          </TabsContent>
        </Tabs>
      )}

      {addonDisabled && (
        <Card>
          <CardContent className="py-12 px-4 text-center">
            <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-slate-50/60 p-6">
              <FileText className="h-10 w-10 mx-auto text-slate-400 mb-3" />
              <p className="text-base font-semibold text-slate-800">
                WABA Integration add-on is not enabled
              </p>
              <p className="text-sm text-slate-600 mt-2">
                Templates are part of the Gupshup WhatsApp module. Ask your platform admin to enable
                the <span className="font-medium">WABA Integration</span> add-on under{" "}
                <span className="font-medium">Admin → Plan Management</span> for this business.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={mapDialogOpen} onOpenChange={setMapDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Map to notification</DialogTitle>
            <DialogDescription>
              Link {mappingTemplate?.name} to a transactional notification. Mapping applies your
              approved template ID and variable settings for sends from your connected number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Notification type</Label>
            <Select
              value={mapSlotKey || "__none__"}
              onValueChange={(v) => setMapSlotKey(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select notification type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (clear mapping)</SelectItem>
                {slotKeys.map((k) => (
                  <SelectItem key={k} value={k}>
                    {NOTIFICATION_SLOT_LABELS[k] || k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMapDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSaveMap} disabled={busy === "map"}>
              {busy === "map" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  const [headerMediaUploading, setHeaderMediaUploading] = useState(false)
  const headerMediaInputRef = useRef<HTMLInputElement>(null)
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

  async function handleHeaderMediaUpload(file: File) {
    if (headerFormat !== "IMAGE" && headerFormat !== "VIDEO" && headerFormat !== "DOCUMENT") {
      return
    }
    const cfg = HEADER_MEDIA_CONFIG[headerFormat]

    if (!cfg.typePattern.test(file.type)) {
      toast({
        title: "Invalid file type",
        description: `Please upload ${cfg.typeHint}.`,
        variant: "destructive",
      })
      return
    }
    if (file.size > cfg.maxBytes) {
      toast({
        title: "File too large",
        description: `Maximum size is ${cfg.maxBytes / (1024 * 1024)} MB.`,
        variant: "destructive",
      })
      return
    }

    setHeaderMediaUploading(true)
    try {
      const media =
        headerFormat === "IMAGE" ? await compressImageFile(file) : await readFileAsDataUrl(file)
      const res = await WhatsAppTemplatesAPI.uploadHeaderMedia(headerFormat, media, file.type)
      if (res.success && res.data?.url) {
        setHeaderMediaUrl(res.data.url)
        toast({ title: `Header ${cfg.label} uploaded` })
      } else {
        toast({
          title: "Upload failed",
          description: typeof res.error === "string" ? res.error : `Could not upload ${cfg.label}`,
          variant: "destructive",
        })
      }
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || `Could not upload ${cfg.label}`,
        variant: "destructive",
      })
    } finally {
      setHeaderMediaUploading(false)
      if (headerMediaInputRef.current) headerMediaInputRef.current.value = ""
    }
  }

  function clearHeaderMedia() {
    setHeaderMediaUrl("")
    if (headerMediaInputRef.current) headerMediaInputRef.current.value = ""
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
      <DialogContent className="max-w-5xl max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col">
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Form — left */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            <DialogHeader className="text-left">
              <DialogTitle>{editing ? "Edit template" : "New WhatsApp template"}</DialogTitle>
              <DialogDescription>
                Use {"{{1}}"}, {"{{2}}"}… for variables in the body. Provide example values so Meta
                can review the template.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="sm:col-span-2 space-y-1">
                <Label>Template name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="appointment_confirmation_v1"
                  disabled={!!editing}
                />
                <p className="text-xs text-slate-500">
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

              <div className="sm:col-span-2">
                <Label>Header format</Label>
            <Select
              value={headerFormat}
              onValueChange={(v) => {
                const next = v as HeaderFormat
                if (next !== headerFormat) {
                  setHeaderMediaUrl("")
                  if (headerMediaInputRef.current) headerMediaInputRef.current.value = ""
                }
                setHeaderFormat(next)
              }}
            >
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
                <div className="sm:col-span-2">
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

              {headerFormat !== "NONE" && headerFormat !== "TEXT" && (() => {
                const cfg = HEADER_MEDIA_CONFIG[headerFormat as MediaHeaderFormat]
                return (
                <div className="sm:col-span-2 space-y-3">
                  <Label>Header sample {cfg.label}</Label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                    {headerMediaUrl ? (
                      <div className="flex items-start gap-3">
                        {headerFormat === "IMAGE" ? (
                          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
                            <img
                              src={headerMediaUrl}
                              alt="Header sample preview"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : headerFormat === "VIDEO" ? (
                          <div className="h-20 w-32 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-black">
                            <video
                              src={headerMediaUrl}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          </div>
                        ) : (
                          <div className="h-20 w-20 shrink-0 flex items-center justify-center rounded-md border border-slate-200 bg-white">
                            <FileText className="h-8 w-8 text-slate-500" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-600 break-all">{headerMediaUrl}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-2 h-8 px-2 text-destructive hover:text-destructive"
                            onClick={clearHeaderMedia}
                            disabled={headerMediaUploading}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600">
                        Upload a sample {cfg.label} for Meta to review during template approval.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={headerMediaUploading}
                        onClick={() => headerMediaInputRef.current?.click()}
                      >
                        {headerMediaUploading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        {headerMediaUrl ? `Replace ${cfg.label}` : `Upload ${cfg.label}`}
                      </Button>
                      <input
                        ref={headerMediaInputRef}
                        type="file"
                        accept={cfg.accept}
                        className="hidden"
                        disabled={headerMediaUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void handleHeaderMediaUpload(file)
                        }}
                      />
                      <span className="text-xs text-slate-500">
                        {cfg.typeHint} · Max {cfg.maxBytes / (1024 * 1024)}MB
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Or paste a public URL</Label>
                    <Input
                      value={headerMediaUrl}
                      onChange={(e) => setHeaderMediaUrl(e.target.value)}
                      placeholder={cfg.placeholder}
                      disabled={headerMediaUploading}
                    />
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" /> Public URL Meta can fetch during template review.
                  </p>
                </div>
                )
              })()}

              <div className="sm:col-span-2">
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
                <div className="sm:col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-4">
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

              <div className="sm:col-span-2">
                <Label>Footer (optional)</Label>
            <Input
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              placeholder="EaseMySalon"
              maxLength={60}
            />
          </div>

              <div className="sm:col-span-2">
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
            </div>

            <DialogFooter className="mt-6 px-0 sm:justify-start">
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
          </div>

          {/* Mobile WhatsApp preview — right */}
          <div className="hidden md:flex md:w-[300px] shrink-0 border-l bg-slate-50 flex-col items-center p-5 overflow-y-auto">
            <p className="text-xs font-medium text-slate-600 mb-4 self-start">Message preview</p>
            <WhatsAppMobilePreview
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

        {/* Preview on small screens — below form */}
        <div className="md:hidden border-t bg-slate-50 p-4 flex flex-col items-center">
          <p className="text-xs font-medium text-slate-600 mb-3 self-start w-full max-w-[260px]">
            Message preview
          </p>
          <WhatsAppMobilePreview
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
      </DialogContent>
    </Dialog>
  )
}

function applyTemplateSamples(
  text: string,
  placeholders: number[],
  samples: string[]
): string {
  let out = text
  placeholders.forEach((n, i) => {
    out = out.replaceAll(`{{${n}}}`, samples[i]?.trim() ? samples[i] : `{{${n}}}`)
  })
  return out
}

function WhatsAppMobilePreview({
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
  const renderedBody = useMemo(
    () => applyTemplateSamples(body, placeholders, samples),
    [body, placeholders, samples]
  )
  const renderedHeader = useMemo(
    () => applyTemplateSamples(headerText, placeholders, samples),
    [headerText, placeholders, samples]
  )

  const now = useMemo(
    () =>
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    []
  )

  return (
    <div className="w-[260px] shrink-0">
      {/* Phone frame */}
      <div className="rounded-[2rem] border-[6px] border-slate-800 bg-slate-800 shadow-xl overflow-hidden">
        <div className="bg-slate-800 h-6 flex items-center justify-center">
          <div className="w-16 h-1 rounded-full bg-slate-600" />
        </div>
        <div className="bg-[#efeae2] min-h-[420px] flex flex-col">
          {/* WhatsApp chat header */}
          <div className="bg-[#075e54] text-white px-3 py-2.5 flex items-center gap-2 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-[#128c7e] flex items-center justify-center text-xs font-semibold">
              B
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">Your Business</div>
              <div className="text-[10px] text-emerald-100/90">Business account</div>
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 px-2 py-3 space-y-2 overflow-y-auto">
            <div className="flex justify-start">
              <div className="max-w-[92%] bg-white rounded-lg rounded-tl-none shadow-sm overflow-hidden">
                {headerFormat !== "NONE" && (
                  <div className="border-b border-slate-100">
                    {headerFormat === "TEXT" ? (
                      <div className="px-3 pt-2.5 pb-1 text-[13px] font-semibold text-slate-900 leading-snug">
                        {renderedHeader || (
                          <span className="text-slate-400 font-normal">Header text</span>
                        )}
                      </div>
                    ) : headerFormat === "IMAGE" && headerMediaUrl ? (
                      <div className="relative aspect-video bg-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={headerMediaUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none"
                          }}
                        />
                      </div>
                    ) : headerFormat === "VIDEO" && headerMediaUrl ? (
                      <div className="relative aspect-video bg-black">
                        <video
                          src={headerMediaUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      </div>
                    ) : headerFormat === "DOCUMENT" && headerMediaUrl ? (
                      <div className="px-3 py-4 bg-slate-100 flex items-center justify-center gap-2 text-[11px] text-slate-600">
                        <FileText className="h-4 w-4 shrink-0" />
                        PDF document
                      </div>
                    ) : (
                      <div className="px-3 py-4 bg-slate-100 text-center text-[11px] text-slate-500">
                        {headerFormat.toLowerCase()} header
                      </div>
                    )}
                  </div>
                )}

                <div className="px-3 py-2 text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {renderedBody || (
                    <span className="text-slate-400">Body text will appear here…</span>
                  )}
                </div>

                {footer && (
                  <div className="px-3 pb-1.5 text-[11px] text-slate-500">{footer}</div>
                )}

                <div className="px-3 pb-1.5 flex justify-end">
                  <span className="text-[10px] text-slate-400">{now}</span>
                </div>

                {buttons.length > 0 && (
                  <div className="border-t border-slate-100">
                    {buttons.map((b, i) => (
                      <div
                        key={i}
                        className="px-3 py-2.5 text-[13px] text-center font-medium text-[#008069] border-t border-slate-100 first:border-t-0 flex items-center justify-center gap-1.5"
                      >
                        {b.type === "URL" && (
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {b.type === "PHONE_NUMBER" && (
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {b.text || `Button ${i + 1}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 h-4" />
      </div>
      <p className="text-[10px] text-slate-500 text-center mt-2 leading-snug">
        Sample values replace {"{{N}}"} placeholders in the preview.
      </p>
    </div>
  )
}
