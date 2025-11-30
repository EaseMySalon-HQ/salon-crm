"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  getAdminAuthToken,
  getAdminAuthUser,
  setAdminAuthSession,
  clearAdminAuthSession
} from "@/lib/admin-auth-storage"

export interface Admin {
  id: string
  name: string
  email: string
  role: string
  permissions: any[]
}

interface AdminAuthContextType {
  admin: Admin | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsLoading(true)
        
        if (typeof window === 'undefined') {
          setIsLoading(false)
          return
        }
        
        const storedToken = getAdminAuthToken()
        const storedAdmin = getAdminAuthUser()
        
        if (!storedToken || !storedAdmin) {
          setIsLoading(false)
          return
        }
        
        // Validate token with API
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
          const response = await fetch(`${API_URL}/admin/profile`, {
            headers: {
              'Authorization': `Bearer ${storedToken}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (response.ok) {
            const data = await response.json()
            if (data.success && data.data) {
              setAdmin(data.data)
            } else {
              // Clear invalid session
              console.warn('Admin profile response invalid:', data)
              clearAdminAuthSession()
            }
          } else {
            // Only clear on 401 (unauthorized), not on other errors
            if (response.status === 401) {
              console.warn('Admin token invalid (401), clearing session')
              clearAdminAuthSession()
            } else {
              console.error('Admin profile fetch failed:', response.status, response.statusText)
              // Don't clear session on server errors, just log
            }
          }
        } catch (error) {
          console.error('Token validation error:', error)
          // Only clear on network errors if it's a clear auth failure
          // Don't clear on temporary network issues
          if (error instanceof TypeError && error.message.includes('fetch')) {
            console.warn('Network error during admin auth check, keeping session')
          } else {
            clearAdminAuthSession()
          }
        }
      } catch (error) {
        console.error('Auth check error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true)
    
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const response = await fetch(`${API_URL}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      })
      
      const data = await response.json()
      
      if (data.success) {
        const { admin: adminData, token } = data.data
        setAdmin(adminData)
        
        if (typeof window !== 'undefined') {
          setAdminAuthSession(token, adminData)
        }
        
        setIsLoading(false)
        return true
      } else {
        setIsLoading(false)
        return false
      }
    } catch (error) {
      console.error("Admin login error:", error)
      setIsLoading(false)
      return false
    }
  }

  const logout = () => {
    setAdmin(null)
    
    if (typeof window !== 'undefined') {
      clearAdminAuthSession()
    }
    
    router.push('/admin/login')
  }

  return (
    <AdminAuthContext.Provider value={{ admin, isLoading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider')
  }
  return context
}
