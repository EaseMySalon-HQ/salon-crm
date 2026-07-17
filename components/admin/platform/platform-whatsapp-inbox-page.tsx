"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ListSkeleton } from "@/components/loading"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import {
  AdminPlatformWhatsAppInboxAPI,
  type PlatformInboxConversation,
  type PlatformInboxMessage,
  type PlatformWhatsAppTemplate,
} from "@/lib/admin-platform-whatsapp-api"
import {
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Settings,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"

type FilterMode = "all" | "unread" | "open" | "resolved" | "optedout"

const FILTERS: { id: FilterMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "open", label: "CSW open" },
  { id: "resolved", label: "Resolved" },
  { id: "optedout", label: "Opted out" },
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

function displayName(conv: PlatformInboxConversation) {
  return conv.lead?.name || conv.lead?.salonName || conv.recipientPhone
}

export function PlatformWhatsAppInboxPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [platformReady, setPlatformReady] = useState<boolean | null>(null)
  const [senderError, setSenderError] = useState<string | null>(null)
  const [conversations, setConversations] = useState<PlatformInboxConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<PlatformInboxMessage[]>([])
  const [activeConv, setActiveConv] = useState<PlatformInboxConversation | null>(null)
  const [filter, setFilter] = useState<FilterMode>("all")
  const [search, setSearch] = useState("")
  const [replyText, setReplyText] = useState("")
  const [replyMode, setReplyMode] = useState<"text" | "template">("text")
  const [templates, setTemplates] = useState<PlatformWhatsAppTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [templateParams, setTemplateParams] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [threadLoading, setThreadLoading] = useState(false)
  const [webhookHint, setWebhookHint] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  )

  const placeholderCount = useMemo(
    () => findPlaceholders(selectedTemplate?.components?.body?.text).length,
    [selectedTemplate]
  )

  const refreshList = useCallback(async () => {
    setLoading(true)
    try {
      const [status, list] = await Promise.all([
        AdminPlatformWhatsAppInboxAPI.status(),
        AdminPlatformWhatsAppInboxAPI.list({ filter, q: search.trim() || undefined, limit: 100 }),
      ])
      setPlatformReady(status.platformConfigured)
      setSenderError(status.senderReady === false ? status.error || "Gupshup sender unavailable" : null)
      setConversations(list)
    } catch (err) {
      toast({
        title: "Could not load inbox",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [filter, search, toast])

  const loadThread = useCallback(
    async (conversationId: string, { silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setThreadLoading(true)
      try {
        const data = await AdminPlatformWhatsAppInboxAPI.thread(conversationId)
        setActiveConv(data.conversation)
        setMessages(data.messages || [])
        setSelectedId(conversationId)
        setConversations((prev) =>
          prev.map((c) =>
            c._id === conversationId ? { ...c, unreadCount: 0, ...data.conversation } : c
          )
        )
      } catch (err) {
        if (!silent) {
          toast({
            title: "Could not load thread",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          })
        }
      } finally {
        if (!silent) setThreadLoading(false)
      }
    },
    [toast]
  )

  useEffect(() => {
    refreshList()
    AdminPlatformWhatsAppInboxAPI.templates()
      .then(setTemplates)
      .catch(() => {})
    AdminPlatformWhatsAppInboxAPI.webhookDiagnostics()
      .then((data) => {
        const recent = data.events?.[0]
        if (recent?.phase === "rejected") {
          setWebhookHint(`Webhook rejected: ${recent.reason || "check Gupshup settings"}`)
          return
        }
        if (!data.lastPlatformInbound) {
          setWebhookHint(
            "No inbound reply received yet. CSW opens when the contact sends a WhatsApp message back — not when a template is delivered."
          )
          return
        }
        setWebhookHint(null)
      })
      .catch(() => {})
    const timer = setInterval(refreshList, 10000)
    return () => clearInterval(timer)
  }, [refreshList])

  useEffect(() => {
    if (!selectedId) return
    loadThread(selectedId)
    const timer = setInterval(() => loadThread(selectedId, { silent: true }), 8000)
    return () => clearInterval(timer)
  }, [selectedId, loadThread])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, selectedId])

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateParams([])
      return
    }
    const count = findPlaceholders(selectedTemplate.components?.body?.text).length
    setTemplateParams(Array.from({ length: count }, (_, i) => templateParams[i] || ""))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId, selectedTemplate])

  async function handleSendReply() {
    if (!selectedId) return
    setSending(true)
    try {
      if (replyMode === "text") {
        await AdminPlatformWhatsAppInboxAPI.replyText(selectedId, replyText)
        setReplyText("")
      } else {
        if (!selectedTemplateId) throw new Error("Select a template")
        await AdminPlatformWhatsAppInboxAPI.replyTemplate(selectedId, selectedTemplateId, templateParams)
      }
      await loadThread(selectedId)
      toast({ title: "Message sent" })
    } catch (err) {
      toast({
        title: "Send failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  async function toggleResolved() {
    if (!selectedId || !activeConv) return
    try {
      const updated = await AdminPlatformWhatsAppInboxAPI.resolve(selectedId, !activeConv.resolved)
      setActiveConv(updated)
      setConversations((prev) => prev.map((c) => (c._id === selectedId ? { ...c, ...updated } : c)))
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  if (platformReady === false) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <Inbox className="h-10 w-10 mx-auto text-slate-400" />
          <div>
            <h2 className="text-lg font-semibold">Platform WhatsApp not configured</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Connect the shared Gupshup app under Settings → API & Integration, then approve templates in
              Template Manager.
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Chat</h1>
          <p className="text-sm text-muted-foreground">
            Platform inbox for leads and prospects on the shared WhatsApp number.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshList} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {senderError ? (
        <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong className="font-medium">Gupshup send unavailable.</strong>{" "}
          {senderError} Template replies from chat will fail until partner login succeeds. Check partner
          email and client secret under Settings → API, then retry in a minute.
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] lg:overflow-hidden">
        <Card className="flex min-h-0 flex-col overflow-hidden lg:h-full">
          <div className="shrink-0 p-3 border-b space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && refreshList()}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={filter === f.id ? "default" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <ListSkeleton rows={6} />
            ) : conversations.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">No conversations yet.</p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv._id}
                  type="button"
                  onClick={() => loadThread(conv._id)}
                  className={`w-full text-left px-3 py-3 border-b hover:bg-slate-50 transition ${
                    selectedId === conv._id ? "bg-slate-100" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{displayName(conv)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.lastInboundPreview || conv.recipientPhone}
                      </p>
                    </div>
                    {(conv.unreadCount || 0) > 0 && (
                      <Badge className="shrink-0">{conv.unreadCount}</Badge>
                    )}
                  </div>
                  {conv.lastInboundAt && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(conv.lastInboundAt), { addSuffix: true })}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden lg:h-full">
          {!selectedId ? (
            <CardContent className="flex flex-1 items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Select a conversation to view messages</p>
              </div>
            </CardContent>
          ) : (
            <>
              <div className="shrink-0 px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{activeConv ? displayName(activeConv) : "…"}</p>
                  <p className="text-xs text-muted-foreground">{activeConv?.recipientPhone}</p>
                </div>
                <div className="flex items-center gap-2">
                  {activeConv?.cswOpen ? (
                    <Badge variant="secondary" className="text-emerald-700 bg-emerald-50">
                      <Clock className="h-3 w-3 mr-1" />
                      CSW open
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-amber-800 bg-amber-50">
                      CSW closed
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={toggleResolved}>
                    {activeConv?.resolved ? "Reopen" : "Resolve"}
                  </Button>
                </div>
              </div>

              {!activeConv?.cswOpen ? (
                <div className="shrink-0 mx-4 mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                  {activeConv?.lastInboundAt
                    ? "The 24-hour customer service window has expired. Send a template to re-engage, then wait for a reply to open text replies again."
                    : "The contact has not replied yet. Ask them to send any WhatsApp message to your business number — that opens the 24-hour window and enables Text reply."}
                  {webhookHint ? <p className="mt-1 text-amber-800">{webhookHint}</p> : null}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60">
                {threadLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg._id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          msg.direction === "outbound"
                            ? "bg-emerald-600 text-white rounded-br-md"
                            : "bg-white border rounded-bl-md"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">
                          {msg.inboundText || msg.outboundText || (msg.params?.length ? `[Template: ${msg.params.join(", ")}]` : "—")}
                        </p>
                        <p
                          className={`text-[10px] mt-1 ${
                            msg.direction === "outbound" ? "text-emerald-100" : "text-muted-foreground"
                          }`}
                        >
                          {format(new Date(msg.timestamp), "MMM d, h:mm a")}
                          {msg.direction === "outbound" && msg.status === "failed" && (
                            <span className="ml-1" title={msg.failureReason || undefined}>
                              · failed{msg.failureReason ? `: ${msg.failureReason}` : ""}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <div className="shrink-0 border-t p-3 space-y-3 bg-white">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={replyMode === "text" ? "default" : "outline"}
                    onClick={() => setReplyMode("text")}
                    disabled={!activeConv?.cswOpen}
                  >
                    Text reply
                  </Button>
                  <Button
                    size="sm"
                    variant={replyMode === "template" ? "default" : "outline"}
                    onClick={() => setReplyMode("template")}
                  >
                    Template
                  </Button>
                </div>

                {replyMode === "text" ? (
                  <div className="flex gap-2">
                    <Textarea
                      placeholder={
                        activeConv?.cswOpen
                          ? "Type a reply…"
                          : "CSW closed — use a template reply"
                      }
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={!activeConv?.cswOpen}
                      rows={2}
                      className="min-h-[44px]"
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" || e.shiftKey) return
                        if (!activeConv?.cswOpen || sending || !replyText.trim()) return
                        e.preventDefault()
                        void handleSendReply()
                      }}
                    />
                    <Button onClick={handleSendReply} disabled={sending || !replyText.trim() || !activeConv?.cswOpen}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Approved template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t._id} value={t._id}>
                            {t.name} ({t.category})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {placeholderCount > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {Array.from({ length: placeholderCount }).map((_, i) => (
                          <Input
                            key={i}
                            placeholder={`Variable {{${i + 1}}}`}
                            value={templateParams[i] || ""}
                            onChange={(e) => {
                              const next = [...templateParams]
                              next[i] = e.target.value
                              setTemplateParams(next)
                            }}
                          />
                        ))}
                      </div>
                    )}
                    <Button onClick={handleSendReply} disabled={sending || !selectedTemplateId}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                      Send template
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
