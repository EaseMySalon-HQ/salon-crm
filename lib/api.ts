// API Configuration and HTTP Client
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios'
import { handleSessionExpired } from './auth-utils'
import { isPublicClientRoute } from './public-routes'
import { getCsrfToken, setCsrfTokenPersisted, CSRF_HEADER_NAME } from './csrf'
import type {
  AnalyticsClientsTabData,
  AnalyticsProductsTabData,
  AnalyticsRevenueTabData,
  AnalyticsServicesTabData,
  AnalyticsStaffDrillDownData,
  AnalyticsStaffTabData,
} from "@/lib/types/analytics"
// API Base Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

/**
 * Refresh auth session using HttpOnly cookie. New tokens are set as cookies
 * by the server — no token is returned in the JSON body.
 */
let refreshInFlight: Promise<boolean> | null = null

async function refreshAuthTokenOnce(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      const res = await axios.post<{ success?: boolean; csrfToken?: string }>(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true, timeout: 25000 }
      )
      const t = res.data?.csrfToken
      if (typeof t === 'string' && t.trim()) {
        setCsrfTokenPersisted(t)
      }
      return res.data?.success === true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

function normalizeApiErrorMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as { error?: unknown; message?: unknown }
  if (typeof d.error === 'string') return d.error
  if (typeof d.message === 'string') return d.message
  return ''
}

/** True when 401/403 indicates invalid/expired session (not business-rule or RBAC). */
function isTokenAuthFailure(status: number | undefined, errorMsg: string): boolean {
  const m = errorMsg.toLowerCase()
  if (m.includes('business_suspended')) return false
  /** Backend CSRF failures use "Invalid CSRF token" — must not trigger JWT logout. */
  if (m.includes('csrf')) return false
  if (status === 401) return true
  if (status !== 403) return false
  return (
    (m.includes('invalid') && m.includes('token')) ||
    m.includes('expired') ||
    m.includes('access token') ||
    m.includes('authentication required') ||
    m.includes('user not found')
  )
}

function logApiResponseError(error: AxiosError | any) {
  try {
    const errorInfo: any = {
      message: 'Unknown error',
      errorType: typeof error,
    }

    if (error?.message) {
      errorInfo.message = String(error.message)
    } else if (typeof error === 'string') {
      errorInfo.message = error
    } else if (error?.toString && typeof error.toString === 'function') {
      try {
        errorInfo.message = String(error.toString())
      } catch {
        errorInfo.message = 'Error converting to string'
      }
    }

    if (error?.config) {
      errorInfo.url = String(error.config.url || 'Unknown URL')
      errorInfo.method = String(error.config.method?.toUpperCase() || 'Unknown method')
    }

    if (error?.response) {
      errorInfo.status = Number(error.response.status)
      errorInfo.statusText = String(error.response.statusText || '')
      errorInfo.data = error.response.data
      errorInfo.type = 'HTTP Error'

      if (error.response.data) {
        if (typeof error.response.data === 'string') {
          errorInfo.error = error.response.data
          errorInfo.message = error.response.data
        } else if (typeof error.response.data === 'object') {
          errorInfo.error =
            error.response.data.error ||
            error.response.data.message ||
            error.response.data.details ||
            JSON.stringify(error.response.data)
          errorInfo.message = errorInfo.error
        }
      }

      if (!errorInfo.error && errorInfo.statusText) {
        errorInfo.error = errorInfo.statusText
        errorInfo.message = errorInfo.statusText
      }
    } else if (error?.request) {
      errorInfo.type = 'Network Error'
      errorInfo.code = String(error?.code || 'NETWORK_ERROR')
    } else {
      errorInfo.type = 'Request Setup Error'
      errorInfo.code = String(error?.code || 'SETUP_ERROR')
    }

    const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
    const isPublicRoute = pathname && isPublicClientRoute(pathname)
    const isLoginPage = typeof window !== 'undefined' && window.location.pathname.includes('/login')
    const urlStr = String(errorInfo.url || error?.config?.url || '')
    const isAuthProbe =
      errorInfo.status === 401 &&
      (urlStr.includes('/auth/profile') ||
        (isLoginPage && urlStr.includes('/auth/refresh')))
    if ((isLoginPage || isPublicRoute) && isAuthProbe) {
      // Silent: expected 401 when probing for existing session on the login page
    } else if (errorInfo.status === 404) {
      if (errorInfo.url && errorInfo.url !== 'Unknown URL') {
        console.warn(`⚠️ API 404: ${errorInfo.method} ${errorInfo.url} - ${errorInfo.message || 'Not Found'}`)
      }
    } else if (errorInfo.status === 0 || errorInfo.type === 'Network Error') {
      const url = error?.config?.url || errorInfo.url
      const baseUrl = error?.config?.baseURL || ''
      console.warn(
        `⚠️ API Network Error: Cannot reach backend. Ensure the server is running on ${baseUrl || 'port 3001'}.`,
        url ? `Request: ${url}` : ''
      )
    } else {
      const status = errorInfo.status ?? error?.response?.status
      const data = errorInfo.data ?? error?.response?.data
      const errMsg =
        typeof data === 'object' && data !== null
          ? (data as any).error || (data as any).errorDetail || (data as any).message || (data as any).details
          : typeof data === 'string'
            ? data
            : null
      const message =
        typeof errMsg === 'string' && errMsg.trim()
          ? errMsg
          : errorInfo.error || errorInfo.message || errorInfo.statusText || `Request failed with status ${status}`

      const url = error?.config?.url
      const method = error?.config?.method?.toUpperCase()
      const logFn = status >= 400 && status < 500 ? console.warn : console.error
      logFn(`API ${status || ''} ${method || ''} ${url || ''}:`, message)
    }
  } catch (logError) {
    console.error('❌ API Response Interceptor: Failed to process error:', logError)
    console.error('❌ API Response Interceptor: Original error object:', error)
    console.error('❌ API Response Interceptor: Error keys:', error ? Object.keys(error) : 'null')
  }
}

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

/** Dev-only: count outgoing API requests (read via `window.__getSalonApiRequestCount?.()` in the browser console). */
let devApiRequestCount = 0
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  apiClient.interceptors.request.use((config) => {
    devApiRequestCount += 1
    const g = globalThis as unknown as {
      __salonApiRequestCount?: number
      __getSalonApiRequestCount?: () => number
    }
    g.__salonApiRequestCount = devApiRequestCount
    g.__getSalonApiRequestCount = () => devApiRequestCount
    return config
  })
}

/** Ensures sessionStorage has a CSRF mirror before mutating requests (cross-origin cannot read ems_csrf cookie). */
let csrfBootstrapInFlight: Promise<void> | null = null

function ensureCsrfTokenForMutatingRequest(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (getCsrfToken()) return Promise.resolve()
  if (csrfBootstrapInFlight) return csrfBootstrapInFlight
  csrfBootstrapInFlight = (async () => {
    try {
      await apiClient.get('/auth/csrf')
    } catch {
      /* ignore — caller may still 403 */
    } finally {
      csrfBootstrapInFlight = null
    }
  })()
  return csrfBootstrapInFlight
}

// Request interceptor: attach CSRF token for mutating methods (cookies carry auth automatically)
apiClient.interceptors.request.use(
  async (config) => {
    if (typeof window !== 'undefined') {
      const method = (config.method || 'get').toUpperCase()
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const url = String(config.url || '')
        const skipCsrfBootstrap =
          url.includes('/auth/login') ||
          url.includes('/auth/staff-login') ||
          url.includes('/auth/refresh') ||
          url.includes('/auth/forgot-password') ||
          url.includes('/auth/reset-password')
        if (!skipCsrfBootstrap) {
          await ensureCsrfTokenForMutatingRequest()
        }
        const csrf = getCsrfToken()
        if (csrf) {
          config.headers[CSRF_HEADER_NAME] = csrf
        }
      }
    }
    return config
  },
  (error) => {
    console.error('❌ API Request Interceptor Error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor: persist CSRF for cross-origin SPAs (API host cookie not visible to document.cookie)
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const url = String(response.config?.url || '')
    const data = response.data as { csrfToken?: string } | undefined
    if (
      data?.csrfToken &&
      typeof data.csrfToken === 'string' &&
      data.csrfToken.trim() &&
      (url.includes('/auth/profile') ||
        url.includes('/auth/refresh') ||
        url.includes('/auth/csrf'))
    ) {
      setCsrfTokenPersisted(data.csrfToken)
    }
    return response
  },
  async (error: AxiosError | any) => {
    if (!error) {
      console.error('❌ API Response Interceptor: Error is null or undefined')
      return Promise.reject(error)
    }

    const config = error.config as any

    // Retry transient network / timeout (common after tab sleep or first request after idle)
    if (config && !error.response) {
      const code = error.code
      const msg = String(error.message || '')
      const retryable =
        code === 'ECONNABORTED' || code === 'ERR_NETWORK' || msg === 'Network Error'
      if (retryable && (config.__networkRetryCount || 0) < 2) {
        config.__networkRetryCount = (config.__networkRetryCount || 0) + 1
        await new Promise((r) => setTimeout(r, 500 * config.__networkRetryCount))
        return apiClient(config)
      }
    }

    const status = error?.response?.status
    const errBody = error?.response?.data
    const errorMsg = normalizeApiErrorMessage(errBody)

    if (typeof window !== 'undefined' && config && !config.__retryAfterRefresh) {
      const url = String(config.url || '')
      const skipRefresh =
        url.includes('/auth/refresh') ||
        url.includes('/auth/login') ||
        url.includes('/auth/staff-login')
      if (!skipRefresh && isTokenAuthFailure(status, errorMsg)) {
        config.__retryAfterRefresh = true
        const refreshed = await refreshAuthTokenOnce()
        if (refreshed) {
          return apiClient(config)
        }
      }
    }

    if (error?.response?.data) {
      error.responseData = error.response.data
    }

    logApiResponseError(error)

    const statusOut = error?.response?.status
    const errorMsgLower = normalizeApiErrorMessage(error?.response?.data).toLowerCase()

    if (statusOut === 401 || statusOut === 403) {
      const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
      const reqUrl = String(config?.url || '')
      const isAuthSessionProbe =
        reqUrl.includes('/auth/profile') || reqUrl.includes('/auth/refresh')
      const skipRedirectForAnonymousMarketing =
        !!pathname &&
        isPublicClientRoute(pathname) &&
        isAuthSessionProbe &&
        !errorMsgLower.includes('business_suspended')

      if (typeof window !== 'undefined' && !skipRedirectForAnonymousMarketing) {
        if (statusOut === 403 && errorMsgLower.includes('business_suspended')) {
          if (!window.location.pathname.includes('/account-suspended')) {
            window.location.href = '/account-suspended'
          }
          return Promise.reject(error)
        }

        const isPermissionDenied =
          statusOut === 403 &&
          (errorMsgLower.includes('insufficient permissions') ||
            errorMsgLower.includes('insufficient admin permissions') ||
            (errorMsgLower.includes('feature') && errorMsgLower.includes('not available')))

        if (isPermissionDenied) {
          if (process.env.NODE_ENV === 'development') {
            console.log('🔐 API 403: Permission denied, redirecting to unauthorized')
          }
          window.location.href = '/unauthorized'
        } else if (isTokenAuthFailure(statusOut, errorMsgLower)) {
          if (process.env.NODE_ENV === 'development') {
            console.log('🔐 API Response Interceptor: Session invalid (', statusOut, '), redirecting to login')
          }
          handleSessionExpired('/login', {
            source: 'api_interceptor',
            status: statusOut,
            requestUrl: String(config?.url || ''),
            errorMessage: errorMsgLower,
          })
        }
        // Other 403s (validation, cross-branch, etc.): do not logout — let callers show the error
      }
    }
    return Promise.reject(error)
  }
)

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean
  data: T
  message?: string
  error?: string
  /** GET /sales and other list endpoints may include timing/pagination hints */
  meta?: {
    durationMs?: number
    page?: number
    limit?: number
    hasMore?: boolean
  }
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// API Service Classes
export class AuthAPI {
  static async login(email: string, password: string): Promise<ApiResponse<{ user: any; csrfToken?: string }>> {
    const response = await apiClient.post('/auth/login', { email, password })
    return response.data
  }

  /**
   * @param reason — optional short tag explaining the source. The backend writes this into
   * the tenant_logout_success audit line so we can distinguish user-initiated logouts from
   * session-timeout or interceptor-driven ones in production.
   */
  static async logout(reason?: string): Promise<ApiResponse> {
    const body = reason && typeof reason === 'string' ? { reason } : {}
    const response = await apiClient.post('/auth/logout', body)
    return response.data
  }

  static async getProfile(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/auth/profile')
    return response.data
  }

  static async refreshToken(): Promise<ApiResponse & { csrfToken?: string }> {
    const response = await apiClient.post('/auth/refresh')
    return response.data
  }

  static async forgotPassword(email: string): Promise<ApiResponse<{ message: string; resetUrl?: string }>> {
    const response = await apiClient.post('/auth/forgot-password', { email })
    return response.data
  }

  static async resetPassword(token: string, newPassword: string): Promise<ApiResponse<{ message: string }>> {
    const response = await apiClient.post('/auth/reset-password', { token, newPassword })
    return response.data
  }

  static async verifyResetToken(token: string): Promise<ApiResponse<{ email: string; name: string; role: string }>> {
    const response = await apiClient.get(`/auth/verify-reset-token/${token}`)
    return response.data
  }

  static async staffLogin(email: string, password: string, businessCode: string): Promise<ApiResponse<{ user: any; csrfToken?: string }>> {
    const response = await apiClient.post('/auth/staff-login', { email, password, businessCode })
    return response.data
  }
}

export class ClientsAPI {
  static async getAll(params?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/clients', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/clients/${id}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/clients', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/clients/${id}`, data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/clients/${id}`)
    return response.data
  }

  static async search(query: string, opts?: { limit?: number }): Promise<ApiResponse<any[]>> {
    const params: Record<string, string | number> = { q: query }
    if (opts?.limit) params.limit = opts.limit
    const response = await apiClient.get('/clients/search', { params })
    return response.data
  }

  static async getBulkStats(clientIds: string[]): Promise<ApiResponse<Record<string, { totalVisits: number; totalSpent: number; lastVisit: string }>>> {
    const CHUNK = 250
    const ids = [...new Set(clientIds.map((id) => String(id || '').trim()).filter(Boolean))]
    if (ids.length === 0) {
      return { success: true, data: {} } as ApiResponse<Record<string, { totalVisits: number; totalSpent: number; lastVisit: string }>>
    }
    const merged: Record<string, { totalVisits: number; totalSpent: number; lastVisit: string }> = {}
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      const response = await apiClient.post('/clients/bulk-stats', { clientIds: slice })
      const payload = response.data as ApiResponse<Record<string, { totalVisits: number; totalSpent: number; lastVisit: string }>>
      if (payload.success && payload.data) {
        Object.assign(merged, payload.data)
      }
    }
    return { success: true, data: merged }
  }

  static async getStats(): Promise<ApiResponse<{ totalCustomers: number; activeCustomers: number; inactiveCustomers: number }>> {
    const response = await apiClient.get('/clients/stats')
    return response.data
  }
}

export class ServicesAPI {
  static async getAll(params?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/services', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/services/${id}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/services', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/services/${id}`, data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/services/${id}`)
    return response.data
  }

  static async bulkUpdateTaxApplicable(taxApplicable: boolean): Promise<ApiResponse<{ modifiedCount: number }>> {
    const response = await apiClient.patch('/services/tax-applicable', { taxApplicable })
    return response.data
  }
}

export class ConsumptionRulesAPI {
  static async list(params?: { serviceId?: string }): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/consumption-rules', { params })
    return response.data
  }
  static async create(data: { serviceId: string; productId: string; quantityUsed: number; unit: string; isAdjustable?: boolean; maxAdjustmentPercent?: number; variantKey?: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/consumption-rules', data)
    return response.data
  }
  static async update(id: string, data: { quantityUsed?: number; unit?: string; isAdjustable?: boolean; maxAdjustmentPercent?: number; variantKey?: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/consumption-rules/${id}`, data)
    return response.data
  }
  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/consumption-rules/${id}`)
    return response.data
  }
  static async bulkCreate(serviceId: string, rules: { productId: string; quantityUsed: number; unit: string; isAdjustable?: boolean; maxAdjustmentPercent?: number; variantKey?: string }[]): Promise<ApiResponse<any[]>> {
    const response = await apiClient.post('/consumption-rules/bulk', { serviceId, rules })
    return response.data
  }
}

export class ConsumptionLogsAPI {
  static async list(params?: { productId?: string; serviceId?: string; billId?: string; fromDate?: string; toDate?: string; limit?: number }): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/consumption-logs', { params })
    return response.data
  }
}

export class ProductsAPI {
  static async getAll(params?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/products', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/products/${id}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/products', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    console.log('🔍 ProductsAPI.update - Making PUT request to:', `/products/${id}`)
    console.log('🔍 ProductsAPI.update - Full URL will be:', `${API_BASE_URL}/products/${id}`)
    console.log('🔍 ProductsAPI.update - Data being sent:', data)
    const response = await apiClient.put(`/products/${id}`, data)
    console.log('🔍 ProductsAPI.update - Response received:', response.status, response.data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/products/${id}`)
    return response.data
  }

  static async updateStock(id: string, quantity: number, operation: 'decrease' | 'increase' = 'decrease'): Promise<ApiResponse<any>> {
    const response = await apiClient.patch(`/products/${id}/stock`, { quantity, operation })
    return response.data
  }
}

export class SuppliersAPI {
  static async getSummary(): Promise<ApiResponse<{ totalSuppliers: number; totalOutstanding: number; purchasesThisMonth: number; overdueAmount: number }>> {
    const response = await apiClient.get('/suppliers/summary')
    return response.data
  }

  static async getAll(params?: { search?: string; activeOnly?: boolean; withSummary?: boolean | string }): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/suppliers', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/suppliers/${id}`)
    return response.data
  }

  static async getOrders(id: string): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get(`/suppliers/${id}/orders`)
    return response.data
  }

  static async getOutstanding(id: string): Promise<ApiResponse<{ outstanding: number; payables: any[] }>> {
    const response = await apiClient.get(`/suppliers/${id}/outstanding`)
    return response.data
  }

  static async create(data: {
    name: string
    contactPerson?: string
    phone?: string
    whatsapp?: string
    email?: string
    address?: string
    gstNumber?: string
    paymentTerms?: string
    bankDetails?: string
    categories?: string[]
    notes?: string
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/suppliers', data)
    return response.data
  }

  static async update(id: string, data: {
    name?: string
    contactPerson?: string
    phone?: string
    whatsapp?: string
    email?: string
    address?: string
    gstNumber?: string
    paymentTerms?: string
    bankDetails?: string
    categories?: string[]
    notes?: string
    isActive?: boolean
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/suppliers/${id}`, data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/suppliers/${id}`)
    return response.data
  }
}

export class PurchaseOrdersAPI {
  static async getAll(params?: { supplier?: string; status?: string; dateFrom?: string; dateTo?: string }): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/purchase-orders', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/purchase-orders/${id}`)
    return response.data
  }

  static async create(data: {
    supplierId: string
    orderDate?: string
    expectedDeliveryDate?: string
    items: { productId: string; productName: string; quantity: number; unitCost: number; gstPercent?: number }[]
    notes?: string
    status?: string
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/purchase-orders', data)
    return response.data
  }

  static async update(id: string, data: {
    supplierId?: string
    orderDate?: string
    expectedDeliveryDate?: string
    items?: { productId: string; productName: string; quantity: number; unitCost: number; gstPercent?: number }[]
    notes?: string
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/purchase-orders/${id}`, data)
    return response.data
  }

  static async receive(id: string, data: {
    receivedItems: { productId: string; receivedQty: number; unitCost?: number }[]
    invoiceUrl?: string
    grnNotes?: string
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/purchase-orders/${id}/receive`, data)
    return response.data
  }

  static async cancel(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/purchase-orders/${id}/cancel`)
    return response.data
  }
}

export class SupplierPayablesAPI {
  static async getAll(params?: { supplier?: string; status?: string }): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/supplier-payables', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/supplier-payables/${id}`)
    return response.data
  }

  static async recordPayment(id: string, data: {
    amount: number
    paymentMethod?: string
    paymentDate?: string
    reference?: string
    notes?: string
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/supplier-payables/${id}/payments`, data)
    return response.data
  }
}

export class CategoriesAPI {
  static async getAll(params?: { search?: string; activeOnly?: boolean; type?: 'product' | 'service' }): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/categories', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/categories/${id}`)
    return response.data
  }

  static async create(data: { name: string; description?: string; type?: 'product' | 'service' | 'both' }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/categories', data)
    return response.data
  }

  static async update(id: string, data: { name?: string; description?: string; isActive?: boolean }): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/categories/${id}`, data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/categories/${id}`)
    return response.data
  }
}

export class InventoryAPI {
  static async deductProduct(data: { productId: string; quantity: number; transactionType: string; reason?: string; notes?: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/inventory/out', data)
    return response.data
  }

  static async getTransactions(params?: { page?: number; limit?: number; productId?: string; transactionType?: string; dateFrom?: string; dateTo?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/inventory/transactions', { params })
    return response.data
  }

  static async deleteAllTransactions(): Promise<ApiResponse<any>> {
    const response = await apiClient.delete('/inventory/transactions')
    return response.data
  }
}

export class AppointmentsAPI {
  static async getAll(params?: { page?: number; limit?: number; date?: string; status?: string; clientId?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/appointments', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/appointments/${id}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/appointments', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/appointments/${id}`, data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/appointments/${id}`)
    return response.data
  }

  static async updateStatus(id: string, status: string): Promise<ApiResponse<any>> {
    const response = await apiClient.patch(`/appointments/${id}/status`, { status })
    return response.data
  }
}

export class BookingsAPI {
  static async create(data: {
    clientId: string
    type: 'single' | 'multi_day' | 'package'
    paymentMode?: string
    paymentState?: string
    /** When true (e.g. multi-day package + payment collected at booking), appointments get prepaidAtBooking */
    packagePaymentCollected?: boolean
    packagePurchaseId?: string
    units: Array<{
      serviceId: string
      staffId?: string
      staffAssignments?: Array<{ staffId: string; percentage: number; role?: string }>
      startAt: string
      endAt: string
      price?: number
      notes?: string
      additionalServiceIds?: string[]
    }>
  }): Promise<
    ApiResponse<{
      bookingId: string
      appointmentIds: string[]
      bookingGroupId: string
      timezone?: string
    }>
  > {
    const response = await apiClient.post('/bookings', data)
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/bookings/${id}`)
    return response.data
  }
}

export class LeadsAPI {
  static async getAll(params?: { 
    page?: number; 
    limit?: number; 
    search?: string; 
    status?: string; 
    assignedStaffId?: string; 
    source?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/leads', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/leads/${id}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/leads', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/leads/${id}`, data)
    return response.data
  }

  static async updateStatus(id: string, status: string): Promise<ApiResponse<any>> {
    const response = await apiClient.patch(`/leads/${id}/status`, { status })
    return response.data
  }

  static async convertToAppointment(id: string, appointmentData: {
    date: string;
    time: string;
    staffId?: string;
    staffAssignments?: Array<{ staffId: string; percentage: number; role?: string }>;
    notes?: string;
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/leads/${id}/convert-to-appointment`, appointmentData)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/leads/${id}`)
    return response.data
  }

  static async getActivities(id: string): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get(`/leads/${id}/activities`)
    return response.data
  }
}

export class StaffAPI {
  static async getAll(params?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/staff', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/staff/${id}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/staff', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/staff/${id}`, data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/staff/${id}`)
    return response.data
  }

  static async changePassword(id: string, newPassword: string): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/staff/${id}/change-password`, { newPassword })
    return response.data
  }
}

export class StaffDirectoryAPI {
  static async getAll(params?: { search?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/staff-directory', { params })
    return response.data
  }
}

export class BlockTimeAPI {
  static async getAll(params?: { staffId?: string; startDate?: string; endDate?: string }): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/block-time', { params })
    return response.data
  }

  static async create(data: {
    staffId: string
    title: string
    startDate: string
    startTime: string
    endTime: string
    recurringFrequency?: string
    endDate?: string | null
    description?: string
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/block-time', data)
    return response.data
  }

  static async update(
    id: string,
    data: {
      title?: string
      startDate?: string
      startTime?: string
      endTime?: string
      recurringFrequency?: string
      endDate?: string | null
      description?: string
    }
  ): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/block-time/${id}`, data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse<void>> {
    const response = await apiClient.delete(`/block-time/${id}`)
    return response.data
  }
}

export class ReceiptsAPI {
  static async getAll(params?: { page?: number; limit?: number; clientId?: string; date?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/receipts', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/receipts/${id}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/receipts', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/receipts/${id}`, data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/receipts/${id}`)
    return response.data
  }

  static async getByClient(clientId: string): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get(`/receipts/client/${clientId}`)
    return response.data
  }
}

export interface SalesListResponse extends ApiResponse<any[]> {
  total?: number
  page?: number
  limit?: number
  totalPages?: number
}

export interface SalesSummaryData {
  totalRevenue: number
  cashCollected: number
  onlineCash: number
  unpaidValue: number
  tips: number
  completedSales: number
  partialSales: number
  unpaidSales: number
}

export class SalesAPI {
  static async getAll(params?: {
    page?: number
    limit?: number
    search?: string
    dateFrom?: string
    dateTo?: string
    date?: string
    status?: string
    paymentMode?: string
    tipStaffId?: string
    /** When "1"/"true", API matches invoice date OR paymentHistory date (cash register / dues). */
    includeDuePaymentDates?: string | boolean
    forCashRegister?: string | boolean
  }): Promise<SalesListResponse> {
    const response = await apiClient.get('/sales', { params })
    return response.data
  }

  /**
   * Loads all rows matching the same filters as getAll by paging (default batch 500).
   * Prefer this over a single huge limit=10000 request to avoid slow DB/response times.
   *
   * Note: pages are fetched sequentially (N round-trips for large datasets). Screens that only
   * need aggregates (e.g. YTD revenue by month, staff performance totals) should eventually use
   * dedicated server-side aggregation endpoints instead of pulling every sale row.
   */
  static async getAllMergePages(params?: {
    batchSize?: number
    search?: string
    dateFrom?: string
    dateTo?: string
    date?: string
    status?: string
    paymentMode?: string
    tipStaffId?: string
    includeDuePaymentDates?: string | boolean
    forCashRegister?: string | boolean
  }): Promise<any[]> {
    const batchSize = Math.min(Math.max(params?.batchSize ?? 500, 1), 1000)
    const { batchSize: _omit, ...rest } = { ...(params || {}) }
    const first = await SalesAPI.getAll({
      ...rest,
      page: 1,
      limit: batchSize,
    })
    const rows: any[] = Array.isArray(first.data) ? [...first.data] : []
    const total = typeof first.total === 'number' ? first.total : rows.length
    if (total === 0) return rows
    const totalPages =
      typeof first.totalPages === 'number' && first.totalPages > 0
        ? first.totalPages
        : Math.ceil(total / batchSize)

    for (let page = 2; page <= totalPages; page++) {
      const res = await SalesAPI.getAll({
        ...rest,
        page,
        limit: batchSize,
      })
      if (Array.isArray(res.data) && res.data.length) rows.push(...res.data)
    }
    return rows
  }

  /** Aggregate totals for filters (no row payload). Same query params as getAll except page/limit are ignored. */
  static async getSummary(params?: {
    search?: string
    dateFrom?: string
    dateTo?: string
    date?: string
    status?: string
    paymentMode?: string
    tipStaffId?: string
    includeDuePaymentDates?: string | boolean
    forCashRegister?: string | boolean
  }): Promise<ApiResponse<SalesSummaryData>> {
    const response = await apiClient.get('/sales/summary', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/sales/${id}`)
    return response.data
  }

  static async getByClient(clientPhone: string): Promise<ApiResponse<any[]>> {
    const encoded = encodeURIComponent(clientPhone || '')
    const response = await apiClient.get(`/sales/by-phone/${encoded}`)
    return response.data
  }

  static async getByBillNo(billNo: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/sales/bill/${billNo}`)
    return response.data
  }

  static async getByAppointmentId(appointmentId: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/sales/by-appointment/${appointmentId}`)
    return response.data
  }

  // Public method to get sale by bill number and token (no authentication required)
  static async getByBillNoPublic(billNo: string, token: string): Promise<ApiResponse<any>> {
    // Create a new axios instance without auth interceptor for public access
    const publicClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
    const response = await publicClient.get(`/public/sales/bill/${billNo}/${token}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/sales', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/sales/${id}`, data)
    return response.data
  }

  static async delete(id: string, reason?: string): Promise<ApiResponse<any>> {
    const response = await apiClient.delete(`/sales/${id}`, reason ? { data: { reason } } : undefined)
    return response.data
  }

  // Exchange products within a sale (bill)
  static async exchangeProducts(
    saleId: string,
    data: any
  ): Promise<ApiResponse<any>> {
    if (!saleId || saleId.trim() === '') {
      return {
        success: false,
        error: 'Sale ID is required for product exchange',
        data: undefined as any
      }
    }
    console.log(`Calling POST /sales/${saleId}/exchange`)
    const response = await apiClient.post(`/sales/${saleId}/exchange`, data)
    return response.data
  }

  // Add payment to a sale
  static async addPayment(saleId: string, paymentData: {
    amount: number
    method: string
    notes?: string
    collectedBy?: string
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/sales/${saleId}/payment`, paymentData)
    return response.data
  }

  // Get payment summary for a sale
  static async getPaymentSummary(saleId: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/sales/${saleId}/payment-summary`)
    return response.data
  }

  // Get unpaid/overdue bills
  static async getUnpaidBills(params?: { page?: number; limit?: number }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/sales/unpaid/overdue', { params })
    return response.data
  }
}

export class MembershipAPI {
  static async getPlans(params?: { isActive?: boolean }): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/membership/plans', { params })
    return response.data
  }

  static async getSubscriptions(params?: {
    planId?: string
    search?: string
    /** ALL | ACTIVE (valid) | EXPIRED | CANCELLED */
    status?: string
    /** ISO range — filters by membership startDate */
    dateFrom?: string
    dateTo?: string
  }): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/membership/subscriptions', { params })
    return response.data
  }

  static async createPlan(data: {
    planName: string
    price: number
    durationInDays: number
    discountPercentage?: number
    includedServices?: Array<{ serviceId: string; usageLimit: number }>
    isActive?: boolean
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/membership/plans', data)
    return response.data
  }

  static async updatePlan(id: string, data: Partial<{
    planName: string
    price: number
    durationInDays: number
    discountPercentage: number
    includedServices: Array<{ serviceId: string; usageLimit: number }>
    isActive: boolean
  }>): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/membership/plans/${id}`, data)
    return response.data
  }

  static async togglePlan(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.patch(`/membership/plans/${id}/toggle`)
    return response.data
  }

  static async subscribe(data: { customerId: string; planId: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/membership/subscribe', data)
    return response.data
  }

  static async getByCustomer(
    customerId: string,
    params?: { asOfDate?: string }
  ): Promise<ApiResponse<{
    subscription: any
    plan: any
    usageSummary: Array<{ serviceId: string; serviceName: string; used: number; limit: number; remaining: number }>
    /** Sum of remaining free included-service uses across the plan */
    freeServicesRemaining?: number
    /** Estimated savings from membership-free service lines on bills (list price × qty) */
    totalSavedViaMembership?: number
  }>> {
    const response = await apiClient.get(`/membership/customer/${customerId}`, { params })
    return response.data
  }

  static async redeem(data: {
    customerId: string
    serviceId: string
    staffId: string
    billingId: string
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/membership/redeem', data)
    return response.data
  }
}

export class ExpensesAPI {
  static async getAll(params?: { page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string; category?: string; paymentMethod?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/expenses', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/expenses/${id}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/expenses', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/expenses/${id}`, data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/expenses/${id}`)
    return response.data
  }
}

export class UsersAPI {
  static async getAll(params?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/users', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/users/${id}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/users', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/users/${id}`, data)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse> {
    const response = await apiClient.delete(`/users/${id}`)
    return response.data
  }

  static async getPermissions(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/users/${id}/permissions`)
    return response.data
  }

  static async updatePermissions(id: string, permissions: any[]): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/users/${id}/permissions`, { permissions })
    return response.data
  }

  static async changePassword(id: string, newPassword: string): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/users/${id}/change-password`, { newPassword })
    return response.data
  }

  static async verifyAdminPassword(id: string, password: string): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/users/${id}/verify-admin-password`, { password })
    return response.data
  }
}

export class ReportsAPI {
  static async exportProducts(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/products', {
      format,
      filters
    });
    return response.data;
  }

  static async exportSales(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/sales', {
      format,
      filters
    });
    return response.data;
  }

  static async exportServiceList(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/service-list', {
      format,
      filters
    });
    return response.data;
  }

  static async exportProductList(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/product-list', {
      format,
      filters
    });
    return response.data;
  }

  static async exportStaffPerformance(format: 'pdf' | 'xlsx', filters?: any, data?: any[]): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/staff-performance', {
      format,
      filters,
      data: data || []
    });
    return response.data;
  }

  static async exportServices(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/services', {
      format,
      filters
    });
    return response.data;
  }

  static async exportClients(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/clients', {
      format,
      filters
    });
    return response.data;
  }

  static async exportExpenses(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/expenses', {
      format,
      filters
    });
    return response.data;
  }

  static async exportCashRegistry(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/cash-registry', {
      format,
      filters
    });
    return response.data;
  }

  static async getRevenueReport(params?: { startDate?: string; endDate?: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/reports/revenue', { params })
    return response.data
  }

  static async getSupplierReport(params?: { dateFrom?: string; dateTo?: string }): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/reports/supplier', { params })
    return response.data
  }

  static async getPurchaseReport(params?: { dateFrom?: string; dateTo?: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/reports/purchase', { params })
    return response.data
  }

  static async exportSummary(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/summary', {
      format,
      filters
    });
    return response.data;
  }

  static async getAppointmentList(params?: { dateFrom?: string; dateTo?: string; dateFilterType?: string; status?: string; showWalkIn?: boolean }): Promise<ApiResponse<any> & { data: any[]; summary: { count: number; totalValue: number } }> {
    const response = await apiClient.get('/reports/appointment-list', { params });
    return response.data;
  }

  static async exportAppointmentList(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/appointment-list', {
      format,
      filters
    });
    return response.data;
  }

  static async getUnpaidPartPaid(params?: { dateFrom?: string; dateTo?: string; status?: string }): Promise<ApiResponse<any> & { data: any[]; summary: { count: number; totalOutstanding: number; totalDuesSettled?: number } }> {
    const response = await apiClient.get('/reports/unpaid-part-paid', { params });
    return response.data;
  }

  static async exportUnpaidPartPaid(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/unpaid-part-paid', {
      format,
      filters
    });
    return response.data;
  }

  static async getDeletedInvoices(params?: { date?: string; dateFrom?: string; dateTo?: string }): Promise<ApiResponse<any> & { data: any[]; summary: { count: number; totalValue: number } }> {
    const response = await apiClient.get('/reports/deleted-invoices', { params });
    return response.data;
  }

  static async exportDeletedInvoices(format: 'pdf' | 'xlsx', filters?: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/export/deleted-invoices', {
      format,
      filters
    });
    return response.data;
  }

  static async getSummary(params?: { dateFrom?: string; dateTo?: string }): Promise<ApiResponse<{
    totalBillCount: number
    totalCustomerCount: number
    totalSales: number
    totalSalesCash: number
    totalSalesOnline: number
    totalSalesCard: number
    duesCollected: number
    cashExpense: number
    tipCollected: number
    cashBalance: number
    totalDue?: number
    customersWithDue?: number
  }>> {
    const response = await apiClient.get('/reports/summary', { params })
    return response.data
  }

  static async getServicePopularity(params?: { startDate?: string; endDate?: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/reports/services', { params })
    return response.data
  }

  static async getClientRetention(params?: { startDate?: string; endDate?: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/reports/clients', { params })
    return response.data
  }

  static async getDashboardStats(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/reports/dashboard')
    return response.data
  }

  static async getTipPayouts(params?: { dateFrom?: string; dateTo?: string }): Promise<ApiResponse<{ data: any[] }>> {
    const response = await apiClient.get('/reports/tip-payouts', { params })
    return response.data
  }

  static async createTipPayout(body: { staffId: string; staffName: string; amount: number; dateFrom?: string; dateTo?: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/reports/tip-payouts', body)
    return response.data
  }
}

export class DashboardAPI {
  static async getInit(): Promise<ApiResponse<any>> {
    const response = await apiClient.get("/dashboard/init")
    return response.data
  }
}

export class AnalyticsAPI {
  static async getRevenueTab(params?: {
    dateFrom?: string
    dateTo?: string
    bucket?: "day" | "week" | "month"
  }): Promise<ApiResponse<AnalyticsRevenueTabData>> {
    const response = await apiClient.get("/analytics/revenue", { params })
    return response.data
  }

  static async getServicesTab(params?: {
    dateFrom?: string
    dateTo?: string
    bucket?: "day" | "week" | "month"
  }): Promise<ApiResponse<AnalyticsServicesTabData>> {
    const response = await apiClient.get("/analytics/services", { params })
    return response.data
  }

  static async getClientsTab(params?: {
    dateFrom?: string
    dateTo?: string
    bucket?: "day" | "week" | "month"
  }): Promise<ApiResponse<AnalyticsClientsTabData>> {
    const response = await apiClient.get("/analytics/clients", { params })
    return response.data
  }

  static async getProductsTab(params?: {
    dateFrom?: string
    dateTo?: string
    bucket?: "day" | "week" | "month"
  }): Promise<ApiResponse<AnalyticsProductsTabData>> {
    const response = await apiClient.get("/analytics/products", { params })
    return response.data
  }

  static async getStaffTab(params?: {
    dateFrom?: string
    dateTo?: string
    bucket?: "day" | "week" | "month"
    lineType?: "all" | "service" | "product" | "membership" | "package"
  }): Promise<ApiResponse<AnalyticsStaffTabData>> {
    const response = await apiClient.get("/analytics/staff", { params })
    return response.data
  }

  static async getStaffTrends(
    staffId: string,
    params?: {
      dateFrom?: string
      dateTo?: string
      bucket?: "day" | "week" | "month"
      lineType?: "all" | "service" | "product" | "membership" | "package"
    }
  ): Promise<ApiResponse<AnalyticsStaffDrillDownData>> {
    const response = await apiClient.get(`/analytics/staff/${encodeURIComponent(staffId)}/trends`, { params })
    return response.data
  }
}

export class SettingsAPI {
  static async getBusinessSettings(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/settings/business')
    return response.data
  }

  static async updateBusinessSettings(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put('/settings/business', data)
    return response.data
  }

  static async incrementReceiptNumber(): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/settings/business/increment-receipt')
    return response.data
  }

  static async getPOSSettings(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/settings/pos')
    return response.data
  }

  static async updatePOSSettings(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put('/settings/pos', data)
    return response.data
  }

  static async resetReceiptSequence(): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/settings/pos/reset-sequence')
    return response.data
  }

  static async getAppointmentSettings(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/settings/appointments')
    return response.data
  }

  static async updateAppointmentSettings(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put('/settings/appointments', data)
    return response.data
  }

  static async getPaymentSettings(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/settings/payment')
    return response.data
  }

  static async updatePaymentSettings(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put('/settings/payment', data)
    return response.data
  }
}

export class CashRegistryAPI {
  static async getAll(params?: { 
    page?: number; 
    limit?: number; 
    dateFrom?: string; 
    dateTo?: string; 
    shiftType?: string; 
    search?: string 
  }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/cash-registry', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/cash-registry/${id}`)
    return response.data
  }

  static async create(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/cash-registry', data)
    return response.data
  }

  static async update(id: string, data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/cash-registry/${id}`, data)
    return response.data
  }

  static async delete(id: string, shiftType?: string): Promise<ApiResponse> {
    // For now, just delete by ID without shiftType parameter
    // TODO: Implement proper shiftType handling when backend supports it
    const response = await apiClient.delete(`/cash-registry/${id}`)
    return response.data
  }

  static async verify(id: string, data: { 
    verificationNotes?: string; 
    balanceDifferenceReason?: string; 
    balanceDifferenceNote?: string;
    onlineCashDifferenceReason?: string;
    onlineCashDifferenceNote?: string;
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/cash-registry/${id}/verify`, data)
    const raw = response.data as ApiResponse<any> & { isVerified?: boolean; _id?: string }
    if (raw && typeof raw === 'object' && 'success' in raw && raw.success !== undefined) {
      return raw
    }
    return { success: true, data: raw } as ApiResponse<any>
  }

  static async updateDifferenceReason(id: string, data: { 
    type: 'cash' | 'online'; 
    reason: string; 
    note?: string 
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.patch(`/cash-registry/${id}/difference-reason`, data)
    return response.data
  }

  static async getDashboardSummary(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/cash-registry/summary/dashboard')
    return response.data
  }

  static async getPettyCashSummary(date?: string): Promise<ApiResponse<{ totalAdditions: number; pettyCashExpenses: number; expectedBalance: number }>> {
    const params = date ? { date } : {}
    const response = await apiClient.get('/cash-registry/petty-cash-summary', { params })
    return response.data
  }
}

export class PettyCashAPI {
  static async addBalance(amount: number, date?: string): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/petty-cash', { amount, date })
    return response.data
  }

  static async getLogs(): Promise<ApiResponse<{ type: string; amount: number; date: string }[]>> {
    const response = await apiClient.get('/petty-cash/logs')
    return response.data
  }
}

export class StaffPerformanceAPI {
  // Get staff performance data with filtering options
  static async getPerformanceData(params?: {
    staffId?: string;
    startDate?: string;
    endDate?: string;
    period?: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'currentMonth' | 'all';
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/staff/performance', { params })
    return response.data
  }

  // Get detailed performance metrics for a specific staff member
  static async getStaffDetails(staffId: string, params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/staff/performance/${staffId}`, { params })
    return response.data
  }

  // Get commission data for staff members
  static async getCommissionData(params?: {
    staffId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/staff/commission', { params })
    return response.data
  }

  // Update commission rates for a staff member
  static async updateCommissionRates(staffId: string, data: {
    serviceCommissionRate?: number;
    productCommissionRate?: number;
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/staff/commission/${staffId}`, data)
    return response.data
  }

  // Get staff performance summary (dashboard cards data)
  static async getPerformanceSummary(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/staff/performance/summary', { params })
    return response.data
  }

  // Get staff sales analytics
  static async getSalesAnalytics(params?: {
    staffId?: string;
    startDate?: string;
    endDate?: string;
    groupBy?: 'day' | 'week' | 'month';
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/staff/sales-analytics', { params })
    return response.data
  }

  // Get customer retention data for staff
  static async getCustomerRetention(params?: {
    staffId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/staff/customer-retention', { params })
    return response.data
  }

  // Calculate commission for a specific sale
  static async calculateCommission(data: {
    staffId: string;
    saleId: string;
    serviceCommissionRate?: number;
    productCommissionRate?: number;
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/staff/commission/calculate', data)
    return response.data
  }

  // Get staff performance comparison
  static async getPerformanceComparison(params?: {
    staffIds?: string[];
    startDate?: string;
    endDate?: string;
    metrics?: string[];
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/staff/performance/comparison', { params })
    return response.data
  }

  // Export staff performance data
  static async exportPerformanceData(params?: {
    staffId?: string;
    startDate?: string;
    endDate?: string;
    format?: 'pdf' | 'excel';
  }): Promise<Blob> {
    const response = await apiClient.get('/staff/performance/export', { 
      params,
      responseType: 'blob'
    })
    return response.data
  }
}

export class CommissionProfileAPI {
  static async getProfiles() {
    try {
      const response = await apiClient.get('/commission-profiles')
      return response.data
    } catch (error) {
      console.error('Error fetching commission profiles:', error)
      throw error
    }
  }

  static async createProfile(data: any) {
    try {
      const response = await apiClient.post('/commission-profiles', data)
      return response.data
    } catch (error) {
      console.error('Error creating commission profile:', error)
      throw error
    }
  }

  static async updateProfile(id: string, data: any) {
    try {
      const response = await apiClient.put(`/commission-profiles/${id}`, data)
      return response.data
    } catch (error) {
      console.error('Error updating commission profile:', error)
      throw error
    }
  }

  static async deleteProfile(id: string) {
    try {
      const response = await apiClient.delete(`/commission-profiles/${id}`)
      return response.data
    } catch (error) {
      console.error('Error deleting commission profile:', error)
      throw error
    }
  }
}

export class GDPRAPI {
  static async exportUserData(userId: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/gdpr/export/${userId}`)
    return response.data
  }

  static async deleteUserData(userId: string): Promise<ApiResponse<any>> {
    const response = await apiClient.delete(`/gdpr/delete/${userId}`)
    return response.data
  }

  static async getConsentStatus(userId: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/gdpr/consent/${userId}`)
    return response.data
  }

  static async updateConsent(userId: string, consent: any): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/gdpr/consent/${userId}`, consent)
    return response.data
  }
}

export class EmailNotificationsAPI {
  // Get email notification settings
  static async getSettings(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/email-notifications/settings')
    return response.data
  }

  // Check email service status
  static async getEmailServiceStatus(): Promise<ApiResponse<{
    initialized: boolean;
    enabled: boolean;
    provider: string | null;
    hasConfig: boolean;
  }>> {
    const response = await apiClient.get('/email-service/status')
    return response.data
  }

  // Update email notification settings
  static async updateSettings(data: any): Promise<ApiResponse<any>> {
    const response = await apiClient.put('/email-notifications/settings', data)
    return response.data
  }

  // Get all staff with email notification preferences
  static async getStaff(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/email-notifications/staff')
    return response.data
  }

  // Update staff email notification preferences
  static async updateStaffPreferences(staffId: string, data: {
    enabled?: boolean;
    preferences?: {
      dailySummary?: boolean;
      weeklySummary?: boolean;
      appointmentAlerts?: boolean;
      receiptAlerts?: boolean;
      exportAlerts?: boolean;
      systemAlerts?: boolean;
      lowInventory?: boolean;
    };
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/email-notifications/staff/${staffId}`, data)
    return response.data
  }

  // Send test email
  static async sendTestEmail(email: string): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/email-notifications/test', { email })
    return response.data
  }

  // Manually trigger daily summary
  static async sendDailySummary(): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/email-notifications/send-daily-summary')
    return response.data
  }
}

// Marketing Templates API
export class MarketingTemplatesAPI {
  static async getAll(params?: { status?: string; page?: number; limit?: number }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/whatsapp/marketing-templates', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/whatsapp/marketing-templates/${id}`)
    return response.data
  }

  static async create(data: {
    templateName: string;
    language?: string;
    components: any[];
    description?: string;
    tags?: string[];
  }): Promise<ApiResponse<any>> {
    try {
      const response = await apiClient.post('/whatsapp/marketing-templates/create', data)
      return response.data
    } catch (error: any) {
      // Return error response in the same format as success
      if (error.response?.data) {
        // The backend returns { success: false, error: "...", details: {...} }
        return error.response.data
      }
      // If no response data, create a proper error response
      return {
        success: false,
        error: error.message || 'Failed to create template',
        data: undefined as any
      }
    }
  }

  static async checkStatus(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/whatsapp/marketing-templates/${id}/check-status`)
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.delete(`/whatsapp/marketing-templates/${id}`)
    return response.data
  }
}

// Campaigns API
export class CampaignsAPI {
  static async getAll(params?: { status?: string; page?: number; limit?: number }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/campaigns', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/campaigns/${id}`)
    return response.data
  }

  static async create(data: {
    name: string;
    description?: string;
    templateId: string;
    recipientType: 'all_clients' | 'segment' | 'custom';
    recipientFilters?: any;
    templateVariables?: any;
    scheduledAt?: string;
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/campaigns', data)
    return response.data
  }

  static async send(campaignId: string): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/campaigns/${campaignId}/send`)
    return response.data
  }

  static async getRecipients(campaignId: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/campaigns/${campaignId}/recipients`)
    return response.data
  }

  static async getStats(campaignId: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/campaigns/${campaignId}/stats`)
    return response.data
  }

  static async cancel(campaignId: string): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/campaigns/${campaignId}/cancel`)
    return response.data
  }
}

export class WhatsAppAPI {
  // Test WhatsApp connection
  static async testConnection(phone: string): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/whatsapp/test', { phone })
    return response.data
  }

  // Get admin-level tracking (all businesses)
  static async getAdminTracking(filters?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    
    const response = await apiClient.get(`/whatsapp/tracking/admin?${params.toString()}`)
    return response.data
  }

  // Get business-level tracking
  static async getBusinessTracking(filters?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    
    const queryString = params.toString();
    const url = queryString ? `/whatsapp/tracking/business?${queryString}` : '/whatsapp/tracking/business';
    const response = await apiClient.get(url)
    return response.data
  }

  // Get message logs
  static async getLogs(filters?: {
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    messageType?: string;
    businessId?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.messageType) params.append('messageType', filters.messageType);
    if (filters?.businessId) params.append('businessId', filters.businessId);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    
    const response = await apiClient.get(`/whatsapp/logs?${params.toString()}`)
    return response.data
  }
}

// ── Packages API ─────────────────────────────────────────────────────────────

export class PackagesAPI {
  // Package CRUD
  static async getAll(params?: { type?: string; status?: string; search?: string; page?: number; limit?: number }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/packages', { params })
    return response.data
  }

  static async getById(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/packages/${id}`)
    return response.data
  }

  static async create(data: {
    name: string
    type: 'FIXED' | 'CUSTOMIZED'
    total_price: number
    total_sittings: number
    services: Array<{ service_id: string; is_optional?: boolean; tag?: string }>
    description?: string
    image_url?: string
    discount_amount?: number
    discount_type?: 'FLAT' | 'PERCENT'
    min_service_count?: number
    max_service_count?: number
    validity_days?: number | null
    branch_ids?: string[]
    cross_branch_redemption?: boolean
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post('/packages', data)
    return response.data
  }

  static async update(id: string, data: Partial<Parameters<typeof PackagesAPI.create>[0]>): Promise<ApiResponse<any>> {
    const response = await apiClient.put(`/packages/${id}`, data)
    return response.data
  }

  static async updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'): Promise<ApiResponse<any>> {
    const response = await apiClient.patch(`/packages/${id}/status`, { status })
    return response.data
  }

  static async delete(id: string): Promise<ApiResponse<any>> {
    const response = await apiClient.delete(`/packages/${id}`)
    return response.data
  }

  // Sales
  static async sell(packageId: string, data: {
    client_id: string
    amount_paid?: number
    purchased_at_branch_id?: string
    /** Staff who sold the package (defaults server-side from session if omitted). */
    sold_by_staff_id?: string
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/packages/${packageId}/sell`, data)
    return response.data
  }

  static async getClientPackages(clientId: string): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get(`/packages/client/${clientId}`)
    return response.data
  }

  static async extendExpiry(clientPackageId: string, data: { new_expiry_date: string; reason: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.patch(`/packages/client-packages/${clientPackageId}/extend`, data)
    return response.data
  }

  // Redemption
  static async redeem(clientPackageId: string, data: {
    services: Array<{ service_id: string }>
    redeemed_at_branch_id?: string
  }): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/packages/client-packages/${clientPackageId}/redeem`, data)
    return response.data
  }

  static async reverseRedemption(redemptionId: string, reason: string): Promise<ApiResponse<any>> {
    const response = await apiClient.post(`/packages/redemptions/${redemptionId}/reverse`, { reason })
    return response.data
  }

  static async getRedemptionHistory(clientPackageId: string): Promise<ApiResponse<any>> {
    const response = await apiClient.get(`/packages/client-packages/${clientPackageId}/history`)
    return response.data
  }

  // Reports
  static async getSalesReport(params?: { from?: string; to?: string; package_id?: string }): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/packages/reports/sales', { params })
    return response.data
  }

  static async getUtilizationReport(): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/packages/reports/utilization')
    return response.data
  }

  static async getExpiringReport(days?: number): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/packages/reports/expiring', { params: { days } })
    return response.data
  }

  static async exportReport(data: { format: 'excel' | 'pdf'; reportType?: string; from?: string; to?: string }): Promise<Blob> {
    const response = await apiClient.post('/packages/reports/export', data, { responseType: 'blob' })
    return response.data
  }
}

// Export the main API client for direct use if needed
export { apiClient }
export default apiClient 