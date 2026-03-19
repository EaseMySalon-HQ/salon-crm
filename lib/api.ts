// API Configuration and HTTP Client
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios'
import { handleSessionExpired } from './auth-utils'

// API Base Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('salon-auth-token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => {
    console.error('❌ API Request Interceptor Error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  (error: AxiosError | any) => {
    // Check if error exists
    if (!error) {
      console.error('❌ API Response Interceptor: Error is null or undefined')
      return Promise.reject(error)
    }
    
    try {
      // Safely extract error information with fallbacks
      const errorInfo: any = {
        message: 'Unknown error', // Always start with a default
        errorType: typeof error,
      }
      
      // Always include a message
      if (error?.message) {
        errorInfo.message = String(error.message)
      } else if (typeof error === 'string') {
        errorInfo.message = error
      } else if (error?.toString && typeof error.toString === 'function') {
        try {
          errorInfo.message = String(error.toString())
        } catch (e) {
          errorInfo.message = 'Error converting to string'
        }
      }
      
      // Extract request config if available
      if (error?.config) {
        errorInfo.url = String(error.config.url || 'Unknown URL')
        errorInfo.method = String(error.config.method?.toUpperCase() || 'Unknown method')
      }
      
      // Extract response data if available (HTTP error)
      if (error?.response) {
        errorInfo.status = Number(error.response.status)
        errorInfo.statusText = String(error.response.statusText || '')
        errorInfo.data = error.response.data
        errorInfo.type = 'HTTP Error'
        
        // Extract error message from response data if available
        if (error.response.data) {
          if (typeof error.response.data === 'string') {
            errorInfo.error = error.response.data
            errorInfo.message = error.response.data
          } else if (typeof error.response.data === 'object') {
            // Try multiple possible error message fields
            errorInfo.error = error.response.data.error || 
                             error.response.data.message || 
                             error.response.data.details ||
                             JSON.stringify(error.response.data)
            errorInfo.message = errorInfo.error
          }
        }
        
        // If still no error message, use status text
        if (!errorInfo.error && errorInfo.statusText) {
          errorInfo.error = errorInfo.statusText
          errorInfo.message = errorInfo.statusText
        }
      } else if (error?.request) {
        // Request was made but no response received (network error)
        errorInfo.type = 'Network Error'
        errorInfo.code = String(error?.code || 'NETWORK_ERROR')
      } else {
        // Error setting up the request
        errorInfo.type = 'Request Setup Error'
        errorInfo.code = String(error?.code || 'SETUP_ERROR')
      }
      
      // Log error info (skip empty objects for 404s to reduce noise)
      if (errorInfo.status === 404) {
        // For 404s, only log if there's meaningful info beyond status
        if (errorInfo.url && errorInfo.url !== 'Unknown URL') {
          console.warn(`⚠️ API 404: ${errorInfo.method} ${errorInfo.url} - ${errorInfo.message || 'Not Found'}`)
        }
      } else if (errorInfo.status === 0 || errorInfo.type === 'Network Error') {
        // Status 0 = network error (backend unreachable, CORS, connection refused)
        const url = error?.config?.url || errorInfo.url
        const baseUrl = error?.config?.baseURL || ''
        console.warn(`⚠️ API Network Error: Cannot reach backend. Ensure the server is running on ${baseUrl || 'port 3001'}.`, url ? `Request: ${url}` : '')
      } else {
        // For 4xx, extract error message from response - ensure we never log empty {}
        const status = errorInfo.status ?? error?.response?.status
        const data = errorInfo.data ?? error?.response?.data
        const errMsg = (typeof data === 'object' && data !== null)
          ? (data.error || data.errorDetail || data.message || data.details)
          : (typeof data === 'string' ? data : null)
        const message = (typeof errMsg === 'string' && errMsg.trim())
          ? errMsg
          : (errorInfo.error || errorInfo.message || errorInfo.statusText || `Request failed with status ${status}`)

        const url = error?.config?.url
        const method = error?.config?.method?.toUpperCase()
        // Use warn for 4xx (validation/business logic) - expected user feedback, not a bug
        const logFn = status >= 400 && status < 500 ? console.warn : console.error
        logFn(`API ${status || ''} ${method || ''} ${url || ''}:`, message)
      }
    } catch (logError) {
      // If error logging itself fails, log the raw error
      console.error('❌ API Response Interceptor: Failed to process error:', logError)
      console.error('❌ API Response Interceptor: Original error object:', error)
      console.error('❌ API Response Interceptor: Error keys:', error ? Object.keys(error) : 'null')
    }
    
    // Ensure error response data is accessible
    if (error?.response?.data) {
      // Attach response data to error for easier access in catch blocks
      error.responseData = error.response.data;
    }
    
    // Handle 401 (Unauthorized) and 403 (Forbidden)
    const status = error?.response?.status
    const errorMsg = (error?.response?.data?.error || '').toLowerCase()
    if (status === 401 || status === 403) {
      const isPublicRoute = typeof window !== 'undefined' &&
        (window.location.pathname.includes('/receipt/public/') ||
         window.location.pathname.includes('/public/'))
      const isLoginPage = typeof window !== 'undefined' && window.location.pathname.includes('/login')

      if (typeof window !== 'undefined' && !isPublicRoute && !isLoginPage) {
        // 403 "Insufficient permissions" = permission denied, NOT session invalid - don't logout
        const isPermissionDenied = status === 403 && (
          errorMsg.includes('insufficient permissions') ||
          errorMsg.includes('insufficient admin permissions') ||
          errorMsg.includes('feature') && errorMsg.includes('not available')
        )
        if (isPermissionDenied) {
          if (process.env.NODE_ENV === 'development') {
            console.log('🔐 API 403: Permission denied, redirecting to unauthorized')
          }
          window.location.href = '/unauthorized'
        } else {
          // 401 or 403 auth-related (invalid/expired token) - session expired, logout
          if (process.env.NODE_ENV === 'development') {
            console.log('🔐 API Response Interceptor: Session invalid (', status, '), redirecting to login')
          }
          handleSessionExpired('/login')
        }
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
  static async login(email: string, password: string): Promise<ApiResponse<{ user: any; token: string }>> {
    const response = await apiClient.post('/auth/login', { email, password })
    return response.data
  }

  static async logout(): Promise<ApiResponse> {
    const response = await apiClient.post('/auth/logout')
    return response.data
  }

  static async getProfile(): Promise<ApiResponse<any>> {
    const response = await apiClient.get('/auth/profile')
    return response.data
  }

  static async refreshToken(): Promise<ApiResponse<{ token: string }>> {
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

  static async staffLogin(email: string, password: string, businessCode: string): Promise<ApiResponse<{ user: any; token: string }>> {
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

  static async search(query: string): Promise<ApiResponse<any[]>> {
    const response = await apiClient.get('/clients/search', { params: { q: query } })
    return response.data
  }

  static async getBulkStats(clientIds: string[]): Promise<ApiResponse<Record<string, { totalVisits: number; totalSpent: number; lastVisit: string }>>> {
    const response = await apiClient.post('/clients/bulk-stats', { clientIds })
    return response.data
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

export class SalesAPI {
  static async getAll(params?: { page?: number; limit?: number; search?: string; dateFrom?: string; dateTo?: string }): Promise<PaginatedResponse<any>> {
    const response = await apiClient.get('/sales', { params })
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

  static async getSubscriptions(params?: { planId?: string; search?: string; status?: string }): Promise<ApiResponse<any[]>> {
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

  static async getByCustomer(customerId: string): Promise<ApiResponse<{
    subscription: any
    plan: any
    usageSummary: Array<{ serviceId: string; serviceName: string; used: number; limit: number; remaining: number }>
  }>> {
    const response = await apiClient.get(`/membership/customer/${customerId}`)
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

  static async getUnpaidPartPaid(params?: { dateFrom?: string; dateTo?: string; status?: string }): Promise<ApiResponse<any> & { data: any[]; summary: { count: number; totalOutstanding: number } }> {
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
    return response.data
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

// Export the main API client for direct use if needed
export { apiClient }
export default apiClient 