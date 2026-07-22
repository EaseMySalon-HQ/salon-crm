"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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
import { useToast } from "@/components/ui/use-toast"
import { compressImageFile } from "@/lib/compress-showcase-image"
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Phone,
  Trash2,
  Upload,
  X,
} from "lucide-react"

export const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const
export type Category = (typeof CATEGORIES)[number]

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

export type WAButton = {
  type: ButtonType
  text: string
  url?: string | null
  phone?: string | null
  urlExample?: string | null
}

export type WAComponents = {
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

export type WhatsAppTemplateFormEditing = {
  _id: string
  name: string
  language: string
  category: Category | string
  components?: WAComponents
  publishedToTenantLibrary?: boolean
}

export type WhatsAppTemplateSavePayload = {
  name: string
  language: string
  category: Category
  components: WAComponents
  variables?: Record<string, unknown>
  samples?: Record<string, unknown>
  publishedToTenantLibrary?: boolean
}

export type HeaderMediaUploadResult = {
  success: boolean
  data?: { url: string }
  error?: string
}

export function findPlaceholders(text: string): number[] {
  const set = new Set<number>()
  const re = /\{\{(\d+)\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > 0) set.add(n)
  }
  return Array.from(set).sort((a, b) => a - b)
}

function urlHasDynamicPlaceholder(url: string): boolean {
  return /\{\{\d+\}\}/.test(url)
}

export function WhatsAppTemplateFormDialog({
  open,
  onClose,
  editing,
  onSaved,
  onSave,
  uploadHeaderMedia,
  defaultCategory = "MARKETING",
  showPublishForTenants = false,
  createTitle = "New WhatsApp template",
  editTitle = "Edit template",
}: {
  open: boolean
  onClose: () => void
  editing: WhatsAppTemplateFormEditing | null
  onSaved: () => void
  onSave: (payload: WhatsAppTemplateSavePayload, editingId?: string) => Promise<{ success: boolean; error?: unknown }>
  uploadHeaderMedia: (
    format: "IMAGE" | "VIDEO" | "DOCUMENT",
    media: string,
    contentType?: string
  ) => Promise<HeaderMediaUploadResult>
  defaultCategory?: Category
  showPublishForTenants?: boolean
  createTitle?: string
  editTitle?: string
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
  const [publishedToTenantLibrary, setPublishedToTenantLibrary] = useState(true)

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
      setCategory((editing.category as Category) || defaultCategory)
      setPublishedToTenantLibrary(editing.publishedToTenantLibrary !== false)
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
      setCategory(defaultCategory)
      setPublishedToTenantLibrary(true)
      setHeaderFormat("NONE")
      setHeaderText("")
      setHeaderMediaUrl("")
      setBody("")
      setBodySamples([])
      setFooter("")
      setButtons([])
    }
  }, [editing, open, defaultCategory])

  function addButton(type: ButtonType) {
    if (buttons.length >= 10) {
      toast({ title: "Max 10 buttons", variant: "destructive" })
      return
    }
    setButtons((prev) => [...prev, { type, text: "", url: "", phone: "", urlExample: "" }])
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
      const res = await uploadHeaderMedia(headerFormat, media, file.type)
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
      if (b.type === "URL" && b.url && urlHasDynamicPlaceholder(b.url) && !b.urlExample?.trim()) {
        toast({ title: "Dynamic URL buttons need a sample URL", variant: "destructive" })
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

      const payload: WhatsAppTemplateSavePayload = {
        name: name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        language,
        category,
        components,
        variables,
        samples: { body: bodySamples },
        ...(showPublishForTenants ? { publishedToTenantLibrary } : {}),
      }
      const res = await onSave(payload, editing?._id)
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
              <DialogTitle>{editing ? editTitle : createTitle}</DialogTitle>
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


              {showPublishForTenants && (
                <div className="sm:col-span-2">
                  <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-slate-50">
                    <Checkbox
                      checked={publishedToTenantLibrary}
                      onCheckedChange={(v) => setPublishedToTenantLibrary(v === true)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium leading-none">Publish this for tenants</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        When approved, tenants can find and add this template from their library catalog.
                      </p>
                    </div>
                  </label>
                </div>
              )}

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
                      <div className="md:col-span-12 space-y-2">
                        <div>
                          <Label className="text-xs">URL</Label>
                          <Input
                            value={b.url || ""}
                            onChange={(e) => updateButton(i, { url: e.target.value })}
                            placeholder="https://easemysalon.com/booking/{{1}}"
                          />
                        </div>
                        {b.url && urlHasDynamicPlaceholder(b.url) && (
                          <div>
                            <Label className="text-xs">Sample URL *</Label>
                            <Input
                              value={b.urlExample || ""}
                              onChange={(e) => updateButton(i, { urlExample: e.target.value })}
                              placeholder="https://easemysalon.com/booking/abc123"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Required for Gupshup/Meta approval — full URL with the variable filled in.
                            </p>
                          </div>
                        )}
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