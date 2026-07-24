"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  WhatsAppTemplateFormDialog,
  type Category,
  type WAComponents,
  type WhatsAppTemplateFormEditing,
} from "./whatsapp-template-form-dialog"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CloudDownload,
  Download,
  FileText,
  Loader2,
  PlusCircle,
  RefreshCw,
  Send,
  Star,
  Trash2,
  X,
  XCircle,
  Megaphone,
  Receipt,
} from "lucide-react"
import { format } from "date-fns"

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
  clientDuesReminder: "Outstanding dues reminder",
  clientBirthdayReminder: "Birthday wish",
  welcomeMessage: "Welcome message",
  businessAccountCreated: "Business account created",
  default: "Default / fallback",
}

/* ---------- types matching the backend's WhatsAppTemplate shape ---------- */

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
  platformStatus?: "approved"
  tenantSubmitted?: boolean
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
   * is returned by `/api/whatsapp/gupshup/templates`, we render an empty-state card
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
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addDialogScope, setAddDialogScope] = useState<"promotional" | "transactional">("transactional")
  const [availableTemplates, setAvailableTemplates] = useState<LibraryEntry[]>([])
  const [availableLoading, setAvailableLoading] = useState(false)
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<string[]>([])

  async function loadMeta() {
    try {
      const res = await WhatsAppTemplatesAPI.catalog()
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
        await Promise.all([refresh(), reloadLibraries()])
      } else {
        toast({ title: "Sync failed", description: String(res.error || ""), variant: "destructive" })
      }
    } catch (err: any) {
      const apiErr = err?.response?.data
      toast({
        title: "Sync failed",
        description:
          (typeof apiErr?.error === "string" ? apiErr.error : "") ||
          err?.message ||
          "Could not sync template from Gupshup",
        variant: "destructive",
      })
      await reloadLibraries()
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
          title: "Synced from Gupshup",
          description: `${res.data?.imported || 0} imported, ${res.data?.updated || 0} updated`,
        })
        await Promise.all([refresh(), reloadLibraries()])
      } else {
        toast({ title: "Sync failed", description: String(res.error || ""), variant: "destructive" })
      }
    } catch (err: any) {
      const apiErr = err?.response?.data
      toast({
        title: "Sync failed",
        description:
          (typeof apiErr?.error === "string" ? apiErr.error : "") ||
          err?.message ||
          "Could not sync templates from Gupshup",
        variant: "destructive",
      })
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

  const openAddTemplatesDialog = async (scope: "promotional" | "transactional") => {
    setAddDialogScope(scope)
    setSelectedPlatformIds([])
    setAddDialogOpen(true)
    setAvailableLoading(true)
    try {
      const res = await WhatsAppTemplatesAPI.libraryAvailable(scope)
      if (res.success) setAvailableTemplates(res.data || [])
      else setAvailableTemplates([])
    } catch {
      setAvailableTemplates([])
      toast({ title: "Could not load catalog", variant: "destructive" })
    } finally {
      setAvailableLoading(false)
    }
  }

  const togglePlatformSelection = (platformTemplateId: string, checked: boolean) => {
    setSelectedPlatformIds((prev) => {
      if (checked) return prev.includes(platformTemplateId) ? prev : [...prev, platformTemplateId]
      return prev.filter((id) => id !== platformTemplateId)
    })
  }

  const handleAddSelectedTemplates = async () => {
    if (!selectedPlatformIds.length) {
      toast({ title: "Select templates", description: "Choose at least one template to add.", variant: "destructive" })
      return
    }
    setBusy(`add-selected-${addDialogScope}`)
    try {
      const res = await WhatsAppTemplatesAPI.importLibraryBatch(selectedPlatformIds)
      if (res.success) {
        toast({
          title: "Templates added",
          description: `${res.data?.imported || 0} template(s) added to your library.`,
        })
        setAddDialogOpen(false)
        setSelectedPlatformIds([])
        await Promise.all([refresh(), reloadLibraries()])
      } else {
        toast({ title: "Add failed", description: String(res.error || ""), variant: "destructive" })
      }
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
      await Promise.all([refresh(), reloadLibraries()])
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
      ? "No transactional templates in your library yet. Click Add templates to choose from the platform catalog."
      : "No promotional templates in your library yet. Click Add templates to choose from the platform catalog."

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
                ? "Templates you chose for receipts, appointments, and wallet notifications. Submit on your connected number, then Map once approved."
                : "Marketing templates you chose for campaigns. Submit on your connected number to use them in campaigns."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => openAddTemplatesDialog(scope)}
              disabled={busy === `add-selected-${scope}`}
            >
              <PlusCircle className="h-4 w-4 mr-1" />
              Add templates
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
            <TableSkeleton rows={4} columns={isTransactional ? 6 : 5} />
          ) : entries.length === 0 ? (
            <div className="py-6 space-y-3">
              <p className="text-sm text-slate-500">{emptyMsg}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openAddTemplatesDialog(scope)}
              >
                <PlusCircle className="h-4 w-4 mr-1" />
                Browse platform catalog
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isTransactional && <TableHead>Notification</TableHead>}
                  <TableHead>Template name</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Your number</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const lt = entry.localTemplate
                  if (!lt) return null
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
                        <StatusBadge status={entry.platformStatus || "approved"} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={entry.localStatus || lt.status} />
                      </TableCell>
                      <TableCell className="text-right space-x-1">
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

      {!addonDisabled && items.some((t) => t.status === "pending") && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Templates awaiting Meta approval</p>
            <p className="mt-0.5">
              You have {items.filter((t) => t.status === "pending").length} template
              {items.filter((t) => t.status === "pending").length === 1 ? "" : "s"} in review.
              Meta usually approves templates within 15 minutes to a few hours; some Marketing
              templates can take up to 24 hours. Status updates automatically when Meta responds —
              click <strong>Sync from Meta</strong> to force-refresh.
            </p>
          </div>
        </div>
      )}

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

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add templates to your library</DialogTitle>
            <DialogDescription>
              Choose platform-approved{" "}
              {addDialogScope === "transactional" ? "transactional (utility)" : "promotional (marketing)"}{" "}
              templates. Only selected templates appear in your library.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto py-2 min-h-[200px]">
            {availableLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : availableTemplates.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                No additional templates available. Your admin may need to approve and publish templates in
                Platform Template Manager.
              </p>
            ) : (
              <div className="space-y-2">
                {availableTemplates.map((entry) => {
                  const checked = selectedPlatformIds.includes(entry.platformTemplateId)
                  return (
                    <label
                      key={entry.platformTemplateId}
                      className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-slate-50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => togglePlatformSelection(entry.platformTemplateId, v === true)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{entry.elementName}</code>
                          {entry.slotKey ? (
                            <Badge variant="outline" className="text-xs">
                              {NOTIFICATION_SLOT_LABELS[entry.slotKey] || entry.slotKey}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{entry.content}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={availableLoading || !availableTemplates.length}
              onClick={() => setSelectedPlatformIds(availableTemplates.map((e) => e.platformTemplateId))}
            >
              Select all
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddSelectedTemplates}
                disabled={busy === `add-selected-${addDialogScope}` || !selectedPlatformIds.length}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {busy === `add-selected-${addDialogScope}` ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Add {selectedPlatformIds.length ? `(${selectedPlatformIds.length})` : ""}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <WhatsAppTemplateFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        editing={editing as WhatsAppTemplateFormEditing | null}
        onSaved={refresh}
        uploadHeaderMedia={(format, media, contentType) =>
          WhatsAppTemplatesAPI.uploadHeaderMedia(format, media, contentType)
        }
        onSave={async (payload, editingId) => {
          try {
            const res = editingId
              ? await WhatsAppTemplatesAPI.update(editingId, payload)
              : await WhatsAppTemplatesAPI.create(payload)
            if (res.success) return { success: true }
            return { success: false, error: res.error }
          } catch (err: any) {
            const apiErr = err?.response?.data
            const detailStr = Array.isArray(apiErr?.details)
              ? apiErr.details
                  .map(
                    (d: any) =>
                      `${Array.isArray(d.path) ? d.path.join(".") : d.path || ""}: ${d.message}`
                  )
                  .filter(Boolean)
                  .join("; ")
              : ""
            return {
              success: false,
              error:
                detailStr ||
                (typeof apiErr?.error === "string" ? apiErr.error : "") ||
                err?.message ||
                "Could not save template",
            }
          }
        }}
      />
    </div>
  )
}
