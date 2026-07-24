"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"
import {
  WhatsAppTemplateFormDialog,
  findPlaceholders,
  type WhatsAppTemplateFormEditing,
  type WhatsAppTemplateSavePayload,
} from "@/components/whatsapp/templates/whatsapp-template-form-dialog"
import {
  FileText,
  Eye,
  Loader2,
  PlusCircle,
  RefreshCw,
  Send,
  Trash2,
  Download,
  Copy,
  Check,
} from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

type TemplateStatus = "draft" | "pending" | "approved" | "rejected" | "paused" | string

interface PlatformTemplate {
  _id: string
  name: string
  language: string
  category: string
  slotKey?: string | null
  status: TemplateStatus
  gupshupTemplateId?: string | null
  publishedToTenantLibrary?: boolean
  rejectionReason?: string | null
  components?: WhatsAppTemplateFormEditing["components"]
}

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
  platformLeadWelcome: "Platform lead welcome",
  businessAccountCreated: "Business account created",
  default: "Default template",
}

function statusBadge(status: TemplateStatus) {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-600">Approved</Badge>
    case "pending":
      return <Badge variant="secondary">Pending</Badge>
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>
    case "draft":
      return <Badge variant="outline">Draft</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

/** Consecutive {{1}}…{{n}} param slots (Gupshup positional params). */
function placeholderParamSlots(text: string): number[] {
  const nums = findPlaceholders(text)
  if (!nums.length) return []
  const max = nums[nums.length - 1]
  return Array.from({ length: max }, (_, i) => i + 1)
}

function applyBodySamples(text: string, examples: string[] = []): string {
  const slots = placeholderParamSlots(text)
  return slots.reduce((out, n, i) => {
    const sample = examples[i]?.trim()
    return out.replaceAll(`{{${n}}}`, sample || `{{${n}}}`)
  }, text)
}

function PlatformTemplateMessagePreview({ tpl }: { tpl: PlatformTemplate }) {
  const bodyText = tpl.components?.body?.text || ""
  const examples = tpl.components?.body?.examples?.[0] || []
  const renderedBody = applyBodySamples(bodyText, examples)
  const footerText = tpl.components?.footer?.text || ""
  const buttons = tpl.components?.buttons || []
  const header = tpl.components?.header
  const headerFormat = header?.format && header.format !== "NONE" ? header.format : null

  return (
    <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 p-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {headerFormat ? (
          <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-800">
            {headerFormat === "TEXT"
              ? header?.text || "Header"
              : `${String(headerFormat).toLowerCase()} header`}
          </div>
        ) : null}
        <div className="px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap">
          {renderedBody || <span className="text-slate-400">Empty body</span>}
        </div>
        {footerText ? <div className="px-4 pb-3 text-xs text-slate-500">{footerText}</div> : null}
        {buttons.length > 0 ? (
          <div className="border-t border-slate-100 divide-y divide-slate-100">
            {buttons.map((b, i) => (
              <div key={i} className="px-4 py-2.5 text-sm text-emerald-700 text-center font-medium">
                {b.text || `Button ${i + 1}`}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function PlatformWhatsAppTemplateManager() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<PlatformTemplate[]>([])
  const [slotKeys, setSlotKeys] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mapDialogOpen, setMapDialogOpen] = useState(false)
  const [mappingTemplate, setMappingTemplate] = useState<PlatformTemplate | null>(null)
  const [mapSlotKey, setMapSlotKey] = useState("")
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [viewingTemplate, setViewingTemplate] = useState<PlatformTemplate | null>(null)
  const [testingTemplate, setTestingTemplate] = useState<PlatformTemplate | null>(null)
  const [testPhone, setTestPhone] = useState("")
  const [testParams, setTestParams] = useState<string[]>([])
  const [copiedGupshupId, setCopiedGupshupId] = useState<string | null>(null)
  const [editing, setEditing] = useState<PlatformTemplate | null>(null)

  const testPlaceholders = useMemo(
    () => placeholderParamSlots(testingTemplate?.components?.body?.text || ""),
    [testingTemplate]
  )

  const copyGupshupId = useCallback(
    async (id: string) => {
      try {
        await navigator.clipboard.writeText(id)
        setCopiedGupshupId(id)
        window.setTimeout(() => setCopiedGupshupId((current) => (current === id ? null : current)), 2000)
        toast({ title: "Copied", description: "Gupshup template ID copied to clipboard" })
      } catch {
        toast({
          title: "Copy failed",
          description: "Could not copy to clipboard",
          variant: "destructive",
        })
      }
    },
    [toast]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, metaRes] = await Promise.all([
        fetch(`${API_URL}/admin/gupshup/platform-templates`, {
          credentials: "include",
          headers: adminRequestHeaders(),
        }),
        fetch(`${API_URL}/admin/gupshup/platform-templates/meta`, {
          credentials: "include",
          headers: adminRequestHeaders(),
        }),
      ])
      const listJson = await listRes.json()
      const metaJson = await metaRes.json()
      if (!listRes.ok || !listJson?.success) throw new Error(listJson?.error || "Load failed")
      setTemplates(listJson.data || [])
      if (metaJson?.success) setSlotKeys(metaJson.data?.slotKeys || [])
    } catch (err: unknown) {
      toast({
        title: "Failed to load templates",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (tpl: PlatformTemplate) => {
    setEditing(tpl)
    setDialogOpen(true)
  }

  const savePlatformTemplate = async (payload: WhatsAppTemplateSavePayload, editingId?: string) => {
    const url = editingId
      ? `${API_URL}/admin/gupshup/platform-templates/${editingId}`
      : `${API_URL}/admin/gupshup/platform-templates`
    const res = await fetch(url, {
      method: editingId ? "PUT" : "POST",
      credentials: "include",
      headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok || !json?.success) {
      return { success: false, error: json?.error || "Save failed" }
    }
    return { success: true }
  }

  const uploadPlatformHeaderMedia = async (
    format: "IMAGE" | "VIDEO" | "DOCUMENT",
    media: string,
    contentType?: string
  ) => {
    const res = await fetch(`${API_URL}/admin/gupshup/platform-templates/upload-header-media`, {
      method: "POST",
      credentials: "include",
      headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ format, media, ...(contentType ? { contentType } : {}) }),
    })
    const json = await res.json()
    if (!res.ok || !json?.success) {
      return { success: false, error: json?.error || "Upload failed" }
    }
    return { success: true, data: json.data }
  }

  const openMap = (tpl: PlatformTemplate) => {
    setMappingTemplate(tpl)
    setMapSlotKey(tpl.slotKey || "")
    setMapDialogOpen(true)
  }

  const openView = (tpl: PlatformTemplate) => {
    setViewingTemplate(tpl)
    setViewDialogOpen(true)
  }

  const openTest = (tpl: PlatformTemplate) => {
    if (!tpl.gupshupTemplateId) {
      toast({
        title: "Sync required",
        description: "Sync this template with Gupshup first to get the template ID.",
        variant: "destructive",
      })
      return
    }
    const slots = placeholderParamSlots(tpl.components?.body?.text || "")
    const examples = tpl.components?.body?.examples?.[0] || []
    setTestingTemplate(tpl)
    setTestPhone("")
    setTestParams(slots.map((_, i) => examples[i] || ""))
    setTestDialogOpen(true)
  }

  const onSendTest = async () => {
    if (!testingTemplate) return
    const phone = testPhone.replace(/\D/g, "")
    if (!phone || phone.length < 10) {
      toast({ title: "Enter a valid phone number", variant: "destructive" })
      return
    }
    if (testPlaceholders.length > 0 && testParams.some((s) => !s.trim())) {
      toast({ title: "Provide a value for each variable", variant: "destructive" })
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/platform-templates/${testingTemplate._id}/test`, {
        method: "POST",
        credentials: "include",
        headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          to: phone,
          params: testParams,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Test send failed")
      setTestDialogOpen(false)
      toast({
        title: "Test message sent",
        description: `Sent to ${phone} via the platform WhatsApp number.`,
      })
    } catch (err: unknown) {
      toast({
        title: "Test send failed",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const onSaveMap = async () => {
    if (!mappingTemplate) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/platform-templates/${mappingTemplate._id}/map`, {
        method: "PUT",
        credentials: "include",
        headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ slotKey: mapSlotKey.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Map failed")
      setMapDialogOpen(false)
      const link = json.notificationLink as
        | { applied?: boolean; reason?: string; variableMapping?: Record<string, string> }
        | undefined
      const varCount = link?.variableMapping ? Object.keys(link.variableMapping).length : 0
      if (mapSlotKey.trim() && link?.applied) {
        toast({
          title: "Notification mapped",
          description: `${mappingTemplate.name} → ${NOTIFICATION_SLOT_LABELS[mapSlotKey] || mapSlotKey}. Template ID and ${varCount} variable mapping(s) saved to Admin notifications.`,
        })
      } else if (mapSlotKey.trim()) {
        toast({
          title: "Slot saved",
          description:
            link?.reason ||
            `${mappingTemplate.name} is linked to ${NOTIFICATION_SLOT_LABELS[mapSlotKey] || mapSlotKey}. Sync approval and Gupshup ID, then map again to update Admin notifications.`,
        })
      } else {
        toast({
          title: "Mapping cleared",
          description: `${mappingTemplate.name} is no longer linked to a notification type.`,
        })
      }
      await load()
    } catch (err: unknown) {
      toast({
        title: "Map failed",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const onTogglePublish = async (tpl: PlatformTemplate) => {
    setBusy(true)
    try {
      const next = !(tpl.publishedToTenantLibrary !== false)
      const res = await fetch(`${API_URL}/admin/gupshup/platform-templates/${tpl._id}/publish`, {
        method: "PUT",
        credentials: "include",
        headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ publishedToTenantLibrary: next }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Update failed")
      toast({
        title: next ? "Published to tenant catalog" : "Hidden from tenant catalog",
        description: tpl.name,
      })
      await load()
    } catch (err: unknown) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/platform-templates/${id}/submit`, {
        method: "POST",
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Submit failed")
      toast({ title: "Submitted to Gupshup", description: "Awaiting Meta approval." })
      await load()
    } catch (err: unknown) {
      toast({
        title: "Submit failed",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const onSync = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/platform-templates/${id}/sync`, {
        method: "POST",
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Sync failed")
      toast({ title: "Status synced", description: `Status: ${json.data?.status}` })
      await load()
    } catch (err: unknown) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (tpl: PlatformTemplate) => {
    const isApproved = tpl.status === "approved"
    const msg = isApproved
      ? `Remove "${tpl.name}" from the platform library?\n\nThis deletes the local row only. The template stays on Gupshup and salons that already added it keep their copy.`
      : `Delete template "${tpl.name}"?`
    if (!confirm(msg)) return
    setBusy(true)
    try {
      const url = isApproved
        ? `${API_URL}/admin/gupshup/platform-templates/${tpl._id}?force=1`
        : `${API_URL}/admin/gupshup/platform-templates/${tpl._id}`
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Delete failed")
      toast({
        title: isApproved ? "Removed from library" : "Template deleted",
        description: isApproved
          ? "Salons will no longer see this template in their library."
          : undefined,
      })
      await load()
    } catch (err: unknown) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const onImportCatalog = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/platform-templates/import-catalog`, {
        method: "POST",
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Import failed")
      toast({
        title: "Catalog imported",
        description: `${json.data?.imported || 0} draft(s) created.`,
      })
      await load()
    } catch (err: unknown) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const onSubmitAll = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/platform-templates/submit-all`, {
        method: "POST",
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Submit failed")
      toast({
        title: "Bulk submit complete",
        description: `${json.data?.submitted?.length || 0} submitted, ${json.data?.failed?.length || 0} failed.`,
      })
      await load()
    } catch (err: unknown) {
      toast({ title: "Submit all failed", description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const onSyncSlots = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/admin/gupshup/templates/sync-slots`, {
        method: "POST",
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Sync failed")
      toast({
        title: "Notification slots updated",
        description: `${json.data?.linked?.length || 0} approved template(s) linked.`,
      })
    } catch (err: unknown) {
      toast({ title: "Sync slots failed", description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Template Manager</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Platform WhatsApp templates
            </CardTitle>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onImportCatalog} disabled={busy}>
              <Download className="h-4 w-4 mr-1" /> Import starter catalog
            </Button>
            <Button variant="outline" size="sm" onClick={onSubmitAll} disabled={busy}>
              <Send className="h-4 w-4 mr-1" /> Submit all drafts
            </Button>
            <Button variant="outline" size="sm" onClick={onSyncSlots} disabled={busy}>
              <RefreshCw className="h-4 w-4 mr-1" /> Sync approved → slots
            </Button>
            <Button size="sm" onClick={openCreate} disabled={busy}>
              <PlusCircle className="h-4 w-4 mr-1" /> New template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No platform templates yet. Create one or import the starter catalog.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Notification</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tenant catalog</TableHead>
                  <TableHead>Gupshup ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl._id}>
                    <TableCell className="font-mono text-xs">{tpl.name}</TableCell>
                    <TableCell className="text-xs">
                      {tpl.slotKey ? NOTIFICATION_SLOT_LABELS[tpl.slotKey] || tpl.slotKey : "—"}
                    </TableCell>
                    <TableCell>{tpl.category}</TableCell>
                    <TableCell>{statusBadge(tpl.status)}</TableCell>
                    <TableCell>
                      {tpl.status === "approved" ? (
                        <Button
                          variant={tpl.publishedToTenantLibrary !== false ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => onTogglePublish(tpl)}
                          disabled={busy}
                        >
                          {tpl.publishedToTenantLibrary !== false ? "Published" : "Hidden"}
                        </Button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[200px]">
                      {tpl.gupshupTemplateId ? (
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate" title={tpl.gupshupTemplateId}>
                            {tpl.gupshupTemplateId}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => void copyGupshupId(tpl.gupshupTemplateId!)}
                            title="Copy Gupshup ID"
                            aria-label="Copy Gupshup ID"
                          >
                            {copiedGupshupId === tpl.gupshupTemplateId ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openView(tpl)} disabled={busy}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      {tpl.status === "approved" && (
                        <Button variant="ghost" size="sm" onClick={() => openMap(tpl)} disabled={busy}>
                          Map
                        </Button>
                      )}
                      {(tpl.status === "draft" || tpl.status === "rejected") && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(tpl)} disabled={busy}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => onSubmit(tpl._id)} disabled={busy}>
                            Submit
                          </Button>
                        </>
                      )}
                      {tpl.status === "approved" && (
                        <Button variant="ghost" size="sm" onClick={() => openTest(tpl)} disabled={busy}>
                          Test
                        </Button>
                      )}
                      {tpl.gupshupTemplateId && (
                        <Button variant="ghost" size="sm" onClick={() => onSync(tpl._id)} disabled={busy}>
                          Sync
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => onDelete(tpl)}
                        disabled={busy}
                        title="Delete template"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <WhatsAppTemplateFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing as WhatsAppTemplateFormEditing | null}
        onSaved={load}
        defaultCategory="UTILITY"
        showPublishForTenants
        createTitle="New platform template"
        editTitle="Edit platform template"
        uploadHeaderMedia={uploadPlatformHeaderMedia}
        onSave={async (payload, editingId) => {
          setBusy(true)
          try {
            return await savePlatformTemplate(payload, editingId)
          } finally {
            setBusy(false)
          }
        }}
      />

      <Dialog open={mapDialogOpen} onOpenChange={setMapDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Map to notification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Template</Label>
              <p className="font-mono text-sm">{mappingTemplate?.name}</p>
            </div>
            <div className="space-y-1">
              <Label>Notification type</Label>
              <Select
                value={mapSlotKey || "__none__"}
                onValueChange={(v) => setMapSlotKey(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select notification type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {slotKeys.map((k) => (
                    <SelectItem key={k} value={k}>
                      {NOTIFICATION_SLOT_LABELS[k] || k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Links this approved template to a notification type and auto-configures template variable
                mapping (body_1, button_1, …) in Admin → Notifications → WhatsApp, same as the WhatsApp tab.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMapDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSaveMap} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send test message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground">Template</Label>
              <p className="font-mono text-sm">{testingTemplate?.name}</p>
              {testingTemplate?.gupshupTemplateId && (
                <p className="font-mono text-xs text-muted-foreground">ID: {testingTemplate.gupshupTemplateId}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="test-phone">Recipient phone</Label>
              <Input
                id="test-phone"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="919876543210"
              />
            </div>
            {testPlaceholders.length > 0 && (
              <div className="space-y-2">
                <Label>Template variables</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {testPlaceholders.map((n, i) => (
                    <div key={n} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{`{{${n}}}`}</Label>
                      <Input
                        value={testParams[i] || ""}
                        onChange={(e) =>
                          setTestParams((prev) => {
                            const next = [...prev]
                            next[i] = e.target.value
                            return next
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSendTest} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Template message</DialogTitle>
            <DialogDescription>
              Preview of how this template appears in WhatsApp. Sample values fill {"{{n}}"} placeholders
              when configured.
            </DialogDescription>
          </DialogHeader>
          {viewingTemplate ? (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{viewingTemplate.name}</code>
                <Badge variant="outline">{viewingTemplate.category}</Badge>
                {statusBadge(viewingTemplate.status)}
                <span className="text-muted-foreground">{viewingTemplate.language}</span>
              </div>
              {viewingTemplate.slotKey ? (
                <p className="text-xs text-muted-foreground">
                  Notification: {NOTIFICATION_SLOT_LABELS[viewingTemplate.slotKey] || viewingTemplate.slotKey}
                </p>
              ) : null}
              <PlatformTemplateMessagePreview tpl={viewingTemplate} />
              {viewingTemplate.components?.body?.text ? (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-slate-700">Raw body text</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-[11px] text-slate-700">
                    {viewingTemplate.components.body.text}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
