"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { AuthAPI } from "@/lib/api"
import { SETTINGS_MODULES } from "@/lib/permission-mappings"
import { SessionTimeoutManager } from "@/components/auth/session-timeout-manager"
import { AUTH_LOGOUT_EVENT, clearAuthStorage } from "@/lib/auth-utils"

export interface User {
  _id: string
  name?: string
  firstName?: string
  lastName?: string
  email: string
  role: "admin" | "manager" | "staff"
  isOwner?: boolean
  avatar?: string
  permissions?: Array<{ module: string; feature: string; enabled: boolean }>
  createdAt?: string
  updatedAt?: string
  isImpersonation?: boolean
  impersonatedBy?: string
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; message?: string }>
  staffLogin: (email: string, password: string, businessCode: string) => Promise<boolean>
  logout: () => void
  exitImpersonation: () => void
  updateUser: (userData: Partial<User>) => void
  isLoading: boolean
  hasRole: (roles: string[]) => boolean
  hasPermission: (module: string, feature: string) => boolean
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
        
        // Validate token with API — retry transient failures (wake-from-sleep / flaky network)
        const maxAttempts = 4
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const response = await AuthAPI.getProfile()
            if (response.success && response.data) {
              setUser(response.data)
            } else {
              clearAuthStorage()
            }
            break
          } catch (apiError: any) {
            const status = apiError?.response?.status
            if (status === 401 || status === 403) {
              clearAuthStorage()
              setUser(null)
              break
            }
            if (attempt < maxAttempts - 1 && !apiError?.response) {
              await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
              continue
            }
            if (!apiError?.response) {
              try {
                setUser(JSON.parse(storedUser) as User)
              } catch {
                clearAuthStorage()
                setUser(null)
              }
            } else {
              clearAuthStorage()
              setUser(null)
            }
            break
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

    try {
      const response = await AuthAPI.login(email, password)
      
      if (response.success) {
        const { user: userData, token } = response.data
        setUser(userData)
        
        // Only use localStorage in browser environment
        if (typeof window !== 'undefined') {
          localStorage.setItem("salon-auth-token", token)
          localStorage.setItem("salon-auth-user", JSON.stringify(userData))
        }
        
        setIsLoading(false)
        return { success: true }
      } else {
        setIsLoading(false)
        return { 
          success: false, 
          error: response.error,
          message: response.message 
        }
      }
    } catch (error: any) {
      console.error("API login error:", error)
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

    try {
      const response = await AuthAPI.staffLogin(email, password, businessCode)
      
      if (response.success) {
        const { user: userData, token } = response.data
        setUser(userData)
        
        // Only use localStorage in browser environment
        if (typeof window !== 'undefined') {
          localStorage.setItem("salon-auth-token", token)
          localStorage.setItem("salon-auth-user", JSON.stringify(userData))
        }
        
        setIsLoading(false)
        return true
      } else {
        setIsLoading(false)
        return false
      }
    } catch (error) {
      console.error("Staff API login error:", error)
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

  const exitImpersonation = useCallback(() => {
    let returnUrl = '/admin/businesses'
    if (typeof window !== 'undefined') {
      const savedOrigin = sessionStorage.getItem('admin-impersonation-origin')
      if (savedOrigin) {
        returnUrl = savedOrigin
        sessionStorage.removeItem('admin-impersonation-origin')
      }
    }
    setUser(null)
    clearAuthStorage()
    // Don't call AuthAPI.logout() - it would trigger an auth-less request, get 401,
    // and the API interceptor would redirect to /login, overriding our admin redirect.
    // Admin token is in sessionStorage and remains intact.
    if (typeof window !== 'undefined') {
      window.location.href = returnUrl
    } else {
      router.push(returnUrl)
    }
  }, [router])

  // Role-based helper functions
  const hasRole = (roles: string[]): boolean => {
    return user ? roles.includes(user.role) : false
  }

  // Permission-based check: does user have this module+feature enabled?
  const hasPermission = (module: string, feature: string): boolean => {
    // Admin role gets full access (matches backend checkPermission behavior)
    if (user?.role === "admin") return true
    // Manager role gets Reports access by default (matches backend roleDefinitions)
    if (
      user?.role === "manager" &&
      module === "reports" &&
      (feature === "view" || feature === "view_financial_reports" || feature === "view_staff_commission")
    )
      return true
    if (!user?.permissions?.length) return false
    const match = (p: { module: string; feature: string; enabled: boolean }) =>
      p.module === module && p.feature === feature && p.enabled
    if (user.permissions.some(match)) return true
    // Reports "view": grant when any granular report view is enabled
    if (module === "reports" && feature === "view") {
      return user.permissions.some(
        (p) =>
          p.module === module &&
          p.enabled &&
          (p.feature === "view_financial_reports" || p.feature === "view_staff_commission")
      )
    }
    // Settings "view": grant when any settings subcategory has view
    if (module === "settings" && feature === "view") {
      return SETTINGS_MODULES.some((m) =>
        user.permissions!.some((p) => p.module === m && p.feature === "view" && p.enabled)
      )
    }
    return false
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
      exitImpersonation, 
      updateUser,
      isLoading, 
      hasRole, 
      hasPermission,
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
