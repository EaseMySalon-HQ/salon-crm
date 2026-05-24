/**
 * Typed wrappers around admin-only API endpoints.
 *
 * Admin routes use a different auth path from tenant routes — they ride on
 * the admin session token (`adminRequestHeaders()`), not the tenant
 * `apiClient` axios instance. We intentionally use raw `fetch` here so all
 * admin network traffic is funnelled through one place.
 */

import { adminRequestHeaders } from "@/lib/admin-request-headers"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

// ── Types ────────────────────────────────────────────────────────────────

export type GstSource = "wallet" | "plan" | "all"
export type GstProvider = "razorpay" | "stripe" | "zoho" | "system" | "all"
export type GstStatus = "generated" | "reported" | "filed" | "all"
export type GstBuyerType = "B2B" | "B2C" | "all"
export type GstExportFormat = "csv" | "xlsx" | "gstr1" | "gstr1_json"

export interface GstInvoiceRow {
  _id: string
  invoiceNumber: string
  invoiceDate: string
  source: "wallet" | "plan"
  sourceRef: string
  businessId: string
  buyer: {
    name?: string
    gstin?: string
    state?: string
    email?: string
    type: "B2B" | "B2C"
  }
  seller?: {
    name?: string
    gstin?: string
    state?: string
  }
  placeOfSupply: string
  intraState: boolean
  taxableValuePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  totalTaxPaise: number
  grandTotalPaise: number
  gstRate: number
  status: "generated" | "reported" | "filed"
  filingPeriod: string
  payment: {
    provider?: string | null
    providerOrderId?: string | null
    providerPaymentId?: string | null
  }
}

export interface GstInvoiceTotals {
  count: number
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  totalTaxPaise: number
  grandTotalPaise: number
}

export interface GstInvoicesResponse {
  rows: GstInvoiceRow[]
  totals: GstInvoiceTotals
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export interface GstSummaryResponse {
  period: string
  today: { count: number; grandTotalPaise: number }
  month: {
    count: number
    taxablePaise: number
    cgstPaise: number
    sgstPaise: number
    igstPaise: number
    totalTaxPaise: number
    grandTotalPaise: number
    b2b: { count: number; taxablePaise: number }
    b2c: { count: number; taxablePaise: number }
  }
  filing: {
    filedAt: string
    filedBy: string
    counts: { total: number; b2b: number; b2c: number }
    totals: GstInvoiceTotals
  } | null
}

export interface GstFilingRow {
  _id: string
  period: string
  fiscalYear: string
  filedAt: string
  filedBy: string
  reopenedAt: string | null
  reopenedBy: string | null
  counts: { total: number; b2b: number; b2c: number }
  totals: GstInvoiceTotals
  snapshotPath: string | null
}

export interface GstInvoicesQuery {
  page?: number
  limit?: number
  from?: string
  to?: string
  period?: string
  source?: GstSource
  provider?: GstProvider
  status?: GstStatus
  buyerType?: GstBuyerType
  search?: string
}

export interface GstExportParams extends Omit<GstInvoicesQuery, "page" | "limit"> {
  format?: GstExportFormat
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function adminJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
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
    const message =
      payload?.error ||
      (typeof payload?.details === "object"
        ? JSON.stringify(payload.details)
        : "Request failed")
    throw new Error(message)
  }
  return (payload?.data ?? payload) as T
}

function buildQuery(params: Record<string, unknown> | undefined): string {
  if (!params) return ""
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "all") continue
    qs.append(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ""
}

// ── API ──────────────────────────────────────────────────────────────────

export class AdminGstAPI {
  static listInvoices(params: GstInvoicesQuery = {}): Promise<GstInvoicesResponse> {
    return adminJson<GstInvoicesResponse>(`/admin/gst/invoices${buildQuery(params)}`)
  }

  static summary(period?: string): Promise<GstSummaryResponse> {
    return adminJson<GstSummaryResponse>(
      `/admin/gst/summary${buildQuery(period ? { period } : {})}`
    )
  }

  static listFilings(): Promise<GstFilingRow[]> {
    return adminJson<GstFilingRow[]>(`/admin/gst/filings`)
  }

  static fileReturn(period: string): Promise<{
    period: string
    filedAt: string
    counts: { total: number; b2b: number; b2c: number }
    totals: GstInvoiceTotals
  }> {
    return adminJson(`/admin/gst/filings`, {
      method: "POST",
      body: JSON.stringify({ period }),
    })
  }

  static reopen(period: string): Promise<{ period: string; reopenedAt: string }> {
    return adminJson(`/admin/gst/filings/${encodeURIComponent(period)}/reopen`, {
      method: "POST",
    })
  }

  static updateStatus(
    invoiceId: string,
    status: "generated" | "reported"
  ): Promise<{ _id: string; status: string }> {
    return adminJson(`/admin/gst/invoices/${invoiceId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
  }

  /**
   * Export invoices as CSV / XLSX / GSTR-1 XLSX. Returns the downloaded
   * filename and triggers the browser download.
   */
  static async exportInvoices(params: GstExportParams): Promise<string> {
    const format = params.format || "xlsx"
    const res = await fetch(`${API_BASE_URL}/admin/gst/export`, {
      method: "POST",
      credentials: "include",
      headers: adminRequestHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      let message = "Failed to export invoices"
      try {
        const parsed = JSON.parse(text)
        message = parsed?.error || message
      } catch {
        if (text) message = text
      }
      throw new Error(message)
    }

    const blob = await res.blob()
    const disposition = res.headers.get("content-disposition") || ""
    const match = disposition.match(/filename="?([^"]+)"?/i)
    const fallback =
      format === "csv"
        ? "gst-invoices.csv"
        : format === "gstr1"
          ? "gstr1.xlsx"
          : format === "gstr1_json"
            ? "gstr1.json"
            : "gst-invoices.xlsx"
    const filename = match?.[1] || fallback

    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return filename
  }

  /**
   * Download a single invoice PDF (admin can access any business's invoice).
   */
  static async downloadInvoice(invoiceId: string): Promise<string> {
    const res = await fetch(
      `${API_BASE_URL}/admin/gst/invoices/${invoiceId}/download`,
      {
        credentials: "include",
        headers: adminRequestHeaders(),
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      let message = "Failed to download invoice"
      try {
        const parsed = JSON.parse(text)
        message = parsed?.error || message
      } catch {
        if (text) message = text
      }
      throw new Error(message)
    }
    const blob = await res.blob()
    const disposition = res.headers.get("content-disposition") || ""
    const match = disposition.match(/filename="?([^"]+)"?/i)
    const filename = match?.[1] || `invoice-${invoiceId}.pdf`

    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return filename
  }
}

// ── Platform leads ───────────────────────────────────────────────────────

export type PlatformLeadStatus = "new" | "follow-up" | "converted" | "lost"
export type PlatformLeadSource =
  | "walk-in"
  | "phone"
  | "website"
  | "social"
  | "referral"
  | "other"

export interface PlatformLeadRow {
  _id: string
  name: string
  salonName?: string
  city?: string
  branchCount?: string
  preferredDemoTime?: string
  phone: string
  email?: string
  source: PlatformLeadSource
  status: PlatformLeadStatus
  gender?: string
  interestedIn?: string
  assignedAdminId?: { _id: string; name?: string; firstName?: string; lastName?: string; email?: string } | string
  followUpDate?: string
  notes?: string
  convertedToBusinessId?: { _id: string; name?: string; businessName?: string } | string
  convertedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface PlatformLeadActivityRow {
  _id: string
  leadId: string
  activityType: string
  performedByName: string
  description: string
  previousValue?: unknown
  newValue?: unknown
  field?: string
  details?: Record<string, unknown>
  createdAt: string
}

export interface AdminLeadAssignee {
  _id: string
  name: string
  email: string
}

export interface AdminLeadsListResponse {
  data: PlatformLeadRow[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

async function adminJsonEnvelope<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ success: boolean; data: T; pagination?: AdminLeadsListResponse["pagination"]; error?: string }> {
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
    const message =
      payload?.error ||
      (typeof payload?.details === "object"
        ? JSON.stringify(payload.details)
        : "Request failed")
    throw new Error(message)
  }
  return payload as { success: boolean; data: T; pagination?: AdminLeadsListResponse["pagination"] }
}

export class AdminLeadsAPI {
  static async list(params?: {
    page?: number
    limit?: number
    search?: string
    status?: string
    assignedAdminId?: string
    source?: string
    startDate?: string
    endDate?: string
  }): Promise<AdminLeadsListResponse> {
    const payload = await adminJsonEnvelope<PlatformLeadRow[]>(
      `/admin/leads${buildQuery(params as Record<string, unknown>)}`
    )
    return {
      data: payload.data,
      pagination: payload.pagination || { page: 1, limit: 50, total: payload.data.length, pages: 1 },
    }
  }

  static getById(id: string): Promise<PlatformLeadRow> {
    return adminJson<PlatformLeadRow>(`/admin/leads/${encodeURIComponent(id)}`)
  }

  static getActivities(id: string): Promise<PlatformLeadActivityRow[]> {
    return adminJson<PlatformLeadActivityRow[]>(
      `/admin/leads/${encodeURIComponent(id)}/activities`
    )
  }

  static listAssignees(): Promise<AdminLeadAssignee[]> {
    return adminJson<AdminLeadAssignee[]>(`/admin/leads/assignees`)
  }

  static create(data: Record<string, unknown>): Promise<PlatformLeadRow> {
    return adminJson<PlatformLeadRow>(`/admin/leads`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  static update(id: string, data: Record<string, unknown>): Promise<PlatformLeadRow> {
    return adminJson<PlatformLeadRow>(`/admin/leads/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  static convert(id: string, businessId: string): Promise<PlatformLeadRow> {
    return adminJson<PlatformLeadRow>(`/admin/leads/${encodeURIComponent(id)}/convert`, {
      method: "POST",
      body: JSON.stringify({ businessId }),
    })
  }

  static delete(id: string): Promise<void> {
    return adminJson(`/admin/leads/${encodeURIComponent(id)}`, { method: "DELETE" })
  }
}
