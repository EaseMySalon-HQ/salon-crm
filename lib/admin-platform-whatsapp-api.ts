import { adminRequestHeaders } from "@/lib/admin-request-headers"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

async function adminJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: adminRequestHeaders({
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || payload?.success === false) {
    throw new Error(payload?.error || "Request failed")
  }
  return payload.data as T
}

export type PlatformInboxLead = {
  _id?: string
  firstName?: string
  lastName?: string
  name?: string
  salonName?: string
  phone?: string
  email?: string
  source?: string
  status?: string
  marketingOptOut?: boolean
} | null

export type PlatformInboxConversation = {
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
  marketingOptOut?: boolean
  lead?: PlatformInboxLead
}

export type PlatformInboxMessage = {
  _id: string
  direction: "inbound" | "outbound"
  status: string
  inboundText?: string | null
  outboundText?: string | null
  gupshupTemplateId?: string | null
  params?: string[]
  failureReason?: string | null
  timestamp: string
}

export type PlatformWhatsAppTemplate = {
  _id: string
  name: string
  language: string
  category: string
  status: string
  gupshupTemplateId?: string | null
  components?: {
    body?: { text?: string | null; examples?: string[][] }
    header?: { format?: string | null; text?: string | null }
    footer?: { text?: string | null }
  }
}

export type PlatformWhatsAppCampaign = {
  _id: string
  name: string
  description?: string
  status: string
  templateId?: string
  audienceType?: string
  audienceFilters?: Record<string, unknown>
  variableMapping?: Record<string, unknown>
  recipientCount?: number
  counts?: { queued?: number; sent?: number; delivered?: number; read?: number; failed?: number }
  scheduledAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  failureReason?: string | null
  createdAt?: string
}

export type PlatformCampaignReportMetrics = {
  queued: number
  sent: number
  delivered: number
  read: number
  failed: number
  total: number
  attempted: number
  successful: number
  deliveryRate: number
  readRate: number
  failureRate: number
}

export type PlatformCampaignPerformanceReport = {
  campaign: PlatformWhatsAppCampaign & {
    audienceType?: string
    audienceFilters?: Record<string, unknown>
  }
  template: {
    _id: string
    name: string
    category: string
    language: string
    status: string
  } | null
  metrics: PlatformCampaignReportMetrics
  rates: {
    deliveryRate: number
    readRate: number
    failureRate: number
  }
  failureReasons: Array<{ reason: string; count: number }>
  durationMs: number | null
  recipients: Array<{
    messageId: string
    recipientPhone: string
    status: string
    failureReason?: string | null
    timestamp: string
    lead: {
      _id: string
      name: string
      salonName: string
      status: string
    } | null
  }>
}

export type PlatformCampaignsSummaryReport = {
  totals: PlatformCampaignReportMetrics & { campaigns: number }
  campaignsByStatus: Record<string, number>
  recentCampaigns: Array<{
    _id: string
    name: string
    status: string
    recipientCount: number
    counts: PlatformWhatsAppCampaign["counts"]
    createdAt?: string
    completedAt?: string | null
  }>
}

export class AdminPlatformWhatsAppInboxAPI {
  static status() {
    return adminJson<{ platformConfigured: boolean; senderReady?: boolean; error?: string | null }>(
      "/admin/gupshup/inbox/status"
    )
  }

  static list(params?: { filter?: string; q?: string; limit?: number }) {
    const qs = new URLSearchParams()
    if (params?.filter) qs.set("filter", params.filter)
    if (params?.q) qs.set("q", params.q)
    if (params?.limit) qs.set("limit", String(params.limit))
    const query = qs.toString()
    return adminJson<PlatformInboxConversation[]>(
      `/admin/gupshup/inbox${query ? `?${query}` : ""}`
    )
  }

  static thread(conversationId: string) {
    return adminJson<{ conversation: PlatformInboxConversation; messages: PlatformInboxMessage[] }>(
      `/admin/gupshup/inbox/${encodeURIComponent(conversationId)}`
    )
  }

  static templates() {
    return adminJson<PlatformWhatsAppTemplate[]>("/admin/gupshup/inbox/templates")
  }

  static replyText(conversationId: string, text: string) {
    return adminJson(`/admin/gupshup/inbox/${encodeURIComponent(conversationId)}/reply`, {
      method: "POST",
      body: JSON.stringify({ mode: "text", text }),
    })
  }

  static replyTemplate(conversationId: string, templateId: string, params: string[]) {
    return adminJson(`/admin/gupshup/inbox/${encodeURIComponent(conversationId)}/reply`, {
      method: "POST",
      body: JSON.stringify({ mode: "template", templateId, params }),
    })
  }

  static resolve(conversationId: string, resolved: boolean) {
    return adminJson<PlatformInboxConversation>(
      `/admin/gupshup/inbox/${encodeURIComponent(conversationId)}/resolve`,
      {
        method: "POST",
        body: JSON.stringify({ resolved }),
      }
    )
  }

  static webhookDiagnostics() {
    return adminJson<{
      events: Array<{ phase?: string; at?: string; summary?: Record<string, unknown>; reason?: string }>
      lastPlatformInbound: { recipientPhone?: string; inboundText?: string; timestamp?: string } | null
      hints?: { secretConfigured?: boolean; ipAllowlistConfigured?: boolean }
    }>("/admin/gupshup/webhook/recent")
  }

  static messagesTracking(params?: { dateFrom?: string; dateTo?: string }) {
    const qs = new URLSearchParams()
    if (params?.dateFrom) qs.set("dateFrom", params.dateFrom)
    if (params?.dateTo) qs.set("dateTo", params.dateTo)
    const query = qs.toString()
    return adminJson<{
      totalMessages: number
      sentMessages: number
      failedMessages: number
      successRate: number
      businessStats?: Array<{
        businessId: string
        businessName?: string
        total: number
        sent: number
        failed: number
      }>
    }>(`/admin/gupshup/messages/tracking${query ? `?${query}` : ""}`)
  }
}

export class AdminPlatformWhatsAppCampaignsAPI {
  static list() {
    return adminJson<PlatformWhatsAppCampaign[]>("/admin/gupshup/campaigns")
  }

  static get(id: string) {
    return adminJson<PlatformWhatsAppCampaign>(`/admin/gupshup/campaigns/${encodeURIComponent(id)}`)
  }

  static create(data: Record<string, unknown>) {
    return adminJson<PlatformWhatsAppCampaign>("/admin/gupshup/campaigns", {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  static update(id: string, data: Record<string, unknown>) {
    return adminJson<PlatformWhatsAppCampaign>(`/admin/gupshup/campaigns/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  static previewRecipients(id: string) {
    return adminJson<{ count: number; sample: Array<Record<string, unknown>> }>(
      `/admin/gupshup/campaigns/${encodeURIComponent(id)}/recipients/preview`,
      { method: "POST" }
    )
  }

  static previewAudienceFilters(audienceFilters: Record<string, unknown>, audienceType = "segment") {
    return adminJson<{ count: number; sample: Array<Record<string, unknown>> }>(
      "/admin/gupshup/campaigns/audience/preview",
      {
        method: "POST",
        body: JSON.stringify({ audienceType, audienceFilters }),
      }
    )
  }

  static send(id: string) {
    return adminJson<PlatformWhatsAppCampaign>(
      `/admin/gupshup/campaigns/${encodeURIComponent(id)}/send`,
      { method: "POST" }
    )
  }

  static cancel(id: string) {
    return adminJson<PlatformWhatsAppCampaign>(
      `/admin/gupshup/campaigns/${encodeURIComponent(id)}/cancel`,
      { method: "POST" }
    )
  }

  static limits() {
    return adminJson<{ maxRecipients: number }>("/admin/gupshup/campaigns/limits")
  }

  static templates() {
    return adminJson<PlatformWhatsAppTemplate[]>("/admin/gupshup/inbox/templates")
  }

  static summaryReport() {
    return adminJson<PlatformCampaignsSummaryReport>("/admin/gupshup/campaigns/reports/summary")
  }

  static performanceReport(id: string) {
    return adminJson<PlatformCampaignPerformanceReport>(
      `/admin/gupshup/campaigns/${encodeURIComponent(id)}/report`
    )
  }
}
