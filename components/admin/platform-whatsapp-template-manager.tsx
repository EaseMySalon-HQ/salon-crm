"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  FileText,
  Loader2,
  PlusCircle,
  RefreshCw,
  Send,
  Trash2,
  Download,
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
  rejectionReason?: string | null
  components?: {
    body?: { text?: string; examples?: string[][] }
    footer?: { text?: string }
    buttons?: TemplateButton[]
  }
}

const CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"] as const
const BUTTON_TYPES = ["QUICK_REPLY", "URL", "PHONE_NUMBER"] as const
type ButtonType = (typeof BUTTON_TYPES)[number]

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
  default: "Default template",
}

interface TemplateButton {
  type: ButtonType
  text: string
  url?: string
  phone?: string
  urlExample?: string
}

function urlHasDynamicPlaceholder(url: string): boolean {
  return /\{\{\d+\}\}/.test(url)
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

/** Consecutive {{1}}…{{n}} param slots (Gupshup positional params). */
function placeholderParamSlots(text: string): number[] {
  const nums = findPlaceholders(text)
  if (!nums.length) return []
  const max = nums[nums.length - 1]
  return Array.from({ length: max }, (_, i) => i + 1)
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
  const [testingTemplate, setTestingTemplate] = useState<PlatformTemplate | null>(null)
  const [testPhone, setTestPhone] = useState("")
  const [testParams, setTestParams] = useState<string[]>([])
  const [editing, setEditing] = useState<PlatformTemplate | null>(null)

  const [form, setForm] = useState({
    name: "",
    language: "en_US",
    category: "UTILITY" as (typeof CATEGORIES)[number],
    bodyText: "",
    footerText: "",
  })
  const [bodySamples, setBodySamples] = useState<string[]>([])
  const [buttons, setButtons] = useState<TemplateButton[]>([])

  const bodyPlaceholders = useMemo(() => findPlaceholders(form.bodyText), [form.bodyText])
  const testPlaceholders = useMemo(
    () => placeholderParamSlots(testingTemplate?.components?.body?.text || ""),
    [testingTemplate]
  )

  useEffect(() => {
    setBodySamples((prev) => {
      const next = [...prev]
      while (next.length < bodyPlaceholders.length) next.push("")
      next.length = bodyPlaceholders.length
      return next
    })
  }, [bodyPlaceholders.length])

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
    setForm({
      name: "",
      language: "en_US",
      category: "UTILITY",
      bodyText: "",
      footerText: "",
    })
    setBodySamples([])
    setButtons([])
    setDialogOpen(true)
  }

  const openEdit = (tpl: PlatformTemplate) => {
    setEditing(tpl)
    const examples = tpl.components?.body?.examples?.[0] || []
    setForm({
      name: tpl.name,
      language: tpl.language,
      category: (tpl.category as (typeof CATEGORIES)[number]) || "UTILITY",
      bodyText: tpl.components?.body?.text || "",
      footerText: tpl.components?.footer?.text || "",
    })
    setBodySamples(Array.isArray(examples) ? examples.slice() : [])
    setButtons((tpl.components?.buttons as TemplateButton[]) || [])
    setDialogOpen(true)
  }

  const addButton = (type: ButtonType) => {
    if (buttons.length >= 3) return
    setButtons((prev) => [...prev, { type, text: "", url: "", phone: "", urlExample: "" }])
  }

  const updateButton = (idx: number, patch: Partial<TemplateButton>) => {
    setButtons((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  }

  const removeButton = (idx: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== idx))
  }

  const buildPayload = () => {
    const exampleRow =
      bodyPlaceholders.length > 0
        ? bodyPlaceholders.map((_, i) => bodySamples[i]?.trim() || "")
        : null
    return {
      name: form.name.trim(),
      language: form.language.trim(),
      category: form.category,
      components: {
        body: {
          text: form.bodyText,
          examples: exampleRow ? [exampleRow] : [],
        },
        ...(form.footerText.trim() ? { footer: { text: form.footerText.trim() } } : {}),
        ...(buttons.length ? { buttons } : {}),
      },
    }
  }

  const onSave = async () => {
    if (!form.name.trim() || !form.bodyText.trim()) {
      toast({ title: "Name and body text are required", variant: "destructive" })
      return
    }
    if (bodyPlaceholders.length > 0 && bodySamples.some((s) => !s.trim())) {
      toast({ title: "Provide a sample value for each variable", variant: "destructive" })
      return
    }
    for (const b of buttons) {
      if (!b.text.trim()) {
        toast({ title: "Every button needs a label", variant: "destructive" })
        return
      }
      if (b.type === "URL" && !b.url?.trim()) {
        toast({ title: "URL buttons need a URL", variant: "destructive" })
        return
      }
      if (b.type === "URL" && b.url && urlHasDynamicPlaceholder(b.url) && !b.urlExample?.trim()) {
        toast({ title: "Dynamic URL buttons need a sample URL", variant: "destructive" })
        return
      }
      if (b.type === "PHONE_NUMBER" && !b.phone?.trim()) {
        toast({ title: "Phone buttons need a number", variant: "destructive" })
        return
      }
    }
    setBusy(true)
    try {
      const payload = buildPayload()
      const url = editing
        ? `${API_URL}/admin/gupshup/platform-templates/${editing._id}`
        : `${API_URL}/admin/gupshup/platform-templates`
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        credentials: "include",
        headers: { ...adminRequestHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Save failed")
      setDialogOpen(false)
      toast({ title: editing ? "Template updated" : "Template created" })
      await load()
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const openMap = (tpl: PlatformTemplate) => {
    setMappingTemplate(tpl)
    setMapSlotKey(tpl.slotKey || "")
    setMapDialogOpen(true)
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
                    <TableCell className="font-mono text-xs max-w-[120px] truncate">
                      {tpl.gupshupTemplateId || "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New platform template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Element name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ems_my_template"
                  disabled={Boolean(editing)}
                />
              </div>
              <div className="space-y-1">
                <Label>Language</Label>
                <Input
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                  placeholder="en_US"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as (typeof CATEGORIES)[number] }))}
              >
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
            </div>
            <div className="space-y-1">
              <Label>Body text *</Label>
              <Textarea
                value={form.bodyText}
                onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
                rows={4}
                placeholder="Hi {{1}}, your appointment at {{2}} is confirmed."
              />
            </div>
            {bodyPlaceholders.length > 0 && (
              <div className="space-y-2">
                <Label>Sample values</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {bodyPlaceholders.map((n, i) => (
                    <div key={n} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{`{{${n}}}`}</Label>
                      <Input
                        value={bodySamples[i] || ""}
                        onChange={(e) =>
                          setBodySamples((prev) => {
                            const next = [...prev]
                            next[i] = e.target.value
                            return next
                          })
                        }
                        placeholder={n === 1 ? "Priya" : n === 2 ? "Glow Salon" : "15 Jul, 4 PM"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>Footer (optional)</Label>
              <Input
                value={form.footerText}
                onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))}
                placeholder="Reply STOP to opt out"
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="mb-0">Buttons (optional)</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => addButton("QUICK_REPLY")} disabled={buttons.length >= 3}>
                    + Quick reply
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addButton("URL")} disabled={buttons.length >= 3}>
                    + URL
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => addButton("PHONE_NUMBER")} disabled={buttons.length >= 3}>
                    + Phone
                  </Button>
                </div>
              </div>
              {buttons.length === 0 ? (
                <p className="text-xs text-muted-foreground">No buttons. Max 3 for most template types.</p>
              ) : (
                <div className="space-y-2">
                  {buttons.map((b, i) => (
                    <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select value={b.type} onValueChange={(v) => updateButton(i, { type: v as ButtonType })}>
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
                      <div className="space-y-1">
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={b.text}
                          onChange={(e) => updateButton(i, { text: e.target.value })}
                          placeholder="View bill"
                          maxLength={25}
                        />
                      </div>
                      {b.type === "URL" && (
                        <div className="space-y-2 sm:col-span-2">
                          <div className="space-y-1">
                            <Label className="text-xs">URL</Label>
                            <Input
                              value={b.url || ""}
                              onChange={(e) => updateButton(i, { url: e.target.value })}
                              placeholder="https://easemysalon.com/receipt/public/{{1}}"
                            />
                            <p className="text-xs text-muted-foreground">
                              Use {"{{1}}"} in the URL for dynamic paths when sending.
                            </p>
                          </div>
                          {b.url && urlHasDynamicPlaceholder(b.url) && (
                            <div className="space-y-1">
                              <Label className="text-xs">Sample URL *</Label>
                              <Input
                                value={b.urlExample || ""}
                                onChange={(e) => updateButton(i, { urlExample: e.target.value })}
                                placeholder="https://easemysalon.com/receipt/public/INV-000001/abc123"
                              />
                              <p className="text-xs text-muted-foreground">
                                Required for Gupshup/Meta approval — full URL with the variable filled in.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {b.type === "PHONE_NUMBER" && (
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs">Phone</Label>
                          <Input
                            value={b.phone || ""}
                            onChange={(e) => updateButton(i, { phone: e.target.value })}
                            placeholder="919876543210"
                          />
                        </div>
                      )}
                      <div className="sm:col-span-2 flex justify-end">
                        <Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={() => removeButton(i)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  )
}
