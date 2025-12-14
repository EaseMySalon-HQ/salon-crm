"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { AuthAPI } from "@/lib/api"
import { SessionTimeoutManager } from "@/components/auth/session-timeout-manager"

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
          console.log('🔓 Public route detected, skipping auth check')
          setIsLoading(false)
          return
        }
        
        // Check if we have a stored token
        const storedToken = localStorage.getItem("salon-auth-token")
        const storedUser = localStorage.getItem("salon-auth-user")
        
        if (!storedToken || !storedUser) {
          console.log('🔐 No stored authentication data found')
          setIsLoading(false)
          return
        }
        
        // Clear mock tokens - only use real authentication
        if (storedToken.startsWith('mock-token-')) {
          console.log('🔐 Clearing mock token, requiring real authentication')
          localStorage.removeItem("salon-auth-token")
          localStorage.removeItem("salon-auth-user")
          setIsLoading(false)
          return
        }
        
        // Try to validate with API
        try {
          const response = await AuthAPI.getProfile()
          if (response.success && response.data) {
            console.log('✅ API authentication successful')
            setUser(response.data)
          } else {
            console.log('❌ API authentication failed, clearing stored data')
            localStorage.removeItem("salon-auth-token")
            localStorage.removeItem("salon-auth-user")
          }
        } catch (apiError: any) {
          // Only clear tokens if it's a 401 (unauthorized) error
          // Don't clear on network errors or other API issues
          if (apiError?.response?.status === 401) {
            console.log('❌ Token is invalid (401), clearing stored data')
            localStorage.removeItem("salon-auth-token")
            localStorage.removeItem("salon-auth-user")
          } else {
            // For other errors (network, timeout, 404, etc.), try to use stored user data
            console.warn('⚠️ API validation error (non-401), attempting to use stored user data:', apiError?.message)
            try {
              const parsedUser = JSON.parse(storedUser || '{}')
              if (parsedUser && (parsedUser.email || parsedUser._id || parsedUser.id)) {
                console.log('✅ Using stored user data as fallback')
                // Ensure user object has required fields
                const fallbackUser: User = {
                  _id: parsedUser._id || parsedUser.id || '',
                  name: parsedUser.name || `${parsedUser.firstName || ''} ${parsedUser.lastName || ''}`.trim() || parsedUser.email || 'User',
                  email: parsedUser.email || '',
                  role: parsedUser.role || 'staff',
                  avatar: parsedUser.avatar,
                  createdAt: parsedUser.createdAt,
                  updatedAt: parsedUser.updatedAt
                }
                setUser(fallbackUser)
              } else {
                console.log('❌ Stored user data is invalid - missing email/id')
                // Don't clear tokens on 404 - might be temporary API issue
                // Only clear if it's a critical error
              }
            } catch (parseError) {
              console.error('❌ Failed to parse stored user data:', parseError)
              // Don't clear tokens on parse error - might be corrupted but user might still be valid
            }
          }
        }
      } catch (error) {
        console.error('Authentication check error:', error)
        // Clear any corrupted data
        localStorage.removeItem("salon-auth-token")
        localStorage.removeItem("salon-auth-user")
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

  const logout = async () => {
    try {
      // Clear user state first to prevent race conditions
      setUser(null)
      setIsLoading(true)
      
      // Clear local storage (only in browser environment)
      if (typeof window !== 'undefined') {
        localStorage.removeItem("salon-auth-token")
        localStorage.removeItem("salon-auth-user")
      }
      
      // Clear any other stored data that might cause issues
      sessionStorage.clear()
      
      // Try real API logout (but don't wait for it)
      AuthAPI.logout().catch(error => {
        console.warn("API logout failed, but continuing with local logout:", error)
      })
      
      // Small delay to ensure state is cleared and components unmount
      await new Promise(resolve => setTimeout(resolve, 150))
      
      // Force a page refresh to ensure clean state
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      } else {
        router.push("/login")
      }
    } catch (error) {
      console.error("Logout error:", error)
      // Even if there's an error, ensure we're logged out
      setUser(null)
      localStorage.removeItem("salon-auth-token")
      localStorage.removeItem("salon-auth-user")
      sessionStorage.clear()
      
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      } else {
        router.push("/login")
      }
    } finally {
      setIsLoading(false)
    }
  }

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
