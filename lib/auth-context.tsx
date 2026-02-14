"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { AuthAPI } from "@/lib/api"
import { SessionTimeoutManager } from "@/components/auth/session-timeout-manager"
import { AUTH_LOGOUT_EVENT, clearAuthStorage } from "@/lib/auth-utils"

export interface User {
  _id: string
  name: string
  email: string
  role: "admin" | "manager" | "staff"
  avatar?: string
  createdAt?: string
  updatedAt?: string
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; message?: string }>
  staffLogin: (email: string, password: string, businessCode: string) => Promise<boolean>
  logout: () => void
  updateUser: (userData: Partial<User>) => void
  isLoading: boolean
  hasRole: (roles: string[]) => boolean
  isAdmin: () => boolean
  isManager: () => boolean
  isStaff: () => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Listen for auth logout event (from API interceptor on 401/403)
  useEffect(() => {
    const handleAuthLogout = () => {
      setUser(null)
    }
    window.addEventListener(AUTH_LOGOUT_EVENT, handleAuthLogout)
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handleAuthLogout)
  }, [])

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsLoading(true)
        
        // Check if we're in browser environment
        if (typeof window === 'undefined') {
          setIsLoading(false)
          return
        }
        
        // Skip auth check on public routes (like public receipt page)
        const isPublicRoute = window.location.pathname.includes('/receipt/public/') ||
                             window.location.pathname.includes('/public/')
        if (isPublicRoute) {
          setIsLoading(false)
          return
        }
        
        // Check if we have a stored token
        const storedToken = localStorage.getItem("salon-auth-token")
        const storedUser = localStorage.getItem("salon-auth-user")
        
        if (!storedToken || !storedUser) {
          setIsLoading(false)
          return
        }
        
        // Clear mock tokens - only use real authentication
        if (storedToken.startsWith('mock-token-')) {
          clearAuthStorage()
          setIsLoading(false)
          return
        }
        
        // Validate token with API - only set user on successful validation
        try {
          const response = await AuthAPI.getProfile()
          if (response.success && response.data) {
            setUser(response.data)
          } else {
            clearAuthStorage()
          }
        } catch (apiError: any) {
          // 401/403: clear storage (interceptor may have already done this)
          if (apiError?.response?.status === 401 || apiError?.response?.status === 403) {
            clearAuthStorage()
            setUser(null)
          } else {
            // Network/timeout or other errors: do NOT use stored user - require re-validation
            // Prevents showing dashboard with stale data when token may be expired
            clearAuthStorage()
            setUser(null)
          }
        }
      } catch (error) {
        console.error('Authentication check error:', error)
        clearAuthStorage()
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    setIsLoading(true)
    console.log('🔍 DEBUG: Starting login process...')
    console.log('📧 Email:', email)

    try {
      // Use real API authentication only
      console.log('🌐 Attempting real API login...')
      const response = await AuthAPI.login(email, password)
      
      if (response.success) {
        const { user: userData, token } = response.data
        console.log('✅ Real API login successful')
        console.log('👤 User data:', userData)
        console.log('🔑 Token received:', token ? 'Yes' : 'No')
        setUser(userData)
        
        // Only use localStorage in browser environment
        if (typeof window !== 'undefined') {
          localStorage.setItem("salon-auth-token", token)
          localStorage.setItem("salon-auth-user", JSON.stringify(userData))
        }
        
        setIsLoading(false)
        return { success: true }
      } else {
        console.log('❌ Real API login failed:', response.error)
        setIsLoading(false)
        return { 
          success: false, 
          error: response.error,
          message: response.message 
        }
      }
    } catch (error: any) {
      console.error("API login error:", error)
      console.log('❌ Login failed - API error or invalid credentials')
      setIsLoading(false)
      
      // Check if it's a suspension error
      if (error.response?.data?.error === 'ACCOUNT_SUSPENDED') {
        return { 
          success: false, 
          error: 'ACCOUNT_SUSPENDED',
          message: error.response.data.message 
        }
      }
      
      return { 
        success: false, 
        error: 'LOGIN_FAILED',
        message: 'Login failed. Please check your credentials and try again.' 
      }
    }
  }

  const staffLogin = async (email: string, password: string, businessCode: string): Promise<boolean> => {
    setIsLoading(true)
    console.log('🔍 DEBUG: Starting staff login process...')
    console.log('📧 Email:', email)
    console.log('🏢 Business Code:', businessCode)

    try {
      console.log('🌐 Attempting staff API login...')
      const response = await AuthAPI.staffLogin(email, password, businessCode)
      
      if (response.success) {
        const { user: userData, token } = response.data
        console.log('✅ Staff API login successful')
        console.log('👤 Staff data:', userData)
        console.log('🔑 Token received:', token ? 'Yes' : 'No')
        setUser(userData)
        
        // Only use localStorage in browser environment
        if (typeof window !== 'undefined') {
          localStorage.setItem("salon-auth-token", token)
          localStorage.setItem("salon-auth-user", JSON.stringify(userData))
        }
        
        setIsLoading(false)
        return true
      } else {
        console.log('❌ Staff API login failed:', response.error)
        setIsLoading(false)
        return false
      }
    } catch (error) {
      console.error("Staff API login error:", error)
      console.log('❌ Staff login failed - API error or invalid credentials')
      setIsLoading(false)
      return false
    }
  }

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData }
      setUser(updatedUser)
      
      // Update localStorage to keep it in sync
      if (typeof window !== 'undefined') {
        localStorage.setItem("salon-auth-user", JSON.stringify(updatedUser))
      }
    }
  }

  const logout = useCallback(async () => {
    try {
      setUser(null)
      setIsLoading(true)
      
      clearAuthStorage()
      // Clear other session data (sidebar state etc.) - preserves admin auth keys
      if (typeof window !== 'undefined') {
        const keysToRemove: string[] = []
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key && !key.startsWith('admin-')) keysToRemove.push(key)
        }
        keysToRemove.forEach(k => sessionStorage.removeItem(k))
      }
      
      AuthAPI.logout().catch(() => {})
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      } else {
        router.push("/login")
      }
    } catch (error) {
      console.error("Logout error:", error)
      setUser(null)
      clearAuthStorage()
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      } else {
        router.push("/login")
      }
    } finally {
      setIsLoading(false)
    }
  }, [router])

  // Role-based helper functions
  const hasRole = (roles: string[]): boolean => {
    return user ? roles.includes(user.role) : false
  }

  const isAdmin = (): boolean => {
    return hasRole(['admin'])
  }

  const isManager = (): boolean => {
    return hasRole(['admin', 'manager'])
  }

  const isStaff = (): boolean => {
    return hasRole(['admin', 'manager', 'staff'])
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      staffLogin,
      logout, 
      updateUser,
      isLoading, 
      hasRole, 
      isAdmin, 
      isManager, 
      isStaff 
    }}>
      <SessionTimeoutManager />
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
