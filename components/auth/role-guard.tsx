"use client"

import { ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"
import { buildLoginRedirectHref } from "@/lib/auth-utils"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

interface RoleGuardProps {
  children: ReactNode
  allowedRoles: string[]
  fallback?: ReactNode
  redirectTo?: string
}

export function RoleGuard({ 
  children, 
  allowedRoles, 
  fallback = <div>Access Denied</div>,
  redirectTo = "/login"
}: RoleGuardProps) {
  const { user, isLoading, hasRole } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(redirectTo === "/login" ? buildLoginRedirectHref() : redirectTo)
    }
  }, [user, isLoading, router, redirectTo])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (!hasRole(allowedRoles)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

// Specific role guards
export function AdminGuard({ children, fallback, redirectTo }: Omit<RoleGuardProps, 'allowedRoles'>) {
  return (
    <RoleGuard allowedRoles={['admin']} fallback={fallback} redirectTo={redirectTo}>
      {children}
    </RoleGuard>
  )
}

export function ManagerGuard({ children, fallback, redirectTo }: Omit<RoleGuardProps, 'allowedRoles'>) {
  return (
    <RoleGuard allowedRoles={['admin', 'manager']} fallback={fallback} redirectTo={redirectTo}>
      {children}
    </RoleGuard>
  )
}

export function StaffGuard({ children, fallback, redirectTo }: Omit<RoleGuardProps, 'allowedRoles'>) {
  return (
    <RoleGuard allowedRoles={['admin', 'manager', 'staff']} fallback={fallback} redirectTo={redirectTo}>
      {children}
    </RoleGuard>
  )
} 