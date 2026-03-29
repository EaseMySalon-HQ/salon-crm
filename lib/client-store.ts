// Updated client store with API integration and fallback
import { clients as initialClients } from "@/lib/data"
import { ClientsAPI } from "@/lib/api"

export interface Client {
  id: string
  _id?: string
  name: string
  email?: string
  phone: string
  lastVisit?: string
  status?: "active" | "inactive"
  totalVisits?: number
  totalSpent?: number
  totalDues?: number
  createdAt?: string
  address?: string
  notes?: string
  gender?: "male" | "female" | "other"
  birthdate?: string
}

// Create a simple store with event listeners
class ClientStore {
  private clients: Client[] = [...initialClients]
  private listeners: (() => void)[] = []
  private isLoading = false

  async loadClients() {
    // localStorage + API auth only exist in the browser; skip SSR to avoid 401s
    if (typeof window === "undefined") return
    if (this.isLoading) return

    this.isLoading = true
    try {
      // Fetch ALL clients from paginated API
      const pageSize = 1000
      let page = 1
      let all: any[] = []
      let total = Infinity

      while (all.length < total) {
        const resp = await ClientsAPI.getAll({ page, limit: pageSize })
        if (!resp.success) {
          console.error('❌ ClientStore: API page fetch failed:', resp.error)
          break
        }
        const batch = resp.data || []
        const normalized = batch.map((c: any) => {
          // Normalize ID: ensure both id and _id are set to the same value
          const clientId = c._id || c.id
          return {
            ...c,
            id: clientId,
            _id: clientId,
            birthdate: c.birthdate || c.dob || undefined
          }
        })
        all = all.concat(normalized)
        
        // Get total from API response - don't update if we already have a valid total
        const apiTotal = resp.pagination?.total
        if (apiTotal !== undefined && apiTotal !== null) {
          total = apiTotal
        } else if (total === Infinity) {
          // If API doesn't provide total and we haven't set it yet, use current length as fallback
          total = all.length
        }
        
        
        // Stop if no more data or if we've fetched all available
        if (!batch.length || (apiTotal !== undefined && all.length >= apiTotal)) {
          break
        }
        page += 1
      }

      this.clients = all
      this.notifyListeners()
    } catch (error) {
      console.error('❌ ClientStore: Error loading clients:', error)
      console.warn("API not available, no fallback in production")
      // In production, don't use localStorage fallback
      this.clients = []
    } finally {
      this.isLoading = false
    }
  }

  getClients(): Client[] {
    return [...this.clients]
  }

  async addClient(client: Client): Promise<boolean> {
    try {
      // Try API first
      const apiPayload = { ...client, dob: (client as any).birthdate || (client as any).dob }
      const response = await ClientsAPI.create(apiPayload)
      if (response.success) {
        // Normalize the response data to ensure both id and _id are set
        const clientId = response.data._id || response.data.id
        const normalizedClient = {
          ...response.data,
          id: clientId,
          _id: clientId
        }
        this.clients.push(normalizedClient)
        this.notifyListeners()
        return true
      }
      return false
    } catch {
      console.warn("API not available, using local storage fallback")
      
      // Fallback to local storage
      // Check if client with this ID already exists
      const existingIndex = this.clients.findIndex((c) => c.id === client.id)

      if (existingIndex >= 0) {
        // Update existing client
        this.clients[existingIndex] = client
      } else {
        // Add new client
        this.clients.push(client)
      }

      // In production, data is persisted via API only

      // Notify listeners
      this.notifyListeners()
      return true
    }
  }

  async updateClient(id: string, client: Client): Promise<boolean> {
    try {
      // Try API first
      const apiPayload = { ...client, dob: (client as any).birthdate || (client as any).dob }
      const response = await ClientsAPI.update(id, apiPayload)
      if (response.success) {
        const index = this.clients.findIndex(c => c.id === id || c._id === id)
        if (index >= 0) {
          // Normalize the response data to ensure both id and _id are set
          const clientId = response.data._id || response.data.id || id
          const normalizedClient = {
            ...response.data,
            id: clientId,
            _id: clientId
          }
          this.clients[index] = normalizedClient
          this.notifyListeners()
        }
        return true
      }
      return false
    } catch {
      console.warn("API not available, using local storage fallback")
      
      // Fallback to local storage
      const index = this.clients.findIndex(c => c.id === id)
      if (index >= 0) {
        this.clients[index] = client
        // Save to localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("salon-clients", JSON.stringify(this.clients))
        }
        this.notifyListeners()
        return true
      }
      return false
    }
  }

  async deleteClient(id: string): Promise<boolean> {
    
    try {
      // Try API first
      const response = await ClientsAPI.delete(id)
      if (response.success) {
        // Remove client by matching either id or _id
        const beforeCount = this.clients.length
        this.clients = this.clients.filter(c => c.id !== id && c._id !== id)
        const afterCount = this.clients.length
        this.notifyListeners()
        return true
      }

      throw new Error(response.error || 'Failed to delete client.')
    } catch (error: any) {
      const status = error?.response?.status
      const apiMessage = error?.response?.data?.error || 
                        error?.response?.data?.message || 
                        error?.message ||
                        'Failed to delete client'

      if (status) {
        console.error('ClientStore: API error deleting client:', {
          status,
          message: apiMessage,
          url: error?.config?.url,
          fullError: error,
        })
        
        // Provide user-friendly error messages based on status code
        let userMessage = apiMessage
        if (status === 403) {
          userMessage = apiMessage || 'You do not have permission to delete clients. Only administrators can delete clients.'
        } else if (status === 401) {
          userMessage = apiMessage || 'Authentication required. Please log in again.'
        } else if (status === 404) {
          userMessage = apiMessage || 'Client not found.'
        } else {
          userMessage = apiMessage || `Request failed with status ${status}`
        }
        
        throw new Error(userMessage)
      }

      console.warn("API not available, using local storage fallback")
      
      // Fallback to local storage (network/server unavailable only)
      const beforeCount = this.clients.length
      this.clients = this.clients.filter(c => c.id !== id && c._id !== id)
      const afterCount = this.clients.length
      
      this.notifyListeners()
      return true
    }
  }

  getClientById(id: string): Client | undefined {
    return this.clients.find((client) => client.id === id || client._id === id)
  }

  async searchClients(query: string): Promise<Client[]> {
    if (!query.trim()) return this.clients

    try {
      // Try API search first
      const response = await ClientsAPI.search(query)
      if (response.success) {
        // Normalize search results to ensure both id and _id are set
        return response.data.map((c: any) => {
          const clientId = c._id || c.id
          return {
            ...c,
            id: clientId,
            _id: clientId
          }
        })
      }
      return []
    } catch {
      console.warn("API not available, using local search fallback")
      
      // Fallback to local search
      // Clean the query for phone number matching
      const cleanQuery = query.replace(/\D/g, "") // Remove non-digits

      return this.clients.filter((client) => {
        // Search by name
        const nameMatch = client.name.toLowerCase().includes(query.toLowerCase())

        // Search by email
        const emailMatch = client.email && client.email.toLowerCase().includes(query.toLowerCase())

        // Search by phone - try both original and cleaned versions
        const phoneMatch =
          client.phone.includes(query) ||
          client.phone.replace(/\D/g, "").includes(cleanQuery) ||
          client.phone.includes(cleanQuery)

        return nameMatch || emailMatch || phoneMatch
      })
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener())
  }
}

// Create a singleton instance
export const clientStore = new ClientStore()
