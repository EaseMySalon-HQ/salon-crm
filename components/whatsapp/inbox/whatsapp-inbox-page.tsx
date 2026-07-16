"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ListSkeleton } from "@/components/loading"
import { Separator } from "@/components/ui/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
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
import { WhatsAppInboxAPI, WhatsAppTemplatesAPI } from "@/lib/api"
import {
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  MessageSquareReply,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  UserCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"

/* ============================== Types ============================== */

type InboxClient = {
  _id?: string
  name?: string
  phone?: string
  email?: string
  whatsappConsent?: {
    optedIn?: boolean
    waMarketingOptOut?: boolean
    optInReason?: string | null
    optOutReason?: string | null
    optedInAt?: string | null
    optedOutAt?: string | null
    waMarketingOptOutAt?: string | null
  } | null
} | null

type Conversation = {
  _id: string
  recipientPhone: string
  unreadCount?: number
  lastInboundPreview?: string | null
  lastInboundAt?: string | null
  lastOutboundAt?: string | null
  cswOpen?: boolean
  fepOpen?: boolean
  cswExpiresAt?: string | null
  cswExpiresInMs?: number
  resolved?: boolean
  client?: InboxClient
}

type Message = {
  _id: string
  direction: "inbound" | "outbound"
  status: "queued" | "sent" | "delivered" | "read" | "failed"
  inboundText?: string | null
  payload?: { templateName?: string; serviceText?: string; isService?: boolean } | null
  category?: string
  failureReason?: string | null
  timestamp: string
}

type Template = {
  _id: string
  name: string
  status: string
  language: string
  category: string
}

type Placeholder = {
  key: string
  label: string
  sample: string
  index: number
}

type TemplateDetail = {
  name: string
  language: string
  status: string
  category: string
  components: {
    header?: { format?: string | null; text?: string | null }
    body?: { text?: string | null }
    footer?: { text?: string | null }
  }
  placeholders: { header: Placeholder[]; body: Placeholder[] }
}

type FilterMode = "all" | "unread" | "open" | "resolved" | "optedout"

/* ============================== Helpers ============================== */

const FILTERS: { id: FilterMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "open", label: "CSW open" },
  { id: "resolved", label: "Resolved" },
  { id: "optedout", label: "Opted out" },
]

function getInitials(input?: string | null) {
  if (!input) return "·"
  const parts = String(input).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "·"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatPhoneE164ish(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`
  }
  return phone
}

function formatCountdown(ms: number) {
  if (!ms || ms <= 0) return "Closed"
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}

function StatusTick({ status, className = "" }: { status: Message["status"]; className?: string }) {
  if (status === "queued" || status === "sent") {
    return <Check className={`h-3.5 w-3.5 ${className}`} />
  }
  if (status === "delivered") {
    return <CheckCheck className={`h-3.5 w-3.5 ${className}`} />
  }
  if (status === "read") {
    return <CheckCheck className={`h-3.5 w-3.5 ${className} text-sky-300`} />
  }
  if (status === "failed") {
    return <XCircle className={`h-3.5 w-3.5 ${className} text-red-300`} />
  }
  return null
}

/* ============================== Component ============================== */

export function WhatsAppInboxPage() {
  const { toast } = useToast()
  const [addonDisabled, setAddonDisabled] = useState(false)
  const [appNotConnected, setAppNotConnected] = useState(false)

  /* List state */
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filter, setFilter] = useState<FilterMode>("all")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [listLoading, setListLoading] = useState(true)

  /* Thread state */
  const [active, setActive] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)

  /* Composer state */
  const [composerMode, setComposerMode] = useState<"text" | "template">("text")
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateName, setTemplateName] = useState<string>("")
  const [templateLanguage, setTemplateLanguage] = useState<string>("en_US")
  const [templateDetail, setTemplateDetail] = useState<TemplateDetail | null>(null)
  const [templateDetailLoading, setTemplateDetailLoading] = useState(false)
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({})

  /* Consent dialog */
  const [consentDialog, setConsentDialog] = useState<{ open: boolean; optedIn: boolean }>({
    open: false,
    optedIn: true,
  })
  const [consentReason, setConsentReason] = useState("")
  const [consentSaving, setConsentSaving] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeThreadIdRef = useRef<string | null>(null)
  const lastMessageIdRef = useRef<string | null>(null)

  /* Live CSW countdown ticker (recomputes every 30s) */
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  /* Debounce search */
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  /* ------------------------ Data loaders ------------------------ */

  const loadList = useCallback(async () => {
    try {
      const res = await WhatsAppInboxAPI.list({
        filter,
        q: debouncedSearch || undefined,
        limit: 100,
      })
      if (res.success) {
        setConversations(res.data || [])
        setAddonDisabled(false)
        setAppNotConnected(false)
      }
    } catch (err: any) {
      const status = err?.response?.status
      const code = err?.response?.data?.code
      if (status === 403 && code === "WABA_ADDON_DISABLED") {
        setAddonDisabled(true)
        setAppNotConnected(false)
        setConversations([])
      } else if (status === 403 && code === "WHATSAPP_APP_NOT_CONNECTED") {
        setAppNotConnected(true)
        setAddonDisabled(false)
        setConversations([])
      } else {
        toast({
          title: "Failed to load inbox",
          description: err?.response?.data?.error || err?.message || "",
          variant: "destructive",
        })
      }
    } finally {
      setListLoading(false)
    }
  }, [filter, debouncedSearch, toast])

  const loadThread = useCallback(async (conversationId: string) => {
    setThreadLoading(true)
    try {
      const res = await WhatsAppInboxAPI.thread(conversationId)
      if (res.success && res.data) {
        setMessages(res.data.messages || [])
        setActive(res.data.conversation)
      }
    } catch (err: any) {
      toast({
        title: "Failed to load thread",
        description: err?.response?.data?.error || err?.message || "",
        variant: "destructive",
      })
    } finally {
      setThreadLoading(false)
    }
  }, [toast])

  const loadTemplates = useCallback(async () => {
    try {
      const res = await WhatsAppTemplatesAPI.list({ status: "approved", limit: 100 })
      if (res.success) setTemplates((res.data || []) as Template[])
    } catch {
      // non-fatal — composer just stays without template options
    }
  }, [])

  /**
   * Whenever a template is picked or its language changes, hydrate the
   * placeholder schema so we can render an input per `{{N}}`. Pre-seed
   * each input with the template's own sample value (those came from the
   * template approval submission) so a quick send is one click away.
   */
  useEffect(() => {
    if (composerMode !== "template" || !templateName) {
      setTemplateDetail(null)
      setTemplateVars({})
      return
    }
    let cancelled = false
    setTemplateDetailLoading(true)
    WhatsAppInboxAPI.templateDetail(templateName, templateLanguage)
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          setTemplateDetail(res.data)
          const seed: Record<string, string> = {}
          for (const p of res.data.placeholders.header || []) seed[p.key] = p.sample || ""
          for (const p of res.data.placeholders.body || []) seed[p.key] = p.sample || ""
          setTemplateVars(seed)
        } else {
          setTemplateDetail(null)
          setTemplateVars({})
        }
      })
      .catch(() => {
        if (cancelled) return
        setTemplateDetail(null)
        setTemplateVars({})
      })
      .finally(() => {
        if (!cancelled) setTemplateDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [composerMode, templateName, templateLanguage])

  /**
   * Live preview of the template body with placeholder values substituted.
   * Falls back to raw template text when no detail loaded yet so the
   * composer never shows an empty preview.
   */
  const templatePreview = useMemo(() => {
    const body = templateDetail?.components?.body?.text || ""
    if (!body) return ""
    return body.replace(/\{\{(\d+)\}\}/g, (_, idx) => {
      const v = templateVars[String(idx)]
      return v && v.trim() ? v : `{{${idx}}}`
    })
  }, [templateDetail, templateVars])

  /* Initial + dependent loads */
  useEffect(() => {
    setListLoading(true)
    loadList()
  }, [loadList])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  /* Auto-poll list every 12s; thread every 8s while one is open */
  useEffect(() => {
    if (addonDisabled) return
    const id = setInterval(() => {
      loadList()
    }, 12_000)
    return () => clearInterval(id)
  }, [loadList, addonDisabled])

  useEffect(() => {
    if (!active?._id || addonDisabled) return
    const id = setInterval(() => {
      loadThread(active._id)
    }, 8_000)
    return () => clearInterval(id)
  }, [active?._id, loadThread, addonDisabled])

  /** Scroll to newest message when opening a thread or when a new message arrives. */
  useEffect(() => {
    if (threadLoading || messages.length === 0 || !active?._id) return

    const latestId =
      [...messages].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ).at(-1)?._id ?? null

    const threadChanged = activeThreadIdRef.current !== active._id
    const newMessage = latestId !== lastMessageIdRef.current

    if (!threadChanged && !newMessage) return

    activeThreadIdRef.current = active._id
    lastMessageIdRef.current = latestId

    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: threadChanged ? "auto" : "smooth",
        block: "end",
      })
    })
  }, [messages, threadLoading, active?._id])

  /* ------------------------ Mutations ------------------------ */

  async function openThread(conv: Conversation) {
    setActive(conv)
    setMessages([])
    setReply("")
    setComposerMode(conv.cswOpen ? "text" : "template")
    lastMessageIdRef.current = null
    await loadThread(conv._id)
  }

  async function handleSend() {
    if (!active) return
    setSending(true)
    try {
      let res
      if (composerMode === "text") {
        if (!reply.trim()) {
          toast({ title: "Reply text is empty", variant: "destructive" })
          setSending(false)
          return
        }
        if (!active.cswOpen) {
          toast({
            title: "Customer Service Window closed",
            description: "Switch to Template reply or wait for the customer to reply first.",
            variant: "destructive",
          })
          setSending(false)
          return
        }
        res = await WhatsAppInboxAPI.reply(active._id, { mode: "text", text: reply.trim() })
      } else {
        if (!templateName) {
          toast({ title: "Pick a template", variant: "destructive" })
          setSending(false)
          return
        }
        /**
         * Block send when any placeholder is empty — Meta would otherwise
         * reject the message with a confusing "(#132000) parameter
         * mismatch" error. Surface a clear UI message instead.
         */
        const allPlaceholders = [
          ...(templateDetail?.placeholders.header || []),
          ...(templateDetail?.placeholders.body || []),
        ]
        const missing = allPlaceholders.filter(
          (p) => !templateVars[p.key] || !templateVars[p.key].trim()
        )
        if (missing.length > 0) {
          toast({
            title: "Fill all variables",
            description: `Missing: ${missing.map((p) => p.label).join(", ")}`,
            variant: "destructive",
          })
          setSending(false)
          return
        }
        res = await WhatsAppInboxAPI.reply(active._id, {
          mode: "template",
          templateName,
          language: templateLanguage,
          variables: templateVars,
        })
      }
      if (!res?.success) {
        throw new Error(res?.error || "Reply failed")
      }
      toast({ title: "Reply sent", description: composerMode === "text" ? "Free-form CSW reply delivered." : `Template "${templateName}" sent.` })
      setReply("")
      await loadThread(active._id)
    } catch (e: any) {
      toast({
        title: "Reply failed",
        description: e?.response?.data?.error || e?.message || "",
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  async function handleResolveToggle() {
    if (!active) return
    const next = !active.resolved
    try {
      const res = await WhatsAppInboxAPI.resolve(active._id, next)
      if (!res.success) throw new Error(res.error || "")
      toast({ title: next ? "Marked resolved" : "Reopened conversation" })
      await Promise.all([loadList(), loadThread(active._id)])
    } catch (e: any) {
      toast({
        title: "Action failed",
        description: e?.response?.data?.error || e?.message || "",
        variant: "destructive",
      })
    }
  }

  function openConsentDialog(optIn: boolean) {
    setConsentDialog({ open: true, optedIn: optIn })
    setConsentReason("")
  }

  async function submitConsentChange() {
    if (!active) return
    if (!consentReason.trim()) {
      toast({ title: "Reason is required", description: "Compliance rule — every override must be logged with a reason.", variant: "destructive" })
      return
    }
    setConsentSaving(true)
    try {
      const res = await WhatsAppInboxAPI.consent(active._id, {
        optedIn: consentDialog.optedIn,
        reason: consentReason.trim(),
      })
      if (!res.success) throw new Error(res.error || "")
      toast({
        title: consentDialog.optedIn ? "Marked opted in" : "Marked opted out",
      })
      setConsentDialog({ open: false, optedIn: true })
      setConsentReason("")
      await Promise.all([loadList(), loadThread(active._id)])
    } catch (e: any) {
      toast({
        title: "Update failed",
        description: e?.response?.data?.error || e?.message || "",
        variant: "destructive",
      })
    } finally {
      setConsentSaving(false)
    }
  }

  /* ------------------------ Derived ------------------------ */

  const consent = active?.client?.whatsappConsent
  const isOptedIn = Boolean(consent?.optedIn) && !consent?.waMarketingOptOut
  const isOptedOut = consent?.optedIn === false || Boolean(consent?.waMarketingOptOut)

  /**
   * Use the server-provided `cswExpiresInMs` snapshot but subtract the
   * elapsed time since fetch so the timer counts down between reloads
   * instead of jumping every poll. `tick` triggers re-render every 30s.
   */
  const cswCountdown = useMemo(() => {
    if (!active?.cswExpiresAt) return 0
    return Math.max(0, new Date(active.cswExpiresAt).getTime() - Date.now())
  }, [active?.cswExpiresAt, tick])

  const canSendFreeForm = active?.cswOpen && cswCountdown > 0

  const sendDisabled =
    sending ||
    (composerMode === "text" && (!reply.trim() || !canSendFreeForm)) ||
    (composerMode === "template" && !templateName)

  const sendReplyButton = (
    <Button
      onClick={handleSend}
      disabled={sendDisabled}
      className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
    >
      {sending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Send className="h-4 w-4 mr-2" />
      )}
      Send {composerMode === "template" ? "template" : "reply"}
    </Button>
  )

  /* ============================== Render ============================== */

  return (
    <div className="flex h-[calc(100vh-7.25rem)] min-h-0 flex-col gap-4">
      {/* Header */}
      <div className="shrink-0 bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="bg-gradient-to-r from-emerald-50 via-cyan-50 to-blue-50 px-6 py-4 lg:px-8 lg:py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <Inbox className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 mb-1">WhatsApp Inbox</h1>
              <p className="text-slate-600 text-sm lg:text-base">
                Conversations with customers. Reply free-form within the 24h Customer Service Window or send an approved template anytime.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={loadList} disabled={listLoading} className="bg-white">
            {listLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {addonDisabled ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-slate-50/60 p-6">
              <ShieldX className="h-10 w-10 text-slate-500 mx-auto mb-3" />
              <p className="text-base font-medium text-slate-800">WABA Integration add-on is not enabled</p>
              <p className="text-sm text-slate-600 mt-2">
                Ask your platform admin to enable the WABA add-on under Plan Management to access the WhatsApp Inbox.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : appNotConnected ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50/60 p-6">
              <MessageSquareReply className="h-10 w-10 text-amber-600 mx-auto mb-3" />
              <p className="text-base font-medium text-slate-800">Connect your WhatsApp app</p>
              <p className="text-sm text-slate-600 mt-2">
                The inbox uses your connected WhatsApp app only. Connect your business number under Settings → WhatsApp Integration to view and reply to customer conversations.
              </p>
              <Button asChild className="mt-4 bg-emerald-600 hover:bg-emerald-700">
                <Link href="/settings?section=whatsapp-integration">Go to WhatsApp Integration</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12 lg:overflow-hidden">
          {/* ============================== List pane ============================== */}
          <Card className="flex min-h-0 flex-col overflow-hidden border-slate-200/90 shadow-sm lg:col-span-4 lg:h-full">
            <div className="shrink-0 border-b border-slate-100 p-4 space-y-3 bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by name or phone…"
                  className="pl-9 bg-slate-50/60 border-slate-200"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => {
                  const isActive = filter === f.id
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFilter(f.id)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
                        isActive
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/30">
              {listLoading && conversations.length === 0 ? (
                <div className="p-4">
                  <ListSkeleton rows={8} showAvatar />
                </div>
              ) : conversations.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <UserCircle2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-700">No conversations</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {filter === "all"
                      ? "Inbound replies will appear here once customers message you back."
                      : "Try a different filter or search query."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {conversations.map((c) => {
                    const isActive = active?._id === c._id
                    const hasUnread = (c.unreadCount || 0) > 0 && !isActive
                    const lastAt = c.lastInboundAt || c.lastOutboundAt
                    return (
                      <li key={c._id}>
                        <button
                          onClick={() => openThread(c)}
                          className={`w-full text-left px-4 py-3 flex gap-3 transition ${
                            isActive
                              ? "bg-emerald-50/80"
                              : "hover:bg-white"
                          }`}
                        >
                          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
                            isActive ? "bg-emerald-600" : "bg-slate-400"
                          }`}>
                            {getInitials(c.client?.name || c.recipientPhone)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`truncate text-sm ${hasUnread ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>
                                {c.client?.name || formatPhoneE164ish(c.recipientPhone)}
                              </p>
                              {lastAt && (
                                <span className="text-[10px] text-slate-500 shrink-0">
                                  {formatDistanceToNow(new Date(lastAt), { addSuffix: false })}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-slate-500 mt-0.5">
                              {c.client?.name ? formatPhoneE164ish(c.recipientPhone) + " · " : ""}
                              {c.lastInboundPreview || "No reply yet"}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              {hasUnread && (
                                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px] h-4 px-1.5">
                                  {c.unreadCount}
                                </Badge>
                              )}
                              {c.cswOpen && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-200 text-emerald-700 bg-emerald-50">
                                  CSW
                                </Badge>
                              )}
                              {c.resolved && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-slate-200 text-slate-600">
                                  Resolved
                                </Badge>
                              )}
                              {c.client?.whatsappConsent?.waMarketingOptOut && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-200 text-amber-700 bg-amber-50">
                                  Stopped
                                </Badge>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </Card>

          {/* ============================== Thread pane ============================== */}
          <Card className="flex min-h-0 flex-col overflow-hidden border-slate-200/90 shadow-sm lg:col-span-8 lg:h-full">
            {!active ? (
              <CardContent className="m-auto py-20 text-center text-slate-500">
                <MessageSquareReply className="h-14 w-14 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">Pick a conversation</p>
                <p className="text-xs text-slate-500 mt-1">
                  Select someone on the left to read messages and reply.
                </p>
              </CardContent>
            ) : (
              <>
                {/* Thread header */}
                <div className="shrink-0 border-b border-slate-100 p-4 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="shrink-0 w-11 h-11 rounded-full bg-emerald-600 text-white font-semibold text-base flex items-center justify-center">
                        {getInitials(active.client?.name || active.recipientPhone)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {active.client?.name || formatPhoneE164ish(active.recipientPhone)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatPhoneE164ish(active.recipientPhone)}
                          {active.client?.email ? ` · ${active.client.email}` : ""}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {isOptedIn && (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px] h-5 px-2">
                              <ShieldCheck className="h-3 w-3 mr-1" /> Opted in
                            </Badge>
                          )}
                          {isOptedOut && (
                            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] h-5 px-2">
                              <ShieldOff className="h-3 w-3 mr-1" />
                              {consent?.waMarketingOptOut ? "Stopped marketing" : "Opted out"}
                            </Badge>
                          )}
                          {active.cswOpen ? (
                            <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100 text-[10px] h-5 px-2">
                              <Clock className="h-3 w-3 mr-1" /> CSW · {formatCountdown(cswCountdown)} left
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-5 px-2 border-slate-200 text-slate-600">
                              CSW closed · template only
                            </Badge>
                          )}
                          {active.resolved && (
                            <Badge variant="outline" className="text-[10px] h-5 px-2 border-emerald-300 text-emerald-700">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Resolved
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!active.client && (
                        <Badge variant="outline" className="text-[10px] h-5 px-2 border-amber-200 text-amber-700 bg-amber-50">
                          Not in CRM
                        </Badge>
                      )}
                      {active.client && (
                        isOptedOut ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => openConsentDialog(true)}
                          >
                            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Mark opted in
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-slate-200 text-slate-700 hover:bg-slate-50"
                            onClick={() => openConsentDialog(false)}
                          >
                            <ShieldOff className="h-3.5 w-3.5 mr-1.5" /> Mark opted out
                          </Button>
                        )
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResolveToggle}
                      >
                        {active.resolved ? (
                          <>
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reopen
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Resolve
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div
                  className="min-h-0 flex-1 overflow-y-auto p-4 space-y-2"
                  style={{
                    background:
                      "repeating-linear-gradient(45deg, #f8fafc, #f8fafc 12px, #f1f5f9 12px, #f1f5f9 13px)",
                  }}
                >
                  {threadLoading && messages.length === 0 ? (
                    <div className="flex items-center justify-center text-slate-500 py-12">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading messages…
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-sm">
                      No messages yet in this conversation.
                    </div>
                  ) : (
                    messages
                      .slice()
                      .reverse()
                      .map((m) => {
                        const isInbound = m.direction === "inbound"
                        const text =
                          m.inboundText ||
                          m.payload?.serviceText ||
                          (m.payload?.templateName ? `[Template: ${m.payload.templateName}]` : "(message)")
                        return (
                          <div
                            key={m._id}
                            className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
                          >
                            <div
                              className={`max-w-[78%] rounded-2xl px-3 py-2 shadow-sm ${
                                isInbound
                                  ? "bg-white text-slate-800 rounded-bl-sm border border-slate-100"
                                  : "bg-emerald-600 text-white rounded-br-sm"
                              }`}
                            >
                              <div className="text-sm whitespace-pre-wrap break-words leading-snug">
                                {text}
                              </div>
                              <div
                                className={`text-[10px] mt-1 flex items-center gap-1 justify-end ${
                                  isInbound ? "text-slate-400" : "text-emerald-50/90"
                                }`}
                              >
                                <span>{format(new Date(m.timestamp), "HH:mm")}</span>
                                {!isInbound && <StatusTick status={m.status} className="text-emerald-50/90" />}
                              </div>
                              {m.status === "failed" && m.failureReason && (
                                <div className="text-[10px] mt-1 text-red-200/90 italic">
                                  {m.failureReason.slice(0, 120)}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })
                  )}
                  <div ref={messagesEndRef} aria-hidden="true" className="h-px shrink-0" />
                </div>

                {/* Composer */}
                <div className="shrink-0 max-h-[38vh] overflow-y-auto border-t border-slate-100 p-4 bg-white">
                  <Tabs
                    value={composerMode}
                    onValueChange={(v) => setComposerMode(v as "text" | "template")}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <TabsList className="bg-slate-100">
                        <TabsTrigger value="text" disabled={!canSendFreeForm}>
                          Free-form text {canSendFreeForm ? "" : "(CSW closed)"}
                        </TabsTrigger>
                        <TabsTrigger value="template">Approved template</TabsTrigger>
                      </TabsList>
                      {composerMode === "text" && canSendFreeForm && (
                        <span className="text-xs text-slate-500">
                          Window closes in {formatCountdown(cswCountdown)}
                        </span>
                      )}
                    </div>

                    <TabsContent value="text" className="m-0">
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-10 flex-1"
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder={
                            canSendFreeForm
                              ? "Type a quick reply…"
                              : "Customer hasn't replied recently — switch to a template to message anyway."
                          }
                          disabled={!canSendFreeForm}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && canSendFreeForm && reply.trim()) {
                              e.preventDefault()
                              void handleSend()
                            }
                          }}
                        />
                        {sendReplyButton}
                      </div>
                    </TabsContent>

                    <TabsContent value="template" className="m-0 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="md:col-span-2">
                          <Label className="text-xs text-slate-600">Template</Label>
                          <Select
                            value={templateName}
                            onValueChange={(v) => {
                              setTemplateName(v)
                              const tpl = templates.find((t) => t.name === v)
                              if (tpl) setTemplateLanguage(tpl.language)
                            }}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select an approved template…" />
                            </SelectTrigger>
                            <SelectContent>
                              {templates.length === 0 ? (
                                <SelectItem value="__none" disabled>
                                  No approved templates yet
                                </SelectItem>
                              ) : (
                                templates.map((t) => (
                                  <SelectItem key={t._id} value={t.name}>
                                    {t.name}
                                    <span className="ml-2 text-[10px] text-slate-500">
                                      ({t.category}, {t.language})
                                    </span>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">Language</Label>
                          <Input
                            className="mt-1"
                            value={templateLanguage}
                            onChange={(e) => setTemplateLanguage(e.target.value)}
                            placeholder="en_US"
                          />
                        </div>
                      </div>
                      {templateDetail && templateDetail.placeholders.body.length === 0 && templateDetail.placeholders.header.length === 0 ? (
                        <p className="text-[11px] text-slate-500">
                          This template has no variables — it will be sent as-is.
                        </p>
                      ) : null}

                      {templateDetailLoading && (
                        <div className="flex items-center text-xs text-slate-500">
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                          Loading variables…
                        </div>
                      )}

                      {templateDetail && (templateDetail.placeholders.header.length > 0 || templateDetail.placeholders.body.length > 0) && (
                        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/40 p-3">
                          <p className="text-[11px] font-medium text-slate-700 uppercase tracking-wide">
                            Variables
                          </p>
                          {templateDetail.placeholders.header.map((p) => (
                            <div key={p.key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
                              <Label className="text-xs text-slate-600 md:pt-2">
                                {p.label}
                                <span className="ml-1 text-[10px] text-slate-400">(header)</span>
                              </Label>
                              <Input
                                className="md:col-span-2"
                                value={templateVars[p.key] || ""}
                                onChange={(e) => setTemplateVars((v) => ({ ...v, [p.key]: e.target.value }))}
                                placeholder={p.sample ? `e.g. ${p.sample}` : `Value for {{${p.index}}}`}
                              />
                            </div>
                          ))}
                          {templateDetail.placeholders.body.map((p) => (
                            <div key={p.key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
                              <Label className="text-xs text-slate-600 md:pt-2">{p.label}</Label>
                              <Input
                                className="md:col-span-2"
                                value={templateVars[p.key] || ""}
                                onChange={(e) => setTemplateVars((v) => ({ ...v, [p.key]: e.target.value }))}
                                placeholder={p.sample ? `e.g. ${p.sample}` : `Value for {{${p.index}}}`}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {templateDetail && templatePreview && (
                        <div className="rounded-md border border-emerald-100 bg-emerald-50/40 p-3">
                          <p className="text-[11px] font-medium text-emerald-800 uppercase tracking-wide mb-1">
                            Preview
                          </p>
                          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-snug">
                            {templatePreview}
                          </p>
                          {templateDetail.components?.footer?.text && (
                            <p className="text-[11px] text-slate-500 mt-2 italic">
                              {templateDetail.components.footer.text}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex justify-end pt-1">{sendReplyButton}</div>
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Consent override dialog */}
      <Dialog
        open={consentDialog.open}
        onOpenChange={(open) =>
          setConsentDialog({ open, optedIn: consentDialog.optedIn })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {consentDialog.optedIn ? "Mark client opted in" : "Mark client opted out"}
            </DialogTitle>
            <DialogDescription>
              {consentDialog.optedIn ? (
                <>
                  Use this only when the customer has confirmed consent verbally or via another channel.
                  This will clear any "Stop promotions" flag from Meta.
                </>
              ) : (
                <>
                  This stops all WhatsApp marketing immediately. The audit log keeps your reason for compliance.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (required)</Label>
            <Textarea
              rows={3}
              value={consentReason}
              onChange={(e) => setConsentReason(e.target.value)}
              placeholder="e.g. Customer confirmed by phone on 30 Apr"
            />
            <p className="text-xs text-slate-500">
              Stored on <code>ClientConsentEvent</code> for compliance trail.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConsentDialog({ open: false, optedIn: true })}>
              Cancel
            </Button>
            <Button
              onClick={submitConsentChange}
              disabled={consentSaving || !consentReason.trim()}
              className={
                consentDialog.optedIn
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-amber-600 hover:bg-amber-700"
              }
            >
              {consentSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {consentDialog.optedIn ? "Confirm opt-in" : "Confirm opt-out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
